/**
 * Pure library rules: validation, normalisation, CSV and import planning.
 * No I/O here, so every backend and the tests share exactly the same logic.
 */
import { BOOK_STATUS, LOAN_STATUS } from './types';
import type { Book, BookInput, BookStatus, Loan } from './types';

export class ValidationError extends Error {}

const ARABIC_INDIC = 0x0660;
const EXT_ARABIC_INDIC = 0x06f0;
const BENGALI = 0x09e6;

/** ٠١٢ / ۰۱۲ / ০১২ → 012 */
export function toWesternDigits(value: unknown): string {
    return String(value ?? '').replace(/[٠-٩۰-۹০-৯]/g, (ch) => {
        const code = ch.charCodeAt(0);
        if (code >= ARABIC_INDIC && code <= ARABIC_INDIC + 9) return String(code - ARABIC_INDIC);
        if (code >= EXT_ARABIC_INDIC && code <= EXT_ARABIC_INDIC + 9) return String(code - EXT_ARABIC_INDIC);
        return String(code - BENGALI);
    });
}

/** Positive integer, defaulting to 1 (parts, copies). */
export function parseCount(value: unknown): number {
    const n = parseInt(toWesternDigits(value), 10);
    return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** Year as digits only (Hijri or Gregorian), otherwise ''. */
export function parseYear(value: unknown): string {
    const s = toWesternDigits(value).replace(/\s/g, '');
    return /^\d{1,8}$/.test(s) ? s : '';
}

const clean = (v: unknown) => String(v ?? '').trim();

export function normalizeBookInput(raw: Partial<Record<keyof BookInput, unknown>>): BookInput {
    return {
        name: clean(raw.name),
        author: clean(raw.author),
        category: clean(raw.category),
        editor: clean(raw.editor),
        parts: parseCount(raw.parts),
        publisher: clean(raw.publisher),
        year: parseYear(raw.year) || clean(raw.year),
        copies: parseCount(raw.copies),
        cabinet: clean(raw.cabinet),
        shelf: clean(raw.shelf),
        notes: clean(raw.notes),
    };
}

export function validateBook(book: BookInput): void {
    if (!book.name) throw new ValidationError('اسم الكتاب مطلوب');
    if (!book.author) throw new ValidationError('المؤلف مطلوب');
    if (!book.category) throw new ValidationError('القسم مطلوب');
    if (!book.cabinet) throw new ValidationError('الصندوق مطلوب');
    if (!Number.isInteger(book.parts) || book.parts < 1) throw new ValidationError('عدد الأجزاء يجب أن يكون 1 أو أكثر');
    if (!Number.isInteger(book.copies) || book.copies < 1) throw new ValidationError('عدد النسخ يجب أن يكون 1 أو أكثر');
}

export function activeLoanCount(loans: Loan[], bookId: string): number {
    let n = 0;
    for (const l of loans) if (l.bookId === bookId && l.status === LOAN_STATUS.active) n++;
    return n;
}

export function statusFor(activeLoans: number, copies: number): BookStatus {
    return activeLoans >= Math.max(1, copies) ? BOOK_STATUS.loaned : BOOK_STATUS.available;
}

/** Key used to detect "the same book" (name + author [+ publisher]). */
export function bookKey(b: Pick<BookInput, 'name' | 'author'> & { publisher?: string }, withPublisher = false): string {
    const parts = [b.name, b.author, withPublisher ? b.publisher ?? '' : ''];
    return parts.map((p) => clean(p).toLowerCase()).join('\u0001');
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Normalise text for matching: lower-case, Western digits (so ৫০ = ٥٠ = 50),
 * no Arabic diacritics/tatweel, unified alef/ya/ta-marbuta, single spaces.
 */
export function foldText(value: unknown): string {
    return toWesternDigits(value)
        .toLowerCase()
        .replace(/[ً-ٰٟـ]/g, '')
        .replace(/[أإآ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/\s+/g, ' ')
        .trim();
}

export interface BookFilters {
    q?: string;
    status?: string;
    category?: string;
    author?: string;
    publisher?: string;
    cabinet?: string;
}

export function filterBooks(books: Book[], f: BookFilters): Book[] {
    const q = foldText(f.q);
    // Picked values (chips, lists, links) match exactly: "سيرة" must not pull in "سيرة/تراجم".
    const exact = (field: keyof Book, value?: string) => {
        if (!value) return null;
        const v = foldText(value);
        return (b: Book) => foldText(b[field]) === v;
    };
    const tests = [
        f.status ? (b: Book) => b.status === f.status : null,
        exact('category', f.category),
        exact('author', f.author),
        exact('publisher', f.publisher),
        exact('cabinet', f.cabinet),
        q
            ? (b: Book) =>
                  foldText(`${b.name} ${b.author} ${b.category} ${b.publisher} ${b.editor} ${b.cabinet} ${b.shelf}`).includes(q)
            : null,
    ].filter(Boolean) as ((b: Book) => boolean)[];
    if (!tests.length) return books;
    return books.filter((b) => tests.every((t) => t(b)));
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export type BookSort = 'location' | 'name' | 'new';

const collator = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });

/** Natural compare after digit normalisation ("৯" < "10", "A2" < "A10"); blanks last. */
export function compareText(a: unknown, b: unknown): number {
    const x = foldText(a);
    const y = foldText(b);
    if (!x || !y) return x ? -1 : y ? 1 : 0;
    return collator.compare(x, y);
}

/** Cabinet, then shelf, then title: the order the books stand on the shelves. */
export function compareLocation(a: Book, b: Book): number {
    return compareText(a.cabinet, b.cabinet) || compareText(a.shelf, b.shelf) || compareText(a.name, b.name);
}

export function sortBooks(books: readonly Book[], sort: BookSort): Book[] {
    const list = [...books];
    if (sort === 'location') return list.sort(compareLocation);
    if (sort === 'name') return list.sort((a, b) => compareText(a.name, b.name) || compareText(a.author, b.author));
    return list.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
}

/** Distinct cabinets, merging ones that differ only in digit script (৫০ / 50). */
export function distinctCabinets(books: readonly Book[]): string[] {
    const seen = new Map<string, string>();
    for (const b of books) {
        const c = b.cabinet.trim();
        const k = foldText(c);
        if (c && !seen.has(k)) seen.set(k, c);
    }
    return [...seen.values()].sort(compareText);
}

// ---------------------------------------------------------------------------
// Missing-data report
// ---------------------------------------------------------------------------

export const REPORT_FIELDS = {
    name: 'اسم الكتاب',
    author: 'المؤلف',
    category: 'القسم',
    cabinet: 'الصندوق',
    editor: 'المحقق',
    publisher: 'دار النشر',
    year: 'السنة',
    shelf: 'الطاق',
} as const; // notes are optional, so an empty note is not "missing"
export type ReportField = keyof typeof REPORT_FIELDS;

export function missingFields(book: Book): ReportField[] {
    return (Object.keys(REPORT_FIELDS) as ReportField[]).filter((k) => clean(book[k]) === '');
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export const CSV_HEADERS = ['اسم الكتاب', 'المؤلف', 'القسم', 'المحقق', 'الأجزاء', 'دار النشر', 'السنة', 'النسخ', 'الحالة', 'الصندوق', 'الطاق', 'ملاحظات'];

const HEADER_TO_FIELD: Record<string, keyof BookInput> = {
    'اسم الكتاب': 'name',
    'المؤلف': 'author',
    'القسم': 'category',
    'المحقق': 'editor',
    'الأجزاء': 'parts',
    'دار النشر': 'publisher',
    'السنة': 'year',
    'النسخ': 'copies',
    'الصندوق': 'cabinet',
    'الطاق': 'shelf',
    'ملاحظات': 'notes',
};

export function parseCSV(text: string): string[][] {
    let t = (text || '').replace(/\r\n?/g, '\n');
    if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let inQuotes = false;
    for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (inQuotes) {
            if (c === '"') {
                if (t[i + 1] === '"') { cell += '"'; i++; }
                else inQuotes = false;
            } else cell += c;
        } else if (c === '"') inQuotes = true;
        else if (c === ',') { row.push(cell.trim()); cell = ''; }
        else if (c === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
        else cell += c;
    }
    if (cell !== '' || row.length > 0) { row.push(cell.trim()); rows.push(row); }
    return rows.filter((r) => r.some((c) => c !== ''));
}

const quote = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export function toCSV(rows: unknown[][]): string {
    return rows.map((r) => r.map(quote).join(',')).join('\n');
}


/** Exported files carry each book's id so a re-import updates exactly that book. */
export const ID_HEADER = 'المعرف (لا تعدّله)';

/**
 * Full book rows for export, ready to edit and re-import.
 * `extra` appends an info column (e.g. missing fields) that import ignores.
 */
export function booksToRows(books: readonly Book[], extra?: { header: string; value: (b: Book) => unknown }): unknown[][] {
    return [
        [...CSV_HEADERS, ID_HEADER, ...(extra ? [extra.header] : [])],
        ...books.map((b) => [
            b.name, b.author, b.category, b.editor, b.parts, b.publisher, b.year, b.copies, b.status, b.cabinet, b.shelf, b.notes,
            b.id, ...(extra ? [extra.value(b)] : []),
        ]),
    ];
}

export const CSV_TEMPLATE = toCSV([
    CSV_HEADERS,
    ['صحيح البخاري', 'الإمام البخاري', 'حديث', 'ابن حجر العسقلاني', '9', 'دار السلام', '1422', '1', 'متاح', 'A1', '1', 'نسخة محققة'],
]);

export interface FieldChange { field: string; old: unknown; new: unknown }

export interface ImportPlan {
    add: BookInput[];
    update: { id: string; book: BookInput; name: string; author: string; changes: FieldChange[] }[];
    unchanged: number;
    skipped: number;
    categories: string[];
    publishers: string[];
}

const COMPARED: [keyof BookInput, string][] = [
    ['editor', 'المحقق'], ['category', 'القسم'], ['parts', 'الأجزاء'], ['year', 'السنة'],
    ['copies', 'النسخ'], ['cabinet', 'الصندوق'], ['shelf', 'الطاق'], ['notes', 'ملاحظات'],
];
/** A row matched by id may also correct the title, author or publisher. */
const COMPARED_BY_ID: [keyof BookInput, string][] = [
    ['name', 'اسم الكتاب'], ['author', 'المؤلف'], ['publisher', 'دار النشر'], ...COMPARED,
];
const REQUIRED: (keyof BookInput)[] = ['name', 'author', 'category', 'cabinet'];

function changesBetween(current: Book, next: BookInput, fields: [keyof BookInput, string][]): FieldChange[] {
    return fields
        .filter(([f]) => String(current[f] ?? '').trim() !== String(next[f] ?? '').trim())
        .map(([f, label]) => ({ field: label, old: current[f], new: next[f] }));
}

/**
 * Turn CSV rows into add/update operations.
 * - Rows carrying an id (files exported from the app) update exactly that book.
 *   Any column may change; a missing column or a blank required cell keeps the
 *   current value, a blank optional cell clears it.
 * - Other rows match an existing book by title + author + publisher.
 * - Rows without an id that miss a required field are skipped.
 */
export function planImport(rows: string[][], existing: Book[]): ImportPlan {
    const plan: ImportPlan = { add: [], update: [], unchanged: 0, skipped: 0, categories: [], publishers: [] };
    if (rows.length < 2) return plan;
    const header = rows[0].map((h) => clean(h));
    const index = new Map<keyof BookInput, number>();
    header.forEach((h, i) => { const f = HEADER_TO_FIELD[h]; if (f) index.set(f, i); });
    const idCol = header.findIndex((h) => h === ID_HEADER || h === 'المعرف' || h.toLowerCase() === 'id');

    const byId = new Map(existing.map((b) => [b.id, b]));
    const byKey = new Map<string, Book>();
    for (const b of existing) byKey.set(bookKey(b, true), b);
    const seenNew = new Set<string>();
    const seenIds = new Set<string>();
    const cats = new Set<string>();
    const pubs = new Set<string>();

    for (const raw of rows.slice(1)) {
        const get = (f: keyof BookInput) => { const i = index.get(f); return i == null ? '' : raw[i] ?? ''; };
        const id = idCol >= 0 ? clean(raw[idCol]) : '';
        const target = id ? byId.get(id) : undefined;

        if (target) {
            if (seenIds.has(id)) { plan.unchanged++; continue; }
            seenIds.add(id);
            const pick = (f: keyof BookInput) => {
                if (!index.has(f)) return target[f];
                const v = clean(get(f));
                return v === '' && REQUIRED.includes(f) ? target[f] : v;
            };
            const book = normalizeBookInput({
                name: pick('name'), author: pick('author'), category: pick('category'), editor: pick('editor'),
                parts: pick('parts'), publisher: pick('publisher'), year: pick('year'), copies: pick('copies'),
                cabinet: pick('cabinet'), shelf: pick('shelf'), notes: pick('notes'),
            });
            cats.add(book.category);
            if (book.publisher) pubs.add(book.publisher);
            const changes = changesBetween(target, book, COMPARED_BY_ID);
            if (changes.length) plan.update.push({ id: target.id, book, name: target.name, author: target.author, changes });
            else plan.unchanged++;
            continue;
        }

        const book = normalizeBookInput({
            name: get('name'), author: get('author'), category: get('category'), editor: get('editor'),
            parts: get('parts'), publisher: get('publisher'), year: get('year'), copies: get('copies'),
            cabinet: get('cabinet'), shelf: get('shelf'), notes: get('notes'),
        });
        book.year = parseYear(get('year'));
        if (REQUIRED.some((f) => !book[f])) { plan.skipped++; continue; }
        cats.add(book.category);
        if (book.publisher) pubs.add(book.publisher);

        const key = bookKey(book, true);
        const match = byKey.get(key);
        if (match) {
            const changes = changesBetween(match, book, COMPARED);
            if (changes.length) plan.update.push({ id: match.id, book, name: match.name, author: match.author, changes });
            else plan.unchanged++;
        } else if (!seenNew.has(key)) {
            seenNew.add(key);
            plan.add.push(book);
        } else {
            plan.unchanged++;
        }
    }
    plan.categories = [...cats];
    plan.publishers = [...pubs];
    return plan;
}

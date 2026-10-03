/**
 * The single data API used by the UI.
 *
 * Holds an in-memory copy of the library (fast search on phones), applies the
 * library rules from rules.ts, and delegates every write to a LibraryBackend.
 * The backend (and the database behind it) remains the source of truth: rules
 * checked here are re-checked on the server.
 */
import {
    ValidationError, activeLoanCount, bookKey, normalizeBookInput, parseCSV, planImport, validateBook,
} from './rules';
import type { ImportPlan } from './rules';
import { LOAN_STATUS } from './types';
import type {
    ArchiveDocument, AuthUser, Book, BookInput, DiaryInput, DocumentInput, LibraryBackend, LibrarySnapshot,
    Loan, Member, MemberInput, Profile, Role, ScannedBook,
} from './types';

export type ChangeTopic = 'auth' | 'books' | 'members' | 'loans' | 'diary' | 'documents' | 'taxonomy' | 'all';
type Listener = (topic: ChangeTopic) => void;

export interface ImportResult {
    added: number;
    updated: number;
    unchanged: number;
    skipped: number;
    failed: number;
    updateDetails: ImportPlan['update'];
}

const emptySnapshot = (): LibrarySnapshot => ({
    books: [], members: [], loans: [], diary: [], documents: [], categories: [], publishers: [],
});

const today = () => new Date().toISOString().slice(0, 10);

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

export class LibraryRepository {
    private data: LibrarySnapshot = emptySnapshot();
    private listeners = new Set<Listener>();
    private bookIndex = new Map<string, Book>();
    private memberIndex = new Map<string, Member>();
    user: AuthUser | null = null;
    profile: Profile | null = null;
    loaded = false;

    constructor(readonly backend: LibraryBackend) {}

    // ------------------------------------------------------------------ events
    subscribe(fn: Listener): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    private emit(topic: ChangeTopic) {
        if (topic === 'books' || topic === 'all') this.bookIndex = new Map(this.data.books.map((b) => [b.id, b]));
        if (topic === 'members' || topic === 'all') this.memberIndex = new Map(this.data.members.map((m) => [m.id, m]));
        this.listeners.forEach((fn) => fn(topic));
    }

    // -------------------------------------------------------------------- auth
    get role(): Role {
        return this.profile?.role ?? 'pending';
    }
    get canEdit() { return this.role === 'admin' || this.role === 'librarian'; }
    get isAdmin() { return this.role === 'admin'; }
    get hasAccess() { return this.role !== 'pending'; }

    /** Resolve the current session and load data. Call once at startup. */
    async start(): Promise<void> {
        this.backend.auth.onChange((user) => {
            if ((user?.id ?? null) === (this.user?.id ?? null)) return;
            void this.setUser(user);
        });
        await this.setUser(await this.backend.auth.currentUser());
    }

    private async setUser(user: AuthUser | null) {
        this.user = user;
        this.profile = null;
        this.data = emptySnapshot();
        this.loaded = false;
        if (user) {
            this.profile = (await this.backend.profiles.mine(user.id)) ?? (await this.backend.profiles.createMine(user));
            if (this.hasAccess) await this.reload();
        }
        this.emit('auth');
    }

    async reload(): Promise<void> {
        this.data = await this.backend.loadAll();
        this.loaded = true;
        this.emit('all');
    }

    async signIn(email: string, password: string) {
        const user = await this.backend.auth.signIn(email.trim(), password);
        if (user.id !== this.user?.id) await this.setUser(user);
    }

    async signOut() {
        await this.backend.auth.signOut();
        await this.setUser(null);
    }

    updatePassword(newPassword: string) {
        if (newPassword.length < 8) throw new ValidationError('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
        return this.backend.auth.updatePassword(newPassword);
    }

    sendPasswordReset(email: string, redirectTo: string) {
        return this.backend.auth.sendPasswordReset(email.trim(), redirectTo);
    }

    listProfiles() { return this.backend.profiles.list(); }

    async setRole(userId: string, role: Role) {
        const p = await this.backend.profiles.setRole(userId, role);
        if (userId === this.user?.id) { this.profile = p; this.emit('auth'); }
        return p;
    }

    // ------------------------------------------------------------------- reads
    get books(): readonly Book[] { return this.data.books; }
    get members(): readonly Member[] { return this.data.members; }
    get loans(): readonly Loan[] { return this.data.loans; }
    get diary(): readonly { id: string; date: string; category: string; content: string }[] { return this.data.diary; }
    get documents(): readonly ArchiveDocument[] { return this.data.documents; }
    get categories(): readonly string[] { return this.data.categories; }
    get publishers(): readonly string[] { return this.data.publishers; }

    book(id: string | null | undefined) { return id ? this.bookIndex.get(id) ?? null : null; }
    member(id: string | null | undefined) { return id ? this.memberIndex.get(id) ?? null : null; }
    document(id: string) { return this.data.documents.find((d) => d.id === id) ?? null; }

    activeLoans(): Loan[] { return this.data.loans.filter((l) => l.status === LOAN_STATUS.active); }
    activeLoanCount(bookId: string) { return activeLoanCount(this.data.loans as Loan[], bookId); }

    availability(book: Book) {
        const copies = Math.max(1, book.copies || 1);
        const left = Math.max(0, copies - this.activeLoanCount(book.id));
        return { copies, left };
    }

    authors(): { name: string; count: number }[] {
        const counts = new Map<string, number>();
        for (const b of this.data.books) {
            const a = b.author.trim();
            if (a) counts.set(a, (counts.get(a) ?? 0) + 1);
        }
        return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    }

    countBy(field: 'category' | 'publisher'): Map<string, number> {
        const counts = new Map<string, number>();
        for (const b of this.data.books) {
            const v = b[field].trim();
            if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
        }
        return counts;
    }

    findDuplicate(input: Pick<BookInput, 'name' | 'author'>): Book | null {
        const key = bookKey(input);
        return this.data.books.find((b) => bookKey(b) === key) ?? null;
    }

    stats() {
        const books = this.data.books;
        const active = this.activeLoans();
        const onLoan = books.filter((b) => b.status === 'معار').length;
        return {
            books: books.length,
            copies: books.reduce((s, b) => s + Math.max(1, b.copies || 1), 0),
            authors: new Set(books.map((b) => b.author.trim()).filter(Boolean)).size,
            categories: this.data.categories.length,
            publishers: this.data.publishers.length,
            available: books.length - onLoan,
            onLoan,
            members: this.data.members.length,
            activeLoans: active.length,
        };
    }

    // ------------------------------------------------------------------- books
    async addBook(raw: Partial<Record<keyof BookInput, unknown>>): Promise<Book> {
        const input = normalizeBookInput(raw);
        validateBook(input);
        await this.ensureTaxonomy([input.category], input.publisher ? [input.publisher] : []);
        const book = await this.backend.books.insert(input);
        this.data.books = [book, ...this.data.books];
        this.emit('books');
        return book;
    }

    async updateBook(id: string, raw: Partial<Record<keyof BookInput, unknown>>): Promise<Book> {
        const current = this.book(id);
        if (!current) throw new ValidationError('الكتاب غير موجود');
        const input = normalizeBookInput({ ...current, ...raw });
        validateBook(input);
        if (this.activeLoanCount(id) > input.copies) {
            throw new ValidationError('عدد النسخ أقل من الإعارات النشطة. أرجع بعض النسخ أولاً.');
        }
        await this.ensureTaxonomy([input.category], input.publisher ? [input.publisher] : []);
        const book = await this.backend.books.update(id, input);
        this.replaceBooks([book]);
        return book;
    }

    async deleteBooks(ids: string[]): Promise<void> {
        if (!ids.length) return;
        if (ids.some((id) => this.activeLoanCount(id) > 0)) {
            throw new ValidationError('بعض الكتب معارة حالياً. يرجى تسجيل الإرجاع قبل الحذف.');
        }
        await this.backend.books.remove(ids);
        const gone = new Set(ids);
        this.data.books = this.data.books.filter((b) => !gone.has(b.id));
        this.emit('books');
    }

    private replaceBooks(updated: Book[]) {
        const byId = new Map(updated.map((b) => [b.id, b]));
        this.data.books = this.data.books.map((b) => byId.get(b.id) ?? b);
        this.emit('books');
    }

    private async refreshBooks(ids: string[]) {
        const fresh = await this.backend.books.get(ids);
        this.replaceBooks(fresh);
    }

    /** Adds missing categories/publishers so the lists stay in sync with books. */
    private async ensureTaxonomy(categories: string[], publishers: string[]) {
        const newCats = [...new Set(categories)].filter((c) => c && !this.data.categories.includes(c));
        const newPubs = [...new Set(publishers)].filter((p) => p && !this.data.publishers.includes(p));
        if (!newCats.length && !newPubs.length) return;
        await Promise.all([
            ...newCats.map((c) => this.backend.taxonomy.addCategory(c)),
            ...newPubs.map((p) => this.backend.taxonomy.addPublisher(p)),
        ]);
        this.data.categories = [...this.data.categories, ...newCats].sort((a, b) => a.localeCompare(b, 'ar'));
        this.data.publishers = [...this.data.publishers, ...newPubs].sort((a, b) => a.localeCompare(b, 'ar'));
        this.emit('taxonomy');
    }

    /** Parse a CSV text and preview what an import would do (no writes). */
    previewImport(csvText: string): ImportPlan {
        return planImport(parseCSV(csvText), this.data.books as Book[]);
    }

    async runImport(plan: ImportPlan, onProgress?: (done: number, total: number) => void): Promise<ImportResult> {
        const total = plan.add.length + plan.update.length;
        let done = 0;
        let failed = 0;
        let added = 0;
        let updated = 0;
        onProgress?.(0, total);
        await this.ensureTaxonomy(plan.categories, plan.publishers);

        for (const batch of chunk(plan.add, 100)) {
            try {
                const inserted = await this.backend.books.insertMany(batch);
                this.data.books = [...inserted, ...this.data.books];
                added += inserted.length;
            } catch {
                failed += batch.length;
            }
            done += batch.length;
            onProgress?.(done, total);
        }
        this.emit('books');

        for (const batch of chunk(plan.update, 10)) {
            const results = await Promise.allSettled(batch.map((u) => this.backend.books.update(u.id, u.book)));
            const ok: Book[] = [];
            results.forEach((r) => (r.status === 'fulfilled' ? ok.push(r.value) : failed++));
            updated += ok.length;
            this.replaceBooks(ok);
            done += batch.length;
            onProgress?.(done, total);
        }
        return { added, updated, unchanged: plan.unchanged, skipped: plan.skipped, failed, updateDetails: plan.update };
    }

    /** Save AI-scanned books, skipping ones that already exist. */
    async saveScanned(rows: ScannedBook[]): Promise<{ saved: number; duplicates: number; invalid: number }> {
        const fresh: BookInput[] = [];
        let duplicates = 0;
        let invalid = 0;
        const seen = new Set(this.data.books.map((b) => bookKey(b)));
        for (const row of rows) {
            const input = normalizeBookInput({ ...row, copies: 1 });
            try { validateBook(input); } catch { invalid++; continue; }
            const key = bookKey(input);
            if (seen.has(key)) { duplicates++; continue; }
            seen.add(key);
            fresh.push(input);
        }
        if (fresh.length) {
            await this.ensureTaxonomy(fresh.map((b) => b.category), fresh.map((b) => b.publisher));
            const inserted = await this.backend.books.insertMany(fresh);
            this.data.books = [...inserted, ...this.data.books];
            this.emit('books');
        }
        return { saved: fresh.length, duplicates, invalid };
    }

    scanBooks(image: { base64: string; mimeType: string }) {
        return this.backend.ai.scanBooks(image);
    }

    // ----------------------------------------------------------------- members
    async addMember(input: MemberInput) {
        const clean = { name: input.name.trim(), phone: input.phone.trim(), address: input.address.trim() };
        if (!clean.name) throw new ValidationError('يرجى إدخال اسم العضو');
        const m = await this.backend.members.insert(clean);
        this.data.members = [m, ...this.data.members];
        this.emit('members');
        return m;
    }

    async updateMember(id: string, input: MemberInput) {
        if (!input.name.trim()) throw new ValidationError('يرجى إدخال اسم العضو');
        const m = await this.backend.members.update(id, {
            name: input.name.trim(), phone: input.phone.trim(), address: input.address.trim(),
        });
        this.data.members = this.data.members.map((x) => (x.id === id ? m : x));
        this.emit('members');
        return m;
    }

    async deleteMembers(ids: string[]) {
        if (!ids.length) return;
        const active = new Set(this.activeLoans().map((l) => l.memberId));
        if (ids.some((id) => active.has(id))) {
            throw new ValidationError('لا يمكن حذف أعضاء لديهم إعارات نشطة. يرجى إرجاع الكتب أولاً.');
        }
        await this.backend.members.remove(ids);
        const gone = new Set(ids);
        this.data.members = this.data.members.filter((m) => !gone.has(m.id));
        this.emit('members');
    }

    // ------------------------------------------------------------------- loans
    async lend(bookId: string, memberId: string, loanDate = today()) {
        const book = this.book(bookId);
        if (!book) throw new ValidationError('اختر الكتاب');
        if (!this.member(memberId)) throw new ValidationError('اختر العضو');
        if (this.availability(book).left < 1) throw new ValidationError('كل النسخ معارة. لا يمكن إعارة نسخة أخرى.');
        const loan = await this.backend.loans.create(bookId, memberId, loanDate || null);
        this.data.loans = [loan, ...this.data.loans];
        this.emit('loans');
        await this.refreshBooks([bookId]);
        return loan;
    }

    async returnLoan(id: string) {
        const loan = await this.backend.loans.markReturned(id, today());
        this.data.loans = this.data.loans.map((l) => (l.id === id ? loan : l));
        this.emit('loans');
        await this.refreshBooks([loan.bookId]);
        return loan;
    }

    async deleteLoan(id: string) {
        const loan = this.data.loans.find((l) => l.id === id);
        await this.backend.loans.remove(id);
        this.data.loans = this.data.loans.filter((l) => l.id !== id);
        this.emit('loans');
        if (loan) await this.refreshBooks([loan.bookId]);
    }

    // ------------------------------------------------------------------- diary
    async addDiary(input: DiaryInput) {
        const content = input.content.trim();
        if (!content) throw new ValidationError('يرجى إدخال محتوى اليومية');
        const entry = await this.backend.diary.insert({ category: input.category || 'أخرى', content, date: input.date || today() });
        this.data.diary = [entry, ...this.data.diary];
        this.emit('diary');
        return entry;
    }

    async updateDiary(id: string, input: DiaryInput) {
        if (!input.content.trim()) throw new ValidationError('يرجى إدخال محتوى اليومية');
        const entry = await this.backend.diary.update(id, { ...input, content: input.content.trim() });
        this.data.diary = this.data.diary.map((d) => (d.id === id ? entry : d));
        this.emit('diary');
    }

    async deleteDiary(id: string) {
        await this.backend.diary.remove(id);
        this.data.diary = this.data.diary.filter((d) => d.id !== id);
        this.emit('diary');
    }

    // ---------------------------------------------------------------- taxonomy
    async addCategory(name: string) {
        const n = name.trim();
        if (!n) throw new ValidationError('يرجى إدخال اسم القسم');
        if (this.data.categories.includes(n)) throw new ValidationError('هذا القسم موجود مسبقاً');
        await this.ensureTaxonomy([n], []);
    }

    async renameCategory(oldName: string, newName: string) {
        const n = newName.trim();
        if (!n || n === oldName) return;
        if (this.data.categories.includes(n)) throw new ValidationError('يوجد قسم بهذا الاسم');
        await this.backend.taxonomy.renameCategory(oldName, n);
        this.data.categories = this.data.categories.map((c) => (c === oldName ? n : c));
        this.data.books = this.data.books.map((b) => (b.category === oldName ? { ...b, category: n } : b));
        this.emit('taxonomy');
        this.emit('books');
    }

    async deleteCategory(name: string) {
        await this.backend.taxonomy.removeCategory(name);
        this.data.categories = this.data.categories.filter((c) => c !== name);
        this.emit('taxonomy');
    }

    async addPublisher(name: string) {
        const n = name.trim();
        if (!n) throw new ValidationError('يرجى إدخال اسم دار النشر');
        if (this.data.publishers.includes(n)) throw new ValidationError('دار النشر هذه موجودة مسبقاً');
        await this.ensureTaxonomy([], [n]);
    }

    async renamePublisher(oldName: string, newName: string) {
        const n = newName.trim();
        if (!n || n === oldName) return;
        if (this.data.publishers.includes(n)) throw new ValidationError('توجد دار نشر بهذا الاسم');
        await this.backend.taxonomy.renamePublisher(oldName, n);
        this.data.publishers = this.data.publishers.map((p) => (p === oldName ? n : p));
        this.data.books = this.data.books.map((b) => (b.publisher === oldName ? { ...b, publisher: n } : b));
        this.emit('taxonomy');
        this.emit('books');
    }

    async deletePublisher(name: string) {
        await this.backend.taxonomy.removePublisher(name);
        this.data.publishers = this.data.publishers.filter((p) => p !== name);
        this.emit('taxonomy');
    }

    /** Add publishers that appear on books but are missing from the list. */
    async syncPublishersFromBooks(): Promise<number> {
        const before = this.data.publishers.length;
        await this.ensureTaxonomy([], this.data.books.map((b) => b.publisher.trim()));
        return this.data.publishers.length - before;
    }

    // --------------------------------------------------------------- documents
    async addDocument(input: DocumentInput, files: File[]): Promise<{ doc: ArchiveDocument; failedFiles: number }> {
        if (!input.title.trim()) throw new ValidationError('عنوان الوثيقة مطلوب');
        let doc = await this.backend.documents.insert({ ...input, title: input.title.trim() });
        const paths: string[] = [];
        let failedFiles = 0;
        for (const [i, file] of files.entries()) {
            const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
            const path = `${doc.id}/${Date.now()}-${i}.${ext}`;
            try {
                await this.backend.files.upload(path, file);
                paths.push(path);
            } catch {
                failedFiles++;
            }
        }
        if (paths.length) doc = await this.backend.documents.update(doc.id, { filePaths: paths });
        this.data.documents = [doc, ...this.data.documents];
        this.emit('documents');
        return { doc, failedFiles };
    }

    async updateDocument(id: string, input: DocumentInput) {
        if (!input.title.trim()) throw new ValidationError('عنوان الوثيقة مطلوب');
        const doc = await this.backend.documents.update(id, { ...input, title: input.title.trim() });
        this.data.documents = this.data.documents.map((d) => (d.id === id ? doc : d));
        this.emit('documents');
    }

    async deleteDocument(id: string) {
        const doc = this.document(id);
        await this.backend.documents.remove(id);
        if (doc?.filePaths.length) await this.backend.files.remove(doc.filePaths).catch(() => undefined);
        this.data.documents = this.data.documents.filter((d) => d.id !== id);
        this.emit('documents');
    }

    fileUrl(path: string) { return this.backend.files.signedUrl(path, 3600); }

    // ------------------------------------------------------------------- admin
    async clearAllData() {
        if (!this.isAdmin) throw new ValidationError('صلاحية المدير فقط.');
        await this.backend.admin.clearAllData();
        this.data = emptySnapshot();
        this.emit('all');
    }
}

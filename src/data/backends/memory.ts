/**
 * In-memory LibraryBackend. Used by tests and by `npm run dev:demo` to work on
 * the UI without touching the real database. It mirrors the server rules
 * (copies vs. active loans, delete guards, pending role) so behaviour matches.
 * Never bundled into production (see ../index.ts).
 */
import { BOOK_STATUS, LOAN_STATUS } from '../types';
import type {
    ArchiveDocument, AuthUser, Book, DiaryEntry, LibraryBackend, LibrarySnapshot, Loan, Member, Profile,
} from '../types';
import { activeLoanCount, statusFor } from '../rules';

let seq = 0;
const uid = () => `mem-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const now = () => new Date().toISOString();
const clone = <T>(v: T): T => structuredClone(v);

export interface MemoryOptions {
    seed?: Partial<LibrarySnapshot>;
    /** Signed in from the start with this role (demo mode). */
    signedInAs?: Profile['role'] | null;
}

export function createMemoryBackend(opts: MemoryOptions = {}): LibraryBackend {
    const db: LibrarySnapshot = {
        books: [], members: [], loans: [], diary: [], documents: [], categories: [], publishers: [],
        ...clone(opts.seed ?? {}),
    };
    const files = new Map<string, File>();
    const demoUser: AuthUser = { id: 'demo-user', email: 'amin@almisbah.org' };
    const profiles: Profile[] = [
        { userId: demoUser.id, email: demoUser.email, role: opts.signedInAs ?? 'admin', displayName: 'أمين المكتبة' },
        { userId: 'demo-2', email: 'abdullah@almisbah.org', role: 'librarian', displayName: '' },
        { userId: 'demo-3', email: 'new.member@gmail.com', role: 'pending', displayName: '' },
    ];
    let user: AuthUser | null = opts.signedInAs ? demoUser : null;
    const authListeners: ((u: AuthUser | null) => void)[] = [];

    const book = (id: string) => {
        const b = db.books.find((x) => x.id === id);
        if (!b) throw new Error('الكتاب غير موجود');
        return b;
    };
    const syncStatus = (id: string) => {
        const b = db.books.find((x) => x.id === id);
        if (b) b.status = statusFor(activeLoanCount(db.loans, id), b.copies);
    };
    const me = () => profiles.find((p) => p.userId === user?.id);
    const requireEdit = () => {
        const role = me()?.role;
        if (role !== 'admin' && role !== 'librarian') throw new Error('ليست لديك صلاحية لهذا الإجراء.');
    };
    const tick = () => new Promise((r) => setTimeout(r, 0));

    return {
        name: 'memory',

        auth: {
            async currentUser() { return user; },
            async signIn(email, password) {
                await tick();
                if (!password) throw new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
                user = { ...demoUser, email: email || demoUser.email };
                authListeners.forEach((f) => f(user));
                return user;
            },
            async signOut() { user = null; authListeners.forEach((f) => f(null)); },
            onChange(cb) { authListeners.push(cb); },
            async updatePassword() { await tick(); },
            async sendPasswordReset() { await tick(); },
        },

        profiles: {
            async mine(userId) { return clone(profiles.find((p) => p.userId === userId) ?? null); },
            async createMine(u) {
                const p: Profile = { userId: u.id, email: u.email, role: 'pending', displayName: '' };
                profiles.push(p);
                return clone(p);
            },
            async list() { return clone(profiles); },
            async setRole(userId, role) {
                if (me()?.role !== 'admin') throw new Error('ليست لديك صلاحية لهذا الإجراء.');
                const p = profiles.find((x) => x.userId === userId);
                if (!p) throw new Error('المستخدم غير موجود');
                p.role = role;
                return clone(p);
            },
        },

        async loadAll() {
            await tick();
            return clone(db);
        },

        books: {
            async insert(input) {
                requireEdit();
                const b: Book = { ...input, id: uid(), status: BOOK_STATUS.available, createdAt: now(), updatedAt: now() };
                db.books.unshift(b);
                return clone(b);
            },
            async insertMany(inputs) {
                requireEdit();
                const rows = inputs.map((input): Book => ({ ...input, id: uid(), status: BOOK_STATUS.available, createdAt: now(), updatedAt: now() }));
                db.books.unshift(...rows);
                return clone(rows);
            },
            async update(id, patch) {
                requireEdit();
                const b = book(id);
                const copies = patch.copies ?? b.copies;
                if (copies < activeLoanCount(db.loans, id)) throw new Error('عدد النسخ أقل من الإعارات النشطة');
                Object.assign(b, patch, { updatedAt: now() });
                syncStatus(id);
                return clone(b);
            },
            async remove(ids) {
                requireEdit();
                if (ids.some((id) => activeLoanCount(db.loans, id) > 0)) throw new Error('الكتاب معار حالياً. يرجى تسجيل الإرجاع قبل الحذف.');
                db.books = db.books.filter((b) => !ids.includes(b.id));
                db.documents.forEach((d) => { if (d.bookId && ids.includes(d.bookId)) d.bookId = null; });
            },
            async get(ids) { return clone(db.books.filter((b) => ids.includes(b.id))); },
        },

        members: {
            async insert(input) {
                requireEdit();
                const m: Member = { ...input, id: uid(), createdAt: now() };
                db.members.unshift(m);
                return clone(m);
            },
            async update(id, patch) {
                requireEdit();
                const m = db.members.find((x) => x.id === id);
                if (!m) throw new Error('العضو غير موجود');
                Object.assign(m, patch);
                return clone(m);
            },
            async remove(ids) {
                requireEdit();
                if (db.loans.some((l) => ids.includes(l.memberId) && l.status === LOAN_STATUS.active)) {
                    throw new Error('لا يمكن حذف العضو. يوجد إعارات نشطة.');
                }
                db.members = db.members.filter((m) => !ids.includes(m.id));
                db.loans = db.loans.filter((l) => !ids.includes(l.memberId));
            },
        },

        loans: {
            async create(bookId, memberId, loanDate) {
                requireEdit();
                const b = book(bookId);
                if (activeLoanCount(db.loans, bookId) >= Math.max(1, b.copies)) throw new Error('كل النسخ معارة');
                const l: Loan = { id: uid(), bookId, memberId, loanDate, returnDate: null, status: LOAN_STATUS.active, createdAt: now() };
                db.loans.unshift(l);
                syncStatus(bookId);
                return clone(l);
            },
            async markReturned(id, returnDate) {
                requireEdit();
                const l = db.loans.find((x) => x.id === id);
                if (!l) throw new Error('السجل غير موجود');
                Object.assign(l, { returnDate, status: LOAN_STATUS.returned });
                syncStatus(l.bookId);
                return clone(l);
            },
            async remove(id) {
                requireEdit();
                const l = db.loans.find((x) => x.id === id);
                db.loans = db.loans.filter((x) => x.id !== id);
                if (l) syncStatus(l.bookId);
            },
        },

        diary: {
            async insert(input) {
                requireEdit();
                const d: DiaryEntry = { id: uid(), date: input.date, category: input.category, content: input.content, createdAt: now() };
                db.diary.unshift(d);
                return clone(d);
            },
            async update(id, patch) {
                requireEdit();
                const d = db.diary.find((x) => x.id === id);
                if (!d) throw new Error('اليومية غير موجودة');
                Object.assign(d, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
                return clone(d);
            },
            async remove(id) { requireEdit(); db.diary = db.diary.filter((d) => d.id !== id); },
        },

        taxonomy: {
            async addCategory(name) { requireEdit(); if (!db.categories.includes(name)) db.categories.push(name); },
            async renameCategory(oldName, newName) {
                requireEdit();
                db.categories = db.categories.map((c) => (c === oldName ? newName : c));
                db.books.forEach((b) => { if (b.category === oldName) b.category = newName; });
            },
            async removeCategory(name) { requireEdit(); db.categories = db.categories.filter((c) => c !== name); },
            async addPublisher(name) { requireEdit(); if (!db.publishers.includes(name)) db.publishers.push(name); },
            async renamePublisher(oldName, newName) {
                requireEdit();
                db.publishers = db.publishers.map((p) => (p === oldName ? newName : p));
                db.books.forEach((b) => { if (b.publisher === oldName) b.publisher = newName; });
            },
            async removePublisher(name) { requireEdit(); db.publishers = db.publishers.filter((p) => p !== name); },
        },

        documents: {
            async insert(input) {
                requireEdit();
                const d: ArchiveDocument = { ...input, id: uid(), filePaths: [], createdAt: now(), updatedAt: now() };
                db.documents.unshift(d);
                return clone(d);
            },
            async update(id, patch) {
                requireEdit();
                const d = db.documents.find((x) => x.id === id);
                if (!d) throw new Error('الوثيقة غير موجودة');
                Object.assign(d, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)), { updatedAt: now() });
                return clone(d);
            },
            async remove(id) { requireEdit(); db.documents = db.documents.filter((d) => d.id !== id); },
        },

        files: {
            async upload(path, file) { requireEdit(); files.set(path, file); },
            async remove(paths) { paths.forEach((p) => files.delete(p)); },
            async signedUrl(path) {
                const f = files.get(path);
                return f && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(f) : null;
            },
        },

        ai: {
            async scanBooks() {
                requireEdit();
                await new Promise((r) => setTimeout(r, 900));
                return [
                    { name: 'الموطأ', author: 'مالك بن أنس', category: 'حديث', editor: 'محمد فؤاد عبد الباقي', parts: 2, publisher: 'دار إحياء التراث العربي', year: '1406', cabinet: '', shelf: '' },
                    { name: 'الأدب المفرد', author: 'محمد بن إسماعيل البخاري', category: 'حديث', editor: '', parts: 1, publisher: 'دار البشائر الإسلامية', year: '1409', cabinet: '', shelf: '' },
                ];
            },
        },

        admin: {
            async clearAllData() {
                if (me()?.role !== 'admin') throw new Error('صلاحية المدير فقط');
                Object.assign(db, { books: [], members: [], loans: [], diary: [], documents: [], categories: [], publishers: [] });
            },
        },
    };
}

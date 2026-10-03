/**
 * Supabase implementation of LibraryBackend.
 * This is the ONLY file in the app that knows Supabase exists.
 */
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LOAN_STATUS } from '../types';
import type {
    ArchiveDocument, AuthUser, Book, BookInput, DiaryEntry, LibraryBackend, Loan, Member, Profile, Role,
} from '../types';

const T = {
    profiles: 'ktb_profiles',
    books: 'ktb_books',
    members: 'ktb_members',
    loans: 'ktb_loans',
    diary: 'ktb_diary_entries',
    categories: 'ktb_categories',
    publishers: 'ktb_publishers',
    documents: 'ktb_documents',
} as const;
const BUCKET = 'ktb-document-archive';
const PAGE = 1000;

type Row = Record<string, any>;

const mapBook = (r: Row): Book => ({
    id: r.id,
    name: r.name ?? '',
    author: r.author ?? '',
    category: r.category ?? '',
    editor: r.editor ?? '',
    parts: r.parts ?? 1,
    publisher: r.publisher ?? '',
    year: r.year ?? '',
    copies: r.copies ?? 1,
    status: r.status === 'معار' ? 'معار' : 'متاح',
    cabinet: r.cabinet ?? '',
    shelf: r.shelf ?? '',
    notes: r.notes ?? '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
});

const bookRow = (b: Partial<BookInput>) => {
    const row: Row = {};
    for (const k of ['name', 'author', 'category', 'editor', 'parts', 'publisher', 'year', 'copies', 'cabinet', 'shelf', 'notes'] as const) {
        if (b[k] !== undefined) row[k] = b[k];
    }
    return row;
};

const mapMember = (r: Row): Member => ({
    id: r.id, name: r.name ?? '', phone: r.phone ?? '', address: r.address ?? '', createdAt: r.created_at,
});

const mapLoan = (r: Row): Loan => ({
    id: r.id,
    bookId: r.book_id,
    memberId: r.member_id,
    loanDate: r.loan_date,
    returnDate: r.return_date,
    status: r.status === LOAN_STATUS.returned ? LOAN_STATUS.returned : LOAN_STATUS.active,
    createdAt: r.created_at,
});

const mapDiary = (r: Row): DiaryEntry => ({
    id: r.id, date: r.date, category: r.category ?? 'أخرى', content: r.details ?? '', createdAt: r.created_at,
});

const mapDocument = (r: Row): ArchiveDocument => {
    let paths: unknown = r.file_paths;
    if (typeof paths === 'string') { try { paths = JSON.parse(paths); } catch { paths = []; } }
    return {
        id: r.id,
        title: r.title ?? '',
        description: r.description ?? '',
        category: r.category ?? 'أخرى',
        documentDate: r.document_date ?? null,
        bookId: r.book_id ?? null,
        filePaths: Array.isArray(paths) ? paths : [],
        createdAt: r.created_at,
        updatedAt: r.updated_at,
    };
};

const mapProfile = (r: Row): Profile => ({
    userId: r.user_id, email: r.email ?? '', role: (r.role ?? 'pending') as Role, displayName: r.display_name ?? '', createdAt: r.created_at,
});

const mapUser = (u: { id: string; email?: string | null } | null | undefined): AuthUser | null =>
    u ? { id: u.id, email: u.email ?? '' } : null;

/** Turn a PostgREST / Postgres error into an Error with a readable message. */
function fail(error: { message?: string; code?: string } | null): never {
    const msg = error?.message || 'حدث خطأ في الخادم';
    if (error?.code === '42501') throw new Error('ليست لديك صلاحية لهذا الإجراء.');
    if (error?.code === '23505') throw new Error('هذا العنصر موجود مسبقاً.');
    throw new Error(msg);
}

async function one<T>(q: PromiseLike<{ data: any; error: any }>, map: (r: Row) => T): Promise<T> {
    const { data, error } = await q;
    if (error) fail(error);
    return map(data);
}

async function many<T>(q: PromiseLike<{ data: any; error: any }>, map: (r: Row) => T): Promise<T[]> {
    const { data, error } = await q;
    if (error) fail(error);
    return (data ?? []).map(map);
}

async function run(q: PromiseLike<{ error: any }>): Promise<void> {
    const { error } = await q;
    if (error) fail(error);
}

export function createSupabaseBackend(url: string, anonKey: string): LibraryBackend {
    const sb: SupabaseClient = createClient(url, anonKey);

    async function fetchAll(table: string, order = 'created_at'): Promise<Row[]> {
        const all: Row[] = [];
        for (let from = 0; ; from += PAGE) {
            const { data, error } = await sb.from(table).select('*').order(order, { ascending: false }).order('id').range(from, from + PAGE - 1);
            if (error) fail(error);
            all.push(...(data ?? []));
            if (!data || data.length < PAGE) return all;
        }
    }

    async function names(table: string): Promise<string[]> {
        const { data, error } = await sb.from(table).select('name').order('name');
        if (error) fail(error);
        return (data ?? []).map((r: Row) => r.name as string);
    }

    async function addName(table: string, name: string) {
        const { error } = await sb.from(table).insert({ name });
        if (error && error.code !== '23505') fail(error);
    }

    return {
        name: 'supabase',

        auth: {
            async currentUser() {
                const { data } = await sb.auth.getSession();
                return mapUser(data.session?.user);
            },
            async signIn(email, password) {
                const { data, error } = await sb.auth.signInWithPassword({ email, password });
                if (error || !data.user) throw new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
                return mapUser(data.user)!;
            },
            async signOut() {
                await sb.auth.signOut();
            },
            onChange(cb) {
                sb.auth.onAuthStateChange((_event, session) => {
                    // Defer: supabase-js deadlocks if we await other calls inside this callback.
                    setTimeout(() => cb(mapUser(session?.user)), 0);
                });
            },
            async updatePassword(newPassword) {
                const { error } = await sb.auth.updateUser({ password: newPassword });
                if (error) fail(error);
            },
            async sendPasswordReset(email, redirectTo) {
                const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
                if (error) fail(error);
            },
        },

        profiles: {
            async mine(userId) {
                const { data, error } = await sb.from(T.profiles).select('*').eq('user_id', userId).maybeSingle();
                if (error) fail(error);
                return data ? mapProfile(data) : null;
            },
            async createMine(user) {
                const { data, error } = await sb.from(T.profiles)
                    .insert({ user_id: user.id, email: user.email, role: 'pending' }).select().single();
                if (error?.code === '23505') {
                    return one(sb.from(T.profiles).select('*').eq('user_id', user.id).single(), mapProfile);
                }
                if (error) fail(error);
                return mapProfile(data);
            },
            list: () => many(sb.from(T.profiles).select('*').order('created_at'), mapProfile),
            setRole: (userId, role) =>
                one(sb.from(T.profiles).update({ role }).eq('user_id', userId).select().single(), mapProfile),
        },

        async loadAll() {
            const [books, members, loans, diary, documents, categories, publishers] = await Promise.all([
                fetchAll(T.books), fetchAll(T.members), fetchAll(T.loans), fetchAll(T.diary), fetchAll(T.documents),
                names(T.categories), names(T.publishers),
            ]);
            return {
                books: books.map(mapBook),
                members: members.map(mapMember),
                loans: loans.map(mapLoan),
                diary: diary.map(mapDiary),
                documents: documents.map(mapDocument),
                categories,
                publishers,
            };
        },

        books: {
            insert: (input) => one(sb.from(T.books).insert(bookRow(input)).select().single(), mapBook),
            insertMany: (inputs) => many(sb.from(T.books).insert(inputs.map(bookRow)).select(), mapBook),
            update: (id, patch) =>
                one(sb.from(T.books).update({ ...bookRow(patch), updated_at: new Date().toISOString() }).eq('id', id).select().single(), mapBook),
            remove: (ids) => run(sb.from(T.books).delete().in('id', ids)),
            get: (ids) => many(sb.from(T.books).select('*').in('id', ids), mapBook),
        },

        members: {
            insert: (input) => one(sb.from(T.members).insert(input).select().single(), mapMember),
            update: (id, patch) => one(sb.from(T.members).update(patch).eq('id', id).select().single(), mapMember),
            remove: (ids) => run(sb.from(T.members).delete().in('id', ids)),
        },

        loans: {
            create: (bookId, memberId, loanDate) =>
                one(sb.from(T.loans).insert({ book_id: bookId, member_id: memberId, loan_date: loanDate, status: LOAN_STATUS.active }).select().single(), mapLoan),
            markReturned: (id, returnDate) =>
                one(sb.from(T.loans).update({ return_date: returnDate, status: LOAN_STATUS.returned }).eq('id', id).select().single(), mapLoan),
            remove: (id) => run(sb.from(T.loans).delete().eq('id', id)),
        },

        diary: {
            insert: (input) =>
                one(sb.from(T.diary).insert({ date: input.date, category: input.category, details: input.content }).select().single(), mapDiary),
            update: (id, patch) => {
                const row: Row = {};
                if (patch.date !== undefined) row.date = patch.date;
                if (patch.category !== undefined) row.category = patch.category;
                if (patch.content !== undefined) row.details = patch.content;
                return one(sb.from(T.diary).update(row).eq('id', id).select().single(), mapDiary);
            },
            remove: (id) => run(sb.from(T.diary).delete().eq('id', id)),
        },

        taxonomy: {
            addCategory: (name) => addName(T.categories, name),
            renameCategory: (oldName, newName) => run(sb.rpc('ktb_rename_category', { p_old: oldName, p_new: newName })),
            removeCategory: (name) => run(sb.from(T.categories).delete().eq('name', name)),
            addPublisher: (name) => addName(T.publishers, name),
            renamePublisher: (oldName, newName) => run(sb.rpc('ktb_rename_publisher', { p_old: oldName, p_new: newName })),
            removePublisher: (name) => run(sb.from(T.publishers).delete().eq('name', name)),
        },

        documents: {
            insert: (input) =>
                one(sb.from(T.documents).insert({
                    title: input.title, description: input.description, category: input.category,
                    document_date: input.documentDate, book_id: input.bookId, file_paths: [],
                }).select().single(), mapDocument),
            update: (id, patch) => {
                const row: Row = { updated_at: new Date().toISOString() };
                if (patch.title !== undefined) row.title = patch.title;
                if (patch.description !== undefined) row.description = patch.description;
                if (patch.category !== undefined) row.category = patch.category;
                if (patch.documentDate !== undefined) row.document_date = patch.documentDate;
                if (patch.bookId !== undefined) row.book_id = patch.bookId;
                if (patch.filePaths !== undefined) row.file_paths = patch.filePaths;
                return one(sb.from(T.documents).update(row).eq('id', id).select().single(), mapDocument);
            },
            remove: (id) => run(sb.from(T.documents).delete().eq('id', id)),
        },

        files: {
            async upload(path, file) {
                const { error } = await sb.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
                if (error) fail(error);
            },
            async remove(paths) {
                const { error } = await sb.storage.from(BUCKET).remove(paths);
                if (error) fail(error);
            },
            async signedUrl(path, expiresIn) {
                const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, expiresIn);
                return error ? null : data?.signedUrl ?? null;
            },
        },

        ai: {
            async scanBooks(image) {
                const { data, error } = await sb.functions.invoke('scan-books', { body: { image } });
                if (error) {
                    let msg = error.message || 'فشل تحليل الصورة';
                    const ctx = (error as { context?: Response }).context;
                    if (ctx && typeof ctx.json === 'function') {
                        try { const j = await ctx.json(); if (j?.error) msg = j.error; } catch { /* keep default */ }
                    }
                    throw new Error(msg);
                }
                return Array.isArray(data?.books) ? data.books : [];
            },
        },

        admin: {
            clearAllData: () => run(sb.rpc('clear_all_data')),
        },
    };
}

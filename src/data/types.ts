/**
 * Domain types and the backend contract.
 *
 * The UI never talks to Supabase (or any database) directly. It talks to the
 * repository (repository.ts), which keeps an in-memory cache and enforces the
 * library rules. The repository in turn talks to a `LibraryBackend`.
 *
 * To move to another database (e.g. Cloudflare D1 behind a Worker API),
 * implement `LibraryBackend` in a new file under ./backends and select it in
 * ./index.ts. Nothing else needs to change.
 */

export type Role = 'admin' | 'librarian' | 'viewer' | 'pending';

export const BOOK_STATUS = { available: 'متاح', loaned: 'معار' } as const;
export const LOAN_STATUS = { active: 'معار', returned: 'مُرجع' } as const;

export type BookStatus = (typeof BOOK_STATUS)[keyof typeof BOOK_STATUS];
export type LoanStatus = (typeof LOAN_STATUS)[keyof typeof LOAN_STATUS];

export interface Book {
    id: string;
    name: string;
    author: string;
    category: string;
    editor: string;
    parts: number;
    publisher: string;
    year: string;
    copies: number;
    status: BookStatus;
    cabinet: string;
    shelf: string;
    notes: string;
    createdAt?: string;
    updatedAt?: string;
}

/** Fields a user can set on a book (status is derived from loans). */
export type BookInput = Omit<Book, 'id' | 'status' | 'createdAt' | 'updatedAt'>;

export interface Member {
    id: string;
    name: string;
    phone: string;
    address: string;
    createdAt?: string;
}
export type MemberInput = Omit<Member, 'id' | 'createdAt'>;

export interface Loan {
    id: string;
    bookId: string;
    memberId: string;
    loanDate: string | null;
    returnDate: string | null;
    status: LoanStatus;
    createdAt?: string;
}

export type DiaryCategory = 'ضيف' | 'صيانة' | 'شراء' | 'أخرى';
export interface DiaryEntry {
    id: string;
    date: string;
    category: DiaryCategory | string;
    content: string;
    createdAt?: string;
}
export type DiaryInput = Pick<DiaryEntry, 'category' | 'content'> & { date?: string };

export interface ArchiveDocument {
    id: string;
    title: string;
    description: string;
    category: string;
    documentDate: string | null;
    bookId: string | null;
    filePaths: string[];
    createdAt?: string;
    updatedAt?: string;
}
export type DocumentInput = Pick<ArchiveDocument, 'title' | 'description' | 'category' | 'documentDate' | 'bookId'>;

export interface Profile {
    userId: string;
    email: string;
    role: Role;
    displayName: string;
    createdAt?: string;
}

export interface AuthUser {
    id: string;
    email: string;
}

export interface ScannedBook {
    name: string;
    author: string;
    category: string;
    editor: string;
    parts: number;
    publisher: string;
    year: string;
    cabinet: string;
    shelf: string;
}

/** Everything the app loads after sign-in. */
export interface LibrarySnapshot {
    books: Book[];
    members: Member[];
    loans: Loan[];
    diary: DiaryEntry[];
    documents: ArchiveDocument[];
    categories: string[];
    publishers: string[];
}

/**
 * The storage contract. Every method maps to one atomic server operation;
 * business rules live in the repository / database, not here.
 * Errors are thrown as `Error` with a user-facing (Arabic) message when the
 * server provides one.
 */
export interface LibraryBackend {
    readonly name: string;

    auth: {
        currentUser(): Promise<AuthUser | null>;
        signIn(email: string, password: string): Promise<AuthUser>;
        signOut(): Promise<void>;
        onChange(cb: (user: AuthUser | null) => void): void;
        updatePassword(newPassword: string): Promise<void>;
        sendPasswordReset(email: string, redirectTo: string): Promise<void>;
    };

    profiles: {
        /** Own profile, or null if none exists yet. */
        mine(userId: string): Promise<Profile | null>;
        /** Create own profile; the server only accepts role 'pending'. */
        createMine(user: AuthUser): Promise<Profile>;
        list(): Promise<Profile[]>;
        setRole(userId: string, role: Role): Promise<Profile>;
    };

    loadAll(): Promise<LibrarySnapshot>;

    books: {
        insert(input: BookInput): Promise<Book>;
        insertMany(inputs: BookInput[]): Promise<Book[]>;
        update(id: string, patch: Partial<BookInput>): Promise<Book>;
        remove(ids: string[]): Promise<void>;
        /** Re-read rows the server may have changed (e.g. status after a loan). */
        get(ids: string[]): Promise<Book[]>;
    };

    members: {
        insert(input: MemberInput): Promise<Member>;
        update(id: string, patch: Partial<MemberInput>): Promise<Member>;
        remove(ids: string[]): Promise<void>;
    };

    loans: {
        /** Server must reject when every copy is already on loan. */
        create(bookId: string, memberId: string, loanDate: string | null): Promise<Loan>;
        markReturned(id: string, returnDate: string): Promise<Loan>;
        remove(id: string): Promise<void>;
    };

    diary: {
        insert(input: Required<DiaryInput>): Promise<DiaryEntry>;
        update(id: string, patch: Partial<DiaryInput>): Promise<DiaryEntry>;
        remove(id: string): Promise<void>;
    };

    taxonomy: {
        addCategory(name: string): Promise<void>;
        /** Renames the category and every book using it, atomically. */
        renameCategory(oldName: string, newName: string): Promise<void>;
        removeCategory(name: string): Promise<void>;
        addPublisher(name: string): Promise<void>;
        renamePublisher(oldName: string, newName: string): Promise<void>;
        removePublisher(name: string): Promise<void>;
    };

    documents: {
        insert(input: DocumentInput): Promise<ArchiveDocument>;
        update(id: string, patch: Partial<DocumentInput> & { filePaths?: string[] }): Promise<ArchiveDocument>;
        remove(id: string): Promise<void>;
    };

    files: {
        upload(path: string, file: File): Promise<void>;
        remove(paths: string[]): Promise<void>;
        signedUrl(path: string, expiresInSeconds: number): Promise<string | null>;
    };

    ai: {
        scanBooks(image: { base64: string; mimeType: string }): Promise<ScannedBook[]>;
    };

    admin: {
        clearAllData(): Promise<void>;
    };
}

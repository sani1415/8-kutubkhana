/**
 * On-device copy of the library, so the app opens instantly and fresh data
 * streams in behind it. Stored in IndexedDB (no size trouble for ~10k books).
 * Cleared on sign-out. Any storage failure simply means "no cache".
 */
import type { LibrarySnapshot, Profile } from './types';

export interface CachedLibrary {
    version: number;
    savedAt: number;
    profile: Profile;
    data: LibrarySnapshot;
}

export interface SnapshotCache {
    get(userId: string): Promise<CachedLibrary | null>;
    set(userId: string, entry: CachedLibrary): Promise<void>;
    clear(): Promise<void>;
}

/** Bump when the snapshot shape changes so old copies are ignored. */
export const CACHE_VERSION = 1;

const DB = 'kutubkhana';
const STORE = 'library';

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        t.oncomplete = () => { db.close(); resolve(req ? req.result : undefined); };
        t.onerror = () => { db.close(); reject(t.error); };
        t.onabort = () => { db.close(); reject(t.error); };
    });
}

export function createIndexedDbCache(): SnapshotCache | undefined {
    if (typeof indexedDB === 'undefined') return undefined;
    return {
        async get(userId) {
            try {
                const entry = (await tx('readonly', (s) => s.get(userId))) as CachedLibrary | undefined;
                return entry && entry.version === CACHE_VERSION ? entry : null;
            } catch {
                return null;
            }
        },
        async set(userId, entry) {
            try { await tx('readwrite', (s) => { s.put(entry, userId); }); } catch { /* storage full or blocked */ }
        },
        async clear() {
            try { await tx('readwrite', (s) => { s.clear(); }); } catch { /* ignore */ }
        },
    };
}

/** In-memory cache for tests. */
export function createMemoryCache(): SnapshotCache & { entries: Map<string, CachedLibrary> } {
    const entries = new Map<string, CachedLibrary>();
    return {
        entries,
        async get(userId) { return structuredClone(entries.get(userId) ?? null); },
        async set(userId, entry) { entries.set(userId, structuredClone(entry)); },
        async clear() { entries.clear(); },
    };
}

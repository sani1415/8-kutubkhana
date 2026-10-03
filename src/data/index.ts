/**
 * Picks the storage backend. This is the switch to flip for a future move
 * (e.g. Cloudflare D1): add backends/d1.ts implementing LibraryBackend and
 * return it here. The UI imports only `createRepository` and the types.
 */
import { LibraryRepository } from './repository';
import type { LibraryBackend } from './types';

export { LibraryRepository } from './repository';
export * from './types';
export * from './rules';

async function pickBackend(): Promise<LibraryBackend> {
    // Demo data is a dev-only aid; this branch is removed from production builds.
    if (import.meta.env.DEV && import.meta.env.VITE_DATA_BACKEND === 'demo') {
        const [{ createMemoryBackend }, { demoSeed }] = await Promise.all([
            import('./backends/memory'),
            import('./backends/demo-seed'),
        ]);
        return createMemoryBackend({ seed: demoSeed(), signedInAs: 'admin' });
    }

    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('CONFIG_MISSING');
    const { createSupabaseBackend } = await import('./backends/supabase');
    return createSupabaseBackend(url, key);
}

export async function createRepository(): Promise<LibraryRepository> {
    return new LibraryRepository(await pickBackend());
}

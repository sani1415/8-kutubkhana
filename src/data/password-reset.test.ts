import { describe, expect, it, vi } from 'vitest';
import { resetHandler } from '../../supabase/functions/admin-reset-password/handler';
import { createMemoryBackend } from './backends/memory';
import { LibraryRepository } from './repository';

const target = 'e3c2d210-b73a-457c-89d5-74f891f63a6c';
const makeRequest = (body: unknown = { userId: target, password: 'test-only-password' }, token = 'test-token') => new Request('https://example.invalid/reset', {
    method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body),
});
const services = (role = 'admin', targetRole: string | null = 'librarian') => ({
    authenticate: vi.fn(async () => ({ id: 'caller', role })),
    targetRole: vi.fn(async () => targetRole),
    updatePassword: vi.fn(async () => ({ error: null as string | null })),
});

describe('admin password reset server boundary', () => {
    it('requires a valid session and denies every non-admin role', async () => {
        const deps = services();
        expect((await resetHandler(deps)(makeRequest(undefined, ''))).status).toBe(401);
        deps.authenticate.mockResolvedValueOnce(null as any);
        expect((await resetHandler(deps)(makeRequest())).status).toBe(401);
        for (const role of ['librarian', 'viewer', 'pending']) {
            const denied = services(role);
            expect((await resetHandler(denied)(makeRequest())).status).toBe(403);
            expect(denied.updatePassword).not.toHaveBeenCalled();
        }
    });
    it('rejects missing library members, peer admins and malformed input without writing', async () => {
        for (const role of [null, 'admin']) {
            const deps = services('admin', role);
            expect((await resetHandler(deps)(makeRequest())).status).toBe(role ? 403 : 404);
            expect(deps.updatePassword).not.toHaveBeenCalled();
        }
        const deps = services();
        for (const body of [null, {}, { userId: target, password: 'short' }, { userId: 'bad', password: 'long-password' }]) {
            expect((await resetHandler(deps)(makeRequest(body))).status).toBe(400);
        }
        expect(deps.updatePassword).not.toHaveBeenCalled();
    });
    it('changes exactly the selected user and never returns their password', async () => {
        const deps = services();
        const response = await resetHandler(deps)(makeRequest());
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true });
        expect(deps.updatePassword).toHaveBeenCalledExactlyOnceWith(target, 'test-only-password');
        expect(response.headers.get('cache-control')).toBe('no-store');
    });
    it('handles preflight, unsupported methods and service failure safely', async () => {
        const deps = services();
        const handler = resetHandler(deps);
        expect((await handler(new Request('https://example.invalid', { method: 'OPTIONS' }))).status).toBe(204);
        expect((await handler(new Request('https://example.invalid'))).status).toBe(405);
        deps.updatePassword.mockRejectedValueOnce(new Error('private details'));
        const response = await handler(makeRequest());
        expect(response.status).toBe(500);
        expect(await response.text()).not.toContain('private details');
    });
});

describe('password recovery and repository authorization', () => {
    it('detects recovery even when the initial event precedes startup and clears it after saving', async () => {
        const backend = createMemoryBackend({ signedInAs: 'librarian' });
        backend.auth.isPasswordRecovery = () => true;
        const repo = new LibraryRepository(backend);
        await repo.start();
        expect(repo.recoveringPassword).toBe(true);
        await repo.updatePassword('new-test-password');
        expect(repo.recoveringPassword).toBe(false);
    });
    it('does not let a librarian call admin reset; an admin can reset another member', async () => {
        const denied = new LibraryRepository(createMemoryBackend({ signedInAs: 'librarian' }));
        await denied.start();
        expect(() => denied.resetUserPassword('demo-2', 'new-test-password')).toThrow();
        const admin = new LibraryRepository(createMemoryBackend({ signedInAs: 'admin' }));
        await admin.start();
        await expect(admin.resetUserPassword('demo-2', 'new-test-password')).resolves.toBeUndefined();
        await expect(admin.resetUserPassword('demo-user', 'new-test-password')).rejects.toThrow();
    });
});

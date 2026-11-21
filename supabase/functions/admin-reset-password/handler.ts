export interface ResetServices {
    authenticate(token: string): Promise<{ id: string; role: string } | null>;
    targetRole(id: string): Promise<string | null>;
    updatePassword(id: string, password: string): Promise<{ error: string | null }>;
}

// No request body, password, JWT or SDK response is logged or returned.
export function resetHandler(services: ResetServices) {
    return async (req: Request): Promise<Response> => {
        const headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
        };
        const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers });
        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
        if (req.method !== 'POST') return json({ error: 'طريقة الطلب غير مسموحة.' }, 405);
        const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
        if (!token) return json({ error: 'سجّل الدخول أولاً.' }, 401);
        try {
            const actor = await services.authenticate(token);
            if (!actor) return json({ error: 'انتهت الجلسة. سجّل الدخول مجدداً.' }, 401);
            if (actor.role !== 'admin') return json({ error: 'هذا الإجراء متاح للمدير فقط.' }, 403);
            if (Number(req.headers.get('content-length')) > 4096) return json({ error: 'الطلب كبير جداً.' }, 413);
            const text = await req.text();
            if (text.length > 4096) return json({ error: 'الطلب كبير جداً.' }, 413);
            let body;
            try { body = JSON.parse(text); } catch { return json({ error: 'الطلب غير صالح.' }, 400); }
            const { userId, password } = body ?? {};
            if (typeof userId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
                return json({ error: 'المستخدم غير صالح.' }, 400);
            }
            if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
                return json({ error: 'كلمة المرور يجب أن تكون بين 8 و128 حرفاً.' }, 400);
            }
            const role = await services.targetRole(userId);
            if (!role) return json({ error: 'المستخدم غير موجود في المكتبة.' }, 404);
            // Protect peer administrators; own password uses the normal account flow.
            if (role === 'admin' || actor.id === userId) return json({ error: 'لا يمكن إعادة تعيين كلمة مرور مدير من هنا.' }, 403);
            const result = await services.updatePassword(userId, password);
            if (result.error) return json({ error: result.error }, 400);
            return json({ success: true }, 200);
        } catch {
            return json({ error: 'تعذر إعادة تعيين كلمة المرور. حاول مجدداً.' }, 500);
        }
    };
}

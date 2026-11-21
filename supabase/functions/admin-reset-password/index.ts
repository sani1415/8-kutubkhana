import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';
import { resetHandler } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(resetHandler({
    async authenticate(token) {
        const caller = createClient(url, anonKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data, error } = await caller.auth.getUser(token);
        if (error || !data.user) return null;
        const { data: profile, error: roleError } = await caller.from('ktb_profiles')
            .select('role').eq('user_id', data.user.id).maybeSingle();
        if (roleError) throw roleError;
        return { id: data.user.id, role: profile?.role ?? 'pending' };
    },
    async targetRole(id) {
        const { data, error } = await admin.from('ktb_profiles').select('role').eq('user_id', id).maybeSingle();
        if (error) throw error;
        return data?.role ?? null;
    },
    async updatePassword(id, password) {
        const { error } = await admin.auth.admin.updateUserById(id, { password });
        if (!error) return { error: null };
        const message = error.code === 'same_password'
            ? 'اختر كلمة مرور مختلفة عن الحالية.'
            : error.code === 'weak_password'
                ? 'اختر كلمة مرور أقوى وغير شائعة.'
                : 'تعذر حفظ كلمة المرور الجديدة.';
        return { error: message };
    },
}));

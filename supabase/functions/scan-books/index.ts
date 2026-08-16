// Supabase Edge Function: scan-books
// Receives a book photo (base64), extracts book metadata via Gemini,
// and returns a JSON array of books. The Gemini API key stays server-side.
//
// Auth: requires a valid Supabase JWT (sent automatically by
// supabase.functions.invoke). The caller must have role admin or librarian
// in ktb_profiles.
//
// Deploy:
//   supabase secrets set GEMINI_API_KEY=...
//   supabase functions deploy scan-books

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];
const MAX_RETRIES = 3;

const PROMPT = `You are a library data extraction assistant. Analyze this image of a book or books and extract the following information for EACH book visible in the image.

Return a JSON array where each element has these fields:
- "name": Book title (keep original language - Arabic, Bengali, Urdu, English, etc.)
- "author": Author name (keep original language)
- "category": Category/subject (e.g. حديث، فقه، تفسير، سيرة، تاريخ، أدب، تزكية، عام etc.)
- "editor": Editor/Tahqiq (if visible, otherwise empty string)
- "parts": Number of parts/volumes (integer, default 1)
- "publisher": Publisher / publishing house / imprint name only (if visible, otherwise empty string)
- "year": Publication year (use Western/ASCII digits like 2021, not Bengali/Arabic numerals)
- "cabinet": "" (empty, user will fill)
- "shelf": "" (empty, user will fill)

IMPORTANT RULES:
- Return ONLY valid JSON array, no other text or markdown
- If multiple books are visible, return multiple objects
- Keep text in the original language as it appears on the book
- If you cannot read a field clearly, use empty string ""
- For year, always convert to Western digits (e.g. ২০২১ → 2021, ١٤٤٢ → 1442)
- For publisher, extract only the publishing house / organization / imprint name
- Do NOT include proprietor, founder, owner, director, editor, printer, distributor, manager, or other person names in publisher
- If text says things like "owned by", "by", "proprietor", "under supervision of", "managed by", or includes a person's name near the publisher, ignore the person and keep only the publishing house name
- If both a publishing house name and a person's name appear together, prefer only the publishing house name
- If you are not sure whether a person name is part of the brand, prefer the shorter organization name and omit the person name
- If a book appears to be in Bengali, keep Bengali text. If Arabic, keep Arabic.`;

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

async function getUserRole(req: Request): Promise<{ user: any; role: string } | null> {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return null;

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) return null;

    const { data: profile } = await supabase
        .from('ktb_profiles')
        .select('role')
        .eq('user_id', userData.user.id)
        .maybeSingle();

    return { user: userData.user, role: profile?.role ?? 'viewer' };
}

async function callGemini(base64Data: string, mimeType: string): Promise<unknown[]> {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY secret is not set. Run: supabase secrets set GEMINI_API_KEY=...');

    let lastError: unknown = null;

    for (const model of MODELS) {
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: PROMPT },
                                { inline_data: { mime_type: mimeType, data: base64Data } },
                            ],
                        }],
                        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
                    }),
                });

                if (response.status === 429) {
                    const errBody = await response.json().catch(() => ({}) as any);
                    const retryMatch = String(errBody?.error?.message ?? '').match(/retry in ([\d.]+)s/i);
                    const waitSec = retryMatch ? Math.min(parseFloat(retryMatch[1]), 60) : (attempt + 1) * 15;
                    await new Promise((r) => setTimeout(r, waitSec * 1000));
                    continue;
                }

                if (!response.ok) {
                    const err = await response.json().catch(() => ({}) as any);
                    throw new Error(err?.error?.message || `Gemini API error: ${response.status}`);
                }

                const data = await response.json();
                const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                const jsonMatch = text.match(/\[[\s\S]*\]/);
                if (!jsonMatch) throw new Error('لم يتم العثور على بيانات في الاستجابة');
                return JSON.parse(jsonMatch[0]);
            } catch (err) {
                lastError = err;
                const msg = err instanceof Error ? err.message : String(err);
                if (msg.includes('429') || msg.toLowerCase().includes('quota')) {
                    await new Promise((r) => setTimeout(r, (attempt + 1) * 15 * 1000));
                    continue;
                }
                throw err;
            }
        }
    }
    throw lastError instanceof Error ? lastError : new Error('فشلت جميع المحاولات');
}

function sanitizeBooks(books: unknown): unknown[] {
    if (!Array.isArray(books)) return [];
    return books.map((b: any) => ({
        name: String(b?.name ?? ''),
        author: String(b?.author ?? ''),
        category: String(b?.category ?? ''),
        editor: String(b?.editor ?? ''),
        parts: parseInt(b?.parts, 10) || 1,
        publisher: String(b?.publisher ?? ''),
        year: String(b?.year ?? ''),
        cabinet: String(b?.cabinet ?? ''),
        shelf: String(b?.shelf ?? ''),
    }));
}

Deno.serve(async (req) => {
    try {
        // 1) Authenticate the caller
        const auth = await getUserRole(req);
        if (!auth) {
            return json({ error: 'غير مصرح: يتطلب تسجيل الدخول.' }, 401);
        }
        if (auth.role !== 'admin' && auth.role !== 'librarian') {
            return json({ error: 'صلاحيات غير كافية: يتطلب دور أمين المكتبة أو مدير.' }, 403);
        }

        // 2) Validate payload
        const body = await req.json().catch(() => null);
        const base64Data = typeof body?.image?.base64 === 'string' ? body.image.base64 : '';
        const mimeType = typeof body?.image?.mimeType === 'string' ? body.image.mimeType : 'image/jpeg';
        if (!base64Data) {
            return json({ error: 'صورة غير صالحة.' }, 400);
        }

        // 3) Extract via Gemini (key stays server-side)
        const books = await callGemini(base64Data, mimeType);
        return json({ books: sanitizeBooks(books) });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: message }, 500);
    }
});

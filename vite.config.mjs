import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';

// `vite preview` serves the same security headers as production (vercel.json).
const vercelHeaders = Object.fromEntries(
    JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'))
        .headers[0].headers.map((h) => [h.key, h.value]),
);

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    // Vercel already has SUPABASE_URL / SUPABASE_ANON_KEY; accept those too.
    // Only these two values reach the browser — never the whole SUPABASE_* set.
    const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || '';
    const supabaseKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '';

    return {
        base: '/',
        define: {
            'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
            'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseKey),
        },
        build: {
            outDir: 'dist',
            target: 'es2022',
            sourcemap: false,
        },
        server: { port: 5173 },
        preview: { port: 4173, headers: vercelHeaders },
        test: {
            environment: 'node',
            include: ['src/**/*.test.ts'],
        },
    };
});

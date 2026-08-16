/**
 * Generates js/config.js from environment variables (used on Vercel/build).
 * Set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel → Settings → Environment Variables.
 * (Gemini key is intentionally NOT included - it lives in the scan-books
 * Supabase Edge Function secret, never in the browser.)
 */
const fs = require('fs');
const path = require('path');

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_ANON_KEY || '';
const outPath = path.join(__dirname, '..', 'js', 'config.js');

// On Vercel env is set; locally skip overwriting if no env so we don't wipe manual config.js
if (!url && !key && fs.existsSync(outPath)) {
    console.log('Keeping existing js/config.js (no env vars set)');
    return;
}

const content = `/**
 * App config (auto-generated at build from env vars)
 */
window.SUPABASE_URL = ${JSON.stringify(url)};
window.SUPABASE_ANON_KEY = ${JSON.stringify(key)};
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, content, 'utf8');
console.log('Wrote js/config.js from env (SUPABASE_URL set:', !!url, ')');

import '@phosphor-icons/web/regular';
import '@phosphor-icons/web/fill';
import '@phosphor-icons/web/duotone';
import './styles/index.css';

import { createRepository } from './data/index.ts';
import { startShell } from './ui/shell.js';
import { html, setHtml } from './ui/dom.js';
import { icon } from './ui/icons.js';

const root = document.getElementById('app');

function hideSplash() {
    const splash = document.getElementById('splash');
    if (!splash) return;
    splash.classList.add('is-gone');
    setTimeout(() => splash.remove(), 400);
}

function fatal(title, text) {
    setHtml(root, html`<main class="auth"><section class="auth__card auth__card--center">
        <div class="empty__art">${icon('plugs', 'duotone')}</div>
        <h1 class="page-title">${title}</h1><p class="muted">${text}</p>
        <button class="btn btn--primary" id="retry">إعادة المحاولة</button>
    </section></main>`);
    document.getElementById('retry').addEventListener('click', () => location.reload());
}

async function boot() {
    try {
        const repo = await createRepository();
        await repo.start();
        startShell(root, repo);
        if (import.meta.env.DEV) window.__repo = repo;
    } catch (err) {
        console.error(err);
        if (err?.message === 'CONFIG_MISSING') {
            fatal('الإعداد غير مكتمل', 'أضف VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY في ملف .env.local ثم أعد التشغيل.');
        } else {
            fatal('تعذر الاتصال بالخادم', 'تحقق من اتصال الإنترنت ثم أعد المحاولة.');
        }
    } finally {
        hideSplash();
    }
}

boot();

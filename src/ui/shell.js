/**
 * App shell: auth gate, navigation (side rail on desktop, floating pill bar on
 * phones), hash router and page lifecycle.
 */
import { html, setHtml, $, $$, delegate, formValues } from './dom.js';
import { icon } from './icons.js';
import { openSheet, closeAllSheets, toast, toastError, withBusy } from './overlay.js';
import { PAGES, NAV_GROUPS, MOBILE_TABS } from './pages/index.js';
import { setCategoryOrder } from './components.js';

const ROLE_LABEL = { admin: 'مدير', librarian: 'أمين المكتبة', viewer: 'مشاهد', pending: 'بانتظار الموافقة' };

export function startShell(root, repo) {
    let current = null; // { id, instance }
    let unsubscribe = null;
    let detach = () => {}; // root-level listeners of the current screen

    const app = {
        repo,
        go(path) {
            if (location.hash === `#${path}`) route();
            else location.hash = path;
        },
        get canEdit() { return repo.canEdit; },
        get isAdmin() { return repo.isAdmin; },
        /** Shared state that survives page switches (filters, scroll…). */
        memory: {},
    };

    function renderGate() {
        closeAllSheets();
        current?.instance?.destroy?.();
        current = null;
        detach();
        if (!repo.user) return renderLogin();
        if (!repo.hasAccess) return renderPending();
        renderLayout();
        route();
    }

    // ------------------------------------------------------------------ login
    function renderLogin() {
        document.body.dataset.screen = 'login';
        setHtml(root, html`
            <main class="auth">
                <div class="auth__art" aria-hidden="true">
                    <div class="shelf">
                        ${[62, 78, 54, 88, 70, 46, 82, 66, 58].map((h, i) => html`<span style="--h:${h}%;--i:${i}"></span>`)}
                    </div>
                </div>
                <section class="auth__card">
                    <div class="brand brand--lg">${icon('book-open-text', 'duotone')}<div><strong>مكتبة المصباح</strong><span>نظام إدارة الكتب والإعارة</span></div></div>
                    <form class="stack" data-action="auth:login" novalidate>
                        <label class="field">
                            <span class="field__label">البريد الإلكتروني</span>
                            <input class="input" type="email" name="email" autocomplete="username" required dir="ltr" inputmode="email">
                        </label>
                        <label class="field">
                            <span class="field__label">كلمة المرور</span>
                            <input class="input" type="password" name="password" autocomplete="current-password" required dir="ltr">
                        </label>
                        <button class="btn btn--primary btn--block btn--lg" type="submit">${icon('sign-in')} دخول</button>
                        <button class="btn btn--link" type="button" data-action="auth:forgot">نسيت كلمة المرور؟</button>
                    </form>
                </section>
            </main>`);
        detach = delegate(root, {
            'auth:login': async (form) => {
                const { email, password } = formValues(form);
                if (!email || !password) return toast('أدخل البريد الإلكتروني وكلمة المرور', 'error');
                await withBusy(form.querySelector('[type=submit]'), () => repo.signIn(email, password));
            },
            'auth:forgot': () => forgotPassword($('input[name=email]', root)?.value || ''),
        }, ['click', 'submit']);
    }

    function forgotPassword(prefill) {
        openSheet({
            title: 'استعادة كلمة المرور',
            size: 'sm',
            body: html`
                <form class="stack" data-action="reset:send">
                    <p class="muted">سنرسل رابطاً لتعيين كلمة مرور جديدة إلى بريدك.</p>
                    <label class="field"><span class="field__label">البريد الإلكتروني</span>
                        <input class="input" type="email" name="email" value="${prefill}" required dir="ltr"></label>
                    <button class="btn btn--primary btn--block" type="submit">إرسال الرابط</button>
                </form>`,
            onMount(panel, close) {
                delegate(panel, {
                    'reset:send': (form) => withBusy(form.querySelector('button'), async () => {
                        await repo.sendPasswordReset(formValues(form).email, location.origin + location.pathname);
                        toast('تم إرسال الرابط', 'success', { detail: 'راجع صندوق الوارد واتبع الرابط.' });
                        close();
                    }),
                }, ['submit']);
            },
        });
    }

    function renderPending() {
        document.body.dataset.screen = 'login';
        setHtml(root, html`
            <main class="auth">
                <section class="auth__card auth__card--center">
                    <div class="empty__art">${icon('hourglass-medium', 'duotone')}</div>
                    <h1 class="page-title">حسابك بانتظار الموافقة</h1>
                    <p class="muted">سجّلت الدخول بـ <b dir="ltr">${repo.user.email}</b>. يرجى إبلاغ مدير المكتبة ليمنحك الصلاحية المناسبة، ثم أعد تحميل الصفحة.</p>
                    <div class="form-actions">
                        <button class="btn btn--ghost" data-action="pending:out">${icon('sign-out')} خروج</button>
                        <button class="btn btn--primary" data-action="pending:retry">${icon('arrow-clockwise')} تحقق مجدداً</button>
                    </div>
                </section>
            </main>`);
        detach = delegate(root, {
            'pending:out': () => repo.signOut(),
            'pending:retry': () => location.reload(),
        });
    }

    // ----------------------------------------------------------------- layout
    function navLink(p, { mobile = false } = {}) {
        return html`<a href="#${p.path}" class="${mobile ? 'tab' : 'nav__link'}" data-page="${p.id}">
            <span class="nav__icon">${icon(p.icon)}${icon(p.icon, 'fill')}</span><span>${mobile ? p.short || p.title : p.title}</span></a>`;
    }

    function visible(p) {
        return !(p.requires === 'edit' && !repo.canEdit);
    }

    function renderLayout() {
        document.body.dataset.screen = 'app';
        const user = repo.user;
        const tabs = MOBILE_TABS.map((id) => PAGES[id]);
        setHtml(root, html`
            <div class="layout">
                <aside class="rail" aria-label="القائمة الرئيسية">
                    <div class="brand">${icon('book-open-text', 'duotone')}<div><strong>مكتبة المصباح</strong><span>${ROLE_LABEL[repo.role]}</span></div></div>
                    <nav class="nav">
                        ${NAV_GROUPS.map((g) => html`
                            <div class="nav__group">
                                ${g.label ? html`<p class="nav__label">${g.label}</p>` : ''}
                                ${g.pages.map((id) => PAGES[id]).filter(visible).map((p) => navLink(p))}
                            </div>`)}
                    </nav>
                    <div class="rail__foot">
                        <div class="me"><span class="avatar">${(user.email || '?')[0].toUpperCase()}</span><span dir="ltr" class="me__mail">${user.email}</span></div>
                        <button class="icon-btn" data-action="shell:logout" aria-label="خروج" title="خروج">${icon('sign-out')}</button>
                    </div>
                </aside>

                <div class="main">
                    <header class="topbar">
                        <div class="topbar__center">
                            <span class="topbar__logo">${icon('book-open-text', 'duotone')}</span>
                            <strong id="topbar-title">مكتبة المصباح</strong>
                            <button class="icon-btn icon-btn--sm" data-action="shell:search" aria-label="بحث" id="topbar-search">${icon('magnifying-glass')}</button>
                        </div>
                    </header>
                    <main id="page" class="page" tabindex="-1"></main>
                </div>

                <nav class="tabbar" aria-label="التنقل">
                    ${tabs.slice(0, 2).map((p) => navLink(p, { mobile: true }))}
                    ${repo.canEdit
                        ? html`<button class="tab tab--fab" data-action="shell:quick" aria-label="إضافة">${icon('plus')}</button>`
                        : ''}
                    ${tabs.slice(2).map((p) => navLink(p, { mobile: true }))}
                    <button class="tab" data-action="shell:more" data-page="more"><span class="nav__icon">${icon('dots-nine')}${icon('dots-nine', 'fill')}</span><span>المزيد</span></button>
                </nav>
            </div>`);

        detach = delegate(root, {
            'shell:logout': () => logout(),
            'shell:search': () => { app.memory.focusSearch = true; app.go('/books'); },
            'shell:more': () => openMore(),
            'shell:quick': () => openQuick(),
        });
    }

    async function logout() {
        try { await repo.signOut(); } catch (err) { toastError(err); }
    }

    function openMore() {
        const pages = Object.values(PAGES).filter((p) => !MOBILE_TABS.includes(p.id) && visible(p) && !p.hidden);
        openSheet({
            title: 'كل الأقسام',
            body: html`
                <div class="more-grid">
                    ${pages.map((p) => html`<a class="more-tile" href="#${p.path}" data-action="more:go">${icon(p.icon, 'duotone')}<span>${p.title}</span></a>`)}
                </div>
                <div class="more-foot">
                    <span class="muted" dir="ltr">${repo.user.email}</span>
                    <button class="btn btn--ghost btn--sm" data-action="more:logout">${icon('sign-out')} خروج</button>
                </div>`,
            actions: {
                'more:go': (_el, _ev, close) => close(),
                'more:logout': (_el, _ev, close) => { close(); logout(); },
            },
        });
    }

    function openQuick() {
        const items = [
            { path: '/books/new', icon: 'plus-circle', title: 'إضافة كتاب', text: 'إدخال يدوي للبيانات' },
            { path: '/scan', icon: 'camera', title: 'مسح بالكاميرا', text: 'صوّر الغلاف ودع الذكاء الاصطناعي يملأ البيانات' },
            { path: '/loans?new=1', icon: 'hand-arrow-down', title: 'إعارة جديدة', text: 'سجّل خروج كتاب لعضو' },
            { path: '/diary?new=1', icon: 'note-pencil', title: 'يومية جديدة', text: 'ضيف، صيانة، شراء…' },
        ];
        openSheet({
            title: 'ماذا تريد أن تفعل؟',
            body: html`<div class="quick-list">${items.map((i) => html`
                <a class="quick" href="#${i.path}" data-action="quick:go">
                    <span class="quick__icon">${icon(i.icon, 'duotone')}</span>
                    <span><strong>${i.title}</strong><small>${i.text}</small></span>
                    ${icon('caret-left')}
                </a>`)}</div>`,
            actions: { 'quick:go': (_el, _ev, close) => close() },
        });
    }

    // ----------------------------------------------------------------- router
    function parseHash() {
        const h = location.hash.replace(/^#/, '') || '/';
        const [path, query = ''] = h.split('?');
        return { path, params: new URLSearchParams(query) };
    }

    function route() {
        if (!repo.user || !repo.hasAccess) return;
        const { path, params } = parseHash();
        const page = Object.values(PAGES).find((p) => p.path === path) || PAGES.dashboard;
        if (!visible(page)) return app.go('/');
        closeAllSheets();
        current?.instance?.destroy?.();

        $$('[data-page]', root).forEach((a) => {
            const on = a.dataset.page === page.id || Boolean(page.tab && a.dataset.page === page.tab);
            a.classList.toggle('is-active', on);
            if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
        });
        if (!MOBILE_TABS.includes(page.tab || page.id)) $('[data-page="more"]', root)?.classList.add('is-active');

        // Fresh element per page so listeners a page added never leak into the next one.
        const prev = $('#page', root);
        const host = prev.cloneNode(false);
        prev.replaceWith(host);
        host.dataset.page = page.id;
        document.body.dataset.page = page.id;
        document.title = `${page.title} · مكتبة المصباح`;
        // Phones: the app bar carries the page name (the in-page title is hidden there).
        const isHome = page.id === 'dashboard';
        $('#topbar-title', root).textContent = isHome ? 'مكتبة المصباح' : page.title;
        $('.topbar', root).classList.toggle('topbar--page', !isHome);
        const instance = page.mount(host, app, params);
        current = { id: page.id, instance };
        host.classList.remove('page--enter');
        void host.offsetWidth;
        host.classList.add('page--enter');
        window.scrollTo({ top: 0 });
    }

    window.addEventListener('hashchange', route);

    repo.subscribe((topic) => {
        if (topic === 'all' || topic === 'taxonomy') setCategoryOrder(repo.categories);
        if (topic === 'auth') return renderGate();
        if (topic === 'all') {
            // Re-render the whole page after a full reload.
            if (current) route();
            return;
        }
        current?.instance?.update?.(topic);
    });

    setCategoryOrder(repo.categories);
    unsubscribe = () => window.removeEventListener('hashchange', route);
    renderGate();
    return { app, stop: () => unsubscribe?.() };
}

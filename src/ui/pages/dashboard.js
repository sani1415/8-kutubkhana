import { html, setHtml, delegate, $, debounce, fmtNumber, fmtDate, fmtHijri, fmtWeekday, daysSince, todayIso } from '../dom.js';
import { icon } from '../icons.js';
import { spineColor, emptyState, bookCard } from '../components.js';
import { missingFields, filterBooks, sortBooks } from '../../data/rules.ts';
import { bookDrawers, openBookEditor } from './books.js';

const OVERDUE_DAYS = 14;
const BARS_FIRST = 60; // categories drawn at first; the rest arrive as the panel scrolls
const BARS_STEP = 120;
const BOOKS_STEP = 100; // books drawn per step in the home list

function barItem([name, n], i, maxCat) {
    return html`
        <li><button class="bar" data-action="cat:open" data-cat="${name}" style="--w:${Math.max(3, Math.round((n / maxCat) * 100))}%;--c:${spineColor(name)};--i:${Math.min(i, 14)}">
            <span class="bar__name">${name}</span>
            <span class="bar__track"><span class="bar__fill"></span></span>
            <span class="bar__num">${fmtNumber(n)}</span>
        </button></li>`;
}

/** Run `more` whenever a scrolling list nears its end. */
function onNearEnd(list, more) {
    list.addEventListener('scroll', () => {
        if (list.scrollTop + list.clientHeight >= list.scrollHeight - 300) more();
    }, { passive: true });
}

/**
 * Home: KPI tiles, then two equal panels — all categories and the book list
 * (shelf order, searchable) — that scroll inside themselves so the page itself
 * never scrolls. Phones show one panel at a time behind a two-tab strip.
 * The frame is drawn once; data changes only refresh numbers and lists, so the
 * search text, scroll position and an open drawer survive.
 */
export function mountDashboard(host, app) {
    const { repo } = app;
    let tab = 0;
    let q = app.memory.homeQ || '';
    const today = todayIso();

    setHtml(host, html`
        <header class="hello">
            <p class="hello__date">${fmtWeekday(today)} · ${fmtDate(today)} <span>${fmtHijri(today)}</span></p>
            ${app.canEdit ? html`
            <div class="page-actions desktop-only">
                <a class="btn btn--ghost btn--sm" href="#/scan">${icon('camera')} مسح</a>
                <a class="btn btn--ghost btn--sm" href="#/loans?new=1">${icon('hand-arrow-up')} إعارة</a>
                <a class="btn btn--primary btn--sm" href="#/books/new">${icon('plus')} إضافة كتاب</a>
            </div>` : ''}
        </header>

        <section class="kpis" id="kpis" aria-label="أرقام المكتبة"></section>

        <nav class="dash-tabs" role="tablist" aria-label="أقسام اللوحة">
            <button role="tab" data-action="dash:tab" data-i="0" class="is-on">الأقسام <small id="tab-cats"></small></button>
            <button role="tab" data-action="dash:tab" data-i="1">الكتب <small id="tab-books"></small></button>
        </nav>
        <section class="dash-panels" id="dash-panels">
            <article class="card panel">
                <header class="panel__head"><h2>${icon('stack', 'duotone')} الأقسام</h2><a href="#/categories" id="cats-link"></a></header>
                <div class="panel__body" id="cats-body"></div>
            </article>
            <article class="card panel panel--books">
                <header class="panel__head"><h2>${icon('books', 'duotone')} الكتب</h2><a href="#/books">كل الكتب ${icon('caret-left')}</a></header>
                <label class="search search--sm">${icon('magnifying-glass')}<input type="search" id="home-q" placeholder="ابحث بالعنوان أو المؤلف أو الموقع…" value="${q}" autocomplete="off"></label>
                <div class="panel__scroll home-books" id="home-books"></div>
            </article>
        </section>`);

    const booksEl = $('#home-books', host);
    const drawers = bookDrawers(app, booksEl);

    // ------------------------------------------------------------- KPIs
    function renderKpis() {
        const s = repo.stats();
        const overdue = repo.activeLoans().filter((l) => daysSince(l.loanDate) > OVERDUE_DAYS).length;
        const monthAgo = Date.now() - 30 * 864e5;
        const added = repo.books.filter((b) => b.createdAt && Date.parse(b.createdAt) >= monthAgo).length;
        const incomplete = repo.books.filter((b) => missingFields(b).some((f) => ['cabinet', 'publisher', 'author'].includes(f))).length;
        const health = s.books ? Math.round(((s.books - incomplete) / s.books) * 100) : 100;
        const kpis = [
            { href: '#/books', icon: 'books', num: s.books, label: 'كتاباً', tone: 'main' },
            { href: '#/books?sort=new', icon: 'calendar-plus', num: added, label: 'أُضيف خلال 30 يوماً', tone: 'ok' },
            { href: '#/loans', icon: 'hand-arrow-up', num: s.activeLoans, label: 'معار الآن', sub: overdue ? `${fmtNumber(overdue)} متأخرة` : '', tone: 'loan' },
            { href: '#/members', icon: 'users-three', num: s.members, label: 'عضواً' },
            { href: '#/authors', icon: 'feather', num: s.authors, label: 'مؤلفاً' },
        ];
        setHtml($('#kpis', host), html`
            ${kpis.map((k, i) => html`
                <a class="kpi ${k.tone ? `kpi--${k.tone}` : ''}" href="${k.href}" style="--i:${i}">
                    <span class="kpi__icon">${icon(k.icon, 'duotone')}</span>
                    <span class="kpi__num">${fmtNumber(k.num)}</span>
                    <span class="kpi__label">${k.label}${k.sub ? html` <b>${k.sub}</b>` : ''}</span>
                </a>`)}
            <a class="kpi kpi--ring" href="#/reports" style="--i:5">
                <span class="mini-ring" style="--p:${health}"><span>${fmtNumber(health)}%</span></span>
                <span class="kpi__label">مكتملة${incomplete ? html` <b>${fmtNumber(incomplete)} ناقص</b>` : ''}</span>
            </a>`);
        $('#tab-books', host).textContent = fmtNumber(s.books);
    }

    // -------------------------------------------------------- categories
    function renderCats() {
        const cats = [...repo.countBy('category')].sort((a, b) => b[1] - a[1]);
        const maxCat = cats[0]?.[1] || 1;
        setHtml($('#cats-link', host), html`${fmtNumber(cats.length)} قسماً ${icon('caret-left')}`);
        $('#tab-cats', host).textContent = fmtNumber(cats.length);
        const body = $('#cats-body', host);
        if (!cats.length) return setHtml(body, emptyState({ title: 'لا توجد أقسام' }));
        setHtml(body, html`<ul class="bars panel__scroll" id="bars">${cats.slice(0, BARS_FIRST).map((c, i) => barItem(c, i, maxCat))}</ul>`);
        const bars = $('#bars', host);
        let shown = BARS_FIRST;
        onNearEnd(bars, () => {
            if (shown >= cats.length) return;
            const next = cats.slice(shown, shown + BARS_STEP);
            bars.insertAdjacentHTML('beforeend', next.map((c) => String(barItem(c, 0, maxCat))).join(''));
            shown += next.length;
        });
    }

    // --------------------------------------------------------- book list
    function renderBooks() {
        const rows = sortBooks(filterBooks(repo.books, { q }), 'location');
        const keepScroll = booksEl.scrollTop;
        if (!rows.length) {
            setHtml(booksEl, emptyState({ iconName: 'magnifying-glass', title: repo.books.length ? 'لا نتائج' : 'لا توجد كتب بعد' }));
            return;
        }
        setHtml(booksEl, html`<div class="book-grid"></div>`);
        const grid = booksEl.firstElementChild;
        let shown = 0;
        const add = () => {
            const next = rows.slice(shown, shown + BOOKS_STEP);
            if (!next.length) return;
            grid.insertAdjacentHTML('beforeend', next.map((b) => String(bookCard(repo, b, { canEdit: app.canEdit }))).join(''));
            shown += next.length;
        };
        add();
        // After a save, refill up to where the reader was so the list does not jump.
        while (booksEl.scrollHeight < keepScroll + booksEl.clientHeight && shown < rows.length) add();
        booksEl.scrollTop = keepScroll;
        booksEl.onscroll = () => {
            if (booksEl.scrollTop + booksEl.clientHeight >= booksEl.scrollHeight - 300) add();
        };
        drawers.reopen();
    }

    $('#home-q', host).addEventListener('input', debounce((e) => {
        q = e.target.value;
        app.memory.homeQ = q;
        booksEl.scrollTop = 0;
        renderBooks();
    }, 140));

    // ----------------------------------------------------------- tabs
    const panels = $('#dash-panels', host);
    // Distance between two panels (width + gap). RTL scrolls with negative scrollLeft.
    const panelStep = () => Math.max(1, panels.clientWidth + (parseFloat(getComputedStyle(panels).columnGap) || 0));
    function showTab(i) {
        if (i === tab) return;
        tab = i;
        host.querySelectorAll('[data-action="dash:tab"]').forEach((b) => b.classList.toggle('is-on', Number(b.dataset.i) === i));
    }
    const sync = () => showTab(Math.round(Math.abs(panels.scrollLeft) / panelStep()));
    panels.addEventListener('scroll', sync, { passive: true });
    panels.addEventListener('scrollend', sync);

    const off = delegate(host, {
        'dash:tab': (el) => {
            const i = Number(el.dataset.i);
            showTab(i);
            panels.scrollTo({ left: -i * panelStep(), behavior: 'smooth' });
        },
        'cat:open': (el) => app.go(`/books?category=${encodeURIComponent(el.dataset.cat)}`),
        'book:open': (el, ev) => {
            if (ev.target.closest('input,button:not([data-action="book:open"])')) return;
            drawers.open(el);
        },
        'book:edit': (el, ev) => { ev.stopPropagation(); openBookEditor(app, el.dataset.id); },
    });

    // Mouse wheel scrolls whichever panel the pointer is over, header included,
    // without clicking into it first (the page itself never scrolls).
    host.addEventListener('wheel', (e) => {
        const list = e.target.closest('.panel')?.querySelector('.panel__scroll');
        if (!list || e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
        e.preventDefault();
        const unit = e.deltaMode === 1 ? 18 : e.deltaMode === 2 ? list.clientHeight : 1;
        list.scrollTop += e.deltaY * unit;
    }, { passive: false });

    renderKpis();
    renderCats();
    renderBooks();

    return {
        update(topic) {
            if (['books', 'loans', 'members'].includes(topic)) renderKpis();
            if (topic === 'books' || topic === 'taxonomy') renderCats();
            if (topic === 'books' || topic === 'loans') renderBooks();
        },
        destroy() { off(); drawers.destroy(); },
    };
}

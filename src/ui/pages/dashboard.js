import { html, setHtml, delegate, fmtNumber, fmtDate, fmtHijri, fmtWeekday, daysSince, todayIso } from '../dom.js';
import { icon } from '../icons.js';
import { spineColor, emptyState } from '../components.js';
import { missingFields } from '../../data/rules.ts';

const OVERDUE_DAYS = 14;
const RECENT = 30;
const BARS_FIRST = 60; // categories drawn at first; the rest arrive as the panel scrolls
const BARS_STEP = 120;

function barItem([name, n], i, maxCat) {
    return html`
        <li><button class="bar" data-action="cat:open" data-cat="${name}" style="--w:${Math.max(3, Math.round((n / maxCat) * 100))}%;--c:${spineColor(name)};--i:${Math.min(i, 14)}">
            <span class="bar__name">${name}</span>
            <span class="bar__track"><span class="bar__fill"></span></span>
            <span class="bar__num">${fmtNumber(n)}</span>
        </button></li>`;
}

/**
 * Home: KPI tiles, then two equal panels (all categories, recently added)
 * that scroll inside themselves so the page itself never scrolls.
 * Phones show one panel at a time behind a two-tab strip (tap or swipe).
 */
export function mountDashboard(host, app) {
    const { repo } = app;
    let tab = 0;

    function render() {
        const s = repo.stats();
        const today = todayIso();
        const cats = [...repo.countBy('category')].sort((a, b) => b[1] - a[1]);
        const maxCat = cats[0]?.[1] || 1;
        const overdue = repo.activeLoans().filter((l) => daysSince(l.loanDate) > OVERDUE_DAYS).length;
        const recent = repo.books.slice(0, RECENT);
        const monthAgo = Date.now() - 30 * 864e5;
        const addedThisMonth = repo.books.filter((b) => b.createdAt && Date.parse(b.createdAt) >= monthAgo).length;
        const incomplete = repo.books.filter((b) => missingFields(b).some((f) => ['cabinet', 'publisher', 'author'].includes(f))).length;
        const health = s.books ? Math.round(((s.books - incomplete) / s.books) * 100) : 100;

        const kpis = [
            { href: '#/books', icon: 'books', num: s.books, label: 'كتاباً', tone: 'main' },
            { href: '#/books?sort=new', icon: 'calendar-plus', num: addedThisMonth, label: 'أُضيف خلال 30 يوماً', tone: 'ok' },
            { href: '#/loans', icon: 'hand-arrow-up', num: s.activeLoans, label: 'معار الآن', sub: overdue ? `${fmtNumber(overdue)} متأخرة` : '', tone: 'loan' },
            { href: '#/members', icon: 'users-three', num: s.members, label: 'عضواً' },
            { href: '#/authors', icon: 'feather', num: s.authors, label: 'مؤلفاً' },
        ];

        const catsPanel = html`
            <article class="card panel">
                <header class="panel__head"><h2>${icon('stack', 'duotone')} الأقسام</h2><a href="#/categories">${fmtNumber(cats.length)} قسماً ${icon('caret-left')}</a></header>
                ${cats.length ? html`<ul class="bars panel__scroll" id="bars">${cats.slice(0, BARS_FIRST).map((c, i) => barItem(c, i, maxCat))}</ul>` : emptyState({ title: 'لا توجد أقسام' })}
            </article>`;

        const recentPanel = html`
            <article class="card panel">
                <header class="panel__head"><h2>${icon('sparkle', 'duotone')} أُضيف مؤخراً</h2><a href="#/books">الكتب ${icon('caret-left')}</a></header>
                ${recent.length ? html`<ul class="rows panel__scroll">${recent.map((b) => html`
                    <li class="row">
                        <span class="row__spine" style="--spine:${spineColor(b.category)}"></span>
                        <div class="row__main"><strong>${b.name}</strong><small>${b.author} · ${b.category}</small></div>
                    </li>`)}</ul>` : emptyState({ title: 'المكتبة فارغة' })}
            </article>`;

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

            <section class="kpis" aria-label="أرقام المكتبة">
                ${kpis.map((k, i) => html`
                    <a class="kpi ${k.tone ? `kpi--${k.tone}` : ''}" href="${k.href}" style="--i:${i}">
                        <span class="kpi__icon">${icon(k.icon, 'duotone')}</span>
                        <span class="kpi__num">${fmtNumber(k.num)}</span>
                        <span class="kpi__label">${k.label}${k.sub ? html` <b>${k.sub}</b>` : ''}</span>
                    </a>`)}
                <a class="kpi kpi--ring" href="#/reports" style="--i:5">
                    <span class="mini-ring" style="--p:${health}"><span>${fmtNumber(health)}%</span></span>
                    <span class="kpi__label">مكتملة${incomplete ? html` <b>${fmtNumber(incomplete)} ناقص</b>` : ''}</span>
                </a>
            </section>

            <nav class="dash-tabs" role="tablist" aria-label="أقسام اللوحة">
                ${[['الأقسام', cats.length], ['أُضيف مؤخراً', 0]].map(([label, n], i) => html`
                    <button role="tab" data-action="dash:tab" data-i="${i}" class="${tab === i ? 'is-on' : ''}">${label}${n ? html` <small>${fmtNumber(n)}</small>` : ''}</button>`)}
            </nav>
            <section class="dash-panels" id="dash-panels">
                ${catsPanel}
                ${recentPanel}
            </section>`);

        // Fewer nodes on screen keeps sheets and page changes smooth on phones.
        const bars = host.querySelector('#bars');
        if (bars && cats.length > BARS_FIRST) {
            let shown = BARS_FIRST;
            const more = () => {
                if (shown >= cats.length || bars.scrollTop + bars.clientHeight < bars.scrollHeight - 300) return;
                const next = cats.slice(shown, shown + BARS_STEP);
                bars.insertAdjacentHTML('beforeend', next.map((c) => String(barItem(c, 0, maxCat))).join(''));
                shown += next.length;
            };
            bars.addEventListener('scroll', more, { passive: true });
        }

        const panels = host.querySelector('#dash-panels');
        if (tab) panels.scrollTo({ left: -tab * panelStep(panels), behavior: 'instant' });
        const sync = () => showTab(Math.round(Math.abs(panels.scrollLeft) / panelStep(panels)));
        panels.addEventListener('scroll', sync, { passive: true });
        panels.addEventListener('scrollend', sync);
    }

    // Distance between two panels (width + gap). RTL scrolls with negative scrollLeft.
    const panelStep = (panels) => Math.max(1, panels.clientWidth + (parseFloat(getComputedStyle(panels).columnGap) || 0));

    function showTab(i) {
        if (i === tab) return;
        tab = i;
        host.querySelectorAll('[data-action="dash:tab"]').forEach((b) => b.classList.toggle('is-on', Number(b.dataset.i) === i));
    }

    const off = delegate(host, {
        'dash:tab': (el) => {
            const panels = host.querySelector('#dash-panels');
            const i = Number(el.dataset.i);
            showTab(i);
            panels.scrollTo({ left: -i * panelStep(panels), behavior: 'smooth' });
        },
        'cat:open': (el) => app.go(`/books?category=${encodeURIComponent(el.dataset.cat)}`),
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

    render();
    return { update: render, destroy: off };
}

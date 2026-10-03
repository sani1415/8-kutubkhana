import { html, setHtml, delegate, fmtNumber, fmtDate, fmtHijri, fmtWeekday, fmtRelative, daysSince, todayIso } from '../dom.js';
import { icon } from '../icons.js';
import { spineColor, emptyState } from '../components.js';
import { withBusy, toast } from '../overlay.js';
import { missingFields } from '../../data/rules.ts';

const OVERDUE_DAYS = 14;
const TOP_CATEGORIES = 8;

function greeting() {
    const h = new Date().getHours();
    if (h < 11) return 'صباح الخير';
    if (h < 17) return 'أهلاً بك';
    return 'مساء الخير';
}

export function mountDashboard(host, app) {
    const { repo } = app;
    let tab = 0; // phones: which panel (categories / loans / recent) is in view

    function render() {
        const s = repo.stats();
        const today = todayIso();
        const cats = [...repo.countBy('category')].sort((a, b) => b[1] - a[1]);
        const maxCat = cats[0]?.[1] || 1;
        const active = repo.activeLoans().sort((a, b) => (a.loanDate || '').localeCompare(b.loanDate || ''));
        const overdue = active.filter((l) => daysSince(l.loanDate) > OVERDUE_DAYS).length;
        const recent = repo.books.slice(0, 6);
        const incomplete = repo.books.filter((b) => missingFields(b).some((f) => ['cabinet', 'publisher', 'author'].includes(f))).length;
        const health = s.books ? Math.round(((s.books - incomplete) / s.books) * 100) : 100;

        const kpis = [
            { href: '#/books', icon: 'books', num: s.books, label: 'كتاباً', sub: `${fmtNumber(s.copies)} نسخة`, tone: 'main' },
            { href: '#/books?status=متاح', icon: 'check-circle', num: s.available, label: 'متاح', tone: 'ok' },
            { href: '#/loans', icon: 'hand-arrow-up', num: s.activeLoans, label: 'معار الآن', sub: overdue ? `${fmtNumber(overdue)} متأخرة` : '', tone: 'loan' },
            { href: '#/members', icon: 'users-three', num: s.members, label: 'عضواً' },
            { href: '#/authors', icon: 'feather', num: s.authors, label: 'مؤلفاً' },
        ];

        const loansCard = html`
            <article class="card panel">
                <header class="panel__head"><h2>${icon('hand-arrow-up', 'duotone')} المعارة الآن</h2><a href="#/loans">الكل ${icon('caret-left')}</a></header>
                ${active.length ? html`<ul class="rows">${active.slice(0, 6).map((l) => {
                    const b = repo.book(l.bookId);
                    const m = repo.member(l.memberId);
                    const late = daysSince(l.loanDate) > OVERDUE_DAYS;
                    return html`<li class="row">
                        <span class="row__avatar ${late ? 'is-late' : ''}">${(m?.name || '؟').trim()[0]}</span>
                        <div class="row__main">
                            <strong>${b?.name || 'كتاب محذوف'}</strong>
                            <small>${m?.name || 'عضو محذوف'} · <span class="${late ? 'text-late' : ''}">${fmtRelative(l.loanDate)}</span></small>
                        </div>
                        ${app.canEdit ? html`<button class="icon-btn icon-btn--sm" data-action="loan:return" data-id="${l.id}" title="إرجاع" aria-label="إرجاع">${icon('arrow-u-down-left')}</button>` : ''}
                    </li>`;
                })}</ul>` : emptyState({ iconName: 'hand-heart', title: 'لا توجد إعارات نشطة' })}
            </article>`;

        const recentCard = html`
            <article class="card panel">
                <header class="panel__head"><h2>${icon('sparkle', 'duotone')} أُضيف مؤخراً</h2><a href="#/books">الكتب ${icon('caret-left')}</a></header>
                ${recent.length ? html`<ul class="rows">${recent.map((b) => html`
                    <li class="row">
                        <span class="row__spine" style="--spine:${spineColor(b.category)}"></span>
                        <div class="row__main"><strong>${b.name}</strong><small>${b.author} · ${b.category}</small></div>
                    </li>`)}</ul>` : emptyState({ title: 'المكتبة فارغة' })}
            </article>`;

        const catsCard = html`
            <article class="card panel">
                <header class="panel__head"><h2>${icon('stack', 'duotone')} أكبر الأقسام</h2><a href="#/categories">${fmtNumber(cats.length)} قسماً ${icon('caret-left')}</a></header>
                ${cats.length ? html`<ul class="bars">${cats.slice(0, TOP_CATEGORIES).map(([name, n], i) => html`
                    <li><button class="bar" data-action="cat:open" data-cat="${name}" style="--w:${Math.max(4, Math.round((n / maxCat) * 100))}%;--c:${spineColor(name)};--i:${i}" title="${name}">
                        <span class="bar__name">${name}</span>
                        <span class="bar__track"><span class="bar__fill"></span></span>
                        <span class="bar__num">${fmtNumber(n)}</span>
                    </button></li>`)}</ul>` : emptyState({ title: 'لا توجد أقسام' })}
            </article>`;

        setHtml(host, html`
            <header class="hello">
                <div>
                    <h1 class="page-title">${greeting()}</h1>
                    <p class="hello__date">${fmtWeekday(today)} · ${fmtDate(today)} <span>${fmtHijri(today)}</span></p>
                </div>
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
                ${[['الأقسام', cats.length], ['المعارة', active.length], ['الجديدة', recent.length]].map(([label, n], i) => html`
                    <button role="tab" data-action="dash:tab" data-i="${i}" class="${tab === i ? 'is-on' : ''}">${label}${n ? html` <small>${fmtNumber(n)}</small>` : ''}</button>`)}
            </nav>
            <section class="dash-panels" id="dash-panels">
                ${catsCard}
                ${loansCard}
                ${recentCard}
            </section>`);

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
        'loan:return': (el) => withBusy(el, async () => {
            await repo.returnLoan(el.dataset.id);
            toast('تم تسجيل الإرجاع');
        }),
    });

    render();
    return { update: render, destroy: off };
}

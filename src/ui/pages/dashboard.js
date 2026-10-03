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

            <section class="kpis slider" aria-label="أرقام المكتبة">
                ${kpis.map((k, i) => html`
                    <a class="kpi ${k.tone ? `kpi--${k.tone}` : ''}" href="${k.href}" style="--i:${i}">
                        <span class="kpi__icon">${icon(k.icon, 'duotone')}</span>
                        <span class="kpi__num">${fmtNumber(k.num)}</span>
                        <span class="kpi__label">${k.label}${k.sub ? html` <b>${k.sub}</b>` : ''}</span>
                    </a>`)}
                <a class="kpi kpi--ring" href="#/reports" style="--i:5">
                    <span class="mini-ring" style="--p:${health}"><span>${fmtNumber(health)}%</span></span>
                    <span class="kpi__label">اكتمال البيانات${incomplete ? html` <b>${fmtNumber(incomplete)} ناقص</b>` : ''}</span>
                </a>
            </section>

            <section class="dash-grid">
                <article class="card panel">
                    <header class="panel__head"><h2>${icon('stack', 'duotone')} أكبر الأقسام</h2><a href="#/categories">${fmtNumber(cats.length)} قسماً ${icon('caret-left')}</a></header>
                    ${cats.length ? html`<ul class="bars">${cats.slice(0, TOP_CATEGORIES).map(([name, n], i) => html`
                        <li><button class="bar" data-action="cat:open" data-cat="${name}" style="--w:${Math.max(4, Math.round((n / maxCat) * 100))}%;--c:${spineColor(name)};--i:${i}" title="${name}">
                            <span class="bar__name">${name}</span>
                            <span class="bar__track"><span class="bar__fill"></span></span>
                            <span class="bar__num">${fmtNumber(n)}</span>
                        </button></li>`)}</ul>` : emptyState({ title: 'لا توجد أقسام' })}
                </article>
                <div class="slider slider--panels" aria-label="الإعارات والكتب الجديدة">
                    ${loansCard}
                    ${recentCard}
                </div>
            </section>`);
    }

    const off = delegate(host, {
        'cat:open': (el) => app.go(`/books?category=${encodeURIComponent(el.dataset.cat)}`),
        'loan:return': (el) => withBusy(el, async () => {
            await repo.returnLoan(el.dataset.id);
            toast('تم تسجيل الإرجاع');
        }),
    });

    render();
    return { update: render, destroy: off };
}

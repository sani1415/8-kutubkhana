import { html, setHtml, delegate, fmtNumber, fmtDate, fmtHijri, fmtWeekday, fmtRelative, daysSince, todayIso } from '../dom.js';
import { icon } from '../icons.js';
import { spineColor, emptyState } from '../components.js';
import { withBusy, toast } from '../overlay.js';
import { missingFields } from '../../data/rules.ts';

const OVERDUE_DAYS = 14;

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
        const active = repo.activeLoans()
            .sort((a, b) => (a.loanDate || '').localeCompare(b.loanDate || ''))
            .slice(0, 6);
        const overdue = repo.activeLoans().filter((l) => daysSince(l.loanDate) > OVERDUE_DAYS).length;
        const recent = repo.books.slice(0, 5);
        const incomplete = repo.books.filter((b) => missingFields(b).some((f) => ['cabinet', 'publisher', 'author'].includes(f))).length;
        const health = s.books ? Math.round(((s.books - incomplete) / s.books) * 100) : 100;

        setHtml(host, html`
            <header class="hello">
                <div>
                    <p class="hello__date">${fmtWeekday(today)} · ${fmtDate(today)} <span>${fmtHijri(today)}</span></p>
                    <h1 class="page-title">${greeting()}</h1>
                </div>
                ${app.canEdit ? html`
                <div class="page-actions desktop-only">
                    <a class="btn btn--ghost" href="#/scan">${icon('camera')} مسح بالكاميرا</a>
                    <a class="btn btn--primary" href="#/books/new">${icon('plus')} إضافة كتاب</a>
                </div>` : ''}
            </header>

            <section class="bento">
                <article class="card card--hero">
                    <div class="hero__top">
                        <div>
                            <p class="eyebrow">مجموع الكتب</p>
                            <p class="hero__num" data-count="${s.books}">${fmtNumber(s.books)}</p>
                            <p class="muted">${fmtNumber(s.copies)} نسخة في ${fmtNumber(s.categories)} قسماً</p>
                        </div>
                        <a class="btn btn--soft btn--sm" href="#/books">${icon('books')} تصفح</a>
                    </div>
                    ${cats.length ? html`
                    <div class="shelf-viz" role="list" aria-label="الأقسام حسب عدد الكتب">
                        ${cats.slice(0, 14).map(([name, n], i) => html`
                            <button class="spine" role="listitem" data-action="cat:open" data-cat="${name}"
                                style="--h:${Math.max(28, Math.round((n / maxCat) * 100))}%;--c:${spineColor(name)};--i:${i}"
                                title="${name}: ${fmtNumber(n)}">
                                <span class="spine__label">${name}</span>
                                <span class="spine__count">${fmtNumber(n)}</span>
                            </button>`)}
                    </div>` : ''}
                </article>

                <a class="card stat stat--ok" href="#/books?status=متاح">
                    <span class="stat__icon">${icon('check-circle', 'duotone')}</span>
                    <span class="stat__num">${fmtNumber(s.available)}</span>
                    <span class="stat__label">متاح للإعارة</span>
                </a>
                <a class="card stat stat--loan" href="#/loans">
                    <span class="stat__icon">${icon('hand-arrow-up', 'duotone')}</span>
                    <span class="stat__num">${fmtNumber(s.activeLoans)}</span>
                    <span class="stat__label">إعارة نشطة${overdue ? html` · <b>${fmtNumber(overdue)} متأخرة</b>` : ''}</span>
                </a>
                <a class="card stat" href="#/members">
                    <span class="stat__icon">${icon('users-three', 'duotone')}</span>
                    <span class="stat__num">${fmtNumber(s.members)}</span>
                    <span class="stat__label">عضواً</span>
                </a>
                <a class="card stat" href="#/authors">
                    <span class="stat__icon">${icon('feather', 'duotone')}</span>
                    <span class="stat__num">${fmtNumber(s.authors)}</span>
                    <span class="stat__label">مؤلفاً</span>
                </a>

                <article class="card card--list card--loans">
                    <header class="card__head">
                        <h2>الكتب المعارة الآن</h2>
                        <a class="btn btn--link btn--sm" href="#/loans">الكل ${icon('caret-left')}</a>
                    </header>
                    ${active.length ? html`<ul class="rows">
                        ${active.map((l) => {
                            const b = repo.book(l.bookId);
                            const m = repo.member(l.memberId);
                            const late = daysSince(l.loanDate) > OVERDUE_DAYS;
                            return html`<li class="row">
                                <span class="row__avatar ${late ? 'is-late' : ''}">${(m?.name || '؟').trim()[0]}</span>
                                <div class="row__main">
                                    <strong>${b?.name || 'كتاب محذوف'}</strong>
                                    <small>${m?.name || 'عضو محذوف'} · <span class="${late ? 'text-late' : ''}">${fmtRelative(l.loanDate)}</span></small>
                                </div>
                                ${app.canEdit ? html`<button class="btn btn--soft btn--sm" data-action="loan:return" data-id="${l.id}">${icon('arrow-u-down-left')} إرجاع</button>` : ''}
                            </li>`;
                        })}
                    </ul>` : emptyState({ iconName: 'hand-heart', title: 'لا توجد إعارات نشطة', text: 'كل الكتب في أماكنها.' })}
                </article>

                <article class="card card--list">
                    <header class="card__head">
                        <h2>أُضيف مؤخراً</h2>
                        <a class="btn btn--link btn--sm" href="#/books">الكتب ${icon('caret-left')}</a>
                    </header>
                    ${recent.length ? html`<ul class="rows">${recent.map((b) => html`
                        <li class="row">
                            <span class="row__spine" style="--spine:${spineColor(b.category)}"></span>
                            <div class="row__main"><strong>${b.name}</strong><small>${b.author} · ${b.category}</small></div>
                        </li>`)}</ul>` : emptyState({ title: 'المكتبة فارغة', text: 'ابدأ بإضافة أول كتاب.' })}
                </article>

                <a class="card card--health" href="#/reports">
                    <div class="ring" style="--p:${health}">
                        <span>${fmtNumber(health)}<small>%</small></span>
                    </div>
                    <div>
                        <h2>اكتمال البيانات</h2>
                        <p class="muted">${incomplete ? html`${fmtNumber(incomplete)} كتاباً بلا مؤلف أو دار نشر أو موقع` : 'كل الكتب مكتملة البيانات الأساسية'}</p>
                    </div>
                </a>
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

import { html, setHtml, delegate, $, $$, debounce, fmtNumber, fmtDate, fmtRelative, daysSince, formValues, todayIso } from '../dom.js';
import { icon } from '../icons.js';
import { emptyState, mountPicker, pageHeader, pager, paginate } from '../components.js';
import { openSheet, confirmAction, toast, withBusy } from '../overlay.js';
import { foldText } from '../../data/rules.ts';

const OVERDUE_DAYS = 14;
const PAGE_SIZE = 30;

export function mountLoans(host, app, params) {
    const { repo } = app;
    const state = app.memory.loans || { tab: 'active', q: '', page: 1 };
    app.memory.loans = state;

    setHtml(host, html`
        ${pageHeader({
            title: 'الإعارات',
            subtitle: 'من استعار ماذا ومتى',
            actions: app.canEdit ? html`<button class="btn btn--primary" data-action="loan:new">${icon('hand-arrow-up')} إعارة جديدة</button>` : '',
        })}
        <div class="toolbar">
            <div class="segmented" role="tablist">
                ${[['active', 'معارة الآن'], ['late', 'متأخرة'], ['returned', 'مُرجعة'], ['all', 'الكل']].map(([v, l]) => html`
                    <button role="tab" data-action="loans:tab" data-value="${v}" class="${state.tab === v ? 'is-on' : ''}">${l} <small data-count="${v}"></small></button>`)}
            </div>
            <label class="search">${icon('magnifying-glass')}<input type="search" id="loans-q" placeholder="ابحث باسم الكتاب أو العضو" value="${state.q}"></label>
        </div>
        <section id="loans-list"></section>
        <div id="loans-pager"></div>`);

    function rows() {
        const q = foldText(state.q).trim();
        return repo.loans.filter((l) => {
            const late = l.status === 'معار' && daysSince(l.loanDate) > OVERDUE_DAYS;
            if (state.tab === 'active' && l.status !== 'معار') return false;
            if (state.tab === 'returned' && l.status === 'معار') return false;
            if (state.tab === 'late' && !late) return false;
            if (!q) return true;
            return foldText(`${repo.book(l.bookId)?.name} ${repo.member(l.memberId)?.name}`).includes(q);
        });
    }

    function render() {
        const counts = {
            active: repo.loans.filter((l) => l.status === 'معار').length,
            late: repo.loans.filter((l) => l.status === 'معار' && daysSince(l.loanDate) > OVERDUE_DAYS).length,
            returned: repo.loans.filter((l) => l.status !== 'معار').length,
            all: repo.loans.length,
        };
        $$('[data-count]', host).forEach((el) => { el.textContent = fmtNumber(counts[el.dataset.count]); });
        const list = rows();
        const p = paginate(list, state.page, PAGE_SIZE);
        state.page = p.page;
        if (!list.length) {
            setHtml($('#loans-list', host), emptyState({
                iconName: 'hand-heart',
                title: state.tab === 'late' ? 'لا توجد إعارات متأخرة' : 'لا توجد إعارات هنا',
                text: state.tab === 'active' ? 'عندما تعير كتاباً سيظهر هنا حتى يُرجع.' : '',
            }));
            setHtml($('#loans-pager', host), '');
            return;
        }
        setHtml($('#loans-list', host), html`<ul class="loan-list">${p.slice.map((l, i) => {
            const b = repo.book(l.bookId);
            const m = repo.member(l.memberId);
            const days = daysSince(l.loanDate);
            const active = l.status === 'معار';
            const late = active && days > OVERDUE_DAYS;
            return html`<li class="loan ${late ? 'loan--late' : ''} ${active ? '' : 'loan--done'}" style="--i:${Math.min(i, 10)}">
                <span class="loan__avatar">${(m?.name || '؟').trim()[0]}</span>
                <div class="loan__main">
                    <strong>${b?.name || 'كتاب محذوف'}</strong>
                    <span>${m?.name || 'عضو محذوف'}${m?.phone ? html` · <a href="tel:${m.phone}" dir="ltr">${m.phone}</a>` : ''}</span>
                    <small>${fmtDate(l.loanDate)}${active ? html` · <b class="${late ? 'text-late' : ''}">${fmtRelative(l.loanDate)}</b>` : ` ← أُرجع ${fmtDate(l.returnDate)}`}</small>
                </div>
                <div class="loan__actions">
                    ${active && app.canEdit ? html`<button class="btn btn--soft btn--sm" data-action="loan:return" data-id="${l.id}">${icon('arrow-u-down-left')} إرجاع</button>` : ''}
                    ${!active ? html`<span class="chip chip--quiet">مُرجع</span>` : ''}
                    ${app.canEdit ? html`<button class="icon-btn icon-btn--sm" data-action="loan:delete" data-id="${l.id}" aria-label="حذف السجل">${icon('trash')}</button>` : ''}
                </div>
            </li>`;
        })}</ul>`);
        setHtml($('#loans-pager', host), pager({ ...p, prefix: 'loans' }));
    }

    $('#loans-q', host).addEventListener('input', debounce((e) => { state.q = e.target.value; state.page = 1; render(); }));

    const off = delegate(host, {
        'loans:tab': (el) => {
            state.tab = el.dataset.value; state.page = 1;
            $$('[data-action="loans:tab"]', host).forEach((b) => b.classList.toggle('is-on', b === el));
            render();
        },
        'loans:prev': () => { state.page--; render(); },
        'loans:next': () => { state.page++; render(); },
        'loan:new': () => openNewLoan(app),
        'loan:return': (el) => withBusy(el, async () => {
            await repo.returnLoan(el.dataset.id);
            toast('تم تسجيل الإرجاع');
        }),
        'loan:delete': async (el) => {
            const ok = await confirmAction({ title: 'حذف السجل', message: 'حذف سجل الإعارة هذا؟ إن كانت الإعارة نشطة سيعود الكتاب متاحاً.', confirmLabel: 'حذف', danger: true });
            if (ok) await withBusy(el, async () => { await repo.deleteLoan(el.dataset.id); toast('تم حذف السجل'); });
        },
    });

    render();
    if (params.get('new') && app.canEdit) {
        history.replaceState(null, '', '#/loans');
        setTimeout(() => openNewLoan(app, params.get('book')), 60);
    }
    return { update: render, destroy: off };
}

export function openNewLoan(app, bookId = '') {
    const { repo } = app;
    if (!repo.members.length) {
        toast('أضف عضواً أولاً', 'info', { detail: 'الإعارة تحتاج إلى عضو مسجل.' });
        app.go('/members');
        return;
    }
    const books = repo.books.map((b) => {
        const { left, copies } = repo.availability(b);
        return { id: b.id, label: b.name, sub: `${b.author} · ${b.cabinet || ''}${b.shelf ? '/' + b.shelf : ''}`, disabled: left < 1, left, copies };
    });
    const members = repo.members.map((m) => ({ id: m.id, label: m.name, sub: m.address || m.phone }));
    openSheet({
        title: 'إعارة جديدة',
        body: html`
            <form class="stack" data-action="loan:save">
                <div class="field"><span class="field__label">الكتاب<b>*</b></span><div id="pick-book"></div></div>
                <div class="field"><span class="field__label">العضو<b>*</b></span><div id="pick-member"></div></div>
                <label class="field"><span class="field__label">تاريخ الإعارة</span><input class="input" type="date" name="loanDate" value="${todayIso()}" max="${todayIso()}"></label>
                <div class="form-actions">
                    <button type="button" class="btn btn--ghost" data-action="sheet:close">إلغاء</button>
                    <button type="submit" class="btn btn--primary">${icon('check')} تسجيل الإعارة</button>
                </div>
            </form>`,
        onMount(panel, close) {
            mountPicker(panel.querySelector('#pick-book'), {
                name: 'bookId', items: books, placeholder: 'ابحث عن الكتاب…', selectedId: bookId,
                describe: (i) => (i.disabled ? '<em class="chip chip--loaned">كل النسخ معارة</em>' : `<em class="chip chip--ok">${i.left}/${i.copies}</em>`),
            });
            mountPicker(panel.querySelector('#pick-member'), { name: 'memberId', items: members, placeholder: 'ابحث عن العضو…' });
            delegate(panel, {
                'loan:save': (form) => withBusy(form.querySelector('[type=submit]'), async () => {
                    const v = formValues(form);
                    await repo.lend(v.bookId, v.memberId, v.loanDate);
                    toast('تمت الإعارة', 'success', { detail: `${repo.book(v.bookId)?.name} ← ${repo.member(v.memberId)?.name}` });
                    close();
                }),
            }, ['submit']);
        },
    });
}

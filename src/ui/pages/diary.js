import { html, setHtml, delegate, $, fmtDate, fmtHijri, fmtWeekday, formValues, todayIso } from '../dom.js';
import { icon } from '../icons.js';
import { emptyState, pageHeader } from '../components.js';
import { openSheet, confirmAction, toast, withBusy } from '../overlay.js';

const KINDS = [
    { v: 'ضيف', icon: 'handshake', cls: 'guest' },
    { v: 'صيانة', icon: 'wrench', cls: 'fix' },
    { v: 'شراء', icon: 'shopping-bag', cls: 'buy' },
    { v: 'أخرى', icon: 'note', cls: 'other' },
];
const kind = (v) => KINDS.find((k) => k.v === v) || KINDS[3];

function kindPicker(selected = 'أخرى') {
    return html`<div class="kind-picker" role="radiogroup" aria-label="النوع">${KINDS.map((k) => html`
        <label class="kind kind--${k.cls}"><input type="radio" name="category" value="${k.v}" ${k.v === selected ? 'checked' : ''}>${icon(k.icon)}<span>${k.v}</span></label>`)}</div>`;
}

export function mountDiary(host, app, params) {
    const { repo } = app;

    function render() {
        const groups = new Map();
        for (const d of [...repo.diary].sort((a, b) => b.date.localeCompare(a.date))) {
            if (!groups.has(d.date)) groups.set(d.date, []);
            groups.get(d.date).push(d);
        }
        setHtml(host, html`
            ${pageHeader({ title: 'يوميات المكتبة', subtitle: 'ما حدث في المكتبة يوماً بيوم' })}
            ${app.canEdit ? html`
            <form class="card composer" data-action="diary:add">
                ${kindPicker()}
                <textarea class="input" name="content" rows="2" placeholder="ماذا حدث اليوم في المكتبة؟" required></textarea>
                <div class="composer__foot">
                    <input class="input input--sm" type="date" name="date" value="${todayIso()}" max="${todayIso()}" aria-label="التاريخ">
                    <button class="btn btn--primary" type="submit">${icon('paper-plane-tilt')} تسجيل</button>
                </div>
            </form>` : ''}
            ${groups.size ? html`<div class="timeline">${[...groups].map(([date, items]) => html`
                <section class="day">
                    <h2 class="day__head"><span>${fmtWeekday(date)} ${fmtDate(date)}</span><small>${fmtHijri(date)}</small></h2>
                    <ul>${items.map((d) => {
                        const k = kind(d.category);
                        return html`<li class="entry entry--${k.cls}">
                            <span class="entry__icon">${icon(k.icon, 'duotone')}</span>
                            <div class="entry__body"><span class="entry__kind">${d.category}</span><p>${d.content}</p></div>
                            ${app.canEdit ? html`<div class="entry__actions">
                                <button class="icon-btn icon-btn--sm" data-action="diary:edit" data-id="${d.id}" aria-label="تعديل">${icon('pencil-simple')}</button>
                                <button class="icon-btn icon-btn--sm" data-action="diary:delete" data-id="${d.id}" aria-label="حذف">${icon('trash')}</button>
                            </div>` : ''}
                        </li>`;
                    })}</ul>
                </section>`)}</div>`
            : emptyState({ iconName: 'notebook', title: 'لا توجد يوميات', text: 'سجّل زيارات الضيوف وأعمال الصيانة والمشتريات هنا.' })}`);
    }

    const off = delegate(host, {
        'diary:add': (form) => withBusy(form.querySelector('[type=submit]'), async () => {
            const v = formValues(form);
            await repo.addDiary({ category: v.category, content: v.content, date: v.date });
            toast('سُجّلت اليومية');
        }),
        'diary:edit': (el) => {
            const d = repo.diary.find((x) => x.id === el.dataset.id);
            if (!d) return;
            openSheet({
                title: 'تعديل اليومية',
                body: html`<form class="stack" data-action="diary:save">
                    ${kindPicker(d.category)}
                    <label class="field"><span class="field__label">التاريخ</span><input class="input" type="date" name="date" value="${d.date}"></label>
                    <textarea class="input" name="content" rows="4" required>${d.content}</textarea>
                    <div class="form-actions"><button type="button" class="btn btn--ghost" data-action="sheet:close">إلغاء</button><button class="btn btn--primary" type="submit">حفظ</button></div>
                </form>`,
                onMount(panel, close) {
                    delegate(panel, {
                        'diary:save': (form) => withBusy(form.querySelector('[type=submit]'), async () => {
                            await repo.updateDiary(d.id, formValues(form));
                            toast('تم الحفظ');
                            close();
                        }),
                    }, ['submit']);
                },
            });
        },
        'diary:delete': async (el) => {
            const ok = await confirmAction({ title: 'حذف اليومية', message: 'حذف هذا الإدخال؟', confirmLabel: 'حذف', danger: true });
            if (ok) await withBusy(el, async () => { await repo.deleteDiary(el.dataset.id); toast('تم الحذف'); });
        },
    }, ['click', 'submit']);

    render();
    if (params.get('new')) history.replaceState(null, '', '#/diary');
    if (params.get('new')) setTimeout(() => $('textarea[name=content]', host)?.focus(), 60);
    return { update: (t) => t === 'diary' && render(), destroy: off };
}

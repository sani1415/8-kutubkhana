import { html, setHtml, delegate, $, debounce, fmtNumber, formValues } from '../dom.js';
import { icon } from '../icons.js';
import { emptyState, pageHeader, field } from '../components.js';
import { openSheet, confirmAction, toast, withBusy } from '../overlay.js';
import { foldText } from '../../data/rules.ts';

export function mountMembers(host, app) {
    const { repo } = app;
    let q = '';

    setHtml(host, html`
        ${pageHeader({
            title: 'الأعضاء',
            subtitle: 'الطلاب والأساتذة الذين يستعيرون الكتب',
            actions: app.canEdit ? html`<button class="btn btn--primary" data-action="member:new">${icon('user-plus')} عضو جديد</button>` : '',
        })}
        <div class="toolbar"><label class="search">${icon('magnifying-glass')}<input type="search" id="members-q" placeholder="ابحث بالاسم أو الهاتف أو الفصل"></label></div>
        <section id="members-list"></section>`);

    function render() {
        const fq = foldText(q).trim();
        const active = repo.activeLoans();
        const list = repo.members.filter((m) => !fq || foldText(`${m.name} ${m.phone} ${m.address}`).includes(fq));
        if (!list.length) {
            setHtml($('#members-list', host), emptyState({
                iconName: 'users-three',
                title: repo.members.length ? 'لا نتائج' : 'لا يوجد أعضاء بعد',
                text: repo.members.length ? '' : 'أضف الطلاب والأساتذة لتتمكن من تسجيل الإعارات.',
            }));
            return;
        }
        setHtml($('#members-list', host), html`<div class="member-grid">${list.map((m, i) => {
            const mine = active.filter((l) => l.memberId === m.id);
            return html`<article class="card member" style="--i:${Math.min(i, 12)}">
                <span class="member__avatar">${m.name.trim()[0] || '؟'}</span>
                <div class="member__main">
                    <h3>${m.name}</h3>
                    <p class="muted">${[m.address, m.phone].filter(Boolean).join(' · ') || '—'}</p>
                    ${mine.length ? html`<p class="member__loans">${icon('book-bookmark')} ${mine.map((l) => repo.book(l.bookId)?.name || 'كتاب محذوف').join('، ')}</p>` : ''}
                </div>
                <div class="member__side">
                    ${mine.length ? html`<span class="chip chip--loaned">${fmtNumber(mine.length)} معار</span>` : ''}
                    ${app.canEdit ? html`
                        <button class="icon-btn icon-btn--sm" data-action="member:edit" data-id="${m.id}" aria-label="تعديل">${icon('pencil-simple')}</button>
                        <button class="icon-btn icon-btn--sm" data-action="member:delete" data-id="${m.id}" aria-label="حذف">${icon('trash')}</button>` : ''}
                </div>
            </article>`;
        })}</div>`);
    }

    $('#members-q', host).addEventListener('input', debounce((e) => { q = e.target.value; render(); }));

    const off = delegate(host, {
        'member:new': () => openMemberForm(app),
        'member:edit': (el) => openMemberForm(app, el.dataset.id),
        'member:delete': async (el) => {
            const m = repo.member(el.dataset.id);
            const ok = await confirmAction({ title: 'حذف العضو', message: `حذف «${m?.name}»؟ سيُحذف سجل إعاراته السابقة أيضاً.`, confirmLabel: 'حذف', danger: true });
            if (ok) await withBusy(el, async () => { await repo.deleteMembers([el.dataset.id]); toast('تم حذف العضو'); });
        },
    });

    render();
    return { update: (t) => ['members', 'loans', 'books'].includes(t) && render(), destroy: off };
}

function openMemberForm(app, id) {
    const { repo } = app;
    const m = id ? repo.member(id) : null;
    openSheet({
        title: m ? 'تعديل العضو' : 'عضو جديد',
        size: 'sm',
        body: html`
            <form class="stack" data-action="member:save">
                ${field({ label: 'الاسم', name: 'name', value: m?.name, required: true })}
                ${field({ label: 'رقم الهاتف', name: 'phone', value: m?.phone, type: 'tel', attrs: 'dir="ltr" inputmode="tel"' })}
                ${field({ label: 'الفصل / العنوان', name: 'address', value: m?.address, placeholder: 'مثال: الفصل الخامس' })}
                <div class="form-actions">
                    <button type="button" class="btn btn--ghost" data-action="sheet:close">إلغاء</button>
                    <button type="submit" class="btn btn--primary">${icon('check')} حفظ</button>
                </div>
            </form>`,
        onMount(panel, close) {
            panel.querySelector('input[name=name]').focus();
            delegate(panel, {
                'member:save': (form) => withBusy(form.querySelector('[type=submit]'), async () => {
                    const v = formValues(form);
                    if (m) await repo.updateMember(m.id, v); else await repo.addMember(v);
                    toast(m ? 'تم الحفظ' : 'أُضيف العضو');
                    close();
                }),
            }, ['submit']);
        },
    });
}

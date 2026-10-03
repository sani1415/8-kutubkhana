import { html, setHtml, delegate, $, debounce, fmtNumber, formValues } from '../dom.js';
import { icon } from '../icons.js';
import { emptyState, pageHeader, pager, paginate, spineColor } from '../components.js';
import { openSheet, confirmAction, toast, withBusy } from '../overlay.js';
import { foldText } from '../../data/rules.ts';

const KINDS = {
    category: {
        title: 'الأقسام', one: 'القسم', field: 'category', filter: 'category', icon: 'stack',
        list: (r) => r.categories, add: (r, n) => r.addCategory(n), rename: (r, o, n) => r.renameCategory(o, n), remove: (r, n) => r.deleteCategory(n),
    },
    publisher: {
        title: 'دور النشر', one: 'دار النشر', field: 'publisher', filter: 'publisher', icon: 'buildings',
        list: (r) => r.publishers, add: (r, n) => r.addPublisher(n), rename: (r, o, n) => r.renamePublisher(o, n), remove: (r, n) => r.deletePublisher(n),
    },
};

export function taxonomyPage(kindKey) {
    const K = KINDS[kindKey];
    return function mount(host, app) {
        const { repo } = app;
        let q = '';

        setHtml(host, html`
            ${pageHeader({
                title: K.title,
                subtitle: `اضغط على ${K.one} لعرض كتبه`,
                actions: app.canEdit ? html`
                    ${kindKey === 'publisher' ? html`<button class="btn btn--ghost" data-action="tax:sync" title="إضافة دور النشر المكتوبة في الكتب وغير الموجودة في القائمة">${icon('arrows-clockwise')} مزامنة من الكتب</button>` : ''}
                    <button class="btn btn--primary" data-action="tax:add">${icon('plus')} إضافة</button>` : '',
            })}
            <div class="toolbar"><label class="search">${icon('magnifying-glass')}<input type="search" id="tax-q" placeholder="بحث…"></label></div>
            <section id="tax-list"></section>`);

        function render() {
            const counts = repo.countBy(K.field);
            const fq = foldText(q).trim();
            const names = K.list(repo).filter((n) => !fq || foldText(n).includes(fq));
            const max = Math.max(1, ...names.map((n) => counts.get(n) || 0));
            if (!names.length) {
                setHtml($('#tax-list', host), emptyState({ iconName: K.icon, title: 'لا شيء هنا' }));
                return;
            }
            setHtml($('#tax-list', host), html`<ul class="tax-list">${names.map((n, i) => {
                const c = counts.get(n) || 0;
                return html`<li class="tax" style="--spine:${spineColor(n)};--w:${Math.round((c / max) * 100)}%;--i:${Math.min(i, 14)}">
                    <a class="tax__main" href="#/books?${K.filter}=${encodeURIComponent(n)}">
                        <span class="tax__name">${n}</span>
                        <span class="tax__bar" aria-hidden="true"></span>
                        <span class="tax__count">${fmtNumber(c)}</span>
                    </a>
                    ${app.canEdit ? html`<div class="tax__actions">
                        <button class="icon-btn icon-btn--sm" data-action="tax:rename" data-name="${n}" aria-label="إعادة تسمية">${icon('pencil-simple')}</button>
                        <button class="icon-btn icon-btn--sm" data-action="tax:delete" data-name="${n}" data-count="${c}" aria-label="حذف">${icon('trash')}</button>
                    </div>` : ''}
                </li>`;
            })}</ul>`);
        }

        $('#tax-q', host).addEventListener('input', debounce((e) => { q = e.target.value; render(); }));

        const nameForm = (title, value, onSave) => openSheet({
            title,
            size: 'sm',
            body: html`<form class="stack" data-action="tax:save">
                <label class="field"><span class="field__label">الاسم</span><input class="input" name="name" value="${value}" required></label>
                ${value ? html`<p class="note">${icon('info')} سيتغير الاسم في كل الكتب التابعة دفعة واحدة.</p>` : ''}
                <div class="form-actions"><button type="button" class="btn btn--ghost" data-action="sheet:close">إلغاء</button><button class="btn btn--primary" type="submit">حفظ</button></div>
            </form>`,
            onMount(panel, close) {
                panel.querySelector('input').select();
                delegate(panel, {
                    'tax:save': (form) => withBusy(form.querySelector('[type=submit]'), async () => { await onSave(formValues(form).name); close(); }),
                }, ['submit']);
            },
        });

        const off = delegate(host, {
            'tax:add': () => nameForm(`إضافة ${K.one}`, '', async (n) => { await K.add(repo, n); toast('تمت الإضافة'); }),
            'tax:rename': (el) => nameForm(`تعديل ${K.one}`, el.dataset.name, async (n) => { await K.rename(repo, el.dataset.name, n); toast('تم التعديل في كل الكتب'); }),
            'tax:delete': async (el) => {
                const c = Number(el.dataset.count);
                const ok = await confirmAction({
                    title: `حذف ${K.one}`,
                    message: c ? `«${el.dataset.name}» مستخدم في ${fmtNumber(c)} كتاباً. سيُحذف من القائمة فقط وتبقى الكتب كما هي.` : `حذف «${el.dataset.name}» من القائمة؟`,
                    confirmLabel: 'حذف', danger: true,
                });
                if (ok) await withBusy(el, async () => { await K.remove(repo, el.dataset.name); toast('تم الحذف'); });
            },
            'tax:sync': (el) => withBusy(el, async () => {
                const added = await repo.syncPublishersFromBooks();
                toast(added ? `أُضيفت ${fmtNumber(added)} دار نشر` : 'القائمة متطابقة مع الكتب', added ? 'success' : 'info');
            }),
        });

        render();
        return { update: (t) => ['taxonomy', 'books'].includes(t) && render(), destroy: off };
    };
}

export function mountAuthors(host, app) {
    const { repo } = app;
    const state = { q: '', page: 1 };
    setHtml(host, html`
        ${pageHeader({ title: 'المؤلفون', subtitle: 'مستخرجون تلقائياً من قائمة الكتب' })}
        <div class="toolbar"><label class="search">${icon('magnifying-glass')}<input type="search" id="authors-q" placeholder="ابحث عن مؤلف"></label></div>
        <section id="authors-list"></section>
        <div id="authors-pager"></div>`);

    function render() {
        const fq = foldText(state.q).trim();
        const all = repo.authors().filter((a) => !fq || foldText(a.name).includes(fq));
        const p = paginate(all, state.page, 60);
        state.page = p.page;
        setHtml($('#authors-list', host), all.length
            ? html`<div class="author-grid">${p.slice.map((a, i) => html`
                <a class="author" href="#/books?author=${encodeURIComponent(a.name)}" style="--i:${Math.min(i, 14)}">
                    <span class="author__mono">${a.name.replace(/^(ال|ابن |أبو |الإمام )/, '').trim()[0] || '؟'}</span>
                    <span class="author__name">${a.name}</span>
                    <span class="author__count">${fmtNumber(a.count)}</span>
                </a>`)}</div>`
            : emptyState({ iconName: 'feather', title: 'لا يوجد مؤلفون', text: 'تظهر الأسماء هنا عند إضافة الكتب.' }));
        setHtml($('#authors-pager', host), pager({ ...p, prefix: 'authors' }));
    }

    $('#authors-q', host).addEventListener('input', debounce((e) => { state.q = e.target.value; state.page = 1; render(); }));
    const off = delegate(host, {
        'authors:prev': () => { state.page--; render(); },
        'authors:next': () => { state.page++; render(); },
    });
    render();
    return { update: (t) => t === 'books' && render(), destroy: off };
}

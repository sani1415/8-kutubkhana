import { html, setHtml, delegate, $, debounce, fmtNumber, fmtDate, formValues } from '../dom.js';
import { icon } from '../icons.js';
import { emptyState, pageHeader, mountPicker, field, setupDropdown } from '../components.js';
import { openSheet, confirmAction, toast, withBusy } from '../overlay.js';
import { foldText } from '../../data/rules.ts';
import { openBookDetail } from './books.js';

const CATS = ['أخرى', 'خطابات', 'عقود', 'صور قديمة', 'مخطوطات'];
const CAT_ICON = { 'خطابات': 'envelope-simple', 'عقود': 'signature', 'صور قديمة': 'image', 'مخطوطات': 'scroll', 'أخرى': 'file-text' };

export function mountArchive(host, app, params) {
    const { repo } = app;
    const state = { q: '', cat: '' };

    setHtml(host, html`
        ${pageHeader({
            title: 'أرشيف الوثائق',
            subtitle: 'صور الوثائق والخطابات والمخطوطات، مع ربطها بالكتب',
            actions: app.canEdit ? html`<button class="btn btn--primary" data-action="doc:new">${icon('plus')} وثيقة جديدة</button>` : '',
        })}
        <div class="toolbar">
            <label class="search">${icon('magnifying-glass')}<input type="search" id="doc-q" placeholder="ابحث في العناوين والأوصاف"></label>
            <button type="button" class="btn btn--ghost btn--sm filter-btn phone-inline" id="doc-filter">${icon('funnel-simple')} <span id="doc-cat-label">الكل</span></button>
        </div>
        <div class="dropdown" id="doc-dd" aria-hidden="true"><div class="dropdown__inner"><div class="dropdown__body"><div class="choice-list" id="doc-choices"></div></div></div></div>
        <div class="chips-scroll hide-phone" id="doc-cats"></div>
        <section id="doc-list"></section>`);

    function render() {
        setHtml($('#doc-cats', host), html`
            <button class="pill ${!state.cat ? 'is-on' : ''}" data-action="doc:cat" data-value="">الكل</button>
            ${CATS.map((c) => html`<button class="pill ${state.cat === c ? 'is-on' : ''}" data-action="doc:cat" data-value="${c}">${c}</button>`)}`);
        setHtml($('#doc-choices', host), [['', 'الكل'], ...CATS.map((c) => [c, c])].map(([v, l]) => html`
            <button type="button" data-action="doc:cat" data-value="${v}" class="${state.cat === v ? 'is-on' : ''}">${l}</button>`));
        $('#doc-cat-label', host).textContent = state.cat || 'الكل';
        const fq = foldText(state.q).trim();
        const docs = repo.documents.filter((d) => (!state.cat || d.category === state.cat) && (!fq || foldText(`${d.title} ${d.description}`).includes(fq)));
        setHtml($('#doc-list', host), docs.length
            ? html`<div class="doc-grid">${docs.map((d, i) => html`
                <article class="card doc" data-action="doc:view" data-id="${d.id}" tabindex="0" style="--i:${Math.min(i, 12)}">
                    <span class="doc__icon">${icon(CAT_ICON[d.category] || 'file-text', 'duotone')}</span>
                    <h3>${d.title}</h3>
                    ${d.description ? html`<p class="muted">${d.description.slice(0, 110)}${d.description.length > 110 ? '…' : ''}</p>` : ''}
                    <footer class="doc__meta">
                        <span class="tag">${d.category}</span>
                        ${d.documentDate ? html`<span>${fmtDate(d.documentDate)}</span>` : ''}
                        <span>${icon('paperclip')} ${fmtNumber(d.filePaths.length)}</span>
                        ${d.bookId ? html`<span>${icon('book')} ${repo.book(d.bookId)?.name || ''}</span>` : ''}
                    </footer>
                </article>`)}</div>`
            : emptyState({ iconName: 'archive', title: 'لا توجد وثائق', text: 'احفظ صور الوثائق القديمة والخطابات هنا لتكون محفوظة وقابلة للبحث.' }));
    }

    const toggleDropdown = setupDropdown($('#doc-filter', host), $('#doc-dd', host));
    $('#doc-q', host).addEventListener('input', debounce((e) => { state.q = e.target.value; render(); }));

    const off = delegate(host, {
        'doc:cat': (el) => { state.cat = el.dataset.value; toggleDropdown(false); render(); },
        'doc:new': () => openDocForm(app),
        'doc:view': (el) => openDocView(app, el.dataset.id),
    });

    render();
    if (params.get('doc')) setTimeout(() => openDocView(app, params.get('doc')), 60);
    return { update: (t) => ['documents', 'books'].includes(t) && render(), destroy: off };
}

async function openDocView(app, id) {
    const { repo } = app;
    const d = repo.document(id);
    if (!d) return;
    openSheet({
        title: d.title,
        size: 'lg',
        body: html`
            ${d.description ? html`<p>${d.description}</p>` : ''}
            <div class="doc__meta"><span class="tag">${d.category}</span>${d.documentDate ? html`<span>${fmtDate(d.documentDate)}</span>` : ''}
                ${d.bookId ? html`<button type="button" class="pill" data-action="doc:book" data-id="${d.bookId}">${icon('book')} ${repo.book(d.bookId)?.name || ''}</button>` : ''}</div>
            <div class="doc-files" id="doc-files">${d.filePaths.length ? html`<div class="skeleton skeleton--img"></div>` : html`<p class="muted">لا توجد ملفات مرفقة.</p>`}</div>
            ${app.canEdit ? html`<div class="form-actions form-actions--split">
                <button class="btn btn--ghost btn--danger-text" data-action="docv:delete">${icon('trash')} حذف</button>
                <button class="btn btn--ghost" data-action="docv:edit">${icon('pencil-simple')} تعديل</button>
            </div>` : ''}`,
        async onMount(panel) {
            if (!d.filePaths.length) return;
            const urls = await Promise.all(d.filePaths.map((p) => repo.fileUrl(p)));
            const box = panel.querySelector('#doc-files');
            if (!box) return;
            setHtml(box, urls.map((u, i) => {
                if (!u) return html`<p class="muted">تعذر تحميل ملف.</p>`;
                return /\.pdf$/i.test(d.filePaths[i])
                    ? html`<a class="btn btn--soft" href="${u}" target="_blank" rel="noopener">${icon('file-pdf')} فتح PDF</a>`
                    : html`<a href="${u}" target="_blank" rel="noopener"><img src="${u}" alt="${d.title}" loading="lazy"></a>`;
            }));
        },
        actions: {
            'doc:book': (el, _ev, close) => { close(); setTimeout(() => openBookDetail(app, el.dataset.id), 220); },
            'docv:edit': (_e, _v, close) => { close(); setTimeout(() => openDocForm(app, id), 200); },
            'docv:delete': async (el, _v, close) => {
                const ok = await confirmAction({ title: 'حذف الوثيقة', message: `حذف «${d.title}» مع ملفاتها؟`, confirmLabel: 'حذف', danger: true });
                if (ok) await withBusy(el, async () => { await repo.deleteDocument(id); toast('تم الحذف'); close(); });
            },
        },
    });
}

function openDocForm(app, id) {
    const { repo } = app;
    const d = id ? repo.document(id) : null;
    const books = repo.books.map((b) => ({ id: b.id, label: b.name, sub: b.author }));
    openSheet({
        title: d ? 'تعديل الوثيقة' : 'وثيقة جديدة',
        size: 'lg',
        body: html`
            <form class="stack" data-action="doc:save">
                ${field({ label: 'العنوان', name: 'title', value: d?.title, required: true, placeholder: 'مثال: وقفية المكتبة' })}
                <label class="field"><span class="field__label">الوصف</span><textarea class="input" name="description" rows="2" placeholder="وصف قصير يساعد في البحث لاحقاً">${d?.description || ''}</textarea></label>
                <div class="form-grid">
                    <label class="field"><span class="field__label">النوع</span><select class="input" name="category">${CATS.map((c) => html`<option ${(d?.category || 'أخرى') === c ? 'selected' : ''}>${c}</option>`)}</select></label>
                    ${field({ label: 'تاريخ الوثيقة', name: 'documentDate', value: d?.documentDate || '', type: 'date' })}
                </div>
                <div class="field"><span class="field__label">ربط بكتاب (اختياري)</span><div id="doc-book"></div></div>
                ${d ? '' : html`
                <label class="drop">
                    ${icon('camera-plus', 'duotone')}
                    <span><strong>أضف صوراً أو ملفات PDF</strong><small id="doc-files-label">صوّر بالكاميرا أو اختر من الجهاز</small></span>
                    <input type="file" name="files" accept="image/*,.pdf" multiple>
                </label>`}
                <div class="form-actions"><button type="button" class="btn btn--ghost" data-action="sheet:close">إلغاء</button><button class="btn btn--primary" type="submit">${icon('check')} حفظ</button></div>
            </form>`,
        onMount(panel, close) {
            mountPicker(panel.querySelector('#doc-book'), { name: 'bookId', items: books, placeholder: 'ابحث عن كتاب…', selectedId: d?.bookId || '', allowClear: true });
            const fileInput = panel.querySelector('input[type=file]');
            fileInput?.addEventListener('change', () => {
                panel.querySelector('#doc-files-label').textContent = fileInput.files.length ? `${fileInput.files.length} ملف مختار` : 'صوّر بالكاميرا أو اختر من الجهاز';
            });
            delegate(panel, {
                'doc:save': (form) => withBusy(form.querySelector('[type=submit]'), async () => {
                    const v = formValues(form);
                    const input = { title: v.title, description: v.description || '', category: v.category, documentDate: v.documentDate || null, bookId: v.bookId || null };
                    if (d) {
                        await repo.updateDocument(d.id, input);
                        toast('تم الحفظ');
                    } else {
                        const { failedFiles } = await repo.addDocument(input, [...(fileInput?.files || [])]);
                        if (failedFiles) toast(`حُفظت الوثيقة لكن فشل رفع ${failedFiles} ملف`, 'error');
                        else toast('حُفظت الوثيقة');
                    }
                    close();
                }),
            }, ['submit']);
        },
    });
}

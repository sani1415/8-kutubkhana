import { html, setHtml, delegate, $, $$, debounce, fmtNumber, fmtBooks, fmtDate, formValues, download, todayIso } from '../dom.js';
import { icon } from '../icons.js';
import {
    bookCard, emptyState, pager, paginate, statusChip, locationBadge, bookFormFields, spineColor, mountPicker,
} from '../components.js';
import { openSheet, confirmAction, toast, toastError, withBusy } from '../overlay.js';
import { filterBooks, sortBooks, distinctCabinets, foldText, isBlank, booksToRows, toCSV, CSV_TEMPLATE } from '../../data/rules.ts';

const PAGE_SIZE = 40;
const TOP_CATEGORY_CHIPS = 24; // the rest are reachable from the filters sheet
const SORTS = [['location', 'حسب الموقع'], ['name', 'حسب العنوان'], ['new', 'الأحدث إضافة']];

const readPref = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
const savePref = (key, v) => { try { localStorage.setItem(key, v); } catch { /* private mode */ } };
const readView = () => readPref('ktb:books-view', 'cards');
const saveView = (v) => savePref('ktb:books-view', v);
const readSort = () => readPref('ktb:books-sort', 'location');

export function mountBooks(host, app, params) {
    const { repo } = app;
    const fromLink = ['category', 'status', 'author', 'publisher', 'cabinet'].some((k) => params.get(k));
    const state = app.memory.books && !fromLink
        ? app.memory.books
        : { q: '', status: '', category: '', author: '', publisher: '', cabinet: '', sort: readSort(), page: 1 };
    for (const k of ['category', 'status', 'author', 'publisher', 'cabinet']) {
        if (params.get(k)) state[k] = params.get(k);
    }
    app.memory.books = state;
    const selected = new Set();
    let view = readView();

    setHtml(host, html`
        <header class="page-head">
            <div>
                <h1 class="page-title">الكتب</h1>
                <p class="page-sub" id="books-count"></p>
            </div>
            <div class="page-actions">
                <button class="icon-btn" data-action="books:menu" aria-label="استيراد وتصدير" title="استيراد وتصدير">${icon('dots-three-outline')}</button>
                ${app.canEdit ? html`<a class="btn btn--primary desktop-only" href="#/books/new">${icon('plus')} إضافة كتاب</a>` : ''}
            </div>
        </header>

        <div class="toolbar">
            <label class="search">
                ${icon('magnifying-glass')}
                <input type="search" id="books-q" placeholder="ابحث بالعنوان، المؤلف، الناشر أو الموقع…" value="${state.q}" autocomplete="off">
            </label>
            <div class="segmented" role="tablist" aria-label="الحالة">
                ${[['', 'الكل'], ['متاح', 'متاح'], ['معار', 'معار']].map(([v, l]) => html`
                    <button role="tab" data-action="books:status" data-value="${v}" class="${state.status === v ? 'is-on' : ''}">${l}</button>`)}
            </div>
            <label class="sort-select" title="ترتيب الكتب">
                ${icon('sort-ascending')}
                <select id="books-sort" aria-label="الترتيب">
                    ${SORTS.map(([v, l]) => html`<option value="${v}" ${state.sort === v ? 'selected' : ''}>${l}</option>`)}
                </select>
            </label>
            <button class="btn btn--ghost btn--sm" data-action="books:filters" aria-label="فلاتر">${icon('sliders-horizontal')}<span class="hide-sm">فلاتر</span> <span class="badge" id="filter-badge" hidden></span></button>
            <div class="segmented desktop-only" aria-label="طريقة العرض">
                <button data-action="books:view" data-value="cards" class="${view === 'cards' ? 'is-on' : ''}" aria-label="بطاقات">${icon('squares-four')}</button>
                <button data-action="books:view" data-value="table" class="${view === 'table' ? 'is-on' : ''}" aria-label="جدول">${icon('rows')}</button>
            </div>
        </div>
        <div class="chips-scroll" id="cat-chips"></div>
        <div id="active-filters" class="active-filters"></div>
        <div id="bulk" class="bulk" hidden></div>
        <section id="books-list"></section>
        <div id="books-pager"></div>
        <input type="file" id="import-file" accept=".csv,.xlsx,.xls,.xlsm" hidden>`);

    const listEl = $('#books-list', host);
    const qInput = $('#books-q', host);
    if (app.memory.focusSearch) { app.memory.focusSearch = false; setTimeout(() => qInput.focus(), 50); }

    function currentRows() {
        return sortBooks(filterBooks(repo.books, state), state.sort);
    }

    function renderChips() {
        const counts = repo.countBy('category');
        const cats = [...counts].sort((a, b) => b[1] - a[1]);
        const top = cats.slice(0, TOP_CATEGORY_CHIPS);
        // Keep the chosen category visible even when it is not among the largest.
        if (state.category && !top.some(([c]) => c === state.category)) {
            top.unshift([state.category, counts.get(state.category) || 0]);
        }
        setHtml($('#cat-chips', host), html`
            <button class="pill ${!state.category ? 'is-on' : ''}" data-action="books:cat" data-value="">الكل</button>
            ${top.map(([c, n]) => html`<button class="pill ${state.category === c ? 'is-on' : ''}" data-action="books:cat" data-value="${c}" style="--spine:${spineColor(c)}">
                <i class="pill__dot"></i>${c}<small>${fmtNumber(n)}</small></button>`)}
            ${cats.length > TOP_CATEGORY_CHIPS ? html`<button class="pill" data-action="books:filters">${icon('dots-three')} كل الأقسام (${fmtNumber(cats.length)})</button>` : ''}`);
    }

    function renderActiveFilters() {
        const extra = [['author', 'المؤلف'], ['publisher', 'الناشر'], ['cabinet', 'الصندوق']].filter(([k]) => state[k]);
        $('#filter-badge', host).hidden = !extra.length;
        $('#filter-badge', host).textContent = extra.length;
        setHtml($('#active-filters', host), extra.map(([k, l]) => html`
            <button class="pill pill--filter" data-action="books:clear" data-key="${k}">${l}: ${state[k]} ${icon('x')}</button>`));
    }

    function renderList() {
        const rows = currentRows();
        const p = paginate(rows, state.page, PAGE_SIZE);
        state.page = p.page;
        $('#books-count', host).textContent = rows.length === repo.books.length
            ? `${fmtNumber(repo.books.length)} كتاباً في المكتبة`
            : `${fmtNumber(rows.length)} من ${fmtNumber(repo.books.length)} كتاباً`;

        if (!rows.length) {
            setHtml(listEl, repo.books.length
                ? emptyState({ iconName: 'magnifying-glass', title: 'لا نتائج', text: 'جرّب كلمة أخرى أو أزل بعض الفلاتر.', action: html`<button class="btn btn--soft" data-action="books:reset">إزالة الفلاتر</button>` })
                : emptyState({ title: 'لا توجد كتب بعد', text: 'أضف كتاباً يدوياً، أو صوّر الأغلفة، أو استورد ملف Excel.', action: app.canEdit ? html`<a class="btn btn--primary" href="#/books/new">${icon('plus')} إضافة كتاب</a>` : '' }));
            setHtml($('#books-pager', host), '');
            return;
        }

        // In location order, mark where each cabinet starts so a shelf reads as one block.
        const grouped = state.sort === 'location';
        const counts = grouped ? cabinetCounts(rows) : null;
        const startsGroup = (b, i) => grouped && (i === 0 || foldText(p.slice[i - 1].cabinet) !== foldText(b.cabinet));
        const groupLabel = (b) => html`${icon('archive-box')} ${isBlank(b.cabinet) ? 'بلا صندوق' : `الصندوق ${b.cabinet}`} <small>${fmtBooks(counts.get(foldText(b.cabinet)) || 0)}</small>`;

        const useTable = view === 'table' && matchMedia('(min-width: 900px)').matches;
        if (useTable) {
            setHtml(listEl, html`
                <div class="table-wrap">
                <table class="table">
                    <thead><tr>
                        ${app.canEdit ? html`<th class="col-check"><input type="checkbox" data-action="books:check-all" aria-label="تحديد الكل"></th>` : ''}
                        <th>#</th><th>اسم الكتاب</th><th>المؤلف</th><th>القسم</th><th>دار النشر</th><th>الأجزاء</th><th>الحالة</th><th>الموقع</th>
                        ${app.canEdit ? html`<th></th>` : ''}
                    </tr></thead>
                    <tbody>${p.slice.map((b, i) => html`
                        ${startsGroup(b, i) ? html`<tr class="group-row"><td colspan="${app.canEdit ? 10 : 8}">${groupLabel(b)}</td></tr>` : ''}
                        <tr data-action="book:open" data-id="${b.id}" class="${selected.has(b.id) ? 'is-selected' : ''}">
                            ${app.canEdit ? html`<td class="col-check"><input type="checkbox" data-action="books:check" data-id="${b.id}" ${selected.has(b.id) ? 'checked' : ''} aria-label="تحديد"></td>` : ''}
                            <td class="num">${fmtNumber(p.from + i)}</td>
                            <td><span class="t-spine" style="--spine:${spineColor(b.category)}"></span><strong>${b.name}</strong></td>
                            <td>${b.author}</td>
                            <td>${b.category}</td>
                            <td>${b.publisher || html`<span class="muted">—</span>`}</td>
                            <td class="num">${fmtNumber(b.parts)}</td>
                            <td>${statusChip(repo, b)}</td>
                            <td>${locationBadge(b)}</td>
                            ${app.canEdit ? html`<td><button class="icon-btn icon-btn--sm" data-action="book:edit" data-id="${b.id}" aria-label="تعديل">${icon('pencil-simple')}</button></td>` : ''}
                        </tr>`)}
                    </tbody>
                </table></div>`);
        } else {
            setHtml(listEl, html`<div class="book-grid">${p.slice.map((b, i) => html`
                ${startsGroup(b, i) ? html`<h2 class="group-head">${groupLabel(b)}</h2>` : ''}
                ${bookCard(repo, b, { canEdit: app.canEdit, index: i })}`)}</div>`);
        }
        setHtml($('#books-pager', host), pager({ ...p, prefix: 'books' }));
        renderBulk();
    }

    function renderBulk() {
        const bulk = $('#bulk', host);
        bulk.hidden = selected.size === 0;
        setHtml(bulk, html`<span>${fmtNumber(selected.size)} محدد</span>
            <button class="btn btn--ghost btn--sm" data-action="books:unselect">إلغاء التحديد</button>
            <button class="btn btn--danger btn--sm" data-action="books:bulk-delete">${icon('trash')} حذف المحدد</button>`);
    }

    function renderAll() {
        renderChips();
        renderActiveFilters();
        renderList();
    }

    const go = (patch) => { Object.assign(state, patch, { page: patch.page ?? 1 }); renderAll(); };

    qInput.addEventListener('input', debounce(() => go({ q: qInput.value }), 140));
    $('#books-sort', host).addEventListener('change', (e) => {
        savePref('ktb:books-sort', e.target.value);
        go({ sort: e.target.value });
    });

    const off = delegate(host, {
        'books:status': (el) => {
            $$('[data-action="books:status"]', host).forEach((b) => b.classList.toggle('is-on', b === el));
            go({ status: el.dataset.value });
        },
        'books:cat': (el) => go({ category: el.dataset.value }),
        'books:clear': (el) => go({ [el.dataset.key]: '' }),
        'books:reset': () => {
            qInput.value = '';
            $$('[data-action="books:status"]', host).forEach((b) => b.classList.toggle('is-on', b.dataset.value === ''));
            go({ q: '', status: '', category: '', author: '', publisher: '', cabinet: '' });
        },
        'books:view': (el) => {
            view = el.dataset.value;
            saveView(view);
            $$('[data-action="books:view"]', host).forEach((b) => b.classList.toggle('is-on', b === el));
            renderList();
        },
        'books:prev': () => { state.page--; renderList(); host.scrollIntoView({ behavior: 'smooth' }); },
        'books:next': () => { state.page++; renderList(); host.scrollIntoView({ behavior: 'smooth' }); },
        'books:filters': () => openFilters(app, state, () => renderAll()),
        'books:menu': () => openBooksMenu(app, host),
        'book:open': (el, ev) => {
            if (ev.target.closest('input,button:not([data-action="book:open"])')) return;
            openBookDetail(app, el.dataset.id);
        },
        'book:edit': (el, ev) => { ev.stopPropagation(); openBookEditor(app, el.dataset.id); },
        'books:check': (el, ev) => {
            ev.stopPropagation();
            if (el.checked) selected.add(el.dataset.id); else selected.delete(el.dataset.id);
            el.closest('tr')?.classList.toggle('is-selected', el.checked);
            renderBulk();
        },
        'books:check-all': (el) => {
            $$('[data-action="books:check"]', host).forEach((c) => {
                c.checked = el.checked;
                if (el.checked) selected.add(c.dataset.id); else selected.delete(c.dataset.id);
                c.closest('tr')?.classList.toggle('is-selected', el.checked);
            });
            renderBulk();
        },
        'books:unselect': () => { selected.clear(); renderList(); },
        'books:bulk-delete': async (el) => {
            const ok = await confirmAction({ title: 'حذف الكتب المحددة', message: `سيتم حذف ${fmtNumber(selected.size)} كتاباً نهائياً.`, confirmLabel: 'حذف', danger: true });
            if (!ok) return;
            await withBusy(el, async () => {
                await repo.deleteBooks([...selected]);
                toast(`تم حذف ${fmtNumber(selected.size)} كتاباً`);
                selected.clear();
            });
        },
    });

    host.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.book-card')) {
            e.preventDefault();
            openBookDetail(app, e.target.dataset.id);
        }
    });

    $('#import-file', host).addEventListener('change', (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (file) importBooks(app, file);
    });

    renderAll();
    return {
        update(topic) { if (['books', 'loans', 'taxonomy'].includes(topic)) renderAll(); },
        destroy: off,
    };
}

// ---------------------------------------------------------------------------

function openFilters(app, state, apply) {
    const { repo } = app;
    const cats = [...repo.countBy('category')].sort((a, b) => b[1] - a[1]).map(([c, n]) => ({ id: c, label: c, sub: `${fmtNumber(n)} كتاب` }));
    const authors = repo.authors().map((a) => ({ id: a.name, label: a.name, sub: `${fmtNumber(a.count)} كتاب` }));
    const pubs = [...repo.countBy('publisher')].map(([p, n]) => ({ id: p, label: p, sub: `${fmtNumber(n)} كتاب` }));
    const cabinets = distinctCabinets(repo.books);
    const chosenCabinet = cabinets.find((c) => foldText(c) === foldText(state.cabinet)) || '';
    openSheet({
        title: 'تصفية الكتب',
        body: html`
            <form class="stack" data-action="filters:apply">
                <div class="field"><span class="field__label">القسم</span><div id="f-cat"></div></div>
                <div class="field"><span class="field__label">المؤلف</span><div id="f-author"></div></div>
                <div class="field"><span class="field__label">دار النشر</span><div id="f-pub"></div></div>
                <label class="field"><span class="field__label">الصندوق</span>
                    <select class="input" name="cabinet"><option value="">الكل</option>${cabinets.map((c) => html`<option ${chosenCabinet === c ? 'selected' : ''}>${c}</option>`)}</select>
                    <span class="field__hint">الأرقام البنغالية والعربية والإنجليزية تُعامل كرقم واحد (৫০ = ٥٠ = 50).</span>
                </label>
                <div class="form-actions">
                    <button type="button" class="btn btn--ghost" data-action="filters:clear">مسح الفلاتر</button>
                    <button type="submit" class="btn btn--primary">تطبيق</button>
                </div>
            </form>`,
        onMount(panel, close) {
            mountPicker(panel.querySelector('#f-cat'), { name: 'category', items: cats, placeholder: `ابحث في ${fmtNumber(cats.length)} قسماً…`, selectedId: state.category, allowClear: true });
            mountPicker(panel.querySelector('#f-author'), { name: 'author', items: authors, placeholder: 'كل المؤلفين', selectedId: state.author, allowClear: true });
            mountPicker(panel.querySelector('#f-pub'), { name: 'publisher', items: pubs, placeholder: 'كل دور النشر', selectedId: state.publisher, allowClear: true });
            delegate(panel, {
                'filters:apply': (form) => {
                    const v = formValues(form);
                    Object.assign(state, { category: v.category, author: v.author, publisher: v.publisher, cabinet: v.cabinet, page: 1 });
                    apply();
                    close();
                },
                'filters:clear': () => {
                    Object.assign(state, { category: '', author: '', publisher: '', cabinet: '', page: 1 });
                    apply();
                    close();
                },
            }, ['click', 'submit']);
        },
    });
}

/** Books per cabinet, keyed by the digit-normalised cabinet name. */
function cabinetCounts(books) {
    const m = new Map();
    for (const b of books) {
        const k = foldText(b.cabinet);
        m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
}

function openBooksMenu(app, host) {
    openSheet({
        title: 'استيراد وتصدير',
        size: 'sm',
        body: html`<div class="quick-list">
            ${app.canEdit ? html`<button class="quick" data-action="menu:import"><span class="quick__icon">${icon('upload-simple', 'duotone')}</span><span><strong>استيراد من Excel أو CSV</strong><small>نعرض لك ما سيتغير قبل الحفظ</small></span></button>` : ''}
            <button class="quick" data-action="menu:export"><span class="quick__icon">${icon('download-simple', 'duotone')}</span><span><strong>تصدير كل الكتب (CSV)</strong><small>مرتبة حسب الموقع، ويمكن تعديلها ثم استيرادها</small></span></button>
            <button class="quick" data-action="menu:template"><span class="quick__icon">${icon('file-csv', 'duotone')}</span><span><strong>تنزيل قالب الاستيراد</strong><small>بالأعمدة المطلوبة ومثال</small></span></button>
        </div>`,
        actions: {
            'menu:import': (_e, _v, close) => { close(); $('#import-file', host).click(); },
            'menu:export': (_e, _v, close) => {
                close();
                if (!app.repo.books.length) return toast('لا توجد كتب للتصدير', 'info');
                download(`books_${todayIso()}.csv`, '﻿' + toCSV(booksToRows(sortBooks(app.repo.books, 'location'))), 'text/csv;charset=utf-8');
            },
            'menu:template': (_e, _v, close) => { close(); download('books_template.csv', '﻿' + CSV_TEMPLATE, 'text/csv;charset=utf-8'); },
        },
    });
}

async function readImportFile(file) {
    if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) throw new Error('الملف لا يحتوي على أوراق عمل.');
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
        return toCSV(rows);
    }
    return file.text();
}

export async function importBooks(app, file) {
    const { repo } = app;
    let plan;
    try {
        plan = repo.previewImport(await readImportFile(file));
    } catch (err) {
        return toastError(err, 'تعذر قراءة الملف');
    }
    const work = plan.add.length + plan.update.length;
    openSheet({
        title: 'معاينة الاستيراد',
        body: html`
            <p class="muted">${file.name}</p>
            <div class="import-sum">
                <div><b>${fmtNumber(plan.add.length)}</b><span>كتاب جديد</span></div>
                <div><b>${fmtNumber(plan.update.length)}</b><span>سيُحدَّث</span></div>
                <div><b>${fmtNumber(plan.unchanged)}</b><span>بلا تغيير</span></div>
                <div class="${plan.skipped ? 'is-warn' : ''}"><b>${fmtNumber(plan.skipped)}</b><span>ناقص (يُتخطى)</span></div>
            </div>
            ${plan.skipped ? html`<p class="note">${icon('info')} الصفوف التي ينقصها اسم الكتاب أو المؤلف أو القسم أو الصندوق لا تُستورد.</p>` : ''}
            ${plan.update.length ? html`
                <details class="changes"><summary>عرض التحديثات (${fmtNumber(plan.update.length)})</summary>
                <ul>${plan.update.slice(0, 50).map((u) => html`<li><strong>${u.name}</strong> — ${u.changes.map((c) => `${c.field}: «${c.old || 'فارغ'}» ← «${c.new || 'فارغ'}»`).join('، ')}</li>`)}</ul>
                </details>` : ''}
            <div class="progress" hidden><div class="progress__bar"></div><span class="progress__text"></span></div>
            <div class="form-actions">
                <button class="btn btn--ghost" data-action="sheet:close">إلغاء</button>
                <button class="btn btn--primary" data-action="import:run" ${work ? '' : 'disabled'}>${icon('check')} استيراد ${fmtNumber(work)}</button>
            </div>`,
        actions: {
            'import:run': async (el, _ev, close) => {
                const panel = el.closest('.sheet__body');
                const prog = $('.progress', panel);
                prog.hidden = false;
                await withBusy(el, async () => {
                    const res = await repo.runImport(plan, (done, total) => {
                        $('.progress__bar', prog).style.width = `${total ? (done / total) * 100 : 100}%`;
                        $('.progress__text', prog).textContent = `${fmtNumber(done)} / ${fmtNumber(total)}`;
                    });
                    close();
                    toast('اكتمل الاستيراد', res.failed ? 'info' : 'success', {
                        detail: `جديد ${fmtNumber(res.added)} · محدَّث ${fmtNumber(res.updated)}${res.failed ? ` · فشل ${fmtNumber(res.failed)}` : ''}`,
                        timeout: 6000,
                    });
                });
            },
        },
    });
}

// ---------------------------------------------------------------------------

export function openBookDetail(app, id) {
    const { repo } = app;
    const b = repo.book(id);
    if (!b) return;
    const { copies, left } = repo.availability(b);
    const history = repo.loans.filter((l) => l.bookId === id).slice(0, 8);
    const docs = repo.documents.filter((d) => d.bookId === id);
    const rows = [
        ['المؤلف', b.author], ['المحقق', b.editor], ['القسم', b.category], ['دار النشر', b.publisher],
        ['سنة النشر', b.year], ['الأجزاء', fmtNumber(b.parts)], ['النسخ', `${fmtNumber(copies)} (المتاح ${fmtNumber(left)})`],
        ['الصندوق / الطاق', [b.cabinet, b.shelf].filter(Boolean).join(' / ')], ['ملاحظات', b.notes],
    ];
    openSheet({
        title: 'تفاصيل الكتاب',
        body: html`
            <div class="detail-hero" style="--spine:${spineColor(b.category)}">
                <div class="detail-hero__book" aria-hidden="true"><span></span></div>
                <div>
                    <h3 class="detail-title">${b.name}</h3>
                    <p class="muted">${b.author}</p>
                    ${statusChip(repo, b)}
                </div>
            </div>
            <dl class="facts">${rows.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v || html`<span class="muted">—</span>`}</dd></div>`)}</dl>
            ${history.length ? html`<h4 class="sub-head">سجل الإعارة</h4><ul class="rows rows--tight">${history.map((l) => html`
                <li class="row"><div class="row__main"><strong>${repo.member(l.memberId)?.name || 'عضو محذوف'}</strong>
                <small>${fmtDate(l.loanDate)}${l.returnDate ? ` ← ${fmtDate(l.returnDate)}` : ''}</small></div>
                <span class="chip ${l.status === 'معار' ? 'chip--loaned' : 'chip--quiet'}">${l.status}</span></li>`)}</ul>` : ''}
            ${docs.length ? html`<h4 class="sub-head">وثائق مرتبطة</h4><div class="link-list">${docs.map((d) => html`<a class="pill" href="#/archive?doc=${d.id}">${icon('file-text')} ${d.title}</a>`)}</div>` : ''}
            ${app.canEdit ? html`
            <div class="form-actions form-actions--split">
                <button class="btn btn--ghost btn--danger-text" data-action="detail:delete">${icon('trash')} حذف</button>
                <div>
                    <button class="btn btn--ghost" data-action="detail:edit">${icon('pencil-simple')} تعديل</button>
                    ${left > 0 ? html`<a class="btn btn--primary" href="#/loans?new=1&book=${b.id}">${icon('hand-arrow-up')} إعارة</a>` : ''}
                </div>
            </div>` : ''}`,
        actions: {
            'detail:edit': (_e, _v, close) => { close(); setTimeout(() => openBookEditor(app, id), 200); },
            'detail:delete': async (el, _v, close) => {
                const ok = await confirmAction({ title: 'حذف الكتاب', message: `حذف «${b.name}» نهائياً؟`, confirmLabel: 'حذف', danger: true });
                if (!ok) return;
                await withBusy(el, async () => { await repo.deleteBooks([id]); toast('تم حذف الكتاب'); close(); });
            },
        },
    });
}

export function openBookEditor(app, id) {
    const { repo } = app;
    const b = repo.book(id);
    if (!b) return;
    openSheet({
        title: 'تعديل الكتاب',
        size: 'lg',
        body: html`
            <form data-action="edit:save" class="stack">
                ${bookFormFields(repo, b)}
                <p class="note">${icon('info')} الحالة (متاح/معار) تُحسب تلقائياً من الإعارات.</p>
                <div class="form-actions">
                    <button type="button" class="btn btn--ghost" data-action="sheet:close">إلغاء</button>
                    <button type="submit" class="btn btn--primary">${icon('check')} حفظ</button>
                </div>
            </form>`,
        onMount(panel, close) {
            delegate(panel, {
                'edit:save': (form) => withBusy(form.querySelector('[type=submit]'), async () => {
                    await repo.updateBook(id, formValues(form));
                    toast('تم حفظ التعديلات');
                    close();
                }),
            }, ['submit']);
        },
    });
}

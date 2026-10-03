import { html, setHtml, delegate, $, fmtNumber, todayIso } from '../dom.js';
import { icon } from '../icons.js';
import { emptyState, pageHeader, pager, paginate, spineColor } from '../components.js';
import { toast, withBusy } from '../overlay.js';
import { REPORT_FIELDS, missingFields, booksToRows, sortBooks } from '../../data/rules.ts';
import { openBookEditor, importBooks } from './books.js';

export function mountReports(host, app) {
    const { repo } = app;
    const state = app.memory.reports || { field: 'all', page: 1 };
    app.memory.reports = state;

    function data() {
        const rows = sortBooks(repo.books, 'location')
            .map((book) => ({ book, missing: missingFields(book) }))
            .filter((r) => r.missing.length);
        const per = Object.fromEntries(Object.keys(REPORT_FIELDS).map((k) => [k, 0]));
        rows.forEach((r) => r.missing.forEach((m) => { per[m]++; }));
        const filtered = state.field === 'all' ? rows : rows.filter((r) => r.missing.includes(state.field));
        return { rows, per, filtered };
    }

    function render() {
        const { rows, per, filtered } = data();
        const total = repo.books.length;
        const complete = total - rows.length;
        const pct = total ? Math.round((complete / total) * 100) : 100;
        const p = paginate(filtered, state.page, 40);
        state.page = p.page;
        setHtml(host, html`
            ${pageHeader({
                title: 'تقرير البيانات الناقصة',
                subtitle: 'الكتب التي ينقصها حقل أو أكثر، مرتبة حسب الصندوق والطاق',
            })}
            <div class="report-top">
                <div class="card report-score">
                    <div class="ring ring--lg" style="--p:${pct}"><span>${fmtNumber(pct)}<small>%</small></span></div>
                    <div><strong>${fmtNumber(complete)}</strong> من ${fmtNumber(total)} كتاباً مكتملة البيانات</div>
                </div>
                <div class="chips-wrap">
                    <button class="pill ${state.field === 'all' ? 'is-on' : ''}" data-action="rep:field" data-value="all">كل الناقص <small>${fmtNumber(rows.length)}</small></button>
                    ${Object.entries(REPORT_FIELDS).filter(([k]) => per[k]).map(([k, label]) => html`
                        <button class="pill ${state.field === k ? 'is-on' : ''}" data-action="rep:field" data-value="${k}">بلا ${label} <small>${fmtNumber(per[k])}</small></button>`)}
                </div>
            </div>

            ${filtered.length ? html`
            <section class="card fill-flow">
                <div class="fill-flow__steps">
                    <div><span>١</span><p><strong>نزّل الملف</strong>فيه كل بيانات الكتب الناقصة (${fmtNumber(filtered.length)}) وعمود يوضح ما ينقص كل كتاب.</p></div>
                    <div><span>٢</span><p><strong>أكمل الخانات في Excel</strong>لا تغيّر عمود «المعرف»؛ به يعرف النظام كل كتاب.</p></div>
                    <div><span>٣</span><p><strong>ارفع الملف هنا</strong>نعرض لك التغييرات قبل الحفظ، ويُحدَّث كل كتاب في مكانه دون تكرار.</p></div>
                </div>
                <div class="form-actions">
                    <button class="btn btn--soft" data-action="rep:export">${icon('download-simple')} تنزيل ملف الإكمال</button>
                    ${app.canEdit ? html`<button class="btn btn--primary" data-action="rep:import">${icon('upload-simple')} رفع الملف المكتمل</button>` : ''}
                </div>
                <input type="file" id="rep-file" accept=".csv,.xlsx,.xls,.xlsm" hidden>
            </section>
            <ul class="report-list">${p.slice.map(({ book, missing }) => html`
                <li class="report-row" style="--spine:${spineColor(book.category)}">
                    <div class="report-row__main">
                        <strong>${book.name || 'بلا عنوان'}</strong>
                        <small>${[book.cabinet && `الصندوق ${book.cabinet}${book.shelf ? ` / ${book.shelf}` : ''}`, book.author, book.category].filter(Boolean).join(' · ')}</small>
                    </div>
                    <div class="report-row__miss">${missing.map((m) => html`<span class="tag tag--warn">${REPORT_FIELDS[m]}</span>`)}</div>
                    ${app.canEdit ? html`<button class="btn btn--soft btn--sm" data-action="rep:edit" data-id="${book.id}">${icon('pencil-simple')} أكمل</button>` : ''}
                </li>`)}</ul>
            ${pager({ ...p, prefix: 'rep' })}`
            : emptyState({ iconName: 'seal-check', title: 'كل شيء مكتمل', text: 'لا توجد كتب ناقصة في هذا التصنيف.' })}`);

        $('#rep-file', host)?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            e.target.value = '';
            if (file) importBooks(app, file);
        });
    }

    const off = delegate(host, {
        'rep:field': (el) => { state.field = el.dataset.value; state.page = 1; render(); },
        'rep:prev': () => { state.page--; render(); },
        'rep:next': () => { state.page++; render(); },
        'rep:edit': (el) => openBookEditor(app, el.dataset.id),
        'rep:import': () => $('#rep-file', host)?.click(),
        'rep:export': (el) => withBusy(el, async () => {
            const { filtered } = data();
            if (!filtered.length) return toast('لا يوجد ما يُصدَّر', 'info');
            const missingOf = new Map(filtered.map((r) => [r.book.id, r.missing]));
            const rows = booksToRows(filtered.map((r) => r.book), {
                header: 'الحقول الناقصة',
                value: (b) => missingOf.get(b.id).map((m) => REPORT_FIELDS[m]).join('، '),
            });
            // .xlsx, not CSV: Excel re-saves CSV in a legacy encoding and garbles Arabic/Bengali.
            const XLSX = await import('xlsx');
            const ws = XLSX.utils.aoa_to_sheet(rows);
            ws['!cols'] = rows[0].map((h) => ({ wch: h === 'اسم الكتاب' ? 40 : String(h).length > 12 ? 30 : 16 }));
            const wb = XLSX.utils.book_new();
            wb.Workbook = { Views: [{ RTL: true }] };
            XLSX.utils.book_append_sheet(wb, ws, 'إكمال البيانات');
            const label = state.field === 'all' ? 'كل-الناقص' : `بلا-${REPORT_FIELDS[state.field]}`;
            XLSX.writeFile(wb, `إكمال-البيانات-${label}-${todayIso()}.xlsx`);
            toast('تم تنزيل ملف الإكمال', 'success', { detail: 'افتحه في Excel، أكمل الخانات واحفظه، ثم ارفعه من هذه الصفحة.' });
        }),
    });

    render();
    return { update: (t) => t === 'books' && render(), destroy: off };
}

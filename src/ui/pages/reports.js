import { html, setHtml, delegate, $, fmtNumber, download, todayIso } from '../dom.js';
import { icon } from '../icons.js';
import { emptyState, pageHeader, pager, paginate, spineColor } from '../components.js';
import { toast } from '../overlay.js';
import { REPORT_FIELDS, missingFields, toCSV } from '../../data/rules.ts';
import { openBookEditor } from './books.js';

export function mountReports(host, app) {
    const { repo } = app;
    const state = app.memory.reports || { field: 'all', page: 1 };
    app.memory.reports = state;

    function data() {
        const rows = repo.books.map((book) => ({ book, missing: missingFields(book) })).filter((r) => r.missing.length);
        const per = Object.fromEntries(Object.keys(REPORT_FIELDS).map((k) => [k, 0]));
        rows.forEach((r) => r.missing.forEach((m) => { per[m]++; }));
        const filtered = state.field === 'all' ? rows : rows.filter((r) => r.missing.includes(state.field));
        return { rows, per, filtered };
    }

    function render() {
        const { rows, per, filtered } = data();
        const total = repo.books.length;
        const complete = total - rows.length;
        const p = paginate(filtered, state.page, 40);
        state.page = p.page;
        setHtml(host, html`
            ${pageHeader({
                title: 'تقرير البيانات الناقصة',
                subtitle: 'الكتب التي ينقصها حقل أو أكثر — مفيد قبل الجرد',
                actions: html`<button class="btn btn--ghost" data-action="rep:export">${icon('download-simple')} تصدير</button>`,
            })}
            <div class="report-top">
                <div class="card report-score">
                    <div class="ring ring--lg" style="--p:${total ? Math.round((complete / total) * 100) : 100}"><span>${fmtNumber(total ? Math.round((complete / total) * 100) : 100)}<small>%</small></span></div>
                    <div><strong>${fmtNumber(complete)}</strong> من ${fmtNumber(total)} كتاباً مكتملة البيانات</div>
                </div>
                <div class="chips-wrap">
                    <button class="pill ${state.field === 'all' ? 'is-on' : ''}" data-action="rep:field" data-value="all">كل الناقص <small>${fmtNumber(rows.length)}</small></button>
                    ${Object.entries(REPORT_FIELDS).filter(([k]) => per[k]).map(([k, label]) => html`
                        <button class="pill ${state.field === k ? 'is-on' : ''}" data-action="rep:field" data-value="${k}">بلا ${label} <small>${fmtNumber(per[k])}</small></button>`)}
                </div>
            </div>
            ${filtered.length ? html`
                <ul class="report-list">${p.slice.map(({ book, missing }) => html`
                    <li class="report-row" style="--spine:${spineColor(book.category)}">
                        <div class="report-row__main">
                            <strong>${book.name || 'بلا عنوان'}</strong>
                            <small>${[book.author, book.category, book.cabinet].filter(Boolean).join(' · ')}</small>
                        </div>
                        <div class="report-row__miss">${missing.map((m) => html`<span class="tag tag--warn">${REPORT_FIELDS[m]}</span>`)}</div>
                        ${app.canEdit ? html`<button class="btn btn--soft btn--sm" data-action="rep:edit" data-id="${book.id}">${icon('pencil-simple')} أكمل</button>` : ''}
                    </li>`)}</ul>
                ${pager({ ...p, prefix: 'rep' })}`
            : emptyState({ iconName: 'seal-check', title: 'كل شيء مكتمل', text: 'لا توجد كتب ناقصة في هذا التصنيف.' })}`);
    }

    const off = delegate(host, {
        'rep:field': (el) => { state.field = el.dataset.value; state.page = 1; render(); },
        'rep:prev': () => { state.page--; render(); },
        'rep:next': () => { state.page++; render(); },
        'rep:edit': (el) => openBookEditor(app, el.dataset.id),
        'rep:export': () => {
            const { filtered } = data();
            if (!filtered.length) return toast('لا يوجد ما يُصدَّر', 'info');
            const rows = [['م', 'اسم الكتاب', 'المؤلف', 'القسم', 'الصندوق', 'الحقول الناقصة'],
                ...filtered.map((r, i) => [i + 1, r.book.name, r.book.author, r.book.category, r.book.cabinet, r.missing.map((m) => REPORT_FIELDS[m]).join('؛ ')])];
            download(`تقرير-الكتب-الناقصة-${todayIso()}.csv`, '﻿' + toCSV(rows), 'text/csv;charset=utf-8');
        },
    });

    render();
    return { update: (t) => t === 'books' && render(), destroy: off };
}

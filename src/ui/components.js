/** Shared UI pieces. All return `html` values (escaped). */
import { html, raw, fmtNumber, escapeHtml, setHtml, debounce } from './dom.js';
import { icon } from './icons.js';
import { foldText, isBlank } from '../data/rules.ts';

/**
 * A panel that slides down under its toolbar. Returns toggle(force?).
 * Used on phones in place of rows of tabs/chips above a list.
 */
export function setupDropdown(button, panel) {
    const toggle = (force) => {
        const open = force ?? !panel.classList.contains('is-open');
        panel.classList.toggle('is-open', open);
        panel.setAttribute('aria-hidden', String(!open));
        button.classList.toggle('is-on', open);
    };
    button.addEventListener('click', () => toggle());
    return toggle;
}

export function pageHeader({ title, subtitle, actions }) {
    return html`
        <header class="page-head">
            <div>
                <h1 class="page-title">${title}</h1>
                ${subtitle ? html`<p class="page-sub">${subtitle}</p>` : ''}
            </div>
            ${actions ? html`<div class="page-actions">${actions}</div>` : ''}
        </header>`;
}

export function emptyState({ iconName = 'books', title, text, action }) {
    return html`
        <div class="empty">
            <div class="empty__art">${icon(iconName, 'duotone')}</div>
            <h3>${title}</h3>
            ${text ? html`<p>${text}</p>` : ''}
            ${action || ''}
        </div>`;
}

export function statusChip(repo, book) {
    const { copies, left } = repo.availability(book);
    const out = left === 0;
    const label = out ? 'معار' : 'متاح';
    const count = copies > 1 ? ` · ${fmtNumber(left)}/${fmtNumber(copies)}` : '';
    return html`<span class="chip ${out ? 'chip--loaned' : 'chip--ok'}">${label}${count}</span>`;
}

/** Location badge: "A1 / 3" (cabinet / shelf). */
export function locationBadge(book) {
    if (isBlank(book.cabinet) && isBlank(book.shelf)) return html`<span class="loc loc--none">بلا موقع</span>`;
    return html`<span class="loc" title="الصندوق / الطاق">${icon('map-pin')}${book.cabinet || '—'}${book.shelf ? html`<em>/</em>${book.shelf}` : ''}</span>`;
}

// Soft hue per category for the book "spine" accent. Categories get colours
// in alphabetical order so neighbours never clash; unknown names fall back to a hash.
const SPINES = ['#9DB8A0', '#E6B98F', '#A7C3D9', '#D9A7B0', '#C9B6E4', '#E3CD84', '#9FC7BF', '#D7B79B', '#B8C99A', '#E0A98F'];
const assigned = new Map();
export function setCategoryOrder(categories) {
    assigned.clear();
    [...categories].sort((a, b) => a.localeCompare(b, 'ar')).forEach((c, i) => assigned.set(c, SPINES[i % SPINES.length]));
}
export function spineColor(category) {
    const known = assigned.get(category);
    if (known) return known;
    let h = 2166136261;
    for (const ch of String(category || '')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    return SPINES[h % SPINES.length];
}

export function bookCard(repo, book, { canEdit, index } = {}) {
    const available = repo.availability(book).left > 0;
    return html`
        <article class="book-card" data-action="book:open" data-id="${book.id}" tabindex="0" aria-expanded="false" style="--spine:${spineColor(book.category)}${index != null ? `;--i:${Math.min(index, 12)}` : ''}">
            <div class="book-card__spine" aria-hidden="true"></div>
            <div class="book-card__main">
                <h3 class="book-card__title">${book.name}</h3>
                <p class="book-card__meta">${book.author}${book.publisher ? html`<span class="book-card__pub"> · ${book.publisher}</span>` : ''}</p>
                <div class="book-card__tags">
                    <span class="tag">${book.category}</span>
                    ${book.parts > 1 ? html`<span class="tag tag--quiet">${fmtNumber(book.parts)} أجزاء</span>` : ''}
                    ${locationBadge(book)}
                </div>
            </div>
            <div class="book-card__side">
                ${statusChip(repo, book)}
                ${available ? html`<span class="avail-tick" title="متاح" aria-label="متاح">${icon('check-circle', 'fill')}</span>` : ''}
                ${canEdit ? html`<button type="button" class="icon-btn icon-btn--sm" data-action="book:edit" data-id="${book.id}" aria-label="تعديل">${icon('pencil-simple')}</button>` : ''}
            </div>
        </article>`;
}

export function pager({ page, pages, total, from, to, prefix = 'pager' }) {
    if (pages <= 1) return html`<p class="pager__count">${fmtNumber(total)} نتيجة</p>`;
    return html`
        <nav class="pager" aria-label="الصفحات">
            <button type="button" class="btn btn--ghost btn--sm" data-action="${prefix}:prev" ${page <= 1 ? 'disabled' : ''}>${icon('caret-right')} السابق</button>
            <span class="pager__count">${fmtNumber(from)}–${fmtNumber(to)} من ${fmtNumber(total)}</span>
            <button type="button" class="btn btn--ghost btn--sm" data-action="${prefix}:next" ${page >= pages ? 'disabled' : ''}>التالي ${icon('caret-left')}</button>
        </nav>`;
}

export function paginate(items, page, size) {
    const pages = Math.max(1, Math.ceil(items.length / size));
    const p = Math.min(Math.max(1, page), pages);
    const start = (p - 1) * size;
    const slice = items.slice(start, start + size);
    return { slice, page: p, pages, total: items.length, from: items.length ? start + 1 : 0, to: start + slice.length };
}

export function field({ label, name, value = '', type = 'text', required, placeholder, list, hint, attrs = '', full }) {
    return html`
        <label class="field ${full ? 'field--full' : ''}">
            <span class="field__label">${label}${required ? html`<b aria-hidden="true">*</b>` : ''}</span>
            <input class="input" type="${type}" name="${name}" value="${value ?? ''}" ${required ? 'required' : ''}
                ${placeholder ? html`placeholder="${placeholder}"` : ''} ${list ? html`list="${list}"` : ''} ${raw(attrs)}>
            ${hint ? html`<span class="field__hint">${hint}</span>` : ''}
        </label>`;
}

export function datalist(id, options) {
    return html`<datalist id="${id}">${options.map((o) => html`<option value="${o}"></option>`)}</datalist>`;
}

/** Full add/edit book form body. */
export function bookFormFields(repo, book = {}) {
    return html`
        <div class="form-grid">
            ${field({ label: 'اسم الكتاب', name: 'name', value: book.name, required: true, full: true, placeholder: 'مثال: رياض الصالحين' })}
            ${field({ label: 'المؤلف', name: 'author', value: book.author, required: true, list: 'dl-authors' })}
            ${field({ label: 'المحقق', name: 'editor', value: book.editor })}
            ${field({ label: 'القسم', name: 'category', value: book.category, required: true, list: 'dl-categories', hint: 'اختر من القائمة أو اكتب قسماً جديداً' })}
            ${field({ label: 'دار النشر', name: 'publisher', value: book.publisher, list: 'dl-publishers' })}
            ${field({ label: 'الصندوق', name: 'cabinet', value: book.cabinet, required: true, placeholder: 'A1' })}
            ${field({ label: 'الطاق', name: 'shelf', value: book.shelf, placeholder: '3' })}
            ${field({ label: 'الأجزاء', name: 'parts', value: book.parts ?? 1, type: 'number', attrs: 'min="1" inputmode="numeric"' })}
            ${field({ label: 'النسخ', name: 'copies', value: book.copies ?? 1, type: 'number', attrs: 'min="1" inputmode="numeric"' })}
            ${field({ label: 'سنة النشر', name: 'year', value: book.year, attrs: 'inputmode="numeric"', placeholder: '1422' })}
            <label class="field field--full">
                <span class="field__label">ملاحظات</span>
                <textarea class="input" name="notes" rows="2">${book.notes || ''}</textarea>
            </label>
        </div>
        ${datalist('dl-categories', repo.categories)}
        ${datalist('dl-publishers', repo.publishers)}
        ${datalist('dl-authors', repo.authors().slice(0, 400).map((a) => a.name))}`;
}

/**
 * Searchable picker for large lists (7k+ books). Renders into `host`, keeps
 * the chosen id in a hidden input named `name`.
 */
export function mountPicker(host, { name, items, placeholder, selectedId = '', describe, emptyText = 'لا توجد نتائج', allowClear = false }) {
    const selected = items.find((i) => i.id === selectedId);
    setHtml(host, html`
        <div class="picker">
            <input type="hidden" name="${name}" value="${selectedId}">
            <div class="picker__box">
                ${icon('magnifying-glass')}
                <input class="picker__input" type="search" placeholder="${placeholder}" autocomplete="off" value="${selected ? selected.label : ''}" aria-autocomplete="list">
                ${allowClear ? html`<button type="button" class="icon-btn icon-btn--sm picker__clear" aria-label="مسح">${icon('x')}</button>` : ''}
            </div>
            <ul class="picker__list" role="listbox"></ul>
        </div>`);
    const hidden = host.querySelector('input[type=hidden]');
    const input = host.querySelector('.picker__input');
    const list = host.querySelector('.picker__list');
    const folded = items.map((i) => ({ ...i, key: foldText(`${i.label} ${i.sub || ''}`) }));

    const render = () => {
        const q = foldText(input.value).trim();
        const hits = (q ? folded.filter((i) => i.key.includes(q)) : folded).slice(0, 40);
        list.innerHTML = hits.length
            ? hits.map((i) => `<li role="option" data-id="${escapeHtml(i.id)}" class="${i.id === hidden.value ? 'is-selected' : ''} ${i.disabled ? 'is-disabled' : ''}">
                    <span>${escapeHtml(i.label)}</span>${i.sub ? `<small>${escapeHtml(i.sub)}</small>` : ''}${describe ? describe(i) : ''}</li>`).join('')
            : `<li class="picker__empty">${escapeHtml(emptyText)}</li>`;
    };
    input.addEventListener('focus', () => { host.classList.add('is-open'); render(); });
    input.addEventListener('input', debounce(() => { hidden.value = ''; render(); }, 80));
    input.addEventListener('blur', () => setTimeout(() => host.classList.remove('is-open'), 150));
    list.addEventListener('mousedown', (e) => e.preventDefault());
    list.addEventListener('click', (e) => {
        const li = e.target.closest('li[data-id]');
        if (!li || li.classList.contains('is-disabled')) return;
        const item = items.find((i) => i.id === li.dataset.id);
        hidden.value = item.id;
        input.value = item.label;
        host.classList.remove('is-open');
        host.dispatchEvent(new CustomEvent('pick', { detail: item }));
        input.blur();
    });
    host.querySelector('.picker__clear')?.addEventListener('click', () => {
        const had = hidden.value;
        hidden.value = '';
        input.value = '';
        render();
        if (had) host.dispatchEvent(new CustomEvent('pick', { detail: null }));
        else input.focus();
    });
    return { get value() { return hidden.value; } };
}

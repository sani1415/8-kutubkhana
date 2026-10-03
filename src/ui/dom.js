/**
 * Tiny DOM helpers. `html` escapes every interpolated value unless it is
 * itself an `html` result (or wrapped in `raw`), so markup built from user
 * data cannot inject HTML. No inline event handlers anywhere: elements carry
 * `data-action` and pages handle clicks through `delegate`.
 */

class SafeHtml {
    constructor(value) { this.value = value; }
    toString() { return this.value; }
}

export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function toHtml(value) {
    if (value == null || value === false) return '';
    if (value instanceof SafeHtml) return value.value;
    if (Array.isArray(value)) return value.map(toHtml).join('');
    return escapeHtml(value);
}

export function html(strings, ...values) {
    let out = strings[0];
    values.forEach((v, i) => { out += toHtml(v) + strings[i + 1]; });
    return new SafeHtml(out);
}

/** Trusted markup (static strings only — never user data). */
export const raw = (s) => new SafeHtml(String(s));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function setHtml(el, content) {
    if (el) el.innerHTML = toHtml(content);
}

/**
 * Click / submit delegation: `<button data-action="book:edit" data-id="…">`.
 * Handlers receive (element, event). Returns an unsubscribe function.
 */
export function delegate(root, handlers, events = ['click']) {
    const listener = (event) => {
        const el = event.target.closest('[data-action]');
        if (!el || !root.contains(el)) return;
        const handler = handlers[el.dataset.action];
        if (!handler) return;
        if (event.type === 'click' && el.tagName === 'FORM') return;
        if (event.type === 'submit' && el.tagName !== 'FORM') return;
        if (event.type === 'submit') event.preventDefault();
        handler(el, event);
    };
    events.forEach((t) => root.addEventListener(t, listener));
    return () => events.forEach((t) => root.removeEventListener(t, listener));
}

export function formValues(form) {
    return Object.fromEntries(new FormData(form).entries());
}

export function debounce(fn, ms = 160) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ------------------------------------------------------------------ formatting
const num = new Intl.NumberFormat('ar-u-nu-latn');
export const fmtNumber = (n) => num.format(n ?? 0);

const gregorian = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
const gregorianShort = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'short' });
const weekday = new Intl.DateTimeFormat('ar-u-nu-latn', { weekday: 'long' });
let hijri;
try {
    hijri = new Intl.DateTimeFormat('ar-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
} catch { hijri = null; }

const parseDay = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`) : null);

export function fmtDate(iso, short = false) {
    const d = parseDay(iso);
    if (!d || Number.isNaN(d.getTime())) return '';
    return (short ? gregorianShort : gregorian).format(d);
}

export function fmtHijri(iso) {
    const d = parseDay(iso);
    if (!d || !hijri || Number.isNaN(d.getTime())) return '';
    return hijri.format(d).replace(/\s*هـ$/, '') + ' هـ';
}

export function fmtWeekday(iso) {
    const d = parseDay(iso);
    return d ? weekday.format(d) : '';
}

/** "اليوم" / "أمس" / "منذ 5 أيام" */
export function fmtRelative(iso) {
    const d = parseDay(iso);
    if (!d) return '';
    const days = Math.round((parseDay(new Date().toISOString()) - d) / 864e5);
    if (days <= 0) return 'اليوم';
    if (days === 1) return 'أمس';
    if (days === 2) return 'منذ يومين';
    if (days <= 10) return `منذ ${days} أيام`;
    return `منذ ${fmtNumber(days)} يوماً`;
}

export function daysSince(iso) {
    const d = parseDay(iso);
    return d ? Math.max(0, Math.round((Date.now() - d.getTime()) / 864e5)) : 0;
}

export function download(filename, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

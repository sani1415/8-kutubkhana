/**
 * Sheets (bottom sheet on phones, centred dialog on wide screens), confirm
 * prompts and toasts. Built on <dialog> so focus trapping, Esc and the back
 * gesture behave natively.
 */
import { html, setHtml, delegate } from './dom.js';
import { icon } from './icons.js';

const stack = [];

/**
 * Open a sheet. `body` is html content; `onMount(panel, close)` wires it up.
 * Returns a promise resolving with the value passed to close().
 */
export function openSheet({ title, body, size = 'md', onMount, actions = {} }) {
    return new Promise((resolve) => {
        const dlg = document.createElement('dialog');
        dlg.className = `sheet sheet--${size}`;
        dlg.setAttribute('aria-label', title || '');
        setHtml(dlg, html`
            <div class="sheet__panel">
                <div class="sheet__grip" aria-hidden="true"></div>
                <header class="sheet__head">
                    <h2 class="sheet__title">${title}</h2>
                    <button type="button" class="icon-btn" data-action="sheet:close" aria-label="إغلاق">${icon('x')}</button>
                </header>
                <div class="sheet__body">${body}</div>
            </div>`);
        document.body.append(dlg);

        let result;
        const close = (value) => {
            result = value;
            dlg.classList.add('is-closing');
            const done = () => dlg.close();
            if (matchMedia('(prefers-reduced-motion: reduce)').matches) done();
            else setTimeout(done, 250);
        };
        dlg.addEventListener('close', () => {
            stack.splice(stack.indexOf(dlg), 1);
            dlg.remove();
            resolve(result);
        });
        dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
        delegate(dlg, { 'sheet:close': () => close(), ...Object.fromEntries(Object.entries(actions).map(([k, fn]) => [k, (el, ev) => fn(el, ev, close)])) });
        stack.push(dlg);
        dlg.showModal();
        onMount?.(dlg.querySelector('.sheet__body'), close);
    });
}

export function closeAllSheets() {
    [...stack].forEach((d) => d.close());
}

export function confirmAction({ title, message, confirmLabel = 'تأكيد', danger = false }) {
    return openSheet({
        title,
        size: 'sm',
        body: html`
            <p class="confirm__msg">${message}</p>
            <div class="form-actions">
                <button type="button" class="btn btn--ghost" data-action="confirm:no">إلغاء</button>
                <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-action="confirm:yes">${confirmLabel}</button>
            </div>`,
        actions: {
            'confirm:no': (_el, _ev, close) => close(false),
            'confirm:yes': (_el, _ev, close) => close(true),
        },
    }).then(Boolean);
}

// ------------------------------------------------------------------- toasts
let toastHost;
export function toast(message, type = 'success', { detail, timeout } = {}) {
    if (!toastHost) {
        toastHost = document.createElement('div');
        toastHost.className = 'toasts';
        toastHost.setAttribute('role', 'status');
        toastHost.setAttribute('aria-live', 'polite');
        document.body.append(toastHost);
    }
    const iconName = { success: 'check-circle', error: 'warning-circle', info: 'info' }[type] || 'info';
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    setHtml(el, html`${icon(iconName, 'fill')}<div><strong>${message}</strong>${detail ? html`<span>${detail}</span>` : ''}</div>`);
    toastHost.append(el);
    const ms = timeout ?? (type === 'error' ? 6000 : 3200);
    setTimeout(() => {
        el.classList.add('is-leaving');
        setTimeout(() => el.remove(), 220);
    }, ms);
}

/** Show an error from any thrown value. */
export function toastError(err, fallback = 'حدث خطأ غير متوقع') {
    console.error(err);
    toast(err?.message || fallback, 'error');
}

/** Run an async action with a busy button and error toast. */
export async function withBusy(button, fn) {
    if (button?.disabled) return undefined;
    const label = button?.innerHTML;
    if (button) {
        button.disabled = true;
        button.classList.add('is-busy');
    }
    try {
        return await fn();
    } catch (err) {
        toastError(err);
        return undefined;
    } finally {
        if (button) {
            button.disabled = false;
            button.classList.remove('is-busy');
            button.innerHTML = label;
        }
    }
}

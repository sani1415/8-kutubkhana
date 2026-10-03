import { html, setHtml, delegate, $, formValues } from '../dom.js';
import { icon } from '../icons.js';
import { bookFormFields, pageHeader } from '../components.js';
import { confirmAction, toast, withBusy } from '../overlay.js';

export function mountBookNew(host, app) {
    const { repo } = app;
    let last = app.memory.lastBookPlace || { cabinet: '', shelf: '' };

    function render() {
        setHtml(host, html`
            ${pageHeader({ title: 'إضافة كتاب', subtitle: 'الحقول المعلَّمة بـ * مطلوبة. يُحفظ الصندوق والطاق للكتاب التالي.' })}
            <form class="card form-card" data-action="new:save" autocomplete="off">
                ${bookFormFields(repo, { ...last, parts: 1, copies: 1 })}
                <div class="form-actions form-actions--sticky">
                    <a class="btn btn--ghost" href="#/scan">${icon('camera')} مسح بالكاميرا بدلاً من ذلك</a>
                    <button type="submit" class="btn btn--primary btn--lg">${icon('plus')} حفظ الكتاب</button>
                </div>
            </form>`);
        $('input[name=name]', host)?.focus({ preventScroll: true });
    }

    const off = delegate(host, {
        'new:save': (form) => withBusy(form.querySelector('[type=submit]'), async () => {
            const values = formValues(form);
            const dup = repo.findDuplicate(values);
            if (dup) {
                const ok = await confirmAction({
                    title: 'كتاب مشابه موجود',
                    message: `«${dup.name}» لـ ${dup.author} موجود في ${dup.cabinet || 'المكتبة'}. هل تضيفه مرة أخرى؟ (لزيادة النسخ عدّل الكتاب الموجود بدلاً من ذلك)`,
                    confirmLabel: 'أضفه رغم ذلك',
                });
                if (!ok) return;
            }
            const book = await repo.addBook(values);
            last = { cabinet: book.cabinet, shelf: book.shelf };
            app.memory.lastBookPlace = last;
            toast('أُضيف الكتاب', 'success', { detail: book.name });
            render();
        }),
    }, ['submit']);

    render();
    return { destroy: off };
}

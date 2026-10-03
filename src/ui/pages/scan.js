import { html, setHtml, delegate, $, $$, fmtNumber } from '../dom.js';
import { icon } from '../icons.js';
import { pageHeader, datalist } from '../components.js';
import { toast, withBusy } from '../overlay.js';

/** Downscale to ≤1600px JPEG before upload: small body, faster AI call. */
async function compress(file, maxDim = 1600, quality = 0.85) {
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) {
        const buf = new Uint8Array(await file.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        return { base64: btoa(bin), mimeType: file.type || 'image/jpeg' };
    }
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return { base64: canvas.toDataURL('image/jpeg', quality).split(',')[1], mimeType: 'image/jpeg' };
}

const FIELDS = [
    ['name', 'العنوان', 'full'], ['author', 'المؤلف'], ['category', 'القسم', '', 'dl-scan-cats'], ['publisher', 'دار النشر', '', 'dl-scan-pubs'],
    ['editor', 'المحقق'], ['year', 'السنة'], ['parts', 'الأجزاء'], ['cabinet', 'الصندوق'], ['shelf', 'الطاق'],
];

export function mountScan(host, app) {
    const { repo } = app;
    const s = app.memory.scan || { step: 'pick', files: [], rows: [], cabinet: '', shelf: '', progress: 0, errors: 0 };
    app.memory.scan = s;
    // One preview URL per photo, created once and revoked when the photo goes away.
    const previews = new Map();
    const urlFor = (f) => {
        if (!previews.has(f)) previews.set(f, URL.createObjectURL(f.file));
        return previews.get(f);
    };
    const dropPreviews = (keep = []) => {
        for (const [f, u] of previews) if (!keep.includes(f)) { URL.revokeObjectURL(u); previews.delete(f); }
    };

    function render() {
        dropPreviews(s.files);
        setHtml(host, html`
            ${pageHeader({ title: 'المسح الذكي', subtitle: 'صوّر غلاف الكتاب أو كعوب عدة كتب، ويقرأ الذكاء الاصطناعي البيانات لتراجعها قبل الحفظ' })}
            <ol class="steps" aria-label="الخطوات">
                ${[['pick', 'الصور'], ['work', 'التحليل'], ['review', 'المراجعة'], ['done', 'تم']].map(([k, l], i) => html`
                    <li class="${s.step === k ? 'is-on' : ''} ${['pick', 'work', 'review', 'done'].indexOf(s.step) > i ? 'is-done' : ''}"><span>${fmtNumber(i + 1)}</span>${l}</li>`)}
            </ol>
            ${{ pick: renderPick, work: renderWork, review: renderReview, done: renderDone }[s.step]()}`);
    }

    function renderPick() {
        const urls = s.files.map(urlFor);
        return html`
            <section class="card scan-pick">
                <div class="scan-buttons">
                    <label class="drop drop--big">
                        ${icon('camera', 'duotone')}
                        <span><strong>التقط صورة</strong><small>بالكاميرا الخلفية</small></span>
                        <input type="file" accept="image/*" capture="environment" data-role="files">
                    </label>
                    <label class="drop drop--big">
                        ${icon('images', 'duotone')}
                        <span><strong>اختر من المعرض</strong><small>يمكن اختيار عدة صور</small></span>
                        <input type="file" accept="image/*" multiple data-role="files">
                    </label>
                </div>
                ${s.files.length ? html`
                    <div class="thumbs">${s.files.map((f, i) => html`
                        <figure class="thumb"><img src="${urls[i]}" alt="">
                            <button class="icon-btn icon-btn--sm" data-action="scan:remove" data-i="${i}" aria-label="إزالة">${icon('x')}</button></figure>`)}</div>
                    <div class="form-grid">
                        <label class="field"><span class="field__label">الصندوق لكل هذه الكتب</span><input class="input" data-role="cabinet" value="${s.cabinet}" placeholder="A1"></label>
                        <label class="field"><span class="field__label">الطاق</span><input class="input" data-role="shelf" value="${s.shelf}" placeholder="3"></label>
                    </div>
                    <div class="form-actions">
                        <button class="btn btn--ghost" data-action="scan:clear">مسح الكل</button>
                        <button class="btn btn--primary btn--lg" data-action="scan:start">${icon('sparkle')} تحليل ${fmtNumber(s.files.length)} صورة</button>
                    </div>` : html`<p class="note">${icon('lightbulb')} نصيحة: صوّر في إضاءة جيدة واجعل العنوان واضحاً. صورة لكعوب ٥–٨ كتب على الرف تعمل جيداً.</p>`}
            </section>`;
    }

    function renderWork() {
        const urls = s.files.map(urlFor);
        const pct = s.files.length ? Math.round((s.progress / s.files.length) * 100) : 0;
        return html`
            <section class="card scan-work">
                <div class="scan-orb" aria-hidden="true">${icon('sparkle', 'duotone')}</div>
                <h2>جارٍ قراءة الصور…</h2>
                <p class="muted" id="scan-status">${fmtNumber(s.progress)} من ${fmtNumber(s.files.length)}</p>
                <div class="progress"><div class="progress__bar" style="width:${pct}%"></div></div>
                <div class="thumbs thumbs--status">${s.files.map((f, i) => html`
                    <figure class="thumb thumb--${f.state || 'wait'}"><img src="${urls[i]}" alt=""><figcaption>${{ wait: 'بالانتظار', run: 'جارٍ…', ok: `✓ ${fmtNumber(f.found || 0)}`, err: 'خطأ' }[f.state || 'wait']}</figcaption></figure>`)}</div>
            </section>`;
    }

    function renderReview() {
        return html`
            <div class="review-head">
                <p><b>${fmtNumber(s.rows.length)}</b> كتاباً مستخرجاً. راجع البيانات وصحّح ما يلزم — الحقول المطلوبة: العنوان، المؤلف، القسم، الصندوق.</p>
            </div>
            <div class="review-grid">${s.rows.map((r, i) => html`
                <article class="card review" data-i="${i}">
                    <header><span class="review__n">${fmtNumber(i + 1)}</span>
                        <button class="icon-btn icon-btn--sm" data-action="scan:drop" data-i="${i}" aria-label="حذف">${icon('trash')}</button></header>
                    <div class="form-grid form-grid--tight">${FIELDS.map(([k, label, full, list]) => html`
                        <label class="field ${full ? 'field--full' : ''}"><span class="field__label">${label}</span>
                            <input class="input input--sm ${['name', 'author', 'category', 'cabinet'].includes(k) && !String(r[k] || '').trim() ? 'is-missing' : ''}" data-k="${k}" value="${r[k] ?? ''}" ${list ? html`list="${list}"` : ''}></label>`)}</div>
                </article>`)}</div>
            ${datalist('dl-scan-cats', repo.categories)}${datalist('dl-scan-pubs', repo.publishers)}
            <div class="form-actions form-actions--sticky">
                <button class="btn btn--ghost" data-action="scan:back">${icon('arrow-right')} رجوع</button>
                <button class="btn btn--primary btn--lg" data-action="scan:save">${icon('floppy-disk')} حفظ في المكتبة</button>
            </div>`;
    }

    function renderDone() {
        const r = s.result || {};
        return html`
            <section class="card scan-done">
                <div class="scan-orb scan-orb--ok" aria-hidden="true">${icon('check-circle', 'fill')}</div>
                <h2>${r.saved ? `حُفظ ${fmtNumber(r.saved)} كتاباً` : 'لم يُحفظ أي كتاب'}</h2>
                <p class="muted">${[r.duplicates ? `${fmtNumber(r.duplicates)} مكرر تخطيناه` : '', r.invalid ? `${fmtNumber(r.invalid)} ناقص البيانات` : ''].filter(Boolean).join(' · ')}</p>
                <div class="form-actions form-actions--center">
                    <a class="btn btn--ghost" href="#/books">${icon('books')} الكتب</a>
                    <button class="btn btn--primary" data-action="scan:again">${icon('camera')} مسح دفعة أخرى</button>
                </div>
            </section>`;
    }

    function collectEdits() {
        $$('.review', host).forEach((card) => {
            const row = s.rows[Number(card.dataset.i)];
            $$('input[data-k]', card).forEach((inp) => { row[inp.dataset.k] = inp.value.trim(); });
        });
    }

    async function start() {
        s.step = 'work';
        s.progress = 0;
        s.rows = [];
        s.errors = 0;
        render();
        let lastError;
        for (const f of s.files) {
            f.state = 'run';
            render();
            try {
                const books = await repo.scanBooks(await compress(f.file));
                f.state = 'ok';
                f.found = books.length;
                books.forEach((b) => s.rows.push({ ...b, cabinet: s.cabinet || b.cabinet, shelf: s.shelf || b.shelf }));
            } catch (err) {
                f.state = 'err';
                s.errors++;
                lastError = err;
            }
            s.progress++;
            if (app.memory.scan !== s) return; // user left the page
            render();
        }
        if (s.rows.length) {
            s.step = 'review';
        } else {
            s.step = 'pick';
            toast(lastError ? lastError.message : 'لم نعثر على كتب في الصور', 'error');
        }
        render();
    }

    host.addEventListener('change', (e) => {
        const role = e.target.dataset.role;
        if (role === 'files') {
            const files = [...e.target.files].filter((f) => f.type.startsWith('image/'));
            s.files.push(...files.map((file) => ({ file })));
            render();
        }
    });
    host.addEventListener('input', (e) => {
        const role = e.target.dataset.role;
        if (role === 'cabinet' || role === 'shelf') s[role] = e.target.value.trim();
    });

    const off = delegate(host, {
        'scan:remove': (el) => { s.files.splice(Number(el.dataset.i), 1); render(); },
        'scan:clear': () => { s.files = []; render(); },
        'scan:start': () => start(),
        'scan:drop': (el) => {
            collectEdits();
            s.rows.splice(Number(el.dataset.i), 1);
            if (!s.rows.length) s.step = 'pick';
            render();
        },
        'scan:back': () => { collectEdits(); s.step = 'pick'; render(); },
        'scan:save': (el) => withBusy(el, async () => {
            collectEdits();
            s.result = await repo.saveScanned(s.rows.map((r) => ({ ...r, parts: Number(r.parts) || 1 })));
            s.step = 'done';
            s.files = [];
            s.rows = [];
            render();
        }),
        'scan:again': () => { Object.assign(s, { step: 'pick', files: [], rows: [], result: null }); render(); },
    });

    render();
    return {
        destroy() {
            off();
            if (s.step === 'work') app.memory.scan = null; // abandon an in-flight batch
            dropPreviews();
        },
    };
}

import { html, raw, setHtml, delegate, $, formValues, todayIso, fmtNumber } from '../dom.js';
import { icon } from '../icons.js';
import { pageHeader } from '../components.js';
import { confirmAction, toast, withBusy } from '../overlay.js';

const ROLES = [
    ['admin', 'مدير', 'كل الصلاحيات وإدارة المستخدمين'],
    ['librarian', 'أمين المكتبة', 'إضافة وتعديل الكتب والإعارات'],
    ['viewer', 'مشاهد', 'عرض فقط'],
    ['pending', 'بانتظار الموافقة', 'لا يرى أي بيانات'],
];
const roleLabel = (r) => ROLES.find(([k]) => k === r)?.[1] || r;

export function mountSettings(host, app) {
    const { repo } = app;

    function render() {
        setHtml(host, html`
            ${pageHeader({ title: 'الإعدادات' })}
            <div class="settings">
                <section class="card">
                    <h2 class="card__title">${icon('user-circle', 'duotone')} حسابي</h2>
                    <dl class="facts facts--inline">
                        <div><dt>البريد</dt><dd dir="ltr">${repo.user.email}</dd></div>
                        <div><dt>الصلاحية</dt><dd><span class="chip chip--role-${repo.role}">${roleLabel(repo.role)}</span></dd></div>
                    </dl>
                    <form class="stack" data-action="set:password" autocomplete="off">
                        <h3 class="sub-head">تغيير كلمة المرور</h3>
                        <div class="form-grid">
                            <label class="field"><span class="field__label">كلمة المرور الجديدة</span><input class="input" type="password" name="p1" minlength="8" autocomplete="new-password" dir="ltr" required></label>
                            <label class="field"><span class="field__label">تأكيدها</span><input class="input" type="password" name="p2" minlength="8" autocomplete="new-password" dir="ltr" required></label>
                        </div>
                        <div class="form-actions"><button class="btn btn--soft" type="submit">${icon('key')} تحديث كلمة المرور</button></div>
                    </form>
                </section>

                ${app.isAdmin ? html`
                <section class="card">
                    <h2 class="card__title">${icon('users-four', 'duotone')} المستخدمون والصلاحيات</h2>
                    <p class="muted">من يسجّل حساباً جديداً يظهر هنا «بانتظار الموافقة» ولا يرى شيئاً حتى تمنحه صلاحية.</p>
                    <div id="users"><div class="skeleton skeleton--rows"></div></div>
                </section>` : ''}

                <section class="card">
                    <h2 class="card__title">${icon('cloud-arrow-down', 'duotone')} نسخة احتياطية</h2>
                    <p class="muted">ملف Excel واحد بأوراق منفصلة. احتفظ بنسخة شهرياً على الأقل.</p>
                    <form class="stack" data-action="set:backup">
                        <div class="checks">
                            ${[['books', 'الكتب', repo.books.length], ['members', 'الأعضاء', repo.members.length], ['loans', 'الإعارات', repo.loans.length], ['diary', 'اليوميات', repo.diary.length], ['documents', 'الوثائق', repo.documents.length]].map(([k, l, n]) => html`
                                <label class="check"><input type="checkbox" name="${k}" checked><span>${l}</span><small>${fmtNumber(n)}</small></label>`)}
                        </div>
                        <div class="form-actions"><button class="btn btn--primary" type="submit">${icon('download-simple')} تنزيل ملف Excel</button></div>
                    </form>
                </section>

                ${app.isAdmin ? html`
                <section class="card card--danger">
                    <h2 class="card__title">${icon('warning-octagon', 'duotone')} منطقة الخطر</h2>
                    <p class="muted">حذف كل الكتب والأعضاء والإعارات واليوميات والأقسام ودور النشر نهائياً. نزّل نسخة احتياطية أولاً.</p>
                    <div class="form-actions"><button class="btn btn--danger" data-action="set:wipe">${icon('trash')} حذف كل البيانات</button></div>
                </section>` : ''}
            </div>`);
        if (app.isAdmin) loadUsers();
    }

    async function loadUsers() {
        const box = $('#users', host);
        try {
            const users = await repo.listProfiles();
            users.sort((a, b) => (a.role === 'pending' ? -1 : 0) - (b.role === 'pending' ? -1 : 0));
            setHtml(box, html`<ul class="users">${users.map((u) => html`
                <li class="user ${u.role === 'pending' ? 'user--pending' : ''}">
                    <span class="avatar">${(u.email || '?')[0].toUpperCase()}</span>
                    <div class="user__main"><strong dir="ltr">${u.email}</strong>
                        <small>${u.role === 'pending' ? 'ينتظر موافقتك' : roleLabel(u.role)}${u.userId === repo.user.id ? ' · أنت' : ''}</small></div>
                    <select class="input input--sm" data-action="set:role" data-id="${u.userId}" aria-label="الصلاحية" ${u.userId === repo.user.id ? raw('disabled title="لا يمكنك تغيير صلاحيتك"') : ''}>
                        ${ROLES.map(([k, l]) => html`<option value="${k}" ${u.role === k ? 'selected' : ''}>${l}</option>`)}
                    </select>
                </li>`)}</ul>`);
        } catch (err) {
            setHtml(box, html`<p class="text-late">تعذر تحميل المستخدمين: ${err.message}</p>`);
        }
    }

    host.addEventListener('change', async (e) => {
        const sel = e.target.closest('select[data-action="set:role"]');
        if (!sel) return;
        const prev = [...sel.options].find((o) => o.defaultSelected)?.value;
        const ok = await confirmAction({ title: 'تغيير الصلاحية', message: `منح هذا المستخدم صلاحية «${roleLabel(sel.value)}»؟`, confirmLabel: 'تأكيد' });
        if (!ok) { sel.value = prev; return; }
        sel.disabled = true;
        try {
            await repo.setRole(sel.dataset.id, sel.value);
            toast('تم تحديث الصلاحية');
            loadUsers();
        } catch (err) {
            toast(err.message, 'error');
            sel.value = prev;
            sel.disabled = false;
        }
    });

    const off = delegate(host, {
        'set:password': (form) => withBusy(form.querySelector('[type=submit]'), async () => {
            const { p1, p2 } = formValues(form);
            if (p1 !== p2) throw new Error('كلمتا المرور غير متطابقتين.');
            await repo.updatePassword(p1);
            form.reset();
            toast('تم تغيير كلمة المرور');
        }),
        'set:backup': (form) => withBusy(form.querySelector('[type=submit]'), async () => {
            const pick = formValues(form);
            if (!Object.keys(pick).length) throw new Error('اختر عنصراً واحداً على الأقل.');
            await exportBackup(repo, pick);
            toast('تم تنزيل النسخة الاحتياطية');
        }),
        'set:wipe': async (el) => {
            const ok = await confirmAction({
                title: 'حذف كل البيانات؟',
                message: 'هذا الإجراء نهائي ولا يمكن التراجع عنه. سيُحذف كل شيء في المكتبة.',
                confirmLabel: 'نعم، احذف كل شيء', danger: true,
            });
            if (!ok) return;
            const sure = await confirmAction({ title: 'تأكيد أخير', message: `ستُحذف ${fmtNumber(repo.books.length)} كتاباً و${fmtNumber(repo.members.length)} عضواً. متابعة؟`, confirmLabel: 'حذف نهائي', danger: true });
            if (sure) await withBusy(el, async () => { await repo.clearAllData(); toast('حُذفت كل البيانات'); });
        },
    }, ['click', 'submit']);

    render();
    return { update: (t) => t === 'auth' && render(), destroy: off };
}

async function exportBackup(repo, pick) {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
    const bookName = (id) => repo.book(id)?.name || '-';
    if (pick.books) add('الكتب', [
        ['اسم الكتاب', 'المؤلف', 'القسم', 'المحقق', 'الأجزاء', 'دار النشر', 'السنة', 'النسخ', 'الحالة', 'الصندوق', 'الطاق', 'ملاحظات'],
        ...repo.books.map((b) => [b.name, b.author, b.category, b.editor, b.parts, b.publisher, b.year, b.copies, b.status, b.cabinet, b.shelf, b.notes]),
    ]);
    if (pick.members) add('الأعضاء', [['الاسم', 'الهاتف', 'العنوان'], ...repo.members.map((m) => [m.name, m.phone, m.address])]);
    if (pick.loans) add('الإعارات', [
        ['الكتاب', 'العضو', 'تاريخ الإعارة', 'تاريخ الإرجاع', 'الحالة'],
        ...repo.loans.map((l) => [bookName(l.bookId), repo.member(l.memberId)?.name || '-', l.loanDate || '', l.returnDate || '', l.status]),
    ]);
    if (pick.diary) add('اليوميات', [['التاريخ', 'النوع', 'المحتوى'], ...repo.diary.map((d) => [d.date, d.category, d.content])]);
    if (pick.documents) add('الوثائق', [
        ['العنوان', 'الوصف', 'النوع', 'التاريخ', 'الكتاب المرتبط', 'الملفات'],
        ...repo.documents.map((d) => [d.title, d.description, d.category, d.documentDate || '', d.bookId ? bookName(d.bookId) : '', d.filePaths.join(' | ')]),
    ]);
    XLSX.writeFile(wb, `kutubkhana_backup_${todayIso()}.xlsx`);
}

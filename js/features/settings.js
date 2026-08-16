// Classic global feature implementation.
Object.assign(window.App, {
    renderSettings() {
        const isAdmin = this.isAdmin();
        const adminEl = document.getElementById('settings-admin-only');
        const noAccessEl = document.getElementById('settings-no-access');
        if (adminEl) adminEl.style.display = isAdmin ? 'block' : 'none';
        if (noAccessEl) noAccessEl.style.display = isAdmin ? 'none' : 'block';
        if (isAdmin) this.renderSettingsUsers();
    },

    async renderSettingsUsers() {
        const tbody = document.getElementById('users-tbody');
        const hint = document.getElementById('users-table-hint');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (hint) hint.textContent = 'جارٍ التحميل...';
        try {
            const list = await Promise.resolve(DataManager.listProfiles());
            if (hint) hint.textContent = '';
            if (!list || list.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="empty-state">لا يوجد مستخدمون مسجلون.</td></tr>';
                return;
            }
            const roleLabels = { admin: 'مدير', librarian: 'أمين المكتبة', viewer: 'مشاهد' };
            tbody.innerHTML = list.map((u, i) => `
                <tr data-user-id="${escapeHtml(u.userId)}">
                    <td class="col-num">${i + 1}</td>
                    <td>${escapeHtml(u.email || '')}</td>
                    <td><span class="role-badge role-${escapeHtml(u.role)}">${escapeHtml(roleLabels[u.role] || u.role)}</span></td>
                    <td>
                        <select class="user-role-select" data-user-id="${escapeHtml(u.userId)}" data-current="${escapeHtml(u.role)}">
                            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>مدير</option>
                            <option value="librarian" ${u.role === 'librarian' ? 'selected' : ''}>أمين المكتبة</option>
                            <option value="viewer" ${u.role === 'viewer' ? 'selected' : ''}>مشاهد</option>
                        </select>
                        <button type="button" class="btn btn-sm btn-primary save-role-btn" data-user-id="${escapeHtml(u.userId)}" style="margin-right: 6px;">حفظ</button>
                    </td>
                </tr>
            `).join('');
            tbody.querySelectorAll('.save-role-btn').forEach(btn => {
                btn.addEventListener('click', () => this.saveUserRole(btn.dataset.userId));
            });
            tbody.querySelectorAll('.user-role-select').forEach(sel => {
                sel.addEventListener('change', () => {
                    const row = sel.closest('tr');
                    const saveBtn = row.querySelector('.save-role-btn');
                    if (saveBtn) saveBtn.style.visibility = sel.value !== sel.dataset.current ? 'visible' : 'hidden';
                });
            });
            tbody.querySelectorAll('.save-role-btn').forEach(btn => {
                btn.style.visibility = btn.previousElementSibling?.value === btn.previousElementSibling?.dataset.current ? 'hidden' : 'visible';
            });
        } catch (e) {
            if (hint) hint.textContent = 'فشل تحميل القائمة: ' + (e?.message || e);
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">خطأ في التحميل.</td></tr>';
        }
    },

    async saveUserRole(userId) {
        const row = document.querySelector(`#users-tbody tr[data-user-id="${userId}"]`);
        const select = row?.querySelector('.user-role-select');
        const btn = row?.querySelector('.save-role-btn');
        if (!select || !userId) return;
        const role = select.value;
        try {
            await Promise.resolve(DataManager.updateUserRole(userId, role));
            select.dataset.current = role;
            if (btn) btn.style.visibility = 'hidden';
            this.state.userRole = DataManager.getCurrentUserRole ? DataManager.getCurrentUserRole() : this.state.userRole;
            this.updateNavForRole();
        } catch (e) {
            alert('فشل تحديث الدور: ' + (e?.message || e));
        }
    },

    exportBackupExcel() {
        const books = document.getElementById('backup-books').checked;
        const members = document.getElementById('backup-members').checked;
        const loans = document.getElementById('backup-loans').checked;
        const diary = document.getElementById('backup-diary').checked;
        if (!books && !members && !loans && !diary) {
            alert('اختر عنصراً واحداً على الأقل للتصدير.');
            return;
        }
        if (typeof XLSX === 'undefined') {
            alert('مكتبة Excel غير متوفرة.');
            return;
        }
        const wb = XLSX.utils.book_new();
        if (books) {
            const bookList = DataManager.getBooks();
            const headers = ['اسم الكتاب', 'المؤلف', 'القسم', 'المحقق', 'الأجزاء', 'دار النشر', 'السنة', 'النسخ', 'الحالة', 'الصندوق', 'الطاق', 'ملاحظات'];
            const rows = bookList.map(b => [b.name || '', b.author || '', b.category || '', b.editor || '', b.parts || '', b.publisher || '', b.year || '', b.copies || '', b.status || '', b.cabinet || '', b.shelf || '', b.notes || '']);
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'الكتب');
        }
        if (members) {
            const memberList = DataManager.getMembers();
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
                ['الاسم', 'رقم الهاتف', 'العنوان'],
                ...memberList.map(m => [m.name || '', m.phone || '', m.address || ''])
            ]), 'الأعضاء');
        }
        if (loans) {
            const loanList = DataManager.getLoans();
            const bookList = DataManager.getBooks();
            const memberList = DataManager.getMembers();
            const getBookName = id => (bookList.find(b => b.id === id) || {}).name || '-';
            const getMemberName = id => (memberList.find(m => m.id === id) || {}).name || '-';
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
                ['الكتاب', 'العضو', 'تاريخ الإعارة', 'تاريخ الإرجاع', 'الحالة'],
                ...loanList.map(l => [getBookName(l.bookId), getMemberName(l.memberId), l.loanDate || '', l.returnDate || '', l.status || ''])
            ]), 'الإعارات');
        }
        if (diary) {
            const diaryList = DataManager.getDiary();
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
                ['التاريخ', 'النوع', 'المحتوى'],
                ...diaryList.map(d => [d.date || '', d.category || '', d.content || d.details || ''])
            ]), 'اليوميات');
        }
        XLSX.writeFile(wb, `backup_${new Date().toISOString().split('T')[0]}.xlsx`);
        alert('تم تصدير النسخة الاحتياطية بنجاح.');
    },
});

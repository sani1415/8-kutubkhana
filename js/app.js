/**
 * مكتبة المصباح - Main Application
 * Handles all UI interactions and page management
 */

const App = {
    // Current state
    state: {
        currentPage: 'dashboard',
        booksPage: 1,
        booksPerPage: 100,
        selectedBooks: new Set(),
        selectedMembers: new Set(),
        filters: {},
        expandedLogEntries: new Set(),
        reportsFilter: 'all',
        reportsPage: 1,
        reportsPerPage: 100,
        authorsPage: 1,
        authorsPerPage: 100,
        userRole: 'viewer'
    },

    isAdmin() {
        return (this.state.userRole || DataManager.getCurrentUserRole?.() || 'viewer') === 'admin';
    },

    canEdit() {
        const r = this.state.userRole || DataManager.getCurrentUserRole?.() || 'viewer';
        return r === 'admin' || r === 'librarian';
    },

    // Field labels for reports (key -> Arabic label)
    REPORT_FIELDS: {
        name: 'اسم الكتاب',
        author: 'المؤلف',
        category: 'القسم',
        cabinet: 'الصندوق',
        editor: 'المحقق',
        publisher: 'دار النشر',
        year: 'السنة',
        shelf: 'الطاق',
        notes: 'ملاحظات',
        parts: 'الأجزاء',
        copies: 'النسخ',
        status: 'الحالة'
    },

    // Initialize the application
    init() {
        this.bindEvents();
        this.setupBackToTop();
        this.bindDataReady();
        this.checkAuth();
    },

    bindDataReady() {
        window.addEventListener('datamanager-ready', () => {
            if (this.state.currentPage && document.querySelector('.app-container')?.style.display === 'flex') {
                this.renderPage(this.state.currentPage);
            }
        });
    },

    // ========== AUTHENTICATION ==========
    async checkAuth() {
        const loadingEl = document.getElementById('app-loading');
        const loginEl = document.getElementById('login-page');
        const appEl = document.querySelector('.app-container');
        if (loadingEl) loadingEl.style.display = 'flex';
        if (loginEl) loginEl.style.display = 'none';
        if (appEl) appEl.style.display = 'none';

        await DataManager.ensureReady();
        if (loadingEl) loadingEl.style.display = 'none';
        if (DataManager.isLoggedIn()) {
            this.showApp();
        } else {
            this.showLogin();
        }
    },

    showLogin() {
        document.getElementById('login-page').style.display = '';
        document.getElementById('login-page').classList.add('active');
        document.querySelector('.app-container').style.display = 'none';
        const msgEl = document.getElementById('supabase-required-msg');
        if (msgEl) msgEl.style.display = window.SUPABASE_REQUIRED ? 'block' : 'none';
    },

    showApp() {
        document.getElementById('login-page').style.display = 'none';
        document.getElementById('login-page').classList.remove('active');
        document.querySelector('.app-container').style.display = 'flex';
        DataManager.ensureReady().then(async () => {
            if (DataManager.refreshProfile) await DataManager.refreshProfile();
            this.state.userRole = DataManager.getCurrentUserRole ? DataManager.getCurrentUserRole() : 'viewer';
            this.updateNavForRole();
            this.navigateTo('dashboard');
        });
    },

    updateNavForRole() {
        const canEdit = this.canEdit();
        document.querySelectorAll('.nav-item[data-page="settings"], .mobile-nav-card[data-page="settings"]').forEach(el => {
            el.style.display = ''; // Settings visible to all (change password); admin-only sections hidden inside
        });
        document.querySelectorAll('.nav-item[data-page="add-book"], .mobile-nav-card[data-page="add-book"]').forEach(el => {
            el.style.display = canEdit ? '' : 'none';
        });
        document.querySelectorAll('[data-require-role="edit"]').forEach(el => {
            el.style.display = canEdit ? '' : 'none';
        });
    },

    async handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        try {
            const result = await Promise.resolve(DataManager.login(email, password));
            if (result) {
                this.showApp();
            } else {
                alert('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
            }
        } catch (err) {
            alert(err && err.message ? err.message : 'حدث خطأ. تأكد من إعداد Supabase في js/config.js.');
        }
    },

    async handleLogout() {
        await Promise.resolve(DataManager.logout());
        this.showLogin();
    },

    // ========== NAVIGATION ==========
    navigateTo(page) {
        this.state.currentPage = page;

        // Update nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });
        document.querySelectorAll('.mobile-nav-card').forEach(card => {
            card.classList.toggle('active', card.dataset.page === page);
        });

        // Show/hide pages
        document.querySelectorAll('.page').forEach(p => {
            p.classList.toggle('active', p.id === `${page}-page`);
        });

        // Close mobile menu and backdrop
        document.querySelector('.mobile-nav-menu')?.classList.remove('active');
        document.getElementById('mobile-nav-backdrop')?.classList.remove('active');

        // Render page content
        this.renderPage(page);
    },

    renderPage(page) {
        switch (page) {
            case 'dashboard':
                this.renderDashboard();
                break;
            case 'books':
                document.getElementById('global-search-input').value = this.state.globalSearch || '';
                Object.keys(this.state.filters || {}).forEach(column => {
                    const el = document.querySelector(`.filter-input[data-column="${column}"], .filter-select[data-column="${column}"]`);
                    if (el) el.value = this.state.filters[column] || '';
                });
                this.syncMobileFiltersUI();
                this.renderBooks();
                break;
            case 'add-book':
                this.renderAddBookForm();
                break;
            case 'loans':
                this.renderLoans();
                break;
            case 'diary':
                this.renderDiary();
                break;
            case 'members':
                this.renderMembers();
                break;
            case 'categories':
                this.renderCategories();
                break;
            case 'authors':
                this.renderAuthors();
                break;
            case 'publishers':
                this.renderPublishers();
                break;
            case 'reports':
                this.renderReports();
                break;
            case 'archive':
                this.renderArchive();
                break;
            case 'scan-books':
                this.renderScanBooks();
                break;
            case 'settings':
                this.renderSettings();
                break;
        }
    },

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
                <tr data-user-id="${u.userId}">
                    <td class="col-num">${i + 1}</td>
                    <td>${(u.email || '').replace(/</g, '&lt;')}</td>
                    <td><span class="role-badge role-${u.role}">${roleLabels[u.role] || u.role}</span></td>
                    <td>
                        <select class="user-role-select" data-user-id="${u.userId}" data-current="${u.role}">
                            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>مدير</option>
                            <option value="librarian" ${u.role === 'librarian' ? 'selected' : ''}>أمين المكتبة</option>
                            <option value="viewer" ${u.role === 'viewer' ? 'selected' : ''}>مشاهد</option>
                        </select>
                        <button type="button" class="btn btn-sm btn-primary save-role-btn" data-user-id="${u.userId}" style="margin-right: 6px;">حفظ</button>
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

    async handleChangePassword(e) {
        e.preventDefault();
        const newP = document.getElementById('new-password').value;
        const confirmP = document.getElementById('confirm-password').value;
        if (!newP || newP.length < 6) {
            alert('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.');
            return;
        }
        if (newP !== confirmP) {
            alert('كلمة المرور وتأكيد كلمة المرور غير متطابقتين.');
            return;
        }
        try {
            await Promise.resolve(DataManager.updateOwnPassword(newP));
            document.getElementById('change-password-form').reset();
            alert('تم تغيير كلمة المرور بنجاح.');
        } catch (err) {
            alert('فشل تغيير كلمة المرور: ' + (err?.message || err));
        }
    },

    toggleForgotPasswordForm() {
        const form = document.getElementById('forgot-password-form');
        const wrap = document.querySelector('.login-forgot-wrap');
        if (form.style.display === 'none') {
            form.style.display = 'block';
            if (wrap) wrap.style.display = 'none';
            document.getElementById('forgot-email').value = document.getElementById('login-email').value.trim();
        } else {
            form.style.display = 'none';
            if (wrap) wrap.style.display = 'block';
        }
    },

    async handleSendPasswordReset() {
        const email = document.getElementById('forgot-email').value.trim();
        if (!email) {
            alert('أدخل البريد الإلكتروني.');
            return;
        }
        try {
            await Promise.resolve(DataManager.sendPasswordResetEmail(email));
            alert('تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك. راجع صندوق الوارد واتبع الرابط.');
            this.toggleForgotPasswordForm();
        } catch (err) {
            alert('فشل الإرسال: ' + (err?.message || err));
        }
    },

    // ========== DASHBOARD ==========
    renderDashboard() {
        const stats = DataManager.getStats();

        document.getElementById('total-books').textContent = stats.totalBooks;
        document.getElementById('total-authors').textContent = stats.totalAuthors;
        document.getElementById('total-categories').textContent = stats.totalCategories;
        document.getElementById('total-publishers').textContent = stats.totalPublishers != null ? stats.totalPublishers : 0;
        document.getElementById('books-available').textContent = stats.availableBooks;
        document.getElementById('books-issued').textContent = stats.issuedBooks;
        document.getElementById('total-members').textContent = stats.totalMembers;
    },

    // ========== BOOKS ==========
    renderBooks() {
        const books = this.getFilteredBooks();
        const totalPages = Math.ceil(books.length / this.state.booksPerPage) || 1;

        // Ensure current page is valid
        if (this.state.booksPage > totalPages) {
            this.state.booksPage = totalPages;
        }

        const start = (this.state.booksPage - 1) * this.state.booksPerPage;
        const end = start + this.state.booksPerPage;
        const pageBooks = books.slice(start, end);

        const tbody = document.getElementById('books-tbody');
        const showEdit = this.canEdit();
        const emptyColspan = showEdit ? 14 : 12;
        if (pageBooks.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="${emptyColspan}" class="empty-state">
                        <i class="fas fa-book-open"></i>
                        <p>لا توجد كتب للعرض</p>
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML = pageBooks.map((book, index) => {
                const rowNum = start + index + 1;
                const checkboxTd = showEdit ? `<td><input type="checkbox" class="book-checkbox" value="${book.id}" ${this.state.selectedBooks.has(book.id) ? 'checked' : ''}></td>` : '';
                const actionsTd = showEdit ? `<td><div class="action-btns"><button class="btn btn-sm btn-edit" onclick="App.editBook('${book.id}')" title="تعديل"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-delete" onclick="App.confirmDeleteBook('${book.id}')" title="حذف"><i class="fas fa-trash"></i></button></div></td>` : '';
                return `
                <tr data-id="${book.id}">
                    ${checkboxTd}
                    <td class="col-num">${rowNum}</td>
                    <td class="book-name-highlight">${(book.name || '-').replace(/</g, '&lt;')}</td>
                    <td>${(book.author || '-').replace(/</g, '&lt;')}</td>
                    <td>${(book.category || '-').replace(/</g, '&lt;')}</td>
                    <td>${(book.editor || '-').replace(/</g, '&lt;')}</td>
                    <td>${book.parts || 1}</td>
                    <td>${(book.publisher || '-').replace(/</g, '&lt;')}</td>
                    <td>${book.year || '-'}</td>
                    <td>${book.copies || 1}</td>
                    <td>
                        <span class="status-badge ${book.status === 'معار' ? 'issued' : 'available'}">
                            ${book.status || 'متاح'}
                        </span>
                    </td>
                    <td>${(book.cabinet || '-').replace(/</g, '&lt;')}</td>
                    <td>${(book.shelf || '-').replace(/</g, '&lt;')}</td>
                    ${actionsTd}
                </tr>
            `;
            }).join('');
        }

        // Update pagination
        document.getElementById('page-info').textContent = `صفحة ${this.state.booksPage} من ${totalPages}`;
        document.getElementById('prev-page').disabled = this.state.booksPage === 1;
        document.getElementById('next-page').disabled = this.state.booksPage === totalPages;
        const lastPageBtn = document.getElementById('last-page');
        if (lastPageBtn) lastPageBtn.disabled = this.state.booksPage === totalPages;

        // Update bulk delete button
        this.updateBulkDeleteButton();

        // Render mobile view
        this.renderBooksMobile(books, pageBooks, start, totalPages);
    },

    renderBooksMobile(allBooks, pageBooks, startIndex, totalPages) {
        const mobileList = document.getElementById('books-mobile-list');
        if (!mobileList) return;

        const showEdit = this.canEdit();

        // Update results count
        const countEl = document.getElementById('mobile-results-count');
        if (countEl) {
            countEl.textContent = `عرض ${pageBooks.length} من ${allBooks.length} كتب`;
        }

        if (pageBooks.length === 0) {
            mobileList.innerHTML = `
                <div class="mobile-compact-empty">
                    <i class="fas fa-book-open"></i>
                    <p>لا توجد كتب للعرض</p>
                </div>
            `;
        } else {
            mobileList.innerHTML = pageBooks.map((book, index) => {
                const rowNum = startIndex + index + 1;
                const statusClass = book.status === 'معار' ? 'issued' : 'available';
                const statusText = book.status || 'متاح';
                const esc = (v) => (v || '-').replace(/</g, '&lt;');
                const actionsHtml = showEdit ? `
                    <div class="mobile-compact-actions">
                        <button class="act-edit" onclick="event.stopPropagation(); App.editBook('${book.id}')"><i class="fas fa-pen"></i> تعديل</button>
                        <button class="act-del" onclick="event.stopPropagation(); App.confirmDeleteBook('${book.id}')"><i class="fas fa-trash"></i> حذف</button>
                    </div>` : '';

                return `
                <div class="mobile-compact-item" data-id="${book.id}">
                    <div class="mobile-compact-row" onclick="this.parentElement.classList.toggle('open')">
                        <span class="mobile-compact-num">${rowNum}</span>
                        <div class="mobile-compact-info">
                            <div class="mobile-compact-name">${esc(book.name)}</div>
                            <div class="mobile-compact-sub">${esc(book.author)} · ${esc(book.category)}</div>
                        </div>
                        <span class="mobile-compact-badge ${statusClass}">${statusText}</span>
                        <i class="fas fa-chevron-left mobile-compact-chevron"></i>
                    </div>
                    <div class="mobile-compact-details">
                        <div class="mobile-detail-grid">
                            <div class="mobile-detail-item"><label>المحقق</label><span>${esc(book.editor)}</span></div>
                            <div class="mobile-detail-item"><label>الأجزاء</label><span>${book.parts || 1}</span></div>
                            <div class="mobile-detail-item"><label>دار النشر</label><span>${esc(book.publisher)}</span></div>
                            <div class="mobile-detail-item"><label>السنة</label><span>${book.year || '-'}</span></div>
                            <div class="mobile-detail-item"><label>الصندوق</label><span>${esc(book.cabinet)}</span></div>
                            <div class="mobile-detail-item"><label>الطاق</label><span>${esc(book.shelf)}</span></div>
                        </div>
                        ${actionsHtml}
                    </div>
                </div>`;
            }).join('');
        }

        // Update mobile pagination
        const mobilePageInfo = document.getElementById('mobile-page-info');
        const mobilePrev = document.getElementById('mobile-prev-page');
        const mobileNext = document.getElementById('mobile-next-page');
        if (mobilePageInfo) mobilePageInfo.textContent = `صفحة ${this.state.booksPage} من ${totalPages}`;
        if (mobilePrev) mobilePrev.disabled = this.state.booksPage === 1;
        if (mobileNext) mobileNext.disabled = this.state.booksPage === totalPages;

        // Sync mobile search input with global search
        const mobileSearch = document.getElementById('mobile-book-search');
        if (mobileSearch && document.activeElement !== mobileSearch) {
            mobileSearch.value = this.state.globalSearch || '';
        }

        // Populate category chips dynamically
        this.populateMobileCategoryChips();
    },

    populateMobileCategoryChips() {
        const container = document.getElementById('mobile-cat-chips');
        if (!container) return;

        const categories = DataManager.getCategories();
        const currentCat = (this.state.filters.category || '').toLowerCase();

        const allBtn = `<button class="${!currentCat ? 'active' : ''}" data-cat="">الكل</button>`;
        const catBtns = categories.map(cat =>
            `<button class="${cat.toLowerCase() === currentCat ? 'active' : ''}" data-cat="${cat.replace(/"/g, '&quot;')}">${cat}</button>`
        ).join('');

        container.innerHTML = allBtn + catBtns;
    },

    syncMobileFiltersUI() {
        const mobileSearch = document.getElementById('mobile-book-search');
        if (mobileSearch) mobileSearch.value = this.state.globalSearch || '';

        const statusVal = (this.state.filters.status || '').toLowerCase();
        const statusTabs = document.querySelectorAll('#mobile-status-tabs button');
        statusTabs.forEach(btn => {
            const btnStatus = (btn.dataset.status || '').toLowerCase();
            btn.classList.toggle('active', btnStatus === statusVal);
        });

        const hasActiveFilter = !!(this.state.filters.status || this.state.filters.category);
        const filterBtn = document.getElementById('mobile-filter-toggle');
        if (filterBtn) filterBtn.classList.toggle('has-filter', hasActiveFilter);
    },

    getFilteredBooks() {
        let books = DataManager.getBooks();
        const filters = this.state.filters;
        const q = (this.state.globalSearch || '').trim().toLowerCase();

        if (q) {
            books = books.filter(book => {
                const name = (book.name || '').toLowerCase();
                const author = (book.author || '').toLowerCase();
                const category = (book.category || '').toLowerCase();
                const publisher = (book.publisher || '').toLowerCase();
                const cabinet = (book.cabinet || '').toLowerCase();
                const shelf = (book.shelf || '').toLowerCase();
                return name.includes(q) || author.includes(q) || category.includes(q) || publisher.includes(q) || cabinet.includes(q) || shelf.includes(q);
            });
        }

        Object.keys(filters).forEach(column => {
            const value = filters[column]?.toLowerCase();
            if (value) {
                books = books.filter(book => {
                    const bookValue = String(book[column] || '').toLowerCase();
                    return bookValue.includes(value);
                });
            }
        });

        return books;
    },

    updateBulkDeleteButton() {
        const bulkBtn = document.getElementById('bulk-delete-btn');
        const count = this.state.selectedBooks.size;
        
        if (count > 0) {
            bulkBtn.style.display = 'inline-flex';
            document.getElementById('selected-count').textContent = count;
        } else {
            bulkBtn.style.display = 'none';
        }
    },

    toggleBookSelection(bookId) {
        if (this.state.selectedBooks.has(bookId)) {
            this.state.selectedBooks.delete(bookId);
        } else {
            this.state.selectedBooks.add(bookId);
        }
        this.updateBulkDeleteButton();
    },

    toggleAllBooks(checked) {
        const checkboxes = document.querySelectorAll('.book-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = checked;
            if (checked) {
                this.state.selectedBooks.add(cb.value);
            } else {
                this.state.selectedBooks.delete(cb.value);
            }
        });
        this.updateBulkDeleteButton();
    },

    confirmDeleteBook(bookId) {
        this.showConfirmModal('هل أنت متأكد من حذف هذا الكتاب؟', async () => {
            try {
                await Promise.resolve(DataManager.deleteBook(bookId));
                this.state.selectedBooks.delete(bookId);
                this.renderBooks();
                this.renderDashboard();
            } catch (err) {
                alert(err && err.message ? err.message : 'حدث خطأ عند حذف الكتاب.');
            }
        });
    },

    confirmBulkDeleteBooks() {
        const count = this.state.selectedBooks.size;
        this.showConfirmModal(`هل أنت متأكد من حذف ${count} كتاب؟`, async () => {
            try {
                await Promise.resolve(DataManager.deleteBooks(Array.from(this.state.selectedBooks)));
                this.state.selectedBooks.clear();
                this.renderBooks();
                this.renderDashboard();
            } catch (err) {
                alert(err && err.message ? err.message : 'حدث خطأ عند حذف الكتب.');
            }
        });
    },

    editBook(bookId) {
        const book = DataManager.getBookById(bookId);
        if (!book) return;

        const categories = DataManager.getCategories();
        const publishers = DataManager.getPublishers();

        const modalBody = document.getElementById('modal-body');
        document.getElementById('modal-title').textContent = 'تعديل الكتاب';

        modalBody.innerHTML = `
            <form id="edit-book-form">
                <div class="form-group">
                    <label>اسم الكتاب <span class="required">*</span></label>
                    <input type="text" name="name" value="${book.name || ''}" required>
                </div>
                <div class="form-group">
                    <label>المؤلف <span class="required">*</span></label>
                    <input type="text" name="author" value="${book.author || ''}" required>
                </div>
                <div class="form-group">
                    <label>الصندوق <span class="required">*</span></label>
                    <input type="text" name="cabinet" value="${book.cabinet || ''}" required>
                </div>
                <div class="form-group">
                    <label>الطاق</label>
                    <input type="text" name="shelf" value="${book.shelf || ''}">
                </div>
                <div class="form-group">
                    <label>القسم <span class="required">*</span></label>
                    <select name="category" required>
                        <option value="">اختر القسم</option>
                        ${categories.map(c => `<option value="${c}" ${c === book.category ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>المحقق</label>
                    <input type="text" name="editor" value="${book.editor || ''}">
                </div>
                <div class="form-group">
                    <label>عدد الأجزاء</label>
                    <input type="number" name="parts" value="${book.parts || 1}" min="1">
                </div>
                <div class="form-group">
                    <label>دار النشر</label>
                    <select name="publisher">
                        <option value="">اختر...</option>
                        ${publishers.map(p => `<option value="${p}" ${p === book.publisher ? 'selected' : ''}>${p}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>سنة النشر</label>
                    <input type="number" name="year" value="${book.year || ''}">
                </div>
                <div class="form-group">
                    <label>عدد النسخ</label>
                    <input type="number" name="copies" value="${book.copies || 1}" min="1">
                </div>
                <div class="form-group">
                    <label>الحالة</label>
                    <select name="status">
                        <option value="متاح" ${book.status === 'متاح' ? 'selected' : ''}>متاح</option>
                        <option value="معار" ${book.status === 'معار' ? 'selected' : ''}>معار</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>ملاحظات</label>
                    <textarea name="notes" rows="2">${book.notes || ''}</textarea>
                </div>
                ${(() => {
                    const linked = DataManager.getDocumentsByBookId ? DataManager.getDocumentsByBookId(bookId) : [];
                    if (!linked.length) return '';
                    return `<div class="form-group linked-docs-wrap"><label>الوثائق المرتبطة</label><ul class="linked-docs-list">${linked.map(d => `<li><button type="button" class="btn-link" onclick="App.closeModal(); App.navigateTo('archive'); setTimeout(function(){ App.openViewDocument('${d.id}'); }, 300);">${(d.title || 'وثيقة').replace(/</g, '&lt;')}</button></li>`).join('')}</ul></div>`;
                })()}
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">إلغاء</button>
                    <button type="submit" class="btn btn-primary">حفظ التغييرات</button>
                </div>
            </form>
        `;

        document.getElementById('edit-book-form').onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const updatedData = Object.fromEntries(formData);
            try {
                await Promise.resolve(DataManager.updateBook(bookId, updatedData));
                this.closeModal();
                this.renderBooks();
                this.renderDashboard();
                this.renderReports();
            } catch (err) {
                alert(err && err.message ? err.message : 'حدث خطأ عند حفظ التعديلات.');
            }
        };

        this.openModal();
    },

    // ========== ADD BOOK ==========
    renderAddBookForm() {
        // Populate categories dropdown
        const categorySelect = document.getElementById('book-category');
        const categories = DataManager.getCategories();
        categorySelect.innerHTML = '<option value="">اختر القسم</option>' +
            categories.map(c => `<option value="${c}">${c}</option>`).join('');

        // Populate publishers dropdown
        const publisherSelect = document.getElementById('book-publisher');
        const publishers = DataManager.getPublishers();
        publisherSelect.innerHTML = '<option value="">اختر دار النشر</option>' +
            publishers.map(p => `<option value="${p}">${p}</option>`).join('');
    },

    async handleAddBook(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);

        const book = {
            name: formData.get('bookName'),
            author: formData.get('author'),
            category: formData.get('category'),
            editor: formData.get('editor') || '',
            parts: parseInt(formData.get('parts')) || 1,
            publisher: formData.get('publisher') || '',
            year: formData.get('year') || '',
            copies: parseInt(formData.get('copies')) || 1,
            status: formData.get('status') || 'متاح',
            cabinet: formData.get('cabinet') || '',
            shelf: formData.get('shelf') || '',
            notes: formData.get('notes') || ''
        };

        const existing = DataManager.getBooks().find(b =>
            (b.name || '').trim().toLowerCase() === (book.name || '').trim().toLowerCase() &&
            (b.author || '').trim().toLowerCase() === (book.author || '').trim().toLowerCase()
        );
        if (existing && !confirm(`كتاب مشابه موجود: "${existing.name}" - ${existing.author}.\nهل تريد الإضافة رغم ذلك؟`)) {
            return;
        }

        try {
            await Promise.resolve(DataManager.addBook(book));
            form.reset();
            alert('تمت إضافة الكتاب بنجاح!');
            this.navigateTo('books');
        } catch (err) {
            alert(err && err.message ? err.message : 'حدث خطأ عند إضافة الكتاب.');
        }
    },

    // ========== CSV IMPORT/EXPORT ==========
    exportToCSV() {
        const csv = DataManager.exportBooksToCSV();
        if (!csv) {
            alert('لا توجد كتب للتصدير');
            return;
        }

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `books_export_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    },

    downloadTemplate() {
        const template = DataManager.getCSVTemplate();
        const blob = new Blob(['\ufeff' + template], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'books_template.csv';
        link.click();
    },

    triggerCSVImport() {
        document.getElementById('csv-file-input').click();
    },

    _isExcelImportFile(file) {
        const name = (file?.name || '').toLowerCase();
        return /\.(xlsx|xlsm|xls)$/.test(name);
    },

    _parseExcelWorkbookToCSV(arrayBuffer) {
        if (typeof XLSX === 'undefined') {
            throw new Error('مكتبة Excel غير متوفرة.');
        }
        const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) {
            throw new Error('الملف لا يحتوي على أوراق عمل.');
        }
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
        if (!rows.length) {
            throw new Error('ورقة العمل فارغة.');
        }
        const quoteCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
        return rows
            .map(row => (Array.isArray(row) ? row : []).map(quoteCell).join(','))
            .join('\n');
    },

    _readBookImportText(file) {
        if (this._isExcelImportFile(file)) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        resolve(this._parseExcelWorkbookToCSV(reader.result));
                    } catch (err) {
                        reject(err);
                    }
                };
                reader.onerror = () => reject(new Error('تعذر قراءة ملف Excel.'));
                reader.readAsArrayBuffer(file);
            });
        }
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('تعذر قراءة ملف CSV.'));
            reader.readAsText(file, 'UTF-8');
        });
    },

    async handleCSVImport(e) {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;

        const overlay = document.getElementById('csv-import-overlay');
        const progressText = document.getElementById('csv-import-progress-text');
        const progressBar = document.getElementById('csv-import-progress-bar');
        const onProgress = (done, total) => {
            if (progressText) progressText.textContent = done + ' من ' + total;
            if (progressBar) progressBar.style.width = (total ? Math.min(100, (100 * done) / total) : 0) + '%';
        };

        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
        if (progressText) progressText.textContent = '0 من 0';
        if (progressBar) progressBar.style.width = '0%';
        try {
            const importText = await this._readBookImportText(file);
            const result = await Promise.resolve(DataManager.importBooksFromCSV(importText, onProgress));
            if (result.success) {
                const totalBooks = DataManager.getBooks().length;
                const fileLabel = this._isExcelImportFile(file) ? 'Excel' : 'CSV';
                let msg = `✅ تم استيراد ${fileLabel} بنجاح!\n\n`;
                msg += `📥 نتائج الاستيراد:\n`;
                msg += `• كتب جديدة: ${result.count}\n`;
                msg += `• كتب محدّثة: ${result.updatedCount} (تغيّرت بياناتها)\n`;
                msg += `• بدون تغيير: ${result.unchangedCount || 0} (نفس البيانات)\n`;
                if (result.skipped > 0) msg += `• تم تخطيها: ${result.skipped} (حقول ناقصة)\n`;
                if (result.failCount > 0) msg += `• فشل: ${result.failCount}\n`;
                msg += `\n📚 إجمالي الكتب الآن: ${totalBooks}`;
                if (result.updateDetails && result.updateDetails.length > 0) {
                    msg += `\n\n📝 تفاصيل التحديثات:`;
                    result.updateDetails.slice(0, 10).forEach((item, idx) => {
                        msg += `\n\n${idx + 1}. "${item.bookName}" - ${item.author}`;
                        item.changes.forEach(c => {
                            const oldVal = c.old || '(فارغ)';
                            const newVal = c.new || '(فارغ)';
                            msg += `\n   • ${c.field}: "${oldVal}" ← "${newVal}"`;
                        });
                    });
                    if (result.updateDetails.length > 10) {
                        msg += `\n\n... و ${result.updateDetails.length - 10} كتب أخرى`;
                    }
                }
                alert(msg);
                this.navigateTo('books');
            } else {
                alert(result.message);
            }
        } catch (err) {
            alert('حدث خطأ أثناء الاستيراد: ' + (err?.message || err));
        } finally {
            overlay.classList.remove('active');
            overlay.setAttribute('aria-hidden', 'true');
        }
    },

    // ========== LOANS ==========
    renderLoans() {
        const loans = DataManager.getLoans();
        const tbody = document.getElementById('loans-tbody');

        if (loans.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-state">
                        <i class="fas fa-history"></i>
                        <p>لا توجد إعارات مسجلة</p>
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML = loans.map((loan, index) => {
                const book = DataManager.getBookById(loan.bookId);
                const member = DataManager.getMemberById(loan.memberId);

                return `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${book?.name || 'كتاب محذوف'}</td>
                        <td>${member?.name || 'عضو محذوف'}</td>
                        <td>${loan.loanDate || '-'}</td>
                        <td>${loan.returnDate || '-'}</td>
                        <td>
                            <span class="status-badge ${loan.status === 'معار' ? 'issued' : 'returned'}">
                                ${loan.status}
                            </span>
                        </td>
                        <td>
                            ${this.canEdit() ? `<div class="action-btns">${loan.status === 'معار' ? `<button class="btn btn-sm btn-return" onclick="App.returnLoan('${loan.id}')" title="إرجاع"><i class="fas fa-undo"></i></button>` : ''}<button class="btn btn-sm btn-delete" onclick="App.confirmDeleteLoan('${loan.id}')" title="حذف"><i class="fas fa-trash"></i></button></div>` : '-'}
                        </td>
                    </tr>
                `;
            }).join('');
        }
    },

    openLoanModal() {
        const books = DataManager.getBooks().filter(b => b.status !== 'معار');
        const members = DataManager.getMembers();

        if (books.length === 0) {
            alert('لا توجد كتب متاحة للإعارة');
            return;
        }
        if (members.length === 0) {
            alert('يرجى إضافة أعضاء أولاً');
            return;
        }

        const bookSelect = document.getElementById('loan-book');
        bookSelect.innerHTML = '<option value="">اختر الكتاب</option>' +
            books.map(b => `<option value="${b.id}">${b.name} - ${b.author}</option>`).join('');

        const memberSelect = document.getElementById('loan-member');
        memberSelect.innerHTML = '<option value="">اختر العضو</option>' +
            members.map(m => `<option value="${m.id}">${m.name}</option>`).join('');

        document.getElementById('loan-date').value = new Date().toISOString().split('T')[0];

        document.getElementById('loan-modal-overlay').classList.add('active');
    },

    closeLoanModal() {
        document.getElementById('loan-modal-overlay').classList.remove('active');
    },

    async handleNewLoan(e) {
        e.preventDefault();
        const bookId = document.getElementById('loan-book').value;
        const memberId = document.getElementById('loan-member').value;
        const loanDate = document.getElementById('loan-date').value;

        const loan = {
            bookId,
            memberId,
            loanDate,
            status: 'معار'
        };

        try {
            await Promise.resolve(DataManager.addLoan(loan));
            this.closeLoanModal();
            this.renderLoans();
            this.renderDashboard();
            alert('تمت الإعارة بنجاح!');
        } catch (err) {
            alert(err && err.message ? err.message : 'حدث خطأ عند تسجيل الإعارة.');
        }
    },

    async returnLoan(loanId) {
        await Promise.resolve(DataManager.returnLoan(loanId));
        this.renderLoans();
        this.renderDashboard();
    },

    confirmDeleteLoan(loanId) {
        this.showConfirmModal('هل أنت متأكد من حذف هذا السجل؟', async () => {
            try {
                await Promise.resolve(DataManager.deleteLoan(loanId));
                this.renderLoans();
            } catch (err) {
                alert(err && err.message ? err.message : 'حدث خطأ عند حذف السجل.');
            }
        });
    },

    // ========== DIARY ==========
    renderDiary() {
        const grouped = DataManager.getDiaryGroupedByDate();
        const container = document.getElementById('log-entries');

        const dates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

        if (dates.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-clipboard-list"></i>
                    <p>لا توجد يوميات مسجلة</p>
                </div>
            `;
            return;
        }

        let diaryIndex = 0;
        container.innerHTML = dates.map(date => {
            const entries = grouped[date];
            const isExpanded = this.state.expandedLogEntries.has(date);
            const formattedDate = new Date(date).toLocaleDateString('ar-SA', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            return `
                <div class="log-entry ${isExpanded ? 'expanded' : ''}" data-date="${date}">
                    <div class="log-entry-header" onclick="App.toggleLogEntry('${date}')">
                        <div class="log-entry-date">
                            <i class="fas fa-calendar-alt"></i>
                            <span>${formattedDate}</span>
                            <span>(${entries.length} إدخال)</span>
                        </div>
                        <button class="log-entry-toggle">
                            <i class="fas fa-chevron-down"></i>
                        </button>
                    </div>
                    <div class="log-entry-content">
                        ${entries.map(entry => {
                            diaryIndex++;
                            return `
                            <div class="log-item">
                                <span class="log-item-num">${diaryIndex}</span>
                                <div class="log-item-content">
                                    <span class="log-item-category ${this.getCategoryClass(entry.category)}">
                                        ${entry.category}
                                    </span>
                                    <p class="log-item-text">${entry.content}</p>
                                </div>
                                ${this.canEdit() ? `<div class="log-item-actions"><button class="btn btn-sm btn-edit" onclick="App.editDiaryEntry('${entry.id}')" title="تعديل"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-delete" onclick="App.confirmDeleteDiaryEntry('${entry.id}')" title="حذف"><i class="fas fa-trash"></i></button></div>` : ''}
                            </div>
                        `;
                        }).join('')}
                    </div>
                </div>
            `;
        }).join('');
    },

    getCategoryClass(category) {
        const classes = {
            'ضيف': 'guest',
            'صيانة': 'maintenance',
            'شراء': 'purchase',
            'أخرى': 'other'
        };
        return classes[category] || 'other';
    },

    toggleLogEntry(date) {
        if (this.state.expandedLogEntries.has(date)) {
            this.state.expandedLogEntries.delete(date);
        } else {
            this.state.expandedLogEntries.add(date);
        }
        this.renderDiary();
    },

    async handleAddDiaryEntry() {
        const category = document.getElementById('diary-category').value;
        const content = document.getElementById('new-log-entry').value.trim();

        if (!content) {
            alert('يرجى إدخال محتوى اليومية');
            return;
        }

        await Promise.resolve(DataManager.addDiaryEntry({ category, content }));
        document.getElementById('new-log-entry').value = '';
        this.renderDiary();
    },

    editDiaryEntry(entryId) {
        const diary = DataManager.getDiary();
        const entry = diary.find(e => e.id === entryId);
        if (!entry) return;

        const modalBody = document.getElementById('modal-body');
        document.getElementById('modal-title').textContent = 'تعديل اليومية';

        modalBody.innerHTML = `
            <form id="edit-diary-form">
                <div class="form-group">
                    <label>النوع</label>
                    <select name="category">
                        <option value="ضيف" ${entry.category === 'ضيف' ? 'selected' : ''}>ضيف</option>
                        <option value="صيانة" ${entry.category === 'صيانة' ? 'selected' : ''}>صيانة</option>
                        <option value="شراء" ${entry.category === 'شراء' ? 'selected' : ''}>شراء</option>
                        <option value="أخرى" ${entry.category === 'أخرى' ? 'selected' : ''}>أخرى</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>المحتوى</label>
                    <textarea name="content" rows="4" required>${entry.content}</textarea>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">إلغاء</button>
                    <button type="submit" class="btn btn-primary">حفظ</button>
                </div>
            </form>
        `;

        document.getElementById('edit-diary-form').onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            await Promise.resolve(DataManager.updateDiaryEntry(entryId, {
                category: formData.get('category'),
                content: formData.get('content')
            }));
            this.closeModal();
            this.renderDiary();
        };

        this.openModal();
    },

    confirmDeleteDiaryEntry(entryId) {
        this.showConfirmModal('هل أنت متأكد من حذف هذه اليومية؟', async () => {
            await Promise.resolve(DataManager.deleteDiaryEntry(entryId));
            this.renderDiary();
        });
    },

    // ========== MEMBERS ==========
    renderMembers() {
        const members = DataManager.getMembers();
        const container = document.getElementById('members-list');

        if (members.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <p>لا يوجد أعضاء مسجلين</p>
                </div>
            `;
            document.getElementById('members-bulk-actions').style.display = 'none';
        } else {
            const bulkEl = document.getElementById('members-bulk-actions');
            if (bulkEl) bulkEl.style.display = this.canEdit() ? 'flex' : 'none';
            const showEdit = this.canEdit();
            container.innerHTML = members.map((member, index) => `
                <div class="item-card" data-id="${member.id}">
                    <div class="item-info">
                        <span class="item-number">${index + 1}</span>
                        ${showEdit ? `<input type="checkbox" class="item-checkbox member-checkbox" value="${member.id}" ${this.state.selectedMembers.has(member.id) ? 'checked' : ''}>` : ''}
                        <div class="item-details">
                            <h4>${member.name}</h4>
                            <p>${member.phone || ''} ${member.address ? '• ' + member.address : ''}</p>
                        </div>
                    </div>
                    ${showEdit ? `<div class="item-actions"><button class="btn btn-sm btn-edit" onclick="App.editMember('${member.id}')" title="تعديل"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-delete" onclick="App.confirmDeleteMember('${member.id}')" title="حذف"><i class="fas fa-trash"></i></button></div>` : ''}
                </div>
            `).join('');
        }

        this.updateMembersBulkDelete();
    },

    async handleAddMember() {
        const name = document.getElementById('new-member-name').value.trim();
        const phone = document.getElementById('new-member-phone').value.trim();
        const address = document.getElementById('new-member-address').value.trim();

        if (!name) {
            alert('يرجى إدخال اسم العضو');
            return;
        }

        await Promise.resolve(DataManager.addMember({ name, phone, address }));
        document.getElementById('new-member-name').value = '';
        document.getElementById('new-member-phone').value = '';
        document.getElementById('new-member-address').value = '';
        this.renderMembers();
        this.renderDashboard();
    },

    editMember(memberId) {
        const member = DataManager.getMemberById(memberId);
        if (!member) return;

        const modalBody = document.getElementById('modal-body');
        document.getElementById('modal-title').textContent = 'تعديل العضو';

        modalBody.innerHTML = `
            <form id="edit-member-form">
                <div class="form-group">
                    <label>الاسم <span class="required">*</span></label>
                    <input type="text" name="name" value="${member.name}" required>
                </div>
                <div class="form-group">
                    <label>رقم الهاتف</label>
                    <input type="text" name="phone" value="${member.phone || ''}">
                </div>
                <div class="form-group">
                    <label>العنوان</label>
                    <input type="text" name="address" value="${member.address || ''}">
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">إلغاء</button>
                    <button type="submit" class="btn btn-primary">حفظ</button>
                </div>
            </form>
        `;

        document.getElementById('edit-member-form').onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            await Promise.resolve(DataManager.updateMember(memberId, {
                name: formData.get('name'),
                phone: formData.get('phone'),
                address: formData.get('address')
            }));
            this.closeModal();
            this.renderMembers();
        };

        this.openModal();
    },

    confirmDeleteMember(memberId) {
        const activeLoans = DataManager.getActiveLoans().filter(l => l.memberId === memberId);
        if (activeLoans.length > 0) {
            alert('لا يمكن حذف هذا العضو. يوجد إعارات نشطة له. يرجى إرجاع الكتب أولاً.');
            return;
        }
        this.showConfirmModal('هل أنت متأكد من حذف هذا العضو؟', async () => {
            try {
                await Promise.resolve(DataManager.deleteMember(memberId));
                this.state.selectedMembers.delete(memberId);
                this.renderMembers();
                this.renderDashboard();
            } catch (err) {
                alert(err && err.message ? err.message : 'حدث خطأ عند حذف العضو.');
            }
        });
    },

    toggleMemberSelection(memberId) {
        if (this.state.selectedMembers.has(memberId)) {
            this.state.selectedMembers.delete(memberId);
        } else {
            this.state.selectedMembers.add(memberId);
        }
        this.updateMembersBulkDelete();
    },

    toggleAllMembers(checked) {
        const checkboxes = document.querySelectorAll('.member-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = checked;
            if (checked) {
                this.state.selectedMembers.add(cb.value);
            } else {
                this.state.selectedMembers.delete(cb.value);
            }
        });
        this.updateMembersBulkDelete();
    },

    updateMembersBulkDelete() {
        const count = this.state.selectedMembers.size;
        document.getElementById('selected-members-count').textContent = count;
        document.getElementById('bulk-delete-members-btn').style.display = count > 0 ? 'inline-flex' : 'none';
    },

    confirmBulkDeleteMembers() {
        const ids = Array.from(this.state.selectedMembers);
        const withActive = ids.filter(id => DataManager.getActiveLoans().some(l => l.memberId === id));
        const canDelete = ids.filter(id => !withActive.includes(id));
        if (withActive.length > 0) {
            alert(`لا يمكن حذف ${withActive.length} عضو/أعضاء لأن لديهم إعارات نشطة. يرجى إرجاع الكتب أولاً.\n\nسيتم حذف ${canDelete.length} عضو فقط.`);
            if (canDelete.length === 0) return;
            this.showConfirmModal(`حذف ${canDelete.length} عضو؟`, async () => {
                try {
                    await Promise.resolve(DataManager.deleteMembers(canDelete));
                    this.state.selectedMembers.clear();
                    this.renderMembers();
                    this.renderDashboard();
                } catch (err) {
                    alert(err && err.message ? err.message : 'حدث خطأ عند حذف الأعضاء.');
                }
            });
            return;
        }
        this.showConfirmModal(`هل أنت متأكد من حذف ${ids.length} عضو؟`, async () => {
            try {
                await Promise.resolve(DataManager.deleteMembers(ids));
                this.state.selectedMembers.clear();
                this.renderMembers();
                this.renderDashboard();
            } catch (err) {
                alert(err && err.message ? err.message : 'حدث خطأ عند حذف الأعضاء.');
            }
        });
    },

    // ========== CATEGORIES ==========
    renderCategories() {
        const categories = DataManager.getCategories();
        const books = DataManager.getBooks();
        const container = document.getElementById('categories-list');

        const showEdit = this.canEdit();
        container.innerHTML = categories.map((category, index) => {
            const count = books.filter(b => (b.category || '').trim() === category).length;
            return `
            <div class="item-card">
                <div class="item-info">
                    <span class="item-number">${index + 1}</span>
                    <div class="item-details">
                        <h4>${category.replace(/</g, '&lt;')}</h4>
                        <p class="item-meta">${count} كتب</p>
                    </div>
                </div>
                ${showEdit ? `<div class="item-actions"><button class="btn btn-sm btn-edit" onclick="App.editCategory('${category.replace(/'/g, "\\'")}')" title="تعديل"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-delete" onclick="App.confirmDeleteCategory('${category.replace(/'/g, "\\'")}')" title="حذف"><i class="fas fa-trash"></i></button></div>` : ''}
            </div>
        `;
        }).join('');
    },

    async handleAddCategory() {
        const input = document.getElementById('new-category');
        const name = input.value.trim();

        if (!name) {
            alert('يرجى إدخال اسم القسم');
            return;
        }

        const ok = await Promise.resolve(DataManager.addCategory(name));
        if (ok) {
            input.value = '';
            this.renderCategories();
            this.renderDashboard();
        } else {
            alert('هذا القسم موجود مسبقاً');
        }
    },

    editCategory(oldName) {
        const modalBody = document.getElementById('modal-body');
        document.getElementById('modal-title').textContent = 'تعديل القسم';

        modalBody.innerHTML = `
            <form id="edit-category-form">
                <div class="form-group">
                    <label>اسم القسم <span class="required">*</span></label>
                    <input type="text" name="name" value="${oldName}" required>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">إلغاء</button>
                    <button type="submit" class="btn btn-primary">حفظ</button>
                </div>
            </form>
        `;

        document.getElementById('edit-category-form').onsubmit = async (e) => {
            e.preventDefault();
            const newName = new FormData(e.target).get('name');
            const ok = await Promise.resolve(DataManager.updateCategory(oldName, newName));
            if (ok) {
                this.closeModal();
                this.renderCategories();
            } else {
                alert('فشل في تحديث القسم');
            }
        };

        this.openModal();
    },

    confirmDeleteCategory(category) {
        this.showConfirmModal(`هل أنت متأكد من حذف القسم "${category}"؟`, async () => {
            try {
                await Promise.resolve(DataManager.deleteCategory(category));
                this.renderCategories();
                this.renderDashboard();
            } catch (err) {
                alert(err && err.message ? err.message : 'حدث خطأ عند حذف القسم.');
            }
        });
    },

    // ========== AUTHORS (WRITERS) ==========
    renderAuthors() {
        const books = DataManager.getBooks();
        const byAuthor = {};
        books.forEach(b => {
            const name = (b.author || '').trim();
            if (name) byAuthor[name] = (byAuthor[name] || 0) + 1;
        });
        const allAuthors = Object.keys(byAuthor).sort((a, b) => a.localeCompare(b, 'ar'));
        const totalPages = Math.max(1, Math.ceil(allAuthors.length / this.state.authorsPerPage));
        if (this.state.authorsPage > totalPages) this.state.authorsPage = totalPages;
        const start = (this.state.authorsPage - 1) * this.state.authorsPerPage;
        const end = start + this.state.authorsPerPage;
        const pageAuthors = allAuthors.slice(start, end);

        const container = document.getElementById('authors-list');
        const paginationEl = document.getElementById('authors-pagination');
        const pageInfoEl = document.getElementById('authors-page-info');
        const footerEl = document.getElementById('authors-footer');
        const prevBtn = document.getElementById('authors-prev-page');
        const nextBtn = document.getElementById('authors-next-page');
        const lastBtn = document.getElementById('authors-last-page');
        if (!container) return;

        if (allAuthors.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-edit"></i>
                    <p>لا يوجد مؤلفون مسجلون. ستظهر أسماء المؤلفين هنا عند إضافة كتب.</p>
                </div>
            `;
            if (paginationEl) paginationEl.style.display = 'none';
            if (footerEl) footerEl.textContent = '';
            return;
        }
        if (paginationEl) paginationEl.style.display = 'flex';
        container.innerHTML = pageAuthors.map((author, i) => {
            const count = byAuthor[author];
            const rowNum = start + i + 1;
            const dataAuthor = (author || '').replace(/"/g, '&quot;');
            return `
            <div class="item-card item-card-clickable" data-author="${dataAuthor}" role="button" tabindex="0" title="عرض كتب هذا المؤلف">
                <div class="item-info">
                    <span class="item-number">${rowNum}</span>
                    <div class="item-details">
                        <h4>${author.replace(/</g, '&lt;')}</h4>
                        <p class="item-meta">${count} كتاب</p>
                    </div>
                </div>
                <div class="item-actions">
                    <span class="btn btn-sm btn-secondary"><i class="fas fa-book-open"></i> عرض الكتب</span>
                </div>
            </div>
            `;
        }).join('');

        if (pageInfoEl) pageInfoEl.textContent = `صفحة ${this.state.authorsPage} من ${totalPages}`;
        if (footerEl) footerEl.textContent = `عرض ${start + 1} - ${start + pageAuthors.length} من ${allAuthors.length} مؤلف.`;
        if (prevBtn) prevBtn.disabled = this.state.authorsPage === 1;
        if (nextBtn) nextBtn.disabled = this.state.authorsPage === totalPages;
        if (lastBtn) lastBtn.disabled = this.state.authorsPage === totalPages;
    },

    goToBooksByAuthor(authorName) {
        this.state.filters = { author: authorName };
        this.navigateTo('books');
    },

    // ========== PUBLISHERS ==========
    renderPublishers() {
        const publishers = DataManager.getPublishers();
        const books = DataManager.getBooks();
        const container = document.getElementById('publishers-list');

        const showEdit = this.canEdit();
        container.innerHTML = publishers.map((publisher, index) => {
            const count = books.filter(b => (b.publisher || '').trim() === publisher).length;
            return `
            <div class="item-card">
                <div class="item-info">
                    <span class="item-number">${index + 1}</span>
                    <div class="item-details">
                        <h4>${publisher.replace(/</g, '&lt;')}</h4>
                        <p class="item-meta">${count} كتب</p>
                    </div>
                </div>
                ${showEdit ? `<div class="item-actions"><button class="btn btn-sm btn-edit" onclick="App.editPublisher('${publisher.replace(/'/g, "\\'")}')" title="تعديل"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-delete" onclick="App.confirmDeletePublisher('${publisher.replace(/'/g, "\\'")}')" title="حذف"><i class="fas fa-trash"></i></button></div>` : ''}
            </div>
        `;
        }).join('');
    },

    async handleAddPublisher() {
        const input = document.getElementById('new-publisher');
        const name = input.value.trim();

        if (!name) {
            alert('يرجى إدخال اسم دار النشر');
            return;
        }

        const ok = await Promise.resolve(DataManager.addPublisher(name));
        if (ok) {
            input.value = '';
            this.renderPublishers();
        } else {
            alert('دار النشر هذه موجودة مسبقاً');
        }
    },

    editPublisher(oldName) {
        const modalBody = document.getElementById('modal-body');
        document.getElementById('modal-title').textContent = 'تعديل دار النشر';

        modalBody.innerHTML = `
            <form id="edit-publisher-form">
                <div class="form-group">
                    <label>اسم دار النشر <span class="required">*</span></label>
                    <input type="text" name="name" value="${oldName}" required>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">إلغاء</button>
                    <button type="submit" class="btn btn-primary">حفظ</button>
                </div>
            </form>
        `;

        document.getElementById('edit-publisher-form').onsubmit = async (e) => {
            e.preventDefault();
            const newName = new FormData(e.target).get('name');
            const ok = await Promise.resolve(DataManager.updatePublisher(oldName, newName));
            if (ok) {
                this.closeModal();
                this.renderPublishers();
            } else {
                alert('فشل في تحديث دار النشر');
            }
        };

        this.openModal();
    },

    confirmDeletePublisher(publisher) {
        this.showConfirmModal(`هل أنت متأكد من حذف دار النشر "${publisher}"؟`, async () => {
            try {
                await Promise.resolve(DataManager.deletePublisher(publisher));
                this.renderPublishers();
            } catch (err) {
                alert(err && err.message ? err.message : 'حدث خطأ عند حذف دار النشر.');
            }
        });
    },

    async syncPublishersFromBooks() {
        const result = await Promise.resolve(DataManager.syncPublishersFromBooks());
        this.renderPublishers();
        if (result && result.added > 0) {
            alert(`تمت إضافة ${result.added} دار نشر من قائمة الكتب إلى القائمة.`);
        } else {
            alert('جميع دور النشر الموجودة في الكتب مسجلة مسبقاً في القائمة.');
        }
    },

    // ========== DOCUMENT ARCHIVE ==========
    renderArchive() {
        const listEl = document.getElementById('archive-list');
        if (!listEl) return;
        const search = (document.getElementById('archive-search') && document.getElementById('archive-search').value) || '';
        const catFilter = (document.getElementById('archive-category-filter') && document.getElementById('archive-category-filter').value) || '';
        let docs = DataManager.getDocuments();
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            docs = docs.filter(d => (d.title || '').toLowerCase().includes(q) || (d.description || '').toLowerCase().includes(q));
        }
        if (catFilter) docs = docs.filter(d => (d.category || '') === catFilter);
        const showEdit = this.canEdit();
        const books = DataManager.getBooks();
        const bookName = (id) => { const b = books.find(x => x.id === id); return b ? (b.name || '') : ''; };
        if (docs.length === 0) {
            listEl.innerHTML = '<div class="empty-state"><i class="fas fa-archive"></i><p>لا توجد وثائق.</p><p class="text-muted">اضغط "إضافة وثيقة" لحفظ صور المستندات والأوراق.</p></div>';
            return;
        }
        listEl.innerHTML = docs.map(d => {
            const linked = d.bookId ? bookName(d.bookId) : '';
            const dateStr = d.documentDate ? new Date(d.documentDate).toLocaleDateString('ar-SA') : '';
            const actions = showEdit
                ? `<span class="item-actions"><button type="button" class="btn btn-sm btn-edit" onclick="App.openViewDocument('${d.id}')" title="عرض"><i class="fas fa-eye"></i></button><button type="button" class="btn btn-sm btn-edit" onclick="App.openEditDocument('${d.id}')" title="تعديل"><i class="fas fa-edit"></i></button><button type="button" class="btn btn-sm btn-delete" onclick="App.confirmDeleteDocument('${d.id}')" title="حذف"><i class="fas fa-trash"></i></button></span>`
                : `<span class="item-actions"><button type="button" class="btn btn-sm btn-edit" onclick="App.openViewDocument('${d.id}')" title="عرض"><i class="fas fa-eye"></i></button></span>`;
            return `<div class="archive-card item-card" data-doc-id="${d.id}">
                <div class="archive-card-body">
                    <h3 class="archive-card-title">${(d.title || '').replace(/</g, '&lt;')}</h3>
                    ${d.description ? `<p class="archive-card-desc">${(d.description || '').slice(0, 120).replace(/</g, '&lt;')}${(d.description || '').length > 120 ? '...' : ''}</p>` : ''}
                    <div class="archive-card-meta">
                        <span class="archive-meta-tag">${(d.category || 'أخرى').replace(/</g, '&lt;')}</span>
                        ${dateStr ? `<span>${dateStr}</span>` : ''}
                        ${linked ? `<span><i class="fas fa-book"></i> ${linked.replace(/</g, '&lt;')}</span>` : ''}
                        <span>${(d.filePaths || []).length} ملف</span>
                    </div>
                    ${actions}
                </div>
            </div>`;
        }).join('');
    },

    openAddDocument() {
        const books = DataManager.getBooks();
        const modalBody = document.getElementById('modal-body');
        const modalEl = document.querySelector('#modal-overlay .modal');
        if (modalEl) {
            modalEl.classList.remove('modal--document-view');
            modalEl.classList.add('modal--form');
        }
        document.getElementById('modal-title').textContent = 'إضافة وثيقة';
        modalBody.innerHTML = `
            <form id="add-document-form">
                <div class="form-group">
                    <label>عنوان الوثيقة <span class="required">*</span></label>
                    <input type="text" name="title" required placeholder="مثال: خطاب قديم">
                </div>
                <div class="form-group">
                    <label>الوصف</label>
                    <textarea name="description" rows="2" placeholder="وصف مختصر للبحث لاحقاً"></textarea>
                </div>
                <div class="form-group">
                    <label>القسم</label>
                    <select name="category">
                        <option value="أخرى">أخرى</option>
                        <option value="خطابات">خطابات</option>
                        <option value="عقود">عقود</option>
                        <option value="صور قديمة">صور قديمة</option>
                        <option value="مخطوطات">مخطوطات</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>تاريخ الوثيقة (اختياري)</label>
                    <input type="date" name="documentDate">
                </div>
                <div class="form-group document-book-field">
                    <label>ربط بكتاب (اختياري)</label>
                    <div class="book-select-wrap">
                        <input type="hidden" name="bookId" value="">
                        <button type="button" class="book-select-trigger">اختر كتاباً...</button>
                        <div class="book-select-dropdown">
                            <input type="text" class="book-select-search" placeholder="بحث عن كتاب..." autocomplete="off">
                            <div class="book-select-list"></div>
                        </div>
                    </div>
                </div>
                <div class="form-group">
                    <label>صور/ملفات الوثيقة</label>
                    <input type="file" name="files" accept="image/*,.pdf" multiple>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">إلغاء</button>
                    <button type="submit" class="btn btn-primary">حفظ</button>
                </div>
            </form>`;
        this.setupBookSelect(document.getElementById('add-document-form'), books, null);
        document.getElementById('add-document-form').onsubmit = async (e) => {
            e.preventDefault();
            const form = e.target;
            const fd = new FormData(form);
            const files = form.querySelector('input[name="files"]').files;
            const doc = {
                title: fd.get('title'),
                description: fd.get('description') || '',
                category: fd.get('category') || 'أخرى',
                documentDate: fd.get('documentDate') || null,
                bookId: fd.get('bookId') || null
            };
            try {
                await DataManager.addDocument(doc, files && files.length ? Array.from(files) : []);
                this.closeModal();
                this.renderArchive();
                alert('تمت إضافة الوثيقة.');
            } catch (err) {
                alert(err && err.message ? err.message : 'حدث خطأ عند الإضافة.');
            }
        };
        this.openModal();
    },

    async openViewDocument(id) {
        const doc = DataManager.getDocumentById(id);
        if (!doc) return;
        const books = DataManager.getBooks();
        const bookName = doc.bookId ? (books.find(b => b.id === doc.bookId) || {}).name : '';
        const dateStr = doc.documentDate ? new Date(doc.documentDate).toLocaleDateString('ar-SA') : '';
        const modalBody = document.getElementById('modal-body');
        document.getElementById('modal-title').textContent = (doc.title || 'وثيقة').replace(/</g, '&lt;');
        let imgsHtml = '<p class="text-muted">جاري تحميل الصور...</p>';
        const modalEl = document.querySelector('#modal-overlay .modal');
        if (modalEl) {
            modalEl.classList.remove('modal--form');
            modalEl.classList.add('modal--document-view');
        }
        modalBody.innerHTML = `
            <div class="document-view-meta">
                ${doc.description ? `<p>${(doc.description || '').replace(/</g, '&lt;')}</p>` : ''}
                <p><strong>القسم:</strong> ${(doc.category || 'أخرى').replace(/</g, '&lt;')}${dateStr ? ' | <strong>التاريخ:</strong> ' + dateStr : ''}</p>
                ${bookName ? `<p><strong>الكتاب:</strong> <span class="document-view-book-name">${bookName.replace(/</g, '&lt;')}</span></p>` : ''}
            </div>
            <div id="document-view-files" class="document-view-files">${imgsHtml}</div>
            <div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="App.closeModal()">إغلاق</button></div>`;
        const container = document.getElementById('document-view-files');
        if (doc.filePaths && doc.filePaths.length) {
            const parts = [];
            for (const path of doc.filePaths) {
                const url = await DataManager.getDocumentSignedUrl(path);
                if (url) {
                    const isPdf = path.toLowerCase().endsWith('.pdf');
                    if (isPdf) {
                        parts.push(`<a href="${url}" target="_blank" rel="noopener" class="document-file-link">فتح PDF</a>`);
                    } else {
                        parts.push(`<img src="${url}" alt="" class="document-preview-img" loading="lazy">`);
                    }
                }
            }
            container.innerHTML = parts.length ? parts.join('') : '<p class="text-muted">لا توجد ملفات مرفقة.</p>';
        } else {
            container.innerHTML = '<p class="text-muted">لا توجد ملفات مرفقة.</p>';
        }
        this.openModal();
    },

    openEditDocument(id) {
        const doc = DataManager.getDocumentById(id);
        if (!doc) return;
        const books = DataManager.getBooks();
        const modalBody = document.getElementById('modal-body');
        const modalEl = document.querySelector('#modal-overlay .modal');
        if (modalEl) {
            modalEl.classList.remove('modal--document-view');
            modalEl.classList.add('modal--form');
        }
        document.getElementById('modal-title').textContent = 'تعديل الوثيقة';
        modalBody.innerHTML = `
            <form id="edit-document-form">
                <div class="form-group">
                    <label>عنوان الوثيقة <span class="required">*</span></label>
                    <input type="text" name="title" value="${(doc.title || '').replace(/"/g, '&quot;')}" required>
                </div>
                <div class="form-group">
                    <label>الوصف</label>
                    <textarea name="description" rows="2">${(doc.description || '').replace(/</g, '&lt;')}</textarea>
                </div>
                <div class="form-group">
                    <label>القسم</label>
                    <select name="category">
                        <option value="أخرى" ${doc.category === 'أخرى' ? 'selected' : ''}>أخرى</option>
                        <option value="خطابات" ${doc.category === 'خطابات' ? 'selected' : ''}>خطابات</option>
                        <option value="عقود" ${doc.category === 'عقود' ? 'selected' : ''}>عقود</option>
                        <option value="صور قديمة" ${doc.category === 'صور قديمة' ? 'selected' : ''}>صور قديمة</option>
                        <option value="مخطوطات" ${doc.category === 'مخطوطات' ? 'selected' : ''}>مخطوطات</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>تاريخ الوثيقة</label>
                    <input type="date" name="documentDate" value="${doc.documentDate || ''}">
                </div>
                <div class="form-group document-book-field">
                    <label>ربط بكتاب</label>
                    <div class="book-select-wrap">
                        <input type="hidden" name="bookId" value="${(doc.bookId || '').replace(/"/g, '&quot;')}">
                        <button type="button" class="book-select-trigger">اختر كتاباً...</button>
                        <div class="book-select-dropdown">
                            <input type="text" class="book-select-search" placeholder="بحث عن كتاب..." autocomplete="off">
                            <div class="book-select-list"></div>
                        </div>
                    </div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="App.closeModal()">إلغاء</button>
                    <button type="submit" class="btn btn-primary">حفظ</button>
                </div>
            </form>`;
        this.setupBookSelect(document.getElementById('edit-document-form'), books, doc.bookId || null);
        document.getElementById('edit-document-form').onsubmit = async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            try {
                await DataManager.updateDocument(id, {
                    title: fd.get('title'),
                    description: fd.get('description') || '',
                    category: fd.get('category') || 'أخرى',
                    documentDate: fd.get('documentDate') || null,
                    bookId: fd.get('bookId') || null
                });
                this.closeModal();
                this.renderArchive();
                alert('تم تحديث الوثيقة.');
            } catch (err) {
                alert(err && err.message ? err.message : 'حدث خطأ عند الحفظ.');
            }
        };
        this.openModal();
    },

    setupBookSelect(formEl, books, selectedId) {
        if (!formEl) return;
        const wrap = formEl.querySelector('.book-select-wrap');
        const hiddenInput = formEl.querySelector('input[name="bookId"]');
        const trigger = formEl.querySelector('.book-select-trigger');
        const dropdown = formEl.querySelector('.book-select-dropdown');
        const searchInput = formEl.querySelector('.book-select-search');
        const listEl = formEl.querySelector('.book-select-list');
        if (!wrap || !hiddenInput || !trigger || !dropdown || !searchInput || !listEl) return;

        const esc = (s) => (s || '').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const selectedBook = selectedId ? books.find(b => b.id === selectedId) : null;

        function renderList(filter) {
            const q = (filter || '').trim().toLowerCase();
            const items = books
                .map((b, i) => ({ book: b, num: i + 1, name: (b.name || '').replace(/</g, '&lt;') }))
                .filter(({ name }) => !q || name.toLowerCase().includes(q));
            const clearRow = '<div class="book-select-item book-select-clear" data-id="" role="option">— لا يوجد —</div>';
            listEl.innerHTML = items.length
                ? clearRow + items.map(({ book, num, name }) => `<div class="book-select-item" data-id="${esc(book.id)}" role="option">${num}. ${name}</div>`).join('')
                : '<div class="book-select-empty">لا توجد نتائج</div>';
        }

        function setSelected(book) {
            const id = book ? book.id : '';
            const name = book ? (book.name || '') : '';
            hiddenInput.value = id;
            trigger.textContent = name || 'اختر كتاباً...';
            dropdown.classList.remove('open');
        }

        renderList();
        setSelected(selectedBook);

        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            dropdown.classList.toggle('open');
            if (dropdown.classList.contains('open')) {
                searchInput.value = '';
                renderList();
                searchInput.focus();
            }
        });

        searchInput.addEventListener('input', () => renderList(searchInput.value));
        searchInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') dropdown.classList.remove('open'); });

        listEl.addEventListener('click', (e) => {
            const item = e.target.closest('.book-select-item');
            if (!item) return;
            const id = item.dataset.id || '';
            if (id === '') {
                setSelected(null);
                return;
            }
            const book = books.find(b => b.id === id);
            if (book) setSelected(book);
        });

        document.addEventListener('click', function closeOnOutside(e) {
            if (!wrap.contains(e.target)) {
                dropdown.classList.remove('open');
                document.removeEventListener('click', closeOnOutside);
            }
        });
        setTimeout(() => document.addEventListener('click', closeOnOutside), 0);
    },

    confirmDeleteDocument(id) {
        const doc = DataManager.getDocumentById(id);
        const title = doc ? (doc.title || 'هذه الوثيقة') : 'هذه الوثيقة';
        this.showConfirmModal(`هل أنت متأكد من حذف "${title}"؟`, async () => {
            try {
                await DataManager.deleteDocument(id);
                this.renderArchive();
            } catch (err) {
                alert(err && err.message ? err.message : 'حدث خطأ عند الحذف.');
            }
        });
    },

    // ========== REPORTS ==========
    isBookFieldEmpty(book, key) {
        const v = book[key];
        if (v === undefined || v === null) return true;
        if (typeof v === 'number') return key === 'parts' || key === 'copies' ? (v < 1 || isNaN(v)) : false;
        return String(v).trim() === '';
    },

    getBooksWithMissingInfo() {
        const books = DataManager.getBooks();
        const fields = Object.keys(this.REPORT_FIELDS);
        const rows = [];
        books.forEach(book => {
            const missing = fields.filter(f => this.isBookFieldEmpty(book, f));
            if (missing.length > 0) rows.push({ book, missing });
        });
        return rows;
    },

    getReportSummary() {
        const books = DataManager.getBooks();
        const fields = Object.keys(this.REPORT_FIELDS);
        const missingPerField = {};
        fields.forEach(f => { missingPerField[f] = 0; });
        let complete = 0;
        books.forEach(book => {
            const missing = fields.filter(f => this.isBookFieldEmpty(book, f));
            if (missing.length === 0) complete++;
            missing.forEach(f => { missingPerField[f]++; });
        });
        return { total: books.length, complete, missingPerField };
    },

    renderReports() {
        const summary = this.getReportSummary();
        const currentFilter = this.state.reportsFilter || 'all';
        const summaryEl = document.getElementById('reports-summary');
        if (summaryEl) {
            const missingCount = summary.total - summary.complete;
            const parts = [
                `<div class="report-stat-card"><span class="report-stat-value">${summary.total}</span><span class="report-stat-label">إجمالي الكتب</span></div>`,
                `<div class="report-stat-card"><span class="report-stat-value">${summary.complete}</span><span class="report-stat-label">كتب مكتملة البيانات</span></div>`,
                `<div class="report-stat-card highlight clickable${currentFilter === 'all' ? ' active' : ''}" data-filter="all" role="button" tabindex="0" title="اضغط للتصفية"><span class="report-stat-value">${missingCount}</span><span class="report-stat-label">كتب ناقصة معلومات</span></div>`
            ];
            Object.keys(this.REPORT_FIELDS).forEach(key => {
                const n = summary.missingPerField[key] || 0;
                if (n > 0) {
                    const active = currentFilter === key ? ' active' : '';
                    parts.push(`<div class="report-stat-card small clickable${active}" data-filter="${key}" role="button" tabindex="0" title="اضغط للتصفية"><span class="report-stat-value">${n}</span><span class="report-stat-label">ناقص ${this.REPORT_FIELDS[key]}</span></div>`);
                }
            });
            summaryEl.innerHTML = parts.join('');
        }

        let rows = this.getBooksWithMissingInfo();
        const filter = this.state.reportsFilter || 'all';
        if (filter !== 'all') rows = rows.filter(r => r.missing.includes(filter));

        const totalPages = Math.max(1, Math.ceil(rows.length / this.state.reportsPerPage));
        if (this.state.reportsPage > totalPages) this.state.reportsPage = totalPages;
        const start = (this.state.reportsPage - 1) * this.state.reportsPerPage;
        const end = start + this.state.reportsPerPage;
        const pageRows = rows.slice(start, end);

        const tbody = document.getElementById('reports-tbody');
        const footerEl = document.getElementById('reports-footer');
        const pageInfoEl = document.getElementById('reports-page-info');
        const prevBtn = document.getElementById('reports-prev-page');
        const nextBtn = document.getElementById('reports-next-page');
        const lastBtn = document.getElementById('reports-last-page');
        if (!tbody) return;

        if (rows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><i class="fas fa-check-circle"></i><p>${filter === 'all' ? 'لا توجد كتب ناقصة معلومات.' : 'لا توجد كتب ناقصة الحقل المحدد.'}</p></td></tr>`;
            if (footerEl) footerEl.textContent = '';
            if (pageInfoEl) pageInfoEl.textContent = 'صفحة 1 من 1';
            if (prevBtn) prevBtn.disabled = true;
            if (nextBtn) nextBtn.disabled = true;
            if (lastBtn) lastBtn.disabled = true;
        } else {
            const showEdit = this.canEdit();
            tbody.innerHTML = pageRows.map((r, i) => {
                const rowNum = start + i + 1;
                const missingLabels = r.missing.map(m => this.REPORT_FIELDS[m]).join('، ');
                const editTd = showEdit ? `<td><button type="button" class="btn btn-sm btn-edit" onclick="App.editBook('${r.book.id}')" title="تعديل"><i class="fas fa-edit"></i></button></td>` : '<td>-</td>';
                return `<tr>
                    <td class="col-num">${rowNum}</td>
                    <td class="book-name-highlight">${(r.book.name || '-').replace(/</g, '&lt;')}</td>
                    <td>${(r.book.author || '-').replace(/</g, '&lt;')}</td>
                    <td>${(r.book.category || '-').replace(/</g, '&lt;')}</td>
                    <td class="missing-fields-cell">${missingLabels.replace(/</g, '&lt;')}</td>
                    ${editTd}
                </tr>`;
            }).join('');
            if (footerEl) footerEl.textContent = `عرض ${start + 1} - ${start + pageRows.length} من ${rows.length} كتاب.`;
            if (pageInfoEl) pageInfoEl.textContent = `صفحة ${this.state.reportsPage} من ${totalPages}`;
            if (prevBtn) prevBtn.disabled = this.state.reportsPage === 1;
            if (nextBtn) nextBtn.disabled = this.state.reportsPage === totalPages;
            if (lastBtn) lastBtn.disabled = this.state.reportsPage === totalPages;
        }
    },

    exportReportCSV() {
        let rows = this.getBooksWithMissingInfo();
        const filter = this.state.reportsFilter || 'all';
        if (filter !== 'all') rows = rows.filter(r => r.missing.includes(filter));
        if (rows.length === 0) {
            alert('لا يوجد ما يتم تصديره.');
            return;
        }
        const headers = ['م', 'اسم الكتاب', 'المؤلف', 'القسم', 'الحقول الناقصة'];
        const csvRows = rows.map((r, i) => {
            const missingLabels = r.missing.map(m => this.REPORT_FIELDS[m]).join('؛ ');
            return [i + 1, r.book.name || '', r.book.author || '', r.book.category || '', missingLabels].map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');
        });
        const csv = '\uFEFF' + [headers.join(','), ...csvRows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `تقرير-الكتب-الناقصة-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    },

    // ========== SETTINGS - BACKUP ==========
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
            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
            XLSX.utils.book_append_sheet(wb, ws, 'الكتب');
        }
        if (members) {
            const memberList = DataManager.getMembers();
            const headers = ['الاسم', 'رقم الهاتف', 'العنوان'];
            const rows = memberList.map(m => [m.name || '', m.phone || '', m.address || '']);
            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
            XLSX.utils.book_append_sheet(wb, ws, 'الأعضاء');
        }
        if (loans) {
            const loanList = DataManager.getLoans();
            const bookList = DataManager.getBooks();
            const memberList = DataManager.getMembers();
            const getBookName = id => (bookList.find(b => b.id === id) || {}).name || '-';
            const getMemberName = id => (memberList.find(m => m.id === id) || {}).name || '-';
            const headers = ['الكتاب', 'العضو', 'تاريخ الإعارة', 'تاريخ الإرجاع', 'الحالة'];
            const rows = loanList.map(l => [getBookName(l.bookId), getMemberName(l.memberId), l.loanDate || '', l.returnDate || '', l.status || '']);
            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
            XLSX.utils.book_append_sheet(wb, ws, 'الإعارات');
        }
        if (diary) {
            const diaryList = DataManager.getDiary();
            const headers = ['التاريخ', 'النوع', 'المحتوى'];
            const rows = diaryList.map(d => [d.date || '', d.category || '', (d.content || d.details || '')]);
            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
            XLSX.utils.book_append_sheet(wb, ws, 'اليوميات');
        }
        const name = `backup_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, name);
        alert('تم تصدير النسخة الاحتياطية بنجاح.');
    },

    // ========== MODALS ==========
    openModal() {
        document.getElementById('modal-overlay').classList.add('active');
    },

    closeModal() {
        document.getElementById('modal-overlay').classList.remove('active');
        const modalEl = document.querySelector('#modal-overlay .modal');
        if (modalEl) {
            modalEl.classList.remove('modal--document-view');
            modalEl.classList.remove('modal--form');
        }
    },

    showConfirmModal(message, onConfirm) {
        document.getElementById('confirm-message').textContent = message;
        document.getElementById('confirm-modal-overlay').classList.add('active');

        document.getElementById('confirm-ok').onclick = () => {
            onConfirm();
            document.getElementById('confirm-modal-overlay').classList.remove('active');
        };

        document.getElementById('confirm-cancel').onclick = () => {
            document.getElementById('confirm-modal-overlay').classList.remove('active');
        };
    },

    // ========== BACK TO TOP ==========
    setupBackToTop() {
        const btn = document.getElementById('back-to-top');
        
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                btn.classList.add('visible');
            } else {
                btn.classList.remove('visible');
            }
        });

        btn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    },

    // ========== EVENT BINDING ==========
    bindEvents() {
        // Login form
        document.getElementById('login-form').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('forgot-password-btn').addEventListener('click', () => this.toggleForgotPasswordForm());
        document.getElementById('forgot-cancel-btn').addEventListener('click', () => this.toggleForgotPasswordForm());
        document.getElementById('send-reset-btn').addEventListener('click', () => this.handleSendPasswordReset());
        document.getElementById('change-password-form').addEventListener('submit', (e) => this.handleChangePassword(e));
        // Keep legacy id for logout if present

        // Logout buttons (desktop + mobile)
        document.getElementById('logout-btn').addEventListener('click', () => this.handleLogout());
        const mobileLogoutBtn = document.getElementById('logout-btn-mobile');
        if (mobileLogoutBtn) mobileLogoutBtn.addEventListener('click', () => this.handleLogout());

        // Navigation items (desktop)
        document.querySelectorAll('.navbar-menu .nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                if (page) this.navigateTo(page);
            });
        });

        // Navigation items (mobile)
        document.querySelectorAll('.mobile-nav-card').forEach(card => {
            card.addEventListener('click', () => {
                const page = card.dataset.page;
                if (page) this.navigateTo(page);
            });
        });

        // Mobile menu toggle
        const mobileMenu = document.querySelector('.mobile-nav-menu');
        const mobileBackdrop = document.getElementById('mobile-nav-backdrop');
        document.getElementById('mobile-menu-toggle').addEventListener('click', () => {
            mobileMenu.classList.toggle('active');
            if (mobileBackdrop) mobileBackdrop.classList.toggle('active', mobileMenu.classList.contains('active'));
        });
        if (mobileBackdrop) {
            mobileBackdrop.addEventListener('click', () => {
                mobileMenu.classList.remove('active');
                mobileBackdrop.classList.remove('active');
            });
        }

        // Add book form
        document.getElementById('add-book-form').addEventListener('submit', (e) => this.handleAddBook(e));

        // CSV buttons
        document.getElementById('export-csv-btn').addEventListener('click', () => this.exportToCSV());
        document.getElementById('import-csv-btn').addEventListener('click', () => this.triggerCSVImport());
        document.getElementById('download-template-btn').addEventListener('click', () => this.downloadTemplate());
        document.getElementById('csv-file-input').addEventListener('change', (e) => this.handleCSVImport(e));

        // Books table events
        document.getElementById('select-all-books').addEventListener('change', (e) => {
            this.toggleAllBooks(e.target.checked);
        });

        document.getElementById('books-tbody').addEventListener('change', (e) => {
            if (e.target.classList.contains('book-checkbox')) {
                this.toggleBookSelection(e.target.value);
            }
        });

        document.getElementById('bulk-delete-btn').addEventListener('click', () => this.confirmBulkDeleteBooks());

        // Pagination
        document.getElementById('prev-page').addEventListener('click', () => {
            if (this.state.booksPage > 1) {
                this.state.booksPage--;
                this.renderBooks();
            }
        });

        document.getElementById('next-page').addEventListener('click', () => {
            const books = this.getFilteredBooks();
            const totalPages = Math.ceil(books.length / this.state.booksPerPage);
            if (this.state.booksPage < totalPages) {
                this.state.booksPage++;
                this.renderBooks();
            }
        });

        document.getElementById('last-page').addEventListener('click', () => {
            const books = this.getFilteredBooks();
            const totalPages = Math.ceil(books.length / this.state.booksPerPage) || 1;
            if (this.state.booksPage !== totalPages) {
                this.state.booksPage = totalPages;
                this.renderBooks();
            }
        });

        // Filter inputs
        document.querySelectorAll('.filter-input, .filter-select').forEach(input => {
            input.addEventListener('input', (e) => {
                const column = e.target.dataset.column;
                this.state.filters[column] = e.target.value;
                this.state.booksPage = 1;
                this.renderBooks();
            });
        });

        // Mobile: search input
        const mobileSearchInput = document.getElementById('mobile-book-search');
        if (mobileSearchInput) {
            mobileSearchInput.addEventListener('input', (e) => {
                this.state.globalSearch = e.target.value.trim();
                this.state.booksPage = 1;
                const desktopSearch = document.getElementById('global-search-input');
                if (desktopSearch) desktopSearch.value = this.state.globalSearch;
                this.renderBooks();
            });
        }

        // Mobile: filter drawer toggle
        const mobileFilterBtn = document.getElementById('mobile-filter-toggle');
        if (mobileFilterBtn) {
            mobileFilterBtn.addEventListener('click', () => {
                const drawer = document.getElementById('mobile-filter-drawer');
                if (drawer) {
                    drawer.classList.toggle('open');
                    mobileFilterBtn.classList.toggle('has-filter', drawer.classList.contains('open'));
                }
            });
        }

        // Mobile: status tabs (event delegation)
        const mobileStatusTabs = document.getElementById('mobile-status-tabs');
        if (mobileStatusTabs) {
            mobileStatusTabs.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                if (!btn) return;
                mobileStatusTabs.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const statusVal = btn.dataset.status || '';
                this.state.filters.status = statusVal;
                this.state.booksPage = 1;
                const desktopStatus = document.querySelector('.filter-select[data-column="status"]');
                if (desktopStatus) desktopStatus.value = statusVal;
                this.renderBooks();
            });
        }

        // Mobile: category chips (event delegation)
        const mobileCatChips = document.getElementById('mobile-cat-chips');
        if (mobileCatChips) {
            mobileCatChips.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                if (!btn) return;
                mobileCatChips.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const catVal = btn.dataset.cat || '';
                this.state.filters.category = catVal;
                this.state.booksPage = 1;
                const desktopCat = document.querySelector('.filter-input[data-column="category"]');
                if (desktopCat) desktopCat.value = catVal;
                this.renderBooks();
            });
        }

        // Mobile: pagination
        const mobilePrev = document.getElementById('mobile-prev-page');
        if (mobilePrev) {
            mobilePrev.addEventListener('click', () => {
                if (this.state.booksPage > 1) {
                    this.state.booksPage--;
                    this.renderBooks();
                }
            });
        }
        const mobileNext = document.getElementById('mobile-next-page');
        if (mobileNext) {
            mobileNext.addEventListener('click', () => {
                const books = this.getFilteredBooks();
                const totalPages = Math.ceil(books.length / this.state.booksPerPage);
                if (this.state.booksPage < totalPages) {
                    this.state.booksPage++;
                    this.renderBooks();
                }
            });
        }

        // Loans
        document.getElementById('new-loan-btn').addEventListener('click', () => this.openLoanModal());
        document.getElementById('loan-modal-close').addEventListener('click', () => this.closeLoanModal());
        document.getElementById('loan-form').addEventListener('submit', (e) => this.handleNewLoan(e));

        // Diary
        document.getElementById('add-log-btn').addEventListener('click', () => this.handleAddDiaryEntry());

        // Members
        document.getElementById('add-member-btn').addEventListener('click', () => this.handleAddMember());
        document.getElementById('select-all-members').addEventListener('change', (e) => {
            this.toggleAllMembers(e.target.checked);
        });
        document.getElementById('members-list').addEventListener('change', (e) => {
            if (e.target.classList.contains('member-checkbox')) {
                this.toggleMemberSelection(e.target.value);
            }
        });
        document.getElementById('bulk-delete-members-btn').addEventListener('click', () => this.confirmBulkDeleteMembers());

        // Categories
        document.getElementById('add-category-btn').addEventListener('click', () => this.handleAddCategory());

        // Publishers
        document.getElementById('add-publisher-btn').addEventListener('click', () => this.handleAddPublisher());
        document.getElementById('sync-publishers-from-books-btn').addEventListener('click', () => this.syncPublishersFromBooks());

        // Authors list: click card to open books filtered by that author
        const authorsListEl = document.getElementById('authors-list');
        if (authorsListEl) {
            authorsListEl.addEventListener('click', (e) => {
                const card = e.target.closest('.item-card-clickable[data-author]');
                if (card && card.dataset.author) this.goToBooksByAuthor(card.dataset.author);
            });
            authorsListEl.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                const card = e.target.closest('.item-card-clickable[data-author]');
                if (card && card.dataset.author) { e.preventDefault(); this.goToBooksByAuthor(card.dataset.author); }
            });
        }
        document.getElementById('authors-prev-page').addEventListener('click', () => {
            if (this.state.authorsPage > 1) {
                this.state.authorsPage--;
                this.renderAuthors();
            }
        });
        document.getElementById('authors-next-page').addEventListener('click', () => {
            this.state.authorsPage++;
            this.renderAuthors();
        });
        document.getElementById('authors-last-page').addEventListener('click', () => {
            this.state.authorsPage = 999999;
            this.renderAuthors();
        });

        // Reports: clickable filter cards (event delegation)
        const reportsSummaryEl = document.getElementById('reports-summary');
        if (reportsSummaryEl) {
            reportsSummaryEl.addEventListener('click', (e) => {
                const card = e.target.closest('.report-stat-card.clickable');
                if (!card || !card.dataset.filter) return;
                this.state.reportsFilter = card.dataset.filter;
                this.state.reportsPage = 1;
                this.renderReports();
            });
            reportsSummaryEl.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                const card = e.target.closest('.report-stat-card.clickable');
                if (!card || !card.dataset.filter) return;
                e.preventDefault();
                this.state.reportsFilter = card.dataset.filter;
                this.state.reportsPage = 1;
                this.renderReports();
            });
        }
        const exportReportBtn = document.getElementById('export-report-btn');
        if (exportReportBtn) exportReportBtn.addEventListener('click', () => this.exportReportCSV());
        document.getElementById('reports-prev-page').addEventListener('click', () => {
            if (this.state.reportsPage > 1) {
                this.state.reportsPage--;
                this.renderReports();
            }
        });
        document.getElementById('reports-next-page').addEventListener('click', () => {
            let rows = this.getBooksWithMissingInfo();
            const filter = this.state.reportsFilter || 'all';
            if (filter !== 'all') rows = rows.filter(r => r.missing.includes(filter));
            const totalPages = Math.max(1, Math.ceil(rows.length / this.state.reportsPerPage));
            if (this.state.reportsPage < totalPages) {
                this.state.reportsPage++;
                this.renderReports();
            }
        });
        document.getElementById('reports-last-page').addEventListener('click', () => {
            let rows = this.getBooksWithMissingInfo();
            const filter = this.state.reportsFilter || 'all';
            if (filter !== 'all') rows = rows.filter(r => r.missing.includes(filter));
            const totalPages = Math.max(1, Math.ceil(rows.length / this.state.reportsPerPage));
            if (this.state.reportsPage !== totalPages) {
                this.state.reportsPage = totalPages;
                this.renderReports();
            }
        });

        // Settings - backup export
        document.getElementById('export-backup-btn').addEventListener('click', () => this.exportBackupExcel());

        // Document archive
        const archiveAddBtn = document.getElementById('archive-add-btn');
        if (archiveAddBtn) archiveAddBtn.addEventListener('click', () => this.openAddDocument());
        const archiveSearch = document.getElementById('archive-search');
        if (archiveSearch) archiveSearch.addEventListener('input', () => this.renderArchive());
        const archiveCatFilter = document.getElementById('archive-category-filter');
        if (archiveCatFilter) archiveCatFilter.addEventListener('change', () => this.renderArchive());

        // Settings - delete all data (admin only; strong confirmation)
        document.getElementById('delete-all-data-btn').addEventListener('click', () => {
            if (!this.isAdmin()) {
                alert('صلاحية المدير فقط.');
                return;
            }
            this.showConfirmModal(
                'حذف كل البيانات نهائياً؟ سيتم حذف جميع الكتب والأعضاء والإعارات واليوميات والأقسام ودور النشر. لا يمكن التراجع عن هذا الإجراء.',
                () => {
                    Promise.resolve(DataManager.clearAllData())
                        .then(() => {
                            this.navigateTo('dashboard');
                            this.renderDashboard();
                            this.renderBooks();
                            this.renderMembers();
                            this.renderLoans();
                            this.renderDiary();
                            this.renderCategories();
                            this.renderPublishers();
                            alert('تم حذف كل البيانات.');
                        })
                        .catch(err => alert(err && err.message ? err.message : 'حدث خطأ أثناء الحذف.'));
                }
            );
        });

        // Global search: icon opens popover, submit runs search and closes popover
        const searchInput = document.getElementById('global-search-input');
        const searchPopover = document.getElementById('search-popover');
        const searchToggle = document.getElementById('global-search-toggle');

        const runSearch = () => {
            const q = searchInput.value.trim();
            this.state.globalSearch = q || '';
            searchPopover.classList.remove('active');
            this.navigateTo('books');
        };

        searchToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = searchPopover.classList.toggle('active');
            searchPopover.setAttribute('aria-hidden', !isOpen);
            if (isOpen) {
                const rect = searchToggle.getBoundingClientRect();
                searchPopover.style.top = (rect.bottom + 6) + 'px';
                searchPopover.style.left = rect.left + 'px';
                searchPopover.style.right = 'auto';
                setTimeout(() => searchInput.focus(), 50);
            }
        });

        document.getElementById('global-search-btn').addEventListener('click', runSearch);
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); runSearch(); }
        });

        document.addEventListener('click', (e) => {
            const insidePopover = searchPopover.contains(e.target);
            const onSearchButton = searchToggle === e.target || searchToggle.contains(e.target);
            if (searchPopover.classList.contains('active') && !insidePopover && !onSearchButton) {
                searchPopover.classList.remove('active');
                searchPopover.setAttribute('aria-hidden', 'true');
            }
        });

        // Modal close buttons
        document.getElementById('modal-close').addEventListener('click', () => this.closeModal());
        document.getElementById('modal-overlay').addEventListener('click', (e) => {
            if (e.target === document.getElementById('modal-overlay')) {
                this.closeModal();
            }
        });

        // Confirm modal backdrop click
        document.getElementById('confirm-modal-overlay').addEventListener('click', (e) => {
            if (e.target === document.getElementById('confirm-modal-overlay')) {
                document.getElementById('confirm-modal-overlay').classList.remove('active');
            }
        });

        // Loan modal backdrop click
        document.getElementById('loan-modal-overlay').addEventListener('click', (e) => {
            if (e.target === document.getElementById('loan-modal-overlay')) {
                this.closeLoanModal();
            }
        });

        // Dashboard stat card click (books issued)
        document.getElementById('books-issued-card').addEventListener('click', () => {
            this.state.filters = { status: 'معار' };
            this.navigateTo('books');
            document.querySelector('.filter-select[data-column="status"]').value = 'معار';
        });

        // ========== SCAN BOOKS (Gemini AI) ==========
        this.scanState = { files: [], extractedBooks: [] };

        const scanUploadArea = document.getElementById('scan-upload-area');
        const scanFileInput = document.getElementById('scan-file-input');

        if (scanUploadArea) {
            scanUploadArea.addEventListener('dragover', (e) => { e.preventDefault(); scanUploadArea.classList.add('drag-over'); });
            scanUploadArea.addEventListener('dragleave', () => scanUploadArea.classList.remove('drag-over'));
            scanUploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                scanUploadArea.classList.remove('drag-over');
                this.handleScanFiles(e.dataTransfer.files);
            });
        }
        if (scanFileInput) {
            scanFileInput.addEventListener('change', (e) => {
                this.handleScanFiles(e.target.files);
                e.target.value = '';
            });
        }

        document.getElementById('scan-start-btn')?.addEventListener('click', () => this.startScanExtraction());
        document.getElementById('scan-clear-btn')?.addEventListener('click', () => this.clearScanFiles());
        document.getElementById('scan-save-all-btn')?.addEventListener('click', () => this.saveScanResults());
        document.getElementById('scan-back-btn')?.addEventListener('click', () => this.scanGoBack());
        document.getElementById('scan-again-btn')?.addEventListener('click', () => this.resetScan());
        document.getElementById('scan-go-books-btn')?.addEventListener('click', () => this.navigateTo('books'));
    },

    // ========== SCAN BOOKS METHODS ==========

    renderScanBooks() {
        this.showScanStep('upload');
        if (this.scanState?.files?.length) {
            this.renderScanPreviews();
        }
    },

    getScanBatchDefaults() {
        return {
            cabinet: (document.getElementById('scan-default-cabinet')?.value || '').trim(),
            shelf: (document.getElementById('scan-default-shelf')?.value || '').trim()
        };
    },

    showScanStep(step) {
        ['upload', 'processing', 'review', 'done'].forEach(s => {
            const el = document.getElementById(`scan-${s}-step`);
            if (el) el.style.display = s === step ? '' : 'none';
        });
    },

    handleScanFiles(fileList) {
        if (!this.scanState) this.scanState = { files: [], extractedBooks: [] };
        const newFiles = Array.from(fileList).filter(f => f.type.startsWith('image/'));
        if (!newFiles.length) return;
        this.scanState.files.push(...newFiles);
        this.renderScanPreviews();
        document.getElementById('scan-start-actions').style.display = '';
    },

    renderScanPreviews() {
        const grid = document.getElementById('scan-preview-grid');
        if (!grid) return;
        grid.innerHTML = this.scanState.files.map((file, i) => {
            const url = URL.createObjectURL(file);
            return `
                <div class="scan-preview-item" data-index="${i}">
                    <img src="${url}" alt="${file.name}">
                    <button class="scan-preview-remove" onclick="App.removeScanFile(${i})" title="إزالة">
                        <i class="fas fa-times"></i>
                    </button>
                    <div class="scan-preview-status pending" id="scan-status-${i}">جاهز</div>
                </div>`;
        }).join('');
    },

    removeScanFile(index) {
        this.scanState.files.splice(index, 1);
        this.renderScanPreviews();
        if (!this.scanState.files.length) {
            document.getElementById('scan-start-actions').style.display = 'none';
        }
    },

    clearScanFiles() {
        this.scanState = { files: [], extractedBooks: [] };
        document.getElementById('scan-preview-grid').innerHTML = '';
        document.getElementById('scan-start-actions').style.display = 'none';
    },

    async fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },

    _geminiModels: ['gemini-3.1-flash-lite-preview', 'gemini-2.5-flash'],

    _geminiPrompt: `You are a library data extraction assistant. Analyze this image of a book or books and extract the following information for EACH book visible in the image.

Return a JSON array where each element has these fields:
- "name": Book title (keep original language - Arabic, Bengali, Urdu, English, etc.)
- "author": Author name (keep original language)
- "category": Category/subject (e.g. حديث، فقه، تفسير، سيرة، تاريخ، أدب، تزكية، عام etc.)
- "editor": Editor/Tahqiq (if visible, otherwise empty string)
- "parts": Number of parts/volumes (integer, default 1)
- "publisher": Publisher / publishing house / imprint name only (if visible, otherwise empty string)
- "year": Publication year (use Western/ASCII digits like 2021, not Bengali/Arabic numerals)
- "cabinet": "" (empty, user will fill)
- "shelf": "" (empty, user will fill)

IMPORTANT RULES:
- Return ONLY valid JSON array, no other text or markdown
- If multiple books are visible, return multiple objects
- Keep text in the original language as it appears on the book
- If you cannot read a field clearly, use empty string ""
- For year, always convert to Western digits (e.g. ২০২১ → 2021, ١٤٤٢ → 1442)
- For publisher, extract only the publishing house / organization / imprint name
- Do NOT include proprietor, founder, owner, director, editor, printer, distributor, manager, or other person names in publisher
- If text says things like "owned by", "by", "proprietor", "under supervision of", "managed by", or includes a person's name near the publisher, ignore the person and keep only the publishing house name
- If both a publishing house name and a person's name appear together, prefer only the publishing house name
- If you are not sure whether a person name is part of the brand, prefer the shorter organization name and omit the person name
- If a book appears to be in Bengali, keep Bengali text. If Arabic, keep Arabic.`,

    async callGeminiVision(base64Data, mimeType, statusCallback) {
        const apiKey = window.GEMINI_API_KEY;
        if (!apiKey) throw new Error('مفتاح Gemini API غير موجود في config.js');

        const maxRetries = 3;
        let lastError;

        for (const model of this._geminiModels) {
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{
                                parts: [
                                    { text: this._geminiPrompt },
                                    { inline_data: { mime_type: mimeType, data: base64Data } }
                                ]
                            }],
                            generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
                        })
                    });

                    if (response.status === 429) {
                        const errBody = await response.json().catch(() => ({}));
                        const retryMatch = (errBody.error?.message || '').match(/retry in ([\d.]+)s/i);
                        const waitSec = retryMatch ? Math.min(parseFloat(retryMatch[1]), 60) : (attempt + 1) * 15;
                        if (statusCallback) statusCallback(`تجاوز الحد... إعادة المحاولة بعد ${Math.ceil(waitSec)} ثانية`);
                        await new Promise(r => setTimeout(r, waitSec * 1000));
                        continue;
                    }

                    if (!response.ok) {
                        const err = await response.json().catch(() => ({}));
                        throw new Error(err.error?.message || `Gemini API error: ${response.status}`);
                    }

                    const data = await response.json();
                    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    const jsonMatch = text.match(/\[[\s\S]*\]/);
                    if (!jsonMatch) throw new Error('لم يتم العثور على بيانات في الاستجابة');
                    return JSON.parse(jsonMatch[0]);

                } catch (err) {
                    lastError = err;
                    if (err.message?.includes('429') || err.message?.includes('quota')) {
                        const waitSec = (attempt + 1) * 15;
                        if (statusCallback) statusCallback(`تجاوز الحد... إعادة بعد ${waitSec} ثانية`);
                        await new Promise(r => setTimeout(r, waitSec * 1000));
                        continue;
                    }
                    throw err;
                }
            }
        }
        throw lastError || new Error('فشلت جميع المحاولات');
    },

    async startScanExtraction() {
        const files = this.scanState.files;
        if (!files.length) return;
        const batchDefaults = this.getScanBatchDefaults();

        this.showScanStep('processing');
        this.scanState.extractedBooks = [];
        const progressFill = document.getElementById('scan-progress-fill');
        const progressDetail = document.getElementById('scan-progress-detail');
        const progressText = document.getElementById('scan-progress-text');

        let completed = 0;
        let errors = 0;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const statusEl = document.getElementById(`scan-status-${i}`);
            if (statusEl) {
                statusEl.className = 'scan-preview-status processing';
                statusEl.textContent = 'جاري...';
            }

            progressText.textContent = `جاري تحليل الصورة ${i + 1} من ${files.length}...`;
            progressDetail.textContent = `${i} / ${files.length}`;

            try {
                const base64 = await this.fileToBase64(file);
                const books = await this.callGeminiVision(base64, file.type, (msg) => {
                    progressText.textContent = msg;
                    if (statusEl) statusEl.textContent = 'انتظار...';
                });

                if (Array.isArray(books)) {
                    books.forEach(b => {
                        this.scanState.extractedBooks.push({
                            name: b.name || '',
                            author: b.author || '',
                            category: b.category || '',
                            editor: b.editor || '',
                            parts: parseInt(b.parts) || 1,
                            publisher: b.publisher || '',
                            year: b.year || '',
                            cabinet: batchDefaults.cabinet || b.cabinet || '',
                            shelf: batchDefaults.shelf || b.shelf || ''
                        });
                    });
                }

                if (statusEl) {
                    statusEl.className = 'scan-preview-status done';
                    statusEl.textContent = `✓ ${Array.isArray(books) ? books.length : 0}`;
                }
            } catch (err) {
                console.error(`Error processing image ${i}:`, err);
                errors++;
                if (statusEl) {
                    statusEl.className = 'scan-preview-status error';
                    statusEl.textContent = 'خطأ';
                }
            }

            completed++;
            progressFill.style.width = `${(completed / files.length) * 100}%`;
            progressDetail.textContent = `${completed} / ${files.length}`;
        }

        if (this.scanState.extractedBooks.length > 0) {
            progressText.textContent = 'اكتمل التحليل!';
            setTimeout(() => {
                this.showScanStep('review');
                this.renderScanReviewTable();
            }, 600);
        } else {
            progressText.textContent = errors ? 'حدثت أخطاء أثناء التحليل. حاول مرة أخرى.' : 'لم يتم استخراج أي بيانات.';
            progressFill.style.background = 'var(--danger-color)';
            setTimeout(() => this.showScanStep('upload'), 2000);
        }
    },

    renderScanReviewTable() {
        const tbody = document.getElementById('scan-review-tbody');
        if (!tbody) return;

        tbody.innerHTML = this.scanState.extractedBooks.map((book, i) => `
            <tr data-scan-index="${i}">
                <td class="col-num">${i + 1}</td>
                <td><input type="text" data-field="name" value="${(book.name || '').replace(/"/g, '&quot;')}"></td>
                <td><input type="text" data-field="author" value="${(book.author || '').replace(/"/g, '&quot;')}"></td>
                <td><input type="text" data-field="category" value="${(book.category || '').replace(/"/g, '&quot;')}"></td>
                <td><input type="text" data-field="editor" value="${(book.editor || '').replace(/"/g, '&quot;')}"></td>
                <td><input type="number" data-field="parts" value="${book.parts || 1}" min="1" style="width:60px"></td>
                <td><input type="text" data-field="publisher" value="${(book.publisher || '').replace(/"/g, '&quot;')}"></td>
                <td><input type="text" data-field="year" value="${book.year || ''}" style="width:70px"></td>
                <td><input type="text" data-field="cabinet" value="${(book.cabinet || '').replace(/"/g, '&quot;')}" style="width:70px"></td>
                <td><input type="text" data-field="shelf" value="${(book.shelf || '').replace(/"/g, '&quot;')}" style="width:60px"></td>
                <td><button class="scan-row-delete" onclick="App.removeScanRow(${i})" title="حذف"><i class="fas fa-trash"></i></button></td>
            </tr>
        `).join('');
    },

    removeScanRow(index) {
        this.scanState.extractedBooks.splice(index, 1);
        this.renderScanReviewTable();
        if (!this.scanState.extractedBooks.length) {
            this.showScanStep('upload');
        }
    },

    collectScanEdits() {
        const rows = document.querySelectorAll('#scan-review-tbody tr');
        const books = [];
        rows.forEach(row => {
            const book = {};
            row.querySelectorAll('input').forEach(input => {
                const field = input.dataset.field;
                if (field) {
                    book[field] = field === 'parts' ? (parseInt(input.value) || 1) : input.value.trim();
                }
            });
            if (book.name) books.push(book);
        });
        return books;
    },

    async saveScanResults() {
        const books = this.collectScanEdits();
        if (!books.length) {
            alert('لا توجد كتب للحفظ.');
            return;
        }

        const saveBtn = document.getElementById('scan-save-all-btn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';

        let saved = 0;
        let duplicates = 0;
        let errors = 0;

        for (const book of books) {
            const bookData = {
                name: book.name,
                author: book.author || '',
                category: book.category || '',
                editor: book.editor || '',
                parts: book.parts || 1,
                publisher: book.publisher || '',
                year: book.year || '',
                copies: 1,
                status: 'متاح',
                cabinet: book.cabinet || '',
                shelf: book.shelf || '',
                notes: ''
            };

            const existing = DataManager.getBooks().find(b =>
                (b.name || '').trim().toLowerCase() === (bookData.name || '').trim().toLowerCase() &&
                (b.author || '').trim().toLowerCase() === (bookData.author || '').trim().toLowerCase()
            );

            if (existing) {
                duplicates++;
                continue;
            }

            try {
                await Promise.resolve(DataManager.addBook(bookData));
                const cat = bookData.category?.trim();
                if (cat && !DataManager.getCategories().includes(cat)) {
                    await Promise.resolve(DataManager.addCategory(cat));
                }
                saved++;
            } catch (err) {
                console.error('Error saving book:', err);
                errors++;
            }
        }

        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> حفظ الكل في المكتبة';

        this.showScanStep('done');
        document.getElementById('scan-done-title').textContent = saved > 0 ? 'تم الحفظ بنجاح!' : 'لم يتم حفظ أي كتاب';
        let detail = `تم حفظ ${saved} كتاب`;
        if (duplicates) detail += `، ${duplicates} مكرر (تم تخطيه)`;
        if (errors) detail += `، ${errors} خطأ`;
        document.getElementById('scan-done-detail').textContent = detail;

        const doneIcon = document.querySelector('.scan-done-icon');
        if (doneIcon) {
            doneIcon.className = saved > 0 ? 'fas fa-check-circle scan-done-icon' : 'fas fa-exclamation-circle scan-done-icon';
            doneIcon.style.color = saved > 0 ? '' : 'var(--warning-color)';
        }
    },

    scanGoBack() {
        this.showScanStep('upload');
    },

    resetScan() {
        this.scanState = { files: [], extractedBooks: [] };
        document.getElementById('scan-preview-grid').innerHTML = '';
        document.getElementById('scan-start-actions').style.display = 'none';
        document.getElementById('scan-progress-fill').style.width = '0%';
        document.getElementById('scan-progress-fill').style.background = '';
        const defaultCabinet = document.getElementById('scan-default-cabinet');
        const defaultShelf = document.getElementById('scan-default-shelf');
        if (defaultCabinet) defaultCabinet.value = '';
        if (defaultShelf) defaultShelf.value = '';
        this.showScanStep('upload');
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

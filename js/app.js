/**
 * مكتبة المصباح - Main Application
 * Handles all UI interactions and page management
 */

/**
 * Escape a value for safe use inside HTML (text content or attribute values).
 * Escapes & < > " ' so it is safe in both double- and single-quoted attributes.
 */
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Escape a value for safe use as a JavaScript string literal inside an
 * HTML attribute (e.g. onclick="App.editCategory(...)").
 * Produces a double-quoted JS string, then HTML-escapes it for the attribute.
 */
function escapeJs(value) {
    return escapeHtml(JSON.stringify(String(value ?? '')));
}

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

    updateNavForRole() {
        const canEdit = this.canEdit();
        document.querySelectorAll('.nav-item[data-page="settings"], .mobile-nav-card[data-page="settings"]').forEach(el => {
            el.style.display = '';
        });
        document.querySelectorAll('.nav-item[data-page="add-book"], .mobile-nav-card[data-page="add-book"]').forEach(el => {
            el.style.display = canEdit ? '' : 'none';
        });
        document.querySelectorAll('[data-require-role="edit"]').forEach(el => {
            el.style.display = canEdit ? '' : 'none';
        });
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

    // ========== LOADING OVERLAY ==========
    setLoading(visible, message) {
        const overlay = document.getElementById('app-loading');
        if (!overlay) return;
        if (message) {
            const statusEl = document.getElementById('app-loading-status');
            if (statusEl) statusEl.textContent = message;
        }
        if (visible) {
            overlay.style.display = 'flex';
            requestAnimationFrame(() => overlay.classList.remove('fade-out'));
        } else {
            overlay.classList.add('fade-out');
            setTimeout(() => {
                if (overlay.classList.contains('fade-out')) overlay.style.display = 'none';
            }, 400);
        }
    },

    setLoginBusy(busy) {
        const btn = document.getElementById('login-submit-btn');
        if (!btn) return;
        if (busy) {
            if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري تسجيل الدخول...';
        } else {
            btn.disabled = false;
            if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml;
        }
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
};

window.App = App;

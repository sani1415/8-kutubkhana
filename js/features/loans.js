// Classic global feature implementation.
Object.assign(window.App, {
    renderLoans() {
        const filters = this.state.loanFilters || {};
        let loans = DataManager.getLoans();
        const bookQuery = (filters.bookName || '').trim().toLowerCase();
        const memberQuery = (filters.memberName || '').trim().toLowerCase();
        if (filters.status) loans = loans.filter(l => l.status === filters.status);
        if (bookQuery) {
            loans = loans.filter(l => (DataManager.getBookById(l.bookId)?.name || '').toLowerCase().includes(bookQuery));
        }
        if (memberQuery) {
            loans = loans.filter(l => (DataManager.getMemberById(l.memberId)?.name || '').toLowerCase().includes(memberQuery));
        }
        if (filters.from) loans = loans.filter(l => (l.loanDate || '') >= filters.from);
        if (filters.to) loans = loans.filter(l => (l.loanDate || '') && (l.loanDate || '') <= filters.to);
        const tbody = document.getElementById('loans-tbody');

        if (loans.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-state">
                        <i class="fas fa-history"></i>
                        <p>${DataManager.getLoans().length ? 'لا توجد إعارات مطابقة للتصفية' : 'لا توجد إعارات مسجلة'}</p>
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
                        <td>${escapeHtml(book?.name || 'كتاب محذوف')}</td>
                        <td>${escapeHtml(member?.name || 'عضو محذوف')}</td>
                        <td>${escapeHtml(loan.loanDate || '-')}</td>
                        <td>${escapeHtml(loan.returnDate || '-')}</td>
                        <td>
                            <span class="status-badge ${loan.status === 'معار' ? 'issued' : 'returned'}">
                                ${escapeHtml(loan.status)}
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
        const books = DataManager.getBooks().filter(b => {
            const copies = Math.max(1, parseInt(b.copies, 10) || 1);
            const active = DataManager.getActiveLoanCount ? DataManager.getActiveLoanCount(b.id) : 0;
            return active < copies;
        });
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
            books.map(b => {
                const copies = Math.max(1, parseInt(b.copies, 10) || 1);
                const active = DataManager.getActiveLoanCount ? DataManager.getActiveLoanCount(b.id) : 0;
                const left = copies - active;
                return `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)} - ${escapeHtml(b.author)} (${left}/${copies})</option>`;
            }).join('');

        const memberSelect = document.getElementById('loan-member');
        memberSelect.innerHTML = '<option value="">اختر العضو</option>' +
            members.map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`).join('');

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
});

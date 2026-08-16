// Classic global feature implementation.
Object.assign(window.App, {
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
                const checkboxTd = showEdit ? `<td><input type="checkbox" class="book-checkbox" value="${escapeHtml(book.id)}" ${this.state.selectedBooks.has(book.id) ? 'checked' : ''}></td>` : '';
                const actionsTd = showEdit ? `<td><div class="action-btns"><button class="btn btn-sm btn-edit" onclick="App.editBook('${book.id}')" title="تعديل"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-delete" onclick="App.confirmDeleteBook('${book.id}')" title="حذف"><i class="fas fa-trash"></i></button></div></td>` : '';
                return `
                <tr data-id="${escapeHtml(book.id)}">
                    ${checkboxTd}
                    <td class="col-num">${rowNum}</td>
                    <td class="book-name-highlight">${escapeHtml(book.name || '-')}</td>
                    <td>${escapeHtml(book.author || '-')}</td>
                    <td>${escapeHtml(book.category || '-')}</td>
                    <td>${escapeHtml(book.editor || '-')}</td>
                    <td>${escapeHtml(book.parts || 1)}</td>
                    <td>${escapeHtml(book.publisher || '-')}</td>
                    <td>${escapeHtml(book.year || '-')}</td>
                    <td>${escapeHtml(book.copies || 1)}</td>
                    <td>
                        <span class="status-badge ${book.status === 'معار' ? 'issued' : 'available'}">
                            ${escapeHtml(book.status || 'متاح')}
                        </span>
                    </td>
                    <td>${escapeHtml(book.cabinet || '-')}</td>
                    <td>${escapeHtml(book.shelf || '-')}</td>
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
                const actionsHtml = showEdit ? `
                    <div class="mobile-compact-actions">
                        <button class="act-edit" onclick="event.stopPropagation(); App.editBook('${book.id}')"><i class="fas fa-pen"></i> تعديل</button>
                        <button class="act-del" onclick="event.stopPropagation(); App.confirmDeleteBook('${book.id}')"><i class="fas fa-trash"></i> حذف</button>
                    </div>` : '';

                return `
                <div class="mobile-compact-item" data-id="${escapeHtml(book.id)}">
                    <div class="mobile-compact-row" onclick="this.parentElement.classList.toggle('open')">
                        <span class="mobile-compact-num">${rowNum}</span>
                        <div class="mobile-compact-info">
                            <div class="mobile-compact-name">${escapeHtml(book.name || '-')}</div>
                            <div class="mobile-compact-sub">${escapeHtml(book.author || '-')} · ${escapeHtml(book.category || '-')}</div>
                        </div>
                        <span class="mobile-compact-badge ${statusClass}">${escapeHtml(statusText)}</span>
                        <i class="fas fa-chevron-left mobile-compact-chevron"></i>
                    </div>
                    <div class="mobile-compact-details">
                        <div class="mobile-detail-grid">
                            <div class="mobile-detail-item"><label>المحقق</label><span>${escapeHtml(book.editor || '-')}</span></div>
                            <div class="mobile-detail-item"><label>الأجزاء</label><span>${escapeHtml(book.parts || 1)}</span></div>
                            <div class="mobile-detail-item"><label>دار النشر</label><span>${escapeHtml(book.publisher || '-')}</span></div>
                            <div class="mobile-detail-item"><label>السنة</label><span>${escapeHtml(book.year || '-')}</span></div>
                            <div class="mobile-detail-item"><label>الصندوق</label><span>${escapeHtml(book.cabinet || '-')}</span></div>
                            <div class="mobile-detail-item"><label>الطاق</label><span>${escapeHtml(book.shelf || '-')}</span></div>
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
            `<button class="${cat.toLowerCase() === currentCat ? 'active' : ''}" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`
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
                    <input type="text" name="name" value="${escapeHtml(book.name || '')}" required>
                </div>
                <div class="form-group">
                    <label>المؤلف <span class="required">*</span></label>
                    <input type="text" name="author" value="${escapeHtml(book.author || '')}" required>
                </div>
                <div class="form-group">
                    <label>الصندوق <span class="required">*</span></label>
                    <input type="text" name="cabinet" value="${escapeHtml(book.cabinet || '')}" required>
                </div>
                <div class="form-group">
                    <label>الطاق</label>
                    <input type="text" name="shelf" value="${escapeHtml(book.shelf || '')}">
                </div>
                <div class="form-group">
                    <label>القسم <span class="required">*</span></label>
                    <select name="category" required>
                        <option value="">اختر القسم</option>
                        ${categories.map(c => `<option value="${escapeHtml(c)}" ${c === book.category ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>المحقق</label>
                    <input type="text" name="editor" value="${escapeHtml(book.editor || '')}">
                </div>
                <div class="form-group">
                    <label>عدد الأجزاء</label>
                    <input type="number" name="parts" value="${escapeHtml(book.parts || 1)}" min="1">
                </div>
                <div class="form-group">
                    <label>دار النشر</label>
                    <select name="publisher">
                        <option value="">اختر...</option>
                        ${publishers.map(p => `<option value="${escapeHtml(p)}" ${p === book.publisher ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>سنة النشر</label>
                    <input type="number" name="year" value="${escapeHtml(book.year || '')}">
                </div>
                <div class="form-group">
                    <label>عدد النسخ</label>
                    <input type="number" name="copies" value="${escapeHtml(book.copies || 1)}" min="1">
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
                    <textarea name="notes" rows="2">${escapeHtml(book.notes || '')}</textarea>
                </div>
                ${(() => {
                    const linked = DataManager.getDocumentsByBookId ? DataManager.getDocumentsByBookId(bookId) : [];
                    if (!linked.length) return '';
                    return `<div class="form-group linked-docs-wrap"><label>الوثائق المرتبطة</label><ul class="linked-docs-list">${linked.map(d => `<li><button type="button" class="btn-link" onclick="App.closeModal(); App.navigateTo('archive'); setTimeout(function(){ App.openViewDocument('${d.id}'); }, 300);">${escapeHtml(d.title || 'وثيقة')}</button></li>`).join('')}</ul></div>`;
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
            categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

        // Populate publishers dropdown
        const publisherSelect = document.getElementById('book-publisher');
        const publishers = DataManager.getPublishers();
        publisherSelect.innerHTML = '<option value="">اختر دار النشر</option>' +
            publishers.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
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

});

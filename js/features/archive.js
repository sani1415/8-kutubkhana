// Classic global feature implementation.
Object.assign(window.App, {
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
            return `<div class="archive-card item-card" data-doc-id="${escapeHtml(d.id)}">
                <div class="archive-card-body">
                    <h3 class="archive-card-title">${escapeHtml(d.title || '')}</h3>
                    ${d.description ? `<p class="archive-card-desc">${escapeHtml((d.description || '').slice(0, 120))}${(d.description || '').length > 120 ? '...' : ''}</p>` : ''}
                    <div class="archive-card-meta">
                        <span class="archive-meta-tag">${escapeHtml(d.category || 'أخرى')}</span>
                        ${dateStr ? `<span>${escapeHtml(dateStr)}</span>` : ''}
                        ${linked ? `<span><i class="fas fa-book"></i> ${escapeHtml(linked)}</span>` : ''}
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
        document.getElementById('modal-title').textContent = doc.title || 'وثيقة';
        let imgsHtml = '<p class="text-muted">جاري تحميل الصور...</p>';
        const modalEl = document.querySelector('#modal-overlay .modal');
        if (modalEl) {
            modalEl.classList.remove('modal--form');
            modalEl.classList.add('modal--document-view');
        }
        modalBody.innerHTML = `
            <div class="document-view-meta">
                ${doc.description ? `<p>${escapeHtml(doc.description)}</p>` : ''}
                <p><strong>القسم:</strong> ${escapeHtml(doc.category || 'أخرى')}${dateStr ? ' | <strong>التاريخ:</strong> ' + escapeHtml(dateStr) : ''}</p>
                ${bookName ? `<p><strong>الكتاب:</strong> <span class="document-view-book-name">${escapeHtml(bookName)}</span></p>` : ''}
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
                    <input type="text" name="title" value="${escapeHtml(doc.title || '')}" required>
                </div>
                <div class="form-group">
                    <label>الوصف</label>
                    <textarea name="description" rows="2">${escapeHtml(doc.description || '')}</textarea>
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
                    <input type="date" name="documentDate" value="${escapeHtml(doc.documentDate || '')}">
                </div>
                <div class="form-group document-book-field">
                    <label>ربط بكتاب</label>
                    <div class="book-select-wrap">
                        <input type="hidden" name="bookId" value="${escapeHtml(doc.bookId || '')}">
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

        const selectedBook = selectedId ? books.find(b => b.id === selectedId) : null;

        function renderList(filter) {
            const q = (filter || '').trim().toLowerCase();
            const items = books
                .map((b, i) => ({ book: b, num: i + 1 }))
                .filter(({ book }) => !q || (book.name || '').toLowerCase().includes(q));
            const clearRow = '<div class="book-select-item book-select-clear" data-id="" role="option">— لا يوجد —</div>';
            listEl.innerHTML = items.length
                ? clearRow + items.map(({ book, num }) => `<div class="book-select-item" data-id="${escapeHtml(book.id)}" role="option">${num}. ${escapeHtml(book.name)}</div>`).join('')
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
});

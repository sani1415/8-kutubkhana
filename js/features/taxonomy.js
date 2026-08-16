// Classic global feature implementation.
Object.assign(window.App, {
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
                        <h4>${escapeHtml(category)}</h4>
                        <p class="item-meta">${count} كتب</p>
                    </div>
                </div>
                ${showEdit ? `<div class="item-actions"><button class="btn btn-sm btn-edit" onclick="App.editCategory(${escapeJs(category)})" title="تعديل"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-delete" onclick="App.confirmDeleteCategory(${escapeJs(category)})" title="حذف"><i class="fas fa-trash"></i></button></div>` : ''}
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
                    <input type="text" name="name" value="${escapeHtml(oldName)}" required>
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
            const dataAuthor = escapeHtml(author);
            return `
            <div class="item-card item-card-clickable" data-author="${dataAuthor}" role="button" tabindex="0" title="عرض كتب هذا المؤلف">
                <div class="item-info">
                    <span class="item-number">${rowNum}</span>
                    <div class="item-details">
                        <h4>${escapeHtml(author)}</h4>
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
                        <h4>${escapeHtml(publisher)}</h4>
                        <p class="item-meta">${count} كتب</p>
                    </div>
                </div>
                ${showEdit ? `<div class="item-actions"><button class="btn btn-sm btn-edit" onclick="App.editPublisher(${escapeJs(publisher)})" title="تعديل"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-delete" onclick="App.confirmDeletePublisher(${escapeJs(publisher)})" title="حذف"><i class="fas fa-trash"></i></button></div>` : ''}
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
                    <input type="text" name="name" value="${escapeHtml(oldName)}" required>
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
});

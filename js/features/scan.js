// Classic global feature implementation.
Object.assign(window.App, {

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
                    <img src="${url}" alt="${escapeHtml(file.name)}">
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

    /**
     * Downscale a photo client-side before sending it to the scan-books
     * Edge Function. Keeps the request body small (Edge Function limit)
     * and makes Gemini calls faster/cheaper.
     */
    async compressImageForScan(file, maxDim = 1600, quality = 0.85) {
        const bitmap = await createImageBitmap(file).catch(() => null);
        if (!bitmap) {
            return { base64: await this.fileToBase64(file), mimeType: file.type || 'image/jpeg' };
        }
        const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
        const w = Math.max(1, Math.round(bitmap.width * scale));
        const h = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
        if (bitmap.close) bitmap.close();
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        return { base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' };
    },

    /**
     * Calls the scan-books Supabase Edge Function, which holds the Gemini
     * API key server-side. Requires a logged-in Supabase user with an
     * edit role (admin/librarian).
     */
    async callScanBooksFunction(base64Data, mimeType, statusCallback) {
        if (!window.supabaseClient) {
            throw new Error('المسح الضوئي يتطلب تسجيل الدخول (وضع Supabase).');
        }

        let lastError;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const { data, error } = await window.supabaseClient.functions.invoke('scan-books', {
                    body: { image: { base64: base64Data, mimeType } }
                });

                if (error) {
                    let msg = error.message || 'فشل تحليل الصورة';
                    if (error.context && typeof error.context.json === 'function') {
                        try {
                            const j = await error.context.json();
                            if (j && j.error) msg = j.error;
                        } catch (_) { /* keep default message */ }
                    }
                    throw new Error(msg);
                }

                return Array.isArray(data && data.books) ? data.books : [];
            } catch (err) {
                lastError = err;
                const retriable = /network|fetch|timeout|load failed/i.test(err && err.message ? err.message : '');
                if (retriable && attempt === 0) {
                    if (statusCallback) statusCallback('إعادة المحاولة...');
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                throw err;
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
                const { base64, mimeType } = await this.compressImageForScan(file);
                const books = await this.callScanBooksFunction(base64, mimeType, (msg) => {
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
                <td><input type="text" data-field="name" value="${escapeHtml(book.name || '')}"></td>
                <td><input type="text" data-field="author" value="${escapeHtml(book.author || '')}"></td>
                <td><input type="text" data-field="category" value="${escapeHtml(book.category || '')}"></td>
                <td><input type="text" data-field="editor" value="${escapeHtml(book.editor || '')}"></td>
                <td><input type="number" data-field="parts" value="${escapeHtml(book.parts || 1)}" min="1" style="width:60px"></td>
                <td><input type="text" data-field="publisher" value="${escapeHtml(book.publisher || '')}"></td>
                <td><input type="text" data-field="year" value="${escapeHtml(book.year || '')}" style="width:70px"></td>
                <td><input type="text" data-field="cabinet" value="${escapeHtml(book.cabinet || '')}" style="width:70px"></td>
                <td><input type="text" data-field="shelf" value="${escapeHtml(book.shelf || '')}" style="width:60px"></td>
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
});

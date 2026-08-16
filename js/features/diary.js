// Classic global feature implementation.
Object.assign(window.App, {
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
                <div class="log-entry ${isExpanded ? 'expanded' : ''}" data-date="${escapeHtml(date)}">
                    <div class="log-entry-header" onclick="App.toggleLogEntry('${date}')">
                        <div class="log-entry-date">
                            <i class="fas fa-calendar-alt"></i>
                            <span>${escapeHtml(formattedDate)}</span>
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
                                        ${escapeHtml(entry.category)}
                                    </span>
                                    <p class="log-item-text">${escapeHtml(entry.content)}</p>
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
                    <textarea name="content" rows="4" required>${escapeHtml(entry.content)}</textarea>
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
});

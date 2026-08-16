// Classic global feature implementation.
Object.assign(window.App, {
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
                <div class="item-card" data-id="${escapeHtml(member.id)}">
                    <div class="item-info">
                        <span class="item-number">${index + 1}</span>
                        ${showEdit ? `<input type="checkbox" class="item-checkbox member-checkbox" value="${escapeHtml(member.id)}" ${this.state.selectedMembers.has(member.id) ? 'checked' : ''}>` : ''}
                        <div class="item-details">
                            <h4>${escapeHtml(member.name)}</h4>
                            <p>${escapeHtml(member.phone || '')} ${member.address ? '• ' + escapeHtml(member.address) : ''}</p>
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
                    <input type="text" name="name" value="${escapeHtml(member.name)}" required>
                </div>
                <div class="form-group">
                    <label>رقم الهاتف</label>
                    <input type="text" name="phone" value="${escapeHtml(member.phone || '')}">
                </div>
                <div class="form-group">
                    <label>العنوان</label>
                    <input type="text" name="address" value="${escapeHtml(member.address || '')}">
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
});

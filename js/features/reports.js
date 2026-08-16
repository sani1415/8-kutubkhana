// Classic global feature implementation.
Object.assign(window.App, {
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
                    <td class="book-name-highlight">${escapeHtml(r.book.name || '-')}</td>
                    <td>${escapeHtml(r.book.author || '-')}</td>
                    <td>${escapeHtml(r.book.category || '-')}</td>
                    <td class="missing-fields-cell">${escapeHtml(missingLabels)}</td>
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
});

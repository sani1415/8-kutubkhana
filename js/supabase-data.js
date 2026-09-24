/**
 * مكتبة المصباح - Supabase data layer
 * Same API as DataManager but backed by Supabase; uses in-memory cache and async init.
 */
(function () {
    if (typeof window === 'undefined' || !window.supabaseClient) return;

    const sb = window.supabaseClient;

    const T = {
        profiles: 'ktb_profiles',
        books: 'ktb_books',
        members: 'ktb_members',
        loans: 'ktb_loans',
        diary: 'ktb_diary_entries',
        categories: 'ktb_categories',
        publishers: 'ktb_publishers',
        documents: 'ktb_documents'
    };

    function mapBook(row) {
        if (!row) return null;
        return {
            id: row.id,
            name: row.name || '',
            author: row.author || '',
            category: row.category || '',
            editor: row.editor || '',
            parts: row.parts != null ? row.parts : 1,
            publisher: row.publisher || '',
            year: row.year || '',
            copies: row.copies != null ? row.copies : 1,
            status: row.status || 'متاح',
            cabinet: row.cabinet || '',
            shelf: row.shelf || '',
            notes: row.notes || '',
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    function mapMember(row) {
        if (!row) return null;
        return {
            id: row.id,
            name: row.name || '',
            phone: row.phone || '',
            address: row.address || '',
            createdAt: row.created_at
        };
    }

    function mapLoan(row) {
        if (!row) return null;
        return {
            id: row.id,
            bookId: row.book_id,
            memberId: row.member_id,
            loanDate: row.loan_date,
            returnDate: row.return_date,
            status: row.status || 'معار',
            createdAt: row.created_at
        };
    }

    function mapDiary(row) {
        if (!row) return null;
        return {
            id: row.id,
            date: row.date,
            category: row.category || 'أخرى',
            content: row.details || '',
            details: row.details || '',
            images: row.images || '',
            createdAt: row.created_at
        };
    }

    const cache = {
        books: [],
        members: [],
        loans: [],
        diary: [],
        documents: [],
        categories: [],
        publishers: []
    };

    const DOCUMENT_ARCHIVE_BUCKET = 'ktb-document-archive';

    let readyPromise = null;
    let authUser = null;
    let currentUserProfile = null;

    const PAGE_SIZE = 1000;

    function validateBook(book, forUpdate) {
        const name = (book.name || '').trim();
        const author = (book.author || '').trim();
        const category = (book.category || '').trim();
        const cabinet = (book.cabinet || '').trim();
        if (!name) throw new Error('اسم الكتاب مطلوب');
        if (!author) throw new Error('المؤلف مطلوب');
        if (!category) throw new Error('القسم مطلوب');
        if (!cabinet) throw new Error('الصندوق مطلوب');
        const parts = book.parts != null ? Number(book.parts) : 1;
        const copies = book.copies != null ? Number(book.copies) : 1;
        if (!Number.isInteger(parts) || parts < 1) throw new Error('عدد الأجزاء يجب أن يكون 1 أو أكثر');
        if (!Number.isInteger(copies) || copies < 1) throw new Error('عدد النسخ يجب أن يكون 1 أو أكثر');
    }

    function activeLoanCount(bookId) {
        return cache.loans.filter(l => l.bookId === bookId && l.status === 'معار').length;
    }

    function statusForCopies(bookId, copies) {
        const n = Math.max(1, parseInt(copies, 10) || 1);
        return activeLoanCount(bookId) >= n ? 'معار' : 'متاح';
    }

    async function ensureProfile() {
        if (!authUser) return;
        const uid = authUser.id;
        const email = authUser.email || '';
        const { data: existing } = await sb.from(T.profiles).select('*').eq('user_id', uid).maybeSingle();
        if (existing) {
            currentUserProfile = { user_id: existing.user_id, email: existing.email || '', role: existing.role || 'viewer', display_name: existing.display_name || '' };
            return;
        }
        const { data: inserted, error } = await sb.from(T.profiles).insert({ user_id: uid, email, role: 'viewer' }).select().single();
        if (error) {
            if (error.code === '23505') {
                const { data: row } = await sb.from(T.profiles).select('*').eq('user_id', uid).single();
                if (row) currentUserProfile = { user_id: row.user_id, email: row.email || '', role: row.role || 'viewer', display_name: row.display_name || '' };
            }
            return;
        }
        currentUserProfile = inserted ? { user_id: inserted.user_id, email: inserted.email || '', role: inserted.role || 'viewer', display_name: inserted.display_name || '' } : null;
    }

    async function fetchAllFromTable(table, orderBy, ascending = false) {
        const all = [];
        let from = 0;
        let hasMore = true;
        while (hasMore) {
            const to = from + PAGE_SIZE - 1;
            const { data, error } = await sb.from(table).select('*').order(orderBy, { ascending }).range(from, to);
            if (error) throw error;
            const rows = data || [];
            all.push(...rows);
            hasMore = rows.length === PAGE_SIZE;
            from += PAGE_SIZE;
        }
        return all;
    }

    function mapDocument(row) {
        if (!row) return null;
        const paths = row.file_paths;
        return {
            id: row.id,
            title: row.title || '',
            description: row.description || '',
            category: row.category || 'أخرى',
            documentDate: row.document_date,
            bookId: row.book_id || null,
            filePaths: Array.isArray(paths) ? paths : (paths ? JSON.parse(paths) : []),
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    async function fetchAll() {
        const [booksRows, membersRows, loansRows, diaryRows, catRes, pubRes, docsRes] = await Promise.all([
            fetchAllFromTable(T.books, 'created_at', false),
            fetchAllFromTable(T.members, 'created_at', false),
            fetchAllFromTable(T.loans, 'created_at', false),
            fetchAllFromTable(T.diary, 'created_at', false),
            sb.from(T.categories).select('name').order('name'),
            sb.from(T.publishers).select('name').order('name'),
            fetchAllFromTable(T.documents, 'created_at', false)
        ]);
        if (catRes.error) throw catRes.error;
        if (pubRes.error) throw pubRes.error;
        cache.books = booksRows.map(mapBook);
        cache.members = membersRows.map(mapMember);
        cache.loans = loansRows.map(mapLoan);
        cache.diary = diaryRows.map(mapDiary);
        cache.documents = (docsRes || []).map(mapDocument);
        cache.categories = (catRes.data || []).map(r => r.name);
        cache.publishers = (pubRes.data || []).map(r => r.name);
    }

    function dispatchDataReady() {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('datamanager-ready'));
        }
    }

    async function loadDataWhenLoggedIn() {
        if (!authUser) return;
        try {
            await ensureProfile();
            await fetchAll();
            dispatchDataReady();
        } catch (err) {
            dispatchDataReady();
            throw err;
        }
    }

    window.SupabaseDataManager = {
        KEYS: {},

        init() {
            if (!readyPromise) {
                readyPromise = (async () => {
                    const { data: { session } } = await sb.auth.getSession();
                    authUser = session?.user ?? null;
                    sb.auth.onAuthStateChange(async (_event, session) => {
                        authUser = session?.user ?? null;
                        currentUserProfile = null;
                        await loadDataWhenLoggedIn();
                    });
                    await loadDataWhenLoggedIn();
                })();
            }
            return readyPromise;
        },

        getCurrentUserRole() {
            return currentUserProfile?.role || 'viewer';
        },

        /** Refetch current user's profile from DB (e.g. after role changed in Supabase). */
        async refreshProfile() {
            if (!authUser) return;
            const uid = authUser.id;
            const { data } = await sb.from(T.profiles).select('*').eq('user_id', uid).maybeSingle();
            if (data) {
                currentUserProfile = { user_id: data.user_id, email: data.email || '', role: data.role || 'viewer', display_name: data.display_name || '' };
            }
        },

        getProfile() {
            return currentUserProfile ? { ...currentUserProfile } : null;
        },

        listProfiles() {
            return sb.from(T.profiles).select('user_id, email, role, display_name, created_at').order('email').then(({ data, error }) => {
                if (error) return Promise.reject(error);
                return (data || []).map(r => ({ userId: r.user_id, email: r.email || '', role: r.role || 'viewer', displayName: r.display_name || '', createdAt: r.created_at }));
            });
        },

        updateUserRole(userId, role) {
            if (!['admin', 'librarian', 'viewer'].includes(role)) return Promise.reject(new Error('Invalid role'));
            return sb.from(T.profiles).update({ role, updated_at: new Date().toISOString() }).eq('user_id', userId).select().single()
                .then(({ data, error }) => {
                    if (error) return Promise.reject(error);
                    if (data && data.user_id === authUser?.id) currentUserProfile = currentUserProfile ? { ...currentUserProfile, role: data.role } : { user_id: data.user_id, email: data.email || '', role: data.role || 'viewer', display_name: data.display_name || '' };
                    return data;
                });
        },

        ensureReady() {
            return this.init();
        },

        generateId() {
            return 'temp-' + Date.now();
        },

        getBooks() { return cache.books.slice(); },
        setBooks(books) { cache.books = books.slice(); },

        addBook(book) {
            validateBook(book);
            const row = {
                name: (book.name || '').trim(),
                author: (book.author || '').trim(),
                category: (book.category || '').trim(),
                editor: book.editor || '',
                parts: book.parts != null ? Math.max(1, parseInt(book.parts, 10) || 1) : 1,
                publisher: book.publisher || '',
                year: book.year || '',
                copies: book.copies != null ? Math.max(1, parseInt(book.copies, 10) || 1) : 1,
                status: 'متاح',
                cabinet: (book.cabinet || '').trim(),
                shelf: book.shelf || '',
                notes: book.notes || ''
            };
            return sb.from(T.books).insert(row).select('id, created_at, updated_at').single()
                .then(({ data, error }) => {
                    if (error) return Promise.reject(error);
                    const out = mapBook({ ...row, id: data.id, created_at: data.created_at, updated_at: data.updated_at });
                    cache.books.unshift(out);
                    return out;
                });
        },

        updateBook(id, updatedData) {
            const current = cache.books.find(b => b.id === id);
            const merged = current ? { ...current, ...updatedData } : { ...updatedData };
            validateBook(merged);
            if (updatedData.copies !== undefined && activeLoanCount(id) > Math.max(1, parseInt(updatedData.copies, 10) || 1)) {
                return Promise.reject(new Error('عدد النسخ أقل من الإعارات النشطة. أرجع بعض النسخ أولاً.'));
            }
            const map = {
                name: 'name', author: 'author', category: 'category', editor: 'editor',
                parts: 'parts', publisher: 'publisher', year: 'year', copies: 'copies',
                cabinet: 'cabinet', shelf: 'shelf', notes: 'notes'
            };
            const obj = { updated_at: new Date().toISOString() };
            Object.keys(map).forEach(k => { if (updatedData[k] !== undefined) obj[map[k]] = updatedData[k]; });
            if (obj.parts !== undefined) obj.parts = Math.max(1, parseInt(obj.parts, 10) || 1);
            if (obj.copies !== undefined) obj.copies = Math.max(1, parseInt(obj.copies, 10) || 1);
            return sb.from(T.books).update(obj).eq('id', id).select().single()
                .then(({ data, error }) => {
                    if (error) return Promise.reject(error);
                    const idx = cache.books.findIndex(b => b.id === id);
                    if (idx !== -1) cache.books[idx] = mapBook(data);
                    return this.syncBookStatus(id);
                });
        },

        syncBookStatus(bookId) {
            const book = cache.books.find(b => b.id === bookId);
            if (!book) return Promise.resolve(null);
            const status = statusForCopies(bookId, book.copies);
            if (book.status === status) return Promise.resolve(book);
            return sb.from(T.books).update({ status, updated_at: new Date().toISOString() }).eq('id', bookId).select().single()
                .then(({ data, error }) => {
                    if (error) return Promise.reject(error);
                    const idx = cache.books.findIndex(b => b.id === bookId);
                    if (idx !== -1) cache.books[idx] = mapBook(data);
                    return mapBook(data);
                });
        },

        getActiveLoanCount(bookId) { return activeLoanCount(bookId); },

        deleteBook(id) {
            const activeLoan = cache.loans.some(l => l.bookId === id && l.status === 'معار');
            if (activeLoan) return Promise.reject(new Error('الكتاب معار حالياً. يرجى تسجيل الإرجاع قبل الحذف.'));
            return sb.from(T.books).delete().eq('id', id).then(({ error }) => {
                if (error) return Promise.reject(error);
                const len = cache.books.length;
                cache.books = cache.books.filter(b => b.id !== id);
                return len !== cache.books.length;
            });
        },

        deleteBooks(ids) {
            if (!ids.length) return Promise.resolve(0);
            const withActiveLoan = ids.filter(bookId => cache.loans.some(l => l.bookId === bookId && l.status === 'معار'));
            if (withActiveLoan.length > 0) return Promise.reject(new Error('بعض الكتب معارة حالياً. يرجى تسجيل الإرجاع قبل الحذف.'));
            return sb.from(T.books).delete().in('id', ids).then(({ error }) => {
                if (error) return Promise.reject(error);
                const len = cache.books.length;
                cache.books = cache.books.filter(b => !ids.includes(b.id));
                return len - cache.books.length;
            });
        },

        getBookById(id) { return cache.books.find(b => b.id === id) || null; },

        getMembers() { return cache.members.slice(); },
        setMembers(members) { cache.members = members.slice(); },

        addMember(member) {
            const row = { name: member.name || '', phone: member.phone || '', address: member.address || '' };
            return sb.from(T.members).insert(row).select('id, created_at').single()
                .then(({ data, error }) => {
                    if (error) return Promise.reject(error);
                    const out = mapMember({ ...row, id: data.id, created_at: data.created_at });
                    cache.members.unshift(out);
                    return out;
                });
        },

        updateMember(id, updatedData) {
            const obj = { name: updatedData.name, phone: updatedData.phone, address: updatedData.address };
            Object.keys(obj).forEach(k => obj[k] === undefined && delete obj[k]);
            return sb.from(T.members).update(obj).eq('id', id).select().single()
                .then(({ data, error }) => {
                    if (error) return Promise.reject(error);
                    const idx = cache.members.findIndex(m => m.id === id);
                    if (idx !== -1) cache.members[idx] = mapMember(data);
                    return mapMember(data);
                });
        },

        deleteMember(id) {
            const hasActiveLoans = cache.loans.some(l => l.memberId === id && l.status === 'معار');
            if (hasActiveLoans) return Promise.reject(new Error('لا يمكن حذف العضو. يوجد إعارات نشطة. يرجى إرجاع الكتب أولاً.'));
            return sb.from(T.members).delete().eq('id', id).then(({ error }) => {
                if (error) return Promise.reject(error);
                const len = cache.members.length;
                cache.members = cache.members.filter(m => m.id !== id);
                return len !== cache.members.length;
            });
        },

        deleteMembers(ids) {
            if (!ids.length) return Promise.resolve(0);
            const withActive = ids.filter(memberId => cache.loans.some(l => l.memberId === memberId && l.status === 'معار'));
            if (withActive.length > 0) return Promise.reject(new Error('لا يمكن حذف أعضاء لديهم إعارات نشطة. يرجى إرجاع الكتب أولاً.'));
            return sb.from(T.members).delete().in('id', ids).then(({ error }) => {
                if (error) return Promise.reject(error);
                const len = cache.members.length;
                cache.members = cache.members.filter(m => !ids.includes(m.id));
                return len - cache.members.length;
            });
        },

        getMemberById(id) { return cache.members.find(m => m.id === id) || null; },

        getLoans() { return cache.loans.slice(); },
        setLoans(loans) { cache.loans = loans.slice(); },

        addLoan(loan) {
            const book = cache.books.find(b => b.id === loan.bookId);
            const copies = Math.max(1, parseInt(book && book.copies, 10) || 1);
            if (activeLoanCount(loan.bookId) >= copies) {
                return Promise.reject(new Error('كل النسخ معارة. لا يمكن إعارة نسخة أخرى.'));
            }
            const row = {
                book_id: loan.bookId,
                member_id: loan.memberId,
                loan_date: loan.loanDate || null,
                return_date: null,
                status: 'معار'
            };
            return sb.from(T.loans).insert(row).select('id, created_at').single()
                .then(({ data, error }) => {
                    if (error) return Promise.reject(error);
                    const out = mapLoan({ ...row, id: data.id, created_at: data.created_at });
                    cache.loans.unshift(out);
                    return this.syncBookStatus(loan.bookId).then(() => out);
                });
        },

        returnLoan(id) {
            const loan = cache.loans.find(l => l.id === id);
            if (!loan) return Promise.resolve(null);
            const returnDate = new Date().toISOString().split('T')[0];
            return sb.from(T.loans).update({ return_date: returnDate, status: 'مُرجع' }).eq('id', id).select().single()
                .then(({ data, error }) => {
                    if (error) return Promise.reject(error);
                    const idx = cache.loans.findIndex(l => l.id === id);
                    if (idx !== -1) cache.loans[idx] = mapLoan(data);
                    return this.syncBookStatus(loan.bookId).then(() => mapLoan(data));
                });
        },

        deleteLoan(id) {
            const loan = cache.loans.find(l => l.id === id);
            return sb.from(T.loans).delete().eq('id', id).then(({ error }) => {
                if (error) return Promise.reject(error);
                cache.loans = cache.loans.filter(l => l.id !== id);
                if (loan && loan.status === 'معار') {
                    return this.syncBookStatus(loan.bookId).then(() => true);
                }
                return true;
            });
        },

        getLoansByBookId(bookId) { return cache.loans.filter(l => l.bookId === bookId); },
        getLoansByMemberId(memberId) { return cache.loans.filter(l => l.memberId === memberId); },
        getActiveLoans() { return cache.loans.filter(l => l.status === 'معار'); },

        getDiary() { return cache.diary.slice(); },
        setDiary(diary) { cache.diary = diary.slice(); },

        addDiaryEntry(entry) {
            const date = entry.date || new Date().toISOString().split('T')[0];
            const row = {
                date,
                category: entry.category || 'أخرى',
                details: (entry.details != null ? entry.details : entry.content) || '',
                images: entry.images || ''
            };
            return sb.from(T.diary).insert(row).select('id, created_at').single()
                .then(({ data, error }) => {
                    if (error) return Promise.reject(error);
                    const out = mapDiary({ ...row, id: data.id, created_at: data.created_at });
                    cache.diary.unshift(out);
                    return out;
                });
        },

        updateDiaryEntry(id, updatedData) {
            const details = updatedData.details != null ? updatedData.details : updatedData.content;
            const obj = { date: updatedData.date, category: updatedData.category, details: details, images: updatedData.images };
            Object.keys(obj).forEach(k => obj[k] === undefined && delete obj[k]);
            return sb.from(T.diary).update(obj).eq('id', id).select().single()
                .then(({ data, error }) => {
                    if (error) return Promise.reject(error);
                    const idx = cache.diary.findIndex(d => d.id === id);
                    if (idx !== -1) cache.diary[idx] = mapDiary(data);
                    return mapDiary(data);
                });
        },

        deleteDiaryEntry(id) {
            return sb.from(T.diary).delete().eq('id', id).then(({ error }) => {
                if (error) return Promise.reject(error);
                const len = cache.diary.length;
                cache.diary = cache.diary.filter(d => d.id !== id);
                return len !== cache.diary.length;
            });
        },

        getDiaryGroupedByDate() {
            const grouped = {};
            cache.diary.forEach(entry => {
                const d = entry.date;
                if (!grouped[d]) grouped[d] = [];
                grouped[d].push(entry);
            });
            return grouped;
        },

        getDocuments() { return cache.documents.slice(); },
        getDocumentById(id) { return cache.documents.find(d => d.id === id) || null; },
        getDocumentsByBookId(bookId) { return cache.documents.filter(d => d.bookId === bookId); },

        async getDocumentSignedUrl(path) {
            const { data, error } = await sb.storage.from(DOCUMENT_ARCHIVE_BUCKET).createSignedUrl(path, 3600);
            if (error) return null;
            return data?.signedUrl || null;
        },

        async addDocument(doc, files) {
            const row = {
                title: (doc.title || '').trim(),
                description: (doc.description || '').trim() || '',
                category: (doc.category || '').trim() || 'أخرى',
                document_date: doc.documentDate || null,
                book_id: doc.bookId || null,
                file_paths: []
            };
            if (!row.title) return Promise.reject(new Error('عنوان الوثيقة مطلوب'));
            const { data: inserted, error: insertErr } = await sb.from(T.documents).insert(row).select('id, created_at').single();
            if (insertErr) return Promise.reject(insertErr);
            const id = inserted.id;
            const paths = [];
            if (files && files.length) {
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const ext = (file.name && file.name.split('.').pop()) || 'jpg';
                    const storagePath = `${id}/${Date.now()}-${i}.${ext}`;
                    const { error: uploadErr } = await sb.storage.from(DOCUMENT_ARCHIVE_BUCKET).upload(storagePath, file, { upsert: true });
                    if (!uploadErr) paths.push(storagePath);
                }
                await sb.from(T.documents).update({ file_paths: paths, updated_at: new Date().toISOString() }).eq('id', id);
            }
            const out = mapDocument({
                id, ...row, file_paths: paths,
                created_at: inserted.created_at,
                updated_at: new Date().toISOString()
            });
            cache.documents.unshift(out);
            return out;
        },

        updateDocument(id, data) {
            const obj = {
                title: data.title,
                description: data.description,
                category: data.category,
                document_date: data.documentDate,
                book_id: data.bookId,
                updated_at: new Date().toISOString()
            };
            Object.keys(obj).forEach(k => obj[k] === undefined && delete obj[k]);
            if (obj.title !== undefined) obj.title = (obj.title || '').trim();
            if (!obj.title && data.title !== undefined) return Promise.reject(new Error('عنوان الوثيقة مطلوب'));
            return sb.from(T.documents).update(obj).eq('id', id).select().single()
                .then(({ data: row, error }) => {
                    if (error) return Promise.reject(error);
                    const idx = cache.documents.findIndex(d => d.id === id);
                    const mapped = mapDocument(row);
                    if (idx !== -1) cache.documents[idx] = mapped;
                    return mapped;
                });
        },

        async deleteDocument(id) {
            const doc = cache.documents.find(d => d.id === id);
            if (doc && doc.filePaths && doc.filePaths.length) {
                await sb.storage.from(DOCUMENT_ARCHIVE_BUCKET).remove(doc.filePaths);
            }
            const { error } = await sb.from(T.documents).delete().eq('id', id);
            if (error) return Promise.reject(error);
            cache.documents = cache.documents.filter(d => d.id !== id);
            return true;
        },

        getCategories() { return cache.categories.slice(); },
        setCategories(categories) { cache.categories = categories.slice(); },

        addCategory(category) {
            if (!category || cache.categories.includes(category)) return Promise.resolve(false);
            return sb.from(T.categories).insert({ name: category }).then(({ error }) => {
                if (!error) {
                    cache.categories.push(category);
                    return true;
                }
                const conflict = error.code === '23505' || error.status === 409 || (error.message && error.message.includes('duplicate'));
                if (conflict) {
                    if (!cache.categories.includes(category)) cache.categories.push(category);
                    return true;
                }
                return false;
            }).catch(err => {
                if (err?.code === '23505' || err?.status === 409) {
                    if (!cache.categories.includes(category)) cache.categories.push(category);
                    return true;
                }
                throw err;
            });
        },

        updateCategory(oldName, newName) {
            const next = (newName || '').trim();
            if (!next || next === oldName) return Promise.resolve(false);
            return sb.from(T.categories).update({ name: next }).eq('name', oldName).then(({ error }) => {
                if (error) return false;
                return sb.from(T.books).update({ category: next }).eq('category', oldName).then(({ error: bookErr }) => {
                    if (bookErr) {
                        return sb.from(T.categories).update({ name: oldName }).eq('name', next).then(() => false);
                    }
                    const i = cache.categories.indexOf(oldName);
                    if (i !== -1) cache.categories[i] = next;
                    cache.books.forEach(b => { if (b.category === oldName) b.category = next; });
                    return true;
                });
            });
        },

        deleteCategory(category) {
            return sb.from(T.categories).delete().eq('name', category).then(({ error }) => {
                if (!error) cache.categories = cache.categories.filter(c => c !== category);
                return !error;
            });
        },

        getPublishers() { return cache.publishers.slice(); },
        setPublishers(publishers) { cache.publishers = publishers.slice(); },

        addPublisher(publisher) {
            if (!publisher || cache.publishers.includes(publisher)) return Promise.resolve(false);
            return sb.from(T.publishers).insert({ name: publisher }).then(({ error }) => {
                if (!error) {
                    cache.publishers.push(publisher);
                    cache.publishers.sort();
                    return true;
                }
                const conflict = error.code === '23505' || error.status === 409 || (error.message && error.message.includes('duplicate'));
                if (conflict) {
                    if (!cache.publishers.includes(publisher)) cache.publishers.push(publisher);
                    cache.publishers.sort();
                    return true;
                }
                return false;
            }).catch(err => {
                if (err?.code === '23505' || err?.status === 409) {
                    if (!cache.publishers.includes(publisher)) cache.publishers.push(publisher);
                    cache.publishers.sort();
                    return true;
                }
                return false;
            });
        },

        updatePublisher(oldName, newName) {
            const next = (newName || '').trim();
            if (!next || next === oldName) return Promise.resolve(false);
            return sb.from(T.publishers).update({ name: next }).eq('name', oldName).then(({ error }) => {
                if (error) return false;
                return sb.from(T.books).update({ publisher: next }).eq('publisher', oldName).then(({ error: bookErr }) => {
                    if (bookErr) {
                        return sb.from(T.publishers).update({ name: oldName }).eq('name', next).then(() => false);
                    }
                    const i = cache.publishers.indexOf(oldName);
                    if (i !== -1) cache.publishers[i] = next;
                    cache.books.forEach(b => { if (b.publisher === oldName) b.publisher = next; });
                    return true;
                });
            });
        },

        deletePublisher(publisher) {
            return sb.from(T.publishers).delete().eq('name', publisher).then(({ error }) => {
                if (!error) cache.publishers = cache.publishers.filter(p => p !== publisher);
                return !error;
            });
        },

        /** Populate publishers list from existing books (for books that have publisher set but not in publishers table). */
        syncPublishersFromBooks() {
            const existing = cache.publishers.slice();
            const fromBooks = new Set();
            cache.books.forEach(b => {
                const p = (b.publisher || '').trim();
                if (p) fromBooks.add(p);
            });
            const toAdd = Array.from(fromBooks).filter(p => !existing.includes(p));
            if (!toAdd.length) return Promise.resolve({ added: 0 });
            return Promise.allSettled(toAdd.map(n => this.addPublisher(n))).then(results => {
                const added = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
                return { added };
            });
        },

        getStats() {
            const books = cache.books;
            const members = cache.members;
            const loans = cache.loans;
            const categories = cache.categories;
            const publishers = cache.publishers;
            const authors = new Set(books.map(b => b.author).filter(Boolean));
            const availableBooks = books.filter(b => b.status !== 'معار').length;
            const issuedBooks = books.filter(b => b.status === 'معار').length;
            return {
                totalBooks: books.length,
                totalAuthors: authors.size,
                totalCategories: categories.length,
                totalPublishers: publishers.length,
                availableBooks,
                issuedBooks,
                totalMembers: members.length,
                totalLoans: loans.length,
                activeLoans: loans.filter(l => l.status === 'معار').length
            };
        },

        getUser() { return authUser; },
        setUser() {},
        clearUser() {},
        login(email, password) {
            return sb.auth.signInWithPassword({ email: (email || '').trim(), password: password || '' })
                .then(({ data, error }) => {
                    if (error) return null;
                    authUser = data.user;
                    return data.user;
                });
        },
        isLoggedIn() { return !!authUser; },
        logout() {
            return sb.auth.signOut().then(() => { authUser = null; });
        },

        updateOwnPassword(newPassword) {
            return sb.auth.updateUser({ password: newPassword }).then(({ data, error }) => {
                if (error) return Promise.reject(error);
                return data;
            });
        },

        sendPasswordResetEmail(email) {
            return sb.auth.resetPasswordForEmail((email || '').trim(), {
                redirectTo: typeof window !== 'undefined' && window.location ? window.location.origin + (window.location.pathname || '/') : undefined
            }).then(({ data, error }) => {
                if (error) return Promise.reject(error);
                return data;
            });
        },

        exportBooksToCSV() {
            const books = cache.books;
            if (!books.length) return null;
            const headers = ['اسم الكتاب', 'المؤلف', 'القسم', 'المحقق', 'الأجزاء', 'دار النشر', 'السنة', 'النسخ', 'الحالة', 'الصندوق', 'الطاق', 'ملاحظات'];
            const rows = books.map(book => [
                book.name || '', book.author || '', book.category || '', book.editor || '', book.parts || '',
                book.publisher || '', book.year || '', book.copies || '', book.status || '', book.cabinet || '',
                book.shelf || '', book.notes || ''
            ]);
            return [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
        },

        getCSVTemplate() {
            const headers = ['اسم الكتاب', 'المؤلف', 'القسم', 'المحقق', 'الأجزاء', 'دار النشر', 'السنة', 'النسخ', 'الحالة', 'الصندوق', 'الطاق', 'ملاحظات'];
            const exampleRow = ['مثال: صحيح البخاري', 'الإمام البخاري', 'حديث', 'ابن حجر العسقلاني', '9', 'دار السلام', '1422', '1', 'متاح', 'A1', '1', 'نسخة محققة'];
            return [headers, exampleRow].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
        },

        importBooksFromCSV(csvData, onProgress) {
            const parseCSVToRows = (text) => {
                let t = (text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
                const rows = [];
                let row = [];
                let cell = '';
                let inQuotes = false;
                for (let i = 0; i < t.length; i++) {
                    const c = t[i];
                    if (inQuotes) {
                        if (c === '"') {
                            if (t[i + 1] === '"') { cell += '"'; i++; }
                            else inQuotes = false;
                        } else cell += c;
                    } else {
                        if (c === '"') inQuotes = true;
                        else if (c === ',') { row.push(cell.trim()); cell = ''; }
                        else if (c === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
                        else cell += c;
                    }
                }
                if (cell !== '' || row.length > 0) { row.push(cell.trim()); rows.push(row); }
                return rows;
            };
            const toWesternDigits = (value) => String(value || '').replace(/[٠-٩۰-۹০-৯]/g, (ch) => {
                const code = ch.charCodeAt(0);
                if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
                if (code >= 0x06F0 && code <= 0x06F9) return String(code - 0x06F0);
                if (code >= 0x09E6 && code <= 0x09EF) return String(code - 0x09E6);
                return ch;
            });
            const parseCount = (value) => {
                const n = parseInt(toWesternDigits(value), 10);
                return Number.isInteger(n) && n >= 1 ? n : 1;
            };
            const parseYear = (value) => {
                const s = toWesternDigits(value).replace(/\s/g, '');
                return /^\d{1,8}$/.test(s) ? s : '';
            };
            const rows = parseCSVToRows(csvData);
            if (rows.length < 2) return Promise.resolve({ success: false, message: 'الملف فارغ أو غير صالح' });
            const headerRow = rows[0].map(h => (h || '').trim());
            const numCols = Math.max(headerRow.length, 12);
            const col = (arr, name) => {
                const i = headerRow.findIndex(h => (h || '').trim() === name);
                return i >= 0 ? (arr[i] || '').trim() : '';
            };
            const tasks = [];
            const existing = cache.books.slice();
            let skipped = 0;
            const uniqueCategories = new Set();
            const uniquePublishers = new Set();
            for (let i = 1; i < rows.length; i++) {
                const raw = rows[i];
                const cleanValues = raw.length > numCols ? raw.slice(0, numCols) : [...raw, ...Array(numCols - raw.length).fill('')];
                const name = col(cleanValues, 'اسم الكتاب');
                const author = col(cleanValues, 'المؤلف');
                const category = col(cleanValues, 'القسم');
                const cabinet = col(cleanValues, 'الصندوق');
                if (!name || !author || !category || !cabinet) {
                    skipped++;
                    continue;
                }
                uniqueCategories.add(category);
                const publisherVal = (col(cleanValues, 'دار النشر') || '').trim();
                if (publisherVal) uniquePublishers.add(publisherVal);
                const book = {
                    name,
                    author,
                    editor: col(cleanValues, 'المحقق') || '',
                    category: category || 'عام',
                    cabinet,
                    shelf: col(cleanValues, 'الطاق') || '',
                    parts: parseCount(col(cleanValues, 'الأجزاء')),
                    publisher: publisherVal,
                    year: parseYear(col(cleanValues, 'السنة')),
                    copies: parseCount(col(cleanValues, 'النسخ')),
                    notes: col(cleanValues, 'ملاحظات') || ''
                };
                const existingBook = existing.find(b =>
                    (b.name || '').trim().toLowerCase() === name.toLowerCase() &&
                    (b.author || '').trim().toLowerCase() === author.toLowerCase() &&
                    (b.publisher || '').trim().toLowerCase() === publisherVal.toLowerCase()
                );
                if (existingBook) {
                    const normalize = (v) => (v == null ? '' : String(v).trim());
                    const normalizeNum = (v, def = 1) => {
                        const n = parseInt(v, 10);
                        return isNaN(n) ? def : n;
                    };
                    const changes = [];
                    if (normalize(existingBook.editor) !== normalize(book.editor)) changes.push({ field: 'المحقق', old: existingBook.editor, new: book.editor });
                    if (normalize(existingBook.category) !== normalize(book.category)) changes.push({ field: 'القسم', old: existingBook.category, new: book.category });
                    if (normalizeNum(existingBook.parts) !== normalizeNum(book.parts)) changes.push({ field: 'الأجزاء', old: existingBook.parts, new: book.parts });
                    if (normalize(existingBook.year) !== normalize(book.year)) changes.push({ field: 'السنة', old: existingBook.year, new: book.year });
                    if (normalizeNum(existingBook.copies) !== normalizeNum(book.copies)) changes.push({ field: 'النسخ', old: existingBook.copies, new: book.copies });
                    if (normalize(existingBook.cabinet) !== normalize(book.cabinet)) changes.push({ field: 'الصندوق', old: existingBook.cabinet, new: book.cabinet });
                    if (normalize(existingBook.shelf) !== normalize(book.shelf)) changes.push({ field: 'الطاق', old: existingBook.shelf, new: book.shelf });
                    if (normalize(existingBook.notes) !== normalize(book.notes)) changes.push({ field: 'ملاحظات', old: existingBook.notes, new: book.notes });
                    if (changes.length > 0) {
                        tasks.push({ type: 'update', id: existingBook.id, book, bookName: existingBook.name, author: existingBook.author, changes });
                    } else {
                        tasks.push({ type: 'unchanged', id: existingBook.id });
                    }
                } else {
                    tasks.push({ type: 'add', book });
                    existing.push({ name, author, publisher: publisherVal });
                }
            }
            const unchangedCount = tasks.filter(t => t.type === 'unchanged').length;
            const total = tasks.filter(t => t.type !== 'unchanged').length;
            if (typeof onProgress === 'function') onProgress(0, total);
            const addCategoriesParallel = (names) => {
                const toAdd = Array.from(names).filter(n => n && !cache.categories.includes(n));
                if (!toAdd.length) return Promise.resolve();
                return Promise.allSettled(toAdd.map(n => this.addCategory(n)));
            };
            const addPublishersParallel = (names) => {
                const toAdd = Array.from(names).filter(n => n && !cache.publishers.includes(n));
                if (!toAdd.length) return Promise.resolve();
                return Promise.allSettled(toAdd.map(n => this.addPublisher(n)));
            };
            const bookToRow = (book) => ({
                name: book.name || '',
                author: book.author || '',
                category: book.category || '',
                editor: book.editor || '',
                parts: book.parts != null ? book.parts : 1,
                publisher: book.publisher || '',
                year: book.year || '',
                copies: book.copies != null ? book.copies : 1,
                status: 'متاح',
                cabinet: book.cabinet || '',
                shelf: book.shelf || '',
                notes: book.notes || ''
            });
            const BULK_INSERT_SIZE = 40;
            const UPDATE_BATCH = 15;
            let actualAddCount = 0;
            let actualUpdateCount = 0;
            let failCount = 0;
            let doneCount = 0;
            const reportProgress = () => {
                if (typeof onProgress === 'function') onProgress(doneCount, total);
            };
            return addCategoriesParallel(uniqueCategories)
                .then(() => addPublishersParallel(uniquePublishers))
                .then(() => {
                    const addTasks = tasks.filter(t => t.type === 'add');
                    const updateTasks = tasks.filter(t => t.type === 'update');
                    let chain = Promise.resolve();
                    for (let i = 0; i < addTasks.length; i += BULK_INSERT_SIZE) {
                        const batch = addTasks.slice(i, i + BULK_INSERT_SIZE);
                        const rows = batch.map(t => bookToRow(t.book));
                        chain = chain.then(() =>
                            sb.from(T.books).insert(rows).select('id, created_at, updated_at')
                                .then(({ data, error }) => {
                                    if (error) return Promise.reject(error);
                                    const inserted = (data || []).map((d, idx) => mapBook({ ...rows[idx], id: d.id, created_at: d.created_at, updated_at: d.updated_at }));
                                    inserted.reverse();
                                    inserted.forEach(b => cache.books.unshift(b));
                                    existing.push(...inserted);
                                    actualAddCount += inserted.length;
                                    doneCount += batch.length;
                                    reportProgress();
                                })
                        );
                    }
                    for (let i = 0; i < updateTasks.length; i += UPDATE_BATCH) {
                        const batch = updateTasks.slice(i, i + UPDATE_BATCH);
                        chain = chain.then(() =>
                            Promise.allSettled(batch.map(t => this.updateBook(t.id, t.book)))
                                .then(results => {
                                    results.forEach(r => { if (r.status === 'fulfilled') actualUpdateCount++; else failCount++; });
                                    doneCount += batch.length;
                                    reportProgress();
                                })
                        );
                    }
                    const updateDetails = updateTasks.map(t => ({
                        bookName: t.bookName,
                        author: t.author,
                        changes: t.changes
                    }));
                    return chain.then(() => ({
                        success: true,
                        count: actualAddCount,
                        books: [],
                        updatedCount: actualUpdateCount,
                        unchangedCount,
                        skipped,
                        failCount,
                        updateDetails
                    }));
                })
                .catch(err => ({ success: false, message: err?.message || 'خطأ في الاستيراد' }));
        },

        clearAllData() {
            const role = currentUserProfile?.role || 'viewer';
            if (role !== 'admin') return Promise.reject(new Error('صلاحية المدير فقط.'));
            return sb.rpc('clear_all_data')
                .then(({ error }) => {
                    if (error) return Promise.reject(error);
                    cache.books = [];
                    cache.members = [];
                    cache.loans = [];
                    cache.diary = [];
                    cache.categories = [];
                    cache.publishers = [];
                    return Promise.resolve();
                })
                .catch(err => Promise.reject(err));
        }
    };
})();

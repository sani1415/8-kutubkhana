/**
 * Fallback when Supabase is not configured.
 * Library data lives in Supabase only (see supabase-data.js).
 */
const SupabaseOnlyStub = {
    init() {},
    ensureReady() { return Promise.resolve(); },
    getBooks() { return []; },
    setBooks() {},
    getMembers() { return []; },
    setMembers() {},
    getLoans() { return []; },
    getDiary() { return []; },
    getDiaryGroupedByDate() { return {}; },
    getDocuments() { return []; },
    getDocumentsByBookId() { return []; },
    getCategories() { return []; },
    setCategories() {},
    getPublishers() { return []; },
    setPublishers() {},
    getBookById() { return null; },
    getMemberById() { return null; },
    getActiveLoans() { return []; },
    getActiveLoanCount() { return 0; },
    getStats() {
        return { totalBooks: 0, totalAuthors: 0, totalCategories: 0, totalPublishers: 0, availableBooks: 0, issuedBooks: 0, totalMembers: 0, totalLoans: 0, activeLoans: 0 };
    },
    addBook() { return Promise.resolve(null); },
    updateBook() { return Promise.resolve(null); },
    deleteBook() { return Promise.resolve(false); },
    deleteBooks() { return Promise.resolve(0); },
    addMember() { return Promise.resolve(null); },
    updateMember() { return Promise.resolve(null); },
    deleteMember() { return Promise.resolve(false); },
    deleteMembers() { return Promise.resolve(0); },
    addLoan() { return Promise.resolve(null); },
    returnLoan() { return Promise.resolve(null); },
    deleteLoan() { return Promise.resolve(); },
    addDiaryEntry() { return Promise.resolve(null); },
    updateDiaryEntry() { return Promise.resolve(null); },
    deleteDiaryEntry() { return Promise.resolve(false); },
    addCategory() { return Promise.resolve(false); },
    updateCategory() { return Promise.resolve(false); },
    deleteCategory() { return Promise.resolve(); },
    addPublisher() { return Promise.resolve(false); },
    updatePublisher() { return Promise.resolve(false); },
    deletePublisher() { return Promise.resolve(); },
    login() {
        return Promise.reject(new Error('يرجى إعداد Supabase: انسخ js/config.example.js إلى js/config.js وأدخل مفاتيح المشروع.'));
    },
    logout() { return Promise.resolve(); },
    isLoggedIn() { return false; },
    exportBooksToCSV() { return null; },
    getCSVTemplate() {
        const headers = ['اسم الكتاب', 'المؤلف', 'القسم', 'المحقق', 'الأجزاء', 'دار النشر', 'السنة', 'النسخ', 'الحالة', 'الصندوق', 'الطاق', 'ملاحظات'];
        return headers.map(cell => `"${cell}"`).join(',') + '\n';
    },
    importBooksFromCSV() { return Promise.resolve({ success: false, message: 'يرجى إعداد Supabase أولاً.', count: 0, books: [], updatedCount: 0, updated: [], skipped: 0 }); },
    clearAllData() { return Promise.resolve(); },
    syncPublishersFromBooks() { return Promise.resolve({ added: 0 }); },
    getCurrentUserRole() { return 'viewer'; },
    getProfile() { return null; },
    listProfiles() { return Promise.resolve([]); },
    updateUserRole() { return Promise.reject(new Error('Supabase required')); },
    updateOwnPassword() { return Promise.reject(new Error('Supabase required')); },
    sendPasswordResetEmail() { return Promise.reject(new Error('Supabase required')); }
};

if (typeof window !== 'undefined' && window.SupabaseDataManager && window.supabaseClient) {
    window.DataManager = window.SupabaseDataManager;
    window.SUPABASE_REQUIRED = false;
    window.DataManager.init();
} else {
    window.DataManager = SupabaseOnlyStub;
    window.SUPABASE_REQUIRED = true;
    SupabaseOnlyStub.init();
}

/** Page registry: routes, navigation labels and icons. */
import { mountDashboard } from './dashboard.js';
import { mountBooks } from './books.js';
import { mountBookNew } from './book-new.js';
import { mountScan } from './scan.js';
import { mountLoans } from './loans.js';
import { mountMembers } from './members.js';
import { mountDiary } from './diary.js';
import { taxonomyPage, mountAuthors } from './taxonomy.js';
import { mountReports } from './reports.js';
import { mountArchive } from './archive.js';
import { mountSettings } from './settings.js';

export const PAGES = {
    dashboard: { id: 'dashboard', path: '/', title: 'الرئيسية', icon: 'house', mount: mountDashboard },
    books: { id: 'books', path: '/books', title: 'الكتب', icon: 'books', mount: mountBooks },
    'book-new': { id: 'book-new', path: '/books/new', title: 'إضافة كتاب', icon: 'plus-circle', requires: 'edit', tab: 'books', hidden: true, mount: mountBookNew },
    scan: { id: 'scan', path: '/scan', title: 'المسح الذكي', icon: 'camera', requires: 'edit', mount: mountScan },
    loans: { id: 'loans', path: '/loans', title: 'الإعارات', icon: 'hand-arrow-up', mount: mountLoans },
    members: { id: 'members', path: '/members', title: 'الأعضاء', icon: 'users-three', mount: mountMembers },
    diary: { id: 'diary', path: '/diary', title: 'اليوميات', icon: 'notebook', mount: mountDiary },
    categories: { id: 'categories', path: '/categories', title: 'الأقسام', icon: 'stack', mount: taxonomyPage('category') },
    authors: { id: 'authors', path: '/authors', title: 'المؤلفون', icon: 'feather', mount: mountAuthors },
    publishers: { id: 'publishers', path: '/publishers', title: 'دور النشر', icon: 'buildings', mount: taxonomyPage('publisher') },
    reports: { id: 'reports', path: '/reports', title: 'التقارير', icon: 'chart-donut', mount: mountReports },
    archive: { id: 'archive', path: '/archive', title: 'الأرشيف', icon: 'archive', mount: mountArchive },
    settings: { id: 'settings', path: '/settings', title: 'الإعدادات', icon: 'gear-six', mount: mountSettings },
};

export const NAV_GROUPS = [
    { label: '', pages: ['dashboard', 'books', 'book-new', 'scan'] },
    { label: 'الإعارة', pages: ['loans', 'members'] },
    { label: 'التنظيم', pages: ['categories', 'authors', 'publishers', 'reports'] },
    { label: 'السجلات', pages: ['diary', 'archive', 'settings'] },
];

/** Bottom bar on phones: two tabs, the + button, one tab, then "more". */
export const MOBILE_TABS = ['dashboard', 'books', 'loans'];

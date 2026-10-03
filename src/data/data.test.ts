import { describe, expect, it } from 'vitest';
import { LibraryRepository } from './repository';
import { createMemoryBackend } from './backends/memory';
import { demoSeed } from './backends/demo-seed';
import {
    CSV_TEMPLATE, filterBooks, foldText, missingFields, parseCSV, parseCount, parseYear, planImport, toWesternDigits,
} from './rules';
import type { Book } from './types';

async function repo(role: 'admin' | 'librarian' | 'viewer' | 'pending' = 'admin') {
    const r = new LibraryRepository(createMemoryBackend({ seed: demoSeed(), signedInAs: role }));
    await r.start();
    return r;
}

describe('rules', () => {
    it('converts Arabic, Persian and Bengali digits', () => {
        expect(toWesternDigits('١٤٤٢')).toBe('1442');
        expect(toWesternDigits('۱۴۰۰')).toBe('1400');
        expect(toWesternDigits('২০২১')).toBe('2021');
        expect(parseCount('٣')).toBe(3);
        expect(parseCount('')).toBe(1);
        expect(parseCount('-2')).toBe(1);
        expect(parseYear('١٤٢٢ هـ')).toBe('');
        expect(parseYear(' ١٤٢٢ ')).toBe('1422');
    });

    it('parses quoted CSV with commas, quotes and newlines', () => {
        const rows = parseCSV('﻿a,b\r\n"x, y","he said ""hi"""\n"multi\nline",z\n');
        expect(rows).toEqual([['a', 'b'], ['x, y', 'he said "hi"'], ['multi\nline', 'z']]);
    });

    it('folds Arabic diacritics and letter variants for search', () => {
        expect(foldText('الْكِتَابُ')).toBe('الكتاب');
        expect(foldText('إحياء')).toBe(foldText('احياء'));
    });

    it('plans an import: add, update, unchanged, skipped', () => {
        const existing = demoSeed().books;
        const bukhari = existing[0];
        const rows = parseCSV(CSV_TEMPLATE);
        rows.push([bukhari.name, bukhari.author, bukhari.category, bukhari.editor, String(bukhari.parts), bukhari.publisher, bukhari.year, '7', '', bukhari.cabinet, bukhari.shelf, bukhari.notes]);
        rows.push(['بلا مؤلف', '', 'فقه', '', '', '', '', '', '', 'A1', '', '']);
        rows.push(['الأم', 'الشافعي', 'فقه', '', '٨', '', '', '', '', 'C3', '', '']);
        rows.push(['الأم', 'الشافعي', 'فقه', '', '٨', '', '', '', '', 'C3', '', '']);
        const plan = planImport(rows, existing);
        expect(plan.add.map((b) => b.name)).toEqual(['صحيح البخاري', 'الأم']);
        expect(plan.add[1].parts).toBe(8);
        expect(plan.update).toHaveLength(1);
        expect(plan.update[0].changes).toEqual([{ field: 'النسخ', old: 3, new: 7 }]);
        expect(plan.skipped).toBe(1);
        expect(plan.unchanged).toBe(1);
    });

    it('filters books by status, category and free text', () => {
        const books = demoSeed().books as Book[];
        expect(filterBooks(books, { category: 'تفسير' }).every((b) => b.category === 'تفسير')).toBe(true);
        expect(filterBooks(books, { q: 'ابن القيم' })).toHaveLength(0);
        expect(filterBooks(books, { q: 'الجوزية' }).length).toBe(2);
        expect(filterBooks(books, { q: 'A1' }).length).toBeGreaterThan(3);
    });

    it('lists missing fields', () => {
        const b = demoSeed().books.find((x) => x.name === 'الرسالة القشيرية')!;
        expect(missingFields(b)).toEqual(['cabinet', 'editor', 'year', 'shelf', 'notes']);
    });
});

describe('repository', () => {
    it('loads data for users with access and nothing for pending users', async () => {
        expect((await repo('librarian')).books.length).toBe(demoSeed().books.length);
        const pending = await repo('pending');
        expect(pending.hasAccess).toBe(false);
        expect(pending.books).toHaveLength(0);
    });

    it('lends and returns copies, keeping book status in sync', async () => {
        const r = await repo();
        const book = r.books.find((b) => b.name === 'زاد المعاد في هدي خير العباد')!; // 1 copy, on loan
        expect(book.status).toBe('معار');
        await expect(r.lend(book.id, 'm-1')).rejects.toThrow('كل النسخ معارة');

        const ryad = r.books.find((b) => b.name === 'رياض الصالحين')!; // 4 copies, none on loan
        await r.lend(ryad.id, 'm-1');
        await r.lend(ryad.id, 'm-2');
        expect(r.availability(r.book(ryad.id)!)).toEqual({ copies: 4, left: 2 });
        expect(r.book(ryad.id)!.status).toBe('متاح');

        const active = r.activeLoans().find((l) => l.bookId === book.id)!;
        await r.returnLoan(active.id);
        expect(r.book(book.id)!.status).toBe('متاح');
    });

    it('refuses to lower copies below active loans and to delete loaned books', async () => {
        const r = await repo();
        const bukhari = r.books[0];
        await r.lend(bukhari.id, 'm-3');
        await expect(r.updateBook(bukhari.id, { copies: 1 })).rejects.toThrow('عدد النسخ أقل');
        await expect(r.deleteBooks([bukhari.id])).rejects.toThrow('معارة');
        await expect(r.deleteMembers(['m-2'])).rejects.toThrow('إعارات نشطة');
    });

    it('adds books with validation and registers new taxonomy', async () => {
        const r = await repo();
        await expect(r.addBook({ name: 'كتاب', author: '', category: 'فقه', cabinet: 'A1' })).rejects.toThrow('المؤلف مطلوب');
        const b = await r.addBook({ name: 'الموافقات', author: 'الشاطبي', category: 'أصول الفقه', cabinet: 'C3', publisher: 'دار ابن عفان', parts: '٦' });
        expect(b.parts).toBe(6);
        expect(r.categories).toContain('أصول الفقه');
        expect(r.publishers).toContain('دار ابن عفان');
        expect(r.findDuplicate({ name: ' الموافقات ', author: 'الشاطبي' })?.id).toBe(b.id);
    });

    it('renames a category on every book', async () => {
        const r = await repo();
        const before = r.books.filter((b) => b.category === 'حديث').length;
        await r.renameCategory('حديث', 'الحديث الشريف');
        expect(r.books.filter((b) => b.category === 'الحديث الشريف')).toHaveLength(before);
        expect(r.categories).not.toContain('حديث');
    });

    it('runs an import plan and reports progress', async () => {
        const r = await repo();
        const plan = r.previewImport(CSV_TEMPLATE);
        const progress: number[] = [];
        const result = await r.runImport(plan, (done) => progress.push(done));
        expect(result.added).toBe(1);
        expect(progress.at(-1)).toBe(1);
        expect(r.previewImport(CSV_TEMPLATE).add).toHaveLength(0);
    });

    it('saves scanned books and skips duplicates and incomplete rows', async () => {
        const r = await repo();
        const scanned = await r.scanBooks({ base64: '', mimeType: 'image/jpeg' });
        const withCabinet = scanned.map((s) => ({ ...s, cabinet: 'F1' }));
        const result = await r.saveScanned([...withCabinet, withCabinet[0], { ...withCabinet[0], cabinet: '' }]);
        expect(result).toEqual({ saved: 2, duplicates: 1, invalid: 1 });
    });

    it('blocks writes for viewers at the backend', async () => {
        const r = await repo('viewer');
        expect(r.canEdit).toBe(false);
        await expect(r.addMember({ name: 'زائر', phone: '', address: '' })).rejects.toThrow('صلاحية');
    });
});

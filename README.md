# مكتبة المصباح — Library Management

Book catalogue, loans, members, diary, document archive and AI cover scanning for the Al-Misbah library. Arabic (RTL) interface, built phone-first; the same site runs on desktop and inside the Android app.

## Quick start

```bash
npm install
npm run dev:demo     # in-memory sample library, no database needed
npm run dev          # real Supabase data (needs .env.local, see below)
```

`.env.local` (gitignored):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

On Vercel the existing `SUPABASE_URL` / `SUPABASE_ANON_KEY` variables are accepted too. Only these two values reach the browser.

| Script | What it does |
| --- | --- |
| `npm run dev` / `dev:demo` | Vite dev server (real data / sample data) |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve `dist/` with the same security headers as production |
| `npm test` | Data-layer tests (Vitest) |
| `npm run typecheck` | TypeScript check of the data layer |
| `npm run check` | typecheck + tests + build |
| `npm run apk` | Build the Android debug APK (needs JDK / `JAVA_HOME`) |

## Structure

```
src/
├── data/                  ← the ONLY place that knows about the database
│   ├── types.ts           domain types + LibraryBackend contract
│   ├── rules.ts           validation, search, CSV, import planning (pure)
│   ├── repository.ts      cache + business rules; the API the UI calls
│   ├── index.ts           picks the backend
│   ├── backends/
│   │   ├── supabase.ts    Supabase implementation
│   │   ├── memory.ts      in-memory implementation (tests, demo mode)
│   │   └── demo-seed.ts   sample library
│   └── data.test.ts
├── ui/
│   ├── shell.js           auth gate, navigation, hash router
│   ├── overlay.js         sheets, confirm, toasts
│   ├── components.js      book card, picker, pager, form fields
│   ├── dom.js             escaped `html` templates, delegation, formatting
│   └── pages/             one file per screen
├── styles/                tokens → base → layout → components → pages
└── main.js
supabase/
├── schema.sql, migrations/001–011
└── functions/scan-books   Gemini call (key stays server-side, daily quota)
```

### Moving to another database (e.g. Cloudflare D1)

The UI talks only to `LibraryRepository`; the repository talks only to a `LibraryBackend` (`src/data/types.ts`). To switch:

1. Build an API in front of the new database (for D1: a Cloudflare Worker) that enforces the same rules the Postgres migrations enforce today: roles, one loan per available copy, no deleting loaned books, atomic renames.
2. Write `src/data/backends/d1.ts` implementing `LibraryBackend` against that API (use `supabase.ts` as the reference and `memory.ts` for the expected rule behaviour).
3. Return it from `pickBackend()` in `src/data/index.ts`.
4. Run `npm test`: the repository tests describe the behaviour every backend must match.

Nothing under `src/ui` changes.

## Database (Supabase)

Run in the SQL editor, in order: `schema.sql`, then `migrations/001` … `011`. See `supabase/SECURITY_AND_MIGRATIONS.md`.

New accounts start as **pending** and see nothing until an admin grants a role in *الإعدادات → المستخدمون*. The very first admin is set once in SQL (`supabase/FIRST_ADMIN_SETUP.md`).

| Role | Access |
| --- | --- |
| admin | Everything, including user roles and "delete all data" |
| librarian | Add/edit books, loans, members, diary, archive; AI scan |
| viewer | Read only |
| pending | Nothing (waiting for approval) |

Book availability follows loans: a book is available until every copy is out. Status is never edited by hand.

## Android app

The APK is a thin Capacitor shell that loads the live site (`server.url` in `capacitor.config.json`), so phones get every update automatically. Rebuild the APK only when the URL or Android settings change:

```bash
npm run apk                      # android/app/build/outputs/apk/debug/
npm run android                  # or open in Android Studio
```

Phones still on an older APK keep running the old bundled app until the new APK is installed once.

## Importing books

Excel (`.xlsx`) or CSV. Required columns: `اسم الكتاب`, `المؤلف`, `القسم`, `الصندوق`. Optional: `المحقق`, `الأجزاء`, `دار النشر`, `السنة`, `النسخ`, `الطاق`, `ملاحظات`. Arabic and Bengali digits are understood. The app shows what will be added or updated before writing anything; existing books are matched by title + author + publisher.

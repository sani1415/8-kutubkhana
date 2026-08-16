# مكتبة المصباح – Library Management System

Full-featured library management system with multi-language support (Arabic, Bengali, English, Urdu).

## 📁 File Structure

```
kutubkhana/
├── index.html              # Main page
├── styles/
│   ├── base.css            # Theme variables, reset, login, loading
│   ├── layout.css          # App layout, navigation, pages
│   ├── components.css      # Stats, tables, forms, buttons
│   ├── management.css      # Categories, publishers, members
│   ├── diary.css            # Library diary
│   ├── reports.css          # Reports
│   ├── modals.css           # Modals and shared overlays
│   ├── books.css            # Mobile book list
│   ├── scan.css             # Book scanning
│   ├── responsive.css       # Responsive rules
│   ├── utilities.css        # Print, scrollbar, selection, hover
│   └── archive.css          # Document archive and book selector
├── js/
│   ├── app.js              # Core state, navigation, shared UI, events
│   ├── app-init.js         # DOM-ready bootstrap
│   ├── data.js             # LocalStorage data layer
│   ├── supabase-data.js    # Supabase data layer
│   ├── supabase-client.js  # Supabase client setup
│   └── features/
│       ├── auth.js         # Authentication and user management
│       ├── books.js        # Books and CSV/Excel import/export
│       ├── loans.js        # Loan management
│       ├── diary.js        # Library diary
│       ├── members.js      # Member management
│       ├── taxonomy.js     # Categories, authors, publishers
│       ├── archive.js      # Document archive
│       ├── reports.js      # Missing-data reports
│       ├── settings.js     # Settings and backup
│       └── scan.js         # AI book scanning
├── plan.md                 # Project plan
└── README.md               # This file
```

## 🚀 How to Use

### Run locally for testing

To try the app with Supabase (login, database, document archive) you need to run it via a local server, not by opening the file directly (`file://` can cause issues with Supabase in some browsers).

**Steps:**

1. **Set up Supabase (for testing with cloud backend):**
   - Copy `js/config.example.js` to `js/config.js`.
   - Open `js/config.js` and set:
     - `SUPABASE_URL`: your project URL (e.g. `https://xxxxx.supabase.co`)
     - `SUPABASE_ANON_KEY`: the anon key from Supabase → Settings → API.
   - Run the scripts in the `supabase/` folder in order from the Supabase SQL Editor. See `supabase/FIRST_ADMIN_SETUP.md`.

2. **Start a local server** (choose one):

   **a) Node.js (recommended):**
   ```bash
   npm run serve
   ```
   Or: `npm run dev`. Then open in the browser: **http://localhost:3000** (or the port shown in the terminal).

   **b) Python:**
   ```bash
   # Python 3
   python -m http.server 8080
   ```
   Then open: **http://localhost:8080**

   **c) VS Code / Cursor:**
   - Install the "Live Server" extension if needed.
   - Right-click `index.html` → **Open with Live Server**.

3. **Log in:** On the main page use a user account you created in Supabase (Authentication → Users), then set the first admin via SQL as in `supabase/FIRST_ADMIN_SETUP.md` if needed.

**Note:** If you don’t set up `config.js`, the app falls back to **localStorage** only (UI may differ slightly). For full Supabase testing use `config.js` and a local server.

---

### Simple way (no server):

1. Open `index.html` in any modern browser (Chrome, Firefox, Edge).
2. It runs with **localStorage** only (no Supabase). For Supabase login and cloud data, use a local server as above.

### Features

#### 🏠 لوحة المعلومات (Dashboard)
- Overview: book count, active loans, members, publishers, authors.

#### 📚 إدارة الكتب (Books)
- View all books in an interactive table.
- Search (multi-language).
- Filter by **القسم (Category)** and **الصندوق (Cabinet)**.
- Add / edit / delete books.
- **Import from Excel:** upload a book list.
- **Export to Excel:** export all books.
- **Download Excel template:** empty template.

#### 👥 إدارة الأعضاء (Members)
- View member list, search, add / edit / delete.
- **Import from Excel**, **download member template**.

#### 🔄 إدارة الإعارات (Loans)
- View active loans, add new loan, return books, track loans per member.

#### 📓 اليوميات (Diary)
- Add library diary entries.
- Categories: **ضيف (Guest)**, **صيانة (Maintenance)**, **شراء (Purchase)**, **أخرى (Other)**.
- Attach images, view all entries with date and time.

#### ⚙️ الإعدادات (Settings)
- Delete all data, export all data (JSON).

## 💾 Data storage

- **No setup:** data is stored in **localStorage** in the browser (no server, works offline).
- **With Supabase:** copy `js/config.example.js` to `js/config.js` and set your project URL and anon key. Run the SQL in `supabase/schema.sql` from the Supabase SQL Editor. Books, members, loans, and diary are then stored in Supabase.

### User roles (profiles)
- Also run `supabase/migrations/001_profiles_roles.sql` in the SQL Editor to create **ktb_profiles** and roles.
- Roles: **مدير (admin)**, **أمين المكتبة (librarian)**, **مشاهد (viewer)**. Only **admin** sees Settings and user management.
- After a user’s first login, a row is created in `ktb_profiles` with role **viewer**. To set the first admin, run in SQL Editor:
  ```sql
  UPDATE ktb_profiles SET role = 'admin' WHERE email = 'your-admin@example.com';
  ```

## 📥 Excel import

### Books template
**Required columns:** book name, author, category, cabinet. Shelf and other columns are optional.  
Import matches columns by name; order is flexible.

### Members template
Required columns: name, phone, address, registration date.

## 🌐 Language support

- **UI:** Arabic (RTL).
- **Data entry:** Arabic, Bengali, English, Urdu.
- **Excel files:** full UTF-8.

## 🎨 Design

- Modern layout, full RTL, responsive, easy-on-the-eyes colors.

## 📋 Sample data

The app ships with sample data: 3 sample books, 2 sample members. You can remove it from Settings or add your own.

## 🔧 Tech stack

- **HTML5**, **CSS3**, **JavaScript (Vanilla)**, **SheetJS (XLSX)**, **localStorage**.

## 📝 Notes

- Full working prototype; supports **localStorage** and **Supabase**; all features in `plan.md` are implemented and ready to use.

## 📱 Build Android APK

To install the app on a Redmi or any Android device as an APK:

**Requirements:** Node.js installed. For building the APK from the terminal (`npm run apk`) you also need a **JDK** and **JAVA_HOME** set (or use Android Studio to build the APK from the UI).

**From the project root:**

1. **Copy web assets and prepare Android:**
   ```bash
   npm run build:android
   npx cap sync android
   ```

2. **Open the Android project in Android Studio and build APK:**
   ```bash
   npx cap open android
   ```
   Then in Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.  
   The APK is created at:  
   `android/app/build/outputs/apk/debug/مكتبة المصباح-debug.apk`  
   Copy it to your device and install.

3. **Or build APK from the terminal (without Android Studio):**  
   From the **project root** (easiest):
   ```bash
   npm run apk
   ```
   Or manually:
   ```bash
   npm run build:android
   npx cap sync android
   cd android
   .\gradlew.bat assembleDebug
   ```
   (On Windows in PowerShell use `.\gradlew.bat`; on Mac/Linux use `./gradlew`.)  
   Output APK: `android/app/build/outputs/apk/debug/مكتبة المصباح-debug.apk`

**Quick: one command to prepare and open Android:**
```bash
npm run android
```
(Runs build:android, cap sync, then opens the project in Android Studio; then build the APK from the menu as in step 2.)

**If you see npm error "could not determine executable to run":** From the project root run:
```bash
npm install
```
Then try again (`npm run apk` or `npm run android`).

**If you see "JAVA_HOME is not set":** Gradle needs a JDK to build the APK. Choose one:
- **Option 1 (recommended):** Install [Android Studio](https://developer.android.com/studio), then set the variable for your user:
  ```powershell
  [System.Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Android\Android Studio\jbr", "User")
  ```
  (Close and reopen the terminal, then run `npm run apk`.)
- **Option 2:** Install JDK 17 from [Adoptium](https://adoptium.net/) and set `JAVA_HOME` to the install folder (e.g. `C:\Program Files\Eclipse Adoptium\jdk-17.x.x-hotspot`).

---

## 🚀 Deploy on Vercel

1. Push the project to GitHub (if not already).
2. Go to [vercel.com](https://vercel.com), sign in, then **Add New Project** and select the repo.
3. **Environment variables** (so Supabase works after deploy):
   - In project settings: **Settings → Environment Variables**
   - Add:
     - `SUPABASE_URL` = `https://YOUR_PROJECT_REF.supabase.co`
     - `SUPABASE_ANON_KEY` = your anon key from the Supabase dashboard
4. Click **Deploy**.  
   The build creates `js/config.js` from these variables so the app works with Supabase on the deployed URL.

Without these variables, the app on Vercel will use **localStorage** only (data stays in the browser).

## 🤖 Scan Books (Gemini AI) – server-side key

The book-scan feature calls the **`scan-books` Supabase Edge Function**. The Gemini API key is stored as a Supabase secret and never reaches the browser. The function requires a logged-in user with role **admin** or **librarian**.

To update/redeploy:

```bash
supabase secrets set GEMINI_API_KEY=<your-key>   # once, or when rotating the key
supabase functions deploy scan-books
```

## 🎯 Next steps (future)

1. Supabase Auth
2. Upload images to Supabase Storage
3. More reports and stats
4. Notifications for due dates

## 🗂️ App names (Arabic UI labels)

- **القسم (Category)** examples: **خطابات**, **عقود**, **صور قديمة**, **مخطوطات**, **أخرى**
- **الحالة (Status)** examples: **متاح (Available)**, **معار (Issued)**



Build & run locally

- Development server (simple static server):
  ```bash
  npm run serve
  ```
  Or: `npm run dev`.
- Or Python:
  ```bash
  python -m http.server 8080
  ```

### Build Android APK


- Manual steps:
  ```bash
  npm run build:android
  npx cap sync android
  
- Using Android Studio:
  ```bash
  npm run android
  ```
  Then in Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.



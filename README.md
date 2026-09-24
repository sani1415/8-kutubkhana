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

`config.js` is required. Without it the login page asks you to copy `js/config.example.js`. Library data is stored only in Supabase.

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

#### 🔄 إدارة الإعارات (Loans)
- View active loans, add new loan, return books, track loans per member.

#### 📓 اليوميات (Diary)
- Add library diary entries.
- Categories: **ضيف (Guest)**, **صيانة (Maintenance)**, **شراء (Purchase)**, **أخرى (Other)**.
- Attach images, view all entries with date and time.

#### ⚙️ الإعدادات (Settings)
- Admin only: user roles, delete all data, Excel backup (books, members, loans, diary, document archive).

## 💾 Data storage

Copy `js/config.example.js` to `js/config.js` and set your project URL and anon key. In the Supabase SQL Editor run `supabase/schema.sql`, then migrations `001` through `009` in order. See `supabase/FIRST_ADMIN_SETUP.md` and `supabase/SECURITY_AND_MIGRATIONS.md`.

Book availability follows loans: a book stays available until every copy is on loan. Status is not edited by hand. Backup export includes the document archive list (file bytes stay in Storage).

### User roles (profiles)
- Roles live in **ktb_profiles** after migration `001_profiles_roles.sql`.
- Roles: **مدير (admin)**, **أمين المكتبة (librarian)**, **مشاهد (viewer)**. Only **admin** sees Settings and user management.
- After a user’s first login, a row is created in `ktb_profiles` with role **viewer**. To set the first admin, run in SQL Editor:
  ```sql
  UPDATE ktb_profiles SET role = 'admin' WHERE email = 'your-admin@example.com';
  ```

## 📥 Excel import

### Books template
**Required columns:** book name, author, category, cabinet. Shelf and other columns are optional.  
Import matches columns by name; order is flexible. The status column is ignored: availability comes from loans, not from the spreadsheet.

Members are added in the app (name, phone, address). There is no member Excel import.

## 🌐 Language support

- **UI:** Arabic (RTL).
- **Data entry:** Arabic, Bengali, English, Urdu.
- **Excel files:** full UTF-8.

## 🎨 Design

- Modern layout, full RTL, responsive, easy-on-the-eyes colors.

## 🔧 Tech stack

- **HTML5**, **CSS3**, **JavaScript (Vanilla)**, **SheetJS (XLSX)**, **Supabase**.

## 📝 Notes

- The app needs Supabase. Run it through a local server or the deployed site, not as a data store in the browser.

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

Without these variables the deployed app has no database connection.

## 🤖 Scan Books (Gemini AI) – server-side key

The book-scan feature calls the **`scan-books` Supabase Edge Function**. The Gemini API key is stored as a Supabase secret and never reaches the browser. The function requires a logged-in user with role **admin** or **librarian**.

To update/redeploy:

```bash
supabase secrets set GEMINI_API_KEY=<your-key>   # once, or when rotating the key
supabase functions deploy scan-books
```

## 🎯 Later ideas

1. Due-date reminders for loans
2. Audit log of important changes

## 🗂️ App names (Arabic UI labels)

- **القسم (Category)** examples: **خطابات**, **عقود**, **صور قديمة**, **مخطوطات**, **أخرى**
- **الحالة (Status)** follows loans: **متاح** while a copy is free, **معار** when every copy is on loan.


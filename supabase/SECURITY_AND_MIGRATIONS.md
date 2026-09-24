# Backend security: where it lives and what to do

## Where the real security is

- **`schema.sql`** creates the `ktb_*` tables and turns on row level security. It does **not** grant anonymous access. Re-running it does not reopen the database.
- Access rules are in the migrations:
  - **`001_profiles_roles.sql`** – `ktb_profiles` and profile policies.
  - **`002_profiles_rls_fix.sql`** – profile policy fix if you saw HTTP 500 on profiles.
  - **`003_rls_role_based.sql`** – authenticated role rules (viewer / librarian / admin). Also drops old “allow anon all” policies if they still exist.
  - **`004_data_integrity.sql`** – required book fields, parts/copies ≥ 1, return date not before loan date.
  - **`005_dangerous_actions.sql`** – admin-only `clear_all_data()`.
  - **`006_document_archive.sql`** – `ktb_documents` and the document storage bucket.
  - **`007_ktb_table_prefix.sql`** – renames old unprefixed tables if a previous database still has them.
  - **`008_ktb_storage_bucket.sql`** – storage policies for `ktb-document-archive`.
  - **`009_loan_copies_and_safe_delete.sql`** – drops leftover anon policies, allows one loan per copy, keeps book status in step with loans, and blocks deleting a book or member that still has an active loan.

The database is secure only after these migrations have been applied in your Supabase project.

## What you must do

1. In **Supabase Dashboard → SQL Editor**, run in order:
   - `schema.sql` (new project, or if the tables are missing)
   - `001` through `009`
2. Set the first admin (`FIRST_ADMIN_SETUP.md`).

If an older database still has “Allow anon all” policies, migration **009** removes them.

# First admin setup (مكتبة المصباح)

After you run the schema and migrations, **the first user who signs up gets a profile with role `viewer`** (read-only). To give someone full access, you must promote them to **admin** once in the database.

## Steps

1. **Run SQL in order** (in Supabase Dashboard → SQL Editor):
   - `schema.sql`
   - `migrations/001_profiles_roles.sql` through `migrations/009_loan_copies_and_safe_delete.sql`
   - `002` matters if profiles requests return HTTP 500

2. **Let the first user sign up** through the app (or create them in Authentication → Users).

3. **Set the first admin** in SQL Editor:

   ```sql
   UPDATE ktb_profiles
   SET role = 'admin'
   WHERE email = 'your-admin@example.com';
   ```

   Replace `your-admin@example.com` with the real email of the person who should be admin.

4. That user can then log in, open **Settings → Users**, and change other users’ roles (admin / librarian / viewer) from the UI.

## Roles

| Role       | Access |
|-----------|--------|
| **viewer**   | Read-only (books, members, loans, diary, categories, publishers). |
| **librarian**| Create, edit, delete library data (same tables). Cannot manage user roles. |
| **admin**   | Full access, including user/role management and dangerous actions. |

## Check existing admins (via Dashboard)

The Supabase CLI cannot run arbitrary SQL on the remote database (it needs Docker for `db dump` or the Management API with a token). To see who is already an admin:

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your **8-kutubkhana** project.
2. Go to **SQL Editor**.
3. Run:

   ```sql
   SELECT email, role, display_name, created_at
   FROM public.ktb_profiles
   WHERE role = 'admin'
   ORDER BY email;
   ```

   Or use the script: `supabase/scripts/check-admins.sql`.

## Troubleshooting

- **No rows returned after migration:** Ensure the user is logged in and has a row in `ktb_profiles` with role `admin`, `librarian`, or `viewer`. If the profile was created with role `viewer`, promote them with the `UPDATE` above.
- **500 on profiles:** Ensure `002_profiles_rls_fix.sql` has been run so profile policies use `is_profiles_admin()` and avoid RLS recursion.

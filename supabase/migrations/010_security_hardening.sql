-- مكتبة المصباح - Security hardening
-- Run after 009_loan_copies_and_safe_delete.sql.
--
-- 1. Self-created profiles can only be 'pending' (no access until an admin
--    approves). Before this, any signed-in user of ANY app sharing this
--    Supabase project could insert their own profile with role = 'admin'.
-- 2. SECURITY DEFINER helpers are no longer callable by anon.
-- 3. Fixed search_path on every ktb function (Supabase advisor 0011).
-- 4. Loan copy check locks the book row so two simultaneous loans cannot
--    both take the last copy.

-- ---------------------------------------------------------------------------
-- 1. Profiles: new 'pending' role, self-insert restricted to it
-- ---------------------------------------------------------------------------
ALTER TABLE ktb_profiles DROP CONSTRAINT IF EXISTS ktb_profiles_role_check;
ALTER TABLE ktb_profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE ktb_profiles
  ADD CONSTRAINT ktb_profiles_role_check
  CHECK (role IN ('admin', 'librarian', 'viewer', 'pending'));
ALTER TABLE ktb_profiles ALTER COLUMN role SET DEFAULT 'pending';

DROP POLICY IF EXISTS "Users can insert own profile" ON ktb_profiles;
CREATE POLICY "Users can insert own pending profile"
  ON ktb_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id AND role = 'pending');

-- ---------------------------------------------------------------------------
-- 2. Function privileges
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.clear_all_data() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_profiles_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ktb_active_loan_count(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ktb_book_status_for(uuid, integer) FROM PUBLIC, anon;
-- Trigger-only functions: nobody needs to call them over the API.
REVOKE EXECUTE ON FUNCTION public.ktb_loans_sync_book_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ktb_loans_enforce_copies() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ktb_books_before_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ktb_block_book_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ktb_block_member_delete() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_profiles_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ktb_active_loan_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ktb_book_status_for(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_all_data() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. search_path
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.ktb_book_status_for(uuid, integer) SET search_path = public;
ALTER FUNCTION public.ktb_books_before_update() SET search_path = public;
ALTER FUNCTION public.ktb_loans_enforce_copies() SET search_path = public;
ALTER FUNCTION public.ktb_block_book_delete() SET search_path = public;
ALTER FUNCTION public.ktb_block_member_delete() SET search_path = public;
ALTER FUNCTION public.profiles_updated_at() SET search_path = public;
ALTER FUNCTION public.documents_updated_at() SET search_path = public;

-- ---------------------------------------------------------------------------
-- 4. Loan copy check with row lock
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ktb_loans_enforce_copies()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_copies integer;
  v_active integer;
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.status = 'معار' AND OLD.status IS DISTINCT FROM 'معار') THEN
    -- Lock the book row: concurrent loans for the same book wait here.
    SELECT copies INTO v_copies FROM ktb_books WHERE id = NEW.book_id FOR UPDATE;
    v_active := public.ktb_active_loan_count(NEW.book_id);
    IF v_active >= GREATEST(COALESCE(v_copies, 1), 1) THEN
      RAISE EXCEPTION 'كل النسخ معارة'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ktb_loans_enforce_copies() FROM PUBLIC, anon, authenticated;

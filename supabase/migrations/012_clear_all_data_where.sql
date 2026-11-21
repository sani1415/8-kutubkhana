-- Supabase enables pg_safeupdate for API requests, which rejects a DELETE
-- without a WHERE clause ("DELETE requires a WHERE clause"). `WHERE true`
-- keeps the meaning (delete every row) and satisfies the guard.
CREATE OR REPLACE FUNCTION public.clear_all_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_profiles_admin() THEN
    RAISE EXCEPTION 'صلاحية المدير فقط'
      USING errcode = 'P0001';
  END IF;

  DELETE FROM ktb_loans WHERE true;
  DELETE FROM ktb_documents WHERE true;
  DELETE FROM ktb_books WHERE true;
  DELETE FROM ktb_members WHERE true;
  DELETE FROM ktb_diary_entries WHERE true;
  DELETE FROM ktb_categories WHERE true;
  DELETE FROM ktb_publishers WHERE true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clear_all_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_all_data() TO authenticated, service_role;

-- مكتبة المصباح - Atomic rename operations + AI scan quota
-- Run after 010_security_hardening.sql.

-- ---------------------------------------------------------------------------
-- Rename a category / publisher together with every book that uses it, in one
-- transaction. SECURITY INVOKER: RLS still decides who may do it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ktb_rename_category(p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_new text := trim(p_new);
BEGIN
  IF v_new = '' THEN
    RAISE EXCEPTION 'الاسم الجديد مطلوب' USING ERRCODE = 'P0001';
  END IF;
  UPDATE ktb_categories SET name = v_new WHERE name = p_old;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'القسم غير موجود' USING ERRCODE = 'P0002';
  END IF;
  UPDATE ktb_books SET category = v_new, updated_at = now() WHERE category = p_old;
END;
$$;

CREATE OR REPLACE FUNCTION public.ktb_rename_publisher(p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_new text := trim(p_new);
BEGIN
  IF v_new = '' THEN
    RAISE EXCEPTION 'الاسم الجديد مطلوب' USING ERRCODE = 'P0001';
  END IF;
  UPDATE ktb_publishers SET name = v_new WHERE name = p_old;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'دار النشر غير موجودة' USING ERRCODE = 'P0002';
  END IF;
  UPDATE ktb_books SET publisher = v_new, updated_at = now() WHERE publisher = p_old;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ktb_rename_category(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ktb_rename_publisher(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ktb_rename_category(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ktb_rename_publisher(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- AI scan quota: the scan-books Edge Function claims one unit per image.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ktb_scan_usage (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ktb_scan_usage_user_time ON ktb_scan_usage (user_id, created_at DESC);
ALTER TABLE ktb_scan_usage ENABLE ROW LEVEL SECURITY;
-- No policies: only the SECURITY DEFINER function below touches this table.

CREATE OR REPLACE FUNCTION public.ktb_claim_scan(p_daily_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_used integer;
BEGIN
  IF v_uid IS NULL OR COALESCE(public.get_user_role(), '') NOT IN ('admin', 'librarian') THEN
    RAISE EXCEPTION 'صلاحيات غير كافية' USING ERRCODE = '42501';
  END IF;
  -- Serialize claims per user so parallel requests cannot overshoot.
  PERFORM pg_advisory_xact_lock(hashtext('ktb_scan:' || v_uid::text));
  SELECT count(*) INTO v_used
  FROM ktb_scan_usage
  WHERE user_id = v_uid AND created_at > now() - interval '24 hours';
  IF v_used >= LEAST(GREATEST(p_daily_limit, 1), 500) THEN
    RAISE EXCEPTION 'تم بلوغ الحد اليومي للمسح' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO ktb_scan_usage (user_id) VALUES (v_uid);
  RETURN LEAST(GREATEST(p_daily_limit, 1), 500) - v_used - 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ktb_claim_scan(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ktb_claim_scan(integer) TO authenticated;

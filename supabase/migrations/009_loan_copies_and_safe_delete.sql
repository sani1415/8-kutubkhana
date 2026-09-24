-- Loan copies, book status follows loans, and delete guards.
-- Safe to run once after 008. Drops leftover anon-all policies if schema.sql was re-applied.

DROP POLICY IF EXISTS "Allow anon all on ktb_books" ON ktb_books;
DROP POLICY IF EXISTS "Allow anon all on ktb_members" ON ktb_members;
DROP POLICY IF EXISTS "Allow anon all on ktb_loans" ON ktb_loans;
DROP POLICY IF EXISTS "Allow anon all on ktb_diary_entries" ON ktb_diary_entries;
DROP POLICY IF EXISTS "Allow anon all on ktb_categories" ON ktb_categories;
DROP POLICY IF EXISTS "Allow anon all on ktb_publishers" ON ktb_publishers;

DROP INDEX IF EXISTS loans_one_active_per_book;

-- If more copies are already on loan than the stored copies count, raise copies to match.
UPDATE ktb_books b
SET copies = sub.active_count
FROM (
  SELECT book_id, count(*)::int AS active_count
  FROM ktb_loans
  WHERE status = 'معار'
  GROUP BY book_id
) sub
WHERE b.id = sub.book_id
  AND b.copies < sub.active_count;

CREATE OR REPLACE FUNCTION public.ktb_active_loan_count(p_book_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.ktb_loans
  WHERE book_id = p_book_id AND status = 'معار';
$$;

CREATE OR REPLACE FUNCTION public.ktb_book_status_for(p_book_id uuid, p_copies integer)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN public.ktb_active_loan_count(p_book_id) >= GREATEST(COALESCE(p_copies, 1), 1) THEN 'معار'
    ELSE 'متاح'
  END;
$$;

CREATE OR REPLACE FUNCTION public.ktb_books_before_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_active integer;
BEGIN
  v_active := public.ktb_active_loan_count(NEW.id);
  IF NEW.copies < v_active THEN
    RAISE EXCEPTION 'عدد النسخ أقل من الإعارات النشطة'
      USING ERRCODE = 'P0001';
  END IF;
  NEW.status := public.ktb_book_status_for(NEW.id, NEW.copies);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ktb_books_before_update ON ktb_books;
CREATE TRIGGER ktb_books_before_update
  BEFORE UPDATE ON ktb_books
  FOR EACH ROW
  EXECUTE PROCEDURE public.ktb_books_before_update();

CREATE OR REPLACE FUNCTION public.ktb_loans_enforce_copies()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_book_id uuid;
  v_copies integer;
  v_active integer;
BEGIN
  v_book_id := COALESCE(NEW.book_id, OLD.book_id);

  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.status = 'معار' AND OLD.status IS DISTINCT FROM 'معار') THEN
    SELECT copies INTO v_copies FROM ktb_books WHERE id = NEW.book_id;
    v_active := public.ktb_active_loan_count(NEW.book_id);
    IF TG_OP = 'UPDATE' AND OLD.book_id = NEW.book_id AND OLD.status = 'معار' THEN
      v_active := v_active - 1;
    END IF;
    IF v_active >= GREATEST(COALESCE(v_copies, 1), 1) THEN
      RAISE EXCEPTION 'كل النسخ معارة'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS ktb_loans_enforce_copies ON ktb_loans;
CREATE TRIGGER ktb_loans_enforce_copies
  BEFORE INSERT OR UPDATE ON ktb_loans
  FOR EACH ROW
  EXECUTE PROCEDURE public.ktb_loans_enforce_copies();

CREATE OR REPLACE FUNCTION public.ktb_loans_sync_book_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_book_id uuid;
BEGIN
  v_book_id := COALESCE(NEW.book_id, OLD.book_id);
  UPDATE ktb_books
  SET updated_at = now()
  WHERE id = v_book_id;
  IF TG_OP = 'UPDATE' AND OLD.book_id IS DISTINCT FROM NEW.book_id THEN
    UPDATE ktb_books SET updated_at = now() WHERE id = OLD.book_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS ktb_loans_sync_book_status ON ktb_loans;
CREATE TRIGGER ktb_loans_sync_book_status
  AFTER INSERT OR UPDATE OR DELETE ON ktb_loans
  FOR EACH ROW
  EXECUTE PROCEDURE public.ktb_loans_sync_book_status();

CREATE OR REPLACE FUNCTION public.ktb_block_book_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.ktb_active_loan_count(OLD.id) > 0 THEN
    RAISE EXCEPTION 'الكتاب معار حالياً. يرجى تسجيل الإرجاع قبل الحذف.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS ktb_block_book_delete ON ktb_books;
CREATE TRIGGER ktb_block_book_delete
  BEFORE DELETE ON ktb_books
  FOR EACH ROW
  EXECUTE PROCEDURE public.ktb_block_book_delete();

CREATE OR REPLACE FUNCTION public.ktb_block_member_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM ktb_loans
    WHERE member_id = OLD.id AND status = 'معار'
  ) THEN
    RAISE EXCEPTION 'لا يمكن حذف العضو. يوجد إعارات نشطة.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS ktb_block_member_delete ON ktb_members;
CREATE TRIGGER ktb_block_member_delete
  BEFORE DELETE ON ktb_members
  FOR EACH ROW
  EXECUTE PROCEDURE public.ktb_block_member_delete();

UPDATE ktb_books
SET status = public.ktb_book_status_for(id, copies),
    updated_at = now()
WHERE status IS DISTINCT FROM public.ktb_book_status_for(id, copies);

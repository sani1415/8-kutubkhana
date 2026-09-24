-- مكتبة المصباح - Supabase schema (ktb_ prefix for shared DB)
-- Run this in Supabase Dashboard → SQL Editor

-- Books
CREATE TABLE IF NOT EXISTS ktb_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  author TEXT DEFAULT '',
  category TEXT DEFAULT '',
  editor TEXT DEFAULT '',
  parts INTEGER DEFAULT 1,
  publisher TEXT DEFAULT '',
  year TEXT DEFAULT '',
  copies INTEGER DEFAULT 1,
  status TEXT DEFAULT 'متاح',
  cabinet TEXT DEFAULT '',
  shelf TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Members
CREATE TABLE IF NOT EXISTS ktb_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Loans
CREATE TABLE IF NOT EXISTS ktb_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES ktb_books(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES ktb_members(id) ON DELETE CASCADE,
  loan_date DATE,
  return_date DATE,
  status TEXT DEFAULT 'معار',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Diary entries
CREATE TABLE IF NOT EXISTS ktb_diary_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT (current_date),
  category TEXT DEFAULT 'أخرى',
  details TEXT DEFAULT '',
  images TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Categories (simple list)
CREATE TABLE IF NOT EXISTS ktb_categories (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

-- Publishers (simple list)
CREATE TABLE IF NOT EXISTS ktb_publishers (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

-- Row Level Security is on. This file does not grant access.
-- Run migrations 001 through 009 after this file. Re-running schema.sql
-- does not add anonymous write policies.
ALTER TABLE ktb_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE ktb_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE ktb_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE ktb_diary_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ktb_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE ktb_publishers ENABLE ROW LEVEL SECURITY;

-- Seed default categories
INSERT INTO ktb_categories (name) VALUES
  ('تفسير'), ('حديث'), ('فقه'), ('عقيدة'), ('سيرة'), ('تاريخ'), ('لغة عربية'), ('أدب'), ('تزكية'), ('عام')
ON CONFLICT (name) DO NOTHING;

-- Seed default publishers
INSERT INTO ktb_publishers (name) VALUES
  ('دار السلام'), ('دار الكتب العلمية'), ('مؤسسة الرسالة'), ('دار ابن كثير'), ('دار المعرفة'), ('دار التراث العربي'), ('أخرى')
ON CONFLICT (name) DO NOTHING;

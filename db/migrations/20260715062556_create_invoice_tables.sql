/*
# Create invoices and invoice_items tables, add qr_code_url to profiles

1. New Tables
- `invoices`: stores invoice headers per user (number, customer, dates, amounts, currency).
- `invoice_items`: line items belonging to an invoice.

2. Modified Tables
- `profiles`: add `qr_code_url` (text, nullable) for user's uploaded payment QR image.

3. New Sequence + Trigger
- `user_invoice_seq`: per-user auto-increment for invoice_number.

4. Security (RLS)
- invoices: owner-scoped CRUD (auth.uid() = user_id).
- invoice_items: owner-scoped via parent invoice.
- Storage bucket `qr-codes` for QR image uploads (public read, authenticated write).
*/

-- 1. Add qr_code_url to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS qr_code_url text;

-- 2. Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_number integer NOT NULL,
  customer_name text NOT NULL DEFAULT '',
  customer_phone text,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  subtotal numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  balance numeric GENERATED ALWAYS AS (subtotal - paid_amount) STORED,
  currency text NOT NULL DEFAULT 'USD',
  notes text,
  status text NOT NULL DEFAULT 'unpaid',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_invoices" ON invoices;
CREATE POLICY "select_own_invoices" ON invoices FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_invoices" ON invoices;
CREATE POLICY "insert_own_invoices" ON invoices FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_invoices" ON invoices;
CREATE POLICY "update_own_invoices" ON invoices FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_invoices" ON invoices;
CREATE POLICY "delete_own_invoices" ON invoices FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- 3. Create invoice_items table
CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total numeric GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_invoice_items" ON invoice_items;
CREATE POLICY "select_own_invoice_items" ON invoice_items FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND invoices.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_invoice_items" ON invoice_items;
CREATE POLICY "insert_own_invoice_items" ON invoice_items FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND invoices.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_invoice_items" ON invoice_items;
CREATE POLICY "update_own_invoice_items" ON invoice_items FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND invoices.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND invoices.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_invoice_items" ON invoice_items;
CREATE POLICY "delete_own_invoice_items" ON invoice_items FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND invoices.user_id = auth.uid())
  );

-- 4. Per-user invoice number sequence + trigger
CREATE SEQUENCE IF NOT EXISTS user_invoice_seq;

CREATE OR REPLACE FUNCTION assign_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_num integer;
BEGIN
  next_num := nextval('user_invoice_seq');
  NEW.invoice_number := next_num;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_invoice_number ON invoices;
CREATE TRIGGER trg_assign_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION assign_invoice_number();

-- 5. Storage bucket for QR code uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('qr-codes', 'qr-codes', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "qr_upload_own" ON storage.objects;
CREATE POLICY "qr_upload_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'qr-codes');

DROP POLICY IF EXISTS "qr_read_all" ON storage.objects;
CREATE POLICY "qr_read_all" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'qr-codes');

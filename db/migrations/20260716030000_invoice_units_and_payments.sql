/*
# Add item units and a payment ledger for invoices

1. Modified Tables
- `invoice_items`: add `unit` (text, nullable) so each line item can carry a
  unit label (e.g. ដុំ, គីឡូ), matching the Income/Expense unit pattern.

2. New Tables
- `invoice_payments`: individual payment/installment records against an
  invoice (date, amount, note). Replaces the old single "paid_amount" input
  with a running ledger — an invoice can be paid in multiple installments.

3. Trigger
- Whenever a payment is inserted/updated/deleted, `invoices.paid_amount` is
  recalculated as the sum of all its payments, and `invoices.status` is set
  to 'paid' | 'partial' | 'unpaid' automatically.

4. Security (RLS)
- invoice_payments: owner-scoped via parent invoice (same pattern as
  invoice_items).
*/

-- 1. Add unit column to invoice_items
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS unit text;

-- 2. Create invoice_payments table
CREATE TABLE IF NOT EXISTS invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  note text,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_invoice_payments" ON invoice_payments;
CREATE POLICY "select_own_invoice_payments" ON invoice_payments FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_payments.invoice_id AND invoices.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_invoice_payments" ON invoice_payments;
CREATE POLICY "insert_own_invoice_payments" ON invoice_payments FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_payments.invoice_id AND invoices.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_invoice_payments" ON invoice_payments;
CREATE POLICY "update_own_invoice_payments" ON invoice_payments FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_payments.invoice_id AND invoices.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_payments.invoice_id AND invoices.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_invoice_payments" ON invoice_payments;
CREATE POLICY "delete_own_invoice_payments" ON invoice_payments FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_payments.invoice_id AND invoices.user_id = auth.uid())
  );

-- 3. Trigger to keep invoices.paid_amount + status in sync with payments
CREATE OR REPLACE FUNCTION sync_invoice_paid_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_invoice_id uuid;
  total_paid numeric;
  inv_subtotal numeric;
BEGIN
  target_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM invoice_payments WHERE invoice_id = target_invoice_id;

  SELECT subtotal INTO inv_subtotal FROM invoices WHERE id = target_invoice_id;

  UPDATE invoices
  SET paid_amount = total_paid,
      status = CASE
        WHEN total_paid <= 0 THEN 'unpaid'
        WHEN total_paid >= inv_subtotal THEN 'paid'
        ELSE 'partial'
      END
  WHERE id = target_invoice_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_invoice_paid_amount ON invoice_payments;
CREATE TRIGGER trg_sync_invoice_paid_amount
  AFTER INSERT OR UPDATE OR DELETE ON invoice_payments
  FOR EACH ROW
  EXECUTE FUNCTION sync_invoice_paid_amount();

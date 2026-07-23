/*
# Re-apply discount-aware invoice status calculation

1. Problem
- Migration 20260720020000 fixed the mutable-search_path security warning
  on `sync_invoice_paid_amount`, but its function body was written against
  an older copy that compared paid amount to raw `subtotal` — silently
  undoing the 20260719060000 fix that compares against `subtotal -
  discount` instead. An invoice fully paid off after a discount could
  again show status "partial" instead of "paid".

2. Changes
- Re-create `sync_invoice_paid_amount` with both fixes together: pinned
  `search_path` (security) AND `subtotal - discount` as the paid-off
  threshold (correctness).

## Important Notes
- Safe to re-run (CREATE OR REPLACE).
*/

CREATE OR REPLACE FUNCTION sync_invoice_paid_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_invoice_id uuid;
  total_paid numeric;
  inv_due numeric;
BEGIN
  target_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM invoice_payments WHERE invoice_id = target_invoice_id;

  SELECT (subtotal - discount) INTO inv_due FROM invoices WHERE id = target_invoice_id;

  UPDATE invoices
  SET paid_amount = total_paid,
      status = CASE
        WHEN total_paid <= 0 THEN 'unpaid'
        WHEN total_paid >= inv_due THEN 'paid'
        ELSE 'partial'
      END
  WHERE id = target_invoice_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

/*
# Fix invoice status calculation to account for discount

1. Changes
- `sync_invoice_paid_amount()`: the trigger that keeps `invoices.paid_amount`
  and `invoices.status` in sync with the `invoice_payments` ledger compared
  total paid against the raw `subtotal`. Since discount was added, an
  invoice that's fully paid off (balance = 0) after a discount could still
  be misreported as "partial". This redefines the function to compare
  against `subtotal - discount` instead.

## Important Notes
- Safe to re-run (CREATE OR REPLACE).
*/

CREATE OR REPLACE FUNCTION sync_invoice_paid_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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

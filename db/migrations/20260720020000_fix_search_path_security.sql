/*
# Fix mutable search_path on sync_invoice_paid_amount

1. Security
- The Supabase security advisor flags `sync_invoice_paid_amount` as having
  a mutable search_path. Because the function is SECURITY DEFINER, an
  attacker could otherwise create objects (e.g. a rogue `invoices` table)
  in a schema earlier in their own search_path to hijack what the
  function resolves to. Pinning `search_path = public, pg_temp` removes
  that risk while keeping the function's existing behavior unchanged.

## Important Notes
- This only re-defines the function body's SET clause; the trigger that
  calls it is untouched and does not need to be re-created.
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

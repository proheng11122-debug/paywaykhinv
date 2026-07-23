/*
# Add invoice discount support

1. Modified Tables
- `invoices`: add `discount` (numeric, not null, default 0) — a flat amount
  subtracted from `subtotal` before payments are applied. Replaces the old
  free-text "notes" field in the invoice editor as the primary use of that
  space (the `notes` column itself is untouched, for backward compatibility
  with any invoice that already has a note saved).
- `invoices.balance`: re-created as a GENERATED column using
  `subtotal - discount - paid_amount` (previously `subtotal - paid_amount`)
  so outstanding balance correctly reflects the discount.

## Important Notes
- Postgres doesn't support altering a generated column's expression in
  place, so `balance` is dropped and re-added with the new formula. This
  migration is safe to re-run.
*/

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0 CHECK (discount >= 0);

ALTER TABLE invoices DROP COLUMN IF EXISTS balance;
ALTER TABLE invoices ADD COLUMN balance numeric GENERATED ALWAYS AS (subtotal - discount - paid_amount) STORED;

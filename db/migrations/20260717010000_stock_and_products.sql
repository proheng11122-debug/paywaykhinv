/*
# Add Stock (inventory) module + link invoices to products

1. New Tables
- `products`: one row per item a business sells/stocks.
  - `id`, `user_id` (owner), `name`, `unit`, `quantity` (current stock, kept in
    sync automatically by a trigger — never edited directly by the app),
    `cost_price`, `sell_price`, `low_stock_threshold`, `created_at`.
- `stock_movements`: an append-only ledger of stock changes.
  - `id`, `product_id`, `user_id`, `type` ('in' | 'out' | 'adjust'),
    `quantity` (always a positive number; direction comes from `type`),
    `note`, `movement_date`, `created_at`.

2. Modified Tables
- `invoice_items`: add `product_id` (nullable FK -> products). When an
  invoice line is linked to a product, saving the invoice automatically
  writes an 'out' stock movement for that quantity — this is the
  "automatic" link between Invoices and Stock.

3. Automation (Triggers)
- `sync_product_quantity`: whenever a stock_movements row is
  inserted/updated/deleted, recompute the parent product's `quantity` as
  (sum of 'in') - (sum of 'out') + (sum of signed 'adjust'), so the
  product's on-hand quantity is always derived, never hand-edited.

4. Security (RLS)
- products: owner-scoped CRUD (auth.uid() = user_id), same pattern as
  `transactions`.
- stock_movements: owner-scoped CRUD (auth.uid() = user_id).
- invoice_items: no policy change needed, product_id is just a plain column.

## Important Notes
- All tables use CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so
  this migration is safe to re-run.
- `quantity` on `stock_movements` must be entered as a positive number in
  the UI — the trigger applies the sign based on `type`.
*/

-- 1. products
CREATE TABLE IF NOT EXISTS products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'ដុំ',
  quantity numeric NOT NULL DEFAULT 0,
  cost_price numeric NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  sell_price numeric NOT NULL DEFAULT 0 CHECK (sell_price >= 0),
  low_stock_threshold numeric NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','KHR')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_products" ON products;
CREATE POLICY "select_own_products" ON products FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_products" ON products;
CREATE POLICY "insert_own_products" ON products FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_products" ON products;
CREATE POLICY "update_own_products" ON products FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_products" ON products;
CREATE POLICY "delete_own_products" ON products FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- 2. stock_movements
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('in','out','adjust')),
  quantity numeric NOT NULL CHECK (quantity > 0),
  note text,
  movement_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, movement_date);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_stock_movements" ON stock_movements;
CREATE POLICY "select_own_stock_movements" ON stock_movements FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_stock_movements" ON stock_movements;
CREATE POLICY "insert_own_stock_movements" ON stock_movements FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_stock_movements" ON stock_movements;
CREATE POLICY "update_own_stock_movements" ON stock_movements FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_stock_movements" ON stock_movements;
CREATE POLICY "delete_own_stock_movements" ON stock_movements FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- 3. Link invoice_items -> products (nullable; plain items with no product are still allowed)
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id) ON DELETE SET NULL;

-- 4. Trigger: keep products.quantity in sync with stock_movements automatically
CREATE OR REPLACE FUNCTION sync_product_quantity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_product_id uuid;
  total_qty numeric;
BEGIN
  target_product_id := COALESCE(NEW.product_id, OLD.product_id);

  SELECT COALESCE(SUM(
    CASE
      WHEN type = 'in' THEN quantity
      WHEN type = 'out' THEN -quantity
      WHEN type = 'adjust' THEN quantity
      ELSE 0
    END
  ), 0) INTO total_qty
  FROM stock_movements WHERE product_id = target_product_id;

  UPDATE products SET quantity = total_qty WHERE id = target_product_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_product_quantity ON stock_movements;
CREATE TRIGGER trg_sync_product_quantity
  AFTER INSERT OR UPDATE OR DELETE ON stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION sync_product_quantity();

REVOKE EXECUTE ON FUNCTION public.sync_product_quantity() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_product_quantity() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_product_quantity() FROM PUBLIC;

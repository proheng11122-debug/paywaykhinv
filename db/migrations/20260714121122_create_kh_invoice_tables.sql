/*
# KH Invoice — Create profiles, transactions, and custom_units tables

This migration sets up the database for a multi-user invoice/finance app called KH Invoice.
Each user (vendor) signs up with a phone number (converted to a fake email internally for
Supabase Auth) and manages their own business data: income/expense transactions and
custom units of measure.

## 1. New Tables

### profiles
- `id` (uuid, primary key) — references auth.users, cascade on delete. One row per user.
- `business_name` (text) — the vendor's business display name.
- `username` (text) — a chosen username for the business.
- `phone` (text, unique) — the vendor's phone number (for display + uniqueness).
- `is_locked` (boolean, default false) — admin can lock a user's account.
- `trial_started_at` (timestamptz, default now()) — when the trial began.
- `created_at` (timestamptz, default now()).

### transactions
- `id` (uuid, primary key, auto-generated).
- `user_id` (uuid, not null, defaults to auth.uid()) — owner; references auth.users, cascade on delete.
- `type` (text, not null) — 'income' or 'expense' (CHECK constraint).
- `transaction_date` (date, not null, default current_date) — when the transaction occurred.
- `description` (text, not null) — what the transaction was for.
- `quantity` (numeric, not null, default 1, must be > 0).
- `unit` (text) — unit of measure (e.g. ដុំ, កែវ, គីឡូ, or a custom unit).
- `unit_price` (numeric, not null, must be > 0) — price per unit.
- `amount` (numeric, GENERATED ALWAYS AS quantity * unit_price, STORED) — computed total.
- `currency` (text, not null, default 'USD') — 'USD' or 'KHR' (CHECK constraint).
- `created_at` (timestamptz, default now()).
- Index on (user_id, transaction_date) for efficient range queries.

### custom_units
- `id` (uuid, primary key, auto-generated).
- `user_id` (uuid, not null, defaults to auth.uid()) — owner; references auth.users, cascade on delete.
- `name` (text, not null) — the unit name (e.g. កំប៉ុង).
- `created_at` (timestamptz, default now()).
- Unique constraint on (user_id, name) so a user can't add the same unit twice.

## 2. Security (Row Level Security)

All three tables enable RLS. This is a signed-in app, so all policies are scoped
TO authenticated with ownership checks via auth.uid():

- profiles: owner is the row's `id` itself (auth.uid() = id). 4 policies (SELECT/INSERT/UPDATE/DELETE).
- transactions: owner is `user_id` (auth.uid() = user_id). 4 policies.
- custom_units: owner is `user_id` (auth.uid() = user_id). 4 policies.

The user_id columns DEFAULT to auth.uid() so inserts that omit user_id still
satisfy the INSERT policy's WITH CHECK.

## 3. Important Notes
- Email confirmation is expected to be OFF (the app uses phone-derived fake emails).
- No destructive operations are performed — all tables use CREATE TABLE IF NOT EXISTS.
- Policies are dropped before re-creation to keep the migration idempotent.
*/

-- ============ profiles ============
CREATE TABLE IF NOT EXISTS profiles (
  id uuid references auth.users on delete cascade primary key,
  business_name text,
  username text,
  phone text unique,
  is_locked boolean default false,
  trial_started_at timestamptz default now(),
  created_at timestamptz default now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- ============ transactions ============
CREATE TABLE IF NOT EXISTS transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null default auth.uid(),
  type text check (type in ('income','expense')) not null,
  transaction_date date not null default current_date,
  description text not null,
  quantity numeric not null default 1 check (quantity > 0),
  unit text,
  unit_price numeric not null check (unit_price > 0),
  amount numeric generated always as (quantity * unit_price) stored,
  currency text check (currency in ('USD','KHR')) not null default 'USD',
  created_at timestamptz default now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, transaction_date);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_transactions" ON transactions;
CREATE POLICY "select_own_transactions" ON transactions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_transactions" ON transactions;
CREATE POLICY "insert_own_transactions" ON transactions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_transactions" ON transactions;
CREATE POLICY "update_own_transactions" ON transactions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_transactions" ON transactions;
CREATE POLICY "delete_own_transactions" ON transactions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============ custom_units ============
CREATE TABLE IF NOT EXISTS custom_units (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null default auth.uid(),
  name text not null,
  created_at timestamptz default now(),
  unique(user_id, name)
);

ALTER TABLE custom_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_units" ON custom_units;
CREATE POLICY "select_own_units" ON custom_units FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_units" ON custom_units;
CREATE POLICY "insert_own_units" ON custom_units FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_units" ON custom_units;
CREATE POLICY "update_own_units" ON custom_units FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_units" ON custom_units;
CREATE POLICY "delete_own_units" ON custom_units FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

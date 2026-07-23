/*
# Add discount, description and admin QR image fields for subscription flow

1. Modified Tables
- `subscription_requests`: add `discount` (numeric, default 0) and
  `description` (text, nullable) so a user can note a manual discount or
  any context about the payment (e.g. "paid by a friend's account") when
  submitting a subscription payment for admin verification.
- `profiles`: add `subscription_qr_url` (text, nullable) so the admin can
  upload their own ABA KHQR payment image from inside the app instead of
  relying on the static /subscription-qr.png file bundled at build time.

## Important Notes
- Safe to re-run (ADD COLUMN IF NOT EXISTS).
- transaction_id remains nullable — it stays optional so a payment can be
  submitted with just the amount/date/description if the user does not
  have the ABA transaction id handy yet.
*/

ALTER TABLE subscription_requests ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0;
ALTER TABLE subscription_requests ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_qr_url text;

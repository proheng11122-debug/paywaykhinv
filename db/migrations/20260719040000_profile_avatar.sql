/*
# Add profile photo (avatar) support

1. Modified Tables
- `profiles`: add `avatar_url` (text, nullable) — public URL of the business's
  uploaded profile photo, shown in the app header and Account screen.

2. Storage
- Reuses the existing `qr-codes` public storage bucket (already has
  authenticated-write / public-read policies from the invoice tables
  migration), storing avatar images under `${user_id}/avatar.<ext>` so no
  new bucket or policy is required.

## Important Notes
- Uses ADD COLUMN IF NOT EXISTS so this migration is safe to re-run.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;

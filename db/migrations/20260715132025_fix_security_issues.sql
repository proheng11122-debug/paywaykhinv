/*
# Fix security vulnerabilities

## Summary
Fixes 5 security issues identified in the project audit:

1. **Function Search Path Mutable**: `public.assign_invoice_number` had no fixed `search_path`,
   allowing a malicious actor to hijack object resolution. Now set to `search_path = public`.

2. **Public Bucket Allows Listing**: The `qr_read_all` SELECT policy on `storage.objects`
   allowed anyone to list ALL files in the `qr-codes` bucket. Public buckets serve objects
   via public URLs without needing a SELECT policy — the policy was overexposing data.
   Dropped entirely.

3. **Public Can Execute SECURITY DEFINER Function**: `anon` role had EXECUTE on
   `assign_invoice_number()`, a SECURITY DEFINER trigger function. This allowed unauthenticated
   callers to invoke it via `/rest/v1/rpc/assign_invoice_number`. Revoked EXECUTE from `anon`.

4. **Signed-In Users Can Execute SECURITY DEFINER Function**: `authenticated` role also had
   EXECUTE on the trigger function. Trigger functions should only be called by the database
   engine during INSERT, never directly via RPC. Revoked EXECUTE from `authenticated`.

5. **Leaked Password Protection Disabled**: This is a Supabase Auth dashboard setting
   (Authentication > Providers > Email > "Leaked password protection"). It cannot be toggled
   via SQL migration — must be enabled in the Supabase dashboard. See notes below.

## Changes
- ALTER FUNCTION `public.assign_invoice_number()` SET SCHEMA public, set `search_path = public`.
- REVOKE EXECUTE on `assign_invoice_number()` from `anon`, `authenticated`, and `PUBLIC`.
- DROP POLICY `qr_read_all` on `storage.objects` (was scoped to `bucket_id = 'qr-codes'`).

## Security Changes
- Function now has immutable search_path — prevents search path hijacking.
- Trigger function no longer callable via REST API by any client role.
- Public bucket no longer allows listing of all QR code files.

## Important Notes
1. The `assign_invoice_number` function is a trigger function called automatically
   by a BEFORE INSERT trigger on the `invoices` table. It does NOT need to be
   executable by `anon` or `authenticated` — the trigger fires with the table
   owner's privileges, not the calling role's. Revoking EXECUTE does not break
   invoice creation.

2. **Leaked Password Protection** must be enabled manually in the Supabase dashboard:
   go to Authentication > Providers > Email > toggle "Leaked password protection" ON.
   This checks new passwords against the HaveIBeenPwned database and cannot be
   configured via SQL.
*/

-- 1. Fix mutable search_path + revoke unsafe grants
ALTER FUNCTION public.assign_invoice_number() SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.assign_invoice_number() FROM anon;
REVOKE EXECUTE ON FUNCTION public.assign_invoice_number() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_invoice_number() FROM PUBLIC;

-- 2. Remove broad SELECT policy on qr-codes public bucket
DROP POLICY IF EXISTS "qr_read_all" ON storage.objects;

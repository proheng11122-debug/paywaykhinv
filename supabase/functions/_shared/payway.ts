// Shared helpers for talking to ABA PayWay from Supabase Edge Functions.
//
// Required secrets (set with `supabase secrets set NAME=value`):
//   PAYWAY_MERCHANT_ID  - your merchant_id from the Developer Suite
//   PAYWAY_API_KEY      - your API key from the Developer Suite (never expose to the frontend)
//   PAYWAY_ENV           - "sandbox" (default) or "production"

export const PLANS: Record<string, { months: number; price: number; labelEn: string }> = {
  '1m': { months: 1, price: 2, labelEn: '1 Month Subscription' },
  '6m': { months: 6, price: 7, labelEn: '6 Month Subscription' },
  '1y': { months: 12, price: 14, labelEn: '1 Year Subscription' },
};

export function paywayBaseUrl(): string {
  const env = (Deno.env.get('PAYWAY_ENV') || 'sandbox').toLowerCase();
  return env === 'production'
    ? 'https://checkout.payway.com.kh'
    : 'https://checkout-sandbox.payway.com.kh';
}

export function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required secret: ${name}`);
  return v;
}

// YYYYMMDDHHmmss in UTC, as required by PayWay.
export function reqTime(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds())
  );
}

// HMAC-SHA512 -> base64, matching PayWay's PHP sample (hash_hmac('sha512', $data, $api_key, true) then base64).
export async function hmacSha512Base64(data: string, key: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export function base64(input: string): string {
  return btoa(unescape(encodeURIComponent(input)));
}

// Keep it short + unique. PayWay allows max 20 chars for tran_id.
export function makeTranId(userId: string): string {
  const short = userId.replace(/-/g, '').slice(0, 8);
  const ts = Date.now().toString(36); // base36 keeps it compact
  return `${short}${ts}`.slice(0, 20);
}

export function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

// ============================================================================
// COPY THIS ENTIRE FILE into: Supabase Dashboard -> Edge Functions -> Deploy a
// new function -> name it exactly: create-qr-payment
// (Self-contained: no imports from other project files, safe for the
// Dashboard's single-file editor.)
// ============================================================================
//
// Required secrets (Dashboard -> Edge Functions -> Secrets):
//   PAYWAY_MERCHANT_ID, PAYWAY_API_KEY, and optionally PAYWAY_ENV (sandbox|production)
import { createClient } from 'npm:@supabase/supabase-js@2';

const PLANS: Record<string, { months: number; price: number; labelEn: string }> = {
  '1m': { months: 1, price: 2, labelEn: '1 Month Subscription' },
  '6m': { months: 6, price: 7, labelEn: '6 Month Subscription' },
  '1y': { months: 12, price: 14, labelEn: '1 Year Subscription' },
};

function paywayBaseUrl(): string {
  const env = (Deno.env.get('PAYWAY_ENV') || 'sandbox').toLowerCase();
  return env === 'production' ? 'https://checkout.payway.com.kh' : 'https://checkout-sandbox.payway.com.kh';
}

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required secret: ${name}`);
  return v;
}

function reqTime(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear().toString() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) +
    pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds())
  );
}

async function hmacSha512Base64(data: string, key: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function base64(input: string): string {
  return btoa(unescape(encodeURIComponent(input)));
}

function makeTranId(userId: string): string {
  const short = userId.replace(/-/g, '').slice(0, 8);
  const ts = Date.now().toString(36);
  return `${short}${ts}`.slice(0, 20);
}

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const anonKey = requireEnv('SUPABASE_ANON_KEY');

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }
    const user = userData.user;

    const { plan } = await req.json();
    const planInfo = PLANS[plan];
    if (!planInfo) {
      return new Response(JSON.stringify({ error: 'Invalid plan' }), {
        status: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const merchantId = requireEnv('PAYWAY_MERCHANT_ID');
    const apiKey = requireEnv('PAYWAY_API_KEY');

    const tranId = makeTranId(user.id);
    const req_time = reqTime();
    const amount = planInfo.price.toFixed(2);
    const items = base64(JSON.stringify([{ name: planInfo.labelEn, quantity: 1, price: planInfo.price }]));
    const first_name = 'Customer';
    const last_name = 'App';
    const email = '';
    const phone = '';
    const purchase_type = 'purchase';
    const payment_option = 'abapay_khqr';
    const callback_url = '';
    const return_deeplink = '';
    const currency = 'USD';
    const custom_fields = '';
    const return_params = '';
    const payout = '';
    const lifetime = 15;
    const qr_image_template = 'template1';

    const hashInput =
      req_time + merchantId + tranId + amount + items + first_name + last_name + email + phone +
      purchase_type + payment_option + callback_url + return_deeplink + currency + custom_fields +
      return_params + payout + lifetime + qr_image_template;
    const hash = await hmacSha512Base64(hashInput, apiKey);

    const paywayRes = await fetch(`${paywayBaseUrl()}/api/payment-gateway/v1/payments/generate-qr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        req_time, merchant_id: merchantId, tran_id: tranId, amount, currency, payment_option,
        lifetime, qr_image_template, items, first_name, last_name, email, phone, purchase_type, hash,
      }),
    });
    const paywayJson = await paywayRes.json();

    if (paywayJson?.status?.code !== '0') {
      return new Response(
        JSON.stringify({ error: 'PayWay error', detail: paywayJson?.status?.message || 'Unknown error' }),
        { status: 502, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
      );
    }

    const { data: inserted, error: insertError } = await userClient
      .from('subscription_requests')
      .insert({
        user_id: user.id,
        plan,
        amount: planInfo.price,
        discount: 0,
        description: 'Auto KHQR payment',
        payway_tran_id: tranId,
        qr_expires_at: new Date(Date.now() + lifetime * 60_000).toISOString(),
      })
      .select('id')
      .single();

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        requestId: inserted.id,
        tranId,
        qrImage: paywayJson.qrImage,
        qrString: paywayJson.qrString,
        abapayDeeplink: paywayJson.abapay_deeplink,
        amount: paywayJson.amount,
        currency: paywayJson.currency,
        expiresInSeconds: lifetime * 60,
      }),
      { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  }
});

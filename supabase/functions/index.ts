// POST /functions/v1/create-qr-payment
// body: { plan: '1m' | '6m' | '1y' }
//
// Verifies the caller's Supabase session, generates a fresh ABA KHQR code
// for the exact plan price via PayWay's generate-qr API, records a
// 'pending' row in subscription_requests, and returns the QR image + a
// requestId the frontend polls via `check-qr-status`.
//
// Required secrets (supabase secrets set ...):
//   PAYWAY_MERCHANT_ID, PAYWAY_API_KEY, (optional) PAYWAY_ENV=sandbox|production
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  PLANS,
  paywayBaseUrl,
  requireEnv,
  reqTime,
  hmacSha512Base64,
  base64,
  makeTranId,
  corsHeaders,
} from '../_shared/payway.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const anonKey = requireEnv('SUPABASE_ANON_KEY');

    // Client scoped to the caller's own session - respects RLS.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
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
    const lifetime = 15; // minutes
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
        req_time,
        merchant_id: merchantId,
        tran_id: tranId,
        amount,
        currency,
        payment_option,
        lifetime,
        qr_image_template,
        items,
        first_name,
        last_name,
        email,
        phone,
        purchase_type,
        hash,
      }),
    });
    const paywayJson = await paywayRes.json();

    if (paywayJson?.status?.code !== '0') {
      return new Response(
        JSON.stringify({ error: 'PayWay error', detail: paywayJson?.status?.message || 'Unknown error' }),
        { status: 502, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
      );
    }

    // Record the pending request using the caller's own session (satisfies RLS: auth.uid() = user_id).
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

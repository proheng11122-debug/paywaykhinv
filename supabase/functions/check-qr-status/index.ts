// POST /functions/v1/check-qr-status
// body: { requestId: string }   (the id returned by create-qr-payment)
//
// Called every few seconds by the frontend while the QR modal is open.
// Asks PayWay's check-transaction-2 API whether the payment has landed;
// if approved, flips subscription_requests.status to 'confirmed', which
// triggers apply_subscription_on_confirm() (see migration) to unlock the
// account and extend subscription_expires_at automatically.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { paywayBaseUrl, requireEnv, reqTime, hmacSha512Base64, corsHeaders } from '../_shared/payway.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const anonKey = requireEnv('SUPABASE_ANON_KEY');
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

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

    const { requestId } = await req.json();

    // SELECT respects RLS -> only ever returns a row owned by this user.
    const { data: row, error: rowError } = await userClient
      .from('subscription_requests')
      .select('id, status, payway_tran_id, qr_expires_at')
      .eq('id', requestId)
      .single();

    if (rowError || !row) {
      return new Response(JSON.stringify({ error: 'Request not found' }), {
        status: 404,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    if (row.status === 'confirmed') {
      return new Response(JSON.stringify({ status: 'confirmed' }), {
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    if (!row.payway_tran_id) {
      return new Response(JSON.stringify({ status: row.status }), {
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    if (row.qr_expires_at && new Date(row.qr_expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ status: 'expired' }), {
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const merchantId = requireEnv('PAYWAY_MERCHANT_ID');
    const apiKey = requireEnv('PAYWAY_API_KEY');
    const req_time = reqTime();
    const hash = await hmacSha512Base64(req_time + merchantId + row.payway_tran_id, apiKey);

    const paywayRes = await fetch(`${paywayBaseUrl()}/api/payment-gateway/v1/payments/check-transaction-2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ req_time, merchant_id: merchantId, tran_id: row.payway_tran_id, hash }),
    });
    const paywayJson = await paywayRes.json();

    const approved = paywayJson?.status?.code === '00' && paywayJson?.data?.payment_status === 'APPROVED';

    if (approved) {
      // Needs the service role: regular users have no UPDATE policy on subscription_requests by design.
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const { error: updateError } = await adminClient
        .from('subscription_requests')
        .update({ status: 'confirmed' })
        .eq('id', requestId);

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 500,
          headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ status: 'confirmed' }), {
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ status: 'pending' }), {
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  }
});

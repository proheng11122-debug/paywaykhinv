// ============================================================================
// COPY THIS ENTIRE FILE into: Supabase Dashboard -> Edge Functions -> Deploy a
// new function -> name it exactly: check-qr-status
// (Self-contained: no imports from other project files, safe for the
// Dashboard's single-file editor.)
// ============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

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
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const { requestId } = await req.json();

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

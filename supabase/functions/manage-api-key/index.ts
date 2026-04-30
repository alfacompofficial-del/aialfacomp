// Create / revoke API keys for the authenticated user
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `nx_live_${hex}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
      auth.slice(7),
    );
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claims.claims.sub;
    const admin = createClient(SUPABASE_URL, SERVICE);

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === 'create') {
      const name = (body.name || 'My key').toString().slice(0, 80);
      const fullKey = randomKey();
      const keyHash = await sha256Hex(fullKey);
      const keyPrefix = fullKey.slice(0, 16) + '…';
      const { data, error } = await admin.from('api_keys').insert({
        user_id: userId, name, key_hash: keyHash, key_prefix: keyPrefix, daily_limit: 100,
      }).select('id, name, key_prefix, created_at, daily_limit').single();
      if (error) throw error;
      return new Response(JSON.stringify({ key: fullKey, info: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'revoke') {
      const id = body.id as string;
      if (!id) throw new Error('id required');
      const { error } = await admin.from('api_keys').update({ revoked: true }).eq('id', id).eq('user_id', userId);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete') {
      const id = body.id as string;
      if (!id) throw new Error('id required');
      const { error } = await admin.from('api_keys').delete().eq('id', id).eq('user_id', userId);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('manage-api-key error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

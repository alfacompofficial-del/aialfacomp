// Public Nexus API — authenticated by API key (nx_live_...)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runAgentStream } from '../_shared/nexus-agent.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 1) Extract API key
    const auth = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing Authorization: Bearer nx_live_...' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const apiKey = auth.slice('Bearer '.length).trim();
    if (!apiKey.startsWith('nx_live_')) {
      return new Response(JSON.stringify({ error: 'Invalid key format. Expected nx_live_...' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2) Lookup key
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const keyHash = await sha256Hex(apiKey);
    const { data: keyRow, error: keyErr } = await admin
      .from('api_keys')
      .select('id, user_id, daily_limit, revoked')
      .eq('key_hash', keyHash)
      .maybeSingle();

    if (keyErr || !keyRow) {
      return new Response(JSON.stringify({ error: 'Invalid API key' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (keyRow.revoked) {
      return new Response(JSON.stringify({ error: 'API key revoked' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3) Rate limit (last 24h)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from('api_usage')
      .select('id', { count: 'exact', head: true })
      .eq('key_id', keyRow.id)
      .gte('created_at', since);

    if ((count ?? 0) >= keyRow.daily_limit) {
      return new Response(JSON.stringify({
        error: `Daily limit ${keyRow.daily_limit} reached. Try again later.`,
        used: count, limit: keyRow.daily_limit,
      }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4) Parse body
    const body = await req.json().catch(() => ({}));
    const { messages, model = 'google/gemini-3-flash-preview' } = body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages: array required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5) Log usage + update last_used_at (don't await heavy update)
    await admin.from('api_usage').insert({
      key_id: keyRow.id, user_id: keyRow.user_id, endpoint: '/v1/chat', status_code: 200,
    });
    admin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow.id).then();

    // 6) Run agent
    return await runAgentStream(messages, model, corsHeaders);
  } catch (e) {
    console.error('public-api error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

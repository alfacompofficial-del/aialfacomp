// Nexus chat edge function — delegates to shared agent
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runAgentStream } from '../_shared/nexus-agent.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { messages, model = 'google/gemini-3-flash-preview', think = false } = await req.json();
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'messages required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract userId from JWT (verify_jwt is false by default; we just decode for context)
    let userId: string | null = null;
    const auth = req.headers.get('Authorization') || '';
    if (auth.startsWith('Bearer ')) {
      try {
        const supa = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!,
          { global: { headers: { Authorization: auth } } },
        );
        const { data } = await supa.auth.getUser();
        userId = data?.user?.id || null;
      } catch { /* ignore */ }
    }

    return await runAgentStream(messages, model, corsHeaders, { think: !!think, userId });
  } catch (e) {
    console.error('chat error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

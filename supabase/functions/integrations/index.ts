// User integrations: save tokens, status, GitHub Pull Request, apply SQL to user's own Supabase project
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const gh = (token: string) => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'User-Agent': 'Nexus-AI',
  'Content-Type': 'application/json',
});

async function ghCall(token: string, method: string, path: string, body?: unknown) {
  const r = await fetch(`https://api.github.com/${path}`, {
    method, headers: gh(token), body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${data?.message || text}`.slice(0, 400));
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization') || '';
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: u } = await userClient.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) return json({ error: 'Нужно войти в аккаунт' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    const { data: row } = await admin.from('user_integrations').select('*').eq('user_id', userId).maybeSingle();

    if (action === 'status') {
      return json({
        github: !!row?.github_token,
        supabase: !!(row?.supabase_project_ref && row?.supabase_access_token),
        supabase_project_ref: row?.supabase_project_ref || '',
      });
    }

    if (action === 'save') {
      const patch: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() };
      for (const k of ['github_token', 'supabase_project_ref', 'supabase_access_token']) {
        if (typeof body[k] === 'string') {
          const v = body[k].trim().slice(0, 500);
          patch[k] = v || null;
        }
      }
      if (typeof patch.supabase_project_ref === 'string' && !/^[a-z0-9]{10,40}$/.test(patch.supabase_project_ref)) {
        return json({ error: 'ID проекта Supabase: только латиница и цифры (например abcdefghijklmnop)' }, 400);
      }
      const { error } = await admin.from('user_integrations').upsert(patch);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === 'github_pr') {
      const token = row?.github_token;
      if (!token) return json({ error: 'Добавьте GitHub-токен в Настройках' }, 400);
      const repo = String(body.repo || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
      const path = String(body.path || '').trim().replace(/^\/+/, '');
      const content = String(body.content || '');
      const title = String(body.title || 'Правка от Nexus').slice(0, 200);
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return json({ error: 'Репозиторий в формате owner/repo' }, 400);
      if (!path || path.includes('..')) return json({ error: 'Укажите путь к файлу' }, 400);
      if (!content || content.length > 500_000) return json({ error: 'Пустой или слишком большой код' }, 400);

      const meta = await ghCall(token, 'GET', `repos/${repo}`);
      const base = String(body.base || meta.default_branch || 'main');
      const baseRef = await ghCall(token, 'GET', `repos/${repo}/git/ref/heads/${encodeURIComponent(base)}`);
      const baseSha = baseRef.object.sha;
      const baseCommit = await ghCall(token, 'GET', `repos/${repo}/git/commits/${baseSha}`);
      const blob = await ghCall(token, 'POST', `repos/${repo}/git/blobs`, { content, encoding: 'utf-8' });
      const tree = await ghCall(token, 'POST', `repos/${repo}/git/trees`, {
        base_tree: baseCommit.tree.sha,
        tree: [{ path, mode: '100644', type: 'blob', sha: blob.sha }],
      });
      const commit = await ghCall(token, 'POST', `repos/${repo}/git/commits`, {
        message: title, tree: tree.sha, parents: [baseSha],
      });
      const branch = `nexus/${Date.now().toString(36)}`;
      await ghCall(token, 'POST', `repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha });
      const pr = await ghCall(token, 'POST', `repos/${repo}/pulls`, {
        title, head: branch, base,
        body: String(body.description || 'Изменение предложено ИИ-агентом Nexus.').slice(0, 5000),
      });
      return json({ ok: true, url: pr.html_url, number: pr.number });
    }

    if (action === 'apply_sql') {
      const ref = row?.supabase_project_ref, token = row?.supabase_access_token;
      if (!ref || !token) return json({ error: 'Добавьте ID проекта и токен Supabase в Настройках' }, 400);
      const sql = String(body.sql || '');
      if (!sql.trim() || sql.length > 200_000) return json({ error: 'Пустой или слишком большой SQL' }, 400);
      const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql }),
      });
      const text = await r.text();
      if (!r.ok) return json({ error: `Supabase ${r.status}: ${text.slice(0, 500)}` }, r.status);
      return json({ ok: true, result: text.slice(0, 4000) });
    }

    return json({ error: 'Неизвестное действие' }, 400);
  } catch (e) {
    console.error('integrations error', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown' }, 500);
  }
});

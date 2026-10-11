ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS think_minutes integer NOT NULL DEFAULT 5;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS versions jsonb NOT NULL DEFAULT '[]'::jsonb;
GRANT UPDATE ON public.messages TO authenticated;
CREATE POLICY msg_update_own ON public.messages FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.repo_cache (
  cache_key text PRIMARY KEY,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.repo_cache TO service_role;
ALTER TABLE public.repo_cache ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_integrations (
  user_id uuid PRIMARY KEY,
  github_token text,
  supabase_project_ref text,
  supabase_access_token text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.user_integrations TO service_role;
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
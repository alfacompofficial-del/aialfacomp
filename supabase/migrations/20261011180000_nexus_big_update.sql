-- Migration: Nexus Big Update
-- Adds user_integrations, repo_cache, message_versions, and think_minutes

-- 1. Add think_minutes to user_settings
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS think_minutes INT NOT NULL DEFAULT 10;

-- 2. User integrations table (stores user GitHub & Supabase tokens securely)
CREATE TABLE IF NOT EXISTS public.user_integrations (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  github_token TEXT,
  supabase_project_ref TEXT,
  supabase_access_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_integrations' AND policyname = 'integrations_select_own'
  ) THEN
    CREATE POLICY "integrations_select_own" ON public.user_integrations FOR SELECT TO authenticated USING (auth.uid() = user_id);
    CREATE POLICY "integrations_insert_own" ON public.user_integrations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
    CREATE POLICY "integrations_update_own" ON public.user_integrations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    CREATE POLICY "integrations_delete_own" ON public.user_integrations FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS user_integrations_updated_at ON public.user_integrations;
CREATE TRIGGER user_integrations_updated_at BEFORE UPDATE ON public.user_integrations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Repo cache (1 hour TTL cache for GitHub repo tree/analysis)
CREATE TABLE IF NOT EXISTS public.repo_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 hour')
);

ALTER TABLE public.repo_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'repo_cache' AND policyname = 'repo_cache_select'
  ) THEN
    CREATE POLICY "repo_cache_select" ON public.repo_cache FOR SELECT USING (true);
    CREATE POLICY "repo_cache_all_service" ON public.repo_cache FOR ALL TO service_role USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_repo_cache_key ON public.repo_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_repo_cache_expires ON public.repo_cache(expires_at);

-- 4. Message versions (for rollback and branching in chat)
CREATE TABLE IF NOT EXISTS public.message_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version_index INT NOT NULL DEFAULT 1,
  user_content TEXT NOT NULL,
  user_attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  assistant_content TEXT NOT NULL DEFAULT '',
  assistant_attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.message_versions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'message_versions' AND policyname = 'versions_select_own'
  ) THEN
    CREATE POLICY "versions_select_own" ON public.message_versions FOR SELECT TO authenticated USING (auth.uid() = user_id);
    CREATE POLICY "versions_insert_own" ON public.message_versions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
    CREATE POLICY "versions_update_own" ON public.message_versions FOR UPDATE TO authenticated USING (auth.uid() = user_id);
    CREATE POLICY "versions_delete_own" ON public.message_versions FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_msg_versions_msg ON public.message_versions(message_id, version_index ASC);
CREATE INDEX IF NOT EXISTS idx_msg_versions_conv ON public.message_versions(conversation_id, created_at ASC);

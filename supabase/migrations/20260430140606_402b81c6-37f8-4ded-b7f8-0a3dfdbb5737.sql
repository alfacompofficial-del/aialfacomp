-- Bucket for downloads (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('downloads', 'downloads', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: public read, only authenticated users from "downloads" path can manage (we will upload via service role)
CREATE POLICY "Downloads are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'downloads');

-- API keys table
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'My key',
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  daily_limit INT NOT NULL DEFAULT 100,
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "keys_select_own" ON public.api_keys
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "keys_insert_own" ON public.api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "keys_update_own" ON public.api_keys
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "keys_delete_own" ON public.api_keys
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_api_keys_user ON public.api_keys(user_id);
CREATE INDEX idx_api_keys_hash ON public.api_keys(key_hash);

-- API usage log
CREATE TABLE public.api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL DEFAULT '/v1/chat',
  status_code INT NOT NULL DEFAULT 200,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usage_select_own" ON public.api_usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX idx_api_usage_key_time ON public.api_usage(key_id, created_at DESC);
CREATE INDEX idx_api_usage_user ON public.api_usage(user_id);
CREATE TABLE public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  custom_instructions text NOT NULL DEFAULT '',
  tone text NOT NULL DEFAULT 'neutral',
  verbosity text NOT NULL DEFAULT 'normal',
  language text NOT NULL DEFAULT 'auto',
  preferred_name text,
  always_cite boolean NOT NULL DEFAULT false,
  code_first boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY settings_select_own ON public.user_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY settings_insert_own ON public.user_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY settings_update_own ON public.user_settings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY settings_delete_own ON public.user_settings FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER user_settings_updated_at BEFORE UPDATE ON public.user_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.published_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  title text NOT NULL DEFAULT 'Мой проект',
  html text NOT NULL DEFAULT '',
  css text NOT NULL DEFAULT '',
  js text NOT NULL DEFAULT '',
  views integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX published_sites_user_idx ON public.published_sites(user_id);

GRANT SELECT ON public.published_sites TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.published_sites TO authenticated;
GRANT ALL ON public.published_sites TO service_role;

ALTER TABLE public.published_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY sites_select_public ON public.published_sites FOR SELECT USING (true);
CREATE POLICY sites_insert_own ON public.published_sites FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY sites_update_own ON public.published_sites FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY sites_delete_own ON public.published_sites FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER published_sites_updated_at BEFORE UPDATE ON public.published_sites
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_site_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM public.published_sites WHERE user_id = NEW.user_id) >= 10 THEN
    RAISE EXCEPTION 'Достигнут лимит: 10 опубликованных сайтов на пользователя';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER published_sites_limit BEFORE INSERT ON public.published_sites
FOR EACH ROW EXECUTE FUNCTION public.enforce_site_limit();
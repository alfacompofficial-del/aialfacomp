
CREATE TABLE public.image_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  prompt text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_image_generations_user_day ON public.image_generations(user_id, created_at);

ALTER TABLE public.image_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "imggen_select_own" ON public.image_generations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "imggen_insert_own" ON public.image_generations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

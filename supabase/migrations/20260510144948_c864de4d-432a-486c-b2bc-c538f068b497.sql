-- Bucket
insert into storage.buckets (id, name, public)
values ('generated-files', 'generated-files', true)
on conflict (id) do nothing;

-- Storage policies
create policy "generated_files_public_read"
on storage.objects for select
using (bucket_id = 'generated-files');

create policy "generated_files_user_insert"
on storage.objects for insert
with check (bucket_id = 'generated-files' and auth.uid()::text = (storage.foldername(name))[1]);

-- Tracking table
create table public.file_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  format text not null,
  filename text not null,
  created_at timestamptz not null default now()
);

alter table public.file_generations enable row level security;

create policy "filegen_select_own"
on public.file_generations for select
using (auth.uid() = user_id);

create policy "filegen_insert_own"
on public.file_generations for insert
with check (auth.uid() = user_id);

create index idx_file_generations_user_created on public.file_generations(user_id, created_at desc);
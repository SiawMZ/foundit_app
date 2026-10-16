-- Folders: one link belongs to at most one folder.
create table public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create type public.link_status as enum ('pending', 'ready', 'failed');

create table public.links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  url text not null,
  normalized_url text not null,
  resolved_url text,
  platform text not null default 'web',
  title text,
  description text,
  author text,
  thumbnail_path text, -- object path in the thumbnails bucket
  shared_text text,
  note text,
  labels text[] not null default '{}',
  folder_id uuid references public.folders on delete set null,
  pinned boolean not null default false,
  status public.link_status not null default 'pending',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, normalized_url)
);

create index links_user_created_idx on public.links (user_id, created_at desc);
create index links_labels_idx on public.links using gin (labels);

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger links_touch before update on public.links
for each row execute function public.touch_updated_at();

alter table public.folders enable row level security;
alter table public.links enable row level security;

create policy "own folders" on public.folders
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own links" on public.links
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Thumbnails copied from platforms (their CDN URLs expire).
-- Public bucket with unguessable paths ({user_id}/{link_id}.jpg); writes only via the enrich function.
insert into storage.buckets (id, name, public)
values ('thumbnails', 'thumbnails', true)
on conflict (id) do nothing;

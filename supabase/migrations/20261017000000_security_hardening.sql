-- Security hardening before publishing (review of 2026-10-17).

-- 1. Only web links can be stored. Rows can be written straight through the API, and a
--    `javascript:` URL on a shared folder page would run in the viewer's signed-in session.
-- 2. Size limits, so one account can't fill the free-tier database.
alter table public.links
  add constraint links_url_web check (url ~* '^https?://' and char_length(url) <= 4096),
  add constraint links_resolved_url_web check (resolved_url ~* '^https?://' and char_length(resolved_url) <= 4096),
  add constraint links_normalized_url_len check (char_length(normalized_url) <= 4096),
  add constraint links_platform_len check (char_length(platform) <= 20),
  add constraint links_title_len check (char_length(title) <= 300),
  add constraint links_description_len check (char_length(description) <= 1000),
  add constraint links_author_len check (char_length(author) <= 200),
  add constraint links_shared_text_len check (char_length(shared_text) <= 5000),
  add constraint links_note_len check (char_length(note) <= 10000),
  add constraint links_error_len check (char_length(error) <= 500),
  add constraint links_labels_len check (cardinality(labels) <= 20),
  -- Thumbnails live under the owner's own folder in the bucket.
  add constraint links_thumbnail_own check (thumbnail_path like user_id::text || '/%');

-- 3. A link can only go into one of its owner's folders. The foreign key alone accepts any
--    folder id, which would put a link on someone else's shared page.
create function public.check_link_folder() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if new.folder_id is not null
     and not exists (select 1 from public.folders f where f.id = new.folder_id and f.user_id = new.user_id) then
    raise exception 'folder not found' using errcode = '23503';
  end if;
  return new;
end $$;

create trigger links_folder_owner before insert or update of folder_id, user_id on public.links
for each row execute function public.check_link_folder();

-- Shared pages only list the folder owner's own links (defence in depth for the check above).
create or replace function public.get_shared_folder(p_token text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'name', f.name,
    'links', coalesce((
      select json_agg(json_build_object(
        'id', l.id,
        'url', coalesce(l.resolved_url, l.url),
        'platform', l.platform,
        'title', l.title,
        'description', l.description,
        'author', l.author,
        'thumbnail_path', l.thumbnail_path,
        'shared_text', l.shared_text,
        'labels', l.labels,
        'created_at', l.created_at
      ) order by l.created_at desc)
      from public.links l where l.folder_id = f.id and l.user_id = f.user_id
    ), '[]'::json)
  )
  from public.folders f
  where p_token is not null and length(p_token) >= 32 and f.share_token = p_token;
$$;

-- 4. Log of enrich calls: rate limits (each AI call spends Anthropic credit) and an audit trail.
--    Written only by the enrich function (service role); users can't read or change it.
create table public.enrich_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  link_id uuid,
  url text,
  used_ai boolean not null default false,
  outcome text not null, -- ok | failed | blocked | rate_limited
  detail text,
  created_at timestamptz not null default now()
);
create index enrich_log_user_created_idx on public.enrich_log (user_id, created_at desc);
alter table public.enrich_log enable row level security;
revoke all on public.enrich_log from anon, authenticated;

-- 5. Thumbnails: images only, max 5 MB (writes come from the enrich function).
update storage.buckets
   set file_size_limit = 5 * 1024 * 1024,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
 where id = 'thumbnails';

-- Users can remove their own thumbnails (the app does this when a link is deleted, so deleted
-- posts don't stay reachable by URL). Select is needed for remove to find the files.
create policy "own thumbnails select" on storage.objects
  for select to authenticated
  using (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "own thumbnails delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = (select auth.uid())::text);

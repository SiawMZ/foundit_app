-- Read-only public share links for folders.
-- A folder is shared while share_token is set; clearing it revokes the link.
alter table public.folders add column share_token text unique;

-- Creates (or returns the existing) share token for one of the caller's folders.
-- security invoker: RLS still limits this to the caller's own folders.
create function public.share_folder(p_folder uuid) returns text
language sql security invoker set search_path = public as $$
  update public.folders
     set share_token = coalesce(share_token, replace(gen_random_uuid()::text, '-', ''))
   where id = p_folder
  returning share_token;
$$;

-- Public, read-only view of a shared folder. Exposes only what the share page shows;
-- notes and other private fields are never returned.
create function public.get_shared_folder(p_token text) returns json
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
      from public.links l where l.folder_id = f.id
    ), '[]'::json)
  )
  from public.folders f
  where p_token is not null and length(p_token) >= 32 and f.share_token = p_token;
$$;

revoke all on function public.get_shared_folder(text) from public;
grant execute on function public.get_shared_folder(text) to anon, authenticated;
revoke all on function public.share_folder(uuid) from public, anon;
grant execute on function public.share_folder(uuid) to authenticated;

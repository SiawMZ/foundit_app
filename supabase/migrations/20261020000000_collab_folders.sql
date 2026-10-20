-- Collaborative folders: signed-in people join a folder with an invite link and add their own links to it.
--
-- Rules
-- * Each link row stays owned by whoever added it. The "own links" RLS policy is unchanged, so members
--   never read each other's rows (or notes) directly; they get other members' links through
--   get_joined_links(), which returns public fields only.
-- * A personal library holds each post once. A shared folder holds each post once, whoever added it.
--   The same post can be in both (links.collab_folder_id scopes the uniqueness).
-- * Leaving (or being removed) gives the member a private copy of the folder; the links they added stay
--   in the shared folder, handed to the owner. With no members left the folder is a normal folder again.
-- * Deleting a shared folder sends every member's links back to their own library, unfiled.
-- * Membership changes only go through the security-definer functions below.

-- 1. Display names, so "Added by" doesn't expose email addresses.
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "own profile update" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create function public.default_display_name(p_email text) returns text
language sql immutable set search_path = public as $$
  select left(coalesce(nullif(split_part(coalesce(p_email, ''), '@', 1), ''), 'Linkbox user'), 40);
$$;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, public.default_display_name(new.email))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id, display_name)
select id, public.default_display_name(email) from auth.users
on conflict (id) do nothing;

-- 2. Members and invites.
create table public.folder_members (
  folder_id uuid not null references public.folders on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (folder_id, user_id)
);
create index folder_members_user_idx on public.folder_members (user_id);
alter table public.folder_members enable row level security;
revoke all on public.folder_members from anon, authenticated;

alter table public.folders
  add column invite_token text unique,
  -- Set the first time someone joins and never cleared, so link uniqueness stays stable.
  add column collab boolean not null default false;

-- 3. Link uniqueness scoped per shared folder.
alter table public.links add column collab_folder_id uuid references public.folders on delete set null;
alter table public.links drop constraint if exists links_user_id_normalized_url_key;
alter table public.links
  add constraint links_user_url_scope_key unique nulls not distinct (user_id, normalized_url, collab_folder_id),
  add constraint links_collab_url_key unique (collab_folder_id, normalized_url);

create function public.set_link_collab() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.collab_folder_id := (select f.id from public.folders f where f.id = new.folder_id and f.collab);
  return new;
end $$;

create trigger links_set_collab before insert or update of folder_id, collab_folder_id on public.links
for each row execute function public.set_link_collab();

-- A link can go into a folder its owner owns or is a member of.
create or replace function public.check_link_folder() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.folder_id is not null
     and not exists (select 1 from public.folders f where f.id = new.folder_id and f.user_id = new.user_id)
     and not exists (select 1 from public.folder_members m where m.folder_id = new.folder_id and m.user_id = new.user_id) then
    raise exception 'folder not found' using errcode = '23503';
  end if;
  return new;
end $$;

-- 4. Thumbnails: copies (leaving a folder, "Save to my library") reuse the original file, so a link may
--    point at another user's thumbnail if some existing link already uses that file. Arbitrary paths are refused.
alter table public.links drop constraint if exists links_thumbnail_own;

create function public.check_link_thumbnail() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.thumbnail_path is not null
     and new.thumbnail_path not like new.user_id::text || '/%'
     and not exists (select 1 from public.links l where l.thumbnail_path = new.thumbnail_path and l.id <> new.id) then
    raise exception 'invalid thumbnail' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger links_thumbnail_check before insert or update of thumbnail_path on public.links
for each row execute function public.check_link_thumbnail();

-- Of the caller's own thumbnail files, the ones no link uses any more (safe to delete from storage).
create function public.unused_thumbnails(p_paths text[]) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(p), '{}')
  from unnest(p_paths) p
  where p like (select auth.uid())::text || '/%'
    and not exists (select 1 from public.links l where l.thumbnail_path = p);
$$;

-- 5. Deleting a shared folder: every member's links go back to their own library, unfiled. If they already
--    have the post there, the folder copy is dropped.
create function public.release_folder_links() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.links l
   where l.collab_folder_id = old.id
     and exists (select 1 from public.links p
                  where p.user_id = l.user_id and p.normalized_url = l.normalized_url and p.collab_folder_id is null);
  update public.links set folder_id = null where collab_folder_id = old.id;
  return old;
end $$;

create trigger folders_release_links before delete on public.folders
for each row execute function public.release_folder_links();

-- 6. Functions the app calls.
create function public.is_folder_member(p_folder uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.folder_members where folder_id = p_folder and user_id = p_user);
$$;

create function public.create_invite(p_folder uuid) returns text
language sql security invoker set search_path = public as $$
  update public.folders
     set invite_token = coalesce(invite_token, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
   where id = p_folder
  returning invite_token;
$$;

create function public.revoke_invite(p_folder uuid) returns void
language sql security invoker set search_path = public as $$
  update public.folders set invite_token = null where id = p_folder;
$$;

-- What the join page shows before joining.
create function public.get_invite(p_token text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'folder_id', f.id,
    'name', f.name,
    'owner_name', (select display_name from public.profiles where id = f.user_id),
    'member_count', greatest((select count(*) from public.folder_members m where m.folder_id = f.id), 1),
    'is_owner', f.user_id = (select auth.uid()),
    'is_member', public.is_folder_member(f.id, (select auth.uid()))
  )
  from public.folders f
  where p_token is not null and length(p_token) >= 32 and f.invite_token = p_token;
$$;

create function public.join_folder(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  f public.folders;
  n int;
begin
  if me is null then
    raise exception 'Sign in to join this folder.' using errcode = '42501';
  end if;
  select * into f from public.folders
   where p_token is not null and length(p_token) >= 32 and invite_token = p_token;
  if not found then
    raise exception 'This invite link is no longer valid.' using errcode = 'P0002';
  end if;
  if f.user_id = me or public.is_folder_member(f.id, me) then
    return f.id;
  end if;

  select count(*) into n from public.folder_members where folder_id = f.id;
  if n = 0 then
    insert into public.folder_members (folder_id, user_id, role) values (f.id, f.user_id, 'owner');
    n := 1;
  end if;
  if n >= 20 then
    raise exception 'This folder is full (20 members).' using errcode = 'P0001';
  end if;
  if not f.collab then
    update public.folders set collab = true where id = f.id;
    -- set_link_collab recomputes the scope from the folder, now collaborative.
    update public.links set collab_folder_id = f.id where folder_id = f.id;
  end if;
  insert into public.folder_members (folder_id, user_id, role) values (f.id, me, 'member');
  return f.id;
end $$;

-- Every folder the caller shares with others: the ones they own with members, and the ones they joined.
create function public.get_collab_folders() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
    'id', f.id,
    'user_id', f.user_id,
    'name', f.name,
    'created_at', f.created_at,
    'role', m.role,
    'owner_name', (select display_name from public.profiles where id = f.user_id),
    'member_count', (select count(*) from public.folder_members x where x.folder_id = f.id)
  ) order by f.name), '[]'::json)
  from public.folder_members m
  join public.folders f on f.id = m.folder_id
  where m.user_id = (select auth.uid());
$$;

-- Other members' links in the caller's shared folders. Public fields only: no notes, no errors, no pins.
create function public.get_joined_links() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
    'id', l.id,
    'user_id', l.user_id,
    'url', l.url,
    'normalized_url', l.normalized_url,
    'resolved_url', l.resolved_url,
    'platform', l.platform,
    'title', l.title,
    'description', l.description,
    'author', l.author,
    'thumbnail_path', l.thumbnail_path,
    'shared_text', l.shared_text,
    'labels', l.labels,
    'folder_id', l.folder_id,
    'status', l.status,
    'created_at', l.created_at,
    'updated_at', l.updated_at,
    'added_by', (select display_name from public.profiles where id = l.user_id)
  ) order by l.created_at desc), '[]'::json)
  from public.links l
  join public.folder_members m on m.folder_id = l.collab_folder_id and m.user_id = (select auth.uid())
  where l.user_id <> (select auth.uid());
$$;

create function public.get_folder_members(p_folder uuid) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
    'user_id', m.user_id,
    'name', p.display_name,
    'role', m.role,
    'is_me', m.user_id = (select auth.uid())
  ) order by m.role desc, m.joined_at), '[]'::json)
  from public.folder_members m
  left join public.profiles p on p.id = m.user_id
  where m.folder_id = p_folder and public.is_folder_member(p_folder, (select auth.uid()));
$$;

-- The owner removes another member's link from their shared folder.
create function public.remove_folder_link(p_link uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.links l
   using public.folders f
   where l.id = p_link and f.id = l.collab_folder_id and f.user_id = (select auth.uid());
  if not found then
    raise exception 'Only the folder owner can remove other people''s links.' using errcode = '42501';
  end if;
end $$;

-- Leaving: a private copy for the member, their links handed to the owner, normal folder when nobody is left.
create function public.folder_leave_impl(p_folder uuid, p_user uuid) returns json
language plpgsql security definer set search_path = public as $$
declare
  f public.folders;
  copy_id uuid;
  copy_name text;
  i int := 1;
  total int;
  copied int;
begin
  select * into f from public.folders where id = p_folder;
  if not found or not public.is_folder_member(p_folder, p_user) then
    raise exception 'Not a member of this folder.' using errcode = 'P0002';
  end if;
  if f.user_id = p_user then
    raise exception 'The owner can''t leave. Delete the folder instead.' using errcode = 'P0001';
  end if;

  copy_name := f.name;
  while exists (select 1 from public.folders where user_id = p_user and name = copy_name) loop
    copy_name := left(f.name, 48) || case when i = 1 then ' (copy)' else ' (copy ' || i || ')' end;
    i := i + 1;
  end loop;
  insert into public.folders (user_id, name) values (p_user, copy_name) returning id into copy_id;

  select count(*) into total from public.links where collab_folder_id = f.id;
  insert into public.links (user_id, url, normalized_url, resolved_url, platform, title, description, author,
                            thumbnail_path, shared_text, note, labels, folder_id, status, created_at)
  select p_user, l.url, l.normalized_url, l.resolved_url, l.platform, l.title, l.description, l.author,
         l.thumbnail_path, l.shared_text, case when l.user_id = p_user then l.note end, l.labels, copy_id,
         l.status, l.created_at
    from public.links l
   where l.collab_folder_id = f.id
     and not exists (select 1 from public.links p
                      where p.user_id = p_user and p.normalized_url = l.normalized_url and p.collab_folder_id is null);
  get diagnostics copied = row_count;

  update public.links set user_id = f.user_id, note = null, pinned = false
   where collab_folder_id = f.id and user_id = p_user;

  delete from public.folder_members where folder_id = f.id and user_id = p_user;
  if not exists (select 1 from public.folder_members where folder_id = f.id and role = 'member') then
    delete from public.folder_members where folder_id = f.id;
    update public.folders set invite_token = null where id = f.id;
  end if;

  return json_build_object('folder_id', copy_id, 'folder_name', copy_name, 'copied', copied, 'skipped', total - copied);
end $$;

create function public.leave_folder(p_folder uuid) returns json
language sql security definer set search_path = public as $$
  select public.folder_leave_impl(p_folder, (select auth.uid()));
$$;

create function public.remove_member(p_folder uuid, p_user uuid) returns json
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.folders where id = p_folder and user_id = (select auth.uid())) then
    raise exception 'Only the folder owner can remove members.' using errcode = '42501';
  end if;
  return public.folder_leave_impl(p_folder, p_user);
end $$;

-- 7. The public read-only page lists every member's links, not only the owner's.
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
      from public.links l
      where l.folder_id = f.id and (l.user_id = f.user_id or public.is_folder_member(f.id, l.user_id))
    ), '[]'::json)
  )
  from public.folders f
  where p_token is not null and length(p_token) >= 32 and f.share_token = p_token;
$$;

-- Who may call what.
revoke all on function public.folder_leave_impl(uuid, uuid) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.is_folder_member(uuid, uuid) from public, anon;
revoke all on function public.unused_thumbnails(text[]) from public, anon;
revoke all on function public.create_invite(uuid) from public, anon;
revoke all on function public.revoke_invite(uuid) from public, anon;
revoke all on function public.join_folder(text) from public, anon;
revoke all on function public.get_collab_folders() from public, anon;
revoke all on function public.get_joined_links() from public, anon;
revoke all on function public.get_folder_members(uuid) from public, anon;
revoke all on function public.remove_folder_link(uuid) from public, anon;
revoke all on function public.leave_folder(uuid) from public, anon;
revoke all on function public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.get_invite(text) to anon, authenticated;
grant execute on function public.is_folder_member(uuid, uuid), public.unused_thumbnails(text[]),
  public.create_invite(uuid), public.revoke_invite(uuid), public.join_folder(text), public.get_collab_folders(),
  public.get_joined_links(), public.get_folder_members(uuid), public.remove_folder_link(uuid),
  public.leave_folder(uuid), public.remove_member(uuid, uuid) to authenticated;

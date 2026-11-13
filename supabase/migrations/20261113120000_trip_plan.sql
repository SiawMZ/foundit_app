-- Step 3: the day-by-day plan, shared by everyone in the trip.
--
-- The planner runs in the app. Its result is saved on each place: which day and the order within the day. Times
-- are not saved: they come partly from Google's opening hours, which may not be stored (docs/google-maps-terms.md),
-- so the app works them out again when it shows the plan. A place with no day is on the "Maybe" list, with the reason.

alter table public.trip_places
  add column plan_day int check (plan_day between 1 and 30),
  add column plan_pos int check (plan_pos between 0 and 499),
  add column plan_reason text check (char_length(plan_reason) <= 200),
  add constraint trip_places_plan_together check ((plan_day is null) = (plan_pos is null));

-- When the trip was last optimized (null: never, so the app shows "Optimize" instead of a plan).
alter table public.trips add column planned_at timestamptz;

grant update (plan_day, plan_pos, plan_reason) on public.trip_places to authenticated;
grant update (planned_at) on public.trips to authenticated;

-- Saves a whole plan in one call. Security invoker: RLS and the column grants above decide, so it only works
-- for members, and only on the plan columns. Places of the trip that aren't in p_stops go to Maybe.
-- p_stops: [{ "id": uuid, "day": int|null, "pos": int|null, "reason": text|null }]
create function public.trip_save_plan(p_trip uuid, p_stops jsonb) returns int
language plpgsql security invoker set search_path = '' as $$
declare
  n int;
begin
  if jsonb_typeof(p_stops) is distinct from 'array' or jsonb_array_length(p_stops) > 500 then
    raise exception 'p_stops must be an array of at most 500 places' using errcode = '22023';
  end if;
  update public.trip_places p
     set plan_day = s.day, plan_pos = s.pos, plan_reason = left(s.reason, 200)
    from jsonb_to_recordset(p_stops) as s(id uuid, day int, pos int, reason text)
   where p.id = s.id and p.trip_id = p_trip;
  get diagnostics n = row_count;
  update public.trip_places
     set plan_day = null, plan_pos = null, plan_reason = null
   where trip_id = p_trip
     and id not in (select (e->>'id')::uuid from jsonb_array_elements(p_stops) e)
     and plan_day is not null;
  update public.trips set planned_at = now() where id = p_trip;
  return n;
end;
$$;
revoke all on function public.trip_save_plan(uuid, jsonb) from public, anon;
grant execute on function public.trip_save_plan(uuid, jsonb) to authenticated;

-- ---------- post covers instead of Google photos ----------
--
-- Each place shows the cover picture of the post it came from (not a Google photo: Google photos cost a call every
-- time they're shown and may not be stored). Xiaohongshu and Instagram image links expire and refuse other sites,
-- so the import function copies the post's first picture here, like Linkbox's thumbnails, under <trip_id>/<link_id>.
-- Private: members read it through signed URLs. Only the function (service role) writes; members may delete
-- (the app removes a trip's covers before deleting the trip, because cascades don't reach storage).

alter table public.trip_links drop column cover_url;
alter table public.trip_links
  add column cover_path text check (char_length(cover_path) <= 200 and cover_path like trip_id::text || '/%');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-covers', 'trip-covers', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

-- The folder name is the trip id; anything else (a malformed name) matches no trip.
create function public.trip_cover_member(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  -- case, not and: SQL may evaluate both sides of an and, and the cast fails on a malformed name.
  select case
    when (storage.foldername(p_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_trip_member(((storage.foldername(p_name))[1])::uuid)
    else false
  end;
$$;
revoke all on function public.trip_cover_member(text) from public, anon;
grant execute on function public.trip_cover_member(text) to authenticated;

create policy "trip members read covers" on storage.objects
  for select to authenticated using (bucket_id = 'trip-covers' and public.trip_cover_member(name));
create policy "trip members delete covers" on storage.objects
  for delete to authenticated using (bucket_id = 'trip-covers' and public.trip_cover_member(name));

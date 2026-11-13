-- Tripbox security review of step 1 (2026-11-12). Only Tripbox objects change here; Linkbox's tables are untouched.
-- This file is also copied into Linkbox's supabase/migrations, so both repos list the same history.

-- 1. Signed-in users keep only the table privileges the app uses. Supabase's default grants also give them
--    TRUNCATE (which ignores row level security), TRIGGER and REFERENCES. The API can't send those today,
--    but nothing should depend on that.
revoke truncate, trigger, references on public.trips, public.trip_members, public.trip_links, public.trip_places
  from authenticated;

-- 2. A place can only point at a link of the same trip. The plain foreign key accepted any link id, which
--    would show another trip's post (title, author, URL) as the source of a place.
alter table public.trip_links add constraint trip_links_trip_id_id_key unique (trip_id, id);
alter table public.trip_places drop constraint trip_places_link_id_fkey;
alter table public.trip_places add constraint trip_places_link_same_trip
  foreign key (trip_id, link_id) references public.trip_links (trip_id, id) on delete set null (link_id);

-- 3. Size and format limits on the columns the import function (service key) writes. Members can't write
--    them, but the values come from scraped pages and the AI, and are shown in the app and opened as links.
alter table public.trip_links
  add constraint trip_links_platform_len check (char_length(platform) <= 20),
  add constraint trip_links_error_len check (char_length(error) <= 500);
alter table public.trip_places
  add constraint trip_places_google_place_id_len check (char_length(google_place_id) between 1 and 300),
  add constraint trip_places_type_len check (char_length(type) <= 30),
  add constraint trip_places_area_len check (char_length(area) <= 200),
  add constraint trip_places_address_len check (char_length(address) <= 500),
  -- Opened when a place is tapped: web links only, never javascript: or an app scheme.
  add constraint trip_places_maps_url_web check (maps_url ~* '^https://' and char_length(maps_url) <= 2000),
  add constraint trip_places_periods_size check (octet_length(periods::text) <= 20000),
  -- Photos live under the trip's own folder in the storage bucket.
  add constraint trip_places_photo_path_own check (photo_path like trip_id::text || '/%' and char_length(photo_path) <= 300),
  add constraint trip_places_photo_credit_len check (char_length(photo_credit) <= 500),
  add constraint trip_places_confidence_len check (char_length(confidence) <= 20);

-- 4. One account can't fill the shared free-tier database with trips.
create function public.trip_limit_per_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.trips where owner_id = new.owner_id) >= 100 then
    raise exception 'You can have at most 100 trips. Delete an old trip first.' using errcode = '54000';
  end if;
  return new;
end $$;
revoke all on function public.trip_limit_per_owner() from public, anon, authenticated;
create trigger trips_limit_per_owner before insert on public.trips
  for each row execute function public.trip_limit_per_owner();

-- 5. Tripbox's own updated_at trigger, so a change to Linkbox's touch_updated_at() can't affect Tripbox.
create function public.trip_touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;
revoke all on function public.trip_touch_updated_at() from public, anon, authenticated;
drop trigger trips_touch on public.trips;
drop trigger trip_places_touch on public.trip_places;
create trigger trips_touch before update on public.trips
  for each row execute function public.trip_touch_updated_at();
create trigger trip_places_touch before update on public.trip_places
  for each row execute function public.trip_touch_updated_at();

-- Hotel search with Google (OpenStreetMap misses many hotels, and refuses requests from Supabase's servers).
--
-- A start point picked from Google keeps its place ID (may be stored indefinitely) and coordinates dated like a
-- place's: refreshed by the tripbox-import function, deleted by the daily clean-up after 30 days (Google's terms,
-- docs/google-maps-terms.md). hotel_name is what the traveller typed, not Google's text.
-- A start point from OpenStreetMap (a new trip's city centre) has no place ID, and its coordinates may be kept.

alter table public.trips
  add column hotel_place_id text check (char_length(hotel_place_id) <= 300),
  add column hotel_coords_fetched_at timestamptz,
  add constraint trips_hotel_google_dated check (
    hotel_place_id is null or (hotel_lat is null) = (hotel_coords_fetched_at is null)
  );
comment on column public.trips.hotel_place_id is 'Google place ID of the start point, if it was picked from Google.';
comment on column public.trips.hotel_coords_fetched_at is 'When hotel_lat/lng came from Google; cleared after 30 days.';

-- Members can still set the start point themselves (hotel_name/lat/lng, e.g. a city centre from OpenStreetMap).
-- Coordinates changed that way are no longer Google's, so the Google ID and date go. Only the function (service
-- role) writes hotel_place_id and hotel_coords_fetched_at: they aren't in the column grants.
create function public.trip_hotel_source() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.hotel_lat is distinct from old.hotel_lat or new.hotel_lng is distinct from old.hotel_lng)
     and new.hotel_coords_fetched_at is not distinct from old.hotel_coords_fetched_at then
    new.hotel_place_id := null;
    new.hotel_coords_fetched_at := null;
  end if;
  return new;
end $$;
revoke all on function public.trip_hotel_source() from public, anon, authenticated;
create trigger trips_hotel_source before update on public.trips
  for each row execute function public.trip_hotel_source();

-- The daily clean-up also clears a Google start point's coordinates after 30 days (the name and ID stay, so the
-- function can fetch them again when the trip is planned).
create or replace function public.trip_expire_google_coords() returns void
language sql security definer set search_path = '' as $$
  update public.trip_places set lat = null, lng = null, coords_fetched_at = null
   where coords_fetched_at < now() - interval '30 days';
  update public.trip_place_cache set lat = null, lng = null, coords_fetched_at = null
   where coords_fetched_at < now() - interval '30 days';
  update public.trip_links set candidates = null
   where candidates is not null and created_at < now() - interval '30 days';
  update public.trips set hotel_lat = null, hotel_lng = null, hotel_coords_fetched_at = null
   where hotel_coords_fetched_at < now() - interval '30 days';
$$;
revoke all on function public.trip_expire_google_coords() from public, anon, authenticated;

-- Step 2: importing links into a trip through the tripbox-import function, within Google's terms.
-- Like 20261112000000_trips.sql, this is also copied into Linkbox's supabase/migrations.
--
-- Google Maps Platform terms (Service Specific Terms §14, Terms §3.2.3(b), checked 2026-11-12, see
-- docs/google-maps-terms.md): only the place ID may be stored indefinitely; latitude/longitude may be cached for
-- up to 30 days and must then be deleted; nothing else from Google (names, addresses, opening hours, photos)
-- may be stored. So a place keeps its Google place ID, the names read from the post (ours), our type and area,
-- and coordinates with the date they were fetched; everything else is fetched live when shown.

-- ---------- places: drop stored Google content ----------

alter table public.trip_places
  drop column address,
  drop column periods,
  drop column photo_path,
  drop column photo_credit,
  alter column lat drop not null,
  alter column lng drop not null,
  add column coords_fetched_at timestamptz;
-- Coordinates come and go together, with their fetch date.
alter table public.trip_places
  add constraint trip_places_coords_together check ((lat is null) = (lng is null) and (lat is null) = (coords_fetched_at is null));
comment on column public.trip_places.name is 'Name as read from the post (by the AI), not Google''s place name.';
comment on column public.trip_places.coords_fetched_at is 'When lat/lng came from Google; cleared after 30 days (Google terms).';

-- ---------- links: an import waits for the member to pick places ('review') ----------

alter table public.trip_links
  add column candidates jsonb,
  add column cover_url text check (char_length(cover_url) <= 2000),
  add column rating text check (rating in ('good', 'bad'));
alter table public.trip_links drop constraint trip_links_status_check;
alter table public.trip_links
  add constraint trip_links_status_check check (status in ('pending', 'review', 'ready', 'failed'));
comment on column public.trip_links.candidates is
  'Places found, waiting to be picked: our names, Google place IDs and coordinates only (no other Google content).';

-- Members can rate an import (👍/👎); nothing else on a link is writable from the app.
grant update (rating) on public.trip_links to authenticated;
create policy "members rate links" on public.trip_links
  for update to authenticated using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

-- ---------- usage log: rate limits and an audit trail ----------

-- Each import spends Anthropic and Google credit; each details call spends Google credit.
-- Written only by the function (service role); users can't read or change it.
create table public.trip_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  trip_id uuid references public.trips on delete set null,
  kind text not null check (kind in ('import', 'locate', 'details')),
  outcome text not null check (outcome in ('ok', 'failed', 'blocked', 'rate_limited')),
  ai_input_tokens int not null default 0,
  ai_output_tokens int not null default 0,
  places_calls int not null default 0,
  photo_calls int not null default 0,
  hours_calls int not null default 0,
  detail text,
  created_at timestamptz not null default now()
);
create index trip_usage_user_created on public.trip_usage (user_id, created_at desc);
alter table public.trip_usage enable row level security;
revoke all on public.trip_usage from anon, authenticated;

-- ---------- lookup cache: query -> place ID (+ coordinates for up to 30 days) ----------

-- Shared by all trips, so a café saved by many people is looked up once. Holds only the place ID (storable
-- indefinitely) and its coordinates with their fetch date. Service role only.
create table public.trip_place_cache (
  query_hash text primary key,
  place_id text check (char_length(place_id) <= 300),
  lat double precision,
  lng double precision,
  coords_fetched_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.trip_place_cache enable row level security;
revoke all on public.trip_place_cache from anon, authenticated;

-- ---------- daily clean-up: delete Google coordinates older than 30 days ----------

create extension if not exists pg_cron with schema pg_catalog;

create function public.trip_expire_google_coords() returns void
language sql security definer set search_path = '' as $$
  update public.trip_places set lat = null, lng = null, coords_fetched_at = null
   where coords_fetched_at < now() - interval '30 days';
  update public.trip_place_cache set lat = null, lng = null, coords_fetched_at = null
   where coords_fetched_at < now() - interval '30 days';
  update public.trip_links set candidates = null
   where candidates is not null and created_at < now() - interval '30 days';
$$;
revoke all on function public.trip_expire_google_coords() from public, anon, authenticated;

select cron.schedule('tripbox-expire-google-coords', '17 3 * * *', 'select public.trip_expire_google_coords()');

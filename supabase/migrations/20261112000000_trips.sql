-- Tripbox: trips, their members, the links imported into them and the places found in those links.
-- Tripbox shares this Supabase project with Linkbox, so every table here starts with "trip" and nothing
-- here touches Linkbox's tables. Users (auth.users) and profiles are shared by both apps.
-- This file is also copied into Linkbox's supabase/migrations, so both repos list the same history.

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  city text not null check (char_length(city) between 1 and 80),
  start_date date not null,
  days int not null default 3 check (days between 1 and 30),
  day_start time not null default '09:30',
  day_end time not null default '21:30',
  travel_mode text not null default 'transit' check (travel_mode in ('walk', 'transit', 'car')),
  max_meals int not null default 3 check (max_meals between 1 and 6),
  max_places int check (max_places between 1 and 15),
  -- Where each day starts and ends; the city centre until the traveller sets a hotel.
  hotel_name text check (char_length(hotel_name) <= 200),
  hotel_lat double precision check (hotel_lat between -90 and 90),
  hotel_lng double precision check (hotel_lng between -180 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trip_members (
  trip_id uuid not null references public.trips on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index trip_members_user on public.trip_members (user_id);

-- A post or page imported into a trip. Written by the tripbox-import function (step 2).
create table public.trip_links (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips on delete cascade,
  added_by uuid default auth.uid() references auth.users on delete set null,
  url text check (url ~* '^https?://' and char_length(url) <= 2000),
  platform text,
  title text check (char_length(title) <= 500),
  author text check (char_length(author) <= 200),
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  error text,
  created_at timestamptz not null default now()
);
create index trip_links_trip on public.trip_links (trip_id);

-- A real place (one Google place per trip). Members share its star, chosen day and note.
create table public.trip_places (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips on delete cascade,
  link_id uuid references public.trip_links on delete set null,
  added_by uuid default auth.uid() references auth.users on delete set null,
  google_place_id text not null,
  name text not null check (char_length(name) <= 300),
  name_local text check (char_length(name_local) <= 300),
  type text not null default 'other',
  area text,
  address text,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  maps_url text,
  periods jsonb,
  photo_path text,
  photo_credit text,
  confidence text,
  must boolean not null default false,
  fixed_day int check (fixed_day between 1 and 30),
  fixed_time time,
  note text check (char_length(note) <= 2000),
  duration_min int check (duration_min between 10 and 600),
  removed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, google_place_id)
);

create trigger trips_touch before update on public.trips
  for each row execute function public.touch_updated_at();
create trigger trip_places_touch before update on public.trip_places
  for each row execute function public.touch_updated_at();

-- ---------- membership ----------

-- Security definer so policies can ask "is this user in the trip?" without reading trip_members
-- through its own policy (which would recurse).
create function public.is_trip_member(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trip_members where trip_id = p_trip and user_id = auth.uid());
$$;
revoke all on function public.is_trip_member(uuid) from public, anon;
grant execute on function public.is_trip_member(uuid) to authenticated;

-- The creator of a trip is its owner and first member.
create function public.add_trip_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.trip_members (trip_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;
revoke all on function public.add_trip_owner() from public, anon, authenticated;
create trigger trips_add_owner after insert on public.trips
  for each row execute function public.add_trip_owner();

-- ---------- row level security ----------

alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_links enable row level security;
alter table public.trip_places enable row level security;

-- The owner check is needed as well as membership: the owner's member row is added by a trigger after the
-- insert, so `insert … returning` can't see it yet.
create policy "members read trips" on public.trips
  for select to authenticated using (owner_id = auth.uid() or public.is_trip_member(id));
create policy "create own trips" on public.trips
  for insert to authenticated with check (owner_id = auth.uid());
create policy "members edit trips" on public.trips
  for update to authenticated using (public.is_trip_member(id)) with check (public.is_trip_member(id));
create policy "owner deletes trips" on public.trips
  for delete to authenticated using (owner_id = auth.uid());

-- Joining and leaving go through functions (step 4); members can only see who else is in.
create policy "members read members" on public.trip_members
  for select to authenticated using (public.is_trip_member(trip_id));

-- Links and places are written by the import function with the service key; members read them,
-- change the planning fields of a place, and delete.
create policy "members read links" on public.trip_links
  for select to authenticated using (public.is_trip_member(trip_id));
create policy "members delete links" on public.trip_links
  for delete to authenticated using (public.is_trip_member(trip_id));

create policy "members read places" on public.trip_places
  for select to authenticated using (public.is_trip_member(trip_id));
create policy "members plan places" on public.trip_places
  for update to authenticated using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
create policy "members delete places" on public.trip_places
  for delete to authenticated using (public.is_trip_member(trip_id));

-- Column grants on top of the policies: signed-out visitors get nothing, and signed-in members can only
-- write the columns the app needs (never owner_id, trip_id or a place's Google data).
revoke all on public.trips, public.trip_members, public.trip_links, public.trip_places from anon;
revoke insert, update on public.trips from authenticated;
grant insert (name, city, start_date, days, day_start, day_end, travel_mode, max_meals, max_places, hotel_name, hotel_lat, hotel_lng)
  on public.trips to authenticated;
grant update (name, city, start_date, days, day_start, day_end, travel_mode, max_meals, max_places, hotel_name, hotel_lat, hotel_lng)
  on public.trips to authenticated;
revoke insert, update on public.trip_members, public.trip_links from authenticated;
revoke insert, update on public.trip_places from authenticated;
grant update (must, fixed_day, fixed_time, note, duration_min, removed) on public.trip_places to authenticated;

-- "Ask AI" search: every call of the `ask` function is logged here. Drives the per-user and
-- app-wide limits. The question itself is never stored.
create table public.ask_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  outcome text not null, -- ok | failed | rate_limited
  created_at timestamptz not null default now()
);
create index ask_log_user_created_idx on public.ask_log (user_id, created_at desc);
create index ask_log_created_idx on public.ask_log (created_at desc);
alter table public.ask_log enable row level security;
revoke all on public.ask_log from anon, authenticated;

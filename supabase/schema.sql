-- ============================================================================
-- BOX SCORE — Production Supabase PostgreSQL Schema & RLS Migration
-- Project URL: https://sbqnrxqgahfhbmlevtgf.supabase.co
-- Run this script in your Supabase Dashboard -> SQL Editor
-- ============================================================================

-- 1. User Profiles Table (Synced with auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  first_name text not null,
  last_name text not null,
  birthday date,
  address text,
  height_cm numeric(5,1),
  weight_kg numeric(5,1),
  positions text[] not null default '{}',
  account_roles text[] not null default '{}',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- 2. Leagues Table
create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_name text not null default '',
  name text not null,
  image_url text,
  start_date date not null,
  end_date date not null,
  courts jsonb not null default '[]'::jsonb,
  rule_set_id text not null default 'FIBA',
  rules_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.leagues enable row level security;

create policy "Anyone can view leagues"
  on public.leagues for select
  using (true);

create policy "Authenticated users can create leagues"
  on public.leagues for insert
  with check (auth.uid() = owner_id);

-- League owners or assigned Admins can update their leagues
create policy "League owners and admins can update their leagues"
  on public.leagues for update
  using (
    auth.uid() = owner_id or
    exists (
      select 1 from public.league_members
      where public.league_members.league_id = public.leagues.id
        and (public.league_members.user_id = auth.uid() or public.league_members.email = auth.jwt()->>'email')
        and public.league_members.role = 'ADMIN'
    )
  );

create policy "League owners can delete their leagues"
  on public.leagues for delete
  using (auth.uid() = owner_id);

-- 3. Followed Leagues Table
create table if not exists public.league_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, league_id)
);

alter table public.league_follows enable row level security;

create policy "Anyone can read league follows"
  on public.league_follows for select
  using (true);

create policy "Users can follow leagues"
  on public.league_follows for insert
  with check (auth.uid() = user_id);

create policy "Users can unfollow leagues"
  on public.league_follows for delete
  using (auth.uid() = user_id);

-- 4. Teams Table (With Primary/Secondary Colors, Coaching Staff Photos, Manager Photo & Roster JSONB)
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null,
  image_url text,
  primary_color text not null default '#8B0D0E',
  secondary_color text not null default '#0B2F5C',
  head_coach text not null default '',
  head_coach_image_url text,
  assistant_coaches text[] not null default '{}',
  assistant_coach_staff jsonb not null default '[]'::jsonb,
  manager text not null default '',
  manager_image_url text,
  captain_player_id text,
  roster jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.teams enable row level security;

create policy "Anyone can view teams"
  on public.teams for select
  using (true);

create policy "Authenticated users can add teams to leagues"
  on public.teams for insert
  with check (auth.uid() = created_by);

create policy "Creators or league owners can update teams"
  on public.teams for update
  using (auth.uid() = created_by);

-- 5. League Members & Role-Based Access Table (Admins & Table Officials)
create table if not exists public.league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null check (role in ('ADMIN', 'OFFICIAL_SCORER', 'GAME_TIMER', 'SHOT_CLOCK', 'TABLE_OFFICIAL')),
  added_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (league_id, email)
);

alter table public.league_members enable row level security;

create policy "Anyone can view league members"
  on public.league_members for select
  using (true);

create policy "Only league owners can insert league members"
  on public.league_members for insert
  with check (
    exists (
      select 1 from public.leagues
      where public.leagues.id = league_members.league_id
        and public.leagues.owner_id = auth.uid()
    )
  );

create policy "Only league owners can update league members"
  on public.league_members for update
  using (
    exists (
      select 1 from public.leagues
      where public.leagues.id = league_members.league_id
        and public.leagues.owner_id = auth.uid()
    )
  );

create policy "Only league owners can delete league members"
  on public.league_members for delete
  using (
    exists (
      select 1 from public.leagues
      where public.leagues.id = league_members.league_id
        and public.leagues.owner_id = auth.uid()
    )
  );

-- ============================================================================
-- BOX SCORE — Production Supabase PostgreSQL Schema & RLS Migration
-- Project URL: https://sbqnrxqgahfhbmlevtgf.supabase.co
-- Run this script in your Supabase Dashboard -> SQL Editor
-- ============================================================================

-- 1. Ensure public.profiles table exists and has all required columns
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Safely add any columns that may be missing from an earlier create table command
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists jersey_number integer;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

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

-- Automatic Profile Sync Trigger:
-- Automatically copies new users from auth.users into public.profiles upon registration!
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    first_name,
    last_name,
    birthday,
    address,
    height_cm,
    weight_kg,
    positions,
    account_roles,
    avatar_url,
    bio,
    jersey_number,
    phone
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    case 
      when (new.raw_user_meta_data->>'birthday') is not null and (new.raw_user_meta_data->>'birthday') != '' 
      then (new.raw_user_meta_data->>'birthday')::date 
      else null 
    end,
    coalesce(new.raw_user_meta_data->>'address', ''),
    case 
      when (new.raw_user_meta_data->>'height_cm') is not null and (new.raw_user_meta_data->>'height_cm') != '' 
      then (new.raw_user_meta_data->>'height_cm')::numeric 
      else null 
    end,
    case 
      when (new.raw_user_meta_data->>'weight_kg') is not null and (new.raw_user_meta_data->>'weight_kg') != '' 
      then (new.raw_user_meta_data->>'weight_kg')::numeric 
      else null 
    end,
    coalesce(
      array(select jsonb_array_elements_text(new.raw_user_meta_data->'positions')),
      '{}'::text[]
    ),
    coalesce(
      array(select jsonb_array_elements_text(new.raw_user_meta_data->'account_roles')),
      '{}'::text[]
    ),
    coalesce(new.raw_user_meta_data->>'image_url', new.raw_user_meta_data->>'avatar_url', ''),
    coalesce(new.raw_user_meta_data->>'bio', ''),
    case 
      when (new.raw_user_meta_data->>'jersey_number') is not null and (new.raw_user_meta_data->>'jersey_number') != '' 
      then (new.raw_user_meta_data->>'jersey_number')::integer 
      else null 
    end,
    coalesce(new.raw_user_meta_data->>'phone', '')
  )
  on conflict (id) do update set
    email = excluded.email,
    first_name = case when excluded.first_name != '' then excluded.first_name else public.profiles.first_name end,
    last_name = case when excluded.last_name != '' then excluded.last_name else public.profiles.last_name end,
    birthday = coalesce(excluded.birthday, public.profiles.birthday),
    address = coalesce(excluded.address, public.profiles.address),
    height_cm = coalesce(excluded.height_cm, public.profiles.height_cm),
    weight_kg = coalesce(excluded.weight_kg, public.profiles.weight_kg),
    positions = case when array_length(excluded.positions, 1) > 0 then excluded.positions else public.profiles.positions end,
    account_roles = case when array_length(excluded.account_roles, 1) > 0 then excluded.account_roles else public.profiles.account_roles end,
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill existing users into public.profiles:
insert into public.profiles (
  id,
  email,
  first_name,
  last_name,
  birthday,
  address,
  height_cm,
  weight_kg,
  positions,
  account_roles,
  avatar_url,
  bio,
  jersey_number,
  phone
)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'first_name', ''),
  coalesce(u.raw_user_meta_data->>'last_name', ''),
  case 
    when (u.raw_user_meta_data->>'birthday') is not null and (u.raw_user_meta_data->>'birthday') != '' 
    then (u.raw_user_meta_data->>'birthday')::date 
    else null 
  end,
  coalesce(u.raw_user_meta_data->>'address', ''),
  case 
    when (u.raw_user_meta_data->>'height_cm') is not null and (u.raw_user_meta_data->>'height_cm') != '' 
    then (u.raw_user_meta_data->>'height_cm')::numeric 
    else null 
  end,
  case 
    when (u.raw_user_meta_data->>'weight_kg') is not null and (u.raw_user_meta_data->>'weight_kg') != '' 
    then (u.raw_user_meta_data->>'weight_kg')::numeric 
    else null 
  end,
  coalesce(
    array(select jsonb_array_elements_text(u.raw_user_meta_data->'positions')),
    '{}'::text[]
  ),
  coalesce(
    array(select jsonb_array_elements_text(u.raw_user_meta_data->'account_roles')),
    '{}'::text[]
  ),
  coalesce(u.raw_user_meta_data->>'image_url', u.raw_user_meta_data->>'avatar_url', ''),
  coalesce(u.raw_user_meta_data->>'bio', ''),
  case 
    when (u.raw_user_meta_data->>'jersey_number') is not null and (u.raw_user_meta_data->>'jersey_number') != '' 
    then (u.raw_user_meta_data->>'jersey_number')::integer 
    else null 
  end,
  coalesce(u.raw_user_meta_data->>'phone', '')
from auth.users u
on conflict (id) do nothing;

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

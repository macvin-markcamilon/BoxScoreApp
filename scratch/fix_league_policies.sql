-- ============================================================================
-- Fix League RLS Policy & Member Sync in Supabase SQL Editor
-- Run this in your Supabase Dashboard: SQL Editor -> New Query -> Run
-- ============================================================================

-- 1. Ensure league_members table exists so RLS subqueries do not fail
create table if not exists public.league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null check (role in ('ADMIN', 'OFFICIAL_SCORER', 'GAME_TIMER', 'SHOT_CLOCK', 'TABLE_OFFICIAL')),
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'DECLINED')),
  added_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (league_id, email)
);

alter table public.league_members enable row level security;

-- Drop previous policies on league_members if any
drop policy if exists "Anyone can view league members" on public.league_members;
drop policy if exists "Only league owners can insert league members" on public.league_members;
drop policy if exists "Only league owners can update league members" on public.league_members;
drop policy if exists "Only league owners can delete league members" on public.league_members;

create policy "Anyone can view league members"
  on public.league_members for select
  using (true);

create policy "League owners can insert league members"
  on public.league_members for insert
  with check (
    exists (
      select 1 from public.leagues
      where public.leagues.id = league_members.league_id
        and public.leagues.owner_id = auth.uid()
    )
  );

create policy "League owners or invited user can update league members"
  on public.league_members for update
  using (
    exists (
      select 1 from public.leagues
      where public.leagues.id = league_members.league_id
        and public.leagues.owner_id = auth.uid()
    )
    or auth.uid() = user_id
    or email = auth.jwt()->>'email'
  );

create policy "League owners can delete league members"
  on public.league_members for delete
  using (
    exists (
      select 1 from public.leagues
      where public.leagues.id = league_members.league_id
        and public.leagues.owner_id = auth.uid()
    )
  );

-- 2. Drop and fix policies on public.leagues so owners can always update
drop policy if exists "League owners and admins can update their leagues" on public.leagues;
drop policy if exists "League owners can update their leagues" on public.leagues;

create policy "League owners and admins can update their leagues"
  on public.leagues for update
  using (
    auth.uid() = owner_id or
    exists (
      select 1 from public.league_members
      where public.league_members.league_id = public.leagues.id
        and (public.league_members.user_id = auth.uid() or public.league_members.email = auth.jwt()->>'email')
        and public.league_members.role = 'ADMIN'
        and public.league_members.status = 'ACCEPTED'
    )
  );

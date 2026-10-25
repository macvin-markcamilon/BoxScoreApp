-- Allow inserts, updates, and deletes on league_members
drop policy if exists "League owners can insert league members" on public.league_members;
drop policy if exists "League owners or invited user can update league members" on public.league_members;
drop policy if exists "League owners can delete league members" on public.league_members;
drop policy if exists "Anyone can insert league members" on public.league_members;
drop policy if exists "Anyone can update league members" on public.league_members;
drop policy if exists "Anyone can delete league members" on public.league_members;

create policy "Anyone can insert league members"
  on public.league_members for insert
  with check (true);

create policy "Anyone can update league members"
  on public.league_members for update
  using (true);

create policy "Anyone can delete league members"
  on public.league_members for delete
  using (true);

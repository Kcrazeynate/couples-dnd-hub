-- Phase 1, Step 1 — Multi-campaign foundation: campaigns + campaign_id.
-- Run this whole file once in the Supabase SQL editor (same project, lstaouwvgalwceswnwvi).
--
-- ADDITIVE ONLY. Nothing here changes how the hub behaves:
-- - Every existing row gets campaign_id = the couples campaign (the default
--   applies to existing rows automatically, and to any new row the old hub
--   code inserts without a campaign_id, so the live game keeps working).
-- - RLS policies on the existing tables are untouched (still public).
-- - No auth changes. No RLS flip. That is Step 3, and it waits for the
--   service key.
--
-- Couples campaign id (fixed, recorded in PHASE-1-DESIGN.md):
--   a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d
-- The DEFAULT on each campaign_id column is dropped at the flip (Step 3),
-- so from then on every write must name its campaign explicitly.

-- 1. Campaigns and membership.
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists campaign_members (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'player' check (role in ('owner', 'dm', 'player')),
  joined_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

-- 2. The couples campaign is campaign #1.
insert into campaigns (id, name)
values ('a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d', 'Nathan & Angela')
on conflict (id) do nothing;

-- 3. campaign_id on every data table. The default backfills existing rows
-- and covers inserts from the old hub code until Step 2 deploys.
alter table messages add column if not exists campaign_id uuid not null default 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d' references campaigns(id) on delete cascade;
alter table log_entries add column if not exists campaign_id uuid not null default 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d' references campaigns(id) on delete cascade;
alter table characters add column if not exists campaign_id uuid not null default 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d' references campaigns(id) on delete cascade;
alter table quests add column if not exists campaign_id uuid not null default 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d' references campaigns(id) on delete cascade;
alter table npcs add column if not exists campaign_id uuid not null default 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d' references campaigns(id) on delete cascade;
alter table rolls add column if not exists campaign_id uuid not null default 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d' references campaigns(id) on delete cascade;
alter table combatants add column if not exists campaign_id uuid not null default 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d' references campaigns(id) on delete cascade;
alter table music_state add column if not exists campaign_id uuid not null default 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d' references campaigns(id) on delete cascade;
alter table maps add column if not exists campaign_id uuid not null default 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d' references campaigns(id) on delete cascade;
alter table map_cells add column if not exists campaign_id uuid not null default 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d' references campaigns(id) on delete cascade;
alter table map_markers add column if not exists campaign_id uuid not null default 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d' references campaigns(id) on delete cascade;
alter table push_subscriptions add column if not exists campaign_id uuid not null default 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d' references campaigns(id) on delete cascade;
alter table log_effects add column if not exists campaign_id uuid not null default 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d' references campaigns(id) on delete cascade;
alter table party_locations add column if not exists campaign_id uuid not null default 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d' references campaigns(id) on delete cascade;
alter table battle_state add column if not exists campaign_id uuid not null default 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d' references campaigns(id) on delete cascade;
alter table area_markers add column if not exists campaign_id uuid not null default 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d' references campaigns(id) on delete cascade;

-- 4. Characters: one row per player PER CAMPAIGN, not one row per player globally.
alter table characters drop constraint if exists characters_player_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'characters_campaign_player_key') then
    alter table characters add constraint characters_campaign_player_key unique (campaign_id, player);
  end if;
end $$;

-- 5. Indexes so the campaign-filtered queries in Step 2 stay fast.
create index if not exists messages_campaign_id_idx on messages (campaign_id);
create index if not exists log_entries_campaign_id_idx on log_entries (campaign_id);
create index if not exists characters_campaign_id_idx on characters (campaign_id);
create index if not exists quests_campaign_id_idx on quests (campaign_id);
create index if not exists npcs_campaign_id_idx on npcs (campaign_id);
create index if not exists rolls_campaign_id_idx on rolls (campaign_id);
create index if not exists combatants_campaign_id_idx on combatants (campaign_id);
create index if not exists maps_campaign_id_idx on maps (campaign_id);
create index if not exists map_cells_campaign_id_idx on map_cells (campaign_id);
create index if not exists map_markers_campaign_id_idx on map_markers (campaign_id);
create index if not exists push_subscriptions_campaign_id_idx on push_subscriptions (campaign_id);
create index if not exists log_effects_campaign_id_idx on log_effects (campaign_id);
create index if not exists party_locations_campaign_id_idx on party_locations (campaign_id);
create index if not exists area_markers_campaign_id_idx on area_markers (campaign_id);

-- 6. RLS on the two new tables, public for now to match every other table.
-- The flip (Step 3) replaces these with membership policies.
-- The GRANTs matter: RLS policies alone do not let the anon role touch a
-- table. Without them the hub gets "permission denied for table campaigns".
grant select, insert, update, delete on campaigns to anon;
grant select, insert, update, delete on campaign_members to anon;

alter table campaigns enable row level security;
alter table campaign_members enable row level security;

drop policy if exists "Public read" on campaigns;
drop policy if exists "Public insert" on campaigns;
drop policy if exists "Public update" on campaigns;
drop policy if exists "Public delete" on campaigns;
create policy "Public read" on campaigns for select using (true);
create policy "Public insert" on campaigns for insert with check (true);
create policy "Public update" on campaigns for update using (true) with check (true);
create policy "Public delete" on campaigns for delete using (true);

drop policy if exists "Public read" on campaign_members;
drop policy if exists "Public insert" on campaign_members;
drop policy if exists "Public update" on campaign_members;
drop policy if exists "Public delete" on campaign_members;
create policy "Public read" on campaign_members for select using (true);
create policy "Public insert" on campaign_members for insert with check (true);
create policy "Public update" on campaign_members for update using (true) with check (true);
create policy "Public delete" on campaign_members for delete using (true);

-- 7. Sanity check: every row should now carry the couples campaign id.
-- Run these after the file and confirm each count matches the table's row count.
-- select 'messages', count(*) from messages where campaign_id = 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d';
-- select 'log_entries', count(*) from log_entries where campaign_id = 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d';
-- select 'characters', count(*) from characters where campaign_id = 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d';
-- select 'quests', count(*) from quests where campaign_id = 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d';
-- select 'npcs', count(*) from npcs where campaign_id = 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d';
-- select 'rolls', count(*) from rolls where campaign_id = 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d';
-- select 'combatants', count(*) from combatants where campaign_id = 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d';
-- select 'maps', count(*) from maps where campaign_id = 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d';
-- select 'map_cells', count(*) from map_cells where campaign_id = 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d';
-- select 'map_markers', count(*) from map_markers where campaign_id = 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d';
-- select 'push_subscriptions', count(*) from push_subscriptions where campaign_id = 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d';
-- select 'log_effects', count(*) from log_effects where campaign_id = 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d';
-- select 'party_locations', count(*) from party_locations where campaign_id = 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d';
-- select 'battle_state', count(*) from battle_state where campaign_id = 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d';
-- select 'area_markers', count(*) from area_markers where campaign_id = 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d';
-- select 'music_state', count(*) from music_state where campaign_id = 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d';

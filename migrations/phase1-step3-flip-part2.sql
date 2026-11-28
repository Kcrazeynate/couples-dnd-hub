-- Step 3 flip, Part 2: drop defaults, enable RLS, grants and revokes.
-- Run the four parts in order, 1 to 4, each in the SQL editor.
-- Each part is its own transaction. If a part errors, stop and tell Rick.
-- Do not run part 4 until parts 1-3 have all succeeded.

begin;

-- 4. Drop the campaign_id DEFAULT on all 16 data tables.
-- From here on every write must name its campaign explicitly.
alter table messages alter column campaign_id drop default;
alter table log_entries alter column campaign_id drop default;
alter table characters alter column campaign_id drop default;
alter table quests alter column campaign_id drop default;
alter table npcs alter column campaign_id drop default;
alter table rolls alter column campaign_id drop default;
alter table combatants alter column campaign_id drop default;
alter table music_state alter column campaign_id drop default;
alter table maps alter column campaign_id drop default;
alter table map_cells alter column campaign_id drop default;
alter table map_markers alter column campaign_id drop default;
alter table push_subscriptions alter column campaign_id drop default;
alter table log_effects alter column campaign_id drop default;
alter table party_locations alter column campaign_id drop default;
alter table battle_state alter column campaign_id drop default;
alter table area_markers alter column campaign_id drop default;

-- 5. RLS on, explicitly, for all 18 tables. Harmless if already on.
alter table messages enable row level security;
alter table log_entries enable row level security;
alter table characters enable row level security;
alter table quests enable row level security;
alter table npcs enable row level security;
alter table rolls enable row level security;
alter table combatants enable row level security;
alter table music_state enable row level security;
alter table maps enable row level security;
alter table map_cells enable row level security;
alter table map_markers enable row level security;
alter table push_subscriptions enable row level security;
alter table log_effects enable row level security;
alter table party_locations enable row level security;
alter table battle_state enable row level security;
alter table area_markers enable row level security;
alter table campaigns enable row level security;
alter table campaign_members enable row level security;
alter table admins enable row level security;

-- 6. Grants. Explicit per table, not "all tables in schema public".
-- Authenticated users get access (subject to RLS below). Anon loses
-- data-table access, except campaigns stays SELECT-only for anon, and
-- anon is revoked from the join_code and owner_id columns so the
-- public list cannot leak the code or the owner's id.
grant select, insert, update, delete on
  messages, log_entries, characters, quests, npcs, rolls, combatants,
  music_state, maps, map_cells, map_markers, push_subscriptions,
  log_effects, party_locations, battle_state, area_markers,
  campaigns, campaign_members, admins
  to authenticated;

revoke select, insert, update, delete on
  messages, log_entries, characters, quests, npcs, rolls, combatants,
  music_state, maps, map_cells, map_markers, push_subscriptions,
  log_effects, party_locations, battle_state, area_markers,
  campaign_members, admins
  from anon;
revoke insert, update, delete on campaigns from anon;
grant select on campaigns to anon;
-- Column-level: anon may list public campaigns but may not read the
-- join code or the owner's id, even for public campaigns.
revoke select (join_code, owner_id) on campaigns from anon;


commit;

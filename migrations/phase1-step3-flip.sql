-- Phase 1, Step 3 — The flip: membership RLS policies + admin bypass.
-- Run this whole file once in the Supabase SQL editor (same project,
-- lstaouwvgalwceswnwvi). Nathan runs SQL himself; this file is not run
-- by the app.
--
-- REVISED DRAFT (2026-11-27, after review). Do not run until Nathan
-- has read it. Changes from the first draft, per the review:
--  1. Characters are now owned: a user_id column links each character
--     to its player's account. Players update/insert only their own
--     row (user_id = auth.uid()). Milo is linked to Nathan; Sylvie
--     stays NULL until Angela signs up, then gets linked.
--  2. New player characters are forced to status='pending' by a
--     BEFORE INSERT trigger (non-DMs cannot insert as 'approved').
--     The update trigger already blocks status changes by non-DMs.
--  3. Message updates/deletes are DM-only. Players can post (insert)
--     but cannot edit anyone's post, so the "Posting as" spoofing gap
--     cannot be used to rewrite other people's posts.
--  4. Push subscriptions are owner-or-DM only. A user_id column links
--     each subscription to its owner. Nathan's iPhone is linked to
--     Nathan; Angela's phone stays NULL until she signs up.
--  5. Grants are explicit per table, not "all tables in schema
--     public". The anon revoke covers the same explicit list.
--  6. Helper functions use SET search_path = '' with fully qualified
--     names, and EXECUTE is revoked from public/anon.
--  7. A trigger blocks changing campaign_id on UPDATE for all 16 data
--     tables, so a row cannot be moved between campaigns.
--  8. RLS is explicitly enabled on all 18 tables (harmless if on).
--  9. The whole script runs in one transaction (BEGIN ... COMMIT), so
--     a failure midway rolls everything back instead of leaving a
--     half-converted live game.
-- 10. Triggers bypass when auth.uid() is null (service_role and the
--     SQL editor), because those are trusted server-side connections
--     and auth.uid() is null there. Without this, any hook updating
--     hp/xp/gold would throw, and so would Nathan's own SQL. Anon
--     cannot reach the tables after the revokes, so there is no hole.
-- 11. The stat-change trigger tests OLD.campaign_id, the row's actual
--     campaign. NEW.campaign_id is user-controlled: a player in
--     campaign A who is DM of campaign B could set campaign_id to B
--     and pass the bypass. (The insert trigger keeps NEW, since an
--     insert has no OLD.)
-- 12. The stat-change trigger is now an ALLOW-LIST: a player may
--     change only the listed columns. Any other column (including
--     any column added later) raises. SECURITY DEFINER is dropped
--     from the trigger functions (the helpers they call are still
--     SECURITY DEFINER, which is where it is needed).
-- 13. The character insert policy also requires status='pending'
--     for non-DMs (defense in depth; the insert trigger already
--     forces it). Stat validation on insert happens at DM approval.
-- 14. campaign_members: role changes and removing an owner/DM
--     require owner or admin; a DM may only remove a plain player.
--     Inserts cannot self-promote to dm/owner. A join_campaign()
--     function verifies the private join code and inserts as
--     'player'. The last owner cannot leave (trigger).
-- 15. Sanity check: SQL-editor queries run as postgres and bypass
--     RLS, so they do not test the policies. Test in the app as
--     Nathan and as a plain player (hp update, edit another
--     character, insert an approved character must all fail).
-- Plus the "other things" checks:
--  - Campaign creation: the campaign_members insert policy now lets a
--    user insert themself as owner of a campaign they own, so a new
--    campaign gets its DM. (The app must insert that owner row right
--    after creating the campaign.)
--  - Public campaigns: anon is revoked from the join_code and
--    owner_id columns, so signed-out visitors cannot read the join
--    code or the owner's id even for public campaigns.
--  - App code: the drop-default change is safe because all 100
--    db.from() calls already pass campaign_id (Step 2), and the
--    hooks use the service key (switched 2026-11-27).
--  - Rollback: the full rollback SQL is at the bottom of this file.
--
-- What this does NOT do (known gaps, later hardening):
-- - It does not make cheating impossible. A determined player with a
--   browser can still call the API directly. The trigger limits
--   casual stat editing; full anti-cheat (server-rolled dice, Edge
--   Functions) is a later phase.
-- - Board "Posting as" authorship is still unauthenticated in the app
--   (anyone can post as Rick/Nathan/Angela). The flip does not fix
--   that; it needs an app-side decision before opening to other groups.
-- - Log entries are DM-only after this flip. If players should still
--   add log entries, that is a product call, not a SQL change.
-- - App work to match this SQL (done 2026-11-27, verified):
--   (a) when creating a character, set user_id = the signed-in user.
--   Done: saveChar in app.js sets user_id: currentUser.id. The
--   status half is NOT needed: the insert trigger forces status to
--   'pending' for non-DMs, so the app does not set status.
--   (b) when creating a campaign, insert the owner row into
--   campaign_members right after. Done: createCampaign in app.js
--   already inserts the owner row; no change was needed.

begin;

-- 1. Admins table first. The is_admin() helper below reads public.admins,
-- and Postgres validates a SQL function body at creation time, so the
-- table must exist before the helper is created. (This was the Part 1
-- error: "relation public.admins does not exist".)
-- Nathan is site admin (user_id from the owner claim, verified 2026-11-27).
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
insert into admins (user_id)
values ('b9544048-5add-48bf-b465-24cd339c5bb0')
on conflict (user_id) do nothing;

-- 0. Helpers: is the current user a member / DM / admin of a campaign.
-- SECURITY DEFINER with an empty search_path and fully qualified names,
-- so they cannot be hijacked through a shadowed schema. EXECUTE is
-- revoked from public/anon and granted only to authenticated.
create or replace function public.is_campaign_member(p_campaign uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign and user_id = auth.uid()
  );
$$;

create or replace function public.is_campaign_dm(p_campaign uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign
      and user_id = auth.uid()
      and role in ('owner', 'dm')
  );
$$;

create or replace function public.is_campaign_owner(p_campaign uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.admins where user_id = auth.uid()
  );
$$;

revoke execute on function public.is_campaign_member(uuid) from public, anon;
revoke execute on function public.is_campaign_dm(uuid) from public, anon;
revoke execute on function public.is_campaign_owner(uuid) from public, anon;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_campaign_member(uuid) to authenticated;
grant execute on function public.is_campaign_dm(uuid) to authenticated;
grant execute on function public.is_campaign_owner(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;

-- 2. Ownership columns. Characters and push subscriptions get a user_id
-- so policies can limit each player to their own row.
alter table characters
  add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table push_subscriptions
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Backfill the existing rows. Milo belongs to Nathan. Sylvie and
-- Angela's phone stay NULL until Angela signs up; link them then.
update characters set user_id = 'b9544048-5add-48bf-b465-24cd339c5bb0'
  where player = 'nathan' and user_id is null;
update push_subscriptions set user_id = 'b9544048-5add-48bf-b465-24cd339c5bb0'
  where label = 'Nathan’s iphone' and user_id is null;

-- 3. characters.status for the pending-approval flow.
alter table characters
  add column if not exists status text not null default 'approved'
  check (status in ('pending', 'approved', 'rejected'));

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

-- 7. RLS policies. Drop the public ones, then add membership policies.
-- Pattern: SELECT requires membership (or admin). INSERT/UPDATE/DELETE
-- require membership plus the role or ownership noted per table.

-- 7a. messages (board posts). Players can post (insert). Updates and
-- deletes are DM-only, so nobody can rewrite another person's post.
drop policy if exists "Public read" on messages;
drop policy if exists "Public insert" on messages;
drop policy if exists "Public update" on messages;
drop policy if exists "Public delete" on messages;
create policy "Members read" on messages for select
  using (public.is_campaign_member(campaign_id) or public.is_admin());
create policy "Members insert" on messages for insert
  with check (public.is_campaign_member(campaign_id) or public.is_admin());
create policy "DM update" on messages for update
  using (public.is_campaign_dm(campaign_id) or public.is_admin())
  with check (public.is_campaign_dm(campaign_id) or public.is_admin());
create policy "DM delete" on messages for delete
  using (public.is_campaign_dm(campaign_id) or public.is_admin());

-- 7b. log_entries (campaign log). DM-only writes. Players read.
drop policy if exists "Public read" on log_entries;
drop policy if exists "Public insert" on log_entries;
drop policy if exists "Public update" on log_entries;
drop policy if exists "Public delete" on log_entries;
create policy "Members read" on log_entries for select
  using (public.is_campaign_member(campaign_id) or public.is_admin());
create policy "DM insert" on log_entries for insert
  with check (public.is_campaign_dm(campaign_id) or public.is_admin());
create policy "DM update" on log_entries for update
  using (public.is_campaign_dm(campaign_id) or public.is_admin())
  with check (public.is_campaign_dm(campaign_id) or public.is_admin());
create policy "DM delete" on log_entries for delete
  using (public.is_campaign_dm(campaign_id) or public.is_admin());

-- 7c. characters. Members read. A player inserts/updates only their
-- OWN row (user_id = auth.uid()). DM can insert/update/delete any
-- character in their campaign (including approving status).
drop policy if exists "Public read" on characters;
drop policy if exists "Public insert" on characters;
drop policy if exists "Public update" on characters;
drop policy if exists "Public delete" on characters;
create policy "Members read" on characters for select
  using (public.is_campaign_member(campaign_id) or public.is_admin());
create policy "Own insert" on characters for insert
  with check (
    -- Non-DMs must insert as pending (the trigger also forces this;
    -- the policy is defense in depth). DMs and admins may insert any
    -- status. Stat validation itself happens at DM approval.
    (
      public.is_campaign_member(campaign_id) and user_id = auth.uid()
      and status = 'pending'
    )
    or public.is_campaign_dm(campaign_id)
    or public.is_admin()
  );
create policy "Own update" on characters for update
  using (
    (public.is_campaign_member(campaign_id) and user_id = auth.uid())
    or public.is_campaign_dm(campaign_id)
    or public.is_admin()
  )
  with check (
    (public.is_campaign_member(campaign_id) and user_id = auth.uid())
    or public.is_campaign_dm(campaign_id)
    or public.is_admin()
  );
create policy "DM delete" on characters for delete
  using (public.is_campaign_dm(campaign_id) or public.is_admin());

-- 7d. quests. DM-only writes. Players read.
drop policy if exists "Public read" on quests;
drop policy if exists "Public insert" on quests;
drop policy if exists "Public update" on quests;
drop policy if exists "Public delete" on quests;
create policy "Members read" on quests for select
  using (public.is_campaign_member(campaign_id) or public.is_admin());
create policy "DM insert" on quests for insert
  with check (public.is_campaign_dm(campaign_id) or public.is_admin());
create policy "DM update" on quests for update
  using (public.is_campaign_dm(campaign_id) or public.is_admin())
  with check (public.is_campaign_dm(campaign_id) or public.is_admin());
create policy "DM delete" on quests for delete
  using (public.is_campaign_dm(campaign_id) or public.is_admin());

-- 7e. npcs (NPCs and places). DM-only writes. Players read.
drop policy if exists "Public read" on npcs;
drop policy if exists "Public insert" on npcs;
drop policy if exists "Public update" on npcs;
drop policy if exists "Public delete" on npcs;
create policy "Members read" on npcs for select
  using (public.is_campaign_member(campaign_id) or public.is_admin());
create policy "DM insert" on npcs for insert
  with check (public.is_campaign_dm(campaign_id) or public.is_admin());
create policy "DM update" on npcs for update
  using (public.is_campaign_dm(campaign_id) or public.is_admin())
  with check (public.is_campaign_dm(campaign_id) or public.is_admin());
create policy "DM delete" on npcs for delete
  using (public.is_campaign_dm(campaign_id) or public.is_admin());

-- 7f. rolls (saved dice rolls). Members insert their own rolls.
drop policy if exists "Public read" on rolls;
drop policy if exists "Public insert" on rolls;
drop policy if exists "Public update" on rolls;
drop policy if exists "Public delete" on rolls;
create policy "Members read" on rolls for select
  using (public.is_campaign_member(campaign_id) or public.is_admin());
create policy "Members insert" on rolls for insert
  with check (public.is_campaign_member(campaign_id) or public.is_admin());
create policy "DM update" on rolls for update
  using (public.is_campaign_dm(campaign_id) or public.is_admin())
  with check (public.is_campaign_dm(campaign_id) or public.is_admin());
create policy "DM delete" on rolls for delete
  using (public.is_campaign_dm(campaign_id) or public.is_admin());

-- 7g. combatants. DM-only writes. Players read.
drop policy if exists "Public read" on combatants;
drop policy if exists "Public insert" on combatants;
drop policy if exists "Public update" on combatants;
drop policy if exists "Public delete" on combatants;
create policy "Members read" on combatants for select
  using (public.is_campaign_member(campaign_id) or public.is_admin());
create policy "DM insert" on combatants for insert
  with check (public.is_campaign_dm(campaign_id) or public.is_admin());
create policy "DM update" on combatants for update
  using (public.is_campaign_dm(campaign_id) or public.is_admin())
  with check (public.is_campaign_dm(campaign_id) or public.is_admin());
create policy "DM delete" on combatants for delete
  using (public.is_campaign_dm(campaign_id) or public.is_admin());

-- 7h. music_state. DM-only writes. Players read.
drop policy if exists "Public read" on music_state;
drop policy if exists "Public insert" on music_state;
drop policy if exists "Public update" on music_state;
drop policy if exists "Public delete" on music_state;
create policy "Members read" on music_state for select
  using (public.is_campaign_member(campaign_id) or public.is_admin());
create policy "DM insert" on music_state for insert
  with check (public.is_campaign_dm(campaign_id) or public.is_admin());
create policy "DM update" on music_state for update
  using (public.is_campaign_dm(campaign_id) or public.is_admin())
  with check (public.is_campaign_dm(campaign_id) or public.is_admin());
create policy "DM delete" on music_state for delete
  using (public.is_campaign_dm(campaign_id) or public.is_admin());

-- 7i. maps. DM-only writes. Players read.
drop policy if exists "Public read" on maps;
drop policy if exists "Public insert" on maps;
drop policy if exists "Public update" on maps;
drop policy if exists "Public delete" on maps;
create policy "Members read" on maps for select
  using (public.is_campaign_member(campaign_id) or public.is_admin());
create policy "DM insert" on maps for insert
  with check (public.is_campaign_dm(campaign_id) or public.is_admin());
create policy "DM update" on maps for update
  using (public.is_campaign_dm(campaign_id) or public.is_admin())
  with check (public.is_campaign_dm(campaign_id) or public.is_admin());
create policy "DM delete" on maps for delete
  using (public.is_campaign_dm(campaign_id) or public.is_admin());

-- 7j. map_cells. DM-only writes. Players read.
drop policy if exists "Public read" on map_cells;
drop policy if exists "Public insert" on map_cells;
drop policy if exists "Public update" on map_cells;
drop policy if exists "Public delete" on map_cells;
create policy "Members read" on map_cells for select
  using (public.is_campaign_member(campaign_id) or public.is_admin());
create policy "DM insert" on map_cells for insert
  with check (public.is_campaign_dm(campaign_id) or public.is_admin());
create policy "DM update" on map_cells for update
  using (public.is_campaign_dm(campaign_id) or public.is_admin())
  with check (public.is_campaign_dm(campaign_id) or public.is_admin());
create policy "DM delete" on map_cells for delete
  using (public.is_campaign_dm(campaign_id) or public.is_admin());

-- 7k. map_markers. DM-only writes. Players read.
drop policy if exists "Public read" on map_markers;
drop policy if exists "Public insert" on map_markers;
drop policy if exists "Public update" on map_markers;
drop policy if exists "Public delete" on map_markers;
create policy "Members read" on map_markers for select
  using (public.is_campaign_member(campaign_id) or public.is_admin());
create policy "DM insert" on map_markers for insert
  with check (public.is_campaign_dm(campaign_id) or public.is_admin());
create policy "DM update" on map_markers for update
  using (public.is_campaign_dm(campaign_id) or public.is_admin())
  with check (public.is_campaign_dm(campaign_id) or public.is_admin());
create policy "DM delete" on map_markers for delete
  using (public.is_campaign_dm(campaign_id) or public.is_admin());

-- 7l. push_subscriptions. Owner-or-DM only. A member reads/updates/
-- deletes only their own subscription (user_id = auth.uid()); the DM
-- manages all of the campaign's. Insert requires user_id = auth.uid()
-- (or DM/admin).
drop policy if exists "Public read" on push_subscriptions;
drop policy if exists "Public insert" on push_subscriptions;
drop policy if exists "Public update" on push_subscriptions;
drop policy if exists "Public delete" on push_subscriptions;
create policy "Own read" on push_subscriptions for select
  using (
    (public.is_campaign_member(campaign_id) and user_id = auth.uid())
    or public.is_campaign_dm(campaign_id)
    or public.is_admin()
  );
create policy "Own insert" on push_subscriptions for insert
  with check (
    (public.is_campaign_member(campaign_id) and user_id = auth.uid())
    or public.is_campaign_dm(campaign_id)
    or public.is_admin()
  );
create policy "Own update" on push_subscriptions for update
  using (
    (public.is_campaign_member(campaign_id) and user_id = auth.uid())
    or public.is_campaign_dm(campaign_id)
    or public.is_admin()
  )
  with check (
    (public.is_campaign_member(campaign_id) and user_id = auth.uid())
    or public.is_campaign_dm(campaign_id)
    or public.is_admin()
  );
create policy "Own delete" on push_subscriptions for delete
  using (
    (public.is_campaign_member(campaign_id) and user_id = auth.uid())
    or public.is_campaign_dm(campaign_id)
    or public.is_admin()
  );

-- 7m. log_effects. DM-only writes. Players read.
drop policy if exists "Public read" on log_effects;
drop policy if exists "Public insert" on log_effects;
drop policy if exists "Public update" on log_effects;
drop policy if exists "Public delete" on log_effects;
create policy "Members read" on log_effects for select
  using (public.is_campaign_member(campaign_id) or public.is_admin());
create policy "DM insert" on log_effects for insert
  with check (public.is_campaign_dm(campaign_id) or public.is_admin());
create policy "DM update" on log_effects for update
  using (public.is_campaign_dm(campaign_id) or public.is_admin())
  with check (public.is_campaign_dm(campaign_id) or public.is_admin());
create policy "DM delete" on log_effects for delete
  using (public.is_campaign_dm(campaign_id) or public.is_admin());

-- 7n. party_locations. DM-only writes. Players read.
drop policy if exists "Public read" on party_locations;
drop policy if exists "Public insert" on party_locations;
drop policy if exists "Public update" on party_locations;
drop policy if exists "Public delete" on party_locations;
create policy "Members read" on party_locations for select
  using (public.is_campaign_member(campaign_id) or public.is_admin());
create policy "DM insert" on party_locations for insert
  with check (public.is_campaign_dm(campaign_id) or public.is_admin());
create policy "DM update" on party_locations for update
  using (public.is_campaign_dm(campaign_id) or public.is_admin())
  with check (public.is_campaign_dm(campaign_id) or public.is_admin());
create policy "DM delete" on party_locations for delete
  using (public.is_campaign_dm(campaign_id) or public.is_admin());

-- 7o. battle_state. DM-only writes. Players read.
drop policy if exists "Public read" on battle_state;
drop policy if exists "Public insert" on battle_state;
drop policy if exists "Public update" on battle_state;
drop policy if exists "Public delete" on battle_state;
create policy "Members read" on battle_state for select
  using (public.is_campaign_member(campaign_id) or public.is_admin());
create policy "DM insert" on battle_state for insert
  with check (public.is_campaign_dm(campaign_id) or public.is_admin());
create policy "DM update" on battle_state for update
  using (public.is_campaign_dm(campaign_id) or public.is_admin())
  with check (public.is_campaign_dm(campaign_id) or public.is_admin());
create policy "DM delete" on battle_state for delete
  using (public.is_campaign_dm(campaign_id) or public.is_admin());

-- 7p. area_markers. DM-only writes. Players read.
drop policy if exists "Public read" on area_markers;
drop policy if exists "Public insert" on area_markers;
drop policy if exists "Public update" on area_markers;
drop policy if exists "Public delete" on area_markers;
create policy "Members read" on area_markers for select
  using (public.is_campaign_member(campaign_id) or public.is_admin());
create policy "DM insert" on area_markers for insert
  with check (public.is_campaign_dm(campaign_id) or public.is_admin());
create policy "DM update" on area_markers for update
  using (public.is_campaign_dm(campaign_id) or public.is_admin())
  with check (public.is_campaign_dm(campaign_id) or public.is_admin());
create policy "DM delete" on area_markers for delete
  using (public.is_campaign_dm(campaign_id) or public.is_admin());

-- 7q. campaigns. Anyone signed in can create one. Members read their
-- own campaigns. Public campaigns readable by anon (store window), but
-- anon cannot read join_code or owner_id (revoked above). Owner can
-- update (rename) and delete their campaign.
drop policy if exists "Public read" on campaigns;
drop policy if exists "Public insert" on campaigns;
drop policy if exists "Public update" on campaigns;
drop policy if exists "Public delete" on campaigns;
create policy "Public campaigns readable" on campaigns for select
  using (is_public = true or public.is_campaign_member(id) or public.is_admin());
create policy "Signed-in create" on campaigns for insert
  with check (auth.uid() is not null and (owner_id = auth.uid() or public.is_admin()));
create policy "Owner update" on campaigns for update
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());
create policy "Owner delete" on campaigns for delete
  using (owner_id = auth.uid() or public.is_admin());

-- 7r. campaign_members. Members read their campaign's roster.
-- Role rules (a co-DM must NOT be able to demote or remove the owner,
-- or promote themself to owner):
--   * Role changes: owner or admin only.
--   * Removing someone else: owner or admin, except a DM may remove
--     a plain player.
--   * Anyone may remove themself (leave), but the last owner cannot
--     leave (enforced by the trigger in section 8d).
--   * Inserting: nobody may insert themself as dm or owner except the
--     campaign's owner inserting themself as owner on creation.
--     Players join as 'player'. A DM may invite someone as 'player';
--     only the owner may invite someone as 'dm'. Private-campaign
--     joins go through join_campaign() (section 8e), which verifies
--     the code and inserts as 'player'; public campaigns allow a
--     direct self-insert as 'player'.
drop policy if exists "Public read" on campaign_members;
drop policy if exists "Public insert" on campaign_members;
drop policy if exists "Public update" on campaign_members;
drop policy if exists "Public delete" on campaign_members;
create policy "Members read roster" on campaign_members for select
  using (public.is_campaign_member(campaign_id) or public.is_admin());
create policy "Join or invite" on campaign_members for insert
  with check (
    -- Join a public campaign as a player.
    (user_id = auth.uid() and role = 'player' and exists (
      select 1 from public.campaigns
      where id = campaign_id and is_public = true
    ))
    -- Owner inserts themself as owner on creation.
    or (user_id = auth.uid() and role = 'owner' and exists (
      select 1 from public.campaigns
      where id = campaign_id and owner_id = auth.uid()
    ))
    -- Owner invites someone as player or dm.
    or (public.is_campaign_owner(campaign_id) and role in ('player', 'dm'))
    -- A DM invites someone as player only.
    or (public.is_campaign_dm(campaign_id) and role = 'player')
    or public.is_admin()
  );
create policy "Owner update role" on campaign_members for update
  using (public.is_campaign_owner(campaign_id) or public.is_admin())
  with check (public.is_campaign_owner(campaign_id) or public.is_admin());
create policy "Remove or leave" on campaign_members for delete
  using (
    user_id = auth.uid()
    or public.is_campaign_owner(campaign_id)
    or public.is_admin()
    -- A DM may remove a plain player, but not an owner or another DM.
    or (public.is_campaign_dm(campaign_id) and role = 'player')
  );

-- 7s. admins. Readable by admins only. No insert/update/delete policy
-- for non-admins; only the service key or a future admin UI manages it.
drop policy if exists "Admins readable by admins" on admins;
create policy "Admins readable by admins" on admins
  for select using (public.is_admin());

-- 8. Triggers.

-- 8a. Block stat changes on characters by non-DMs. Allow-list: a player
-- editing their own character may change ONLY the columns listed here.
-- Anything else (hp, max_hp, xp, gold, level, ability scores, status,
-- campaign_id, player, user_id, dismissed, join_mode, and any column
-- added later) raises. An allow-list is safer than a deny-list: a new
-- column is locked by default instead of open by default.
-- Player-editable: notes, image_url, personality_traits, ideals, bonds,
-- flaws, alignment, background, name, race, class, skills, attacks,
-- spells, features, inventory, updated_at.
create or replace function public.block_character_stat_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed text[] := array[
    'notes','image_url','personality_traits','ideals','bonds','flaws',
    'alignment','background','name','race','class','skills','attacks',
    'spells','features','inventory','updated_at'
  ];
begin
  -- Server-side connections (service_role, postgres/SQL editor) have no
  -- auth.uid(). They are trusted: the service key bypasses RLS by design,
  -- and the SQL editor is Nathan himself. Anon cannot reach the table
  -- after the revokes, so there is no hole here. Without this bypass,
  -- any hook updating hp/xp/gold (battle tracker) would throw.
  if auth.uid() is null then
    return NEW;
  end if;
  -- Test OLD.campaign_id, the row's actual campaign. NEW.campaign_id is
  -- user-controlled: a player in campaign A who is DM of campaign B
  -- could set campaign_id to B and pass the bypass.
  if public.is_campaign_dm(OLD.campaign_id) or public.is_admin() then
    return NEW;
  end if;
  -- Allow-list: strip the player-editable columns from both rows. If
  -- anything else differs, the player is changing a locked column.
  if (to_jsonb(NEW) - allowed) is distinct from (to_jsonb(OLD) - allowed) then
    raise exception 'Only the DM can change stats, XP, gold, or approval status.';
  end if;
  return NEW;
end;
$$;

drop trigger if exists characters_block_stat_change on characters;
create trigger characters_block_stat_change
  before update on characters
  for each row execute function public.block_character_stat_change();

-- 8b. Force status='pending' when a non-DM inserts a character, so a
-- player cannot approve themself by inserting as 'approved'. DM and
-- admin inserts keep the status they pass.
create or replace function public.force_character_pending()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Server-side connections (service_role, postgres/SQL editor) have no
  -- auth.uid() and are trusted; see block_character_stat_change.
  -- (INSERT trigger, so NEW.campaign_id is correct here: there is no
  -- OLD, and the row is being created in the campaign named by NEW.)
  if auth.uid() is null then
    return NEW;
  end if;
  if public.is_campaign_dm(NEW.campaign_id) or public.is_admin() then
    return NEW;
  end if;
  NEW.status := 'pending';
  return NEW;
end;
$$;

drop trigger if exists characters_force_pending on characters;
create trigger characters_force_pending
  before insert on characters
  for each row execute function public.force_character_pending();

-- 8c. Block moving a row between campaigns. No UPDATE may change
-- campaign_id on any data table, for anyone signed in through the app.
-- Server-side connections (service_role, postgres/SQL editor) bypass
-- via the auth.uid() check at the top of the function, so a real move
-- can still be done by direct SQL, deliberately.
create or replace function public.block_campaign_move()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Server-side connections (service_role, postgres/SQL editor) have no
  -- auth.uid() and are trusted; see block_character_stat_change. This
  -- lets a real move be done by direct SQL, deliberately.
  if auth.uid() is null then
    return NEW;
  end if;
  if NEW.campaign_id is distinct from OLD.campaign_id then
    raise exception 'campaign_id cannot be changed; move the row by direct SQL instead.';
  end if;
  return NEW;
end;
$$;

drop trigger if exists block_campaign_move on messages;
drop trigger if exists block_campaign_move on log_entries;
drop trigger if exists block_campaign_move on characters;
drop trigger if exists block_campaign_move on quests;
drop trigger if exists block_campaign_move on npcs;
drop trigger if exists block_campaign_move on rolls;
drop trigger if exists block_campaign_move on combatants;
drop trigger if exists block_campaign_move on music_state;
drop trigger if exists block_campaign_move on maps;
drop trigger if exists block_campaign_move on map_cells;
drop trigger if exists block_campaign_move on map_markers;
drop trigger if exists block_campaign_move on push_subscriptions;
drop trigger if exists block_campaign_move on log_effects;
drop trigger if exists block_campaign_move on party_locations;
drop trigger if exists block_campaign_move on battle_state;
drop trigger if exists block_campaign_move on area_markers;
create trigger block_campaign_move before update on messages for each row execute function public.block_campaign_move();
create trigger block_campaign_move before update on log_entries for each row execute function public.block_campaign_move();
create trigger block_campaign_move before update on characters for each row execute function public.block_campaign_move();
create trigger block_campaign_move before update on quests for each row execute function public.block_campaign_move();
create trigger block_campaign_move before update on npcs for each row execute function public.block_campaign_move();
create trigger block_campaign_move before update on rolls for each row execute function public.block_campaign_move();
create trigger block_campaign_move before update on combatants for each row execute function public.block_campaign_move();
create trigger block_campaign_move before update on music_state for each row execute function public.block_campaign_move();
create trigger block_campaign_move before update on maps for each row execute function public.block_campaign_move();
create trigger block_campaign_move before update on map_cells for each row execute function public.block_campaign_move();
create trigger block_campaign_move before update on map_markers for each row execute function public.block_campaign_move();
create trigger block_campaign_move before update on push_subscriptions for each row execute function public.block_campaign_move();
create trigger block_campaign_move before update on log_effects for each row execute function public.block_campaign_move();
create trigger block_campaign_move before update on party_locations for each row execute function public.block_campaign_move();
create trigger block_campaign_move before update on battle_state for each row execute function public.block_campaign_move();
create trigger block_campaign_move before update on area_markers for each row execute function public.block_campaign_move();

-- 8d. Block the last owner from leaving, so a campaign cannot be
-- orphaned. Server-side connections bypass (auth.uid() null), so the
-- service key and SQL editor can still clean up deliberately.
create or replace function public.block_last_owner_leave()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return OLD;
  end if;
  if OLD.role = 'owner' and not exists (
    select 1 from public.campaign_members
    where campaign_id = OLD.campaign_id
      and role = 'owner'
      and user_id <> OLD.user_id
  ) then
    raise exception 'The last owner cannot leave the campaign; transfer ownership first.';
  end if;
  return OLD;
end;
$$;

drop trigger if exists block_last_owner_leave on campaign_members;
create trigger block_last_owner_leave
  before delete on campaign_members
  for each row execute function public.block_last_owner_leave();

-- 8e. Join a private campaign by code. The app calls this instead of
-- inserting into campaign_members directly, because a non-member cannot
-- read the join_code (it is revoked from anon and hidden by the SELECT
-- policy for private campaigns). SECURITY DEFINER so it can read the
-- code and insert the membership row; it returns true on success and
-- raises on a wrong code or an already-joined user. Public campaigns
-- do not need a code (the insert policy allows a direct self-insert
-- as 'player' for those).
create or replace function public.join_campaign(p_campaign_id uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_public boolean;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'join_campaign requires a signed-in user.';
  end if;
  select is_public, join_code into v_is_public, v_code
    from public.campaigns where id = p_campaign_id;
  if not found then
    raise exception 'Campaign not found.';
  end if;
  if exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign_id and user_id = auth.uid()
  ) then
    raise exception 'Already a member of this campaign.';
  end if;
  if v_is_public then
    insert into public.campaign_members (campaign_id, user_id, role)
    values (p_campaign_id, auth.uid(), 'player');
    return true;
  end if;
  if v_code is null or p_code is null or btrim(p_code) <> v_code then
    raise exception 'Wrong join code.';
  end if;
  insert into public.campaign_members (campaign_id, user_id, role)
  values (p_campaign_id, auth.uid(), 'player');
  return true;
end;
$$;

revoke execute on function public.join_campaign(uuid, text) from public, anon;
grant execute on function public.join_campaign(uuid, text) to authenticated;

commit;

-- 9. Sanity checks. NOTE: queries run in the SQL editor execute as
-- postgres, which bypasses RLS. They prove the data is still there,
-- but they do NOT test the policies. The real test is in the app:
-- sign in as Nathan and confirm the hub works, then sign in as a
-- plain player account and try each of these (each one must fail):
--   * update hp on your own character (or anyone's),
--   * edit another character's notes,
--   * insert a character with status = 'approved'.
-- SQL-editor checks (data intact, not policy):
--   select count(*) from messages where campaign_id = 'a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d';
--   -- should still return the couples campaign's row count.
--   select player, user_id, status from characters;
--   -- Milo should show Nathan's user_id and status 'approved'.
--   select label, user_id from push_subscriptions;
--   -- Nathan's iphone should show Nathan's user_id.
--
-- ROLLBACK (if the flip breaks the live game). Run this whole block.
-- It restores the public policies AND the anon grants, because the
-- revoke is part of the flip script above.
--   begin;
--   grant select, insert, update, delete on
--     messages, log_entries, characters, quests, npcs, rolls, combatants,
--     music_state, maps, map_cells, map_markers, push_subscriptions,
--     log_effects, party_locations, battle_state, area_markers,
--     campaigns, campaign_members
--     to anon;
--   grant select (join_code, owner_id) on campaigns to anon;
--   -- then re-create the public policies from
--   -- phase1-step1-campaigns.sql (the "Public read/insert/update/
--   -- delete" policies, using (true)), for every table above plus
--   -- campaigns and campaign_members.
--   -- NOTE: the rollback does NOT remove the user_id columns, the
--   -- status column, the admins table, or the triggers. Those are
--   -- additive and harmless. It only re-opens access.
--   commit;

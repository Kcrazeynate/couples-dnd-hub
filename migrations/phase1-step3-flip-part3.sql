-- Step 3 flip, Part 3: RLS policies.
-- Run the four parts in order, 1 to 4, each in the SQL editor.
-- Each part is its own transaction. If a part errors, stop and tell Rick.
-- Do not run part 4 until parts 1-3 have all succeeded.

begin;

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


commit;

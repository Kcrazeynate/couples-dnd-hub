-- Step 3 flip, Part 4: triggers and join_campaign.
-- Run the four parts in order, 1 to 4, each in the SQL editor.
-- Each part is its own transaction. If a part errors, stop and tell Rick.
-- Do not run part 4 until parts 1-3 have all succeeded.

begin;

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

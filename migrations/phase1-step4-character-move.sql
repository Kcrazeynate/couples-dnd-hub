-- Phase 1, Step 4: Character moves ("abandon your party").
--
-- Rule (locked 2026-11-27): A character lives with its player, not
-- with a campaign. A player may have several characters, each in one
-- campaign at a time; one character cannot be in two places at once.
-- Moving a character to a different campaign means abandoning the
-- current party for that character. If the player still has other
-- characters in the old campaign, they keep playing there (and keep
-- the membership) until every character is out. That also lets a
-- player pull one character out to make room for a friend to join.
-- No jumping in and out. A character can only move into a campaign
-- that is between missions (no Active quests), so nobody hops back
-- mid-adventure. The new campaign's DM still approves the moved sheet
-- (it lands as pending, join_mode='pending' and status='pending').
-- The owner of a campaign cannot abandon it (they are the host).
--
-- Enforcement: the ONLY way to move a character is move_character().
-- It sets a transaction-scoped flag (app.character_move) before its
-- update, and the two triggers below allow a campaign_id change only
-- when that flag is set. A direct API update cannot set the flag
-- (PostgREST has no way to run set_config), so it cannot bypass the
-- membership handling, the owner check, or the pending approval.
--
-- The triggers themselves live in Step 3; this file only replaces
-- their function bodies (CREATE OR REPLACE), so the existing trigger
-- attachments pick up the new versions automatically. Run it in the
-- Supabase SQL editor after Step 3. It is idempotent (CREATE OR
-- REPLACE / CREATE INDEX IF NOT EXISTS), so re-running it is safe.

begin;

-- 0. Indexes for the move's lookups. campaign_members already has a
-- primary key on (campaign_id, user_id), so it is covered.
create index if not exists quests_campaign_status_idx on public.quests (campaign_id, status);
create index if not exists characters_user_campaign_idx on public.characters (user_id, campaign_id);

-- 1. block_campaign_move: a campaign_id change is allowed only when
-- move_character() has set the flag for this transaction (characters
-- table only). Every other table, and every direct update, is still
-- blocked.
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
    -- Sanctioned character move only: move_character() sets
    -- app.character_move for this transaction before its update.
    -- A plain API update has no flag, so it stays blocked.
    if TG_TABLE_SCHEMA = 'public' and TG_TABLE_NAME = 'characters'
       and current_setting('app.character_move', true) = '1' then
      return NEW;
    end if;
    raise exception 'campaign_id cannot be changed directly; use move_character() to move a character.';
  end if;
  return NEW;
end;
$$;

-- 2. block_character_stat_change: allow a sanctioned move. Only
-- campaign_id, join_mode, status, and updated_at may change in a move.
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
  if public.is_campaign_dm(OLD.campaign_id) or public.is_admin() then
    return NEW;
  end if;
  -- Sanctioned character move: move_character() sets the
  -- app.character_move flag for this transaction. Only campaign_id,
  -- join_mode, status, and updated_at may change.
  if current_setting('app.character_move', true) = '1'
     and NEW.campaign_id is distinct from OLD.campaign_id then
    if (to_jsonb(NEW) - array['campaign_id','join_mode','status','updated_at'])
       is distinct from
       (to_jsonb(OLD) - array['campaign_id','join_mode','status','updated_at']) then
      raise exception 'Only the DM can change stats, XP, gold, or approval status.';
    end if;
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

-- 3. move_character(): the atomic move, and the ONLY way to move a
-- character. Validates ownership, that the caller is a member of the
-- target, that the target is between missions, and that the caller
-- does not own the campaign they are leaving. Sets the flag so the
-- triggers allow the update, moves the character (pending for the new
-- DM, both join_mode and status), clears the flag, and removes the
-- caller's membership in the old campaign only if no other character
-- of theirs remains there. Combatants and party locations carry no
-- character id (they are name and label rows, DM-managed and
-- historical), so there is nothing else to clean up.
create or replace function public.move_character(p_character_id uuid, p_target_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_old_campaign uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;
  select user_id, campaign_id into v_owner, v_old_campaign
  from public.characters where id = p_character_id
  for update;
  if not found then
    raise exception 'Character not found.';
  end if;
  if v_owner is distinct from auth.uid() then
    raise exception 'You can only move your own character.';
  end if;
  if v_old_campaign = p_target_campaign_id then
    raise exception 'Your character is already in that campaign.';
  end if;
  if public.is_campaign_owner(v_old_campaign) then
    raise exception 'You own this campaign, so you cannot abandon it. Transfer ownership or delete the campaign first.';
  end if;
  if not public.is_campaign_member(p_target_campaign_id) then
    raise exception 'You are not a member of that campaign.';
  end if;
  if exists (select 1 from public.quests where campaign_id = p_target_campaign_id and status = 'Active') then
    raise exception 'That campaign is in the middle of a mission. You can move once they are between missions.';
  end if;
  -- Mark this transaction as a sanctioned character move, so the
  -- triggers allow the campaign_id change. PostgREST clients cannot
  -- set this flag themselves; only this function can. The flag is
  -- transaction-scoped, so it vanishes when this call commits.
  perform set_config('app.character_move', '1', true);
  update public.characters
  set campaign_id = p_target_campaign_id,
      join_mode = 'pending',
      status = 'pending',
      updated_at = now()
  where id = p_character_id;
  -- Clear the flag right away, so no later update in this transaction
  -- can ride on it.
  perform set_config('app.character_move', '', true);
  -- Leave the old campaign, but only if no other character of yours
  -- remains there. If one does, you are still playing there, so the
  -- membership stays.
  if not exists (
    select 1 from public.characters
    where user_id = auth.uid()
      and campaign_id = v_old_campaign
      and id <> p_character_id
  ) then
    delete from public.campaign_members
    where campaign_id = v_old_campaign and user_id = auth.uid();
  end if;
end;
$$;

revoke execute on function public.move_character(uuid, uuid) from public, anon;
grant execute on function public.move_character(uuid, uuid) to authenticated;

commit;

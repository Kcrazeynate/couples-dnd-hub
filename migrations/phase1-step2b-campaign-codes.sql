-- Phase 1, Step 2b: Campaign invite codes, join_code and is_public.
-- Run this whole file once in the Supabase SQL editor (same project,
-- lstaouwvgalwceswnwvi). Nathan runs SQL himself; this file is not
-- run by the app.
--
-- ADDITIVE ONLY. Nothing here changes how the app behaves before the
-- columns are used:
-- - join_code is the shared code a player types to join a private
--   campaign from an invite link. Null means the host has not set
--   one yet, so a private campaign with no code cannot be joined
--   until the host sets it in the Campaigns tab.
-- - is_public is false by default. A public campaign lets anyone
--   with the invite link join with no code. A private campaign
--   (is_public false) needs the join code.
-- - The app reads these columns when they exist. Before this file
--   runs, the read fails and the app joins with no code, as before,
--   so nothing breaks while the columns are missing. Once this runs,
--   the code check takes effect.
-- - No extra GRANT is needed: a new column is covered by the grants
--   already on the campaigns table. No RLS change here. The flip
--   (Step 3) locks the code down properly; until then the check is
--   in the app, as with the other Step 2 role checks.
--
-- After running this, set a join code for each campaign you want to
-- invite people to, in the Campaigns tab. Existing campaigns become
-- private with no code, so an invite link to one will not let anyone
-- in until the host sets its code (or marks it public).

alter table public.campaigns
  add column if not exists join_code text,
  add column if not exists is_public boolean not null default false;

# Phase 1: Multi-Campaign Foundation Design

Date: 2026-11-26. Status: design, awaiting Nathan's go-ahead on the decisions below.

## What exists now (verified live 2026-11-26)

- One Supabase project: `lstaouwvgalwceswnwvi` (the couples campaign's project).
- The Table talks to it with the anon (publishable) key only, no sign-in. Data is protected by the unguessable URL plus the passphrase gate in the site.
- RLS is ON with "public" policies (`using (true)`) on every table. Anyone with the anon key can read/write everything.
- app.js creates the client at line 303 with `CONFIG.SUPABASE_URL` + `CONFIG.SUPABASE_ANON_KEY`. No auth anywhere.
- No service_role key anywhere in the workspace. No Supabase CLI, no psql. DDL runs in the Supabase SQL editor (the established pattern: every schema block so far was run there by Nathan).

## Tables (16, all verified)

| Table | Notes for multi-campaign |
|---|---|
| messages | board posts. Add campaign_id. |
| log_entries | campaign log. Add campaign_id. |
| characters | one row per player, `player` is UNIQUE. Must become unique(campaign_id, player). Add campaign_id. |
| quests | Add campaign_id. |
| npcs | NPCs and places. Add campaign_id. |
| rolls | saved dice rolls. Add campaign_id. |
| combatants | battle combatants. Add campaign_id. |
| music_state | single row, id=1. Add campaign_id, one row per campaign. |
| maps | Add campaign_id. |
| map_cells | has map_id FK. Add campaign_id (denormalized, so RLS can check it without a join). |
| map_markers | has map_id FK. Add campaign_id. |
| push_subscriptions | push endpoints. Add campaign_id + user link (so turn-signal pushes go to the right campaign's players). |
| log_effects | has log_id FK. Add campaign_id. |
| party_locations | has log_id FK + marker_id FK. Add campaign_id. |
| battle_state | single row, id=1. Add campaign_id, one row per campaign. |
| area_markers | tokens on area maps (label, grid_x, grid_y, kind). Add campaign_id. |

New tables:
- `campaigns` (id, name, owner_id references auth.users, created_at, plus later: visibility public/private, passphrase, tier).
- `campaign_members` (campaign_id, user_id references auth.users, role: owner / dm / player, joined_at). Primary key (campaign_id, user_id).

## Migration order (safe, no breakage until the flip)

1. **Additive only.** Create `campaigns` + `campaign_members`. Add nullable `campaign_id` to all 16 tables. Insert the couples campaign row ("Nathan & Angela" campaign) and backfill every existing row with its id. Change `characters.player` unique to unique(campaign_id, player). Nothing breaks: the Table keeps working exactly as-is, because the public RLS policies are untouched and no query filters on campaign_id yet.
   - Couples campaign id (fixed): `a752cf4c-cbac-4ae2-bdb2-eba9e86cbb3d`.
   - SQL written and ready: `~/workspace/dnd-hub/migrations/phase1-step1-campaigns.sql`. Nathan runs it once in the Supabase SQL editor. It uses NOT NULL DEFAULT on each campaign_id column, so existing rows backfill automatically and old-code inserts keep working. The defaults are dropped at the flip (Step 3).
   - Single-row tables (music_state, battle_state) get campaign_id too; one row per campaign from Step 2 on (the Table must select by campaign_id, not by id=1).
2. **Table code, deployed while public policies still stand.** Sign-in/sign-up UI (email/password first, Google later). Session handling via supabase.auth. Every query filters `campaign_id = current campaign`. Campaign switcher UI + campaign creation UI. The couples campaign is the default. The old passphrase gate is replaced by auth. The DM passphrase is replaced by the member role.
3. **The flip.** Replace the public RLS policies with membership policies: a user can read/write a row only when they are a member of that row's campaign (`exists (select 1 from campaign_members where campaign_id = <row>.campaign_id and user_id = auth.uid())`). Campaigns rows: readable by members, created by any signed-in user. campaign_members rows: readable by members of that campaign, insertable by the campaign owner (invites) and by the user themself on join.
4. **Hooks.** The background workers (board watch, battle tracker, scene-end, AI chat, auto-map, music-start) all use the anon key over REST today. After the flip, anon cannot read anything. The workers need a service_role key (server-side, bypasses RLS) OR a dedicated worker user account. Service_role is the standard answer. Nathan gets it from Supabase Dashboard > Settings > API and puts it in the Secure Vault; the hooks read it from there. Until the flip, the hooks keep working untouched.

## Auth decisions

- Email/password first. Supabase Auth has email on by default; no dashboard work needed beyond confirming it.
- Google sign-in deferred: it needs a Google Cloud OAuth client ID/secret entered in the Supabase dashboard. Do it after Phase 1 lands, or when Nathan wants it.
- Nathan and Angela each create an account, then join the couples campaign (owner invites, or a one-time join link). Their characters stay linked by the `player` field (nathan / angela) on the characters rows.
- The shared passphrase gate goes away. Per-campaign passphrases come back later as the campaign-level gate (already decided for the business: each campaign has its own password set by the host).

## Admin access (Nathan, 2026-11-27)

Two kinds, do not confuse them:
- Database-level: the service_role key. For the background workers only (board watch, battle tracker, scene compiler, AI chat, auto-map). It bypasses RLS. Lives only on this machine, never in the browser or the repo. Needed before the flip (Step 3).
- Platform-level: Nathan as site admin. A role that can see and manage all campaigns, users, and abuse reports (moderation is basic abuse reporting, so someone has to receive and act on reports, and that is the admin). This is an in-app role, separate from the Supabase dashboard.
- The platform admin needs an RLS bypass: the membership policies in Step 3 include an OR condition for admins (for example, the user id exists in an admins table). Build the bypass into the flip, not after, because adding it later means rewriting every policy.
- Admin UI (a screen to list campaigns and users, handle reports, suspend) is a later build, not Phase 1. Phase 1 only needs the role plus the RLS bypass.
- Nathan already has Supabase dashboard admin (project owner). That is separate from the in-app admin role.

## Security (Nathan, 2026-11-27)

Two threats, separate:
- Cross-campaign access: someone reading or changing another group's game. Current state is wide open: every table has a public policy (using (true)) and the anon key sits in the browser. Anyone with the key can read or write every table. The flip (Step 3) closes this: membership policies plus the admin bypass. The anon key is public by design and is safe once RLS is correct.
- Cheating inside a campaign: fake dice rolls, edited stats (HP, XP, gold). As long as the browser writes straight to the database, a determined player can fake their own campaign's numbers. The flip limits it with role-based write rules: players may update only their own character row, and only non-stat fields; HP, XP, gold, quest status, and combat state are DM-only (role owner/dm). Every roll and change lands in the log with the player's name, so casual faking is visible to the DM. That makes cheating limited and visible, not impossible.
- Full anti-cheat needs server authority: dice rolled by an Edge Function, stat changes validated server-side. That is a later hardening phase, not Phase 1. Do not claim Phase 1 makes cheating impossible.
- Keys: the service_role key must never appear in the browser, the repo, or any client-side file. Email verification on sign-up; Google sign-in later.
- Script injection: board posts and AI chat messages already escape user text before rendering (escapeHtml, app.js line 26, used at lines 369-371 and 433-434, verified 2026-11-27), so a player cannot inject a script into another player's browser through a post. A full sweep of the other innerHTML sites in app.js (80 total) is part of Step 2 hardening.

## Character creation and joining (Nathan, 2026-11-27)
- Cheating vector: a player claims they rolled all 20s for stats, or brings a powerful or non-standard character (homebrew race or class, magic items, stats above what the method allows).
- Rule: a new character joining a campaign starts as pending approval. The DM sees the full sheet plus how the stats were made, and approves or rejects it. Until approved, the character cannot roll, act, or appear in the party.
- Stat methods, chosen per campaign by the DM: point buy or standard array (nothing to fake, no rolls needed), or rolled stats backed by the Table's roll log (the 4d6-drop-lowest rolls must exist in the rolls table under that player's name; typed-in numbers with no backing rolls flag for the DM). Physical-table rolls are approved by the DM by hand.
- Non-standard flags for DM review: any race or class outside the SRD/PHB, any magic item, any stat above the method's maximum, any total that does not match the backing rolls. Standard characters built by the book can be approved at a glance; anything flagged needs a real look.
- Applies to new characters joining a campaign. The couples campaign's existing characters (Milo, Sylvie) are already in.

## Decisions needed from Nathan (before the migration SQL is written)

1. **Same project or a new one?** LOCKED 2026-11-26: same project (`lstaouwvgalwceswnwvi`). The couples campaign becomes campaign #1, all data stays.
2. **Service_role key for the hooks?** After the RLS flip the hooks need it (they are not people and cannot sign in; the service key is Supabase's server-side master key that bypasses the membership rules). Nathan fetches it from Supabase Dashboard > Settings > API, the key labeled service_role / secret, and hands it over through the secure entry box (goes straight to secure storage, never seen in chat, never in the browser or the public repo). Only needed before the flip; the additive steps and Table code can run without it.
3. **Google sign-in now or later?** LOCKED 2026-11-26: email/password first, Google later.

## What Phase 1 does NOT do

- No AI DM provider picker / BYOK (Phase 2).
- No onboarding flow / invites by email (Phase 3).
- No paid tiers, no player limits enforcement (Phase 5).
- No table view, turn signals, manual rolls, photo-to-map (the usability features, built on top of Phase 1).
- No Cloudflare Pages move (Phase 4). The couples campaign stays on GitHub Pages; the business frontend moves later.

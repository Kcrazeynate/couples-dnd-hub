# The Quest Table — Home Page Design

Nathan's calls, 2026-11-27 ~01:42 PT. Design first, build after his yes.

## The shape

One page, two states. The home page is the front door for everyone.

- **Signed out: the store window.** What The Quest Table is, what you can do, why you should join, and a big sign-up button.
- **Signed in: the overview.** What's the story you're on, the last few moves, who's in your party. The board, dice, and everything else are one tap away.
- **Once you're in the door you don't have to knock to come back in.** Sign-in persists (it already does). A returning user lands on the overview, never on a sign-in wall.

## Store window (signed out)

Top to bottom:

1. **The name and the line.** "The Quest Table" in the blackletter brand font, one line saying what it is: your table for Dungeons & Dragons, with an AI dungeon master, your whole party in one place.
2. **What you can do.** Short cards, not a wall of text: play with an AI DM, roll real 3D dice, share a living map, keep the campaign log and quests, listen to table music. Each one a line, not a paragraph.
3. **Starter campaigns to browse.** The three carousel cards already built (Frozen Sick, A Most Potent Brew, Dragon of Icespire Peak), so a visitor can see what a campaign looks like before signing up.
4. **Public campaigns looking for players.** Listings from campaigns marked public, with a join button. Tapping join is the moment the account prompt shows up. (Nathan, 2026-11-27 ~01:46 PT: yes, show public campaigns too.)
5. **Why you should join.** Joining is always free; the host pays; your party, your story, your dice. One short block.
6. **The big sign-up button.** Bottom of the page and in the header. Tapping it opens the sign-in / create-account form (the gate screen we already have, reused, not the front door anymore).

No read-only demo board for now. Nathan did not ask for one; the store window is the browse surface. If he wants a peek at a live board later, it slots in as another section.

## Overview (signed in)

What a returning user sees instead of the store window:

1. **Your campaign: what's going on in a glance.** The campaign you're in (or a picker if you're in more than one): the story so far in brief, where the party is, and what's happening now, drawn from the Campaign State. Enough to catch up at a glance, not a full recap. (Nathan, 2026-11-27 ~01:47 PT.)
2. **Last few moves.** The most recent board posts / log entries, three to five, so you can catch up at a glance. Each move shows who went last, what they did, the outcome, and who's up next. Tapping one opens the board at that post. (Nathan, 2026-11-27 ~01:46 PT.)
3. **Your party.** Who's in it, with portraits: Milo, Sylvie, Liora, Finn, Bram (and whoever else joins). Your character first.
4. **Quick way in.** Big buttons: Board, Dice, Maps, Campaign Log. The overview is the front door, not a wall; nothing here blocks you from the table.
5. **Sign out** stays where it is (More menu / Campaigns tab).

If a user belongs to no campaign yet, the overview shows the join-or-create screen (the one Nathan just used) instead.

## Routing and auth

- Signed out: home page shows the store window. The sign-in form is reachable from the big sign-up button and a Sign in link in the header.
- Signed in: home page shows the overview. The board keeps its own tab; nothing changes there.
- The account prompt appears only when a visitor tries to do something: join a campaign, start one, post, roll. Reading the store window never asks for an account.
- Sign-in persists across visits (already true). A returning user is never asked to sign in again unless they signed out or cleared the browser's saved data.

## What this reuses

- The gate screen (sign-in / join / create) becomes the auth screen behind the buttons, not the front door.
- The starter campaign carousel (already built) moves onto the store window.
- The board, dice, maps, log, characters, and music stay exactly where they are.
- Campaign data already carries campaign_id, so the overview reads the signed-in user's campaign and its recent messages, log entries, and characters.

## Build order

1. Home page shell with the two states (store window / overview).
2. Store window sections (name, what you can do, starter campaigns, public listings, why join, big sign-up button).
3. Overview sections (campaign, last few moves, party, quick way in).
4. Wire the sign-up / sign-in buttons to the existing auth screen; wire the join buttons to the account prompt.
5. Verify: signed-out visitor sees the store window and can browse without an account; signed-in user lands on the overview; returning user is not asked to sign in again.

## Open details for Nathan

- "Last few moves" count: three to five assumed. Say if he wants more or fewer.

Decided: public campaigns show on the store window (2026-11-27 ~01:46 PT); the last few moves show who went last, what they did, the outcome, and who's up next (2026-11-27 ~01:46 PT); the overview's campaign section shows what's going on in a glance, story summary from the Campaign State plus where the party is (2026-11-27 ~01:47 PT).

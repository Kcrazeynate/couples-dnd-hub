# The Quest Table — Business Plan (Hosted Service)

Planned for the business way: one hosted service where any group can run their own campaign with their own AI as DM. Launch on the free tiers; move to a paid server only when usage grows.

## The idea

A hosted campaign hub where any group can run their own tabletop RPG campaign with their own AI as DM. Sign up, create a campaign, invite your players, pick your AI DM, and play. No setup, no server, no code.

## Who it is for

- Groups who want to play D&D and tabletop RPGs with an AI DM.
- Groups who want a shared hub (board, log, characters, battle, maps, music) without setting up their own server.
- People who already use ChatGPT, Perplexity, Gemini, Claude, or another AI and want that AI to run their game.

## What it is (the product)

One hosted site (The Quest Table) where each group gets their own campaign space. Each campaign has: a message board, a campaign log, character sheets, companions, quests, NPCs, a dice roller, a battle tracker, maps (world and area), music, and an AI chat box.

The AI DM: each campaign picks its AI (ChatGPT, Perplexity, Gemini, Claude, and so on) and enters its own API key. The AI gets the campaign's state and log as context, plus the DM rules, and it narrates and runs the game.

Voice: dictate to the AI (speech-to-text) and hear the narration read aloud (text-to-speech), both in the browser.

## How it works (user journey)

1. Sign up (email).
2. Create a campaign (name, world, adventure).
3. Pick your AI DM and enter your API key (stored securely; only your campaign can use it).
4. Invite your players (link or email).
5. Play: board, log, characters, dice, battle, maps, music, AI chat.
6. The AI DM reads the campaign state and log, so it knows what is happening and can DM.

## Architecture

- Frontend: the existing hub (HTML, CSS, JS). For the business, host it on Cloudflare Pages (free, unlimited static requests and bandwidth). Do NOT use GitHub Pages for the business (GitHub's terms do not allow using Pages as free hosting for a commercial business) and do NOT use Vercel Hobby (non-commercial personal use only).
- Backend: Supabase (Postgres, Auth, Realtime, Edge Functions, Storage).
  - Multi-tenant: every row carries a campaign_id. Row Level Security (RLS) ensures a user only sees their own campaigns' data.
  - Auth: Supabase Auth (email and password, or magic link). Each user belongs to one or more campaigns with a role (DM, player).
  - Realtime: Supabase Realtime for the board, music, and battle.
  - Edge Functions: server-side work that cannot be done in the browser, for example calling an AI API with a key that must not be exposed to the browser.
- AI DM (BYOK, bring your own key):
  - Each campaign's DM enters their own API key for their chosen provider. The key is stored encrypted in the backend, never exposed to other users' browsers.
  - Providers: OpenAI (ChatGPT), Perplexity, Google (Gemini), Anthropic (Claude), or any provider with a chat API.
  - The AI gets: the campaign state (characters, quests, NPCs, places), the recent log and board, the DM instructions (the DM Code and rules), and the player's message. It replies as the DM.
  - "Rick" (Nathan's personal DM) is only for Nathan's campaign. Other groups use their own AI. Rick is Nathan's personal agent, not a shared service.
- Voice: dictation via the browser's Web Speech API; narration playback via the browser's speechSynthesis. Both client-side.

## Free hosting — yes, there is a free way

- Frontend: Cloudflare Pages. Free, unlimited static requests and bandwidth, 500 builds a month, 100 projects, 20,000 files per site, 25 MiB per file. Workers free tier: 100,000 requests a day.
- Backend: Supabase free tier. $0, 2 active projects, 500 MB database per project, 5 GB egress a month (plus 5 GB cached egress), 1 GB file storage, 50,000 monthly active users, 500,000 Edge Function invocations a month, 200 concurrent Realtime connections.
- AI usage: BYOK, so each group pays their own AI provider. Nathan pays nothing for AI calls.
- Total cost at launch: $0.

Caveats:

- Supabase free projects pause after 1 week of inactivity. Regular use keeps it awake. If it becomes a problem, Pro ($25 a month) never pauses.
- GitHub Pages and Vercel Hobby are NOT suitable for a business (GitHub Pages terms forbid commercial use; Vercel Hobby is non-commercial only). Use Cloudflare Pages.
- The free tier covers a launch with dozens of campaigns. When usage grows, upgrade Supabase Pro ($25 a month: 8 GB disk, 250 GB egress, 100,000 monthly active users, 2 million Edge Function invocations). That is the "launch to a server later" step, and you only pay when it grows.

## Business model

- Joining someone's game is always free. Players never pay to join.
- The host (the DM or campaign owner) pays for the tier. How many players can join depends on whether the host paid.
- Free tier: 1 campaign, up to 5 players, core features (board, log, characters, dice, battle, maps, music, AI chat with BYOK).
- Paid tier: more players, more campaigns, more storage, priority support, custom themes. Exact price still to be set.
- The price takes BYOK into account: each group pays for their own AI API usage, so the subscription only covers hosting and infrastructure, not AI calls. It is priced lower than a service that includes AI.
- Or: free for all while it is small, add paid tiers once there is demand. Do not charge until it is proven.

## Phases

- Phase 1, Multi-campaign (foundation): add campaign_id to all tables, RLS policies, Supabase Auth, campaign switching in the hub, campaign creation. Test with a second campaign to prove isolation.
- Phase 2, AI DM provider picker and BYOK: provider picker in the AI chat box, secure API key storage (encrypted), campaign context sent to the AI, DM instructions. Test with ChatGPT and Gemini.
- Phase 3, Onboarding: sign-up, create campaign, invite players (link or email), pick AI DM, guided setup. A new group goes from sign-up to playing in 10 minutes.
- Phase 4, Launch (free): deploy the frontend to Cloudflare Pages, backend on the Supabase free tier. Invite a few friendly groups to try it. Gather feedback.
- Phase 5, Scale: when usage grows, upgrade Supabase Pro ($25 a month), add paid tiers, move to a paid server if needed.

## Decisions locked (Nathan, 2026-11-25)

- The "Rick" DM: only for Nathan's campaign (BYOK only for others).
- Name and branding: the hosted service keeps the name "The Quest Table".
- Content: user campaigns are their own; the hub uses SRD content for rules. Avoid D&D trademarks in branding (already done).
- Moderation: basic moderation (abuse reporting). Adult-only campaigns with adult content are allowed; nothing illegal.
- Pricing model: joining someone's game is always free. How many players can join depends on whether the host paid. The price takes BYOK into account (each group pays for their own AI, so the subscription only covers hosting and infrastructure). Exact price still to be set.

## Decisions still needed (Nathan's calls)

- Exact paid tier price and player limits.

## Risks

- API key security: keys must be encrypted and never exposed to other users' browsers.
- Cost: if Nathan provides a shared AI key, he pays for all usage. BYOK avoids this.
- Scale: Supabase free tier limits (500 MB database, 5 GB egress, 50,000 monthly active users, 500,000 Edge Function invocations, 1-week inactivity pause). Monitor usage and upgrade before hitting limits.
- Wizards of the Coast: do not use D&D or Dungeons and Dragons in branding; SRD content only for rules.
- GitHub Pages and Vercel Hobby: not allowed for commercial use; use Cloudflare Pages for the business.

## Sources (hosting limits, checked November 2026)

- Supabase billing docs: https://supabase.com/docs/guides/platform/billing-on-supabase
- Supabase free tier limits, 2026: https://dev.to/nayankyada/supabase-pricing-2026-free-tier-limits-compute-costs-when-to-upgrade-52af
- Static hosting free tiers compared (Cloudflare Pages, Vercel Hobby, Netlify Free, GitHub Pages), November 2026: https://zenn.dev/yythzy/articles/free-hosting-static?locale=en
- Hosting free tiers side by side, checked September 2026: https://flaviocopes.com/hosting-free-tiers/

# D&D Campaign Hub

A shared hub for Nathan and Angela's couples D&D campaign. It is the bridge between the two Muses: a message board plus the campaign log, character sheets, quests, NPCs and places, a dice roller, and a battle tracker. Rick is the DM.

## Setup

Do these steps in order. Nothing here needs a paid account.

### 1. Create a free Supabase project

1. Go to https://supabase.com and sign up or sign in.
2. Click **New project**.
3. Pick a name, for example `dnd-hub`.
4. Set a database password and save it somewhere safe.
5. Pick the region closest to you and click **Create new project**.
6. Wait for the project to finish building.

### 2. Create the tables

1. In the Supabase dashboard, open the **SQL Editor** from the left menu.
2. Click **New query**.
3. Open the file `supabase-schema.sql` from this folder, copy all of it, and paste it into the query box.
4. Click **Run**. It should finish with no errors.

### 3. Copy the project URL and anon key

1. In the Supabase dashboard, open **Project Settings** (the gear icon), then **API**.
2. Copy the **Project URL**.
3. Copy the **anon public** key. Use the anon key, not the service role key.

### 4. Fill in config.js

1. Open `config.js` in this folder.
2. Replace `PASTE_SUPABASE_URL_HERE` with the Project URL from step 3.
3. Replace `PASTE_SUPABASE_ANON_KEY_HERE` with the anon key from step 3.
4. There is no passphrase any more. Sign-in is by email and password (Supabase Auth); accounts are created on the sign-in screen, and the DM role comes from campaign membership, not a passphrase.
5. Save the file.

### 5. Publish with GitHub Pages

1. Go to https://github.com and sign in. Create a new repository, for example `dnd-hub`. Make it public.
2. Upload all the files from this folder (`index.html`, `styles.css`, `app.js`, `config.js`, `supabase-schema.sql`, `README.md`) to the repository.
3. In the repository, open **Settings**, then **Pages**.
4. Under **Build and deployment**, set the source to **Deploy from a branch**, pick the `main` branch and the `/ (root)` folder, then save.
5. Wait a minute, then open the published link GitHub shows, for example `https://YOUR-USERNAME.github.io/dnd-hub/`.

### 6. How each Muse uses the site

1. Open the published link on a phone or computer.
2. Create an account with your email and password, or sign in. The first account to join the Nathan & Angela campaign becomes its owner; later accounts join as players. The sign-in lasts until you sign out.
3. Use the tabs:
   - **Board**: post and read messages. The board refreshes itself every 15 seconds, or tap Refresh.
   - **Campaign Log**: add session notes.
   - **Characters**: build each character with Edit, then use the HP plus and minus buttons during play. HP, hit dice, and death saves are DM-only; a player edits only their own sheet, and a new character waits for the DM to approve it.
   - **Quests**: add quests, mark them Done, or delete them. Quests are DM-only.
   - **NPCs & Places**: add people met and places visited.
   - **Dice**: pick a die, a modifier, and Normal, Advantage, or Disadvantage, then Roll. Every roll is saved to the roll log.
   - **Battle**: add combatants with initiative and HP. The list sorts highest initiative first. Tap Next Turn to move the highlight down the list. Combat is DM-only to change.
4. To check for new messages, open the link and look at the Board.

## Privacy note

Sign-in is by account, but the database rules are still public until the membership rules land (Phase 1 Step 3): anyone who can reach the site and create an account can read the data for now. Do not share the link outside the campaign, and do not store anything sensitive here.

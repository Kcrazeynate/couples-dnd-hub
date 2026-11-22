-- Couples D and D hub schema.
-- Run this whole file once in the Supabase SQL editor.
--
-- Row Level Security is on, with permissive policies for the anon role.
-- This is intentional: the data is protected by the unguessable published URL
-- plus the passphrase gate in the site, not by per-user accounts.
-- Do not store anything sensitive here.

-- Board messages
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  author text not null,
  body text not null,
  created_at timestamptz not null default now()
);

-- Campaign log entries
create table if not exists log_entries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

-- Player characters, one row per player (nathan or angela)
create table if not exists characters (
  id uuid primary key default gen_random_uuid(),
  player text not null unique,
  name text,
  race text,
  class text,
  background text,
  skills text,
  level integer,
  hp integer,
  max_hp integer,
  ac integer,
  str integer,
  dex integer,
  con integer,
  int integer,
  wis integer,
  cha integer,
  gold integer,
  inventory text,
  notes text,
  image_url text,
  updated_at timestamptz not null default now()
);

-- Quests
create table if not exists quests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'Active',
  created_at timestamptz not null default now()
);

-- NPCs and places
create table if not exists npcs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'NPC',
  notes text,
  created_at timestamptz not null default now()
);

-- Saved dice rolls
create table if not exists rolls (
  id uuid primary key default gen_random_uuid(),
  roller text not null,
  label text not null,
  result integer not null,
  detail text not null,
  created_at timestamptz not null default now()
);

-- Battle combatants
create table if not exists combatants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  initiative integer not null default 0,
  hp integer not null default 0,
  max_hp integer not null default 1,
  note text,
  created_at timestamptz not null default now()
);

-- API access: let the anon role use these tables through the Data API.
-- Without these grants the site cannot reach the tables at all.
grant select, insert, update, delete on messages to anon;
grant select, insert, update, delete on log_entries to anon;
grant select, insert, update, delete on characters to anon;
grant select, insert, update, delete on quests to anon;
grant select, insert, update, delete on npcs to anon;
grant select, insert, update, delete on rolls to anon;
grant select, insert, update, delete on combatants to anon;

-- Row Level Security: on for every table, open to the anon role.
alter table messages enable row level security;
alter table log_entries enable row level security;
alter table characters enable row level security;
alter table quests enable row level security;
alter table npcs enable row level security;
alter table rolls enable row level security;
alter table combatants enable row level security;

create policy "Public read" on messages for select using (true);
create policy "Public insert" on messages for insert with check (true);
create policy "Public update" on messages for update using (true) with check (true);
create policy "Public delete" on messages for delete using (true);

create policy "Public read" on log_entries for select using (true);
create policy "Public insert" on log_entries for insert with check (true);
create policy "Public update" on log_entries for update using (true) with check (true);
create policy "Public delete" on log_entries for delete using (true);

create policy "Public read" on characters for select using (true);
create policy "Public insert" on characters for insert with check (true);
create policy "Public update" on characters for update using (true) with check (true);
create policy "Public delete" on characters for delete using (true);

create policy "Public read" on quests for select using (true);
create policy "Public insert" on quests for insert with check (true);
create policy "Public update" on quests for update using (true) with check (true);
create policy "Public delete" on quests for delete using (true);

create policy "Public read" on npcs for select using (true);
create policy "Public insert" on npcs for insert with check (true);
create policy "Public update" on npcs for update using (true) with check (true);
create policy "Public delete" on npcs for delete using (true);

create policy "Public read" on rolls for select using (true);
create policy "Public insert" on rolls for insert with check (true);
create policy "Public update" on rolls for update using (true) with check (true);
create policy "Public delete" on rolls for delete using (true);

create policy "Public read" on combatants for select using (true);
create policy "Public insert" on combatants for insert with check (true);
create policy "Public update" on combatants for update using (true) with check (true);
create policy "Public delete" on combatants for delete using (true);

-- Live updates (Realtime): run these lines once in the SQL editor so new
-- rows appear on the hub instantly while the page is open. Until then the
-- board still refreshes on its own every 15 seconds.
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table log_entries;
alter publication supabase_realtime add table characters;
alter publication supabase_realtime add table quests;
alter publication supabase_realtime add table npcs;
alter publication supabase_realtime add table rolls;
alter publication supabase_realtime add table combatants;

-- Maps, fog of war, and place markers.
-- A map is one world or plane (for example The World, or The Feywild).
-- map_cells stores which grid squares have been revealed; any square with
-- no row, or revealed false, stays covered by fog. map_markers are the
-- places found on a map.
create table if not exists maps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text,
  created_at timestamptz not null default now()
);

create table if not exists map_cells (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references maps(id) on delete cascade,
  x int not null,
  y int not null,
  revealed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (map_id, x, y)
);

create table if not exists map_markers (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references maps(id) on delete cascade,
  x int not null,
  y int not null,
  label text not null,
  kind text not null default 'Place',
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on maps to anon;
grant select, insert, update, delete on map_cells to anon;
grant select, insert, update, delete on map_markers to anon;

alter table maps enable row level security;
alter table map_cells enable row level security;
alter table map_markers enable row level security;

create policy "Public read" on maps for select using (true);
create policy "Public insert" on maps for insert with check (true);
create policy "Public update" on maps for update using (true) with check (true);
create policy "Public delete" on maps for delete using (true);

create policy "Public read" on map_cells for select using (true);
create policy "Public insert" on map_cells for insert with check (true);
create policy "Public update" on map_cells for update using (true) with check (true);
create policy "Public delete" on map_cells for delete using (true);

create policy "Public read" on map_markers for select using (true);
create policy "Public insert" on map_markers for insert with check (true);
create policy "Public update" on map_markers for update using (true) with check (true);
create policy "Public delete" on map_markers for delete using (true);

alter publication supabase_realtime add table maps;
alter publication supabase_realtime add table map_cells;
alter publication supabase_realtime add table map_markers;
-- Push subscriptions for hub notifications (added 2026-11-21)
-- Run this in the Supabase SQL editor, same as the other hub blocks.
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
grant select, insert, update, delete on push_subscriptions to anon;
drop policy if exists "anon all" on push_subscriptions;
create policy "anon all" on push_subscriptions for all using (true) with check (true);
-- Character sheet rework (2026-11-21): real-sheet fields + log entry effects
-- Run this in the Supabase SQL editor, same as the other hub blocks.
alter table characters add column if not exists attacks text;
alter table characters add column if not exists spells text;
alter table characters add column if not exists features text;
alter table characters add column if not exists personality_traits text;
alter table characters add column if not exists ideals text;
alter table characters add column if not exists bonds text;
alter table characters add column if not exists flaws text;
alter table characters add column if not exists xp integer;
alter table characters add column if not exists alignment text;

create table if not exists log_effects (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references log_entries(id),
  target text not null,
  kind text not null,
  amount integer,
  item text,
  created_at timestamptz not null default now()
);
alter table log_effects enable row level security;
grant select, insert, update, delete on log_effects to anon;
drop policy if exists "anon all" on log_effects;
create policy "anon all" on log_effects for all using (true) with check (true);
alter table characters add column if not exists temp_hp integer;
alter table characters add column if not exists hit_dice_used integer;
alter table characters add column if not exists death_save_successes integer;
alter table characters add column if not exists death_save_failures integer;
-- NPC companions: dismissal flag + join mode on characters, mechanics flag on log entries.
-- Run this in the Supabase SQL editor (same project as the hub).
alter table characters add column if not exists dismissed boolean default false;
alter table characters add column if not exists join_mode text;
alter table log_entries add column if not exists is_mechanics boolean default false;
create table if not exists party_locations (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references log_entries(id),
  label text not null,
  marker_id uuid not null references map_markers(id),
  created_at timestamptz not null default now()
);
alter table party_locations enable row level security;
grant select, insert, update, delete on party_locations to anon;
drop policy if exists "anon all" on party_locations;
create policy "anon all" on party_locations for all using (true) with check (true);
create table if not exists party_locations (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references log_entries(id),
  label text not null,
  marker_id uuid not null references map_markers(id),
  created_at timestamptz not null default now()
);
alter table party_locations enable row level security;
grant select, insert, update, delete on party_locations to anon;
drop policy if exists "anon all" on party_locations;
create policy "anon all" on party_locations for all using (true) with check (true);

alter table map_markers add column if not exists visited boolean default false;
alter table map_markers add column if not exists area_map_url text;
update map_markers set visited = true where label <> 'The ruins north of Riverton';
update map_markers set area_map_url = 'https://kcrazeynate.github.io/couples-dnd-hub/assets/area-ruins.jpg' where label = 'The ruins north of Riverton';
alter table npcs add column if not exists area_map_url text;
alter table npcs add column if not exists visited boolean default false;
update npcs set visited = true where kind = 'Place' and name <> 'The ruins north of Riverton';
update npcs set area_map_url = 'https://kcrazeynate.github.io/couples-dnd-hub/assets/area-lantern-inn.jpg' where name = 'The Lantern Inn';
update npcs set area_map_url = 'https://kcrazeynate.github.io/couples-dnd-hub/assets/area-gilded-boar.jpg' where name = 'The Gilded Boar';
update npcs set area_map_url = 'https://kcrazeynate.github.io/couples-dnd-hub/assets/area-watchtower.jpg' where name = 'The watchtower ruins';
update map_markers set area_map_url = 'https://kcrazeynate.github.io/couples-dnd-hub/assets/area-tollhouse.jpg' where label = 'Toll house';
alter table log_entries add column if not exists area_map_url text;
create table if not exists battle_state (
  id integer primary key default 1,
  current_combatant_id uuid references combatants(id) on delete set null,
  round integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table battle_state enable row level security;
grant select, insert, update, delete on battle_state to anon;
drop policy if exists "anon all" on battle_state;
create policy "anon all" on battle_state for all using (true) with check (true);
insert into battle_state (id, current_combatant_id, round) values (1, null, 1) on conflict (id) do nothing;
alter table battle_state add column if not exists area_map_url text;
update battle_state set area_map_url = 'https://kcrazeynate.github.io/couples-dnd-hub/assets/area-forest-road.jpg' where id = 1;

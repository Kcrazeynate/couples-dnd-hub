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

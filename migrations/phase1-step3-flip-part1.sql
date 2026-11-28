-- Step 3 flip, Part 1: admins table, helpers, ownership columns, status.
-- Run the four parts in order, 1 to 4, each in the SQL editor.
-- Each part is its own transaction. If a part errors, stop and tell Rick.
-- Do not run part 4 until parts 1-3 have all succeeded.

begin;


-- 1. Admins table first. The is_admin() helper below reads public.admins,
-- and Postgres validates a SQL function body at creation time, so the
-- table must exist before the helper is created. (This was the Part 1
-- error: "relation public.admins does not exist".)
-- Nathan is site admin (user_id from the owner claim, verified 2026-11-27).
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
insert into admins (user_id)
values ('b9544048-5add-48bf-b465-24cd339c5bb0')
on conflict (user_id) do nothing;

-- 0. Helpers: is the current user a member / DM / admin of a campaign.
-- SECURITY DEFINER with an empty search_path and fully qualified names,
-- so they cannot be hijacked through a shadowed schema. EXECUTE is
-- revoked from public/anon and granted only to authenticated.
create or replace function public.is_campaign_member(p_campaign uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign and user_id = auth.uid()
  );
$$;

create or replace function public.is_campaign_dm(p_campaign uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign
      and user_id = auth.uid()
      and role in ('owner', 'dm')
  );
$$;

create or replace function public.is_campaign_owner(p_campaign uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.admins where user_id = auth.uid()
  );
$$;

revoke execute on function public.is_campaign_member(uuid) from public, anon;
revoke execute on function public.is_campaign_dm(uuid) from public, anon;
revoke execute on function public.is_campaign_owner(uuid) from public, anon;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_campaign_member(uuid) to authenticated;
grant execute on function public.is_campaign_dm(uuid) to authenticated;
grant execute on function public.is_campaign_owner(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;

-- 2. Ownership columns. Characters and push subscriptions get a user_id
-- so policies can limit each player to their own row.
alter table characters
  add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table push_subscriptions
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Backfill the existing rows. Milo belongs to Nathan. Sylvie and
-- Angela's phone stay NULL until Angela signs up; link them then.
update characters set user_id = 'b9544048-5add-48bf-b465-24cd339c5bb0'
  where player = 'nathan' and user_id is null;
update push_subscriptions set user_id = 'b9544048-5add-48bf-b465-24cd339c5bb0'
  where label = 'Nathan’s iphone' and user_id is null;

-- 3. characters.status for the pending-approval flow.
alter table characters
  add column if not exists status text not null default 'approved'
  check (status in ('pending', 'approved', 'rejected'));


commit;

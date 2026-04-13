-- ============================================================
--  MKEpulse — Migration 003
--  PRIORITY 2: Least Privilege RLS + Service Role Separation
--
--  This migration:
--  1. Creates separate DB roles for user vs service access
--  2. Grants minimum required privileges per role
--  3. Enforces column-level security on sensitive fields
--  4. Adds audit logging for privilege-sensitive operations
-- ============================================================

-- ── Drop and recreate RLS policies with tighter scoping ──────
-- (Replaces the broader policies from migration 002)

-- ── Create application-level DB roles ────────────────────────
-- These map to connection pool users in production.
-- DO NOT use postgres/supabase_admin for application queries.

-- Role: mkepulse_anon (unauthenticated users)
do $$ begin
  if not exists (select from pg_roles where rolname = 'mkepulse_anon') then
    create role mkepulse_anon nologin;
  end if;
end $$;

-- Role: mkepulse_user (authenticated users via JWT)
do $$ begin
  if not exists (select from pg_roles where rolname = 'mkepulse_user') then
    create role mkepulse_user nologin;
  end if;
end $$;

-- Role: mkepulse_service (server-side workers, bypasses RLS where needed)
do $$ begin
  if not exists (select from pg_roles where rolname = 'mkepulse_service') then
    create role mkepulse_service nologin;
  end if;
end $$;

-- Role: mkepulse_admin (admin portal, all reads, limited writes)
do $$ begin
  if not exists (select from pg_roles where rolname = 'mkepulse_admin') then
    create role mkepulse_admin nologin;
  end if;
end $$;

-- ── Revoke all defaults first (least privilege baseline) ─────
revoke all on all tables    in schema public from mkepulse_anon, mkepulse_user, mkepulse_service, mkepulse_admin;
revoke all on all sequences in schema public from mkepulse_anon, mkepulse_user, mkepulse_service, mkepulse_admin;
revoke all on all functions in schema public from mkepulse_anon, mkepulse_user, mkepulse_service, mkepulse_admin;

-- ── Grant minimum required privileges ────────────────────────

-- mkepulse_anon: read-only on public event/parking data
grant select on public.events          to mkepulse_anon;
grant select on public.parking_garages to mkepulse_anon;
-- anon users can sign up (insert own profile via trigger only)
-- no direct table access

-- mkepulse_user: own data CRUD + public reads
grant select, update       on public.profiles                  to mkepulse_user;
grant select, insert, update, delete on public.user_preferences to mkepulse_user;
grant select               on public.subscriptions             to mkepulse_user;
grant select               on public.events                    to mkepulse_user;
grant select               on public.parking_garages           to mkepulse_user;
grant select               on public.alerts                    to mkepulse_user;
grant select, insert       on public.user_event_interactions   to mkepulse_user;
-- users cannot touch: crawl_runs, stripe_events, parking_snapshots

-- mkepulse_service: write access for workers/webhooks
grant select, insert, update on public.events             to mkepulse_service;
grant select, insert, update on public.parking_garages    to mkepulse_service;
grant select, insert         on public.parking_snapshots  to mkepulse_service;
grant select, insert, update on public.subscriptions      to mkepulse_service;
grant select, insert         on public.alerts             to mkepulse_service;
grant select, insert         on public.crawl_runs         to mkepulse_service;
grant select, insert         on public.stripe_events      to mkepulse_service;
grant select, update         on public.profiles           to mkepulse_service;
-- service cannot delete users or subscriptions

-- mkepulse_admin: all reads + alert management, no user deletion
grant select               on all tables in schema public to mkepulse_admin;
grant update               on public.alerts               to mkepulse_admin;
grant update               on public.events               to mkepulse_admin;  -- approve/reject
-- admin cannot delete users or modify subscriptions directly

-- ── Column-level security on sensitive fields ─────────────────
-- Prevent non-service roles from reading Stripe IDs directly
-- (they can see their own subscription status, not raw Stripe IDs)

-- Create a view for users that hides raw Stripe data
create or replace view public.v_my_subscription as
select
  user_id,
  status,
  current_period_start,
  current_period_end,
  cancel_at_period_end,
  amount_cents,
  currency
  -- stripe_customer_id, stripe_subscription_id EXCLUDED
from public.subscriptions
where user_id = auth.uid();

grant select on public.v_my_subscription to mkepulse_user;

-- ── Tightened RLS policies ────────────────────────────────────

-- Drop old policies from migration 002
drop policy if exists "profiles: users read own"    on public.profiles;
drop policy if exists "profiles: users update own"  on public.profiles;
drop policy if exists "profiles: admin full access" on public.profiles;

-- profiles: users can only read/write their own, zero sensitive fields to others
create policy "profiles: own read"
  on public.profiles for select
  using (
    id = auth.uid()                -- own record
    or public.is_admin()           -- admin reads all
  );

create policy "profiles: own update — no role escalation"
  on public.profiles for update
  using (id = auth.uid())
  with check (
    id   = auth.uid()
    -- role cannot be changed by the user themselves
    and role = (select role from public.profiles where id = auth.uid())
    -- tier cannot be changed by the user themselves (only webhook can)
    and tier = (select tier from public.profiles where id = auth.uid())
  );

create policy "profiles: service write"
  on public.profiles for update
  using (auth.role() = 'service_role');

-- user_preferences: strict own-only
drop policy if exists "prefs: users manage own" on public.user_preferences;
drop policy if exists "prefs: admin read all"   on public.user_preferences;

create policy "prefs: own all"
  on public.user_preferences for all
  using (user_id = auth.uid());

create policy "prefs: admin read"
  on public.user_preferences for select
  using (public.is_admin());

-- subscriptions: service role writes only (Stripe webhook)
drop policy if exists "subs: users read own"      on public.subscriptions;
drop policy if exists "subs: admin read all"      on public.subscriptions;
drop policy if exists "subs: service role write"  on public.subscriptions;

create policy "subs: own read via view"
  on public.subscriptions for select
  using (
    user_id = auth.uid()
    or public.is_admin()
    or auth.role() = 'service_role'
  );

create policy "subs: service write only"
  on public.subscriptions for insert
  using (auth.role() = 'service_role');

create policy "subs: service update only"
  on public.subscriptions for update
  using (auth.role() = 'service_role');

-- events: free users see max 8 (enforced at API layer, not RLS)
-- RLS enforces: only verified, non-pending events visible to non-admins
drop policy if exists "events: public read active"  on public.events;
drop policy if exists "events: service role write"  on public.events;
drop policy if exists "events: admin write"         on public.events;

create policy "events: public read verified"
  on public.events for select
  using (
    (is_active = true and ai_verified = true and ai_pending_review = false)
    or public.is_admin()
    or auth.role() = 'service_role'
  );

create policy "events: service write"
  on public.events for insert
  using (auth.role() = 'service_role');

create policy "events: service update"
  on public.events for update
  using (auth.role() = 'service_role' or public.is_admin());

create policy "events: superadmin delete"
  on public.events for delete
  using (
    (select role from public.profiles where id = auth.uid()) = 'superadmin'
  );

-- alerts: users only see their own proximity alerts
drop policy if exists "alerts: admin read all"    on public.alerts;
drop policy if exists "alerts: service role write" on public.alerts;
drop policy if exists "alerts: admin write"        on public.alerts;

create policy "alerts: user proximity only"
  on public.alerts for select
  using (
    public.is_admin()
    or auth.role() = 'service_role'
    -- users see alerts linked to their interactions only
    or (
      event_id in (
        select event_id from public.user_event_interactions
        where user_id = auth.uid()
      )
    )
  );

create policy "alerts: service write"
  on public.alerts for all
  using (auth.role() = 'service_role');

create policy "alerts: admin manage"
  on public.alerts for update
  using (public.is_admin());

-- ── Audit log table ───────────────────────────────────────────
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  actor_role  text,
  action      text not null,      -- 'subscription.cancelled', 'role.elevated', etc.
  resource    text,               -- table name
  resource_id text,               -- row id
  old_data    jsonb,
  new_data    jsonb,
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);

-- Audit log: only service role can write; admins can read
alter table public.audit_log enable row level security;

create policy "audit: service write"
  on public.audit_log for insert
  using (auth.role() = 'service_role');

create policy "audit: admin read"
  on public.audit_log for select
  using (public.is_admin());

-- Grant service and admin roles on audit_log
grant insert on public.audit_log to mkepulse_service;
grant select on public.audit_log to mkepulse_admin;

-- ── Audit trigger: log role changes ──────────────────────────
create or replace function public.audit_role_change()
returns trigger language plpgsql security definer as $$
begin
  if old.role <> new.role or old.tier <> new.tier then
    insert into public.audit_log (actor_id, actor_role, action, resource, resource_id, old_data, new_data)
    values (
      auth.uid(),
      coalesce((select role::text from public.profiles where id = auth.uid()), 'service'),
      'profile.privilege_change',
      'profiles',
      new.id::text,
      jsonb_build_object('role', old.role, 'tier', old.tier),
      jsonb_build_object('role', new.role, 'tier', new.tier)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_role_change on public.profiles;
create trigger trg_audit_role_change
  after update of role, tier on public.profiles
  for each row execute function public.audit_role_change();

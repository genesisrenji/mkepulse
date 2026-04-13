-- ============================================================
--  MKEpulse — Core Schema
--  Migration 001: Users, Subscriptions, Events, Parking, Alerts
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "postgis";          -- geo distance queries

-- ── Enums ───────────────────────────────────────────────────
create type user_tier        as enum ('free', 'pro');
create type user_role        as enum ('user', 'admin', 'superadmin');
create type sub_status       as enum ('active', 'cancelled', 'past_due', 'trialing');
create type event_category   as enum ('concerts', 'food', 'sports', 'arts', 'family', 'community');
create type event_source     as enum ('ticketmaster', 'eventbrite', 'instagram', 'onmilwaukee', 'milwaukee_com', 'visit_milwaukee', 'manual');
create type notif_frequency  as enum ('realtime', 'smart', 'daily', 'weekly');
create type alert_severity   as enum ('info', 'warning', 'critical');
create type parking_status   as enum ('available', 'limited', 'full', 'closed', 'unknown');

-- ============================================================
--  TABLE: profiles
--  Extended user data linked to auth.users (Supabase Auth)
-- ============================================================
create table public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  email            text unique not null,
  display_name     text,
  avatar_url       text,
  tier             user_tier    not null default 'free',
  role             user_role    not null default 'user',
  created_at       timestamptz  not null default now(),
  updated_at       timestamptz  not null default now(),
  last_seen_at     timestamptz,
  -- geo
  last_lat         double precision,
  last_lng         double precision,
  last_location_at timestamptz
);

comment on table public.profiles is
  'Extended profile data for every authenticated user, 1:1 with auth.users.';

-- ── Trigger: keep updated_at current ────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1))
  );
  return new;
end;
$$;

create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
--  TABLE: user_preferences
--  Onboarding quiz answers + filter settings per user
-- ============================================================
create table public.user_preferences (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  -- interests (onboarding Q1)
  categories        event_category[]  not null default '{}',
  -- budget (onboarding Q2)
  budget_max        integer,           -- null = no limit, 0 = free only
  include_free      boolean not null default true,
  flash_deals_only  boolean not null default false,
  -- location (onboarding Q3)
  neighborhoods     text[]  not null default '{}',
  geo_radius_miles  numeric(4,1) not null default 3.0,
  -- group / age (onboarding Q4)
  group_type        text,              -- 'solo' | 'partner' | 'friends' | 'family'
  age_filter        text,              -- 'all' | '18plus' | '21plus'
  -- notifications (onboarding Q5)
  notif_frequency   notif_frequency not null default 'smart',
  push_enabled      boolean not null default true,
  -- parking
  parking_alerts    boolean not null default true,
  max_parking_walk  integer not null default 10, -- minutes
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id)
);

create trigger trg_prefs_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- ============================================================
--  TABLE: subscriptions
--  Stripe subscription tracking (webhooks write here)
-- ============================================================
create table public.subscriptions (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references public.profiles(id) on delete cascade,
  stripe_customer_id    text unique,
  stripe_subscription_id text unique,
  stripe_price_id       text,
  status                sub_status not null default 'trialing',
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  cancel_at_period_end  boolean not null default false,
  amount_cents          integer not null default 414,  -- $4.14
  currency              text not null default 'usd',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id)
);

create trigger trg_subs_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Sync tier on profile when subscription status changes
create or replace function public.sync_user_tier()
returns trigger language plpgsql security definer as $$
begin
  update public.profiles
  set    tier = case when new.status = 'active' then 'pro'::user_tier else 'free'::user_tier end
  where  id   = new.user_id;
  return new;
end;
$$;

create trigger trg_sync_tier
  after insert or update of status on public.subscriptions
  for each row execute function public.sync_user_tier();

-- ============================================================
--  TABLE: events
--  All Milwaukee events, sourced from AI crawl agent
-- ============================================================
create table public.events (
  id               uuid primary key default uuid_generate_v4(),
  -- identity
  external_id      text,              -- source system ID for deduplication
  source           event_source not null,
  source_url       text,
  -- content
  title            text not null,
  description      text,
  category         event_category not null,
  venue_name       text not null,
  address          text,
  neighborhood     text,
  -- geo (PostGIS point: lng, lat)
  location         geography(Point, 4326),
  lat              double precision,
  lng              double precision,
  -- time
  starts_at        timestamptz not null,
  ends_at          timestamptz,
  -- cost
  price_min        numeric(8,2),      -- 0 = free
  price_max        numeric(8,2),
  -- live data (updated by crawl agent + check-in system)
  capacity_total   integer,
  capacity_pct     integer,           -- 0-100
  crowd_count      integer default 0,
  is_live          boolean not null default false,
  is_flash_deal    boolean not null default false,
  flash_deal_ends  timestamptz,
  -- ai metadata
  ai_confidence    numeric(3,2),      -- 0.00-1.00
  ai_verified      boolean not null default false,
  ai_pending_review boolean not null default false,
  -- status
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- dedup: one event per source+external_id
  unique (source, external_id)
);

create trigger trg_events_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- Geo index for fast distance queries
create index idx_events_location   on public.events using gist(location);
create index idx_events_starts_at  on public.events(starts_at);
create index idx_events_category   on public.events(category);
create index idx_events_active     on public.events(is_active) where is_active = true;
create index idx_events_flash      on public.events(is_flash_deal) where is_flash_deal = true;

-- ============================================================
--  TABLE: parking_garages
--  Static garage/lot registry (seeded once, updated by API)
-- ============================================================
create table public.parking_garages (
  id               uuid primary key default uuid_generate_v4(),
  name             text not null,
  address          text,
  neighborhood     text,
  location         geography(Point, 4326),
  lat              double precision,
  lng              double precision,
  -- capacity
  total_spaces     integer not null default 0,
  available_spaces integer not null default 0,
  status           parking_status not null default 'unknown',
  -- rate
  hourly_rate_cents integer,          -- null = variable/event pricing
  daily_max_cents   integer,
  event_rate_cents  integer,
  -- api linkage
  mke_open_data_id  text unique,      -- City of Milwaukee Open Data ID
  spothero_id       text,
  parkmobile_id     text,
  -- meta
  operator          text,
  phone             text,
  accepts_credit    boolean default true,
  is_covered        boolean default true,
  is_active         boolean not null default true,
  last_api_sync     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger trg_parking_updated_at
  before update on public.parking_garages
  for each row execute function public.set_updated_at();

create index idx_parking_location on public.parking_garages using gist(location);
create index idx_parking_status   on public.parking_garages(status);

-- ============================================================
--  TABLE: parking_snapshots
--  Time-series availability log (every 2-min poll)
-- ============================================================
create table public.parking_snapshots (
  id               bigint generated always as identity primary key,
  garage_id        uuid not null references public.parking_garages(id) on delete cascade,
  available_spaces integer not null,
  total_spaces     integer not null,
  status           parking_status not null,
  recorded_at      timestamptz not null default now()
);

create index idx_pk_snap_garage   on public.parking_snapshots(garage_id, recorded_at desc);
create index idx_pk_snap_time     on public.parking_snapshots(recorded_at desc);

-- Auto-drop snapshots older than 7 days (keep history lean)
create or replace function public.purge_old_snapshots()
returns void language sql as $$
  delete from public.parking_snapshots
  where recorded_at < now() - interval '7 days';
$$;

-- ============================================================
--  TABLE: alerts
--  System alerts: capacity, parking, AI events, flash deals
-- ============================================================
create table public.alerts (
  id               uuid primary key default uuid_generate_v4(),
  severity         alert_severity not null default 'info',
  title            text not null,
  description      text,
  -- optional links
  event_id         uuid references public.events(id) on delete set null,
  garage_id        uuid references public.parking_garages(id) on delete set null,
  -- admin workflow
  is_resolved      boolean not null default false,
  resolved_at      timestamptz,
  resolved_by      uuid references public.profiles(id) on delete set null,
  requires_approval boolean not null default false,
  approved_at      timestamptz,
  approved_by      uuid references public.profiles(id) on delete set null,
  -- push
  push_sent        boolean not null default false,
  push_sent_at     timestamptz,
  push_recipient_count integer default 0,
  created_at       timestamptz not null default now()
);

create index idx_alerts_unresolved on public.alerts(is_resolved) where is_resolved = false;
create index idx_alerts_severity   on public.alerts(severity);
create index idx_alerts_created    on public.alerts(created_at desc);

-- ============================================================
--  TABLE: crawl_runs
--  Audit log for every AI agent crawl cycle
-- ============================================================
create table public.crawl_runs (
  id               bigint generated always as identity primary key,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  duration_ms      integer,
  events_found     integer default 0,
  events_new       integer default 0,
  events_updated   integer default 0,
  events_skipped   integer default 0,
  sources_ok       text[] default '{}',
  sources_failed   text[] default '{}',
  error_detail     jsonb
);

-- ============================================================
--  TABLE: user_event_interactions
--  Tracks saves, views, checkins — feeds recommendation engine
-- ============================================================
create table public.user_event_interactions (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  event_id         uuid not null references public.events(id) on delete cascade,
  action           text not null,     -- 'view' | 'save' | 'checkin' | 'dismiss'
  created_at       timestamptz not null default now(),
  unique (user_id, event_id, action)
);

create index idx_interactions_user  on public.user_event_interactions(user_id);
create index idx_interactions_event on public.user_event_interactions(event_id);

-- ============================================================
--  VIEWS
-- ============================================================

-- Live events with distance from a given point (used by API)
create or replace view public.v_active_events as
select
  e.*,
  round(e.capacity_pct::numeric, 0)                   as cap_pct_rounded,
  case
    when e.price_min = 0 or e.price_min is null then true
    else false
  end                                                  as is_free,
  case
    when e.capacity_pct >= 90 then 'critical'
    when e.capacity_pct >= 70 then 'high'
    when e.capacity_pct >= 40 then 'moderate'
    else 'low'
  end                                                  as crowd_level
from public.events e
where e.is_active = true
  and e.ai_verified = true
  and e.starts_at > now() - interval '2 hours'
  and e.starts_at < now() + interval '24 hours';

-- Parking summary with fill percentage
create or replace view public.v_parking_live
-- ============================================================
--  MKEpulse — Migration 002
--  Subscriptions, preferences, feed scoring, RLS policies
-- ============================================================

-- ── Row Level Security ───────────────────────────────────────
alter table public.profiles           enable row level security;
alter table public.user_preferences   enable row level security;
alter table public.subscriptions      enable row level security;
alter table public.events             enable row level security;
alter table public.parking_garages    enable row level security;
alter table public.alerts             enable row level security;
alter table public.user_event_interactions enable row level security;

-- ── Helper: current user tier ───────────────────────────────
create or replace function public.current_user_tier()
returns user_tier language sql security definer stable as $$
  select tier from public.profiles where id = auth.uid();
$$;

-- ── Helper: current user role ───────────────────────────────
create or replace function public.current_user_role()
returns user_role language sql security definer stable as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ── Helper: is admin ─────────────────────────────────────────
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select coalesce(
    (select role in ('admin','superadmin')
     from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ── Helper: is pro ───────────────────────────────────────────
create or replace function public.is_pro()
returns boolean language sql security definer stable as $$
  select coalesce(
    (select tier = 'pro' from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ============================================================
--  RLS POLICIES — profiles
-- ============================================================
create policy "profiles: users read own"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

create policy "profiles: users update own"
  on public.profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    -- prevent self-promotion to admin
    and (role = (select role from public.profiles where id = auth.uid()))
  );

create policy "profiles: admin full access"
  on public.profiles for all
  using (public.is_admin());

-- ============================================================
--  RLS POLICIES — user_preferences
-- ============================================================
create policy "prefs: users manage own"
  on public.user_preferences for all
  using (user_id = auth.uid());

create policy "prefs: admin read all"
  on public.user_preferences for select
  using (public.is_admin());

-- ============================================================
--  RLS POLICIES — subscriptions
-- ============================================================
create policy "subs: users read own"
  on public.subscriptions for select
  using (user_id = auth.uid());

create policy "subs: admin read all"
  on public.subscriptions for select
  using (public.is_admin());

-- Only service role can write subscriptions (Stripe webhook)
create policy "subs: service role write"
  on public.subscriptions for all
  using (auth.role() = 'service_role');

-- ============================================================
--  RLS POLICIES — events
-- ============================================================
-- Free users: max 8 events (enforced via API, not RLS)
-- RLS: everyone reads active+verified; admin reads all
create policy "events: public read active"
  on public.events for select
  using (
    (is_active = true and ai_verified = true and ai_pending_review = false)
    or public.is_admin()
  );

create policy "events: service role write"
  on public.events for all
  using (auth.role() = 'service_role');

create policy "events: admin write"
  on public.events for all
  using (public.is_admin());

-- ============================================================
--  RLS POLICIES — parking_garages
-- ============================================================
create policy "parking: public read"
  on public.parking_garages for select
  using (is_active = true or public.is_admin());

create policy "parking: service role write"
  on public.parking_garages for all
  using (auth.role() = 'service_role');

-- ============================================================
--  RLS POLICIES — alerts
-- ============================================================
create policy "alerts: admin read all"
  on public.alerts for select
  using (public.is_admin());

create policy "alerts: service role write"
  on public.alerts for all
  using (auth.role() = 'service_role');

create policy "alerts: admin write"
  on public.alerts for all
  using (public.is_admin());

-- ============================================================
--  RLS POLICIES — interactions
-- ============================================================
create policy "interactions: users manage own"
  on public.user_event_interactions for all
  using (user_id = auth.uid());

create policy "interactions: admin read all"
  on public.user_event_interactions for select
  using (public.is_admin());

-- ============================================================
--  TABLE: stripe_events
--  Idempotency log — prevent double-processing webhooks
-- ============================================================
create table public.stripe_events (
  id            text primary key,  -- Stripe event ID (evt_xxx)
  type          text not null,
  processed_at  timestamptz not null default now(),
  payload       jsonb
);

-- ============================================================
--  FUNCTION: score_event_for_user
--  Returns a relevance score (0.0–1.0) for a given
--  user+event pair based on their preference profile.
--  Used by the feed filter pipeline.
-- ============================================================
create or replace function public.score_event_for_user(
  p_user_id   uuid,
  p_event_id  uuid,
  p_user_lat  double precision default null,
  p_user_lng  double precision default null
)
returns numeric language plpgsql security definer stable as $$
declare
  v_prefs   public.user_preferences%rowtype;
  v_event   public.events%rowtype;
  v_score   numeric := 0.0;
  v_dist_mi numeric;
begin
  -- fetch preferences and event
  select * into v_prefs from public.user_preferences  where user_id  = p_user_id  limit 1;
  select * into v_event from public.events             where id       = p_event_id limit 1;

  if not found then return 0.0; end if;

  -- ── 1. Category match (weight: 0.35) ──────────────────────
  if v_event.category = any(v_prefs.categories) then
    v_score := v_score + 0.35;
  end if;

  -- ── 2. Budget filter (weight: 0.20) ───────────────────────
  if v_prefs.budget_max is null then
    -- no limit — full score
    v_score := v_score + 0.20;
  elsif v_event.price_min is null or v_event.price_min = 0 then
    -- free event — always passes
    v_score := v_score + 0.20;
  elsif v_event.price_min <= v_prefs.budget_max then
    -- within budget
    v_score := v_score + 0.20 * (1.0 - (v_event.price_min / v_prefs.budget_max));
  else
    -- over budget — negative signal
    v_score := v_score - 0.15;
  end if;

  -- ── 3. Neighborhood match (weight: 0.20) ──────────────────
  if v_event.neighborhood = any(v_prefs.neighborhoods)
     or 'anywhere' = any(v_prefs.neighborhoods)
     or array_length(v_prefs.neighborhoods, 1) = 0 then
    v_score := v_score + 0.20;
  end if;

  -- ── 4. Geo distance score (weight: 0.15) ──────────────────
  if p_user_lat is not null and p_user_lng is not null
     and v_event.lat is not null and v_event.lng is not null then
    -- Haversine approximation in miles
    v_dist_mi := 3958.8 * acos(
      least(1.0,
        sin(radians(p_user_lat)) * sin(radians(v_event.lat))
        + cos(radians(p_user_lat)) * cos(radians(v_event.lat))
          * cos(radians(v_event.lng - p_user_lng))
      )
    );
    if v_dist_mi <= 1.0 then
      v_score := v_score + 0.15;
    elsif v_dist_mi <= v_prefs.geo_radius_miles then
      v_score := v_score + 0.15 * (1.0 - (v_dist_mi / v_prefs.geo_radius_miles));
    else
      v_score := v_score + 0.0;
    end if;
  end if;

  -- ── 5. Age filter (weight: 0.05) ──────────────────────────
  -- events table can carry age_restriction text field
  -- default: no penalty unless mismatch
  v_score := v_score + 0.05;

  -- ── 6. Flash deal bonus (weight: 0.05) ────────────────────
  if v_event.is_flash_deal then
    v_score := v_score + 0.05;
  end if;

  -- clamp to [0, 1]
  return greatest(0.0, least(1.0, v_score));
end;
$$;

-- ============================================================
--  FUNCTION: get_personalized_feed
--  Returns scored + filtered events for a user.
--  Called by the API feed endpoint.
-- ============================================================
create or replace function public.get_personalized_feed(
  p_user_id       uuid,
  p_user_lat      double precision default null,
  p_user_lng      double precision default null,
  p_is_pro        boolean          default false,
  p_limit         integer          default 50,
  p_offset        integer          default 0
)
returns table (
  id              uuid,
  title           text,
  category        event_category,
  venue_name      text,
  address         text,
  neighborhood    text,
  lat             double precision,
  lng             double precision,
  starts_at       timestamptz,
  ends_at         timestamptz,
  price_min       numeric,
  price_max       numeric,
  capacity_pct    integer,
  crowd_count     integer,
  is_live         boolean,
  is_flash_deal   boolean,
  source          event_source,
  source_url      text,
  ai_confidence   numeric,
  relevance_score numeric,
  distance_mi     numeric,
  section         text           -- 'nearby' | 'ai_found' | 'all'
)
language plpgsql security definer stable as $$
declare
  v_free_limit integer := 8;
  v_final_limit integer;
begin
  -- enforce free tier cap
  v_final_limit := case when p_is_pro then p_limit else least(p_limit, v_free_limit) end;

  return query
  with scored as (
    select
      e.id,
      e.title,
      e.category,
      e.venue_name,
      e.address,
      e.neighborhood,
      e.lat,
      e.lng,
      e.starts_at,
      e.ends_at,
      e.price_min,
      e.price_max,
      e.capacity_pct,
      e.crowd_count,
      e.is_live,
      e.is_flash_deal,
      e.source,
      e.source_url,
      e.ai_confidence,
      public.score_event_for_user(p_user_id, e.id, p_user_lat, p_user_lng) as relevance_score,
      case
        when p_user_lat is not null and e.lat is not null then
          round(cast(3958.8 * acos(
            least(1.0,
              sin(radians(p_user_lat)) * sin(radians(e.lat))
              + cos(radians(p_user_lat)) * cos(radians(e.lat))
                * cos(radians(e.lng - p_user_lng))
            )
          ) as numeric), 2)
        else null
      end as distance_mi,
      -- section tagging
      case
        when e.source in ('instagram','onmilwaukee','milwaukee_com')
             and e.ai_confidence >= 0.7 then 'ai_found'
        when p_user_lat is not null and e.lat is not null
             and 3958.8 * acos(
               least(1.0,
                 sin(radians(p_user_lat)) * sin(radians(e.lat))
                 + cos(radians(p_user_lat)) * cos(radians(e.lat))
                   * cos(radians(e.lng - p_user_lng))
               )
             ) <= 3.0 then 'nearby'
        else 'all'
      end as section
    from public.events e
    where e.is_active      = true
      and e.ai_verified    = true
      and e.ai_pending_review = false
      and e.starts_at > now() - interval '2 hours'
      and e.starts_at < now() + interval '24 hours'
  ),
  -- apply pro-only filters from user_preferences
  filtered as (
    select s.*
    from scored s
    left join public.user_preferences up on up.user_id = p_user_id
    where
      -- budget filter (pro only)
      (not p_is_pro
       or up.budget_max is null
       or s.price_min is null
       or s.price_min = 0
       or s.price_min <= up.budget_max
       or up.include_free
      )
      -- flash deal filter (pro only)
      and (not p_is_pro
           or not coalesce(up.flash_deals_only, false)
           or s.is_flash_deal = true)
  )
  select *
  from filtered
  order by
    -- pin flash deals to top
    case when is_flash_deal then 0 else 1 end,
    -- then by section priority
    case section when 'nearby' then 0 when 'ai_found' then 1 else 2 end,
    -- then by relevance
    relevance_score desc,
    -- then by start time
    starts_at asc
  limit  v_final_limit
  offset p_offset;
end;
$$;

-- ============================================================
--  VIEW: v_subscription_metrics  (admin dashboard)
-- ============================================================
create or replace view public.v_subscription_metrics as
select
  count(*)                                            as total_users,
  count(*) filter (where p.tier = 'pro')              as pro_users,
  count(*) filter (where p.tier = 'free')             as free_users,
  round(count(*) filter (where p.tier = 'pro')::numeric
    / nullif(count(*), 0) * 100, 1)                  as pro_pct,
  count(*) filter (where p.tier = 'pro') * 4.14      as mrr,
  count(*) filter (
    where p.created_at > now() - interval '7 days')  as new_this_week,
  count(*) filter (
    where p.tier = 'pro'
    and s.cancel_at_period_end = true)               as churning
from public.profiles p
left join public.subscriptions s on s.user_id = p.id;

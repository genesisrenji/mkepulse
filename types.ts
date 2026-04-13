// ============================================================
//  MKEpulse — shared/types.ts
//  Single source of truth for all domain types
// ============================================================

// ── Enums ────────────────────────────────────────────────────
export type UserTier       = 'free' | 'pro';
export type UserRole       = 'user' | 'admin' | 'superadmin';
export type SubStatus      = 'active' | 'cancelled' | 'past_due' | 'trialing';
export type EventCategory  = 'concerts' | 'food' | 'sports' | 'arts' | 'family' | 'community';
export type EventSource    = 'ticketmaster' | 'eventbrite' | 'instagram' | 'onmilwaukee' | 'milwaukee_com' | 'visit_milwaukee' | 'manual';
export type NotifFrequency = 'realtime' | 'smart' | 'daily' | 'weekly';
export type AlertSeverity  = 'info' | 'warning' | 'critical';
export type ParkingStatus  = 'available' | 'limited' | 'full' | 'closed' | 'unknown';
export type FeedSection    = 'nearby' | 'ai_found' | 'all';
export type GroupType      = 'solo' | 'partner' | 'friends' | 'family';
export type AgeFilter      = 'all' | '18plus' | '21plus';

// ── Database rows ─────────────────────────────────────────────
export interface Profile {
  id:               string;
  email:            string;
  display_name:     string | null;
  avatar_url:       string | null;
  tier:             UserTier;
  role:             UserRole;
  created_at:       string;
  updated_at:       string;
  last_seen_at:     string | null;
  last_lat:         number | null;
  last_lng:         number | null;
  last_location_at: string | null;
}

export interface UserPreferences {
  id:               string;
  user_id:          string;
  categories:       EventCategory[];
  budget_max:       number | null;
  include_free:     boolean;
  flash_deals_only: boolean;
  neighborhoods:    string[];
  geo_radius_miles: number;
  group_type:       GroupType | null;
  age_filter:       AgeFilter;
  notif_frequency:  NotifFrequency;
  push_enabled:     boolean;
  parking_alerts:   boolean;
  max_parking_walk: number;
  created_at:       string;
  updated_at:       string;
}

export interface Subscription {
  id:                     string;
  user_id:                string;
  stripe_customer_id:     string | null;
  stripe_subscription_id: string | null;
  stripe_price_id:        string | null;
  status:                 SubStatus;
  current_period_start:   string | null;
  current_period_end:     string | null;
  cancel_at_period_end:   boolean;
  amount_cents:           number;
  currency:               string;
  created_at:             string;
  updated_at:             string;
}

export interface Event {
  id:               string;
  external_id:      string | null;
  source:           EventSource;
  source_url:       string | null;
  title:            string;
  description:      string | null;
  category:         EventCategory;
  venue_name:       string;
  address:          string | null;
  neighborhood:     string | null;
  lat:              number | null;
  lng:              number | null;
  starts_at:        string;
  ends_at:          string | null;
  price_min:        number | null;
  price_max:        number | null;
  capacity_total:   number | null;
  capacity_pct:     number | null;
  crowd_count:      number;
  is_live:          boolean;
  is_flash_deal:    boolean;
  flash_deal_ends:  string | null;
  ai_confidence:    number | null;
  ai_verified:      boolean;
  ai_pending_review: boolean;
  is_active:        boolean;
  created_at:       string;
  updated_at:       string;
}

export interface ParkingGarage {
  id:               string;
  name:             string;
  address:          string | null;
  neighborhood:     string | null;
  lat:              number | null;
  lng:              number | null;
  total_spaces:     number;
  available_spaces: number;
  status:           ParkingStatus;
  hourly_rate_cents: number | null;
  daily_max_cents:  number | null;
  event_rate_cents: number | null;
  mke_open_data_id: string | null;
  operator:         string | null;
  is_covered:       boolean;
  is_active:        boolean;
  last_api_sync:    string | null;
}

export interface Alert {
  id:                   string;
  severity:             AlertSeverity;
  title:                string;
  description:          string | null;
  event_id:             string | null;
  garage_id:            string | null;
  is_resolved:          boolean;
  resolved_at:          string | null;
  requires_approval:    boolean;
  approved_at:          string | null;
  push_sent:            boolean;
  push_recipient_count: number;
  created_at:           string;
}

// ── API response shapes ───────────────────────────────────────
export interface FeedEvent extends Event {
  relevance_score: number;
  distance_mi:     number | null;
  section:         FeedSection;
  nearest_parking: NearestParking | null;
}

export interface NearestParking {
  garage_id:        string;
  name:             string;
  available_spaces: number;
  status:           ParkingStatus;
  distance_mi:      number;
  walk_minutes:     number;
  hourly_rate_cents: number | null;
}

export interface FeedResponse {
  events:   FeedEvent[];
  sections: { nearby: FeedEvent[]; ai_found: FeedEvent[]; all: FeedEvent[] };
  meta: {
    total:      number;
    is_pro:     boolean;
    free_limit: number | null;
    user_lat:   number | null;
    user_lng:   number | null;
  };
}

// ── Socket.io event payloads ──────────────────────────────────
export interface SocketEventNew {
  event: Event;
}

export interface SocketCapacityUpdate {
  id:           string;
  capacity_pct: number;
  crowd_count:  number;
}

export interface SocketProximityAlert {
  event:           FeedEvent;
  distance_mi:     number;
  nearest_parking: NearestParking | null;
  user_id:         string;
}

export interface SocketParkingUpdate {
  garages: Array<{
    id:               string;
    available_spaces: number;
    status:           ParkingStatus;
  }>;
  updated_at: string;
}

export interface SocketAlertNew {
  alert: Alert;
}

export interface SocketAgentLog {
  line: string;
  type: 'ok' | 'new' | 'warn' | 'info';
  ts:   string;
}

// ── Stripe webhook ────────────────────────────────────────────
export interface StripeWebhookBody {
  id:       string;
  type:     string;
  data:     { object: Record<string, unknown> };
  livemode: boolean;
}

// ── Onboarding quiz answers ───────────────────────────────────
export interface OnboardingAnswers {
  categories:       EventCategory[];
  budget_max:       number | null;
  include_free:     boolean;
  flash_deals_only: boolean;
  neighborhoods:    string[];
  group_type:       GroupType | null;
  age_filter:       AgeFilter;
  notif_frequency:  NotifFrequency;
  display_name:     string;
  email:            string;
}

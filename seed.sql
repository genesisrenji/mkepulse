-- ============================================================
--  MKEpulse — seed.sql
--  Real Milwaukee parking garages + sample events
-- ============================================================

-- ── Parking garages (real Milwaukee locations) ───────────────
insert into public.parking_garages (
  name, address, neighborhood, lat, lng,
  total_spaces, available_spaces, status,
  hourly_rate_cents, daily_max_cents,
  mke_open_data_id, operator, is_covered, is_active
) values
(
  'Milwaukee Riverwalk Garage',
  '315 N Water St, Milwaukee, WI 53202',
  'downtown',
  43.0373, -87.9073,
  342, 124, 'available',
  800, 3200,
  'MKE-PRK-001', 'Milwaukee Parking Services', true, true
),
(
  'East Kilbourn Avenue Garage',
  '1020 E Kilbourn Ave, Milwaukee, WI 53202',
  'downtown',
  43.0428, -87.8971,
  280, 88, 'available',
  600, 2800,
  'MKE-PRK-002', 'Milwaukee Parking Services', true, true
),
(
  'Wells Street Parking Garage',
  '330 W Wells St, Milwaukee, WI 53203',
  'downtown',
  43.0411, -87.9148,
  220, 42, 'limited',
  700, 3000,
  'MKE-PRK-003', 'ABM Parking', true, true
),
(
  'Arena District Surface Lot',
  '1111 N Phillips Ave, Milwaukee, WI 53203',
  'downtown',
  43.0449, -87.9175,
  180, 0, 'full',
  1200, 0,
  'MKE-PRK-004', 'Bucks Entertainment District', false, true
),
(
  'Milwaukee Art Museum Parking Lot',
  '750 N Lincoln Memorial Dr, Milwaukee, WI 53202',
  'lakefront',
  43.0400, -87.8971,
  150, 67, 'available',
  500, 2400,
  'MKE-PRK-005', 'Milwaukee Art Museum', false, true
),
(
  'Plankinton Building Garage',
  '161 W Wisconsin Ave, Milwaukee, WI 53203',
  'downtown',
  43.0389, -87.9106,
  400, 155, 'available',
  600, 2600,
  'MKE-PRK-006', 'SP Plus Corporation', true, true
)
on conflict (mke_open_data_id) do update
  set available_spaces = excluded.available_spaces,
      status           = excluded.status,
      last_api_sync    = now();

-- ── Sample events ────────────────────────────────────────────
-- Note: in production these are written by the AI crawl agent.
-- These seeds allow local dev + Emergent preview to work immediately.
insert into public.events (
  external_id, source, source_url,
  title, description, category, venue_name,
  address, neighborhood, lat, lng,
  starts_at, ends_at,
  price_min, price_max,
  capacity_total, capacity_pct, crowd_count,
  is_live, is_flash_deal, ai_confidence, ai_verified
) values
(
  'TM-MKE-2026-001', 'ticketmaster', 'https://ticketmaster.com',
  'Mk.gee — Pabst Theater', 'Live performance at historic Pabst Theater.',
  'concerts', 'Pabst Theater',
  '144 E Wells St, Milwaukee, WI 53202', 'downtown',
  43.0415, -87.9079,
  now() + interval '2 hours', now() + interval '5 hours',
  35.00, 55.00,
  1200, 88, 420,
  true, false, 0.98, true
),
(
  'EB-MKE-2026-002', 'eventbrite', 'https://eventbrite.com',
  '$5 Craft Pints — The Creamery Happy Hour', 'Flash happy hour deal at The Creamery.',
  'food', 'The Creamery',
  '422 Plankington Ave, Milwaukee, WI 53203', 'downtown',
  43.0381, -87.9118,
  now() + interval '30 minutes', now() + interval '3 hours',
  0.00, 5.00,
  200, 62, 110,
  true, true, 0.95, true
),
(
  'MKE-COM-2026-003', 'onmilwaukee', 'https://onmilwaukee.com',
  'Bucks Watch Party — Fiserv Forum Plaza', 'Outdoor watch party on the plaza.',
  'sports', 'Fiserv Forum Plaza',
  '1111 N Phillips Ave, Milwaukee, WI 53203', 'downtown',
  43.0449, -87.9175,
  now() + interval '1 hour', now() + interval '4 hours',
  0.00, 0.00,
  3000, 95, 1840,
  true, false, 0.99, true
),
(
  'MAM-2026-004', 'visit_milwaukee', 'https://mam.org',
  'MAM: Calatrava After Dark', 'Evening event at the Milwaukee Art Museum.',
  'arts', 'Milwaukee Art Museum',
  '700 N Art Museum Dr, Milwaukee, WI 53202', 'lakefront',
  43.0400, -87.8971,
  now() + interval '1 hour', now() + interval '5 hours',
  18.00, 18.00,
  500, 44, 210,
  false, false, 0.97, true
),
(
  'EB-MKE-2026-005', 'eventbrite', 'https://eventbrite.com',
  'Turner Hall Late Show — Just Listed', 'Late-night show at Turner Hall Ballroom.',
  'concerts', 'Turner Hall Ballroom',
  '1040 N 4th St, Milwaukee, WI 53203', 'downtown',
  43.0461, -87.9222,
  now() + interval '5 hours', now() + interval '8 hours',
  20.00, 30.00,
  800, 18, 40,
  false, false, 0.91, true
),
(
  'MKE-IG-2026-006', 'instagram', 'https://instagram.com',
  'Third Ward Food Truck Rally', 'Weekly food truck gathering in the Third Ward.',
  'food', 'Third Ward Public Market Area',
  'N Broadway & E St Paul Ave, Milwaukee, WI 53202', 'third_ward',
  43.0329, -87.9072,
  now() - interval '2 hours', now() + interval '4 hours',
  0.00, 25.00,
  null, 20, 380,
  true, false, 0.88, true
),
(
  'MKE-COM-2026-007', 'onmilwaukee', 'https://onmilwaukee.com',
  'Lakefront Sunset Run — 5K', 'Community run along Lake Michigan.',
  'sports', 'Lake Park',
  '3233 E Kenwood Blvd, Milwaukee, WI 53211', 'east_side',
  43.0711, -87.8684,
  now() + interval '2 hours', now() + interval '4 hours',
  0.00, 15.00,
  300, 55, 130,
  false, false, 0.94, true
),
(
  'SKY-2026-008', 'visit_milwaukee', 'https://skylightmusictheatre.org',
  'Skylight Music Theatre: Opening Night', 'Season opening night at Skylight.',
  'arts', 'Skylight Music Theatre',
  '158 N Broadway, Milwaukee, WI 53202', 'third_ward',
  43.0332, -87.9076,
  now() + interval '3 hours', now() + interval '6 hours',
  45.00, 95.00,
  400, 79, 295,
  false, false, 0.99, true
)
on conflict (source, external_id) do update
  set capacity_pct = excluded.capacity_pct,
      crowd_count  = excluded.crowd_count,
      is_live      = excluded.is_live,
      updated_at   = now();

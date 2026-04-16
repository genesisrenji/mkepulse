# MKEpulse PRD

## Problem Statement
Build MKEpulse: a full-stack real-time Milwaukee events platform with Milwaukee Brewers-inspired branding.

## Architecture
- **Backend:** FastAPI (Python) + MongoDB + python-socketio
- **Frontend:** React (CRA) + Leaflet + Recharts + socket.io-client
- **Auth:** JWT-based with bcrypt password hashing
- **Payments:** Stripe via emergentintegrations library
- **Real-time:** Socket.io (python-socketio ASGI wrapper)
- **Database:** MongoDB

## Build Guide Checklist Status

### Phase 1 — Foundation ✅
- [x] Database schema (MongoDB collections mirror Supabase schema)
- [x] Seed data (6 garages, 8 events)
- [x] Auth configured (JWT + bcrypt, admin/user/superadmin roles)
- [x] Test users seeded (admin, free, pro)

### Phase 2 — Payments & Onboarding ✅
- [x] Stripe $4.14/mo checkout via emergentintegrations
- [x] Stripe webhook handler (/api/webhook/stripe)
- [x] profiles.tier syncs on payment
- [x] 6-step onboarding quiz → writes to user_preferences
- [x] Paywall screen renders after quiz (/subscribe)
- [x] Quiz → Paywall redirect flow

### Phase 3 — User App ✅
- [x] Event feed with geo-sorted cards
- [x] Capacity bars color-coded (green/gold/red)
- [x] Parking strip on cards (Pro only gate)
- [x] Socket.io: event:new, event:capacity_update working
- [x] Geolocation watchPosition for Pro users
- [x] Proximity toast with parking info
- [x] Parking screen with live Socket.io updates
- [x] Geo map screen (Leaflet) with venue + parking pins + radius ring
- [x] Free-tier gates enforced (Map locked, Parking locked, parking strips Pro only, 8-event cap, upgrade CTAs)

### Phase 4 — Admin Portal ✅
- [x] /admin gated behind role check
- [x] All 9 admin sections: Dashboard, Analytics, Users, Events, Alerts, Parking, AI Agent, Revenue, Settings
- [x] Analytics: category engagement, notification frequency, neighborhood heatmap
- [x] AI Agent: force crawl button → POST /api/admin/agent/trigger (working)
- [x] AI Agent: pause button → POST /api/admin/agent/pause (working)
- [x] AI Agent: live crawl log via Socket.io agent:log
- [x] AI Agent: agent:cycle_complete updates run list
- [x] Settings: platform config table + API key status
- [x] Alerts badge count accurate
- [x] Revenue pulling from payment_transactions

### Phase 5 — Deployment
- [ ] Frontend to Vercel
- [ ] Server to Railway
- [ ] Stripe webhook production URL
- [ ] End-to-end smoke test in production

## Socket.io Events Implemented
| Event | Status |
|-------|--------|
| event:new | ✅ |
| event:capacity_update | ✅ |
| geo:proximity_alert | ✅ |
| parking:update | ✅ |
| alert:new | ✅ |
| agent:log | ✅ |
| agent:cycle_complete | ✅ |

## Pro Tier Gates Implemented
| Feature | Gate |
|---------|------|
| Event feed (8 max) | ✅ Free capped |
| Map screen | ✅ Locked → /subscribe |
| Parking screen | ✅ Locked → /subscribe |
| Parking on feed cards | ✅ Shows "Parking info (Pro)" |
| Geo proximity alerts | ✅ Pro only |
| Sidebar upgrade CTA | ✅ Shows for free users |
| Lock icons on nav | ✅ Map/Parking |

## Remaining Backlog
- External API integrations (Ticketmaster, Eventbrite, Instagram) — needs API keys
- Milwaukee Open Data API polling — needs app token
- Advanced Pro filters UI (budget, neighborhood, age, group sliders)
- Vercel/Railway deployment

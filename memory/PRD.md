# MKEpulse PRD

## Problem Statement
Build MKEpulse: a full-stack real-time Milwaukee events platform with Milwaukee Brewers-inspired branding.

## Architecture
- **Backend:** FastAPI (Python) + MongoDB + python-socketio
- **Frontend:** React (CRA) + Leaflet + Recharts + socket.io-client
- **Auth:** JWT-based with bcrypt password hashing
- **Payments:** Stripe via emergentintegrations library
- **Real-time:** Socket.io (python-socketio ASGI wrapper)
- **Database:** MongoDB with collections: users, events, parking_garages, alerts, user_preferences, crawl_runs, payment_transactions

## User Personas
1. **Event-goer (Free):** Browses up to 8 events, sees parking info, basic alerts
2. **Event-goer (Pro):** Unlimited events, geo alerts, AI picks, advanced filters ($4.14/mo)
3. **Admin:** Full platform management, user analytics, event approvals, revenue tracking

## Core Requirements
- Two user roles: user and admin
- Onboarding quiz (6 steps)
- Event feed with scoring, capacity bars, parking info
- Map view (Leaflet/OpenStreetMap)
- Parking availability screen
- Alerts screen
- Admin portal (dark mode)
- Geo proximity alerts (Pro only)
- Real-time Socket.io updates
- Stripe subscription ($4.14/mo)

## What's Been Implemented

### Phase 1 MVP (April 13, 2026) - COMPLETE
- [x] JWT authentication (login/register/logout)
- [x] Admin seeding + test users (free/pro)
- [x] 6-step onboarding quiz
- [x] Event feed with scoring pipeline
- [x] 8 seed events, 6 seed parking garages
- [x] Parking page with fill bars
- [x] Map page with Leaflet
- [x] Alerts page
- [x] Profile/settings page
- [x] Full admin portal (7 sections)
- [x] Milwaukee Brewers design

### Phase 2 (April 16, 2026) - COMPLETE
- [x] Geo Proximity Alerts (POST /api/geo/update, Haversine, Pro-only)
- [x] Socket.io real-time updates (capacity, parking, new events, alerts)
- [x] Background simulation task (30s interval)
- [x] Stripe subscription checkout ($4.14/mo via emergentintegrations)
- [x] Paywall page (/subscribe) with feature list
- [x] Checkout success page with polling
- [x] Stripe webhook handler
- [x] Profile upgrade button
- [x] Feed "Upgrade to Pro" link
- [x] Toast notification system for proximity/capacity/parking alerts
- [x] Geolocation hook (navigator.geolocation.watchPosition)

### Testing Results
- Backend: 100% (23/23 tests passed)
- Frontend: Functional (login, feed, paywall, profile, admin all verified via screenshots)

## Prioritized Backlog

### P1
- Onboarding quiz → paywall flow (redirect new users to /subscribe after quiz)
- Push notification implementation
- Advanced filters for Pro users (category, neighborhood, price range)

### P2
- User event interactions (save, checkin, dismiss)
- Flash deal countdown timers
- Password reset flow
- Email notifications via SendGrid

### Future
- External API integrations (Ticketmaster, Eventbrite, Instagram)
- Milwaukee Open Data API parking polling
- Supabase migration
- Railway/Vercel deployment

# MKEpulse PRD

## Problem Statement
Build MKEpulse: a full-stack real-time Milwaukee events platform with Milwaukee Brewers-inspired branding.

## Architecture
- **Backend:** FastAPI (Python) + MongoDB
- **Frontend:** React (CRA) + Leaflet + Recharts
- **Auth:** JWT-based with bcrypt password hashing
- **Database:** MongoDB with collections: users, events, parking_garages, alerts, user_preferences, crawl_runs

## User Personas
1. **Event-goer (Free):** Browses up to 8 events, sees parking info, basic alerts
2. **Event-goer (Pro):** Unlimited events, geo alerts, AI picks, advanced filters ($4.14/mo)
3. **Admin:** Full platform management, user analytics, event approvals, revenue tracking

## Core Requirements
- Two user roles: user and admin
- Onboarding quiz (6 steps): categories, budget, neighborhoods, group/age, notifications, name/email
- Event feed with scoring, capacity bars, parking info
- Map view (Leaflet/OpenStreetMap)
- Parking availability screen
- Alerts screen (capacity, proximity, flash deals)
- Admin portal (dark mode): Dashboard, Users, Events, Alerts, Parking, AI Agent, Revenue

## What's Been Implemented (April 13, 2026)
### Phase 1 MVP - COMPLETE
- [x] JWT authentication (login/register/logout)
- [x] Admin seeding (admin@mkepulse.com)
- [x] 6-step onboarding quiz
- [x] Event feed with scoring pipeline (relevance scoring, section classification)
- [x] 8 seed events with real Milwaukee venues
- [x] 6 seed parking garages with real Milwaukee addresses
- [x] Parking page with fill bars, status, rates
- [x] Map page with Leaflet (event pins + parking pins + radius ring)
- [x] Alerts page
- [x] Profile/settings page
- [x] Full admin portal (Dashboard, Users, Events, Alerts, Parking, AI Agent, Revenue)
- [x] Admin charts (user growth, source breakdown, category engagement, MRR)
- [x] Milwaukee Brewers design (navy #0E2240, gold #C4973B, cream #FDFAF4)
- [x] Dark admin portal (navy #0A0F1A, gold accents)
- [x] Responsive layout with dark navy sidebar

### Testing Results
- Backend: 100% (16/16 tests passed)
- Frontend: 95%
- Integration: 100%
- Admin Portal: 100%

## Prioritized Backlog

### P0 (Next)
- Stripe payment integration ($4.14/mo Pro tier)
- Real-time Socket.io updates (event:new, capacity updates, parking updates)

### P1
- Geo alerts (navigator.geolocation.watchPosition for Pro users)
- Google Maps integration (deferred to Leaflet currently)
- AI crawl agent (currently mocked with seed data)

### P2
- Apple Pay / Google Pay via Stripe
- Notification frequency implementation
- User event interactions (save, checkin, dismiss)
- Advanced filters for Pro users
- Flash deal countdown timers

## Deferred / Future
- Supabase migration (currently using MongoDB + JWT)
- External API integrations (Ticketmaster, Eventbrite, Instagram)
- Milwaukee Open Data API parking polling
- Railway/Vercel deployment
- Password reset flow
- Email notifications

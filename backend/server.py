from dotenv import load_dotenv
load_dotenv()

import os
import math
import secrets
import asyncio
import random
import bcrypt
import jwt as pyjwt
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from bson import ObjectId

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import motor.motor_asyncio
import socketio

# Stripe integration
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest
)

# --- Config ---
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
JWT_SECRET = os.environ.get("JWT_SECRET")
JWT_ALGORITHM = "HS256"
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY")
TICKETMASTER_API_KEY = os.environ.get("TICKETMASTER_API_KEY")
EVENTBRITE_API_KEY = os.environ.get("EVENTBRITE_API_KEY")
INSTAGRAM_ACCESS_TOKEN = os.environ.get("INSTAGRAM_ACCESS_TOKEN")
EARTH_RADIUS_MILES = 3958.8
FREE_TIER_LIMIT = 8

# --- Socket.io ---
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')

app = FastAPI(title="MKEpulse API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://brewers-events.preview.emergentagent.com", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Socket.io - expose as 'app' for uvicorn compatibility
sio_asgi = socketio.ASGIApp(sio, other_asgi_app=app, socketio_path='/socket.io')

# Override app for uvicorn to use Socket.io wrapped app
import sys
_module = sys.modules[__name__]
_original_app = app
# We keep `app` as FastAPI for route registration, but export sio_asgi for uvicorn
# The supervisor runs `uvicorn server:app` - we need to make app = sio_asgi at module level
# But we need the FastAPI app for decorators first, so we'll do this at the end of the file

client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]


# ===================== HELPERS =====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id, "email": email, "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
        "type": "access"
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh"
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def serialize_doc(doc):
    if doc is None:
        return None
    doc = dict(doc)
    if "_id" in doc:
        doc["id"] = str(doc["_id"])
        del doc["_id"]
    for k, v in doc.items():
        if isinstance(v, ObjectId):
            doc[k] = str(v)
        elif isinstance(v, datetime):
            doc[k] = v.isoformat()
    return doc

def haversine(lat1, lng1, lat2, lng2):
    if lat2 is None or lng2 is None or lat1 is None or lng1 is None:
        return float('inf')
    to_rad = math.pi / 180
    dlat = (lat2 - lat1) * to_rad
    dlng = (lng2 - lng1) * to_rad
    a = math.sin(dlat/2)**2 + math.cos(lat1*to_rad)*math.cos(lat2*to_rad)*math.sin(dlng/2)**2
    return EARTH_RADIUS_MILES * 2 * math.asin(math.sqrt(min(1, a)))


async def get_current_user(request: Request) -> dict:
    token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        return user
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Authentication failed")


async def get_optional_user(request: Request) -> Optional[dict]:
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


# ===================== MODELS =====================

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str = ""

class LoginRequest(BaseModel):
    email: str
    password: str

class PreferencesRequest(BaseModel):
    categories: List[str] = []
    budget_max: Optional[int] = None
    neighborhoods: List[str] = []
    group_type: Optional[str] = None
    age_filter: str = "all"
    notif_frequency: str = "smart"
    geo_radius_miles: float = 3.0
    display_name: Optional[str] = None

class GeoUpdateRequest(BaseModel):
    lat: float
    lng: float

class CheckoutRequest(BaseModel):
    origin_url: str


# ===================== SEED DATA =====================

SEED_GARAGES = [
    {"name": "Milwaukee Riverwalk Garage", "address": "315 N Water St, Milwaukee, WI 53202", "neighborhood": "downtown", "lat": 43.0373, "lng": -87.9073, "total_spaces": 342, "available_spaces": 124, "status": "available", "hourly_rate_cents": 800, "daily_max_cents": 3200, "mke_id": "MKE-PRK-001", "operator": "Milwaukee Parking Services", "is_covered": True},
    {"name": "East Kilbourn Avenue Garage", "address": "1020 E Kilbourn Ave, Milwaukee, WI 53202", "neighborhood": "downtown", "lat": 43.0428, "lng": -87.8971, "total_spaces": 280, "available_spaces": 88, "status": "available", "hourly_rate_cents": 600, "daily_max_cents": 2800, "mke_id": "MKE-PRK-002", "operator": "Milwaukee Parking Services", "is_covered": True},
    {"name": "Wells Street Parking Garage", "address": "330 W Wells St, Milwaukee, WI 53203", "neighborhood": "downtown", "lat": 43.0411, "lng": -87.9148, "total_spaces": 220, "available_spaces": 42, "status": "limited", "hourly_rate_cents": 700, "daily_max_cents": 3000, "mke_id": "MKE-PRK-003", "operator": "ABM Parking", "is_covered": True},
    {"name": "Arena District Surface Lot", "address": "1111 N Phillips Ave, Milwaukee, WI 53203", "neighborhood": "downtown", "lat": 43.0449, "lng": -87.9175, "total_spaces": 180, "available_spaces": 0, "status": "full", "hourly_rate_cents": 1200, "daily_max_cents": 0, "mke_id": "MKE-PRK-004", "operator": "Bucks Entertainment District", "is_covered": False},
    {"name": "Milwaukee Art Museum Parking Lot", "address": "750 N Lincoln Memorial Dr, Milwaukee, WI 53202", "neighborhood": "lakefront", "lat": 43.0400, "lng": -87.8971, "total_spaces": 150, "available_spaces": 67, "status": "available", "hourly_rate_cents": 500, "daily_max_cents": 2400, "mke_id": "MKE-PRK-005", "operator": "Milwaukee Art Museum", "is_covered": False},
    {"name": "Plankinton Building Garage", "address": "161 W Wisconsin Ave, Milwaukee, WI 53203", "neighborhood": "downtown", "lat": 43.0389, "lng": -87.9106, "total_spaces": 400, "available_spaces": 155, "status": "available", "hourly_rate_cents": 600, "daily_max_cents": 2600, "mke_id": "MKE-PRK-006", "operator": "SP Plus Corporation", "is_covered": True},
]

SEED_EVENTS = [
    {"external_id": "TM-MKE-2026-001", "source": "ticketmaster", "title": "Mk.gee \u2014 Pabst Theater", "description": "Live performance at historic Pabst Theater.", "category": "concerts", "venue_name": "Pabst Theater", "address": "144 E Wells St, Milwaukee, WI 53202", "neighborhood": "downtown", "lat": 43.0415, "lng": -87.9079, "price_min": 35.00, "price_max": 55.00, "capacity_total": 1200, "capacity_pct": 88, "crowd_count": 420, "is_live": True, "is_flash_deal": False, "ai_confidence": 0.98},
    {"external_id": "EB-MKE-2026-002", "source": "eventbrite", "title": "$5 Craft Pints \u2014 The Creamery Happy Hour", "description": "Flash happy hour deal at The Creamery.", "category": "food", "venue_name": "The Creamery", "address": "422 Plankington Ave, Milwaukee, WI 53203", "neighborhood": "downtown", "lat": 43.0381, "lng": -87.9118, "price_min": 0.00, "price_max": 5.00, "capacity_total": 200, "capacity_pct": 62, "crowd_count": 110, "is_live": True, "is_flash_deal": True, "ai_confidence": 0.95},
    {"external_id": "MKE-COM-2026-003", "source": "onmilwaukee", "title": "Bucks Watch Party \u2014 Fiserv Forum Plaza", "description": "Outdoor watch party on the plaza.", "category": "sports", "venue_name": "Fiserv Forum Plaza", "address": "1111 N Phillips Ave, Milwaukee, WI 53203", "neighborhood": "downtown", "lat": 43.0449, "lng": -87.9175, "price_min": 0.00, "price_max": 0.00, "capacity_total": 3000, "capacity_pct": 95, "crowd_count": 1840, "is_live": True, "is_flash_deal": False, "ai_confidence": 0.99},
    {"external_id": "MAM-2026-004", "source": "visit_milwaukee", "title": "MAM: Calatrava After Dark", "description": "Evening event at the Milwaukee Art Museum.", "category": "arts", "venue_name": "Milwaukee Art Museum", "address": "700 N Art Museum Dr, Milwaukee, WI 53202", "neighborhood": "lakefront", "lat": 43.0400, "lng": -87.8971, "price_min": 18.00, "price_max": 18.00, "capacity_total": 500, "capacity_pct": 44, "crowd_count": 210, "is_live": False, "is_flash_deal": False, "ai_confidence": 0.97},
    {"external_id": "EB-MKE-2026-005", "source": "eventbrite", "title": "Turner Hall Late Show \u2014 Just Listed", "description": "Late-night show at Turner Hall Ballroom.", "category": "concerts", "venue_name": "Turner Hall Ballroom", "address": "1040 N 4th St, Milwaukee, WI 53203", "neighborhood": "downtown", "lat": 43.0461, "lng": -87.9222, "price_min": 20.00, "price_max": 30.00, "capacity_total": 800, "capacity_pct": 18, "crowd_count": 40, "is_live": False, "is_flash_deal": False, "ai_confidence": 0.91},
    {"external_id": "MKE-IG-2026-006", "source": "instagram", "title": "Third Ward Food Truck Rally", "description": "Weekly food truck gathering in the Third Ward.", "category": "food", "venue_name": "Third Ward Public Market Area", "address": "N Broadway & E St Paul Ave, Milwaukee, WI 53202", "neighborhood": "third_ward", "lat": 43.0329, "lng": -87.9072, "price_min": 0.00, "price_max": 25.00, "capacity_total": None, "capacity_pct": 20, "crowd_count": 380, "is_live": True, "is_flash_deal": False, "ai_confidence": 0.88},
    {"external_id": "MKE-COM-2026-007", "source": "onmilwaukee", "title": "Lakefront Sunset Run \u2014 5K", "description": "Community run along Lake Michigan.", "category": "sports", "venue_name": "Lake Park", "address": "3233 E Kenwood Blvd, Milwaukee, WI 53211", "neighborhood": "east_side", "lat": 43.0711, "lng": -87.8684, "price_min": 0.00, "price_max": 15.00, "capacity_total": 300, "capacity_pct": 55, "crowd_count": 130, "is_live": False, "is_flash_deal": False, "ai_confidence": 0.94},
    {"external_id": "SKY-2026-008", "source": "visit_milwaukee", "title": "Skylight Music Theatre: Opening Night", "description": "Season opening night at Skylight.", "category": "arts", "venue_name": "Skylight Music Theatre", "address": "158 N Broadway, Milwaukee, WI 53202", "neighborhood": "third_ward", "lat": 43.0332, "lng": -87.9076, "price_min": 45.00, "price_max": 95.00, "capacity_total": 400, "capacity_pct": 79, "crowd_count": 295, "is_live": False, "is_flash_deal": False, "ai_confidence": 0.99},
]

async def seed_data():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@mkepulse.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "MKEadmin2026!")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "email": admin_email, "password_hash": hash_password(admin_password),
            "name": "MKE Admin", "role": "admin", "tier": "pro",
            "created_at": datetime.now(timezone.utc)
        })
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})

    # Seed test users
    test_users = [
        {"email": "free@mkepulse.com", "password": "FreeUser2026!", "name": "Alex Milwaukee", "role": "user", "tier": "free"},
        {"email": "pro@mkepulse.com", "password": "ProUser2026!", "name": "Jordan Brewers", "role": "user", "tier": "pro"},
    ]
    for tu in test_users:
        existing_tu = await db.users.find_one({"email": tu["email"]})
        if not existing_tu:
            await db.users.insert_one({
                "email": tu["email"], "password_hash": hash_password(tu["password"]),
                "name": tu["name"], "role": tu["role"], "tier": tu["tier"],
                "created_at": datetime.now(timezone.utc)
            })
        elif not verify_password(tu["password"], existing_tu["password_hash"]):
            await db.users.update_one({"email": tu["email"]}, {"$set": {"password_hash": hash_password(tu["password"])}})

    # Seed garages
    garage_count = await db.parking_garages.count_documents({})
    if garage_count == 0:
        now = datetime.now(timezone.utc)
        for g in SEED_GARAGES:
            g["is_active"] = True
            g["created_at"] = now
            g["updated_at"] = now
            g["last_api_sync"] = now
        await db.parking_garages.insert_many(SEED_GARAGES)

    # Seed events
    event_count = await db.events.count_documents({})
    if event_count == 0:
        now = datetime.now(timezone.utc)
        for i, e in enumerate(SEED_EVENTS):
            e["is_active"] = True
            e["ai_verified"] = True
            e["ai_pending_review"] = False
            e["starts_at"] = now + timedelta(hours=i+1)
            e["ends_at"] = now + timedelta(hours=i+4)
            e["created_at"] = now
            e["updated_at"] = now
        await db.events.insert_many(SEED_EVENTS)

    # Seed some alerts
    alert_count = await db.alerts.count_documents({})
    if alert_count == 0:
        now = datetime.now(timezone.utc)
        await db.alerts.insert_many([
            {"severity": "warning", "title": "Parking full: Arena District Surface Lot", "description": "Arena District Surface Lot has reached capacity (180 spaces).", "type": "parking", "is_resolved": False, "created_at": now - timedelta(hours=1)},
            {"severity": "info", "title": "New event discovered: Third Ward Food Truck Rally", "description": "AI agent found new event via Instagram #MKEevents", "type": "event", "is_resolved": False, "requires_approval": True, "created_at": now - timedelta(minutes=30)},
            {"severity": "critical", "title": "High capacity alert: Fiserv Forum Plaza at 95%", "description": "Bucks Watch Party crowd approaching venue limit.", "type": "capacity", "is_resolved": False, "created_at": now - timedelta(minutes=15)},
        ])

    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.events.create_index([("source", 1), ("external_id", 1)], unique=True, sparse=True)
    await db.parking_garages.create_index("mke_id", unique=True)
    await db.alerts.create_index([("created_at", -1)])
    await db.user_preferences.create_index("user_id", unique=True)

    # Seed crawl runs
    crawl_count = await db.crawl_runs.count_documents({})
    if crawl_count == 0:
        now = datetime.now(timezone.utc)
        await db.crawl_runs.insert_many([
            {"started_at": now - timedelta(hours=2), "finished_at": now - timedelta(hours=2) + timedelta(seconds=45), "duration_ms": 45000, "events_found": 12, "events_new": 3, "events_updated": 9, "events_skipped": 0, "sources_ok": ["ticketmaster", "eventbrite", "onmilwaukee"], "sources_failed": [], "status": "completed"},
            {"started_at": now - timedelta(hours=1), "finished_at": now - timedelta(hours=1) + timedelta(seconds=38), "duration_ms": 38000, "events_found": 8, "events_new": 1, "events_updated": 7, "events_skipped": 0, "sources_ok": ["ticketmaster", "eventbrite", "instagram", "onmilwaukee"], "sources_failed": ["visit_milwaukee"], "status": "completed"},
            {"started_at": now - timedelta(minutes=15), "finished_at": now - timedelta(minutes=15) + timedelta(seconds=52), "duration_ms": 52000, "events_found": 15, "events_new": 2, "events_updated": 13, "events_skipped": 0, "sources_ok": ["ticketmaster", "eventbrite", "instagram", "onmilwaukee", "milwaukee_com", "visit_milwaukee"], "sources_failed": [], "status": "completed"},
        ])


# ===================== AUTH ENDPOINTS =====================

@app.post("/api/auth/register")
async def register(req: RegisterRequest):
    email = req.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_doc = {
        "email": email,
        "password_hash": hash_password(req.password),
        "name": req.name or email.split("@")[0],
        "role": "user",
        "tier": "free",
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    access_token = create_access_token(user_id, email, "user")
    return {
        "id": user_id, "email": email, "name": user_doc["name"],
        "role": "user", "tier": "free", "token": access_token
    }

@app.post("/api/auth/login")
async def login(req: LoginRequest):
    email = req.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    user_id = str(user["_id"])
    role = user.get("role", "user")
    access_token = create_access_token(user_id, email, role)
    return {
        "id": user_id, "email": email, "name": user.get("name", ""),
        "role": role, "tier": user.get("tier", "free"), "token": access_token
    }

@app.get("/api/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {"id": user["_id"], "email": user["email"], "name": user.get("name", ""), "role": user.get("role", "user"), "tier": user.get("tier", "free")}

@app.post("/api/auth/logout")
async def logout():
    return {"logged_out": True}


# ===================== PREFERENCES / ONBOARDING =====================

@app.get("/api/preferences")
async def get_preferences(user: dict = Depends(get_current_user)):
    prefs = await db.user_preferences.find_one({"user_id": user["_id"]})
    return {"preferences": serialize_doc(prefs), "has_completed_quiz": prefs is not None}

@app.post("/api/preferences")
async def save_preferences(req: PreferencesRequest, user: dict = Depends(get_current_user)):
    payload = {
        "user_id": user["_id"],
        "categories": req.categories,
        "budget_max": req.budget_max,
        "neighborhoods": req.neighborhoods,
        "group_type": req.group_type,
        "age_filter": req.age_filter,
        "notif_frequency": req.notif_frequency,
        "geo_radius_miles": req.geo_radius_miles,
        "updated_at": datetime.now(timezone.utc),
    }
    if req.display_name:
        await db.users.update_one({"_id": ObjectId(user["_id"])}, {"$set": {"name": req.display_name}})

    await db.user_preferences.update_one(
        {"user_id": user["_id"]},
        {"$set": payload, "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
        upsert=True
    )
    prefs = await db.user_preferences.find_one({"user_id": user["_id"]})
    return {"preferences": serialize_doc(prefs), "saved": True}


# ===================== FEED =====================

def score_event(event, prefs, user_lat, user_lng):
    score = 0.0
    cats = prefs.get("categories", [])
    if not cats or event.get("category") in cats:
        score += 0.35
    budget = prefs.get("budget_max")
    price = event.get("price_min") or 0
    if budget is None:
        score += 0.20
    elif price == 0:
        score += 0.20
    elif price <= budget:
        score += 0.20 * (1.0 - (price / budget) * 0.5)
    else:
        score -= 0.15
    hoods = prefs.get("neighborhoods", [])
    if not hoods or "anywhere" in hoods or event.get("neighborhood") in hoods:
        score += 0.15
    if user_lat and event.get("lat"):
        dist = haversine(user_lat, user_lng, event["lat"], event["lng"])
        radius = prefs.get("geo_radius_miles", 3.0)
        if dist <= 1.0:
            score += 0.15
        elif dist <= radius:
            score += 0.15 * (1.0 - dist / radius)
    else:
        score += 0.075
    if event.get("is_flash_deal"):
        score += 0.10
    if event.get("is_live"):
        score += 0.05
    return max(0, min(1, score))

def find_nearest_parking(event, garages):
    if not event.get("lat") or not garages:
        return None
    nearest = None
    nearest_dist = float('inf')
    for g in garages:
        if not g.get("lat") or g.get("available_spaces", 0) == 0:
            continue
        dist = haversine(event["lat"], event["lng"], g["lat"], g["lng"])
        if dist < nearest_dist and dist <= 0.5:
            nearest_dist = dist
            nearest = g
    if not nearest:
        return None
    return {
        "garage_id": str(nearest.get("_id", "")),
        "name": nearest["name"],
        "available_spaces": nearest.get("available_spaces", 0),
        "status": nearest.get("status", "unknown"),
        "distance_mi": round(nearest_dist, 1),
        "walk_minutes": round(nearest_dist * 20),
        "hourly_rate_cents": nearest.get("hourly_rate_cents"),
    }

@app.get("/api/feed")
async def get_feed(request: Request, lat: Optional[float] = None, lng: Optional[float] = None, limit: int = 50, offset: int = 0):
    user = await get_optional_user(request)
    user_id = user["_id"] if user else None
    is_pro = user.get("tier") == "pro" if user else False

    prefs = {}
    if user_id:
        prefs_doc = await db.user_preferences.find_one({"user_id": user_id})
        if prefs_doc:
            prefs = prefs_doc

    events_cursor = db.events.find({
        "is_active": True, "ai_verified": True, "ai_pending_review": False,
    }).sort("starts_at", 1)
    raw_events = await events_cursor.to_list(length=200)

    garages = await db.parking_garages.find({"is_active": True}).to_list(length=50)

    FREE_LIMIT = 8
    scored = []
    for event in raw_events:
        ev = serialize_doc(event)
        ev["relevance_score"] = round(score_event(event, prefs, lat, lng), 3)
        ev["distance_mi"] = round(haversine(lat, lng, event.get("lat"), event.get("lng")), 2) if lat else None
        ev["nearest_parking"] = find_nearest_parking(event, garages)
        ai_sources = ["instagram", "onmilwaukee", "milwaukee_com"]
        if event.get("source") in ai_sources and (event.get("ai_confidence") or 0) >= 0.7:
            ev["section"] = "ai_found"
        elif lat and event.get("lat") and haversine(lat, lng, event["lat"], event["lng"]) <= 3.0:
            ev["section"] = "nearby"
        else:
            ev["section"] = "all"
        scored.append(ev)

    # Sort
    section_order = {"nearby": 0, "ai_found": 1, "all": 2}
    scored.sort(key=lambda e: (
        0 if e.get("is_flash_deal") else 1,
        section_order.get(e.get("section"), 3),
        -e.get("relevance_score", 0),
    ))

    capped = scored if is_pro else scored[:FREE_LIMIT]
    paginated = capped[offset:offset+limit]

    sections = {
        "nearby": [e for e in paginated if e.get("section") == "nearby"],
        "ai_found": [e for e in paginated if e.get("section") == "ai_found"],
        "all": [e for e in paginated if e.get("section") == "all"],
    }

    return {
        "events": paginated,
        "sections": sections,
        "meta": {
            "total": len(scored),
            "returned": len(paginated),
            "is_pro": is_pro,
            "free_limit": None if is_pro else FREE_LIMIT,
        }
    }


# ===================== PARKING =====================

@app.get("/api/parking")
async def get_parking(lat: Optional[float] = None, lng: Optional[float] = None):
    garages = await db.parking_garages.find({"is_active": True}).to_list(length=50)
    result = []
    for g in garages:
        gd = serialize_doc(g)
        if lat and g.get("lat"):
            gd["distance_mi"] = round(haversine(lat, lng, g["lat"], g["lng"]), 2)
            gd["walk_minutes"] = round(gd["distance_mi"] * 20)
        else:
            gd["distance_mi"] = None
            gd["walk_minutes"] = None
        fill_pct = 0
        if g.get("total_spaces", 0) > 0:
            fill_pct = round(((g["total_spaces"] - g.get("available_spaces", 0)) / g["total_spaces"]) * 100)
        gd["fill_pct"] = fill_pct
        result.append(gd)
    if lat:
        result.sort(key=lambda x: x.get("distance_mi") or 999)
    return {"garages": result}


# ===================== ALERTS =====================

@app.get("/api/alerts")
async def get_alerts(user: dict = Depends(get_current_user)):
    alerts_cursor = db.alerts.find({}).sort("created_at", -1).limit(50)
    alerts = await alerts_cursor.to_list(length=50)
    return {"alerts": [serialize_doc(a) for a in alerts]}


# ===================== ADMIN ENDPOINTS =====================

async def require_admin(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

@app.get("/api/admin/dashboard")
async def admin_dashboard(user: dict = Depends(require_admin)):
    total_users = await db.users.count_documents({})
    pro_users = await db.users.count_documents({"tier": "pro"})
    free_users = total_users - pro_users
    live_events = await db.events.count_documents({"is_active": True, "is_live": True})
    total_events = await db.events.count_documents({"is_active": True})

    garages = await db.parking_garages.find({"is_active": True}).to_list(length=50)
    total_parking = sum(g.get("total_spaces", 0) for g in garages)
    avail_parking = sum(g.get("available_spaces", 0) for g in garages)

    mrr = round(pro_users * 4.14, 2)
    unresolved_alerts = await db.alerts.count_documents({"is_resolved": {"$ne": True}})

    # User growth (last 7 days)
    now = datetime.now(timezone.utc)
    user_growth = []
    for i in range(7):
        day = now - timedelta(days=6-i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        count = await db.users.count_documents({"created_at": {"$gte": day_start, "$lt": day_end}})
        user_growth.append({"date": day_start.strftime("%b %d"), "count": count})

    # Source breakdown
    pipeline = [
        {"$match": {"is_active": True}},
        {"$group": {"_id": "$source", "count": {"$sum": 1}}}
    ]
    source_agg = await db.events.aggregate(pipeline).to_list(length=20)
    source_breakdown = {s["_id"]: s["count"] for s in source_agg}

    # Category breakdown
    cat_pipeline = [
        {"$match": {"is_active": True}},
        {"$group": {"_id": "$category", "count": {"$sum": 1}}}
    ]
    cat_agg = await db.events.aggregate(cat_pipeline).to_list(length=20)
    category_breakdown = {c["_id"]: c["count"] for c in cat_agg}

    return {
        "stats": {
            "total_users": total_users, "pro_users": pro_users, "free_users": free_users,
            "mrr": mrr, "live_events": live_events, "total_events": total_events,
            "total_parking": total_parking, "avail_parking": avail_parking,
            "unresolved_alerts": unresolved_alerts,
        },
        "user_growth": user_growth,
        "source_breakdown": source_breakdown,
        "category_breakdown": category_breakdown,
    }

@app.get("/api/admin/users")
async def admin_users(user: dict = Depends(require_admin)):
    users_cursor = db.users.find({}, {"password_hash": 0}).sort("created_at", -1)
    users = await users_cursor.to_list(length=200)
    result = []
    for u in users:
        ud = serialize_doc(u)
        prefs = await db.user_preferences.find_one({"user_id": str(u["_id"])})
        ud["interests"] = prefs.get("categories", []) if prefs else []
        result.append(ud)
    return {"users": result}

@app.get("/api/admin/events")
async def admin_events(user: dict = Depends(require_admin)):
    events_cursor = db.events.find({}).sort("created_at", -1)
    events = await events_cursor.to_list(length=200)
    return {"events": [serialize_doc(e) for e in events]}

@app.post("/api/admin/events/{event_id}/approve")
async def admin_approve_event(event_id: str, user: dict = Depends(require_admin)):
    await db.events.update_one(
        {"_id": ObjectId(event_id)},
        {"$set": {"ai_verified": True, "ai_pending_review": False, "updated_at": datetime.now(timezone.utc)}}
    )
    return {"approved": True}

@app.get("/api/admin/alerts")
async def admin_alerts(user: dict = Depends(require_admin)):
    alerts_cursor = db.alerts.find({}).sort("created_at", -1)
    alerts = await alerts_cursor.to_list(length=100)
    return {"alerts": [serialize_doc(a) for a in alerts]}

@app.post("/api/admin/alerts/{alert_id}/resolve")
async def admin_resolve_alert(alert_id: str, user: dict = Depends(require_admin)):
    await db.alerts.update_one(
        {"_id": ObjectId(alert_id)},
        {"$set": {"is_resolved": True, "resolved_at": datetime.now(timezone.utc)}}
    )
    return {"resolved": True}

@app.get("/api/admin/parking")
async def admin_parking(user: dict = Depends(require_admin)):
    garages = await db.parking_garages.find({}).to_list(length=50)
    result = []
    for g in garages:
        gd = serialize_doc(g)
        fill_pct = 0
        if g.get("total_spaces", 0) > 0:
            fill_pct = round(((g["total_spaces"] - g.get("available_spaces", 0)) / g["total_spaces"]) * 100)
        gd["fill_pct"] = fill_pct
        result.append(gd)
    return {"garages": result}

@app.get("/api/admin/crawl-runs")
async def admin_crawl_runs(user: dict = Depends(require_admin)):
    runs_cursor = db.crawl_runs.find({}).sort("started_at", -1).limit(20)
    runs = await runs_cursor.to_list(length=20)
    return {"crawl_runs": [serialize_doc(r) for r in runs]}

@app.get("/api/admin/revenue")
async def admin_revenue(user: dict = Depends(require_admin)):
    pro_users = await db.users.count_documents({"tier": "pro"})
    mrr = round(pro_users * 4.14, 2)
    # Mock revenue data
    now = datetime.now(timezone.utc)
    mrr_history = []
    for i in range(6):
        month = now - timedelta(days=30*(5-i))
        mrr_history.append({
            "month": month.strftime("%b %Y"),
            "mrr": round(max(0, mrr - (5-i) * 8.28 + (5-i) * 4.14), 2)
        })
    # Recent transactions
    txns = await db.payment_transactions.find({}).sort("created_at", -1).to_list(length=20)
    txns_serialized = [serialize_doc(t) for t in txns]
    return {
        "mrr": mrr,
        "pro_users": pro_users,
        "price_per_user": 4.14,
        "mrr_history": mrr_history,
        "recent_transactions": txns_serialized
    }

@app.get("/api/admin/analytics")
async def admin_analytics(user: dict = Depends(require_admin)):
    # Category engagement
    cat_pipeline = [{"$match": {"is_active": True}}, {"$group": {"_id": "$category", "count": {"$sum": 1}}}]
    cat_agg = await db.events.aggregate(cat_pipeline).to_list(length=20)
    category_engagement = {c["_id"]: c["count"] for c in cat_agg}

    # Notification frequency breakdown from user_preferences
    notif_pipeline = [{"$group": {"_id": "$notif_frequency", "count": {"$sum": 1}}}]
    notif_agg = await db.user_preferences.aggregate(notif_pipeline).to_list(length=10)
    notif_breakdown = {n["_id"]: n["count"] for n in notif_agg if n["_id"]}

    # Neighborhood heatmap from user_preferences
    hood_counts = {}
    prefs_cursor = db.user_preferences.find({}, {"neighborhoods": 1})
    async for p in prefs_cursor:
        for h in (p.get("neighborhoods") or []):
            hood_counts[h] = hood_counts.get(h, 0) + 1

    # Event neighborhoods
    event_hood_pipeline = [{"$match": {"is_active": True}}, {"$group": {"_id": "$neighborhood", "count": {"$sum": 1}}}]
    event_hood_agg = await db.events.aggregate(event_hood_pipeline).to_list(length=20)
    event_neighborhoods = {e["_id"]: e["count"] for e in event_hood_agg if e["_id"]}

    return {
        "category_engagement": category_engagement,
        "notif_breakdown": notif_breakdown,
        "neighborhood_heatmap": hood_counts,
        "event_neighborhoods": event_neighborhoods,
    }

@app.get("/api/admin/settings")
async def admin_settings(user: dict = Depends(require_admin)):
    config = await db.platform_config.find_one({"_id": "global"})
    if not config:
        config = {
            "crawl_interval_min": 15,
            "default_alert_radius_mi": 3.0,
            "pro_price_cents": 414,
            "free_event_limit": 8,
            "parking_poll_interval_min": 2,
        }
    else:
        config = serialize_doc(config)

    api_keys = {
        "STRIPE_API_KEY": "configured" if STRIPE_API_KEY else "missing",
        "TICKETMASTER_API_KEY": "configured" if TICKETMASTER_API_KEY else "not configured",
        "EVENTBRITE_API_KEY": "configured" if EVENTBRITE_API_KEY else "not configured",
        "INSTAGRAM_ACCESS_TOKEN": "configured" if INSTAGRAM_ACCESS_TOKEN else "not configured",
        "MKE_OPEN_DATA_APP_TOKEN": "not configured",
        "GOOGLE_MAPS_API_KEY": "not configured (using Leaflet/OSM)",
    }
    return {"config": config, "api_keys": api_keys}

# AI Crawl Agent control
from crawl_agent import run_crawl_cycle
agent_paused = False

@app.post("/api/admin/agent/trigger")
async def admin_trigger_crawl(user: dict = Depends(require_admin)):
    """Force an immediate real crawl cycle"""
    await sio.emit('agent:log', {"line": "Force crawl triggered by admin", "type": "info", "ts": datetime.now(timezone.utc).isoformat()})
    result = await run_crawl_cycle(db, sio)
    return {"triggered": True, **result}

@app.post("/api/admin/agent/pause")
async def admin_pause_agent(user: dict = Depends(require_admin)):
    global agent_paused
    agent_paused = not agent_paused
    status = "paused" if agent_paused else "running"
    await sio.emit('agent:log', {"line": f"Agent {status} by admin", "type": "warn", "ts": datetime.now(timezone.utc).isoformat()})
    return {"paused": agent_paused, "status": status}


# ===================== GEO PROXIMITY ALERTS =====================

@app.post("/api/geo/update")
async def geo_update(req: GeoUpdateRequest, user: dict = Depends(get_current_user)):
    user_id = user["_id"]
    is_pro = user.get("tier") == "pro"

    # Update user location
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"last_lat": req.lat, "last_lng": req.lng, "last_location_at": datetime.now(timezone.utc)}}
    )

    if not is_pro:
        return {"checked": False, "reason": "pro_required", "alerts": []}

    # Fetch user preferences
    prefs = await db.user_preferences.find_one({"user_id": user_id})
    radius_mi = 3.0
    pref_categories = []
    if prefs:
        radius_mi = prefs.get("geo_radius_miles", 3.0)
        pref_categories = prefs.get("categories", [])

    # Fetch active events
    events = await db.events.find({"is_active": True, "ai_verified": True}).to_list(length=200)
    garages = await db.parking_garages.find({"is_active": True}).to_list(length=50)

    proximity_alerts = []
    for event in events:
        if not event.get("lat") or not event.get("lng"):
            continue
        dist_mi = haversine(req.lat, req.lng, event["lat"], event["lng"])
        if dist_mi > radius_mi:
            continue
        # Category filter
        if pref_categories and event.get("category") not in pref_categories:
            continue

        nearest_parking = find_nearest_parking(event, garages)
        alert_data = {
            "event": serialize_doc(event),
            "distance_mi": round(dist_mi, 1),
            "nearest_parking": nearest_parking,
        }
        proximity_alerts.append(alert_data)

        # Store alert in DB
        parking_info = ""
        if nearest_parking:
            parking_info = f" Parking: {nearest_parking['name']} ({nearest_parking['available_spaces']} open)"
        event_title = event.get("title", "")
        venue_name = event.get("venue_name", "an event")
        await db.alerts.insert_one({
            "severity": "info",
            "title": f"You're near {venue_name}",
            "description": f"{event_title} — {round(dist_mi, 1)} mi away.{parking_info}",
            "type": "proximity",
            "event_id": str(event["_id"]),
            "user_id": user_id,
            "is_resolved": False,
            "created_at": datetime.now(timezone.utc),
        })

        # Emit via Socket.io
        await sio.emit('geo:proximity_alert', alert_data, room=f"user:{user_id}")

    return {"checked": True, "alerts_count": len(proximity_alerts), "alerts": proximity_alerts}


# ===================== SOCKET.IO EVENTS =====================

@sio.event
async def connect(sid, environ):
    print(f"[socket.io] Client connected: {sid}")

@sio.event
async def disconnect(sid):
    print(f"[socket.io] Client disconnected: {sid}")

@sio.event
async def authenticate(sid, data):
    """Client sends token to join personal room"""
    token = data.get("token", "") if isinstance(data, dict) else ""
    if not token:
        return
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if user_id:
            sio.enter_room(sid, f"user:{user_id}")
            print(f"[socket.io] User {user_id} joined room")
    except Exception:
        pass

# Background task: simulate real-time updates
async def simulate_realtime_updates():
    """Runs every 30 seconds to simulate capacity and parking changes"""
    while True:
        await asyncio.sleep(30)
        try:
            # Simulate capacity updates
            events = await db.events.find({"is_active": True, "is_live": True}).to_list(length=50)
            for event in events:
                delta = random.randint(-3, 5)
                new_pct = max(0, min(100, (event.get("capacity_pct") or 50) + delta))
                new_crowd = max(0, (event.get("crowd_count") or 0) + delta * 5)
                await db.events.update_one(
                    {"_id": event["_id"]},
                    {"$set": {"capacity_pct": new_pct, "crowd_count": new_crowd, "updated_at": datetime.now(timezone.utc)}}
                )
                await sio.emit('event:capacity_update', {
                    "id": str(event["_id"]),
                    "capacity_pct": new_pct,
                    "crowd_count": new_crowd,
                })

            # Simulate parking updates
            garages = await db.parking_garages.find({"is_active": True}).to_list(length=50)
            parking_updates = []
            for g in garages:
                delta = random.randint(-4, 5)
                new_avail = max(0, min(g.get("total_spaces", 0), g.get("available_spaces", 0) + delta))
                pct_full = (g["total_spaces"] - new_avail) / g["total_spaces"] if g.get("total_spaces", 0) > 0 else 0
                new_status = "full" if new_avail == 0 else ("limited" if pct_full > 0.85 else "available")
                await db.parking_garages.update_one(
                    {"_id": g["_id"]},
                    {"$set": {"available_spaces": new_avail, "status": new_status, "last_api_sync": datetime.now(timezone.utc)}}
                )
                parking_updates.append({
                    "id": str(g["_id"]),
                    "available_spaces": new_avail,
                    "status": new_status,
                })
            await sio.emit('parking:update', {"garages": parking_updates, "updated_at": datetime.now(timezone.utc).isoformat()})

        except Exception as e:
            print(f"[realtime] simulation error: {e}")


# ===================== STRIPE SUBSCRIPTION =====================

PRO_PRICE = 4.14  # $4.14/mo

@app.post("/api/stripe/checkout")
async def create_checkout(req: CheckoutRequest, request: Request, user: dict = Depends(get_current_user)):
    if user.get("tier") == "pro":
        raise HTTPException(status_code=400, detail="Already subscribed to Pro")

    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)

    origin = req.origin_url.rstrip("/")
    success_url = f"{origin}/subscribe/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/subscribe/cancel"

    checkout_req = CheckoutSessionRequest(
        amount=PRO_PRICE,
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"user_id": user["_id"], "user_email": user["email"], "plan": "pro"}
    )
    session: CheckoutSessionResponse = await stripe_checkout.create_checkout_session(checkout_req)

    # Record transaction
    await db.payment_transactions.insert_one({
        "user_id": user["_id"],
        "email": user["email"],
        "session_id": session.session_id,
        "amount": PRO_PRICE,
        "currency": "usd",
        "payment_status": "pending",
        "plan": "pro",
        "created_at": datetime.now(timezone.utc),
    })

    return {"url": session.url, "session_id": session.session_id}


@app.get("/api/stripe/status/{session_id}")
async def checkout_status(session_id: str, request: Request, user: dict = Depends(get_current_user)):
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)

    status: CheckoutStatusResponse = await stripe_checkout.get_checkout_status(session_id)

    # Update transaction
    txn = await db.payment_transactions.find_one({"session_id": session_id})
    if txn and txn.get("payment_status") != "paid":
        new_status = status.payment_status
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": new_status, "status": status.status, "updated_at": datetime.now(timezone.utc)}}
        )
        # Upgrade user tier on successful payment
        if new_status == "paid":
            await db.users.update_one(
                {"_id": ObjectId(txn["user_id"])},
                {"$set": {"tier": "pro", "updated_at": datetime.now(timezone.utc)}}
            )

    return {
        "status": status.status,
        "payment_status": status.payment_status,
        "amount_total": status.amount_total,
        "currency": status.currency,
    }


@app.post("/api/webhook/stripe")
async def stripe_webhook(request: Request):
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)

    try:
        webhook_response = await stripe_checkout.handle_webhook(body, sig)
        if webhook_response.payment_status == "paid":
            metadata = webhook_response.metadata or {}
            user_id = metadata.get("user_id")
            if user_id:
                # Update transaction
                await db.payment_transactions.update_one(
                    {"session_id": webhook_response.session_id},
                    {"$set": {"payment_status": "paid", "updated_at": datetime.now(timezone.utc)}}
                )
                # Upgrade tier
                await db.users.update_one(
                    {"_id": ObjectId(user_id)},
                    {"$set": {"tier": "pro", "updated_at": datetime.now(timezone.utc)}}
                )
        return {"received": True}
    except Exception as e:
        print(f"[stripe-webhook] error: {e}")
        return {"received": True, "error": str(e)}


@app.get("/api/stripe/subscription")
async def get_subscription(user: dict = Depends(get_current_user)):
    """Get current user's subscription status"""
    txn = await db.payment_transactions.find_one(
        {"user_id": user["_id"], "payment_status": "paid"},
        sort=[("created_at", -1)]
    )
    return {
        "tier": user.get("tier", "free"),
        "is_pro": user.get("tier") == "pro",
        "price_display": "$4.14/mo",
        "last_payment": serialize_doc(txn) if txn else None,
    }


# ===================== HEALTH =====================

@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "mkepulse-api", "timestamp": datetime.now(timezone.utc).isoformat()}


# ===================== STARTUP =====================

@app.on_event("startup")
async def startup():
    await seed_data()
    # Start background realtime simulation
    asyncio.create_task(simulate_realtime_updates())

# Replace app with socket.io wrapped app for uvicorn
app = sio_asgi

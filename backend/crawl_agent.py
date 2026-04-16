"""
MKEpulse AI Crawl Agent
Sources: Ticketmaster, Eventbrite, Instagram Graph API
Pipeline: fetch -> normalize -> deduplicate -> upsert
"""
import os
import asyncio
import hashlib
import httpx
from datetime import datetime, timezone, timedelta

TICKETMASTER_API_KEY = os.environ.get("TICKETMASTER_API_KEY")
EVENTBRITE_API_KEY = os.environ.get("EVENTBRITE_API_KEY")
INSTAGRAM_ACCESS_TOKEN = os.environ.get("INSTAGRAM_ACCESS_TOKEN")

MKE_LAT = 43.0389
MKE_LNG = -87.9065
MKE_RADIUS = "30"  # miles

CATEGORY_MAP = {
    "music": "concerts", "concert": "concerts", "live music": "concerts",
    "food": "food", "food & drink": "food", "drink": "food", "dining": "food",
    "sports": "sports", "sport": "sports", "fitness": "sports",
    "arts": "arts", "art": "arts", "theatre": "arts", "theater": "arts", "museum": "arts",
    "family": "family", "kids": "family", "children": "family",
    "community": "community", "charity": "community", "volunteer": "community",
}

NEIGHBORHOOD_MAP = {
    "downtown": ["downtown", "westown", "kilbourn", "wisconsin ave"],
    "third_ward": ["third ward", "historic third ward", "3rd ward"],
    "east_side": ["east side", "downer", "murray", "north ave"],
    "bay_view": ["bay view", "kinnickinnic"],
    "riverwest": ["riverwest", "center st"],
    "walkers_point": ["walker's point", "walkers point", "2nd street"],
    "brady_street": ["brady street", "brady st"],
    "lakefront": ["lakefront", "lake michigan", "lincoln memorial"],
}


def classify_category(text):
    if not text:
        return "community"
    lower = text.lower()
    for keyword, cat in CATEGORY_MAP.items():
        if keyword in lower:
            return cat
    return "community"


def classify_neighborhood(address):
    if not address:
        return "downtown"
    lower = address.lower()
    for hood, keywords in NEIGHBORHOOD_MAP.items():
        for kw in keywords:
            if kw in lower:
                return hood
    return "downtown"


def dedup_key(title, venue, date_str):
    raw = f"{title.lower().strip()}|{venue.lower().strip()}|{date_str[:10] if date_str else ''}"
    return hashlib.md5(raw.encode()).hexdigest()


# ===================== TICKETMASTER =====================

async def fetch_ticketmaster():
    if not TICKETMASTER_API_KEY:
        return [], "no_api_key"
    events = []
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://app.ticketmaster.com/discovery/v2/events.json",
                params={
                    "apikey": TICKETMASTER_API_KEY,
                    "latlong": f"{MKE_LAT},{MKE_LNG}",
                    "radius": MKE_RADIUS,
                    "unit": "miles",
                    "size": 20,
                    "sort": "date,asc",
                    "startDateTime": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                }
            )
            if resp.status_code != 200:
                return [], f"http_{resp.status_code}"
            data = resp.json()
            raw_events = data.get("_embedded", {}).get("events", [])
            for e in raw_events:
                venue_data = (e.get("_embedded", {}).get("venues") or [{}])[0]
                location = venue_data.get("location", {})
                price_ranges = e.get("priceRanges", [{}])
                classifications = e.get("classifications", [{}])
                genre = (classifications[0].get("genre", {}).get("name", "") if classifications else "").lower()

                events.append({
                    "external_id": f"TM-{e.get('id', '')}",
                    "source": "ticketmaster",
                    "source_url": e.get("url", ""),
                    "title": e.get("name", ""),
                    "description": e.get("info", e.get("pleaseNote", "")),
                    "category": classify_category(genre),
                    "venue_name": venue_data.get("name", "Unknown Venue"),
                    "address": f"{venue_data.get('address', {}).get('line1', '')}, {venue_data.get('city', {}).get('name', 'Milwaukee')}, {venue_data.get('state', {}).get('stateCode', 'WI')}",
                    "neighborhood": classify_neighborhood(venue_data.get("address", {}).get("line1", "")),
                    "lat": float(location.get("latitude", MKE_LAT)),
                    "lng": float(location.get("longitude", MKE_LNG)),
                    "starts_at": e.get("dates", {}).get("start", {}).get("dateTime"),
                    "price_min": price_ranges[0].get("min") if price_ranges else None,
                    "price_max": price_ranges[0].get("max") if price_ranges else None,
                    "ai_confidence": 0.95,
                })
        return events, "ok"
    except Exception as ex:
        return [], str(ex)[:100]


# ===================== EVENTBRITE =====================

async def fetch_eventbrite():
    if not EVENTBRITE_API_KEY:
        return [], "no_api_key"
    events = []
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://www.eventbriteapi.com/v3/events/search/",
                headers={"Authorization": f"Bearer {EVENTBRITE_API_KEY}"},
                params={
                    "location.latitude": str(MKE_LAT),
                    "location.longitude": str(MKE_LNG),
                    "location.within": f"{MKE_RADIUS}mi",
                    "sort_by": "date",
                    "expand": "venue",
                }
            )
            if resp.status_code != 200:
                return [], f"http_{resp.status_code}"
            data = resp.json()
            for e in data.get("events", []):
                venue = e.get("venue", {}) or {}
                addr = venue.get("address", {}) or {}
                events.append({
                    "external_id": f"EB-{e.get('id', '')}",
                    "source": "eventbrite",
                    "source_url": e.get("url", ""),
                    "title": e.get("name", {}).get("text", ""),
                    "description": (e.get("description", {}).get("text", "") or "")[:500],
                    "category": classify_category(e.get("name", {}).get("text", "")),
                    "venue_name": venue.get("name", "Unknown Venue"),
                    "address": f"{addr.get('address_1', '')}, {addr.get('city', 'Milwaukee')}, {addr.get('region', 'WI')}",
                    "neighborhood": classify_neighborhood(addr.get("address_1", "")),
                    "lat": float(addr.get("latitude", MKE_LAT)),
                    "lng": float(addr.get("longitude", MKE_LNG)),
                    "starts_at": e.get("start", {}).get("utc"),
                    "price_min": 0.0,
                    "price_max": None,
                    "ai_confidence": 0.90,
                })
        return events, "ok"
    except Exception as ex:
        return [], str(ex)[:100]


# ===================== INSTAGRAM =====================

async def fetch_instagram():
    if not INSTAGRAM_ACCESS_TOKEN:
        return [], "no_api_key"
    events = []
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Search for #MKEevents hashtag
            resp = await client.get(
                "https://graph.facebook.com/v19.0/ig_hashtag_search",
                params={
                    "q": "MKEevents",
                    "user_id": INSTAGRAM_ACCESS_TOKEN.split("|")[0] if "|" in INSTAGRAM_ACCESS_TOKEN else "",
                    "access_token": INSTAGRAM_ACCESS_TOKEN,
                }
            )
            if resp.status_code != 200:
                return [], f"http_{resp.status_code}"
            data = resp.json()
            hashtag_id = data.get("data", [{}])[0].get("id") if data.get("data") else None
            if not hashtag_id:
                return [], "no_hashtag_found"

            # Get recent media
            media_resp = await client.get(
                f"https://graph.facebook.com/v19.0/{hashtag_id}/recent_media",
                params={
                    "user_id": INSTAGRAM_ACCESS_TOKEN.split("|")[0] if "|" in INSTAGRAM_ACCESS_TOKEN else "",
                    "fields": "id,caption,timestamp,permalink",
                    "access_token": INSTAGRAM_ACCESS_TOKEN,
                }
            )
            if media_resp.status_code != 200:
                return [], f"media_http_{media_resp.status_code}"

            for post in media_resp.json().get("data", [])[:10]:
                caption = post.get("caption", "") or ""
                if len(caption) < 20:
                    continue
                # Extract event-like info from caption
                title = caption.split("\n")[0][:100] if caption else "Instagram Event"
                events.append({
                    "external_id": f"IG-{post.get('id', '')}",
                    "source": "instagram",
                    "source_url": post.get("permalink", ""),
                    "title": title,
                    "description": caption[:500],
                    "category": classify_category(caption),
                    "venue_name": "Milwaukee (via Instagram)",
                    "address": "Milwaukee, WI",
                    "neighborhood": "downtown",
                    "lat": MKE_LAT,
                    "lng": MKE_LNG,
                    "starts_at": post.get("timestamp"),
                    "price_min": None,
                    "price_max": None,
                    "ai_confidence": 0.65,  # lower confidence for scraped data
                })
        return events, "ok"
    except Exception as ex:
        return [], str(ex)[:100]


# ===================== PIPELINE =====================

async def run_crawl_cycle(db, sio):
    """Full crawl cycle: fetch all sources, normalize, deduplicate, upsert"""
    now = datetime.now(timezone.utc)
    run = await db.crawl_runs.insert_one({
        "started_at": now, "status": "running",
        "events_found": 0, "events_new": 0, "events_updated": 0, "events_skipped": 0,
        "sources_ok": [], "sources_failed": [],
    })
    run_id = run.inserted_id

    await sio.emit('agent:log', {"line": "Crawl cycle started", "type": "info", "ts": now.isoformat()})

    sources_ok = []
    sources_failed = []
    all_events = []

    # Fetch from all sources
    source_fetchers = [
        ("ticketmaster", fetch_ticketmaster),
        ("eventbrite", fetch_eventbrite),
        ("instagram", fetch_instagram),
    ]

    for source_name, fetcher in source_fetchers:
        await sio.emit('agent:log', {"line": f"Fetching from {source_name}...", "type": "info", "ts": datetime.now(timezone.utc).isoformat()})
        events, status = await fetcher()
        if status == "ok":
            sources_ok.append(source_name)
            all_events.extend(events)
            await sio.emit('agent:log', {"line": f"[{source_name}] Found {len(events)} events", "type": "ok", "ts": datetime.now(timezone.utc).isoformat()})
        elif status == "no_api_key":
            sources_failed.append(source_name)
            await sio.emit('agent:log', {"line": f"[{source_name}] Skipped — no API key configured", "type": "warn", "ts": datetime.now(timezone.utc).isoformat()})
        else:
            sources_failed.append(source_name)
            await sio.emit('agent:log', {"line": f"[{source_name}] Failed: {status}", "type": "warn", "ts": datetime.now(timezone.utc).isoformat()})

    # Deduplicate
    seen_keys = set()
    unique_events = []
    for event in all_events:
        key = dedup_key(event.get("title", ""), event.get("venue_name", ""), event.get("starts_at", ""))
        if key not in seen_keys:
            seen_keys.add(key)
            unique_events.append(event)

    await sio.emit('agent:log', {"line": f"Deduplication: {len(all_events)} → {len(unique_events)} unique events", "type": "info", "ts": datetime.now(timezone.utc).isoformat()})

    # Upsert into database
    new_count = 0
    updated_count = 0
    skipped_count = 0

    for event in unique_events:
        existing = await db.events.find_one({
            "source": event["source"],
            "external_id": event["external_id"]
        })

        ai_confidence = event.get("ai_confidence", 0.8)
        pending_review = ai_confidence < 0.7

        if existing:
            # Update existing
            await db.events.update_one(
                {"_id": existing["_id"]},
                {"$set": {"updated_at": now, "ai_confidence": ai_confidence}}
            )
            updated_count += 1
        else:
            # Insert new
            event_doc = {
                **event,
                "is_active": True,
                "ai_verified": not pending_review,
                "ai_pending_review": pending_review,
                "capacity_total": None,
                "capacity_pct": 0,
                "crowd_count": 0,
                "is_live": False,
                "is_flash_deal": False,
                "created_at": now,
                "updated_at": now,
            }
            # Parse starts_at
            if event_doc.get("starts_at") and isinstance(event_doc["starts_at"], str):
                try:
                    event_doc["starts_at"] = datetime.fromisoformat(event_doc["starts_at"].replace("Z", "+00:00"))
                except Exception:
                    event_doc["starts_at"] = now + timedelta(hours=2)
            else:
                event_doc["starts_at"] = now + timedelta(hours=2)

            if not event_doc.get("ends_at"):
                event_doc["ends_at"] = event_doc["starts_at"] + timedelta(hours=3)

            try:
                result = await db.events.insert_one(event_doc)
                new_count += 1
                # Emit new event via Socket.io
                event_doc["_id"] = str(result.inserted_id)
                event_doc["id"] = event_doc["_id"]
                if isinstance(event_doc.get("starts_at"), datetime):
                    event_doc["starts_at"] = event_doc["starts_at"].isoformat()
                if isinstance(event_doc.get("ends_at"), datetime):
                    event_doc["ends_at"] = event_doc["ends_at"].isoformat()
                if isinstance(event_doc.get("created_at"), datetime):
                    event_doc["created_at"] = event_doc["created_at"].isoformat()
                if isinstance(event_doc.get("updated_at"), datetime):
                    event_doc["updated_at"] = event_doc["updated_at"].isoformat()
                del event_doc["_id"]
                await sio.emit('event:new', {"event": event_doc})

                if pending_review:
                    await db.alerts.insert_one({
                        "severity": "info",
                        "title": f"New event needs review: {event.get('title', '')[:50]}",
                        "description": f"AI confidence: {ai_confidence:.0%}. Source: {event.get('source')}",
                        "type": "event",
                        "requires_approval": True,
                        "is_resolved": False,
                        "created_at": now,
                    })
                    await sio.emit('alert:new', {"alert": {"severity": "info", "title": f"New event needs review: {event.get('title', '')[:50]}"}})
            except Exception:
                skipped_count += 1

    # Finalize run
    finished = datetime.now(timezone.utc)
    duration_ms = int((finished - now).total_seconds() * 1000)
    await db.crawl_runs.update_one(
        {"_id": run_id},
        {"$set": {
            "finished_at": finished, "duration_ms": duration_ms, "status": "completed",
            "events_found": len(unique_events), "events_new": new_count,
            "events_updated": updated_count, "events_skipped": skipped_count,
            "sources_ok": sources_ok, "sources_failed": sources_failed,
        }}
    )

    summary = f"Crawl complete: {len(unique_events)} found, {new_count} new, {updated_count} updated, {skipped_count} skipped ({duration_ms}ms)"
    await sio.emit('agent:log', {"line": summary, "type": "ok", "ts": finished.isoformat()})

    run_doc = await db.crawl_runs.find_one({"_id": run_id})
    if run_doc:
        run_doc["_id"] = str(run_doc["_id"])
        run_doc["id"] = run_doc["_id"]
        for k, v in run_doc.items():
            if isinstance(v, datetime):
                run_doc[k] = v.isoformat()
        del run_doc["_id"]
        await sio.emit('agent:cycle_complete', run_doc)

    return {
        "events_found": len(unique_events),
        "events_new": new_count,
        "events_updated": updated_count,
        "events_skipped": skipped_count,
        "sources_ok": sources_ok,
        "sources_failed": sources_failed,
        "duration_ms": duration_ms,
    }

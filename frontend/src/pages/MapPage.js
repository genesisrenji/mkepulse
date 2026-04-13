import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import API from '../api';
import { MapPin, Car } from 'lucide-react';

// Fix default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const eventIcon = new L.DivIcon({
  className: '',
  html: `<div style="background:#C4973B;width:28px;height:28px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center">
    <svg width="14" height="14" fill="white" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const parkingIcon = new L.DivIcon({
  className: '',
  html: `<div style="background:#0E2240;width:24px;height:24px;border-radius:6px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center">
    <svg width="12" height="12" fill="white" viewBox="0 0 24 24"><path d="M13 3H6v18h4v-6h3c3.31 0 6-2.69 6-6s-2.69-6-6-6zm.2 8H10V7h3.2c1.1 0 2 .9 2 2s-.9 2-2 2z"/></svg>
  </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

export default function MapPage() {
  const [events, setEvents] = useState([]);
  const [garages, setGarages] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [feedRes, parkRes] = await Promise.all([
          API.get('/api/feed'),
          API.get('/api/parking'),
        ]);
        setEvents(feedRes.data.events || []);
        setGarages(parkRes.data.garages || []);
      } catch (err) { console.error(err); }
    };
    load();
  }, []);

  const center = [43.0389, -87.9065]; // Milwaukee center

  return (
    <div data-testid="map-page">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--navy)', letterSpacing: '-0.02em' }}>Event Map</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#C4973B', display: 'inline-block' }} /> Events
          </span>
          <span style={{ marginLeft: 16, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: '#0E2240', display: 'inline-block' }} /> Parking
          </span>
        </p>
      </div>

      <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--user-border)', height: 'calc(100vh - 180px)' }}>
        <MapContainer center={center} zoom={14} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* 3-mile radius ring */}
          <Circle center={center} radius={4828} pathOptions={{ color: '#C4973B', dashArray: '8 6', fillOpacity: 0.02, weight: 2 }} />

          {events.filter(e => e.lat && e.lng).map((event, i) => (
            <Marker key={`ev-${i}`} position={[event.lat, event.lng]} icon={eventIcon}>
              <Popup>
                <div style={{ minWidth: 180 }}>
                  <strong style={{ fontSize: 14 }}>{event.title}</strong>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{event.venue_name}</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    {event.capacity_pct}% full | {event.crowd_count} attending
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

          {garages.filter(g => g.lat && g.lng).map((garage, i) => (
            <Marker key={`pk-${i}`} position={[garage.lat, garage.lng]} icon={parkingIcon}>
              <Popup>
                <div style={{ minWidth: 160 }}>
                  <strong style={{ fontSize: 13 }}>{garage.name}</strong>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                    {garage.available_spaces}/{garage.total_spaces} spots
                  </div>
                  <div style={{ fontSize: 12, marginTop: 2 }}>
                    ${(garage.hourly_rate_cents / 100).toFixed(2)}/hr
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

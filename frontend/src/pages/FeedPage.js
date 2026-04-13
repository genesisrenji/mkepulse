import React, { useState, useEffect } from 'react';
import API from '../api';
import { MapPin, Users, Car, Clock, Zap, Star, TrendingUp } from 'lucide-react';

export default function FeedPage() {
  const [feed, setFeed] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFeed = async () => {
      try {
        const { data } = await API.get('/api/feed');
        setFeed(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchFeed();
  }, []);

  if (loading) return <div data-testid="feed-loading" style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading events...</div>;

  const events = feed?.events || [];

  return (
    <div data-testid="feed-page">
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--navy)', letterSpacing: '-0.02em' }}>What's Happening</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
          {events.length} events near you {feed?.meta?.is_pro ? '' : `(${feed?.meta?.free_limit} max, free tier)`}
        </p>
      </div>

      {/* Section Headers */}
      {feed?.sections?.nearby?.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <MapPin size={16} color="var(--gold)" />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Nearby</span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {events.map((event, i) => (
          <EventCard key={event.id} event={event} index={i} />
        ))}
      </div>

      {events.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
          <Zap size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
          <p style={{ fontWeight: 600 }}>No events found</p>
          <p style={{ fontSize: 13, marginTop: 4 }}>Check back later for new Milwaukee events</p>
        </div>
      )}
    </div>
  );
}

function EventCard({ event, index }) {
  const capColor = (event.capacity_pct || 0) >= 90 ? 'cap-red' : (event.capacity_pct || 0) >= 60 ? 'cap-gold' : 'cap-green';
  const startTime = event.starts_at ? new Date(event.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
  const priceLabel = (!event.price_min || event.price_min === 0) ? 'Free' : `$${event.price_min}${event.price_max && event.price_max !== event.price_min ? '-$' + event.price_max : ''}`;

  return (
    <div data-testid={`event-card-${index}`} className="animate-fade-in-up"
      style={{
        background: 'white', borderRadius: 14, border: '1px solid var(--user-border)',
        padding: '20px 22px', animationDelay: `${index * 60}ms`,
        transition: 'all 0.2s', cursor: 'pointer', boxShadow: '0 2px 8px rgba(14,34,64,0.04)',
      }}
      onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(14,34,64,0.08)'; }}
      onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(14,34,64,0.04)'; }}>

      {/* Top Row: Title + Badges */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            {event.is_live && <span className="badge badge-live">Live</span>}
            {event.is_flash_deal && <span className="badge badge-flash"><Zap size={10} style={{ marginRight: 3 }} />Flash</span>}
            <span className="badge badge-category">{event.category}</span>
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--navy)', lineHeight: 1.3 }}>{event.title}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, color: 'var(--text-secondary)', fontSize: 13 }}>
            <MapPin size={13} /> {event.venue_name}
            {event.distance_mi && <span style={{ marginLeft: 4 }}>({event.distance_mi} mi)</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: event.price_min === 0 || !event.price_min ? '#22c55e' : 'var(--navy)' }}>{priceLabel}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}><Clock size={11} style={{ verticalAlign: '-1px' }} /> {startTime}</div>
        </div>
      </div>

      {/* Bottom Row: Capacity + Parking */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--user-border)' }}>
        {/* Capacity */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
              <Users size={12} style={{ verticalAlign: '-1px', marginRight: 4 }} />
              {event.crowd_count || 0} attending
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>{event.capacity_pct || 0}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(14,34,64,0.08)' }}>
            <div className={capColor} style={{ height: '100%', borderRadius: 3, width: `${Math.min(event.capacity_pct || 0, 100)}%`, transition: 'width 0.5s ease' }} />
          </div>
        </div>

        {/* Parking */}
        <div>
          {event.nearest_parking ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Car size={14} color="var(--text-secondary)" />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)' }}>{event.nearest_parking.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {event.nearest_parking.available_spaces} spots | {event.nearest_parking.walk_minutes} min walk
                </div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Car size={14} /> No nearby parking data
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

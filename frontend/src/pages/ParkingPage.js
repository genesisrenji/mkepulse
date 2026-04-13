import React, { useState, useEffect } from 'react';
import API from '../api';
import { Car, Clock, DollarSign, Navigation, Star } from 'lucide-react';

export default function ParkingPage() {
  const [garages, setGarages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await API.get('/api/parking');
        setGarages(data.garages || []);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading parking...</div>;

  return (
    <div data-testid="parking-page">
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--navy)', letterSpacing: '-0.02em' }}>Parking</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>{garages.length} garages in Milwaukee</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {garages.map((g, i) => {
          const fillPct = g.fill_pct || 0;
          const statusColor = g.status === 'full' ? '#ef4444' : g.status === 'limited' ? 'var(--gold)' : '#22c55e';
          const isRecommended = g.available_spaces > 50 && g.status === 'available';

          return (
            <div key={g.id} data-testid={`garage-card-${i}`} className="animate-fade-in-up"
              style={{
                background: 'white', borderRadius: 14, border: '1px solid var(--user-border)',
                padding: '18px 22px', animationDelay: `${i * 50}ms`,
                transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(14,34,64,0.04)',
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>{g.name}</h3>
                    {isRecommended && (
                      <span style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>
                        <Star size={10} style={{ verticalAlign: '-1px', marginRight: 2 }} />Recommended
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{g.address}</div>
                </div>
                <div style={{
                  padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                  background: statusColor + '15', color: statusColor,
                }}>
                  {g.status}
                </div>
              </div>

              {/* Fill Bar */}
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{g.available_spaces} of {g.total_spaces} available</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>{fillPct}% full</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: 'rgba(14,34,64,0.06)' }}>
                  <div style={{
                    height: '100%', borderRadius: 4, width: `${Math.min(fillPct, 100)}%`, transition: 'width 0.5s',
                    background: fillPct >= 90 ? '#ef4444' : fillPct >= 70 ? 'var(--gold)' : '#22c55e',
                  }} />
                </div>
              </div>

              {/* Info Row */}
              <div style={{ display: 'flex', gap: 20, marginTop: 12, color: 'var(--text-secondary)', fontSize: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <DollarSign size={13} /> ${((g.hourly_rate_cents || 0) / 100).toFixed(2)}/hr
                </span>
                {g.distance_mi && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Navigation size={13} /> {g.distance_mi} mi
                  </span>
                )}
                {g.walk_minutes && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={13} /> {g.walk_minutes} min walk
                  </span>
                )}
                {g.is_covered && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Car size={13} /> Covered
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

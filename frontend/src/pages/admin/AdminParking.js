import React, { useState, useEffect } from 'react';
import API from '../../api';
import { Car, RefreshCw } from 'lucide-react';

export default function AdminParking() {
  const [garages, setGarages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await API.get('/api/admin/parking');
        setGarages(data.garages || []);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  return (
    <div data-testid="admin-parking">
      <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--admin-text)', marginBottom: 24 }}>Parking Feeds</h1>

      {loading ? (
        <div style={{ color: 'var(--admin-text-secondary)', padding: 40 }}>Loading...</div>
      ) : (
        <>
          {/* Garage Grid */}
          <div className="grid-2" style={{ marginBottom: 28 }}>
            {garages.map((g, i) => {
              const fillPct = g.fill_pct || 0;
              const barColor = fillPct >= 90 ? '#ef4444' : fillPct >= 70 ? 'var(--gold)' : '#22c55e';
              return (
                <div key={g.id} data-testid={`admin-garage-${i}`}
                  style={{ background: 'var(--admin-surface)', borderRadius: 10, border: '1px solid var(--admin-border)', padding: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--admin-text)' }}>{g.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--admin-text-secondary)', marginTop: 2 }}>{g.address}</div>
                    </div>
                    <span style={{
                      padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                      background: g.status === 'full' ? '#ef444420' : g.status === 'limited' ? 'rgba(196,151,59,0.15)' : '#22c55e20',
                      color: g.status === 'full' ? '#ef4444' : g.status === 'limited' ? 'var(--gold)' : '#22c55e',
                    }}>
                      {g.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: 'var(--admin-text-secondary)' }}>
                    <span>{g.available_spaces}/{g.total_spaces} available</span>
                    <span style={{ fontWeight: 700, color: 'var(--admin-text)' }}>{fillPct}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }}>
                    <div style={{ height: '100%', borderRadius: 4, width: `${fillPct}%`, background: barColor, transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--admin-text-secondary)' }}>
                    Operator: {g.operator || 'N/A'} | MKE ID: {g.mke_id || 'N/A'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* API Status */}
          <div style={{ background: 'var(--admin-surface)', borderRadius: 10, border: '1px solid var(--admin-border)', padding: '20px' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--admin-text)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>API Integration Status</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <StatusRow name="Milwaukee Open Data API" status="simulated" note="Using simulated data (no API key configured)" />
              <StatusRow name="SpotHero Integration" status="inactive" note="Not configured" />
              <StatusRow name="ParkMobile Integration" status="inactive" note="Not configured" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatusRow({ name, status, note }) {
  const colors = { active: '#22c55e', simulated: 'var(--gold)', inactive: 'var(--admin-text-secondary)' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--admin-border)' }}>
      <div>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--admin-text)' }}>{name}</span>
        {note && <span style={{ fontSize: 12, color: 'var(--admin-text-secondary)', marginLeft: 8 }}>— {note}</span>}
      </div>
      <span style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: colors[status] || colors.inactive }}>
        {status}
      </span>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import API from '../../api';
import { Bot, Play, Pause, Clock, Check, AlertTriangle, Loader } from 'lucide-react';

export default function AdminAgent() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await API.get('/api/admin/crawl-runs');
        setRuns(data.crawl_runs || []);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const SOURCES = [
    { name: 'Ticketmaster', status: 'mocked' },
    { name: 'Eventbrite', status: 'mocked' },
    { name: 'Instagram #MKEevents', status: 'mocked' },
    { name: 'OnMilwaukee.com', status: 'mocked' },
    { name: 'Milwaukee.com', status: 'mocked' },
    { name: 'Visit Milwaukee', status: 'mocked' },
  ];

  return (
    <div data-testid="admin-agent">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--admin-text)' }}>AI Crawl Agent</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button data-testid="force-crawl-btn"
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: 'rgba(196,151,59,0.15)', color: 'var(--gold)', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
            }}>
            <Play size={14} /> Force Crawl
          </button>
          <button data-testid="pause-agent-btn"
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid var(--admin-border)',
              background: 'transparent', color: 'var(--admin-text-secondary)', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
            }}>
            <Pause size={14} /> Pause
          </button>
        </div>
      </div>

      {/* Source Status */}
      <div style={{ background: 'var(--admin-surface)', borderRadius: 10, border: '1px solid var(--admin-border)', padding: '20px', marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--admin-text)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Source Status</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {SOURCES.map((s, i) => (
            <div key={i} style={{
              padding: '12px 16px', borderRadius: 8, border: '1px solid var(--admin-border)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.status === 'active' ? '#22c55e' : 'var(--gold)' }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)' }}>{s.name}</div>
                <div style={{ fontSize: 11, color: 'var(--admin-text-secondary)', textTransform: 'uppercase' }}>{s.status}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Crawl Runs */}
      <div style={{ background: 'var(--admin-surface)', borderRadius: 10, border: '1px solid var(--admin-border)', padding: '20px' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--admin-text)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Recent Crawl Runs</h3>
        {loading ? (
          <div style={{ color: 'var(--admin-text-secondary)', padding: 20 }}>Loading...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {runs.map((r, i) => (
              <div key={r.id} data-testid={`crawl-run-${i}`}
                style={{
                  padding: '14px 16px', borderRadius: 8, border: '1px solid var(--admin-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Check size={16} color="#22c55e" />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)' }}>
                      Found {r.events_found} events ({r.events_new} new, {r.events_updated} updated)
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--admin-text-secondary)', marginTop: 2 }}>
                      {r.started_at ? new Date(r.started_at).toLocaleString() : ''} | {(r.duration_ms / 1000).toFixed(1)}s
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(r.sources_ok || []).map((s, j) => (
                    <span key={j} style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, background: '#22c55e20', color: '#22c55e', fontWeight: 600 }}>{s}</span>
                  ))}
                  {(r.sources_failed || []).map((s, j) => (
                    <span key={j} style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, background: '#ef444420', color: '#ef4444', fontWeight: 600 }}>{s}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

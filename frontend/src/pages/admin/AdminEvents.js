import React, { useState, useEffect } from 'react';
import API from '../../api';
import { Check, X, Eye } from 'lucide-react';

export default function AdminEvents() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await API.get('/api/admin/events');
        setEvents(data.events || []);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const handleApprove = async (id) => {
    try {
      await API.post(`/api/admin/events/${id}/approve`);
      setEvents(prev => prev.map(e => e.id === id ? { ...e, ai_verified: true, ai_pending_review: false } : e));
    } catch (err) { console.error(err); }
  };

  return (
    <div data-testid="admin-events">
      <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--admin-text)', marginBottom: 24 }}>Events</h1>

      {loading ? (
        <div style={{ color: 'var(--admin-text-secondary)', padding: 40 }}>Loading...</div>
      ) : (
        <div className="admin-table-wrap" style={{ background: 'var(--admin-surface)', borderRadius: 10, border: '1px solid var(--admin-border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--admin-border)' }}>
                {['Title', 'Category', 'Venue', 'Source', 'Confidence', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--admin-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={e.id} data-testid={`event-row-${i}`} style={{ borderBottom: '1px solid var(--admin-border)' }}>
                  <td style={{ ...cellStyle, fontWeight: 600, color: 'var(--admin-text)' }}>{e.title}</td>
                  <td style={cellStyle}><span className="badge badge-admin-category">{e.category}</span></td>
                  <td style={{ ...cellStyle, color: 'var(--admin-text-secondary)' }}>{e.venue_name}</td>
                  <td style={{ ...cellStyle, color: 'var(--admin-text-secondary)' }}>{e.source}</td>
                  <td style={cellStyle}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: (e.ai_confidence || 0) >= 0.9 ? '#22c55e' : (e.ai_confidence || 0) >= 0.7 ? 'var(--gold)' : '#ef4444' }}>
                      {((e.ai_confidence || 0) * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td style={cellStyle}>
                    {e.ai_pending_review ? (
                      <span style={{ color: 'var(--gold)', fontSize: 12, fontWeight: 600 }}>Pending</span>
                    ) : e.ai_verified ? (
                      <span style={{ color: '#22c55e', fontSize: 12, fontWeight: 600 }}>Verified</span>
                    ) : (
                      <span style={{ color: '#ef4444', fontSize: 12, fontWeight: 600 }}>Rejected</span>
                    )}
                  </td>
                  <td style={cellStyle}>
                    {e.ai_pending_review && (
                      <button data-testid={`approve-event-${i}`} onClick={() => handleApprove(e.id)}
                        style={{
                          padding: '4px 12px', borderRadius: 6, border: 'none', background: 'rgba(34,197,94,0.15)',
                          color: '#22c55e', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                        <Check size={14} /> Approve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const cellStyle = { padding: '12px 16px', fontSize: 13 };

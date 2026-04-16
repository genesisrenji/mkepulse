import React, { useState, useEffect } from 'react';
import API from '../../api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const CHART_COLORS = ['#C4973B', '#0E2240', '#22c55e', '#3b82f6', '#ef4444', '#8b5cf6', '#f59e0b', '#06b6d4'];
const NEIGHBORHOODS = ['downtown', 'third_ward', 'bay_view', 'east_side', 'riverwest', 'walkers_point', 'brady_street', 'suburbs', 'lakefront', 'anywhere'];

export default function AdminAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try { const { data: d } = await API.get('/api/admin/analytics'); setData(d); }
      catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  if (loading) return <div style={{ color: 'var(--admin-text-secondary)', padding: 40 }}>Loading analytics...</div>;
  if (!data) return <div style={{ color: 'var(--admin-text-secondary)', padding: 40 }}>Failed to load</div>;

  const catData = Object.entries(data.category_engagement || {}).map(([name, value]) => ({ name, value }));
  const notifData = Object.entries(data.notif_breakdown || {}).map(([name, value]) => ({ name, value }));
  const hoodMap = data.neighborhood_heatmap || {};

  return (
    <div data-testid="admin-analytics">
      <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--admin-text)', marginBottom: 24 }}>Analytics</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Category Engagement */}
        <div style={cardStyle}>
          <h3 style={cardTitle}>Category Engagement</h3>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={catData}>
                <XAxis dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" fill="#C4973B" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Notification Frequency */}
        <div style={cardStyle}>
          <h3 style={cardTitle}>Notification Frequency</h3>
          <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {notifData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={notifData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, value }) => `${name}: ${value}`}>
                    {notifData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <span style={{ color: 'var(--admin-text-secondary)', fontSize: 13 }}>No preference data yet</span>
            )}
          </div>
        </div>
      </div>

      {/* Neighborhood Heatmap */}
      <div style={cardStyle}>
        <h3 style={cardTitle}>Neighborhood Interest Heatmap</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginTop: 8 }}>
          {NEIGHBORHOODS.map(hood => {
            const count = hoodMap[hood] || 0;
            const maxCount = Math.max(...Object.values(hoodMap), 1);
            const intensity = count / maxCount;
            return (
              <div key={hood} data-testid={`heatmap-${hood}`}
                style={{
                  padding: '14px 10px', borderRadius: 8, textAlign: 'center',
                  border: '1px solid var(--admin-border)',
                  background: count > 0 ? `rgba(196, 151, 59, ${0.1 + intensity * 0.5})` : 'var(--admin-surface)',
                }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: count > 0 ? 'var(--gold)' : 'var(--admin-text-secondary)' }}>{count}</div>
                <div style={{ fontSize: 11, color: 'var(--admin-text-secondary)', marginTop: 4, textTransform: 'capitalize' }}>{hood.replace('_', ' ')}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const cardStyle = { background: 'var(--admin-surface)', borderRadius: 10, border: '1px solid var(--admin-border)', padding: '20px' };
const cardTitle = { fontSize: 14, fontWeight: 700, color: 'var(--admin-text)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.1em' };
const tooltipStyle = { background: '#141F33', border: '1px solid rgba(253,250,244,0.1)', borderRadius: 8, color: '#FDFAF4' };

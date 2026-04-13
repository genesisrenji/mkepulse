import React, { useState, useEffect } from 'react';
import API from '../../api';
import { Users, DollarSign, Zap, Car, TrendingUp, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const CHART_COLORS = ['#C4973B', '#0E2240', '#22c55e', '#3b82f6', '#ef4444', '#8b5cf6'];

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: d } = await API.get('/api/admin/dashboard');
        setData(d);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  if (loading) return <div style={{ color: 'var(--admin-text-secondary)', padding: 40 }}>Loading dashboard...</div>;
  if (!data) return <div style={{ color: 'var(--admin-text-secondary)', padding: 40 }}>Failed to load</div>;

  const stats = data.stats;
  const sourceData = Object.entries(data.source_breakdown || {}).map(([name, value]) => ({ name, value }));
  const categoryData = Object.entries(data.category_breakdown || {}).map(([name, value]) => ({ name, value }));

  return (
    <div data-testid="admin-dashboard">
      <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--admin-text)', letterSpacing: '-0.02em', marginBottom: 24 }}>Dashboard</h1>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        <StatCard icon={Users} label="Total Users" value={stats.total_users} sub={`${stats.pro_users} pro`} />
        <StatCard icon={DollarSign} label="MRR" value={`$${stats.mrr}`} sub={`$4.14 x ${stats.pro_users}`} />
        <StatCard icon={Zap} label="Live Events" value={stats.live_events} sub={`${stats.total_events} total`} />
        <StatCard icon={Car} label="Parking Open" value={stats.avail_parking} sub={`of ${stats.total_parking}`} />
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
        {/* User Growth */}
        <div style={cardStyle}>
          <h3 style={cardTitle}>User Growth (7d)</h3>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.user_growth || []}>
                <XAxis dataKey="date" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#141F33', border: '1px solid rgba(253,250,244,0.1)', borderRadius: 8, color: '#FDFAF4' }} />
                <Bar dataKey="count" fill="#C4973B" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Source Breakdown */}
        <div style={cardStyle}>
          <h3 style={cardTitle}>Event Sources</h3>
          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {sourceData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sourceData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`}>
                    {sourceData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#141F33', border: '1px solid rgba(253,250,244,0.1)', borderRadius: 8, color: '#FDFAF4' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <span style={{ color: 'var(--admin-text-secondary)' }}>No data</span>
            )}
          </div>
        </div>
      </div>

      {/* Category Engagement */}
      <div style={cardStyle}>
        <h3 style={cardTitle}>Category Engagement</h3>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryData} layout="vertical">
              <XAxis type="number" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={false} tickLine={false} width={90} />
              <Tooltip contentStyle={{ background: '#141F33', border: '1px solid rgba(253,250,244,0.1)', borderRadius: 8, color: '#FDFAF4' }} />
              <Bar dataKey="value" fill="#C4973B" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div data-testid={`stat-${label.toLowerCase().replace(/\s/g, '-')}`}
      style={{
        background: 'var(--admin-surface)', borderRadius: 10, border: '1px solid var(--admin-border)',
        padding: '20px', display: 'flex', flexDirection: 'column', gap: 8,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon size={16} color="var(--gold)" />
        <span style={{ fontSize: 12, color: 'var(--admin-text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--admin-text)', letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--admin-text-secondary)' }}>{sub}</div>}
    </div>
  );
}

const cardStyle = {
  background: 'var(--admin-surface)', borderRadius: 10, border: '1px solid var(--admin-border)', padding: '20px',
};
const cardTitle = {
  fontSize: 14, fontWeight: 700, color: 'var(--admin-text)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.1em',
};

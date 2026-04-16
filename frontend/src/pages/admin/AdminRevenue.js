import React, { useState, useEffect } from 'react';
import API from '../../api';
import { DollarSign, TrendingUp, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function AdminRevenue() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: d } = await API.get('/api/admin/revenue');
        setData(d);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  if (loading) return <div style={{ color: 'var(--admin-text-secondary)', padding: 40 }}>Loading...</div>;
  if (!data) return <div style={{ color: 'var(--admin-text-secondary)', padding: 40 }}>Failed to load</div>;

  return (
    <div data-testid="admin-revenue">
      <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--admin-text)', marginBottom: 24 }}>Revenue</h1>

      {/* Stat Cards */}
      <div className="grid-3" style={{ marginBottom: 28 }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <DollarSign size={16} color="var(--gold)" />
            <span style={labelStyle}>Monthly Recurring Revenue</span>
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--admin-text)' }}>${data.mrr}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Users size={16} color="var(--gold)" />
            <span style={labelStyle}>Pro Subscribers</span>
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--admin-text)' }}>{data.pro_users}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <TrendingUp size={16} color="var(--gold)" />
            <span style={labelStyle}>ARPU</span>
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--admin-text)' }}>${data.price_per_user}</div>
        </div>
      </div>

      {/* MRR Chart */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--admin-text)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.1em' }}>MRR Growth</h3>
        <div style={{ height: 250 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.mrr_history || []}>
              <XAxis dataKey="month" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
              <Tooltip contentStyle={{ background: '#141F33', border: '1px solid rgba(253,250,244,0.1)', borderRadius: 8, color: '#FDFAF4' }} formatter={v => [`$${v}`, 'MRR']} />
              <Bar dataKey="mrr" fill="#C4973B" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

const cardStyle = {
  background: 'var(--admin-surface)', borderRadius: 10, border: '1px solid var(--admin-border)', padding: '20px',
};
const labelStyle = {
  fontSize: 12, color: 'var(--admin-text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em',
};

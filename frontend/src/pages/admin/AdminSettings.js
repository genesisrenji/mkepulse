import React, { useState, useEffect } from 'react';
import API from '../../api';
import { Settings, Key, Clock, DollarSign, MapPin, Users } from 'lucide-react';

export default function AdminSettings() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try { const { data: d } = await API.get('/api/admin/settings'); setData(d); }
      catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  if (loading) return <div style={{ color: 'var(--admin-text-secondary)', padding: 40 }}>Loading settings...</div>;
  if (!data) return <div style={{ color: 'var(--admin-text-secondary)', padding: 40 }}>Failed to load</div>;

  const config = data.config || {};
  const apiKeys = data.api_keys || {};

  const CONFIG_ITEMS = [
    { key: 'crawl_interval_min', label: 'Crawl Interval', value: `${config.crawl_interval_min || 15} min`, icon: Clock },
    { key: 'default_alert_radius_mi', label: 'Default Alert Radius', value: `${config.default_alert_radius_mi || 3.0} mi`, icon: MapPin },
    { key: 'pro_price_cents', label: 'Pro Price', value: `$${((config.pro_price_cents || 414) / 100).toFixed(2)}/mo`, icon: DollarSign },
    { key: 'free_event_limit', label: 'Free Event Limit', value: `${config.free_event_limit || 8} events/day`, icon: Users },
    { key: 'parking_poll_interval_min', label: 'Parking Poll Interval', value: `${config.parking_poll_interval_min || 2} min`, icon: Clock },
  ];

  return (
    <div data-testid="admin-settings">
      <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--admin-text)', marginBottom: 24 }}>Settings</h1>

      {/* Platform Config */}
      <div style={cardStyle}>
        <h3 style={cardTitle}><Settings size={16} style={{ verticalAlign: '-2px', marginRight: 8 }} />Platform Configuration</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {CONFIG_ITEMS.map(item => (
            <div key={item.key} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 0', borderBottom: '1px solid var(--admin-border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <item.icon size={16} color="var(--gold)" />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--admin-text)' }}>{item.label}</span>
              </div>
              <span style={{ fontSize: 14, color: 'var(--admin-text-secondary)', fontWeight: 500 }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* API Key Status */}
      <div style={{ ...cardStyle, marginTop: 16 }}>
        <h3 style={cardTitle}><Key size={16} style={{ verticalAlign: '-2px', marginRight: 8 }} />API Key Status</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {Object.entries(apiKeys).map(([key, status]) => (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 0', borderBottom: '1px solid var(--admin-border)',
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', fontFamily: 'monospace' }}>{key}</span>
              <span style={{
                padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                background: status === 'configured' ? '#22c55e20' : status === 'not configured' ? '#ef444420' : '#f59e0b20',
                color: status === 'configured' ? '#22c55e' : status === 'not configured' ? '#ef4444' : '#f59e0b',
              }}>
                {status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const cardStyle = { background: 'var(--admin-surface)', borderRadius: 10, border: '1px solid var(--admin-border)', padding: '20px' };
const cardTitle = { fontSize: 14, fontWeight: 700, color: 'var(--admin-text)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.1em' };

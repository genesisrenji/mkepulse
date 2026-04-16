import React, { useState, useEffect } from 'react';
import API from '../api';
import { useSocket, useSocketConnect } from '../hooks/useSocket';
import { useToast } from '../components/Toast';
import { Bell, AlertTriangle, Info, CheckCircle, Clock, Wifi } from 'lucide-react';

const SEVERITY_CONFIG = {
  critical: { icon: AlertTriangle, color: '#ef4444', bg: '#fef2f2' },
  warning: { icon: AlertTriangle, color: 'var(--gold)', bg: 'rgba(196,151,59,0.08)' },
  info: { icon: Info, color: '#3b82f6', bg: '#eff6ff' },
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();
  const token = localStorage.getItem('mkepulse_token');

  useSocketConnect(token);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await API.get('/api/alerts');
        setAlerts(data.alerts || []);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  // Live alert updates
  useSocket('alert:new', (data) => {
    if (data?.alert) {
      setAlerts(prev => [data.alert, ...prev]);
      addToast({
        type: data.alert.severity === 'critical' ? 'capacity' : 'event',
        title: data.alert.title,
        description: data.alert.description,
        duration: 6000,
      });
    }
  });

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading alerts...</div>;

  return (
    <div data-testid="alerts-page">
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--navy)', letterSpacing: '-0.02em' }}>Alerts</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--gold)', fontWeight: 600 }}>
            <Wifi size={14} /> Live
          </div>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>{alerts.length} alerts</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {alerts.map((alert, i) => {
          const config = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.info;
          const Icon = config.icon;
          const time = alert.created_at ? new Date(alert.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

          return (
            <div key={alert.id || i} data-testid={`alert-card-${i}`} className="animate-fade-in-up"
              style={{
                background: 'white', borderRadius: 12, border: '1px solid var(--user-border)',
                padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'flex-start',
                animationDelay: `${i * 40}ms`,
              }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: config.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={18} color={config.color} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>{alert.title}</h3>
                  {alert.is_resolved && <CheckCircle size={16} color="#22c55e" />}
                </div>
                {alert.description && (
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>{alert.description}</p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                  <Clock size={11} /> {time}
                </div>
              </div>
            </div>
          );
        })}

        {alerts.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
            <Bell size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
            <p style={{ fontWeight: 600 }}>No alerts</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>You'll see proximity and capacity alerts here</p>
          </div>
        )}
      </div>
    </div>
  );
}

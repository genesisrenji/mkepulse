import React, { useState, useEffect } from 'react';
import API from '../../api';
import { Check, AlertTriangle, Info, Clock } from 'lucide-react';

export default function AdminAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await API.get('/api/admin/alerts');
        setAlerts(data.alerts || []);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const handleResolve = async (id) => {
    try {
      await API.post(`/api/admin/alerts/${id}/resolve`);
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, is_resolved: true } : a));
    } catch (err) { console.error(err); }
  };

  const unresolved = alerts.filter(a => !a.is_resolved);
  const resolved = alerts.filter(a => a.is_resolved);

  return (
    <div data-testid="admin-alerts">
      <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--admin-text)', marginBottom: 24 }}>
        Alerts <span style={{ fontSize: 16, color: 'var(--gold)', fontWeight: 600 }}>({unresolved.length} active)</span>
      </h1>

      {loading ? (
        <div style={{ color: 'var(--admin-text-secondary)', padding: 40 }}>Loading...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {unresolved.map((a, i) => (
            <AlertRow key={a.id} alert={a} index={i} onResolve={handleResolve} />
          ))}
          {resolved.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--admin-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 16, marginBottom: 8 }}>Resolved</div>
              {resolved.map((a, i) => (
                <AlertRow key={a.id} alert={a} index={i + unresolved.length} resolved />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AlertRow({ alert, index, onResolve, resolved }) {
  const sevColors = { critical: '#ef4444', warning: 'var(--gold)', info: '#3b82f6' };
  const color = sevColors[alert.severity] || sevColors.info;
  const Icon = alert.severity === 'critical' ? AlertTriangle : alert.severity === 'warning' ? AlertTriangle : Info;

  return (
    <div data-testid={`admin-alert-${index}`}
      style={{
        background: 'var(--admin-surface)', borderRadius: 10, border: '1px solid var(--admin-border)',
        padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, opacity: resolved ? 0.5 : 1,
      }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={18} color={color} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--admin-text)' }}>{alert.title}</div>
        {alert.description && <div style={{ fontSize: 12, color: 'var(--admin-text-secondary)', marginTop: 4 }}>{alert.description}</div>}
        <div style={{ fontSize: 11, color: 'var(--admin-text-secondary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Clock size={11} /> {alert.created_at ? new Date(alert.created_at).toLocaleString() : ''}
        </div>
      </div>
      {!resolved && onResolve && (
        <button data-testid={`resolve-alert-${index}`} onClick={() => onResolve(alert.id)}
          style={{
            padding: '6px 14px', borderRadius: 6, border: 'none',
            background: 'rgba(34,197,94,0.15)', color: '#22c55e', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
          }}>
          <Check size={14} /> Resolve
        </button>
      )}
    </div>
  );
}

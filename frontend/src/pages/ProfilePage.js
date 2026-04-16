import React, { useState, useEffect } from 'react';
import { useAuth } from '../components/AuthContext';
import API from '../api';
import { User, Bell, CreditCard, Check, Crown, Zap, ArrowRight } from 'lucide-react';

export default function ProfilePage() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await API.get('/api/preferences');
        setPrefs(data.preferences);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      const origin = window.location.origin;
      const { data } = await API.post('/api/stripe/checkout', { origin_url: origin });
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error(err);
      setUpgrading(false);
    }
  };

  return (
    <div data-testid="profile-page">
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--navy)', letterSpacing: '-0.02em' }}>Profile</h1>
      </div>

      {/* User Info Card */}
      <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--user-border)', padding: '24px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', background: 'var(--navy)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <User size={24} color="white" />
          </div>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>{user?.name || 'User'}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{user?.email}</p>
            <div style={{ marginTop: 4 }}>
              <span style={{
                padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                background: user?.tier === 'pro' ? 'rgba(196,151,59,0.1)' : 'rgba(14,34,64,0.06)',
                color: user?.tier === 'pro' ? 'var(--gold)' : 'var(--text-secondary)',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                {user?.tier === 'pro' && <Crown size={10} />}
                {user?.tier === 'pro' ? 'Pro Member' : 'Free Tier'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Preferences */}
      {prefs && (
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--user-border)', padding: '24px', marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bell size={16} /> Preferences
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Categories</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {(prefs.categories || []).map(c => (
                  <span key={c} className="badge badge-category">{c}</span>
                ))}
                {(!prefs.categories || prefs.categories.length === 0) && <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>All categories</span>}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Neighborhoods</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {(prefs.neighborhoods || []).map(n => (
                  <span key={n} className="badge badge-category">{n}</span>
                ))}
                {(!prefs.neighborhoods || prefs.neighborhoods.length === 0) && <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Anywhere</span>}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Budget</div>
              <p style={{ fontSize: 14, color: 'var(--navy)', fontWeight: 600 }}>{prefs.budget_max ? `Up to $${prefs.budget_max}` : 'No limit'}</p>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Notifications</div>
              <p style={{ fontSize: 14, color: 'var(--navy)', fontWeight: 600 }}>{prefs.notif_frequency || 'Smart Digest'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Subscription */}
      <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--user-border)', padding: '24px', marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CreditCard size={16} /> Subscription
        </h3>
        {user?.tier === 'pro' ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Check size={16} color="#22c55e" />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)' }}>Pro — $4.14/mo</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Unlimited events, geo alerts, AI picks, and flash deals.
            </p>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>Upgrade to Pro for unlimited events, geo alerts, and AI picks.</p>
            <button data-testid="profile-upgrade-btn" onClick={handleUpgrade} disabled={upgrading}
              style={{
                padding: '12px 24px', borderRadius: 10, border: 'none', background: 'var(--gold)',
                color: 'var(--admin-bg)', fontWeight: 700, fontSize: 14, cursor: upgrading ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 8, opacity: upgrading ? 0.7 : 1,
              }}>
              <Zap size={16} /> {upgrading ? 'Opening checkout...' : 'Upgrade — $4.14/mo'}
              {!upgrading && <ArrowRight size={16} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

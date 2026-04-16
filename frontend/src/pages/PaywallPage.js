import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import API from '../api';
import { Crown, Check, MapPin, Zap, Car, Brain, ArrowRight } from 'lucide-react';

const PRO_FEATURES = [
  { icon: Zap, text: 'Unlimited events (free tier: 8/day)' },
  { icon: MapPin, text: 'Geo proximity alerts when near events' },
  { icon: Brain, text: 'AI-curated picks personalized to you' },
  { icon: Car, text: 'Real-time parking flash deals' },
  { icon: Crown, text: 'Advanced filters and saved searches' },
];

export default function PaywallPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  if (user?.tier === 'pro') {
    navigate('/');
    return null;
  }

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const origin = window.location.origin;
      const { data } = await API.post('/api/stripe/checkout', { origin_url: origin });
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setLoading(false);
    }
  };

  const handleSkip = () => navigate('/');

  return (
    <div data-testid="paywall-page" style={{
      minHeight: '100vh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div className="animate-fade-in-up" style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', background: 'rgba(196,151,59,0.15)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
          }}>
            <Crown size={28} color="var(--gold)" />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--navy)', letterSpacing: '-0.02em' }}>
            Unlock MKE<span style={{ color: 'var(--gold)' }}>pulse</span> Pro
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 15, marginTop: 8 }}>
            Get the full Milwaukee experience
          </p>
        </div>

        {/* Price Card */}
        <div style={{
          background: 'white', borderRadius: 16, border: '2px solid var(--gold)',
          padding: '28px 24px', boxShadow: '0 4px 24px rgba(196,151,59,0.12)',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
              <span style={{ fontSize: 42, fontWeight: 800, color: 'var(--navy)' }}>$4.14</span>
              <span style={{ fontSize: 16, color: 'var(--text-secondary)', fontWeight: 500 }}>/mo</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
              Cancel anytime
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 28 }}>
            {PRO_FEATURES.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8, background: 'rgba(196,151,59,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <f.icon size={14} color="var(--gold)" />
                </div>
                <span style={{ fontSize: 14, color: 'var(--navy)', fontWeight: 500 }}>{f.text}</span>
              </div>
            ))}
          </div>

          <button data-testid="upgrade-btn" onClick={handleUpgrade} disabled={loading}
            style={{
              width: '100%', padding: '16px 0', borderRadius: 12, border: 'none',
              background: 'var(--gold)', color: 'var(--admin-bg)', fontWeight: 800,
              fontSize: 16, cursor: loading ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 0.2s', opacity: loading ? 0.7 : 1,
            }}>
            {loading ? 'Opening checkout...' : 'Upgrade to Pro'}
            {!loading && <ArrowRight size={18} />}
          </button>
        </div>

        <button data-testid="skip-paywall" onClick={handleSkip}
          style={{
            width: '100%', padding: '14px 0', marginTop: 12, borderRadius: 12,
            border: '1px solid var(--user-border)', background: 'transparent',
            color: 'var(--text-secondary)', fontWeight: 600, fontSize: 14, cursor: 'pointer',
          }}>
          Continue with Free Tier
        </button>
      </div>
    </div>
  );
}

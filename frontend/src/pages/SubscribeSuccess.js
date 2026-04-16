import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import API from '../api';
import { CheckCircle, Loader } from 'lucide-react';

export default function SubscribeSuccess() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('checking');
  const { checkAuth } = useAuth();
  const navigate = useNavigate();
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    if (!sessionId) { setStatus('error'); return; }
    let attempts = 0;
    const poll = async () => {
      if (attempts >= 5) { setStatus('timeout'); return; }
      attempts++;
      try {
        const { data } = await API.get(`/api/stripe/status/${sessionId}`);
        if (data.payment_status === 'paid') {
          setStatus('success');
          await checkAuth(); // refresh user tier
        } else if (data.status === 'expired') {
          setStatus('expired');
        } else {
          setTimeout(poll, 2000);
        }
      } catch {
        setTimeout(poll, 2000);
      }
    };
    poll();
  }, [sessionId, checkAuth]);

  return (
    <div data-testid="subscribe-success" style={{
      minHeight: '100vh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div className="animate-fade-in-up" style={{ textAlign: 'center', maxWidth: 420 }}>
        {status === 'checking' && (
          <>
            <Loader size={40} color="var(--gold)" style={{ animation: 'spin 1s linear infinite' }} />
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)', marginTop: 16 }}>Verifying payment...</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>Please wait a moment</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle size={56} color="#22c55e" />
            <h2 style={{ fontSize: 26, fontWeight: 800, color: 'var(--navy)', marginTop: 16 }}>Welcome to Pro!</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: 8, fontSize: 15 }}>
              Unlimited events, geo alerts, and AI picks are now yours.
            </p>
            <button data-testid="go-to-feed" onClick={() => navigate('/')}
              style={{
                marginTop: 24, padding: '14px 32px', borderRadius: 12, border: 'none',
                background: 'var(--gold)', color: 'var(--admin-bg)', fontWeight: 700, fontSize: 15, cursor: 'pointer',
              }}>
              Start Exploring
            </button>
          </>
        )}
        {(status === 'error' || status === 'timeout' || status === 'expired') && (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)', marginTop: 16 }}>
              {status === 'expired' ? 'Session expired' : 'Something went wrong'}
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>Please try again or contact support.</p>
            <button onClick={() => navigate('/subscribe')}
              style={{
                marginTop: 24, padding: '12px 28px', borderRadius: 12, border: '1px solid var(--user-border)',
                background: 'white', color: 'var(--navy)', fontWeight: 600, fontSize: 14, cursor: 'pointer',
              }}>
              Try Again
            </button>
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

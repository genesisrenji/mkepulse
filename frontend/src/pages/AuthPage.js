import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { formatError } from '../api';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) {
        const data = await login(email, password);
        navigate(data.role === 'admin' || data.role === 'superadmin' ? '/admin' : '/');
      } else {
        await register(email, password, name);
        navigate('/onboarding');
      }
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(formatError(detail) || err.message || 'Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-testid="auth-page" style={{ minHeight: '100vh', background: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="animate-fade-in-up" style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 42, fontWeight: 800, color: 'var(--navy)', letterSpacing: '-0.03em', lineHeight: 1 }}>
            MKE<span style={{ color: 'var(--gold)' }}>pulse</span>
          </div>
          <div style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: 15, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 500 }}>
            Milwaukee Events Live
          </div>
        </div>

        {/* Card */}
        <div style={{ background: 'white', borderRadius: 16, padding: '36px 32px', border: '1px solid var(--user-border)', boxShadow: '0 4px 24px rgba(14,34,64,0.06)' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', marginBottom: 28, background: 'rgba(14,34,64,0.04)', borderRadius: 10, padding: 3 }}>
            {['Sign In', 'Sign Up'].map((label, i) => (
              <button key={label} data-testid={i === 0 ? 'tab-login' : 'tab-register'}
                onClick={() => { setIsLogin(i === 0); setError(''); }}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontWeight: 600, fontSize: 14, transition: 'all 0.2s',
                  background: (i === 0 ? isLogin : !isLogin) ? 'var(--navy)' : 'transparent',
                  color: (i === 0 ? isLogin : !isLogin) ? 'white' : 'var(--text-secondary)',
                }}>
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit}>
            {!isLogin && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Name</label>
                <input data-testid="input-name" type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Your name" style={inputStyle} />
              </div>
            )}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Email</label>
              <input data-testid="input-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" required style={inputStyle} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input data-testid="input-password" type={showPw ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="Enter password" required
                  style={{ ...inputStyle, paddingRight: 44 }} />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div data-testid="auth-error" style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 500 }}>
                {error}
              </div>
            )}

            <button data-testid="auth-submit" type="submit" disabled={loading}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 10, border: 'none',
                background: 'var(--gold)', color: 'var(--admin-bg)', fontWeight: 700,
                fontSize: 15, cursor: loading ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.2s', opacity: loading ? 0.7 : 1,
              }}>
              {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, color: 'var(--text-secondary)', fontSize: 13 }}>
          Real-time events across Milwaukee
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--user-border)',
  fontSize: 14, outline: 'none', background: 'var(--cream)', transition: 'border 0.2s',
  fontFamily: 'inherit',
};

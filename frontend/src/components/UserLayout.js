import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Zap, Map, Car, Bell, User, LogOut, Menu, X, Shield } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', icon: Zap, label: 'Feed', end: true },
  { to: '/map', icon: Map, label: 'Map' },
  { to: '/parking', icon: Car, label: 'Parking' },
  { to: '/alerts', icon: Bell, label: 'Alerts' },
  { to: '/profile', icon: User, label: 'Profile' },
];

export default function UserLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  const handleLogout = async () => { await logout(); navigate('/auth'); };

  return (
    <div data-testid="user-layout" style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Desktop Sidebar */}
      <aside style={{
        width: 220, background: 'var(--navy)', color: 'white', display: 'flex', flexDirection: 'column',
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
      }} className="sidebar-desktop">
        <div style={{ padding: '28px 20px 20px' }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>
            MKE<span style={{ color: 'var(--gold)' }}>pulse</span>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.15em' }}>
            {user?.tier === 'pro' ? 'Pro Member' : 'Free Tier'}
          </div>
        </div>

        <nav style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV_ITEMS.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end} data-testid={`nav-${item.label.toLowerCase()}`}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10,
                color: isActive ? 'white' : 'rgba(255,255,255,0.6)', textDecoration: 'none',
                background: isActive ? 'rgba(196,151,59,0.15)' : 'transparent',
                fontWeight: isActive ? 700 : 500, fontSize: 14, transition: 'all 0.2s',
              })}>
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}

          {isAdmin && (
            <NavLink to="/admin" data-testid="nav-admin"
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10,
                color: 'var(--gold)', textDecoration: 'none', fontWeight: 600, fontSize: 14,
                marginTop: 8, border: '1px solid rgba(196,151,59,0.3)',
              }}>
              <Shield size={18} /> Admin Portal
            </NavLink>
          )}
        </nav>

        <div style={{ padding: '12px 10px 20px' }}>
          <div style={{ padding: '10px 14px', fontSize: 13, color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.name || user?.email}
          </div>
          <button data-testid="logout-btn" onClick={handleLogout}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer', fontSize: 13, fontWeight: 500, transition: 'all 0.2s',
            }}>
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="mobile-header" style={{
        display: 'none', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        background: 'var(--navy)', padding: '12px 16px', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ color: 'white', fontSize: 22, fontWeight: 800 }}>MKE<span style={{ color: 'var(--gold)' }}>pulse</span></div>
        <button onClick={() => setMobileOpen(!mobileOpen)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <div style={{
          position: 'fixed', top: 52, left: 0, right: 0, bottom: 0, background: 'var(--navy)', zIndex: 49, padding: 16,
        }}>
          {NAV_ITEMS.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end}
              onClick={() => setMobileOpen(false)}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 10,
                color: isActive ? 'white' : 'rgba(255,255,255,0.6)', textDecoration: 'none',
                fontWeight: isActive ? 700 : 500, fontSize: 15,
              })}>
              <item.icon size={20} /> {item.label}
            </NavLink>
          ))}
        </div>
      )}

      {/* Main Content */}
      <main style={{ flex: 1, marginLeft: 220, background: 'var(--cream)', minHeight: '100vh' }}>
        <div style={{ padding: '28px 32px', maxWidth: 1200 }}>
          <Outlet />
        </div>
      </main>

      <style>{`
        @media (max-width: 768px) {
          .sidebar-desktop { display: none !important; }
          .mobile-header { display: flex !important; }
          main { margin-left: 0 !important; padding-top: 52px !important; }
        }
      `}</style>
    </div>
  );
}

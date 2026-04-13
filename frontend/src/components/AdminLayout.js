import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { LayoutDashboard, Users, Calendar, Bell, Car, Bot, DollarSign, ArrowLeft } from 'lucide-react';

const ADMIN_NAV = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/users', icon: Users, label: 'Users' },
  { to: '/admin/events', icon: Calendar, label: 'Events' },
  { to: '/admin/alerts', icon: Bell, label: 'Alerts' },
  { to: '/admin/parking', icon: Car, label: 'Parking' },
  { to: '/admin/agent', icon: Bot, label: 'AI Agent' },
  { to: '/admin/revenue', icon: DollarSign, label: 'Revenue' },
];

export default function AdminLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div data-testid="admin-layout" style={{ display: 'flex', minHeight: '100vh', background: 'var(--admin-bg)' }}>
      {/* Admin Sidebar */}
      <aside style={{
        width: 240, background: 'var(--admin-bg)', borderRight: '1px solid var(--admin-border)',
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '24px 20px 16px' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--admin-text)', letterSpacing: '-0.02em' }}>
            MKE<span style={{ color: 'var(--gold)' }}>pulse</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 600 }}>
            Admin Portal
          </div>
        </div>

        <nav style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {ADMIN_NAV.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end} data-testid={`admin-nav-${item.label.toLowerCase()}`}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 8,
                color: isActive ? 'var(--gold)' : 'var(--admin-text-secondary)', textDecoration: 'none',
                background: isActive ? 'rgba(196,151,59,0.1)' : 'transparent',
                fontWeight: isActive ? 700 : 500, fontSize: 14, transition: 'all 0.15s',
              })}>
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '12px 10px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button data-testid="admin-back-to-app" onClick={() => navigate('/')}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8,
              border: '1px solid var(--admin-border)', background: 'transparent',
              color: 'var(--admin-text-secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 500, width: '100%',
            }}>
            <ArrowLeft size={16} /> Back to App
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, marginLeft: 240, padding: '28px 32px', minHeight: '100vh' }}>
        <Outlet />
      </main>
    </div>
  );
}

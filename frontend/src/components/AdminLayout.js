import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { LayoutDashboard, Users, Calendar, Bell, Car, Bot, DollarSign, ArrowLeft, BarChart3, Settings, Menu, X } from 'lucide-react';

const ADMIN_NAV = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/admin/users', icon: Users, label: 'Users' },
  { to: '/admin/events', icon: Calendar, label: 'Events' },
  { to: '/admin/alerts', icon: Bell, label: 'Alerts' },
  { to: '/admin/parking', icon: Car, label: 'Parking' },
  { to: '/admin/agent', icon: Bot, label: 'AI Agent' },
  { to: '/admin/revenue', icon: DollarSign, label: 'Revenue' },
  { to: '/admin/settings', icon: Settings, label: 'Settings' },
];

export default function AdminLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navContent = (
    <>
      <div style={{ padding: '24px 20px 16px' }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--admin-text)', letterSpacing: '-0.02em' }}>
          MKE<span style={{ color: 'var(--gold)' }}>pulse</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 600 }}>
          Admin Portal
        </div>
      </div>
      <nav style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        {ADMIN_NAV.map(item => (
          <NavLink key={item.to} to={item.to} end={item.end} data-testid={`admin-nav-${item.label.toLowerCase()}`}
            onClick={() => setDrawerOpen(false)}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 8,
              color: isActive ? 'var(--gold)' : 'var(--admin-text-secondary)', textDecoration: 'none',
              background: isActive ? 'rgba(196,151,59,0.1)' : 'transparent',
              fontWeight: isActive ? 700 : 500, fontSize: 14, transition: 'all 0.15s',
            })}>
            <item.icon size={18} /> {item.label}
          </NavLink>
        ))}
      </nav>
      <div style={{ padding: '12px 10px 20px' }}>
        <button data-testid="admin-back-to-app" onClick={() => { setDrawerOpen(false); navigate('/'); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8,
            border: '1px solid var(--admin-border)', background: 'transparent',
            color: 'var(--admin-text-secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 500, width: '100%',
          }}>
          <ArrowLeft size={16} /> Back to App
        </button>
      </div>
    </>
  );

  return (
    <div data-testid="admin-layout" style={{ display: 'flex', minHeight: '100vh', background: 'var(--admin-bg)' }}>
      {/* Desktop Sidebar */}
      <aside className="admin-sidebar-desktop" style={{
        width: 'var(--admin-sidebar-width)', background: 'var(--admin-bg)',
        borderRight: '1px solid var(--admin-border)',
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
        display: 'flex', flexDirection: 'column',
      }}>
        {navContent}
      </aside>

      {/* Mobile Header */}
      <header className="admin-mobile-header" style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 51,
        height: 56, background: 'var(--admin-bg)', borderBottom: '1px solid var(--admin-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px',
      }}>
        <button onClick={() => setDrawerOpen(!drawerOpen)} style={{
          background: 'none', border: 'none', color: 'var(--admin-text)', cursor: 'pointer', padding: 8,
        }}>
          {drawerOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--admin-text)' }}>
          MKE<span style={{ color: 'var(--gold)' }}>pulse</span>
          <span style={{ fontSize: 10, color: 'var(--gold)', marginLeft: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Admin</span>
        </div>
        <div style={{ width: 40 }} />
      </header>

      {/* Mobile Drawer Overlay */}
      {drawerOpen && (
        <div onClick={() => setDrawerOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 52,
        }} />
      )}

      {/* Mobile Drawer */}
      <aside className="admin-mobile-drawer" style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: 260, zIndex: 53,
        background: 'var(--admin-bg)', borderRight: '1px solid var(--admin-border)',
        display: 'flex', flexDirection: 'column',
        transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s ease',
      }}>
        {navContent}
      </aside>

      {/* Main Content */}
      <main className="admin-main" style={{ flex: 1, marginLeft: 'var(--admin-sidebar-width)', padding: '28px 32px', minHeight: '100vh' }}>
        <Outlet />
      </main>

      <style>{`
        .admin-sidebar-desktop { display: flex; }
        .admin-mobile-header { display: none !important; }
        .admin-mobile-drawer { display: none; }

        @media (max-width: 768px) {
          .admin-sidebar-desktop { display: none !important; }
          .admin-mobile-header { display: flex !important; }
          .admin-mobile-drawer { display: flex !important; }
          .admin-main {
            margin-left: 0 !important;
            padding: 72px 16px 16px !important;
          }
        }
      `}</style>
    </div>
  );
}

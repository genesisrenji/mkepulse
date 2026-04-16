import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Zap, Map, Car, Bell, User, LogOut, Shield, Lock, Crown } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', icon: Zap, label: 'Feed', end: true, proOnly: false },
  { to: '/map', icon: Map, label: 'Map', proOnly: true },
  { to: '/parking', icon: Car, label: 'Parking', proOnly: true },
  { to: '/alerts', icon: Bell, label: 'Alerts', proOnly: false },
  { to: '/profile', icon: User, label: 'Profile', proOnly: false },
];

export default function UserLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const isPro = user?.tier === 'pro';

  const handleLogout = async () => { await logout(); navigate('/auth'); };

  const handleNavClick = (e, item) => {
    if (item.proOnly && !isPro) { e.preventDefault(); navigate('/subscribe'); }
  };

  return (
    <div data-testid="user-layout" style={{ display: 'flex', minHeight: '100vh' }}>
      {/* ===== Desktop Sidebar ===== */}
      <aside className="desktop-sidebar" style={{
        width: 'var(--sidebar-width)', background: 'var(--navy)', color: 'white',
        display: 'flex', flexDirection: 'column',
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
      }}>
        <div style={{ padding: '28px 20px 20px' }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>
            MKE<span style={{ color: 'var(--gold)' }}>pulse</span>
          </div>
          <div style={{ fontSize: 11, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.15em', display: 'flex', alignItems: 'center', gap: 6 }}>
            {isPro
              ? <span style={{ color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 4 }}><Crown size={12} /> Pro Member</span>
              : <span style={{ color: 'rgba(255,255,255,0.5)' }}>Free Tier</span>}
          </div>
        </div>

        <nav style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV_ITEMS.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end} data-testid={`nav-${item.label.toLowerCase()}`}
              onClick={(e) => handleNavClick(e, item)}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10,
                color: isActive ? 'white' : 'rgba(255,255,255,0.6)', textDecoration: 'none',
                background: isActive ? 'rgba(196,151,59,0.15)' : 'transparent',
                fontWeight: isActive ? 700 : 500, fontSize: 14, transition: 'all 0.2s',
                opacity: (item.proOnly && !isPro) ? 0.5 : 1,
              })}>
              <item.icon size={18} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.proOnly && !isPro && <Lock size={12} style={{ opacity: 0.5 }} />}
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink to="/admin" data-testid="nav-admin" style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10,
              color: 'var(--gold)', textDecoration: 'none', fontWeight: 600, fontSize: 14,
              marginTop: 8, border: '1px solid rgba(196,151,59,0.3)',
            }}>
              <Shield size={18} /> Admin Portal
            </NavLink>
          )}
        </nav>

        <div style={{ padding: '12px 10px 20px' }}>
          {!isPro && (
            <button data-testid="sidebar-upgrade" onClick={() => navigate('/subscribe')} style={{
              width: '100%', padding: '10px 14px', borderRadius: 10, border: 'none',
              background: 'var(--gold)', color: 'var(--admin-bg)', fontWeight: 700, fontSize: 13,
              cursor: 'pointer', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <Zap size={14} /> Upgrade to Pro
            </button>
          )}
          <div style={{ padding: '10px 14px', fontSize: 13, color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.name || user?.email}
          </div>
          <button data-testid="logout-btn" onClick={handleLogout} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
            borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
            cursor: 'pointer', fontSize: 13, fontWeight: 500,
          }}>
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </aside>

      {/* ===== Mobile Top Bar ===== */}
      <header className="mobile-topbar" style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        height: 'var(--mobile-header-h)', background: 'var(--navy)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px',
      }}>
        <div style={{ color: 'white', fontSize: 22, fontWeight: 800 }}>
          MKE<span style={{ color: 'var(--gold)' }}>pulse</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {!isPro && (
            <button onClick={() => navigate('/subscribe')} style={{
              padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--gold)',
              color: 'var(--admin-bg)', fontWeight: 700, fontSize: 11, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <Zap size={12} /> Pro
            </button>
          )}
          {isAdmin && (
            <button onClick={() => navigate('/admin')} style={{
              padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(196,151,59,0.4)',
              background: 'transparent', color: 'var(--gold)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}>
              <Shield size={14} />
            </button>
          )}
        </div>
      </header>

      {/* ===== Main Content ===== */}
      <main className="user-main">
        <div className="page-content" style={{ padding: '28px 32px', maxWidth: 1200 }}>
          <Outlet />
        </div>
      </main>

      {/* ===== Mobile Bottom Tab Bar ===== */}
      <nav className="mobile-tabs" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        height: 'calc(var(--mobile-tab-h) + var(--safe-bottom))',
        paddingBottom: 'var(--safe-bottom)',
        background: 'var(--navy)', borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
      }}>
        {NAV_ITEMS.map(item => (
          <MobileTab key={item.to} item={item} isPro={isPro} onGate={(e) => handleNavClick(e, item)} />
        ))}
      </nav>

      {/* ===== Responsive Styles ===== */}
      <style>{`
        .desktop-sidebar { display: flex; }
        .mobile-topbar { display: none !important; }
        .mobile-tabs { display: none !important; }
        .user-main { flex: 1; margin-left: var(--sidebar-width); background: var(--cream); min-height: 100vh; }

        @media (max-width: 768px) {
          .desktop-sidebar { display: none !important; }
          .mobile-topbar { display: flex !important; }
          .mobile-tabs { display: flex !important; }
          .user-main {
            margin-left: 0 !important;
            padding-top: var(--mobile-header-h) !important;
            padding-bottom: calc(var(--mobile-tab-h) + var(--safe-bottom)) !important;
          }
          .user-main .page-content {
            padding: 16px !important;
          }
        }
      `}</style>
    </div>
  );
}


function MobileTab({ item, isPro, onGate }) {
  return (
    <NavLink to={item.to} end={item.end} onClick={onGate}
      data-testid={`tab-${item.label.toLowerCase()}`}
      style={{ textDecoration: 'none' }}>
      {({ isActive }) => (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          padding: '8px 12px', borderRadius: 10,
          color: isActive ? 'var(--gold)' : 'rgba(255,255,255,0.5)',
          transition: 'color 0.15s', position: 'relative', minWidth: 56,
        }}>
          <item.icon size={22} strokeWidth={isActive ? 2.5 : 1.5}
            style={{ transition: 'transform 0.15s', transform: isActive ? 'scale(1.1)' : 'scale(1)' }}
          />
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.02em' }}>{item.label}</span>
          {item.proOnly && !isPro && (
            <Lock size={8} style={{ position: 'absolute', top: 6, right: 8, opacity: 0.5 }} />
          )}
        </div>
      )}
    </NavLink>
  );
}

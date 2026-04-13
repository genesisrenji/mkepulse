import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './components/AuthContext';
import AuthPage from './pages/AuthPage';
import OnboardingQuiz from './pages/OnboardingQuiz';
import UserLayout from './components/UserLayout';
import AdminLayout from './components/AdminLayout';
import FeedPage from './pages/FeedPage';
import MapPage from './pages/MapPage';
import ParkingPage from './pages/ParkingPage';
import AlertsPage from './pages/AlertsPage';
import ProfilePage from './pages/ProfilePage';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminEvents from './pages/admin/AdminEvents';
import AdminAlerts from './pages/admin/AdminAlerts';
import AdminParking from './pages/admin/AdminParking';
import AdminAgent from './pages/admin/AdminAgent';
import AdminRevenue from './pages/admin/AdminRevenue';
import './App.css';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/auth" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/auth" replace />;
  if (user.role !== 'admin' && user.role !== 'superadmin') return <Navigate to="/" replace />;
  return children;
}

function LoadingScreen() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--cream)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--navy)', letterSpacing: '-0.02em' }}>MKE<span style={{ color: 'var(--gold)' }}>pulse</span></div>
        <div style={{ marginTop: 12, color: 'var(--text-secondary)', fontSize: 14 }}>Loading...</div>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;

  return (
    <Routes>
      <Route path="/auth" element={user ? <Navigate to="/" replace /> : <AuthPage />} />
      <Route path="/onboarding" element={<ProtectedRoute><OnboardingQuiz /></ProtectedRoute>} />

      {/* User routes */}
      <Route path="/" element={<ProtectedRoute><UserLayout /></ProtectedRoute>}>
        <Route index element={<FeedPage />} />
        <Route path="map" element={<MapPage />} />
        <Route path="parking" element={<ParkingPage />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      {/* Admin routes */}
      <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="events" element={<AdminEvents />} />
        <Route path="alerts" element={<AdminAlerts />} />
        <Route path="parking" element={<AdminParking />} />
        <Route path="agent" element={<AdminAgent />} />
        <Route path="revenue" element={<AdminRevenue />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import API from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = not auth'd
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const { data } = await API.get('/api/auth/me');
      setUser(data);
    } catch {
      setUser(false);
      localStorage.removeItem('mkepulse_token');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const login = async (email, password) => {
    const { data } = await API.post('/api/auth/login', { email, password });
    if (data.token) localStorage.setItem('mkepulse_token', data.token);
    setUser(data);
    return data;
  };

  const register = async (email, password, name) => {
    const { data } = await API.post('/api/auth/register', { email, password, name });
    if (data.token) localStorage.setItem('mkepulse_token', data.token);
    setUser(data);
    return data;
  };

  const logout = async () => {
    try { await API.post('/api/auth/logout'); } catch {}
    localStorage.removeItem('mkepulse_token');
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

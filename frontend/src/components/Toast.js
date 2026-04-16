import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { MapPin, X, Car, Zap, AlertTriangle } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((toast) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [{ ...toast, id }, ...prev].slice(0, 5));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, toast.duration || 6000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div data-testid="toast-container" style={{
        position: 'fixed', top: 16, right: 16, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 380, width: '100%',
      }}>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const TOAST_STYLES = {
  proximity: { bg: 'linear-gradient(135deg, #0E2240, #1a3560)', icon: MapPin, color: '#C4973B' },
  capacity: { bg: 'linear-gradient(135deg, #7f1d1d, #991b1b)', icon: AlertTriangle, color: '#fca5a5' },
  parking: { bg: 'linear-gradient(135deg, #0E2240, #1a3560)', icon: Car, color: '#22c55e' },
  event: { bg: 'linear-gradient(135deg, #0E2240, #1a3560)', icon: Zap, color: '#C4973B' },
  default: { bg: 'linear-gradient(135deg, #0E2240, #1a3560)', icon: Zap, color: '#C4973B' },
};

function ToastItem({ toast, onClose }) {
  const style = TOAST_STYLES[toast.type] || TOAST_STYLES.default;
  const Icon = style.icon;

  return (
    <div data-testid="toast-item" className="animate-slide-in"
      style={{
        background: style.bg, borderRadius: 12, padding: '14px 16px',
        display: 'flex', gap: 12, alignItems: 'flex-start',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
      }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, background: `${style.color}20`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={16} color={style.color} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'white' }}>{toast.title}</div>
        {toast.description && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 3, lineHeight: 1.4 }}>{toast.description}</div>
        )}
      </div>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', flexShrink: 0 }}>
        <X size={16} />
      </button>
    </div>
  );
}

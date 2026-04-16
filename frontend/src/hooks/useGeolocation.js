import { useState, useEffect, useRef } from 'react';
import API from '../api';

export function useGeolocation(isPro) {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const watchRef = useRef(null);

  useEffect(() => {
    if (!isPro || !navigator.geolocation) return;

    const onSuccess = (pos) => {
      const { latitude, longitude } = pos.coords;
      setPosition({ lat: latitude, lng: longitude });
      // POST to server
      API.post('/api/geo/update', { lat: latitude, lng: longitude }).catch(() => {});
    };

    const onError = (err) => {
      setError(err.message);
    };

    watchRef.current = navigator.geolocation.watchPosition(onSuccess, onError, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 60000,
    });

    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
      }
    };
  }, [isPro]);

  return { position, error };
}

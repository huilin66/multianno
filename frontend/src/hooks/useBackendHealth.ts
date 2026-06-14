import { useEffect, useRef } from 'react';
import { API_BASE_URL } from '../api/client';
import { toast } from '../store/useToastStore';

const HEALTH_CHECK_INTERVAL = 30000;
const RECONNECT_BACKOFF_BASE = 2000;
const RECONNECT_BACKOFF_MAX = 30000;

export function useBackendHealth() {
  const wasDisconnectedRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${API_BASE_URL}/project/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folders: [] }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok || res.status === 422) {
          // Backend is reachable (422 = validation error, which is fine for health check)
          reconnectAttemptRef.current = 0;
          if (wasDisconnectedRef.current) {
            wasDisconnectedRef.current = false;
            toast.success('Backend reconnected');
          }
          return true;
        }
        return false;
      } catch {
        return false;
      }
    };

    const onDisconnected = () => {
      if (!wasDisconnectedRef.current) {
        wasDisconnectedRef.current = true;
        toast.error('Backend connection lost. Reconnecting...');
      }
      scheduleReconnect();
    };

    const scheduleReconnect = () => {
      if (reconnectTimerRef.current) return;
      const delay = Math.min(
        RECONNECT_BACKOFF_BASE * Math.pow(2, reconnectAttemptRef.current),
        RECONNECT_BACKOFF_MAX
      );
      reconnectAttemptRef.current += 1;
      reconnectTimerRef.current = setTimeout(async () => {
        reconnectTimerRef.current = null;
        const ok = await checkHealth();
        if (ok) {
          reconnectAttemptRef.current = 0;
          if (wasDisconnectedRef.current) {
            wasDisconnectedRef.current = false;
            toast.success('Backend reconnected');
          }
        } else {
          onDisconnected();
        }
      }, delay);
    };

    const runCheck = async () => {
      const ok = await checkHealth();
      if (ok) {
        wasDisconnectedRef.current = false;
      } else {
        onDisconnected();
      }
    };

    // Run initial check
    runCheck();
    intervalRef.current = setInterval(runCheck, HEALTH_CHECK_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, []);
}

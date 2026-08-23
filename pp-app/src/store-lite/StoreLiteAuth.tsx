import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthSession } from '../types/api';
import {
  fetchStoreLiteSession,
  logoutStoreLiteSession,
  requestStoreLitePhoneCode,
  verifyStoreLitePhone,
} from './storeLiteService';
import { storeLiteAuthExpiredEvent } from './storeLiteHttp';

type StoreLiteAuthContextValue = {
  session: AuthSession | null;
  loading: boolean;
  error: string;
  requestCode: (phone: string) => ReturnType<typeof requestStoreLitePhoneCode>;
  login: (phone: string, code: string) => Promise<AuthSession>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const StoreLiteAuthContext = createContext<StoreLiteAuthContextValue | null>(null);

export function StoreLiteAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSession(await fetchStoreLiteSession());
      setError('');
    } catch (cause) {
      setSession(null);
      setError(cause instanceof Error ? cause.message : '登录状态加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchStoreLiteSession()
      .then((nextSession) => {
        if (!active) return;
        setSession(nextSession);
        setError('');
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setSession(null);
        setError(cause instanceof Error ? cause.message : '登录状态加载失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleExpiredSession = () => {
      setSession(null);
      setError('登录已过期，请重新登录');
    };
    window.addEventListener(storeLiteAuthExpiredEvent, handleExpiredSession);
    return () => window.removeEventListener(storeLiteAuthExpiredEvent, handleExpiredSession);
  }, []);

  const value = useMemo<StoreLiteAuthContextValue>(
    () => ({
      session,
      loading,
      error,
      requestCode: requestStoreLitePhoneCode,
      login: async (phone, code) => {
        const nextSession = await verifyStoreLitePhone(phone, code);
        setSession(nextSession);
        setError('');
        return nextSession;
      },
      logout: async () => {
        await logoutStoreLiteSession();
        setSession(null);
      },
      refresh,
    }),
    [error, loading, refresh, session],
  );

  return <StoreLiteAuthContext.Provider value={value}>{children}</StoreLiteAuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStoreLiteAuth() {
  const value = useContext(StoreLiteAuthContext);
  if (!value) throw new Error('useStoreLiteAuth must be used within StoreLiteAuthProvider');
  return value;
}

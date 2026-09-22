import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

function isLikelyNetworkAuthError(err) {
  const msg = String(err?.message || err || '');
  const name = String(err?.name || '');
  return (
    name === 'AuthRetryableFetchError' ||
    /failed to fetch|network|timeout|temporar|offline|load failed|fetch/i.test(msg)
  );
}

function sessionBootMessage(err) {
  if (isLikelyNetworkAuthError(err)) {
    return 'No se pudo verificar la sesión (problema de red). Reintenta.';
  }
  return err?.message || 'No se pudo verificar la sesión. Reintenta.';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const applySession = useCallback((s) => {
    setSession(s);
    setUser(s?.user ?? null);
  }, []);

  const refreshSession = useCallback(async () => {
    setLoading(true);
    setAuthError(null);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      applySession(data?.session ?? null);
    } catch (err) {
      // No forzar logout: conservar sesión previa si existía; en boot sigue null.
      setAuthError(sessionBootMessage(err));
    } finally {
      setLoading(false);
    }
  }, [applySession]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (error) throw error;
        applySession(data?.session ?? null);
        setAuthError(null);
      } catch (err) {
        if (cancelled) return;
        setAuthError(sessionBootMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      applySession(s);
      setAuthError(null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [applySession]);

  const login = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(error.message);
    setAuthError(null);
    return data;
  }, []);

  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
    setAuthError(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      authError,
      refreshSession,
      login,
      logout,
    }),
    [user, session, loading, authError, refreshSession, login, logout]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return ctx;
}

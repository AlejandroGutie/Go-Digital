import { useCallback, useRef } from 'react';

/**
 * Candado síncrono contra doble clic en mutaciones.
 * El `disabled={loading}` del botón no alcanza: el 2.º clic puede entrar
 * antes del re-render.
 */
export function useMutationLock() {
  const lockRef = useRef(false);

  const tryLock = useCallback(() => {
    if (lockRef.current) return false;
    lockRef.current = true;
    return true;
  }, []);

  const unlock = useCallback(() => {
    lockRef.current = false;
  }, []);

  return { tryLock, unlock };
}

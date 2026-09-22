/**
 * Destino post-login seguro (solo rutas internas de HashRouter).
 * Evita open-redirects (//evil.com, http:, javascript:, etc.).
 */
export function safeReturnPath(raw, fallback = '/agendas') {
  if (raw == null) return fallback;
  let path = String(raw).trim();
  try {
    path = decodeURIComponent(path);
  } catch {
    return fallback;
  }
  path = path.trim();
  if (!path.startsWith('/')) return fallback;
  if (path.startsWith('//')) return fallback;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) return fallback;
  if (path === '/login' || path.startsWith('/login?') || path.startsWith('/login#')) {
    return fallback;
  }
  // Solo path + query internos (evitar open-redirect)
  if (!/^\/[A-Za-z0-9/_.?=&#%-]*$/.test(path)) return fallback;
  return path;
}

export function buildLoginPath(returnPath) {
  const safe = safeReturnPath(returnPath);
  if (safe === '/agendas' || safe === '/') {
    return '/login';
  }
  return `/login?returnUrl=${encodeURIComponent(safe)}`;
}

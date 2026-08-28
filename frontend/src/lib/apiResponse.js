/**
 * Helpers para mantener el contrato de respuesta que esperan las páginas
 * ({ status, data, meta }) tras migrar de Express a Supabase.
 */

export function successList(data, count, page, limit) {
  const total = count ?? data.length;
  const pages = Math.ceil(total / limit) || 0;
  return { status: 'success', data, meta: { total, page, pages } };
}

export function successOk(data) {
  return { status: 'ok', data };
}

export function successOne(row) {
  return {
    status: 'success',
    data: [row],
    meta: { total: 1, page: 1, pages: 1 },
  };
}

export function throwIfError(error, fallbackMsg = 'Error en la operación') {
  if (!error) return;
  if (error.code === '23505') {
    throw new Error('Registro duplicado');
  }
  if (error.code === 'PGRST116') {
    throw new Error('Registro no encontrado');
  }
  if (error.code === '42501') {
    throw new Error(
      'No tienes permiso para esta operación. Revisa las políticas RLS en Supabase.'
    );
  }
  if (error.code === '23503') {
    throw new Error(
      'No se puede eliminar: existen registros relacionados que lo impiden.'
    );
  }
  throw new Error(error.message || fallbackMsg);
}

/** Tope alineado con el máximo por request de PostgREST/Supabase (1000). */
const MAX_PAGE_LIMIT = 1000;

export function pageRange(page = 1, limit = 20) {
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(MAX_PAGE_LIMIT, Math.max(1, limit));
  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;
  return { from, to, page: safePage, limit: safeLimit };
}

export function escapeIlike(term) {
  return String(term).replace(/[%_\\]/g, '\\$&');
}

/**
 * Elimina caracteres que rompen el filtro `.or(...)` de PostgREST.
 */
export function sanitizePostgrestOrTerm(term) {
  return String(term ?? '')
    .replace(/[,.()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

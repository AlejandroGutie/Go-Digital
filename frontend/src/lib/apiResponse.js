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
  // Exclusion constraint (solape de agenda) o mensajes del trigger
  if (
    error.code === '23P01' ||
    /exclusion|solapa|overlap|agenda_no_solape/i.test(error.message || '')
  ) {
    throw new Error(
      'Ya existe una cita que se solapa en ese horario. Elige otra fecha o franja.'
    );
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
 * Elimina caracteres que rompen o inyectan sintaxis en filtros `.or(...)` de PostgREST.
 * Conserva letras, dígitos, espacios y puntuación segura para búsqueda de texto.
 */
export function sanitizePostgrestOrTerm(term) {
  return String(term ?? '')
    .replace(/[,.()*:!&|@{}[\]"'\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/** Solo enteros positivos (para .in / .eq en PostgREST). */
export function positiveIntIds(ids = []) {
  return [
    ...new Set(
      (Array.isArray(ids) ? ids : [ids])
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n) && n > 0)
    ),
  ];
}

/**
 * Fragmento seguro `col.ilike.%term%` (term ya sanitizado + escapeIlike).
 * Columnas solo [a-z0-9_].
 */
export function ilikeOrFragment(column, sanitizedTerm) {
  const col = String(column || '');
  if (!/^[a-z][a-z0-9_]*$/i.test(col)) {
    throw new Error('Columna de filtro inválida');
  }
  const q = escapeIlike(sanitizePostgrestOrTerm(sanitizedTerm));
  if (!q) return '';
  return `${col}.ilike.%${q}%`;
}

/** Une fragmentos `.or` omitiendo vacíos. */
export function joinOrFragments(parts = []) {
  return (parts || []).filter(Boolean).join(',');
}

/**
 * Arma filtro `.or` solo con ilike sobre columnas allowlist.
 * @param {string[]} columns
 * @param {string} rawTerm
 */
export function buildIlikeOrFilter(columns, rawTerm) {
  const term = sanitizePostgrestOrTerm(rawTerm);
  if (!term) return '';
  const parts = (columns || []).map((c) => ilikeOrFragment(c, term)).filter(Boolean);
  return joinOrFragments(parts);
}

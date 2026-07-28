/**
 * Normaliza respuestas de listados: { data: [] } o array plano legacy.
 */
export function normalizeListPayload(res) {
  if (res == null) return [];
  if (Array.isArray(res)) return res;
  const d = res.data;
  if (Array.isArray(d)) return d;
  if (d != null && typeof d === 'object') return [d];
  return [];
}

/**
 * Meta de paginación; si falta, se infiere a partir de la lista y la página actual.
 */
export function normalizeMeta(res, page = 1, limit = 20) {
  const m = res?.meta;
  if (
    m &&
    typeof m.total === 'number' &&
    typeof m.page === 'number' &&
    typeof m.pages === 'number'
  ) {
    return m;
  }
  const list = normalizeListPayload(res);
  const total = list.length;
  const pages = total === 0 ? 0 : Math.max(1, Math.ceil(total / limit));
  return { total, page, pages };
}

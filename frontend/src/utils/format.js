/**
 * Extrae YYYY-MM-DD sin aplicar zona horaria.
 * Evita el bug de `new Date("YYYY-MM-DD")` (UTC → día anterior en CO).
 * Acepta también dd/mm/yyyy y dd-mm-yyyy (solo para lectura; el valor canónico sigue siendo ISO).
 */
export function toDateOnly(valor) {
  if (valor == null || valor === '') return '';
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const y = valor.getFullYear();
    const m = String(valor.getMonth() + 1).padStart(2, '0');
    const d = String(valor.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(valor).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
      return '';
    }
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = Number(dmy[3]);
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
      return '';
    }
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return '';
  return toDateOnly(parsed);
}

/** Fecha de hoy en calendario local (YYYY-MM-DD). */
export function hoyLocalISO() {
  return toDateOnly(new Date());
}

/**
 * Construye Date en zona local a partir de YYYY-MM-DD (o valor compatible).
 */
export function parseFechaLocal(valor) {
  const only = toDateOnly(valor);
  if (!only) return null;
  const [y, m, d] = only.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Formato visible de fechas en UI, tablas, mensajes y reportes: dd/mm/yyyy.
 * No altera el valor canónico ISO usado en APIs y filtros.
 */
export function formatFecha(iso) {
  const only = toDateOnly(iso);
  if (!only) return '—';
  const [y, m, d] = only.split('-');
  return `${d}/${m}/${y}`;
}

/** Alias de formatFecha (dd/mm/yyyy). */
export function formatFechaCorta(iso) {
  return formatFecha(iso);
}

/** Moneda COP (es-CO), formato único en UI y reportes. */
export function formatMoneda(valor) {
  if (valor == null || valor === '') return '—';
  const n = Number(valor);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(n);
}

/** true si ambas fechas existen y desde > hasta (ISO YYYY-MM-DD). */
export function rangoFechasInvalido(fechaDesde, fechaHasta) {
  if (!fechaDesde || !fechaHasta) return false;
  return String(fechaDesde) > String(fechaHasta);
}

// Formatos Hora
export function formatHora(timeStr) {
  if (!timeStr) return '—';

  const [horas, minutos] = String(timeStr).split(':');
  const hh = parseInt(horas, 10);
  const mm = parseInt(minutos, 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return '—';

  const date = new Date();
  date.setHours(hh, mm, 0, 0);

  const opciones = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };

  const horaFormateada = date.toLocaleTimeString('es-CO', opciones);
  return horaFormateada.replace(/\./g, '').toUpperCase();
}

/**
 * Extrae YYYY-MM-DD sin aplicar zona horaria.
 * Evita el bug de `new Date("YYYY-MM-DD")` (UTC → día anterior en CO).
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
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
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

// Formato Fechas (calendario local, sin desfase UTC)
export function formatFecha(iso) {
  if (!iso) return '—';
  const date = parseFechaLocal(iso);
  if (!date) return '—';

  const mesBruto = date.toLocaleDateString('es-CO', { month: 'long' });
  const mesMayuscula = mesBruto.charAt(0).toUpperCase() + mesBruto.slice(1);
  const dia = date.toLocaleDateString('es-CO', { day: '2-digit' });
  const anio = date.toLocaleDateString('es-CO', { year: 'numeric' });

  return `${dia} de ${mesMayuscula} de ${anio}`;
}

// Formatos Hora
export function formatHora(timeStr) {
  if (!timeStr) return '—';

  const [horas, minutos] = String(timeStr).split(':');
  const date = new Date();
  date.setHours(parseInt(horas, 10), parseInt(minutos, 10), 0, 0);

  const opciones = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };

  const horaFormateada = date.toLocaleTimeString('es-CO', opciones);
  return horaFormateada.replace(/\./g, '').toUpperCase();
}

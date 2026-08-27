/**
 * Helpers de horarios / slots de agenda (intervalos fijos).
 */

import { formatHora } from './format';

export const JORNADA_DEFAULT_INICIO = '08:00';
export const JORNADA_DEFAULT_FIN = '18:00';
/** Duración sugerida al elegir hora de inicio (minutos). */
export const DURACION_CITA_DEFAULT_MIN = 90;
export const INTERVALO_SLOT_MIN = 30;

/** "HH:MM" o "HH:MM:SS" → minutos desde medianoche. */
export function horaAMinutos(hora) {
  if (hora == null || hora === '') return null;
  const [h, m] = String(hora).split(':');
  const hh = parseInt(h, 10);
  const mm = parseInt(m, 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

/** Minutos → "HH:MM". */
export function minutosAHora(minutos) {
  if (minutos == null || Number.isNaN(Number(minutos))) return '';
  const total = ((Number(minutos) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Normaliza a "HH:MM" para value de Select / payload. */
export function toTimeHHMM(hora) {
  if (!hora) return '';
  const s = String(hora).trim();
  return s.length >= 5 ? s.slice(0, 5) : s;
}

export function jornadaDelProfesional(profesional) {
  const inicio = toTimeHHMM(profesional?.hora_inicio_jornada) || JORNADA_DEFAULT_INICIO;
  const fin = toTimeHHMM(profesional?.hora_fin_jornada) || JORNADA_DEFAULT_FIN;
  const a = horaAMinutos(inicio);
  const b = horaAMinutos(fin);
  if (a == null || b == null || b <= a) {
    return { inicio: JORNADA_DEFAULT_INICIO, fin: JORNADA_DEFAULT_FIN };
  }
  return { inicio, fin };
}

/**
 * Genera bloques HH:mm desde horaInicio hasta horaFin.
 * @param {object} [options]
 * @param {boolean} [options.includeEnd=false] — incluye horaFin si cae en el intervalo
 */
export function generarBloquesHorarios(
  horaInicio = JORNADA_DEFAULT_INICIO,
  horaFin = JORNADA_DEFAULT_FIN,
  intervaloMinutos = INTERVALO_SLOT_MIN,
  options = {}
) {
  const { includeEnd = false } = options;
  const step = Math.max(1, Number(intervaloMinutos) || INTERVALO_SLOT_MIN);
  let start = horaAMinutos(horaInicio);
  let end = horaAMinutos(horaFin);
  if (start == null) start = horaAMinutos(JORNADA_DEFAULT_INICIO);
  if (end == null) end = horaAMinutos(JORNADA_DEFAULT_FIN);
  if (start == null || end == null || end <= start) return [];

  const slots = [];
  for (let m = start; includeEnd ? m <= end : m < end; m += step) {
    slots.push(minutosAHora(m));
  }
  return slots;
}

export function sumarMinutosAHora(hora, minutos) {
  const base = horaAMinutos(hora);
  if (base == null) return '';
  return minutosAHora(base + Number(minutos || 0));
}

/** Sugiere hora fin = inicio + duración, acotada al fin de jornada. */
export function sugerirHoraFin(
  horaInicio,
  horaFinJornada = JORNADA_DEFAULT_FIN,
  duracionMin = DURACION_CITA_DEFAULT_MIN
) {
  const inicio = horaAMinutos(horaInicio);
  const finJornada = horaAMinutos(horaFinJornada);
  if (inicio == null) return '';
  const sugerido = inicio + (Number(duracionMin) || DURACION_CITA_DEFAULT_MIN);
  if (finJornada != null && sugerido > finJornada) {
    return minutosAHora(finJornada);
  }
  return minutosAHora(sugerido);
}

/**
 * Incluye un valor legacy (fuera de la grilla) para precargar edición.
 */
export function asegurarSlotEnLista(slots, valor) {
  const v = toTimeHHMM(valor);
  if (!v) return slots || [];
  const list = [...(slots || [])];
  if (!list.includes(v)) {
    list.push(v);
    list.sort((a, b) => (horaAMinutos(a) ?? 0) - (horaAMinutos(b) ?? 0));
  }
  return list;
}

export function labelHoraSlot(hora) {
  const hhmm = toTimeHHMM(hora);
  if (!hhmm) return '';
  const pretty = formatHora(hhmm);
  return pretty && pretty !== '—' ? `${pretty} (${hhmm})` : hhmm;
}

export function labelJornadaProfesional(profesional) {
  const { inicio, fin } = jornadaDelProfesional(profesional);
  return `${formatHora(inicio)} – ${formatHora(fin)}`;
}

function franjasSeSolapan(inicioA, finA, inicioB, finB) {
  const a0 = horaAMinutos(inicioA);
  const a1 = horaAMinutos(finA);
  const b0 = horaAMinutos(inicioB);
  const b1 = horaAMinutos(finB);
  if ([a0, a1, b0, b1].some((v) => v == null)) return false;
  return a0 < b1 && b0 < a1;
}

/**
 * Franjas libres dentro de la jornada (bloques de 30 min, agrupando consecutivos).
 * `citasActivas` = citas que ocupan cupo (p. ej. atendida = false).
 */
export function calcularFranjasLibres(
  jornada,
  citasActivas = [],
  intervaloMinutos = INTERVALO_SLOT_MIN
) {
  const inicio = jornada?.inicio ?? JORNADA_DEFAULT_INICIO;
  const fin = jornada?.fin ?? JORNADA_DEFAULT_FIN;
  const step = Math.max(1, Number(intervaloMinutos) || INTERVALO_SLOT_MIN);
  const startMin = horaAMinutos(inicio);
  const endMin = horaAMinutos(fin);
  if (startMin == null || endMin == null || endMin <= startMin) return [];

  const slotsLibres = [];
  for (let m = startMin; m + step <= endMin; m += step) {
    const slotStart = minutosAHora(m);
    const slotEnd = minutosAHora(m + step);
    const ocupado = citasActivas.some((c) =>
      franjasSeSolapan(slotStart, slotEnd, c.hora_inicio, c.hora_fin)
    );
    if (!ocupado) {
      slotsLibres.push({ hora_inicio: slotStart, hora_fin: slotEnd });
    }
  }

  if (slotsLibres.length === 0) return [];

  const grouped = [];
  let current = { ...slotsLibres[0] };
  for (let i = 1; i < slotsLibres.length; i++) {
    if (slotsLibres[i].hora_inicio === current.hora_fin) {
      current.hora_fin = slotsLibres[i].hora_fin;
    } else {
      grouped.push(current);
      current = { ...slotsLibres[i] };
    }
  }
  grouped.push(current);
  return grouped;
}

/** Itera fechas ISO (inclusive) entre desde y hasta. */
export function iterarFechasEnRango(desde, hasta) {
  if (!desde || !hasta) return [];
  const out = [];
  let d = new Date(`${String(desde).slice(0, 10)}T12:00:00`);
  const end = new Date(`${String(hasta).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime()) || Number.isNaN(end.getTime())) return [];
  while (d <= end) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${day}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

import { toDateOnly } from './format';
import { horaAMinutos } from './horarios';

/**
 * True si el instante `slot` cae dentro de una cita activa [inicio, fin).
 * La hora de fin queda libre para iniciar (o terminar) otra cita contigua
 * (ej. cita 8:30–11:00 → se puede agendar 8:00–8:30).
 */
export function slotOcupadoPorCitas(
  slot,
  citasDelDia,
  excludeId = null,
  { inclusiveEnd = false } = {}
) {
  const m = horaAMinutos(slot);
  if (m == null) return false;
  return (citasDelDia || []).some((c) => {
    if (c.cancelada === true || c.atendida === true) return false;
    if (excludeId != null && String(c.id) === String(excludeId)) return false;
    const a = horaAMinutos(c.hora_inicio);
    const b = horaAMinutos(c.hora_fin);
    if (a == null || b == null) return false;
    return inclusiveEnd ? m >= a && m <= b : m >= a && m < b;
  });
}

/**
 * Dos franjas se solapan si comparten minutos (inicio inclusivo, fin exclusivo).
 * Ej.: 8:00–8:30 y 8:30–11:00 NO se solapan.
 */
export function franjasSeSolapan(inicioA, finA, inicioB, finB) {
  const a0 = horaAMinutos(inicioA);
  const a1 = horaAMinutos(finA);
  const b0 = horaAMinutos(inicioB);
  const b1 = horaAMinutos(finB);
  if ([a0, a1, b0, b1].some((v) => v == null)) return false;
  return a0 < b1 && b0 < a1;
}

/** Busca conflicto de franja; ignora canceladas/atendidas. `excludeId` para reprogramar. */
export function encontrarCitaConflicto(citas, fecha, horaInicio, horaFin, excludeId = null) {
  if (!fecha || !horaInicio || !horaFin) return null;
  const fechaNorm = toDateOnly(fecha);
  return (
    citas.find(
      (c) =>
        c.cancelada !== true &&
        c.atendida !== true &&
        (excludeId == null || String(c.id) !== String(excludeId)) &&
        toDateOnly(c.fecha) === fechaNorm &&
        franjasSeSolapan(horaInicio, horaFin, c.hora_inicio, c.hora_fin)
    ) || null
  );
}

/** Citas del día (activas) para filtrar slots. */
export function citasDelDiaParaSlots(citas, fecha, excludeId = null) {
  if (!fecha) return [];
  const fechaNorm = toDateOnly(fecha);
  return (citas || []).filter((c) => {
    if (toDateOnly(c.fecha) !== fechaNorm) return false;
    if (c.cancelada === true || c.atendida === true) return false;
    if (excludeId != null && String(c.id) === String(excludeId)) return false;
    return true;
  });
}

/**
 * Filtra horas de fin: no pueden formar un rango que atraviese/cubra una cita.
 * Sí permite terminar exactamente cuando empieza la siguiente (ej. fin 8:30
 * con cita existente 8:30–11:00).
 */
export function filtrarSlotsFinLibres(
  slotsFin,
  { citas, fecha, horaInicio, excludeId = null } = {}
) {
  const list = Array.isArray(slotsFin) ? slotsFin : [];
  if (!fecha || !horaInicio) {
    // Sin inicio aún: ocultar solo instantes estrictamente dentro de [inicio, fin).
    const delDia = citasDelDiaParaSlots(citas, fecha, excludeId);
    return list.filter((fin) => !slotOcupadoPorCitas(fin, delDia, excludeId));
  }
  return list.filter(
    (fin) => !encontrarCitaConflicto(citas, fecha, horaInicio, fin, excludeId)
  );
}

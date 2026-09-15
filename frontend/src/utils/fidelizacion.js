import { formatFechaLecturaCliente, hoyLocalISO, parseFechaLocal, toDateOnly } from './format';

export const FIDELIZACION_DIAS_OPTIONS = [7, 15, 30];
/** @deprecated Cumplemeses desactivados; se mantiene por compatibilidad. */
export const MESARIO_MAX_MESES = 12;
export const NEGOCIO_DEFAULT = 'Pelu Eli';
export const OBSEQUIO_DEFAULT = 'descuento especial';

const STORAGE_KEY = 'gd.fidelizacion.v1';

export const PLANTILLA_CUMPLE_DEFAULT =
  '*¡Hola, {cuidador}!*\n\n' +
  'Se acerca el cumpleaños de *{mascota}* ({fecha_evento}).\n' +
  '¡Cumple *{edad}*! En *{negocio}* queremos celebrarlo con un *{obsequio}* en su próximo servicio.\n\n' +
  'Reserva su cita cuando quieras. ¡Te esperamos!';

export const PLANTILLA_HITO_DEFAULT =
  '*¡Hola, {cuidador}!*\n\n' +
  '*{mascota}* ha completado *{servicios}* visitas con nosotros.\n' +
  'En *{negocio}* queremos premiar su fidelidad con un *{obsequio}*.\n\n' +
  'Escríbenos para agendar. ¡Gracias por confiar en nosotros!';

export const PLANTILLA_NUEVO_DEFAULT =
  '*¡Hola, {cuidador}!*\n\n' +
  'Vimos que registraste a *{mascota}* con nosotros ({fecha_registro}) y aún no has agendado su primer servicio.\n' +
  'En *{negocio}* queremos darte la bienvenida con un *{obsequio}* en tu primera visita.\n\n' +
  'Escríbenos para conocer horarios y agendar. ¡Te esperamos!';

function padDate(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function lastDayOfMonth(year, monthIndex0) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function dateFromYmdClamped(year, monthIndex0, day) {
  const last = lastDayOfMonth(year, monthIndex0);
  return new Date(year, monthIndex0, Math.min(day, last));
}

function daysBetweenIso(fromIso, toIso) {
  const a = parseFechaLocal(fromIso);
  const b = parseFechaLocal(toIso);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function proximaAnual(fechaNacimiento, hoy = hoyLocalISO()) {
  const nac = parseFechaLocal(fechaNacimiento);
  const today = parseFechaLocal(hoy);
  if (!nac || !today) return '';
  const day = nac.getDate();
  let next = dateFromYmdClamped(today.getFullYear(), nac.getMonth(), day);
  if (toDateOnly(next) < toDateOnly(today)) {
    next = dateFromYmdClamped(today.getFullYear() + 1, nac.getMonth(), day);
  }
  return toDateOnly(next);
}

export function proximaMensual(fechaNacimiento, hoy = hoyLocalISO()) {
  const nac = parseFechaLocal(fechaNacimiento);
  const today = parseFechaLocal(hoy);
  if (!nac || !today) return '';
  const day = nac.getDate();
  let next = dateFromYmdClamped(today.getFullYear(), today.getMonth(), day);
  if (toDateOnly(next) < toDateOnly(today)) {
    const month = today.getMonth() + 1;
    const year = month > 11 ? today.getFullYear() + 1 : today.getFullYear();
    const m = month > 11 ? 0 : month;
    next = dateFromYmdClamped(year, m, day);
  }
  return toDateOnly(next);
}

export function edadEnMeses(fechaNacimiento, hoy = hoyLocalISO()) {
  const nac = parseFechaLocal(fechaNacimiento);
  const today = parseFechaLocal(hoy);
  if (!nac || !today) return 0;
  let months =
    (today.getFullYear() - nac.getFullYear()) * 12 + (today.getMonth() - nac.getMonth());
  if (today.getDate() < nac.getDate()) months -= 1;
  return Math.max(0, months);
}

/** Años cumplidos en `fechaRef` (null si fechas inválidas). */
export function aniosCumplidosEnFecha(fechaNacimiento, fechaRef) {
  const nac = parseFechaLocal(fechaNacimiento);
  const ref = parseFechaLocal(fechaRef);
  if (!nac || !ref) return null;
  let years = ref.getFullYear() - nac.getFullYear();
  const beforeAnniversary =
    ref.getMonth() < nac.getMonth() ||
    (ref.getMonth() === nac.getMonth() && ref.getDate() < nac.getDate());
  if (beforeAnniversary) years -= 1;
  return Math.max(0, years);
}

/** Etiqueta de edad solo en años (para cumpleaños). Ej. "2 años". */
export function formatEdadAniosCumple(fechaNacimiento, fechaEvento) {
  const years = aniosCumplidosEnFecha(fechaNacimiento, fechaEvento);
  if (years == null || years < 1) return '';
  return `${years} año${years === 1 ? '' : 's'}`;
}

export function formatEdadFidelizacion(fechaNacimiento, hoy = hoyLocalISO()) {
  return formatEdadAniosCumple(fechaNacimiento, hoy) || '—';
}

/**
 * Próximo cumpleaños anual dentro de la ventana (edad en el evento ≥ 1 año).
 * Los cumplemeses quedan desactivados.
 */
export function eventoProximidadNacimiento(fechaNacimiento, { hoy, diasVentana } = {}) {
  const birth = toDateOnly(fechaNacimiento);
  if (!birth) return null;
  const today = hoy || hoyLocalISO();
  const ventana = Number(diasVentana) > 0 ? Number(diasVentana) : 30;
  const anual = proximaAnual(birth, today);
  if (!anual) return null;
  const diasAnual = daysBetweenIso(today, anual);
  if (diasAnual == null || diasAnual < 0 || diasAnual > ventana) return null;

  const aniosEnEvento = aniosCumplidosEnFecha(birth, anual);
  if (aniosEnEvento == null || aniosEnEvento < 1) return null;

  return {
    tipo_evento: 'cumpleanos',
    proxima_fecha: anual,
    dias_restantes: diasAnual,
  };
}

export function hitoDesdeServicios(n) {
  const servicios = Number(n) || 0;
  if (servicios >= 5 && servicios % 5 === 0) {
    return { hito: servicios, estado_hito: 'alcanzado', servicios_faltantes: 0 };
  }
  if (servicios >= 4 && servicios % 5 === 4) {
    return { hito: servicios + 1, estado_hito: 'por_alcanzar', servicios_faltantes: 1 };
  }
  return null;
}

export function claveContactoCumple(row) {
  return `cumpleanos:${row.proxima_fecha || ''}`;
}

export function claveContactoHito(row) {
  return `hito:${row.hito}`;
}

export function claveContactoNuevo(row) {
  return `nuevo:${row?.id_mascota || ''}`;
}

export function labelTipoEvento(tipo) {
  if (tipo === 'hito') return 'hito';
  if (tipo === 'nuevo') return 'cliente nuevo';
  return 'cumpleaños';
}

export function labelDiasRestantes(dias) {
  const n = Number(dias);
  if (!Number.isFinite(n)) return '—';
  if (n <= 0) return 'Hoy';
  if (n === 1) return 'Mañana';
  return `${n} días`;
}

function emptyStore() {
  return {
    templates: {
      negocio: NEGOCIO_DEFAULT,
      obsequio: OBSEQUIO_DEFAULT,
      cumpleanos: PLANTILLA_CUMPLE_DEFAULT,
      hito: PLANTILLA_HITO_DEFAULT,
      nuevo: PLANTILLA_NUEVO_DEFAULT,
    },
    enviados: {},
  };
}

export function loadFidelizacionStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw);
    const base = emptyStore();
    return {
      templates: { ...base.templates, ...(parsed.templates || {}) },
      enviados: parsed.enviados && typeof parsed.enviados === 'object' ? parsed.enviados : {},
    };
  } catch {
    return emptyStore();
  }
}

export function saveFidelizacionTemplates(partial) {
  const store = loadFidelizacionStore();
  store.templates = { ...store.templates, ...partial };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  return store.templates;
}

export function markFidelizacionEnviadoLocal(idMascota, tipo, clave) {
  const store = loadFidelizacionStore();
  store.enviados[`${tipo}:${idMascota}:${clave}`] = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function isFidelizacionEnviadoLocal(idMascota, tipo, clave) {
  const store = loadFidelizacionStore();
  return Boolean(store.enviados[`${tipo}:${idMascota}:${clave}`]);
}

function applyPlantilla(template, vars) {
  let out = String(template || '');
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, value == null ? '' : String(value));
  }
  return out;
}

/**
 * Mensaje WhatsApp a partir de plantilla editable.
 * tipo: 'cumpleanos' | 'hito' | 'nuevo'
 */
export function generarMensajeWhatsApp({ tipo, row, templates } = {}) {
  const t = { ...emptyStore().templates, ...(templates || loadFidelizacionStore().templates) };
  const cuidador = row?.cuidador_nombre?.trim() || 'cliente';
  const mascota = row?.mascota_nombre?.trim() || 'tu mascota';
  const edadLabel =
    row?.edad_label ||
    formatEdadAniosCumple(row?.fecha_nacimiento, row?.proxima_fecha) ||
    '';
  const fechaRegistro = row?.fecha_registro
    ? formatFechaLecturaCliente(row.fecha_registro)
    : '';
  const vars = {
    cuidador,
    nombre_cuidador: cuidador,
    mascota,
    nombre_mascota: mascota,
    negocio: t.negocio?.trim() || NEGOCIO_DEFAULT,
    obsequio: t.obsequio?.trim() || OBSEQUIO_DEFAULT,
    servicios: String(row?.servicios_atendidos ?? row?.hito ?? ''),
    profesional: row?.profesional_nombre?.trim() || '',
    tipo_evento: labelTipoEvento(row?.tipo_evento || tipo),
    fecha_evento: row?.proxima_fecha ? formatFechaLecturaCliente(row.proxima_fecha) : '',
    fecha_registro: fechaRegistro,
    dias: labelDiasRestantes(row?.dias_restantes),
    edad: edadLabel,
    especie: row?.especie || '',
    raza: row?.raza || '',
  };

  if (tipo === 'hito') {
    return applyPlantilla(t.hito || PLANTILLA_HITO_DEFAULT, vars);
  }
  if (tipo === 'nuevo') {
    return applyPlantilla(t.nuevo || PLANTILLA_NUEVO_DEFAULT, vars);
  }
  return applyPlantilla(t.cumpleanos || PLANTILLA_CUMPLE_DEFAULT, vars);
}

export { padDate };

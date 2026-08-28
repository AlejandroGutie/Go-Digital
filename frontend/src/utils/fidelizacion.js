import { formatFecha, hoyLocalISO, parseFechaLocal, toDateOnly } from './format';

export const FIDELIZACION_DIAS_OPTIONS = [7, 15, 30];
export const MESARIO_MAX_MESES = 12;
export const NEGOCIO_DEFAULT = 'Pelu Eli';
export const OBSEQUIO_DEFAULT = 'descuento especial';

const STORAGE_KEY = 'gd.fidelizacion.v1';

export const PLANTILLA_CUMPLE_DEFAULT =
  '*¡Hola, {cuidador}!*\n\n' +
  'Se acerca el {tipo_evento} de *{mascota}* ({fecha_evento}).\n' +
  'En *{negocio}* queremos celebrarlo con un *{obsequio}* en su próximo servicio.\n\n' +
  'Reserva su cita cuando quieras. ¡Te esperamos!';

export const PLANTILLA_HITO_DEFAULT =
  '*¡Hola, {cuidador}!*\n\n' +
  '*{mascota}* ha completado *{servicios}* visitas con nosotros.\n' +
  'En *{negocio}* queremos premiar su fidelidad con un *{obsequio}*.\n\n' +
  'Escríbenos para agendar. ¡Gracias por confiar en nosotros!';

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

export function formatEdadFidelizacion(fechaNacimiento, hoy = hoyLocalISO()) {
  if (!toDateOnly(fechaNacimiento)) return '—';
  const months = edadEnMeses(fechaNacimiento, hoy);
  if (months < 12) {
    return `${months} mes${months === 1 ? '' : 'es'}`;
  }
  const years = Math.floor(months / 12);
  const rem = months % 12;
  const yLabel = `${years} año${years === 1 ? '' : 's'}`;
  if (!rem) return yLabel;
  return `${yLabel} ${rem} mes${rem === 1 ? '' : 'es'}`;
}

/**
 * Próximo cumpleaños (anual) o mesario (< 12 meses).
 * Si ambos caen en la ventana, prioriza cumpleaños.
 */
export function eventoProximidadNacimiento(fechaNacimiento, { hoy, diasVentana } = {}) {
  const birth = toDateOnly(fechaNacimiento);
  if (!birth) return null;
  const today = hoy || hoyLocalISO();
  const ventana = Number(diasVentana) > 0 ? Number(diasVentana) : 30;
  const anual = proximaAnual(birth, today);
  const mensual = proximaMensual(birth, today);
  const diasAnual = daysBetweenIso(today, anual);
  const diasMensual = daysBetweenIso(today, mensual);
  const meses = edadEnMeses(birth, today);

  if (diasAnual != null && diasAnual >= 0 && diasAnual <= ventana) {
    return {
      tipo_evento: 'cumpleanos',
      proxima_fecha: anual,
      dias_restantes: diasAnual,
    };
  }
  if (
    meses < MESARIO_MAX_MESES &&
    diasMensual != null &&
    diasMensual >= 0 &&
    diasMensual <= ventana
  ) {
    return {
      tipo_evento: 'mesario',
      proxima_fecha: mensual,
      dias_restantes: diasMensual,
    };
  }
  return null;
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
  return `${row.tipo_evento}:${row.proxima_fecha || ''}`;
}

export function claveContactoHito(row) {
  return `hito:${row.hito}`;
}

export function labelTipoEvento(tipo) {
  return tipo === 'mesario' ? 'mesario' : 'cumpleaños';
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
 * tipo: 'cumpleanos' | 'mesario' | 'hito'
 */
export function generarMensajeWhatsApp({ tipo, row, templates } = {}) {
  const t = { ...emptyStore().templates, ...(templates || loadFidelizacionStore().templates) };
  const cuidador = row?.cuidador_nombre?.trim() || 'cliente';
  const mascota = row?.mascota_nombre?.trim() || 'tu mascota';
  const vars = {
    cuidador,
    mascota,
    negocio: t.negocio?.trim() || NEGOCIO_DEFAULT,
    obsequio: t.obsequio?.trim() || OBSEQUIO_DEFAULT,
    servicios: String(row?.servicios_atendidos ?? row?.hito ?? ''),
    profesional: row?.profesional_nombre?.trim() || '',
    tipo_evento: labelTipoEvento(row?.tipo_evento || tipo),
    fecha_evento: row?.proxima_fecha ? formatFecha(row.proxima_fecha) : '',
    dias: labelDiasRestantes(row?.dias_restantes),
    edad: row?.edad_label || '',
  };

  if (tipo === 'hito') {
    return applyPlantilla(t.hito || PLANTILLA_HITO_DEFAULT, vars);
  }
  return applyPlantilla(t.cumpleanos || PLANTILLA_CUMPLE_DEFAULT, vars);
}

export { padDate };

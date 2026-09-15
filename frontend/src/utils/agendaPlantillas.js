import { formatFechaLecturaCliente, formatMoneda } from './format';
import { loadFidelizacionStore } from './fidelizacion';

const STORAGE_KEY = 'gd.agenda.plantillas.v1';

/** Nombre de negocio: reutiliza el de fidelización si existe. */
export function negocioAgendaDefault() {
  try {
    const n = loadFidelizacionStore()?.templates?.negocio?.trim();
    if (n) return n;
  } catch {
    /* ignore */
  }
  return 'Pelu Eli';
}

export const PLANTILLA_CONFIRMACION_DEFAULT =
  '*¡Hola, {cuidador}!*\n\n' +
  'Tu agenda ha sido confirmada con éxito.\n' +
  'Aquí tienes los detalles de tu reserva:\n\n' +
  '*AGENDA*\n' +
  '- Fecha: {fecha}\n' +
  '- Hora: {hora}\n\n' +
  '{desglose_tarifas}\n\n' +
  '*MASCOTA*\n' +
  '- Nombre: {mascota}\n' +
  '- Detalle: {detalle}\n\n' +
  '*PROFESIONAL*\n' +
  '- Nombre: {profesional}\n\n' +
  'Quedamos atentos a cualquier inquietud.\n' +
  '¡Nos vemos pronto!';

export const PLANTILLA_REPROGRAMADA_DEFAULT =
  '*¡Hola, {cuidador}!*\n\n' +
  'Tu cita ha sido *reprogramada* con éxito.\n' +
  'Estos son los nuevos datos de tu reserva:\n\n' +
  '*NUEVA AGENDA*\n' +
  '- Fecha: {fecha}\n' +
  '- Hora: {hora}\n\n' +
  '{desglose_tarifas}\n\n' +
  '*MASCOTA*\n' +
  '- Nombre: {mascota}\n' +
  '- Detalle: {detalle}\n\n' +
  '*PROFESIONAL*\n' +
  '- Nombre: {profesional}\n\n' +
  'Quedamos atentos a cualquier inquietud.\n' +
  '¡Te esperamos!';

export const PLANTILLA_MASCOTA_LISTA_DEFAULT =
  '*¡Hola, {cuidador}!*\n\n' +
  '¡Grandes noticias! *{mascota}* ya ha terminado su sesión y está listo(a) para ser recogido(a) o entregado(a) en domicilio, según lo acordado.\n\n' +
  '*DETALLES DEL SERVICIO*\n' +
  '- Mascota: {mascota}\n' +
  '- Atendido por: {profesional}\n' +
  '- Fecha: {fecha}\n' +
  '- Hora de fin: {hora_fin}\n' +
  '- Servicio: {servicio}\n\n' +
  '*INDICACIONES*\n' +
  '- Si la recogida es en el salón, puedes pasar cuando te sea conveniente.\n' +
  '- Si acordaron entrega a domicilio, te contactaremos o confirma la dirección y franja para coordinar.\n\n' +
  '¡Te esperamos pronto para reencontrarte con tu peludito!';

function emptyTemplates() {
  return {
    negocio: negocioAgendaDefault(),
    confirmacion: PLANTILLA_CONFIRMACION_DEFAULT,
    reprogramada: PLANTILLA_REPROGRAMADA_DEFAULT,
    mascota_lista: PLANTILLA_MASCOTA_LISTA_DEFAULT,
  };
}

/** Migra plantillas antiguas `- Tarifa: {tarifa}` → `{desglose_tarifas}`. */
function migratePlantillaServicios(tpl) {
  const s = String(tpl || '');
  if (!s) return s;
  if (s.includes('{desglose_tarifas}') || s.includes('{servicios}')) return s;
  return s.replace(/- Tarifa:\s*\{tarifa\}\n?/g, '{desglose_tarifas}\n');
}

/**
 * Desglose de tarifas para WhatsApp.
 * @returns {{ desglose_tarifas: string, valor_total: string, servicios: string, lineas: string, tarifa: string }}
 */
export function formatTarifasDesgloseWhatsApp(tarifas = []) {
  try {
    const list = (Array.isArray(tarifas) ? tarifas : []).filter(Boolean);
    if (!list.length) {
      const pendiente =
        'Servicios programados:\n- Pendiente por definir\n*Total del servicio: Pendiente por definir*';
      return {
        desglose_tarifas: pendiente,
        valor_total: 'Pendiente por definir',
        servicios: pendiente,
        lineas: '- Pendiente por definir',
        tarifa: pendiente,
      };
    }

    const lineasArr = list.map((t) => {
      const nombre =
        String(t.descripcion || t.tarifa_descripcion || t.nombre || 'Servicio').trim() ||
        'Servicio';
      const n = Number(t.valor ?? t.tarifa_valor);
      const precio = Number.isFinite(n) ? formatMoneda(n) : 'Pendiente por definir';
      return `- ${nombre}: ${precio}`;
    });
    const totalNum = list.reduce(
      (acc, t) => acc + (Number(t.valor ?? t.tarifa_valor) || 0),
      0
    );
    const valor_total =
      list.some((t) => Number.isFinite(Number(t.valor ?? t.tarifa_valor)))
        ? formatMoneda(totalNum)
        : 'Pendiente por definir';
    const lineas = lineasArr.join('\n');
    const desglose_tarifas = `Servicios programados:\n${lineas}\n*Total del servicio: ${valor_total}*`;

    return {
      desglose_tarifas,
      valor_total,
      servicios: desglose_tarifas,
      lineas,
      tarifa: desglose_tarifas,
    };
  } catch {
    const pendiente =
      'Servicios programados:\n- Pendiente por definir\n*Total del servicio: Pendiente por definir*';
    return {
      desglose_tarifas: pendiente,
      valor_total: 'Pendiente por definir',
      servicios: pendiente,
      lineas: '- Pendiente por definir',
      tarifa: pendiente,
    };
  }
}

/** Normaliza lista de tarifas desde payload / cita. */
export function resolveTarifasParaMensaje(payload = {}) {
  try {
    if (Array.isArray(payload.tarifas) && payload.tarifas.length) {
      return payload.tarifas;
    }
    if (Array.isArray(payload.cita?.tarifas) && payload.cita.tarifas.length) {
      return payload.cita.tarifas;
    }
    const desc = payload.tarifaDescripcion || payload.cita?.tarifa_descripcion || '';
    const valorRaw =
      payload.tarifaValor != null && payload.tarifaValor !== ''
        ? payload.tarifaValor
        : payload.cita?.tarifa_valor;
    if (!desc && (valorRaw == null || valorRaw === '')) return [];

    const parts = String(desc || 'Servicio')
      .split(/\s*\+\s*/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (parts.length > 1) {
      // Sin precios individuales conocidos: una sola línea con el texto unido
      return [{ descripcion: desc || parts.join(' + '), valor: valorRaw }];
    }
    return [{ descripcion: parts[0] || 'Servicio', valor: valorRaw }];
  } catch {
    return [];
  }
}

export function loadAgendaPlantillas() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyTemplates();
    const parsed = JSON.parse(raw);
    const base = emptyTemplates();
    const merged = { ...base, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
    return {
      ...merged,
      confirmacion: migratePlantillaServicios(merged.confirmacion),
      reprogramada: migratePlantillaServicios(merged.reprogramada),
    };
  } catch {
    return emptyTemplates();
  }
}

export function saveAgendaPlantillas(partial) {
  const base = emptyTemplates();
  const merged = { ...loadAgendaPlantillas(), ...partial };
  const next = {
    negocio: String(merged.negocio || '').trim() || base.negocio,
    confirmacion:
      migratePlantillaServicios(String(merged.confirmacion || '').trim()) ||
      base.confirmacion,
    reprogramada:
      migratePlantillaServicios(String(merged.reprogramada || '').trim()) ||
      base.reprogramada,
    mascota_lista: String(merged.mascota_lista || '').trim() || base.mascota_lista,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function resetAgendaPlantillas() {
  const next = emptyTemplates();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

function dash(value) {
  const s = value == null ? '' : String(value).trim();
  return s || '-';
}

/**
 * Variables disponibles en plantillas de agenda.
 * Incluye {desglose_tarifas} y {valor_total}.
 */
export function buildAgendaPlantillaVars(payload = {}) {
  const cuidador = payload.cuidadorNombre?.trim() || 'cliente';
  const mascota = payload.mascotaNombre?.trim() || 'tu mascota';
  const detalle = [payload.mascotaEspecie, payload.mascotaRaza, payload.mascotaTamano]
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter(Boolean)
    .join(' / ');
  const horaRango =
    payload.horaInicioLabel && payload.horaFinLabel
      ? `${payload.horaInicioLabel} - ${payload.horaFinLabel}`
      : payload.horaInicioLabel || payload.horaFinLabel || '';
  const negocio =
    payload.negocio?.trim() || loadAgendaPlantillas().negocio?.trim() || negocioAgendaDefault();

  const fechaLectura = formatFechaLecturaCliente(
    payload.fechaLabel || payload.fecha || ''
  );

  const desglose = formatTarifasDesgloseWhatsApp(resolveTarifasParaMensaje(payload));

  return {
    cuidador,
    nombre_cuidador: cuidador,
    mascota,
    nombre_mascota: mascota,
    especie: dash(payload.mascotaEspecie),
    raza: dash(payload.mascotaRaza),
    tamano: dash(payload.mascotaTamano),
    detalle: dash(detalle),
    profesional: dash(payload.profesionalNombre),
    nombre_profesional: dash(payload.profesionalNombre),
    fecha: dash(fechaLectura),
    nombre_fecha: dash(fechaLectura),
    fecha_lectura: dash(fechaLectura),
    hora: dash(horaRango),
    hora_inicio: dash(payload.horaInicioLabel),
    hora_fin: dash(payload.horaFinLabel),
    desglose_tarifas: desglose.desglose_tarifas,
    valor_total: desglose.valor_total,
    servicios: desglose.servicios,
    tarifas: desglose.lineas,
    tarifa: desglose.desglose_tarifas,
    total: desglose.valor_total,
    valor: desglose.valor_total,
    servicio: dash(payload.tarifaDescripcion || desglose.lineas),
    negocio,
  };
}

export function applyAgendaPlantilla(template, vars) {
  let out = String(template || '');
  try {
    for (const [key, value] of Object.entries(vars || {})) {
      out = out.replaceAll(`{${key}}`, value == null ? '' : String(value));
    }
    out = out.replace(/\{[a-zA-Z0-9_]+\}/g, '');
  } catch {
    return String(template || '');
  }
  return out;
}

/**
 * @param {'confirmacion'|'reprogramada'|'mascota_lista'} tipo
 */
export function generarMensajeAgendaWhatsApp(tipo, payload = {}, templates) {
  const t = { ...emptyTemplates(), ...(templates || loadAgendaPlantillas()) };
  const vars = buildAgendaPlantillaVars({ ...payload, negocio: t.negocio });

  let key = 'confirmacion';
  if (tipo === 'reprogramada') key = 'reprogramada';
  else if (tipo === 'mascota_lista') key = 'mascota_lista';

  const tpl = t[key] || emptyTemplates()[key];
  const msg = applyAgendaPlantilla(tpl, vars);
  return msg?.trim() ? msg : applyAgendaPlantilla(emptyTemplates()[key], vars);
}

import { supabase } from '../lib/supabaseClient';
import { throwIfError } from '../lib/apiResponse';
import { toDateOnly } from '../utils/format';

/** Tamaño de página PostgREST; evita truncar silenciosamente en ~1000 filas. */
const FETCH_PAGE_SIZE = 1000;

/**
 * Ejecuta una query de Supabase paginando con .range hasta agotar filas.
 * `makeQuery` debe devolver una query fresca en cada llamada (sin .range previo).
 */
async function fetchAllRows(makeQuery, errorMsg) {
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await makeQuery().range(from, from + FETCH_PAGE_SIZE - 1);
    throwIfError(error, errorMsg);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }
  return all;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function applyCobroFilters(query, params) {
  let q = query;
  if (params.fecha_desde) q = q.gte('fecha_cobro', params.fecha_desde);
  if (params.fecha_hasta) q = q.lte('fecha_cobro', params.fecha_hasta);
  if (params.id_profesional) q = q.eq('id_profesional', params.id_profesional);
  if (params.estado) q = q.eq('estado', params.estado);
  return q;
}

function daysBetween(desde, hasta) {
  if (!desde || !hasta) return 30;
  const a = new Date(`${desde}T12:00:00`);
  const b = new Date(`${hasta}T12:00:00`);
  return Math.max(0, Math.round((b - a) / 86400000));
}

function buildDashboardFromRows(cobros, agendas, profesionales, params) {
  const agruparDia = daysBetween(params.fecha_desde, params.fecha_hasta) <= 45;

  let total_ingresos = 0;
  let total_pagado = 0;
  let total_pendiente = 0;
  let total_anulado = 0;
  let total_atenciones = 0;

  const serieMap = new Map();
  const mesMap = new Map();
  const tarifaMap = new Map();
  const estadoMap = new Map();
  const profMap = new Map();

  for (const p of profesionales) {
    profMap.set(p.id, {
      id: p.id,
      nombre: p.nombre,
      atenciones: 0,
      ingresos: 0,
      pagado: 0,
      pendiente: 0,
      citas_agenda: 0,
    });
  }

  for (const a of agendas) {
    const row = profMap.get(a.id_profesional);
    if (row) row.citas_agenda += 1;
  }

  for (const c of cobros) {
    const valor = num(c.valor);
    if (c.estado !== 'anulado') {
      total_ingresos += valor;
      total_atenciones += 1;
    }
    if (c.estado === 'pagado') total_pagado += valor;
    if (c.estado === 'pendiente') total_pendiente += valor;
    if (c.estado === 'anulado') total_anulado += valor;

    const periodo = agruparDia
      ? toDateOnly(c.fecha_cobro)
      : String(toDateOnly(c.fecha_cobro)).slice(0, 7);
    if (periodo) {
      const s = serieMap.get(periodo) || { periodo, ingresos: 0, atenciones: 0 };
      if (c.estado !== 'anulado') {
        s.ingresos += valor;
        s.atenciones += 1;
      }
      serieMap.set(periodo, s);
    }

    const mes = String(toDateOnly(c.fecha_cobro)).slice(0, 7);
    if (mes) {
      const m = mesMap.get(mes) || {
        mes,
        atenciones: 0,
        ingresos: 0,
        pagado: 0,
        pendiente: 0,
      };
      if (c.estado !== 'anulado') {
        m.atenciones += 1;
        m.ingresos += valor;
      }
      if (c.estado === 'pagado') m.pagado += valor;
      if (c.estado === 'pendiente') m.pendiente += valor;
      mesMap.set(mes, m);
    }

    const tid = c.id_tarifa || 0;
    const tdesc = c.tarifa?.descripcion || 'Sin tarifa';
    const t = tarifaMap.get(tid) || {
      id: tid,
      descripcion: tdesc,
      cantidad: 0,
      ingresos: 0,
    };
    if (c.estado !== 'anulado') {
      t.cantidad += 1;
      t.ingresos += valor;
    }
    tarifaMap.set(tid, t);

    const e = estadoMap.get(c.estado) || { estado: c.estado, cantidad: 0, total: 0 };
    e.cantidad += 1;
    e.total += valor;
    estadoMap.set(c.estado, e);

    const pid = c.id_profesional;
    if (!profMap.has(pid)) {
      profMap.set(pid, {
        id: pid,
        nombre: c.profesional?.nombre || `Profesional #${pid}`,
        atenciones: 0,
        ingresos: 0,
        pagado: 0,
        pendiente: 0,
        citas_agenda: 0,
      });
    }
    const pr = profMap.get(pid);
    if (c.estado !== 'anulado') {
      pr.atenciones += 1;
      pr.ingresos += valor;
    }
    if (c.estado === 'pagado') pr.pagado += valor;
    if (c.estado === 'pendiente') pr.pendiente += valor;
  }

  const ticket_promedio =
    total_atenciones === 0 ? 0 : Math.round((total_ingresos / total_atenciones) * 100) / 100;

  return {
    kpis: {
      total_ingresos,
      total_pagado,
      total_pendiente,
      total_anulado,
      total_atenciones,
      ticket_promedio,
      total_citas_agenda: agendas.length,
    },
    serie: [...serieMap.values()].sort((a, b) => String(a.periodo).localeCompare(String(b.periodo))),
    agrupar_por: agruparDia ? 'dia' : 'mes',
    por_profesional: [...profMap.values()].sort((a, b) =>
      String(a.nombre).localeCompare(String(b.nombre), 'es')
    ),
    por_mes: [...mesMap.values()].sort((a, b) => String(a.mes).localeCompare(String(b.mes))),
    por_tarifa: [...tarifaMap.values()].sort((a, b) => b.ingresos - a.ingresos),
    por_estado: [...estadoMap.values()].sort((a, b) =>
      String(a.estado).localeCompare(String(b.estado))
    ),
  };
}

async function getDashboardFallback(params) {
  const [cobros, agendas, profesionales] = await Promise.all([
    fetchAllRows(() => {
      let q = supabase
        .from('cobro')
        .select('*, profesional(nombre), tarifa(descripcion)')
        .order('fecha_cobro', { ascending: true });
      return applyCobroFilters(q, params);
    }, 'Error al cargar cobros del informe'),
    fetchAllRows(() => {
      let q = supabase
        .from('agenda')
        .select('id, id_profesional, fecha')
        .order('fecha', { ascending: true });
      if (params.fecha_desde) q = q.gte('fecha', params.fecha_desde);
      if (params.fecha_hasta) q = q.lte('fecha', params.fecha_hasta);
      if (params.id_profesional) q = q.eq('id_profesional', params.id_profesional);
      return q;
    }, 'Error al cargar agendas del informe'),
    fetchAllRows(() => {
      let q = supabase
        .from('profesional')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      if (params.id_profesional) q = q.eq('id', params.id_profesional);
      return q;
    }, 'Error al cargar profesionales'),
  ]);

  return buildDashboardFromRows(cobros, agendas, profesionales, params);
}

export async function getDashboardInformes(params = {}) {
  const payload = {
    p_fecha_desde: params.fecha_desde || null,
    p_fecha_hasta: params.fecha_hasta || null,
    p_id_profesional: params.id_profesional ? Number(params.id_profesional) : null,
    p_estado: params.estado || null,
  };

  const { data, error } = await supabase.rpc('get_dashboard_informes', payload);
  if (!error && data) {
    return { status: 'success', data, source: 'rpc' };
  }

  const missingRpc =
    error?.code === 'PGRST202' ||
    /could not find the function|schema cache/i.test(error?.message || '');

  // Solo cae a agregación cliente si el RPC no existe; otros errores se propagan
  if (!missingRpc && error) {
    throwIfError(error, error.message || 'Error al generar informe');
  }

  const fallback = await getDashboardFallback(params);
  return {
    status: 'success',
    data: fallback,
    source: 'client',
    warning:
      'Informe calculado en el cliente porque el RPC get_dashboard_informes no está disponible en Supabase.',
  };
}

export async function getAgendaInforme(params = {}) {
  const payload = {
    p_fecha_desde: params.fecha_desde || null,
    p_fecha_hasta: params.fecha_hasta || null,
    p_id_profesional: params.id_profesional ? Number(params.id_profesional) : null,
  };

  const { data, error } = await supabase.rpc('get_agenda_informe', payload);
  if (!error && data) {
    return { status: 'success', data: data.rows ?? data ?? [], source: 'rpc' };
  }

  const missingRpc =
    error?.code === 'PGRST202' ||
    /could not find the function|schema cache/i.test(error?.message || '');

  if (!missingRpc && error) {
    throwIfError(error, error.message || 'Error al generar informe de agendas');
  }

  const agendaRows = await fetchAllRows(() => {
    let q = supabase
      .from('agenda')
      .select(
        'id, fecha, hora_inicio, hora_fin, id_profesional, id_mascota, profesional(nombre), mascota(nombre, especie, raza, tamano)'
      )
      .order('fecha', { ascending: true })
      .order('hora_inicio', { ascending: true });
    if (params.fecha_desde) q = q.gte('fecha', params.fecha_desde);
    if (params.fecha_hasta) q = q.lte('fecha', params.fecha_hasta);
    if (params.id_profesional) q = q.eq('id_profesional', params.id_profesional);
    return q;
  }, 'Error al cargar agenda para exportar');

  const rows = agendaRows.map((a) => ({
    id: a.id,
    fecha: toDateOnly(a.fecha),
    hora_inicio: a.hora_inicio,
    hora_fin: a.hora_fin,
    id_profesional: a.id_profesional,
    profesional_nombre: a.profesional?.nombre,
    id_mascota: a.id_mascota,
    mascota_nombre: a.mascota?.nombre,
    especie: a.mascota?.especie,
    raza: a.mascota?.raza,
    tamano: a.mascota?.tamano,
  }));

  return {
    status: 'success',
    data: rows,
    source: 'client',
    warning:
      'Agenda exportada desde consulta cliente porque el RPC get_agenda_informe no está disponible.',
  };
}

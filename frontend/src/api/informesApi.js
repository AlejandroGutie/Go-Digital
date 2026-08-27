import { supabase } from '../lib/supabaseClient';
import { throwIfError } from '../lib/apiResponse';
import { normalizeListPayload, normalizeMeta } from './normalize';
import { toDateOnly, formatHora } from '../utils/format';
import {
  calcularFranjasLibres,
  iterarFechasEnRango,
  jornadaDelProfesional,
} from '../utils/horarios';

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
    const raw = data.rows ?? data ?? [];
    const list = Array.isArray(raw) ? raw : [];
    const enriched = await attachCuidadoresToAgendaRows(
      list.map((a) => ({
        id: a.id,
        fecha: toDateOnly(a.fecha),
        hora_inicio: a.hora_inicio,
        hora_fin: a.hora_fin,
        id_profesional: a.id_profesional,
        profesional_nombre: a.profesional_nombre,
        id_mascota: a.id_mascota,
        mascota_nombre: a.mascota_nombre,
        especie: a.especie,
        raza: a.raza,
        tamano: a.tamano,
        cuidador_nombre: a.cuidador_nombre ?? null,
        cuidadores: Array.isArray(a.cuidadores) ? a.cuidadores : undefined,
      }))
    );
    return { status: 'success', data: enriched, source: 'rpc' };
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
        `id, fecha, hora_inicio, hora_fin, id_profesional, id_mascota,
         profesional(nombre),
         mascota(
           nombre, especie, raza, tamano,
           cuidador_mascota(activo, cuidador(id, nombre))
         )`
      )
      .order('fecha', { ascending: true })
      .order('hora_inicio', { ascending: true });
    if (params.fecha_desde) q = q.gte('fecha', params.fecha_desde);
    if (params.fecha_hasta) q = q.lte('fecha', params.fecha_hasta);
    if (params.id_profesional) q = q.eq('id_profesional', params.id_profesional);
    return q;
  }, 'Error al cargar agenda para exportar');

  const rows = agendaRows.map((a) => {
    const cuidadores = extractCuidadoresFromMascotaEmbed(a.mascota);
    return {
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
      cuidadores,
      cuidador_nombre: cuidadores.length ? cuidadores.join(', ') : null,
    };
  });

  return {
    status: 'success',
    data: rows,
    source: 'client',
    warning:
      'Agenda exportada desde consulta cliente porque el RPC get_agenda_informe no está disponible.',
  };
}

function extractCuidadoresFromMascotaEmbed(mascota) {
  const links = mascota?.cuidador_mascota;
  if (!Array.isArray(links)) return [];
  const names = [];
  const seen = new Set();
  for (const link of links) {
    if (link?.activo === false) continue;
    const nombre = link?.cuidador?.nombre?.trim();
    if (!nombre || seen.has(nombre)) continue;
    seen.add(nombre);
    names.push(nombre);
  }
  return names;
}

/** Completa cuidador_nombre / cuidadores cuando el RPC aún no los trae. */
async function attachCuidadoresToAgendaRows(rows) {
  const list = rows || [];
  const needsLookup = list.some(
    (r) =>
      r.id_mascota != null &&
      !r.cuidador_nombre &&
      !(Array.isArray(r.cuidadores) && r.cuidadores.length)
  );
  if (!needsLookup) {
    return list.map((r) => {
      const cuidadores =
        Array.isArray(r.cuidadores) && r.cuidadores.length
          ? r.cuidadores
          : r.cuidador_nombre
            ? String(r.cuidador_nombre)
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : [];
      return {
        ...r,
        cuidadores,
        cuidador_nombre: cuidadores.length
          ? cuidadores.join(', ')
          : r.cuidador_nombre || null,
      };
    });
  }

  const ids = [
    ...new Set(list.map((r) => Number(r.id_mascota)).filter((n) => n && !Number.isNaN(n))),
  ];
  const byMascota = new Map();

  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await supabase
      .from('cuidador_mascota')
      .select('id_mascota, activo, cuidador(id, nombre)')
      .in('id_mascota', chunk);
    throwIfError(error, 'Error al cargar cuidadores del informe de agendas');
    for (const link of data ?? []) {
      if (link.activo === false) continue;
      const nombre = link.cuidador?.nombre?.trim();
      if (!nombre) continue;
      const key = Number(link.id_mascota);
      const arr = byMascota.get(key) || [];
      if (!arr.includes(nombre)) arr.push(nombre);
      byMascota.set(key, arr);
    }
  }

  return list.map((r) => {
    const fromRpc =
      Array.isArray(r.cuidadores) && r.cuidadores.length
        ? r.cuidadores
        : r.cuidador_nombre
          ? String(r.cuidador_nombre)
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
    const cuidadores =
      fromRpc.length > 0
        ? fromRpc
        : byMascota.get(Number(r.id_mascota)) || [];
    return {
      ...r,
      cuidadores,
      cuidador_nombre: cuidadores.length ? cuidadores.join(', ') : null,
    };
  });
}

/**
 * Franjas libres por profesional y día (bloques de 30 min dentro de la jornada).
 * Solo citas activas (atendida = false) ocupan cupo.
 */
export async function getHorariosLibres(params = {}) {
  const [profesionales, agendas] = await Promise.all([
    fetchAllRows(() => {
      let q = supabase
        .from('profesional')
        .select('id, nombre, hora_inicio_jornada, hora_fin_jornada')
        .eq('activo', true)
        .order('nombre');
      if (params.id_profesional) q = q.eq('id', params.id_profesional);
      return q;
    }, 'Error al cargar profesionales para horarios libres'),
    fetchAllRows(() => {
      let q = supabase
        .from('agenda')
        .select('id, id_profesional, fecha, hora_inicio, hora_fin, atendida')
        .eq('atendida', false)
        .order('fecha', { ascending: true })
        .order('hora_inicio', { ascending: true });
      if (params.fecha_desde) q = q.gte('fecha', params.fecha_desde);
      if (params.fecha_hasta) q = q.lte('fecha', params.fecha_hasta);
      if (params.id_profesional) q = q.eq('id_profesional', params.id_profesional);
      return q;
    }, 'Error al cargar agendas para horarios libres'),
  ]);

  const citasPorProfFecha = new Map();
  for (const a of agendas) {
    const key = `${a.id_profesional}|${toDateOnly(a.fecha)}`;
    if (!citasPorProfFecha.has(key)) citasPorProfFecha.set(key, []);
    citasPorProfFecha.get(key).push(a);
  }

  const fechas = iterarFechasEnRango(params.fecha_desde, params.fecha_hasta);
  const rows = [];

  for (const prof of profesionales) {
    const jornada = jornadaDelProfesional(prof);
    for (const fecha of fechas) {
      const key = `${prof.id}|${fecha}`;
      const citasDelDia = citasPorProfFecha.get(key) || [];
      const franjas = calcularFranjasLibres(jornada, citasDelDia);
      for (const f of franjas) {
        rows.push({
          id_profesional: prof.id,
          profesional_nombre: prof.nombre,
          fecha,
          hora_inicio: f.hora_inicio,
          hora_fin: f.hora_fin,
          horario_label: `${formatHora(f.hora_inicio)} - ${formatHora(f.hora_fin)}`,
          estado: 'Disponible',
        });
      }
    }
  }

  rows.sort((a, b) => {
    const fa = String(a.fecha || '');
    const fb = String(b.fecha || '');
    if (fa !== fb) return fa.localeCompare(fb);
    const pa = String(a.profesional_nombre || '');
    const pb = String(b.profesional_nombre || '');
    if (pa !== pb) return pa.localeCompare(pb, 'es');
    return String(a.hora_inicio || '').localeCompare(String(b.hora_inicio || ''));
  });

  const total = rows.length;
  const payload = { status: 'success', data: rows };
  const list = normalizeListPayload(payload);
  const meta = normalizeMeta({ ...payload, data: list, meta: { total, page: 1, pages: total === 0 ? 0 : 1 } }, 1, list.length || 1);

  return { status: 'success', data: list, meta };
}

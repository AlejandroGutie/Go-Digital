import { supabase } from '../lib/supabaseClient';
import {
  successList,
  successOk,
  throwIfError,
} from '../lib/apiResponse';
import { toDateOnly } from '../utils/format';

const AGENDA_PAGE_SIZE = 1000;

const AGENDA_TARIFA_EMBED =
  'agenda_tarifa(id_tarifa, tarifa(id, descripcion, valor))';

const AGENDA_BASE_COLUMNS =
  'id, id_profesional, id_mascota, id_tarifa, fecha, hora_inicio, hora_fin, cobrada, atendida, cancelada, observacion_ingreso, observacion_cancelacion';

const AGENDA_SELECT_MASCOTA_TARIFA =
  AGENDA_BASE_COLUMNS +
  ', mascota(nombre, especie, raza, tamano), tarifa(descripcion, valor), ' +
  AGENDA_TARIFA_EMBED;

const AGENDA_SELECT_WITH_PROF =
  AGENDA_BASE_COLUMNS +
  ', mascota(nombre, especie, raza, tamano), tarifa(descripcion, valor), profesional(nombre), ' +
  AGENDA_TARIFA_EMBED;

function extractTarifasFromRow(row) {
  const fromJoin = (row.agenda_tarifa || [])
    .map((link) => {
      const t = link?.tarifa;
      if (!t?.id && link?.id_tarifa == null) return null;
      return {
        id: t?.id ?? link.id_tarifa,
        descripcion: t?.descripcion ?? null,
        valor: t?.valor ?? null,
      };
    })
    .filter(Boolean);

  if (fromJoin.length > 0) return fromJoin;

  // Legacy: una sola tarifa en agenda.id_tarifa / embed tarifa
  if (row.id_tarifa != null || row.tarifa) {
    return [
      {
        id: row.tarifa?.id ?? row.id_tarifa,
        descripcion: row.tarifa?.descripcion ?? row.tarifa_descripcion ?? null,
        valor: row.tarifa?.valor ?? row.tarifa_valor ?? null,
      },
    ].filter((t) => t.id != null);
  }
  return [];
}

function flattenAgendaRow(row) {
  const m = row.mascota;
  const tarifas = extractTarifasFromRow(row);
  const primary = tarifas[0] || null;
  const totalValor = tarifas.reduce((acc, t) => acc + (Number(t.valor) || 0), 0);
  const descripcionJoined =
    tarifas.length === 0
      ? null
      : tarifas.length === 1
        ? primary?.descripcion ?? null
        : tarifas.map((t) => t.descripcion || 'Tarifa').join(' + ');

  return {
    id: row.id,
    id_profesional: row.id_profesional,
    id_mascota: row.id_mascota,
    id_tarifa: primary?.id ?? row.id_tarifa ?? null,
    id_tarifas: tarifas.map((t) => t.id),
    tarifas,
    fecha: toDateOnly(row.fecha),
    hora_inicio: row.hora_inicio,
    hora_fin: row.hora_fin,
    cobrada: row.cobrada === true,
    atendida: row.atendida === true,
    cancelada: row.cancelada === true,
    observacion_ingreso: row.observacion_ingreso ?? null,
    observacion_cancelacion: row.observacion_cancelacion ?? null,
    mascota_nombre: m?.nombre ?? row.mascota_nombre,
    profesional_nombre: row.profesional?.nombre ?? row.profesional_nombre,
    especie: m?.especie ?? row.especie,
    raza: m?.raza ?? row.raza,
    tamano: m?.tamano ?? row.tamano,
    tarifa_descripcion: descripcionJoined,
    tarifa_valor: tarifas.length ? totalValor : (row.tarifa?.valor ?? row.tarifa_valor ?? null),
  };
}

function normalizeIdTarifas(payload) {
  const raw =
    payload?.id_tarifas ??
    payload?.tarifasIds ??
    payload?.tarifas ??
    (payload?.id_tarifa != null && payload?.id_tarifa !== ''
      ? [payload.id_tarifa]
      : []);

  const list = Array.isArray(raw) ? raw : [raw];
  const ids = [
    ...new Set(
      list
        .map((v) => (typeof v === 'object' && v != null ? Number(v.id) : Number(v)))
        .filter((n) => n && !Number.isNaN(n))
    ),
  ];
  if (ids.length === 0) {
    throw new Error('Selecciona al menos una tarifa');
  }
  return ids;
}

function isMissingRpcError(error) {
  return (
    error?.code === 'PGRST202' ||
    /could not find the function|schema cache/i.test(error?.message || '')
  );
}

function throwMissingRpc(nombreRpc) {
  throw new Error(
    `Falta la función ${nombreRpc} en Supabase. Ejecuta las migraciones pendientes (incluye 20260827_000006_agenda_cancelacion.sql).`
  );
}

/** "HH:MM" o "HH:MM:SS" → minutos desde medianoche. */
export function horaAMinutos(hora) {
  if (!hora) return null;
  const [h, m] = String(hora).split(':');
  const hh = parseInt(h, 10);
  const mm = parseInt(m, 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

export function franjasSeSolapan(inicioA, finA, inicioB, finB) {
  const a0 = horaAMinutos(inicioA);
  const a1 = horaAMinutos(finA);
  const b0 = horaAMinutos(inicioB);
  const b1 = horaAMinutos(finB);
  if ([a0, a1, b0, b1].some((v) => v == null)) return false;
  return a0 < b1 && b0 < a1;
}

function assertHorarioValido(hora_inicio, hora_fin) {
  const ini = horaAMinutos(hora_inicio);
  const fin = horaAMinutos(hora_fin);
  if (ini == null || fin == null) {
    throw new Error('Horario inválido');
  }
  if (fin <= ini) {
    throw new Error('La hora final debe ser posterior a la hora de inicio');
  }
}

async function assertTarifasDelProfesional(idProfesional, idTarifas) {
  const idProf = Number(idProfesional);
  const ids = [...new Set((idTarifas || []).map(Number).filter((n) => n && !Number.isNaN(n)))];
  if (!idProf || ids.length === 0) {
    throw new Error('Tarifa inválida para el profesional');
  }
  const { data, error } = await supabase
    .from('tarifa')
    .select('id')
    .eq('id_profesional', idProf)
    .in('id', ids);
  throwIfError(error, 'Error al validar las tarifas');
  if ((data ?? []).length !== ids.length) {
    throw new Error('Tarifa inválida para el profesional');
  }
}

async function syncAgendaTarifasClient(idAgenda, idTarifas) {
  const { error } = await supabase.rpc('sync_agenda_tarifas', {
    p_id_agenda: Number(idAgenda),
    p_id_tarifas: idTarifas.map(Number),
  });
  if (isMissingRpcError(error)) {
    // Fallback: insert directo si el RPC aún no está
    await supabase.from('agenda_tarifa').delete().eq('id_agenda', Number(idAgenda));
    const rows = idTarifas.map((id_tarifa) => ({
      id_agenda: Number(idAgenda),
      id_tarifa: Number(id_tarifa),
    }));
    const { error: insErr } = await supabase.from('agenda_tarifa').insert(rows);
    throwIfError(insErr, 'Error al guardar tarifas de la cita');
    return;
  }
  throwIfError(error, 'Error al sincronizar tarifas de la cita');
}

/** Solo citas activas (no atendidas ni canceladas) ocupan el cupo. */
async function assertSinSolape({
  idProfesional,
  idMascota = null,
  fecha,
  hora_inicio,
  hora_fin,
  excludeId = null,
}) {
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('agenda')
      .select('id, hora_inicio, hora_fin')
      .eq('id_profesional', Number(idProfesional))
      .eq('fecha', fecha)
      .eq('atendida', false)
      .eq('cancelada', false)
      .order('id', { ascending: true })
      .range(from, from + AGENDA_PAGE_SIZE - 1);
    throwIfError(error, 'Error al validar disponibilidad de agenda');

    const rows = data ?? [];
    for (const row of rows) {
      if (excludeId != null && String(row.id) === String(excludeId)) continue;
      if (franjasSeSolapan(hora_inicio, hora_fin, row.hora_inicio, row.hora_fin)) {
        throw new Error('Ya existe una cita que se solapa en ese horario');
      }
    }
    if (rows.length < AGENDA_PAGE_SIZE) break;
    from += AGENDA_PAGE_SIZE;
  }

  const idMasc = idMascota != null ? Number(idMascota) : null;
  if (!idMasc) return;

  from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('agenda')
      .select('id, hora_inicio, hora_fin, id_profesional')
      .eq('id_mascota', idMasc)
      .eq('fecha', fecha)
      .eq('atendida', false)
      .eq('cancelada', false)
      .order('id', { ascending: true })
      .range(from, from + AGENDA_PAGE_SIZE - 1);
    throwIfError(error, 'Error al validar disponibilidad de la mascota');

    const rows = data ?? [];
    for (const row of rows) {
      if (excludeId != null && String(row.id) === String(excludeId)) continue;
      if (Number(row.id_profesional) === Number(idProfesional)) continue;
      if (franjasSeSolapan(hora_inicio, hora_fin, row.hora_inicio, row.hora_fin)) {
        throw new Error('La mascota ya tiene una cita que se solapa en ese horario');
      }
    }
    if (rows.length < AGENDA_PAGE_SIZE) break;
    from += AGENDA_PAGE_SIZE;
  }
}

/** Ventana opcional; por defecto sin corte (citas activas deben seguir visibles). */
function resolveFechaDesde(fechaDesde, incluirAtendidas) {
  if (fechaDesde === null) return null;
  if (fechaDesde !== undefined && fechaDesde !== '') {
    return toDateOnly(fechaDesde);
  }
  // Sin filtro por defecto: las no atendidas (cobradas o no) deben poder gestionarse
  void incluirAtendidas;
  return null;
}

async function fetchAgendaRows(idProfesional, incluirAtendidas, { page, limit, fechaDesde } = {}) {
  const idProf = Number(idProfesional);
  if (!idProf) {
    throw new Error('Profesional inválido');
  }

  const desde = resolveFechaDesde(fechaDesde, incluirAtendidas);

  // Paginación servidor opcional (una página)
  if (page != null && limit != null) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const from = (pageNum - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('agenda')
      .select(AGENDA_SELECT_MASCOTA_TARIFA, { count: 'exact' })
      .eq('id_profesional', idProf)
      .order('fecha', { ascending: true })
      .order('hora_inicio', { ascending: true })
      .range(from, to);

    if (!incluirAtendidas) {
      query = query.eq('atendida', false);
    }
    if (desde) {
      query = query.gte('fecha', desde);
    }

    const { data, error, count } = await query;
    throwIfError(error, 'Error al cargar la agenda');
    return { rows: data ?? [], count: count ?? 0, page: pageNum, limit: pageSize };
  }

  // Carga completa paginada (UI de Agendas / conflictos del día)
  const all = [];
  let from = 0;
  for (;;) {
    let query = supabase
      .from('agenda')
      .select(AGENDA_SELECT_MASCOTA_TARIFA)
      .eq('id_profesional', idProf)
      .order('fecha', { ascending: true })
      .order('hora_inicio', { ascending: true })
      .range(from, from + AGENDA_PAGE_SIZE - 1);

    if (!incluirAtendidas) {
      query = query.eq('atendida', false);
    }
    if (desde) {
      query = query.gte('fecha', desde);
    }

    const { data, error } = await query;
    throwIfError(error, 'Error al cargar la agenda');
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < AGENDA_PAGE_SIZE) break;
    from += AGENDA_PAGE_SIZE;
  }
  return { rows: all, count: all.length, page: 1, limit: all.length || 1 };
}

const AGENDA_SELECT = AGENDA_SELECT_WITH_PROF;

/** IDs de mascota con al menos una cita pendiente de "Mascota lista" (atendida = false). */
export async function getIdsMascotasConCitaActiva(idsMascota = []) {
  const ids = [...new Set((idsMascota || []).map(Number).filter(Boolean))];
  if (ids.length === 0) return successOk([]);

  const unique = new Set();
  // Consulta por lotes para no saturar .in() ni el tope PostgREST
  const BATCH = 100;
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from('agenda')
        .select('id_mascota')
        .in('id_mascota', slice)
        .eq('atendida', false)
        .eq('cancelada', false)
        .range(from, from + AGENDA_PAGE_SIZE - 1);
      throwIfError(error, 'Error al consultar citas activas');
      const rows = data ?? [];
      for (const row of rows) unique.add(row.id_mascota);
      if (rows.length < AGENDA_PAGE_SIZE) break;
      from += AGENDA_PAGE_SIZE;
    }
  }
  return successOk([...unique]);
}

/** Citas activas de una mascota: pendientes de atención (no archivadas ni canceladas). */
export async function getCitasActivasDeMascota(idMascota) {
  const id = Number(idMascota);
  if (!id) {
    throw new Error('Mascota inválida');
  }
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('agenda')
      .select(AGENDA_SELECT)
      .eq('id_mascota', id)
      .eq('atendida', false)
      .eq('cancelada', false)
      .order('fecha', { ascending: true })
      .order('hora_inicio', { ascending: true })
      .range(from, from + AGENDA_PAGE_SIZE - 1);
    throwIfError(error, 'Error al cargar las citas de la mascota');
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < AGENDA_PAGE_SIZE) break;
    from += AGENDA_PAGE_SIZE;
  }
  const mapped = all.map(flattenAgendaRow);
  return successList(mapped, mapped.length, 1, mapped.length || 1);
}

export async function getAgendaDeProfesional(idProfesional, options = {}) {
  const incluirAtendidas = options.incluirAtendidas === true;
  const page = options.page;
  const limit = options.limit;
  // fechaDesde: string ISO, null = sin filtro, undefined = ventana por defecto (activas)
  const fechaDesde = options.fechaDesde;
  const result = await fetchAgendaRows(idProfesional, incluirAtendidas, {
    page,
    limit,
    fechaDesde,
  });
  const rows = result.rows.map(flattenAgendaRow);
  return successList(rows, result.count, result.page, result.limit);
}

/**
 * Solo sincroniza cobrada=true si ya existe cobro vigente.
 * Preferir createCobro / RPC; no usar para "marcar cobrada" sin cobro.
 */
export async function marcarAgendaCobrada(idAgenda, idProfesional = null) {
  const id = Number(idAgenda);
  if (!id) throw new Error('Agenda inválida');

  const { data: vigente, error: vigErr } = await supabase
    .from('cobro')
    .select('id')
    .eq('id_agenda', id)
    .neq('estado', 'anulado')
    .limit(1)
    .maybeSingle();
  throwIfError(vigErr, 'Error al verificar cobros de la agenda');
  if (!vigente) {
    throw new Error(
      'No se puede marcar como cobrada sin un cobro vigente. Registra el cobro primero.'
    );
  }

  let query = supabase.from('agenda').update({ cobrada: true }).eq('id', id);
  if (idProfesional != null && idProfesional !== '') {
    query = query.eq('id_profesional', Number(idProfesional));
  }
  const { data, error } = await query.select('id, cobrada, atendida').maybeSingle();
  throwIfError(error, 'Error al marcar la agenda como cobrada');
  if (!data) {
    throw new Error('Agenda no encontrada');
  }
  return successOk(data);
}

/** Marca la cita como atendida (Mascota lista). Requiere cobrada=true. Preferir RPC. */
export async function marcarAgendaAtendida(idAgenda, idProfesional = null) {
  const id = Number(idAgenda);
  if (!id) {
    throw new Error('Agenda inválida');
  }
  const idProf =
    idProfesional != null && idProfesional !== '' ? Number(idProfesional) : null;

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'marcar_agenda_atendida',
    {
      p_id_agenda: id,
      p_id_profesional: idProf || null,
    }
  );

  if (!rpcError && rpcData) {
    return successOk(rpcData);
  }

  if (isMissingRpcError(rpcError)) {
    throwMissingRpc('marcar_agenda_atendida');
  }
  throwIfError(rpcError, rpcError?.message || 'Error al marcar la agenda como atendida');
  throw new Error('Error al marcar la agenda como atendida');
}

function normalizeObservacionIngreso(payload) {
  if (payload?.observacion_ingreso === undefined && payload?.observacionIngreso === undefined) {
    return undefined;
  }
  const raw = payload?.observacion_ingreso ?? payload?.observacionIngreso ?? '';
  const trimmed = String(raw).trim();
  return trimmed || null;
}

function validateCitaPayload(payload) {
  const id_mascota = Number(payload.id_mascota);
  const id_tarifas = normalizeIdTarifas(payload);
  const id_tarifa = id_tarifas[0];
  const fecha = toDateOnly(payload.fecha?.trim()) || payload.fecha?.trim();
  const hora_inicio = payload.hora_inicio?.trim();
  const hora_fin = payload.hora_fin?.trim();
  const observacion_ingreso = normalizeObservacionIngreso(payload);

  if (!id_mascota || !fecha || !hora_inicio || !hora_fin) {
    throw new Error('Fecha, hora de inicio y hora final son requeridas');
  }
  assertHorarioValido(hora_inicio, hora_fin);

  return {
    id_mascota,
    id_tarifa,
    id_tarifas,
    fecha,
    hora_inicio,
    hora_fin,
    observacion_ingreso:
      observacion_ingreso === undefined ? null : observacion_ingreso,
  };
}

async function assertAgendaEditable(idAgenda, idProfesional) {
  const id = Number(idAgenda);
  const idProf = Number(idProfesional);
  const { data, error } = await supabase
    .from('agenda')
    .select('id, cobrada, atendida, cancelada')
    .eq('id', id)
    .eq('id_profesional', idProf)
    .maybeSingle();
  throwIfError(error, 'Error al validar la cita');
  if (!data) {
    throw new Error('Cita no encontrada');
  }
  if (data.cancelada === true) {
    throw new Error('No se puede modificar una cita cancelada.');
  }
  if (data.cobrada === true) {
    throw new Error(
      'No se puede modificar una cita cobrada. Anula el cobro en Cobros si necesitas corregirla.'
    );
  }
  if (data.atendida === true) {
    throw new Error('No se puede modificar una cita ya marcada como Mascota lista.');
  }
  return data;
}

async function assertAgendaCancelable(idAgenda, idProfesional) {
  const id = Number(idAgenda);
  const idProf = Number(idProfesional);
  const { data, error } = await supabase
    .from('agenda')
    .select('id, cobrada, atendida, cancelada')
    .eq('id', id)
    .eq('id_profesional', idProf)
    .maybeSingle();
  throwIfError(error, 'Error al validar la cita');
  if (!data) {
    throw new Error('Cita no encontrada');
  }
  if (data.cancelada === true) {
    throw new Error('Esta cita ya está cancelada');
  }
  if (data.cobrada === true) {
    throw new Error(
      'No se puede cancelar una cita cobrada. Anula el cobro en Cobros primero.'
    );
  }
  if (data.atendida === true) {
    throw new Error('No se puede cancelar una cita ya marcada como Mascota lista.');
  }

  const { data: vigente, error: vigErr } = await supabase
    .from('cobro')
    .select('id')
    .eq('id_agenda', id)
    .neq('estado', 'anulado')
    .limit(1)
    .maybeSingle();
  throwIfError(vigErr, 'Error al verificar cobros de la cita');
  if (vigente) {
    throw new Error(
      'No se puede cancelar la cita: tiene un cobro vigente. Anúlalo en Cobros primero.'
    );
  }
  return data;
}

export async function crearCitaAgenda(idProfesional, payload) {
  const idProf = Number(idProfesional);
  if (!idProf) throw new Error('Profesional inválido');

  const { id_mascota, id_tarifa, id_tarifas, fecha, hora_inicio, hora_fin, observacion_ingreso } =
    validateCitaPayload(payload);

  await assertTarifasDelProfesional(idProf, id_tarifas);

  await assertSinSolape({
    idProfesional: idProf,
    idMascota: id_mascota,
    fecha,
    hora_inicio,
    hora_fin,
  });

  const { data, error } = await supabase
    .from('agenda')
    .insert({
      id_profesional: idProf,
      id_mascota,
      id_tarifa,
      fecha,
      hora_inicio,
      hora_fin,
      observacion_ingreso,
    })
    .select()
    .single();
  throwIfError(error, 'Error al agendar la mascota');

  try {
    await syncAgendaTarifasClient(data.id, id_tarifas);
  } catch (syncErr) {
    try {
      await supabase.from('agenda').delete().eq('id', data.id);
    } catch {
      /* ignore */
    }
    throw syncErr;
  }

  return successOk({ ...data, id_tarifas, id_tarifa });
}

/**
 * Crea la cita y el cobro en una sola transacción (RPC multi-tarifa).
 * Fail-closed si el RPC no está desplegado (evita estado parcial).
 */
export async function crearCitaYCobrar(idProfesional, payload, cobroExtras = {}) {
  const idProf = Number(idProfesional);
  if (!idProf) {
    throw new Error('Profesional inválido');
  }

  const metodo_pago = cobroExtras.metodo_pago?.trim() || '';
  if (!metodo_pago) {
    throw new Error('El método de pago es requerido');
  }

  const valorPrecheck = parseFloat(cobroExtras.valor);
  if (Number.isNaN(valorPrecheck) || valorPrecheck < 0) {
    throw new Error('El valor del cobro es inválido (revisa las tarifas seleccionadas)');
  }

  const { id_mascota, id_tarifas, fecha, hora_inicio, hora_fin, observacion_ingreso } =
    validateCitaPayload(payload);

  await assertTarifasDelProfesional(idProf, id_tarifas);

  const fecha_cobro = toDateOnly(cobroExtras.fecha_cobro) || fecha;

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'crear_cita_y_cobrar_atomico',
    {
      p_id_profesional: idProf,
      p_id_mascota,
      p_id_tarifas: id_tarifas,
      p_fecha: fecha,
      p_hora_inicio: hora_inicio,
      p_hora_fin: hora_fin,
      p_valor: valorPrecheck,
      p_metodo_pago: metodo_pago,
      p_observacion: cobroExtras.observacion?.trim() || null,
      p_fecha_cobro: fecha_cobro,
      p_observacion_ingreso: observacion_ingreso,
    }
  );

  if (!rpcError && rpcData) {
    return successOk({
      agenda: rpcData.agenda ?? rpcData,
      cobro: rpcData.cobro ?? null,
    });
  }

  if (isMissingRpcError(rpcError)) {
    throwMissingRpc('crear_cita_y_cobrar_atomico');
  }
  throwIfError(rpcError, rpcError?.message || 'Error al agendar y cobrar');
  throw new Error('Error al agendar y cobrar');
}

export async function actualizarCitaAgenda(idProfesional, idAgenda, payload) {
  const idProf = Number(idProfesional);
  const id = Number(idAgenda);
  if (!idProf || !id) throw new Error('Cita inválida');

  await assertAgendaEditable(id, idProf);

  const { id_mascota, id_tarifa, id_tarifas, fecha, hora_inicio, hora_fin, observacion_ingreso } =
    validateCitaPayload(payload);

  await assertTarifasDelProfesional(idProf, id_tarifas);

  await assertSinSolape({
    idProfesional: idProf,
    idMascota: id_mascota,
    fecha,
    hora_inicio,
    hora_fin,
    excludeId: id,
  });

  const { data, error } = await supabase
    .from('agenda')
    .update({
      id_mascota,
      id_tarifa,
      fecha,
      hora_inicio,
      hora_fin,
      observacion_ingreso,
    })
    .eq('id', id)
    .eq('id_profesional', idProf)
    .select()
    .maybeSingle();
  throwIfError(error, 'Error al reprogramar la cita');
  if (!data) {
    throw new Error('Cita no encontrada');
  }

  await syncAgendaTarifasClient(id, id_tarifas);
  return successOk({ ...data, id_tarifas, id_tarifa });
}

export async function cancelarAgenda(idProfesional, idAgenda, observacionCancelacion = '') {
  const idProf = Number(idProfesional);
  const id = Number(idAgenda);
  if (!idProf || !id) throw new Error('Cita inválida');

  await assertAgendaCancelable(id, idProf);

  const { data: rpcData, error: rpcError } = await supabase.rpc('cancelar_agenda_atomico', {
    p_id_agenda: id,
    p_id_profesional: idProf,
    p_observacion_cancelacion: observacionCancelacion?.trim() || null,
  });

  if (!rpcError && rpcData) {
    return successOk(flattenAgendaRow(rpcData));
  }
  if (isMissingRpcError(rpcError)) {
    throwMissingRpc('cancelar_agenda_atomico');
  }
  throwIfError(rpcError, rpcError?.message || 'Error al cancelar la cita');
  throw new Error('Error al cancelar la cita');
}

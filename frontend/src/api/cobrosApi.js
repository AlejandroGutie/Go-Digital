import { supabase } from '../lib/supabaseClient';
import {
  successList,
  successOk,
  throwIfError,
  pageRange,
  escapeIlike,
  sanitizePostgrestOrTerm,
} from '../lib/apiResponse';
import { hoyLocalISO, toDateOnly } from '../utils/format';

export const ESTADOS_COBRO = ['pendiente', 'pagado', 'anulado'];

/** Transiciones permitidas (máquina de estados). */
const TRANSICIONES_COBRO = {
  pendiente: new Set(['pagado', 'anulado']),
  pagado: new Set(['anulado', 'pendiente']),
  anulado: new Set(['pendiente']),
};

function flattenCobroRow(row) {
  const detalles = (row.cobro_detalle || []).map((d) => ({
    id: d.id,
    id_tarifa: d.id_tarifa,
    descripcion: d.descripcion,
    valor: d.valor,
  }));
  return {
    ...row,
    profesional_nombre: row.profesional?.nombre ?? row.profesional_nombre,
    mascota_nombre: row.mascota?.nombre ?? row.mascota_nombre,
    detalles,
    id_tarifas:
      detalles.length > 0
        ? detalles.map((d) => d.id_tarifa).filter((id) => id != null)
        : row.id_tarifa != null
          ? [row.id_tarifa]
          : [],
    profesional: undefined,
    mascota: undefined,
    cobro_detalle: undefined,
  };
}

function normalizeIdTarifasPayload(payload) {
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

function assertEstadoCobro(estado) {
  if (!ESTADOS_COBRO.includes(estado)) {
    throw new Error('Estado de cobro inválido');
  }
}

function assertTransicionEstado(desde, hacia) {
  assertEstadoCobro(hacia);
  if (desde === hacia) return;
  const permitidas = TRANSICIONES_COBRO[desde];
  if (!permitidas || !permitidas.has(hacia)) {
    throw new Error(
      `No se puede cambiar un cobro de «${desde}» a «${hacia}».`
    );
  }
}

function isMissingRpcError(error) {
  return (
    error?.code === 'PGRST202' ||
    /could not find the function|schema cache/i.test(error?.message || '')
  );
}

function throwMissingRpc(nombreRpc) {
  throw new Error(
    `Falta la función ${nombreRpc} en Supabase. Ejecuta las migraciones pendientes (incluye 20260827_000005_actualizar_cobro_pendiente.sql).`
  );
}

async function idsPorNombreIlike(table, termEscaped, limit = 200) {
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .ilike('nombre', `%${termEscaped}%`)
    .limit(limit);
  throwIfError(error, `Error al buscar en ${table}`);
  return (data ?? []).map((r) => r.id).filter((id) => id != null);
}

export async function listCobros(params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(100, parseInt(params.limit, 10) || 20);
  const { from, to } = pageRange(page, limit);

  let query = supabase
    .from('cobro')
    .select(
      '*, profesional(nombre), mascota(nombre), cobro_detalle(id, id_tarifa, descripcion, valor)',
      { count: 'exact' }
    )
    .order('id', { ascending: false });

  if (params.estado) {
    assertEstadoCobro(params.estado);
    query = query.eq('estado', params.estado);
  }
  if (params.id_profesional) {
    const idProf = Number(params.id_profesional);
    if (!idProf) throw new Error('Profesional inválido');
    query = query.eq('id_profesional', idProf);
  }
  if (params.fecha_desde) query = query.gte('fecha_cobro', params.fecha_desde);
  if (params.fecha_hasta) query = query.lte('fecha_cobro', params.fecha_hasta);

  const term = sanitizePostgrestOrTerm(params.search?.trim() || '');
  if (term) {
    const q = escapeIlike(term);
    const termLower = term.toLowerCase();
    const [mascotaIds, profesionalIds] = await Promise.all([
      idsPorNombreIlike('mascota', q),
      idsPorNombreIlike('profesional', q),
    ]);

    const estadosCoincidentes = ESTADOS_COBRO.filter((e) => e.includes(termLower));

    const orParts = [
      `observacion.ilike.%${q}%`,
      `metodo_pago.ilike.%${q}%`,
    ];
    for (const estado of estadosCoincidentes) {
      orParts.push(`estado.eq.${estado}`);
    }
    if (mascotaIds.length) {
      orParts.push(`id_mascota.in.(${mascotaIds.join(',')})`);
    }
    if (profesionalIds.length) {
      orParts.push(`id_profesional.in.(${profesionalIds.join(',')})`);
    }
    if (/^\d+$/.test(term)) {
      orParts.push(`id.eq.${term}`);
      orParts.push(`valor.eq.${term}`);
    }

    query = query.or(orParts.join(','));
  }

  const { data, error, count } = await query.range(from, to);
  throwIfError(error, 'Error al listar cobros');

  const rows = (data ?? []).map(flattenCobroRow);
  return successList(rows, count, page, limit);
}

/**
 * Crea cobro vía RPC atómico multi-tarifa (marca agenda.cobrada y estado=pagado).
 * Fail-closed si el RPC no está desplegado.
 */
export async function createCobro(payload) {
  const id_agenda = Number(payload.id_agenda);
  const id_profesional = Number(payload.id_profesional);
  const id_mascota = Number(payload.id_mascota);
  const id_tarifas = normalizeIdTarifasPayload(payload);
  const valor = parseFloat(payload.valor);
  const metodo_pago = payload.metodo_pago?.trim() || null;
  const observacion = payload.observacion?.trim() || null;
  const fecha_cobro = toDateOnly(payload.fecha_cobro) || hoyLocalISO();

  if (!id_agenda || !id_profesional || !id_mascota || Number.isNaN(valor) || valor < 0) {
    throw new Error('Campos requeridos inválidos');
  }
  if (!metodo_pago) {
    throw new Error('El método de pago es requerido');
  }

  const estadoRaw = payload.estado === 'pendiente' ? 'pendiente' : 'pagado';
  assertEstadoCobro(estadoRaw);
  if (estadoRaw === 'anulado') {
    throw new Error('No se puede crear un cobro directamente como anulado');
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc('create_cobro_atomico', {
    p_id_agenda: id_agenda,
    p_id_profesional: id_profesional,
    p_id_mascota: id_mascota,
    p_id_tarifas: id_tarifas,
    p_valor: valor,
    p_metodo_pago: metodo_pago,
    p_observacion: observacion,
    p_fecha_cobro: fecha_cobro,
    p_estado: estadoRaw,
  });

  if (!rpcError && rpcData) {
    return successOk(rpcData);
  }

  if (isMissingRpcError(rpcError)) {
    throwMissingRpc('create_cobro_atomico');
  }
  throwIfError(rpcError, rpcError?.message || 'Error al crear cobro');
  throw new Error('Error al crear cobro');
}

export async function updateCobro(id, payload) {
  const idCobro = Number(id);
  if (!idCobro) throw new Error('Cobro inválido');

  const { data: existing, error: readErr } = await supabase
    .from('cobro')
    .select('id, id_agenda, estado')
    .eq('id', idCobro)
    .single();
  throwIfError(readErr, 'Cobro no encontrado');

  const patch = {};

  if (payload.estado !== undefined) {
    assertTransicionEstado(existing.estado, payload.estado);
    patch.estado = payload.estado;
  }
  if (payload.metodo_pago !== undefined) {
    if (existing.estado !== 'pendiente') {
      throw new Error('Solo se puede editar el método de pago en cobros pendientes');
    }
    const metodo = payload.metodo_pago?.trim() || '';
    if (!metodo) {
      throw new Error('El método de pago es requerido');
    }
    patch.metodo_pago = metodo;
  }
  if (payload.observacion !== undefined) {
    patch.observacion = payload.observacion?.trim() || null;
  }
  if (payload.valor !== undefined) {
    if (existing.estado !== 'pendiente') {
      throw new Error('No se puede cambiar el valor de un cobro pagado o anulado');
    }
    const valor = parseFloat(payload.valor);
    if (Number.isNaN(valor) || valor < 0) {
      throw new Error('Valor inválido');
    }
    patch.valor = valor;
  }
  if (Object.keys(patch).length === 0) {
    throw new Error('No hay campos para actualizar');
  }

  // Anulación solo vía RPC atómico
  if (patch.estado === 'anulado') {
    if (Object.keys(patch).length !== 1) {
      throw new Error('Para anular un cobro usa solo el cambio de estado.');
    }
    const { data: rpcData, error: rpcError } = await supabase.rpc('anular_cobro_atomico', {
      p_id_cobro: idCobro,
    });
    if (!rpcError && rpcData) {
      return successOk(rpcData);
    }
    if (isMissingRpcError(rpcError)) {
      throwMissingRpc('anular_cobro_atomico');
    }
    throwIfError(rpcError, rpcError?.message || 'Error al anular cobro');
    throw new Error('Error al anular cobro');
  }

  // Restaurar anulado → pendiente vía RPC atómico
  if (patch.estado === 'pendiente' && existing.estado === 'anulado') {
    if (Object.keys(patch).length !== 1) {
      throw new Error('Para restaurar un cobro usa solo el cambio de estado.');
    }
    return restaurarCobro(idCobro);
  }

  // Devolver pago: pagado → pendiente
  if (patch.estado === 'pendiente' && existing.estado === 'pagado') {
    if (Object.keys(patch).length !== 1) {
      throw new Error('Para devolver un pago usa solo el cambio de estado.');
    }
    return devolverPagoCobro(idCobro);
  }

  const { data, error } = await supabase
    .from('cobro')
    .update(patch)
    .eq('id', idCobro)
    .select()
    .single();
  throwIfError(error, 'Error al actualizar cobro');

  return successOk(data);
}

/**
 * Edita un cobro pendiente: valor, método, observación, fecha y (opcional) tarifas.
 */
export async function updateCobroPendiente(id, payload = {}) {
  const idCobro = Number(id);
  if (!idCobro) throw new Error('Cobro inválido');

  const { data: existing, error: readErr } = await supabase
    .from('cobro')
    .select('id, estado')
    .eq('id', idCobro)
    .single();
  throwIfError(readErr, 'Cobro no encontrado');

  if (existing.estado !== 'pendiente') {
    throw new Error('Solo se pueden editar cobros pendientes');
  }

  const valor = parseFloat(payload.valor);
  if (Number.isNaN(valor) || valor < 0) {
    throw new Error('Valor inválido');
  }
  const metodo_pago = payload.metodo_pago?.trim() || '';
  if (!metodo_pago) {
    throw new Error('El método de pago es requerido');
  }

  const hasTarifas =
    payload.id_tarifas !== undefined ||
    payload.tarifasIds !== undefined ||
    payload.id_tarifa !== undefined;

  const rpcArgs = {
    p_id_cobro: idCobro,
    p_valor: valor,
    p_metodo_pago: metodo_pago,
    p_observacion: payload.observacion?.trim() || null,
    p_fecha_cobro: toDateOnly(payload.fecha_cobro) || hoyLocalISO(),
    p_id_tarifas: hasTarifas ? normalizeIdTarifasPayload(payload) : null,
  };

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'actualizar_cobro_pendiente',
    rpcArgs
  );

  if (!rpcError && rpcData) {
    return successOk(rpcData);
  }
  if (isMissingRpcError(rpcError)) {
    throwMissingRpc('actualizar_cobro_pendiente');
  }
  throwIfError(rpcError, rpcError?.message || 'Error al editar cobro');
  throw new Error('Error al editar cobro');
}

/** Restaura un cobro anulado a pendiente (sin borrado físico). */
export async function restaurarCobro(id) {
  const idCobro = Number(id);
  if (!idCobro) throw new Error('Cobro inválido');

  const { data: rpcData, error: rpcError } = await supabase.rpc('restaurar_cobro_atomico', {
    p_id_cobro: idCobro,
  });

  if (!rpcError && rpcData) {
    return successOk(rpcData);
  }
  if (isMissingRpcError(rpcError)) {
    throwMissingRpc('restaurar_cobro_atomico');
  }
  throwIfError(rpcError, rpcError?.message || 'Error al restaurar cobro');
  throw new Error('Error al restaurar cobro');
}

/** Devuelve un cobro pagado a pendiente (editable / re-pagable). */
export async function devolverPagoCobro(id) {
  const idCobro = Number(id);
  if (!idCobro) throw new Error('Cobro inválido');

  const { data: rpcData, error: rpcError } = await supabase.rpc('devolver_pago_cobro', {
    p_id_cobro: idCobro,
  });

  if (!rpcError && rpcData) {
    return successOk(rpcData);
  }
  if (isMissingRpcError(rpcError)) {
    throwMissingRpc('devolver_pago_cobro');
  }
  throwIfError(rpcError, rpcError?.message || 'Error al devolver el pago');
  throw new Error('Error al devolver el pago');
}

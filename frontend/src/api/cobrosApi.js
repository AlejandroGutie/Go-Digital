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

function flattenCobroRow(row) {
  return {
    ...row,
    profesional_nombre: row.profesional?.nombre ?? row.profesional_nombre,
    mascota_nombre: row.mascota?.nombre ?? row.mascota_nombre,
    profesional: undefined,
    mascota: undefined,
  };
}

function assertEstadoCobro(estado) {
  if (!ESTADOS_COBRO.includes(estado)) {
    throw new Error('Estado de cobro inválido');
  }
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
    .select('*, profesional(nombre), mascota(nombre)', { count: 'exact' })
    .order('id', { ascending: false });

  if (params.estado) {
    assertEstadoCobro(params.estado);
    query = query.eq('estado', params.estado);
  }
  if (params.id_profesional) {
    query = query.eq('id_profesional', params.id_profesional);
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
 * Fallback si el RPC create_cobro_atomico aún no está desplegado.
 * Valida agenda, inserta cobro y marca cobrada; compensa si el update falla.
 */
async function createCobroClientFallback(payload) {
  const id_agenda = Number(payload.id_agenda);
  const id_profesional = Number(payload.id_profesional);
  const id_mascota = Number(payload.id_mascota);
  const id_tarifa = payload.id_tarifa ? Number(payload.id_tarifa) : null;
  const valor = parseFloat(payload.valor);
  const metodo_pago = payload.metodo_pago?.trim() || null;
  const observacion = payload.observacion?.trim() || null;
  const fecha_cobro = toDateOnly(payload.fecha_cobro) || hoyLocalISO();

  if (!id_agenda || !id_profesional || !id_mascota || Number.isNaN(valor) || valor < 0) {
    throw new Error('Campos requeridos inválidos');
  }
  if (!id_tarifa) {
    throw new Error('La tarifa es requerida');
  }

  const { data: agenda, error: agendaReadErr } = await supabase
    .from('agenda')
    .select('id, id_profesional, id_mascota, id_tarifa, cobrada')
    .eq('id', id_agenda)
    .maybeSingle();
  throwIfError(agendaReadErr, 'Error al validar la agenda');
  if (!agenda) throw new Error('Agenda no encontrada');
  if (agenda.cobrada === true) throw new Error('La agenda ya fue cobrada');
  if (Number(agenda.id_profesional) !== id_profesional) {
    throw new Error('El profesional no coincide con la agenda');
  }
  if (Number(agenda.id_mascota) !== id_mascota) {
    throw new Error('La mascota no coincide con la agenda');
  }

  const { data: vigente, error: vigenteErr } = await supabase
    .from('cobro')
    .select('id')
    .eq('id_agenda', id_agenda)
    .neq('estado', 'anulado')
    .limit(1)
    .maybeSingle();
  throwIfError(vigenteErr, 'Error al verificar cobros existentes');
  if (vigente) throw new Error('Ya existe un cobro vigente para esta agenda');

  const { data, error } = await supabase
    .from('cobro')
    .insert({
      id_agenda,
      id_profesional,
      id_mascota,
      id_tarifa,
      valor,
      metodo_pago,
      observacion,
      fecha_cobro,
    })
    .select()
    .single();
  throwIfError(error, 'Error al crear cobro');

  const { error: agendaError } = await supabase
    .from('agenda')
    .update({ cobrada: true })
    .eq('id', id_agenda);

  if (agendaError) {
    // Compensación: anular el cobro recién creado para no dejar estado inconsistente
    await supabase.from('cobro').update({ estado: 'anulado' }).eq('id', data.id);
    throw new Error(
      'No se pudo marcar la agenda como cobrada. Revisa la columna agenda.cobrada en Supabase (ejecuta la migración).'
    );
  }

  return data;
}

export async function createCobro(payload) {
  const id_agenda = Number(payload.id_agenda);
  const id_profesional = Number(payload.id_profesional);
  const id_mascota = Number(payload.id_mascota);
  const id_tarifa = payload.id_tarifa ? Number(payload.id_tarifa) : null;
  const valor = parseFloat(payload.valor);
  const metodo_pago = payload.metodo_pago?.trim() || null;
  const observacion = payload.observacion?.trim() || null;
  const fecha_cobro = toDateOnly(payload.fecha_cobro) || hoyLocalISO();

  if (!id_agenda || !id_profesional || !id_mascota || Number.isNaN(valor) || valor < 0) {
    throw new Error('Campos requeridos inválidos');
  }
  if (!id_tarifa) {
    throw new Error('La tarifa es requerida');
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc('create_cobro_atomico', {
    p_id_agenda: id_agenda,
    p_id_profesional: id_profesional,
    p_id_mascota: id_mascota,
    p_id_tarifa: id_tarifa,
    p_valor: valor,
    p_metodo_pago: metodo_pago,
    p_observacion: observacion,
    p_fecha_cobro: fecha_cobro,
  });

  if (!rpcError && rpcData) {
    return successOk(rpcData);
  }

  // RPC ausente u otro error recuperable → fallback validado
  const missingRpc =
    rpcError?.code === 'PGRST202' ||
    /could not find the function|schema cache/i.test(rpcError?.message || '');

  if (!missingRpc && rpcError) {
    throwIfError(rpcError, rpcError.message || 'Error al crear cobro');
  }

  const data = await createCobroClientFallback({
    id_agenda,
    id_profesional,
    id_mascota,
    id_tarifa,
    valor,
    metodo_pago,
    observacion,
    fecha_cobro,
  });
  return successOk(data);
}

async function liberarAgendaSiSinCobroVigente(idAgenda) {
  if (!idAgenda) return;
  const { data: vigente, error } = await supabase
    .from('cobro')
    .select('id')
    .eq('id_agenda', idAgenda)
    .neq('estado', 'anulado')
    .limit(1)
    .maybeSingle();
  throwIfError(error, 'Error al verificar cobros de la agenda');
  if (!vigente) {
    const { error: upErr } = await supabase
      .from('agenda')
      .update({ cobrada: false })
      .eq('id', idAgenda);
    throwIfError(upErr, 'Error al liberar la agenda tras anular el cobro');
  }
}

export async function updateCobro(id, payload) {
  const patch = {};

  if (payload.estado !== undefined) {
    assertEstadoCobro(payload.estado);
    patch.estado = payload.estado;
  }
  if (payload.metodo_pago !== undefined) {
    patch.metodo_pago = payload.metodo_pago?.trim() || null;
  }
  if (payload.observacion !== undefined) {
    patch.observacion = payload.observacion?.trim() || null;
  }
  if (payload.valor !== undefined) {
    const valor = parseFloat(payload.valor);
    if (Number.isNaN(valor) || valor < 0) {
      throw new Error('Valor inválido');
    }
    patch.valor = valor;
  }
  if (Object.keys(patch).length === 0) {
    throw new Error('No hay campos para actualizar');
  }

  // Anulación preferente vía RPC atómico
  if (patch.estado === 'anulado' && Object.keys(patch).length === 1) {
    const { data: rpcData, error: rpcError } = await supabase.rpc('anular_cobro_atomico', {
      p_id_cobro: Number(id),
    });
    if (!rpcError && rpcData) {
      return successOk(rpcData);
    }
    const missingRpc =
      rpcError?.code === 'PGRST202' ||
      /could not find the function|schema cache/i.test(rpcError?.message || '');
    if (!missingRpc && rpcError) {
      throwIfError(rpcError, rpcError.message || 'Error al anular cobro');
    }
  }

  const { data: existing, error: readErr } = await supabase
    .from('cobro')
    .select('id, id_agenda, estado')
    .eq('id', id)
    .single();
  throwIfError(readErr, 'Cobro no encontrado');

  const { data, error } = await supabase
    .from('cobro')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  throwIfError(error, 'Error al actualizar cobro');

  if (patch.estado === 'anulado' && existing.estado !== 'anulado') {
    await liberarAgendaSiSinCobroVigente(existing.id_agenda);
  }

  return successOk(data);
}

export async function deleteCobro(id) {
  const { data: existing, error: readErr } = await supabase
    .from('cobro')
    .select('estado, id_agenda')
    .eq('id', id)
    .single();
  throwIfError(readErr, 'Cobro no encontrado');

  if (existing.estado !== 'anulado') {
    throw new Error('Solo se pueden eliminar cobros anulados');
  }

  const { data, error } = await supabase
    .from('cobro')
    .delete()
    .eq('id', id)
    .select()
    .single();
  throwIfError(error, 'Error al eliminar cobro');
  return successOk(data);
}

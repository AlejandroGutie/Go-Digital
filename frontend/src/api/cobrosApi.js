import { supabase } from '../lib/supabaseClient';
import {
  successList,
  successOk,
  throwIfError,
  pageRange,
} from '../lib/apiResponse';
import { hoyLocalISO, toDateOnly } from '../utils/format';

function flattenCobroRow(row) {
  return {
    ...row,
    profesional_nombre: row.profesional?.nombre ?? row.profesional_nombre,
    mascota_nombre: row.mascota?.nombre ?? row.mascota_nombre,
    profesional: undefined,
    mascota: undefined,
  };
}

export async function listCobros(params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(100, parseInt(params.limit, 10) || 20);
  const { from, to } = pageRange(page, limit);

  let query = supabase
    .from('cobro')
    .select('*, profesional(nombre), mascota(nombre)', { count: 'exact' })
    .order('id', { ascending: false });

  if (params.estado) query = query.eq('estado', params.estado);
  if (params.id_profesional) {
    query = query.eq('id_profesional', params.id_profesional);
  }
  if (params.fecha_desde) query = query.gte('fecha_cobro', params.fecha_desde);
  if (params.fecha_hasta) query = query.lte('fecha_cobro', params.fecha_hasta);

  const { data, error, count } = await query.range(from, to);
  throwIfError(error, 'Error al listar cobros');

  const rows = (data ?? []).map(flattenCobroRow);
  return successList(rows, count, page, limit);
}

export async function createCobro(payload) {
  const id_agenda = payload.id_agenda;
  const id_profesional = payload.id_profesional;
  const id_mascota = payload.id_mascota;
  const id_tarifa = payload.id_tarifa || null;
  const valor = parseFloat(payload.valor);
  const metodo_pago = payload.metodo_pago?.trim() || null;
  const observacion = payload.observacion?.trim() || null;
  const fecha_cobro =
    toDateOnly(payload.fecha_cobro) || hoyLocalISO();

  if (!id_agenda || !id_profesional || !id_mascota || Number.isNaN(valor) || valor < 0) {
    throw new Error('Campos requeridos inválidos');
  }

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
  return successOk(data);
}

export async function updateCobro(id, payload) {
  const patch = {};
  if (payload.estado !== undefined) patch.estado = payload.estado;
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

  const { data, error } = await supabase
    .from('cobro')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  throwIfError(error, 'Error al actualizar cobro');
  return successOk(data);
}

export async function deleteCobro(id) {
  const { data: existing, error: readErr } = await supabase
    .from('cobro')
    .select('estado')
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

export async function getResumen(params = {}) {
  const { data, error } = await supabase.rpc('get_resumen_financiero', {
    p_fecha_desde: params.fecha_desde || null,
    p_fecha_hasta: params.fecha_hasta || null,
  });
  throwIfError(error, 'Error al generar informe');
  return { status: 'success', data };
}

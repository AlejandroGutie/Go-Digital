import { supabase } from '../lib/supabaseClient';
import {
  successList,
  successOk,
  throwIfError,
  pageRange,
} from '../lib/apiResponse';

export async function listTarifas(idProfesional, options = {}) {
  const idProf = Number(idProfesional);
  if (!idProf) throw new Error('Profesional inválido');

  const page = options.page != null ? Math.max(1, parseInt(options.page, 10) || 1) : null;
  const limit =
    options.limit != null
      ? Math.min(1000, Math.max(1, parseInt(options.limit, 10) || 100))
      : null;

  // Sin page/limit: carga completa paginada (hasta agotar)
  if (page == null || limit == null) {
    const all = [];
    let from = 0;
    const PAGE = 500;
    for (;;) {
      const { data, error } = await supabase
        .from('tarifa')
        .select('*')
        .eq('id_profesional', idProf)
        .order('id')
        .range(from, from + PAGE - 1);
      throwIfError(error, 'Error al listar tarifas');
      const rows = data ?? [];
      all.push(...rows);
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    return successList(all, all.length, 1, all.length || 1);
  }

  const { from, to, page: p, limit: l } = pageRange(page, limit);
  const { data, error, count } = await supabase
    .from('tarifa')
    .select('*', { count: 'exact' })
    .eq('id_profesional', idProf)
    .order('id')
    .range(from, to);
  throwIfError(error, 'Error al listar tarifas');
  return successList(data ?? [], count, p, l);
}

export async function createTarifa(idProfesional, payload) {
  const idProf = Number(idProfesional);
  if (!idProf) throw new Error('Profesional inválido');

  const descripcion = payload.descripcion?.trim();
  const valor = parseFloat(payload.valor);
  if (!descripcion || Number.isNaN(valor) || valor < 0) {
    throw new Error('Campos requeridos inválidos');
  }

  const { data, error } = await supabase
    .from('tarifa')
    .insert({ id_profesional: idProf, descripcion, valor })
    .select()
    .single();
  throwIfError(error, 'Error al crear tarifa');
  return successOk(data);
}

export async function updateTarifa(idProfesional, tid, payload) {
  const idProf = Number(idProfesional);
  const id = Number(tid);
  if (!idProf || !id) throw new Error('Tarifa inválida');

  const patch = {};
  if (payload.descripcion !== undefined) {
    patch.descripcion = payload.descripcion?.trim();
  }
  if (payload.valor !== undefined) {
    const valor = parseFloat(payload.valor);
    if (Number.isNaN(valor) || valor < 0) {
      throw new Error('Valor inválido');
    }
    patch.valor = valor;
  }
  if (payload.activo !== undefined) {
    patch.activo = payload.activo;
  }
  if (Object.keys(patch).length === 0) {
    throw new Error('No hay campos para actualizar');
  }

  const { data, error } = await supabase
    .from('tarifa')
    .update(patch)
    .eq('id', id)
    .eq('id_profesional', idProf)
    .select()
    .single();
  throwIfError(error, 'Error al actualizar tarifa');
  return successOk(data);
}

/** Soft-delete: desactiva la tarifa (conserva historial en agenda/cobro). */
export async function deleteTarifa(idProfesional, tid) {
  return updateTarifa(idProfesional, tid, { activo: false });
}

import { supabase } from '../lib/supabaseClient';
import {
  successList,
  successOk,
  throwIfError,
} from '../lib/apiResponse';

export async function listTarifas(idProfesional) {
  const { data, error } = await supabase
    .from('tarifa')
    .select('*')
    .eq('id_profesional', idProfesional)
    .order('id');
  throwIfError(error, 'Error al listar tarifas');
  return successList(data ?? [], data?.length ?? 0, 1, data?.length || 1);
}

export async function createTarifa(idProfesional, payload) {
  const descripcion = payload.descripcion?.trim();
  const valor = parseFloat(payload.valor);
  if (!descripcion || Number.isNaN(valor) || valor < 0) {
    throw new Error('Campos requeridos inválidos');
  }

  const { data, error } = await supabase
    .from('tarifa')
    .insert({ id_profesional: idProfesional, descripcion, valor })
    .select()
    .single();
  throwIfError(error, 'Error al crear tarifa');
  return successOk(data);
}

export async function updateTarifa(idProfesional, tid, payload) {
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
    .eq('id', tid)
    .eq('id_profesional', idProfesional)
    .select()
    .single();
  throwIfError(error, 'Error al actualizar tarifa');
  return successOk(data);
}

export async function deleteTarifa(idProfesional, tid) {
  const { data, error } = await supabase
    .from('tarifa')
    .delete()
    .eq('id', tid)
    .eq('id_profesional', idProfesional)
    .select()
    .single();
  throwIfError(error, 'Error al eliminar tarifa');
  return successOk(data);
}

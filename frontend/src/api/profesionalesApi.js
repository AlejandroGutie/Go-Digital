import { supabase } from '../lib/supabaseClient';
import {
  successList,
  successOk,
  successOne,
  throwIfError,
  pageRange,
  escapeIlike,
} from '../lib/apiResponse';

export async function listProfesionales(page = 1, limit = 20, search = '') {
  const { from, to, page: p, limit: l } = pageRange(page, limit);
  let query = supabase
    .from('profesional')
    .select('id, nombre, telefono', { count: 'exact' })
    .eq('activo', true)
    .order('id');

  const term = search?.trim();
  if (term) {
    const q = escapeIlike(term);
    query = query.or(`nombre.ilike.%${q}%,telefono.ilike.%${q}%`);
  }

  const { data, error, count } = await query.range(from, to);
  throwIfError(error, 'Error al listar profesionales');
  return successList(data ?? [], count, p, l);
}

export async function getProfesionalById(id) {
  const { data, error } = await supabase
    .from('profesional')
    .select('id, nombre, telefono')
    .eq('id', id)
    .eq('activo', true)
    .single();
  throwIfError(error, 'Error al obtener el profesional');
  return successOne(data);
}

export async function createProfesional(payload) {
  const nombre = payload.nombre?.trim();
  const telefono = payload.telefono?.trim();
  if (!nombre || !telefono) {
    throw new Error('Nombre y teléfono son requeridos');
  }

  const { data, error } = await supabase
    .from('profesional')
    .insert({ nombre, telefono })
    .select()
    .single();
  throwIfError(error, 'Error al crear el profesional');
  return successOk(data);
}

export async function updateProfesional(id, payload) {
  const patch = {};
  if (payload.nombre?.trim()) patch.nombre = payload.nombre.trim();
  if (payload.telefono?.trim()) patch.telefono = payload.telefono.trim();
  if (Object.keys(patch).length === 0) {
    throw new Error('No hay campos para actualizar');
  }

  const { data, error } = await supabase
    .from('profesional')
    .update(patch)
    .eq('id', id)
    .eq('activo', true)
    .select()
    .single();
  throwIfError(error, 'Error al actualizar el profesional');
  return successOk(data);
}

export async function deleteProfesional(id) {
  const { data, error } = await supabase
    .from('profesional')
    .update({ activo: false })
    .eq('id', id)
    .select()
    .single();
  throwIfError(error, 'Error al inactivar el profesional');
  return {
    status: 'ok',
    message: 'Profesional inactivado correctamente',
    data,
  };
}

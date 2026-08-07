import { supabase } from '../lib/supabaseClient';
import {
  successList,
  successOk,
  successOne,
  throwIfError,
  pageRange,
  escapeIlike,
} from '../lib/apiResponse';

export async function listCuidadores(page = 1, limit = 20, search = '') {
  const { from, to, page: p, limit: l } = pageRange(page, limit);
  let query = supabase
    .from('cuidador')
    .select('id, nombre, telefono, direccion, email', { count: 'exact' })
    .order('id');

  const term = search?.trim();
  if (term) {
    const q = escapeIlike(term);
    query = query.or(`nombre.ilike.%${q}%,telefono.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const { data, error, count } = await query.range(from, to);
  throwIfError(error, 'Error al listar cuidadores');
  return successList(data ?? [], count, p, l);
}

export async function getCuidadorById(id) {
  const { data, error } = await supabase
    .from('cuidador')
    .select('id, nombre, telefono, direccion, email')
    .eq('id', id)
    .single();
  throwIfError(error, 'Error al obtener el cuidador');
  return successOne(data);
}

export async function createCuidador(payload) {
  const nombre = payload.nombre?.trim();
  const telefono = payload.telefono?.trim();
  const direccion = payload.direccion?.trim();
  const email = payload.email?.trim().toLowerCase() || null;
  if (!nombre || !telefono || !direccion) {
    throw new Error('Nombre, teléfono y dirección son requeridos');
  }

  const { data, error } = await supabase
    .from('cuidador')
    .insert({ nombre, telefono, direccion, email })
    .select()
    .single();
  throwIfError(error, 'Error al crear el cuidador');
  return successOk(data);
}

export async function updateCuidador(id, payload) {
  const nombre = payload.nombre?.trim();
  const telefono = payload.telefono?.trim();
  const direccion = payload.direccion?.trim();
  if (!nombre || !telefono || !direccion) {
    throw new Error('Nombre, teléfono y dirección son requeridos para actualizar');
  }

  const patch = { nombre, telefono, direccion };
  if (Object.prototype.hasOwnProperty.call(payload, 'email')) {
    patch.email = payload.email?.trim().toLowerCase() || null;
  }

  const { data, error } = await supabase
    .from('cuidador')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  throwIfError(error, 'Error al actualizar el cuidador');
  return successOk(data);
}

export async function deleteCuidador(id) {
  const { data, error } = await supabase
    .from('cuidador')
    .delete()
    .eq('id', id)
    .select()
    .single();
  throwIfError(error, 'Error al eliminar el cuidador');
  return successOk(data);
}

export async function getMascotasDeCuidador(id) {
  const { data, error } = await supabase
    .from('cuidador_mascota')
    .select(
      'fecha_inicio, activo, mascota(id, nombre, especie, raza, tamano, fecha_nacimiento)'
    )
    .eq('id_cuidador', id)
    .order('fecha_inicio', { ascending: false });
  throwIfError(error, 'Error al obtener mascotas del cuidador');

  const rows = (data ?? []).map((row) => ({
    id: row.mascota?.id,
    nombre: row.mascota?.nombre,
    especie: row.mascota?.especie,
    raza: row.mascota?.raza,
    tamano: row.mascota?.tamano,
    fecha_nacimiento: row.mascota?.fecha_nacimiento,
    fecha_inicio: row.fecha_inicio,
    activo: row.activo,
  }));

  return successList(rows, rows.length, 1, rows.length || 1);
}

export async function asignarMascota(id, idMascota) {
  const { data, error } = await supabase
    .from('cuidador_mascota')
    .insert({ id_cuidador: id, id_mascota: idMascota })
    .select()
    .maybeSingle();

  if (error?.code === '23505') {
    throw new Error('La mascota ya está asignada a este cuidador');
  }
  throwIfError(error, 'Error al asignar la mascota');
  if (!data) {
    throw new Error('La mascota ya está asignada a este cuidador');
  }
  return successOk(data);
}

export async function desasignarMascota(id, idMascota) {
  const { data, error } = await supabase
    .from('cuidador_mascota')
    .delete()
    .eq('id_cuidador', id)
    .eq('id_mascota', idMascota)
    .select()
    .maybeSingle();
  throwIfError(error, 'Error al desasignar la mascota');
  if (!data) {
    throw new Error('Relación no encontrada');
  }
  return successOk(data);
}

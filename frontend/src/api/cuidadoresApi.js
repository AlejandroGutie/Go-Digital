import { supabase } from '../lib/supabaseClient';
import {
  successList,
  successOk,
  successOne,
  throwIfError,
  pageRange,
  escapeIlike,
} from '../lib/apiResponse';
import { hoyLocalISO } from '../utils/format';

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

/** IDs de cuidadores con al menos una mascota asignada (vínculo activo). */
export async function getIdsCuidadoresConVinculosActivos(idsCuidador = []) {
  const ids = [...new Set((idsCuidador || []).map(Number).filter(Boolean))];
  if (ids.length === 0) return successOk([]);

  const unique = new Set();
  const BATCH = 100;
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from('cuidador_mascota')
      .select('id_cuidador')
      .in('id_cuidador', slice)
      .eq('activo', true);
    throwIfError(error, 'Error al verificar mascotas asignadas');
    for (const row of data ?? []) {
      unique.add(row.id_cuidador);
    }
  }
  return successOk([...unique]);
}

/** IDs de cuidadores con mascotas que tienen citas futuras no canceladas. */
export async function getIdsCuidadoresConCitasFuturas(idsCuidador = []) {
  const ids = [...new Set((idsCuidador || []).map(Number).filter(Boolean))];
  if (ids.length === 0) return successOk([]);

  const { data: links, error: linksErr } = await supabase
    .from('cuidador_mascota')
    .select('id_cuidador, id_mascota')
    .in('id_cuidador', ids);
  throwIfError(linksErr, 'Error al verificar mascotas del cuidador');
  if (!links?.length) return successOk([]);

  const mascotaToCuidadores = new Map();
  for (const link of links) {
    const mid = link.id_mascota;
    const cid = link.id_cuidador;
    if (!mascotaToCuidadores.has(mid)) mascotaToCuidadores.set(mid, new Set());
    mascotaToCuidadores.get(mid).add(cid);
  }

  const mascotaIds = [...mascotaToCuidadores.keys()];
  const blocked = new Set();
  const hoy = hoyLocalISO();
  const BATCH = 100;

  for (let i = 0; i < mascotaIds.length; i += BATCH) {
    const slice = mascotaIds.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from('agenda')
      .select('id_mascota')
      .in('id_mascota', slice)
      .eq('cancelada', false)
      .gte('fecha', hoy);
    throwIfError(error, 'Error al verificar citas futuras');
    for (const row of data ?? []) {
      for (const cid of mascotaToCuidadores.get(row.id_mascota) ?? []) {
        blocked.add(cid);
      }
    }
  }

  return successOk([...blocked]);
}

/**
 * Mapa id_cuidador → motivo de bloqueo para eliminación.
 * Valores: 'mascotas_asignadas' | 'citas_futuras'
 */
export async function getMotivosCuidadorNoEliminar(idsCuidador = []) {
  const ids = [...new Set((idsCuidador || []).map(Number).filter(Boolean))];
  if (ids.length === 0) return successOk({});

  const [vinculosRes, citasRes] = await Promise.all([
    getIdsCuidadoresConVinculosActivos(ids),
    getIdsCuidadoresConCitasFuturas(ids),
  ]);

  const motivos = {};
  for (const id of vinculosRes?.data ?? []) {
    motivos[id] = 'mascotas_asignadas';
  }
  for (const id of citasRes?.data ?? []) {
    motivos[id] = 'citas_futuras';
  }
  return successOk(motivos);
}

export const MSG_CUIDADOR_MASCOTAS_ASIGNADAS =
  'No se puede eliminar: tiene mascotas asignadas. Desasígnalas primero en Asignación.';

export const MSG_CUIDADOR_CITAS_FUTURAS =
  'No se puede eliminar: tiene mascotas con citas futuras sin cancelar.';

export function mensajeCuidadorNoEliminar(motivo) {
  if (motivo === 'citas_futuras') return MSG_CUIDADOR_CITAS_FUTURAS;
  if (motivo === 'mascotas_asignadas') return MSG_CUIDADOR_MASCOTAS_ASIGNADAS;
  return null;
}

export async function assertCuidadorEliminable(id) {
  const res = await getMotivosCuidadorNoEliminar([id]);
  const motivo = res?.data?.[Number(id)];
  const msg = mensajeCuidadorNoEliminar(motivo);
  if (msg) throw new Error(msg);
}

export async function deleteCuidador(id) {
  await assertCuidadorEliminable(id);
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

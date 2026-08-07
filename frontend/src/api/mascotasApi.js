import { supabase } from '../lib/supabaseClient';
import {
  successList,
  successOk,
  successOne,
  throwIfError,
  pageRange,
  escapeIlike,
} from '../lib/apiResponse';
import { hoyLocalISO, toDateOnly } from '../utils/format';

const MASCOTA_COLUMNS = 'id, nombre, especie, raza, tamano, fecha_nacimiento';

function normalizeFechaNacimiento(valor) {
  const fecha = toDateOnly(valor);
  if (!fecha) {
    throw new Error('La fecha de nacimiento es requerida');
  }
  if (fecha > hoyLocalISO()) {
    throw new Error('La fecha de nacimiento no puede ser futura');
  }
  return fecha;
}

export async function listMascotas(page = 1, limit = 20, search = '') {
  const { from, to, page: p, limit: l } = pageRange(page, limit);
  let query = supabase
    .from('mascota')
    .select(MASCOTA_COLUMNS, { count: 'exact' })
    .order('id');

  const term = search?.trim();
  if (term) {
    const q = escapeIlike(term);
    query = query.or(
      `nombre.ilike.%${q}%,raza.ilike.%${q}%,especie.ilike.%${q}%,tamano.ilike.%${q}%`
    );
  }

  const { data, error, count } = await query.range(from, to);
  throwIfError(error, 'Error al listar mascotas');
  return successList(data ?? [], count, p, l);
}

/**
 * Listado para asignar: incluye nombres de cuidadores ya vinculados
 * (desambiguación en combos). No altera el contrato de listMascotas.
 */
export async function listMascotasConCuidadores(page = 1, limit = 20, search = '') {
  const { from, to, page: p, limit: l } = pageRange(page, limit);
  let query = supabase
    .from('mascota')
    .select(
      `${MASCOTA_COLUMNS}, cuidador_mascota(cuidador(id, nombre))`,
      { count: 'exact' }
    )
    .order('id');

  const term = search?.trim();
  if (term) {
    const q = escapeIlike(term);
    query = query.or(
      `nombre.ilike.%${q}%,raza.ilike.%${q}%,especie.ilike.%${q}%,tamano.ilike.%${q}%`
    );
  }

  const { data, error, count } = await query.range(from, to);
  throwIfError(error, 'Error al listar mascotas');

  const rows = (data ?? []).map((row) => {
    const cuidadores = (row.cuidador_mascota ?? [])
      .map((link) => link?.cuidador)
      .filter((c) => c?.id && c?.nombre);
    const seen = new Set();
    const cuidadoresUnicos = [];
    for (const c of cuidadores) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      cuidadoresUnicos.push({ id: c.id, nombre: c.nombre });
    }
    return {
      id: row.id,
      nombre: row.nombre,
      especie: row.especie,
      raza: row.raza,
      tamano: row.tamano,
      fecha_nacimiento: row.fecha_nacimiento,
      cuidadores: cuidadoresUnicos,
    };
  });

  return successList(rows, count, p, l);
}

export async function getMascotaById(id) {
  const { data, error } = await supabase
    .from('mascota')
    .select(MASCOTA_COLUMNS)
    .eq('id', id)
    .single();
  throwIfError(error, 'Error al obtener la mascota');
  return successOne(data);
}

export async function createMascota(payload) {
  const nombre = payload.nombre?.trim();
  const especie = payload.especie?.trim();
  const raza = payload.raza?.trim();
  const tamano = payload.tamano?.trim();
  const fecha_nacimiento = normalizeFechaNacimiento(payload.fecha_nacimiento);
  if (!nombre || !especie || !raza || !tamano) {
    throw new Error('Faltan campos requeridos');
  }

  const { data, error } = await supabase
    .from('mascota')
    .insert({ nombre, especie, raza, tamano, fecha_nacimiento })
    .select()
    .single();
  throwIfError(error, 'Error al guardar la mascota');
  return successOk(data);
}

export async function updateMascota(id, payload) {
  const patch = {};
  if (payload.nombre?.trim()) patch.nombre = payload.nombre.trim();
  if (payload.especie?.trim()) patch.especie = payload.especie.trim();
  if (payload.raza?.trim()) patch.raza = payload.raza.trim();
  if (payload.tamano?.trim()) patch.tamano = payload.tamano.trim();
  if (Object.prototype.hasOwnProperty.call(payload, 'fecha_nacimiento')) {
    patch.fecha_nacimiento = normalizeFechaNacimiento(payload.fecha_nacimiento);
  }
  if (Object.keys(patch).length === 0) {
    throw new Error('No hay campos para actualizar');
  }

  const { data, error } = await supabase
    .from('mascota')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  throwIfError(error, 'Error al actualizar la mascota');
  return successOk(data);
}

export async function deleteMascota(id) {
  const { data, error } = await supabase
    .from('mascota')
    .delete()
    .eq('id', id)
    .select()
    .single();
  throwIfError(error, 'Error al eliminar la mascota');
  return successOk(data);
}

export async function getCuidadoresDeMascota(id) {
  const { data, error } = await supabase
    .from('cuidador_mascota')
    .select(
      'fecha_inicio, activo, cuidador(id, nombre, telefono, direccion, email)'
    )
    .eq('id_mascota', id)
    .order('fecha_inicio', { ascending: false });
  throwIfError(error, 'Error al obtener cuidadores');

  const rows = (data ?? []).map((row) => ({
    id: row.cuidador?.id,
    nombre: row.cuidador?.nombre,
    telefono: row.cuidador?.telefono,
    direccion: row.cuidador?.direccion,
    email: row.cuidador?.email,
    fecha_inicio: row.fecha_inicio,
    activo: row.activo,
  }));

  return successList(rows, rows.length, 1, rows.length || 1);
}

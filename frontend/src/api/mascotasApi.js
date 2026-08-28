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
const COBRO_PAGE_SIZE = 1000;

export const MSG_MASCOTA_COBROS =
  'No se puede eliminar: tiene historial de cobros registrado.';

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

function isMissingRpcError(error) {
  return (
    error?.code === 'PGRST202' ||
    /could not find the function|schema cache/i.test(error?.message || '')
  );
}

/** Fallback cliente: cobros por id_mascota o por citas de la mascota. */
async function mascotaTieneCobrosClient(id) {
  const idNum = Number(id);
  if (!idNum) return false;

  const { data: direct, error: directErr } = await supabase
    .from('cobro')
    .select('id')
    .eq('id_mascota', idNum)
    .limit(1);
  throwIfError(directErr, 'Error al verificar cobros de la mascota');
  if ((direct ?? []).length > 0) return true;

  const agendaIds = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('agenda')
      .select('id')
      .eq('id_mascota', idNum)
      .range(from, from + COBRO_PAGE_SIZE - 1);
    throwIfError(error, 'Error al verificar citas de la mascota');
    const rows = data ?? [];
    agendaIds.push(...rows.map((r) => r.id));
    if (rows.length < COBRO_PAGE_SIZE) break;
    from += COBRO_PAGE_SIZE;
  }

  for (let i = 0; i < agendaIds.length; i += 100) {
    const slice = agendaIds.slice(i, i + 100);
    const { data: viaAgenda, error: viaErr } = await supabase
      .from('cobro')
      .select('id')
      .in('id_agenda', slice)
      .limit(1);
    throwIfError(viaErr, 'Error al verificar cobros de las citas');
    if ((viaAgenda ?? []).length > 0) return true;
  }

  return false;
}

/** Alineado con FK real en BD (incluye cobros ligados vía agenda). */
export async function mascotaPuedeEliminarse(id) {
  const idNum = Number(id);
  if (!idNum) return false;

  const { data, error } = await supabase.rpc('mascota_puede_eliminarse', {
    p_id_mascota: idNum,
  });
  if (!error) return data === true;
  if (isMissingRpcError(error)) {
    return !(await mascotaTieneCobrosClient(idNum));
  }
  throwIfError(error, 'Error al verificar si la mascota puede eliminarse');
  return false;
}

/** Mapa id_mascota → 'cobros' cuando no es eliminable. */
export async function getMotivosMascotaNoEliminar(idsMascota = []) {
  const ids = [...new Set((idsMascota || []).map(Number).filter(Boolean))];
  if (ids.length === 0) return successOk({});

  const { data, error } = await supabase.rpc('get_mascotas_no_eliminables', {
    p_ids: ids,
  });

  if (!error) {
    const motivos = {};
    for (const id of data ?? []) {
      motivos[id] = 'cobros';
    }
    return successOk(motivos);
  }

  if (isMissingRpcError(error)) {
    const motivos = {};
    await Promise.all(
      ids.map(async (id) => {
        if (await mascotaTieneCobrosClient(id)) {
          motivos[id] = 'cobros';
        }
      })
    );
    return successOk(motivos);
  }

  throwIfError(error, 'Error al verificar eliminación de mascotas');
  return successOk({});
}

export function mensajeMascotaNoEliminar(motivo) {
  if (motivo === 'cobros') return MSG_MASCOTA_COBROS;
  return null;
}

export async function assertMascotaEliminable(id) {
  if (!(await mascotaPuedeEliminarse(id))) {
    throw new Error(MSG_MASCOTA_COBROS);
  }
}

export async function deleteMascota(id) {
  await assertMascotaEliminable(id);
  const { data, error } = await supabase
    .from('mascota')
    .delete()
    .eq('id', id)
    .select()
    .single();
  if (error?.code === '23503') {
    throw new Error(MSG_MASCOTA_COBROS);
  }
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

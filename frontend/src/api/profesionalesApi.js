import { supabase } from '../lib/supabaseClient';
import {
  successList,
  successOk,
  successOne,
  throwIfError,
  pageRange,
  escapeIlike,
} from '../lib/apiResponse';
import {
  JORNADA_DEFAULT_FIN,
  JORNADA_DEFAULT_INICIO,
  horaAMinutos,
  toTimeHHMM,
} from '../utils/horarios';
import { hoyLocalISO } from '../utils/format';

const PROFESIONAL_COLUMNS =
  'id, nombre, telefono, hora_inicio_jornada, hora_fin_jornada';
const AGENDA_PAGE_SIZE = 1000;

export const MSG_PROFESIONAL_CITAS_FUTURAS =
  'No se puede inactivar: tiene citas futuras sin cancelar.';

function normalizeJornadaPayload(payload, { required = false } = {}) {
  const inicioRaw = payload.hora_inicio_jornada ?? payload.horaInicioJornada;
  const finRaw = payload.hora_fin_jornada ?? payload.horaFinJornada;

  const inicio =
    inicioRaw === undefined || inicioRaw === null || inicioRaw === ''
      ? required
        ? JORNADA_DEFAULT_INICIO
        : undefined
      : toTimeHHMM(inicioRaw);
  const fin =
    finRaw === undefined || finRaw === null || finRaw === ''
      ? required
        ? JORNADA_DEFAULT_FIN
        : undefined
      : toTimeHHMM(finRaw);

  if (inicio !== undefined || fin !== undefined) {
    const a = horaAMinutos(inicio ?? JORNADA_DEFAULT_INICIO);
    const b = horaAMinutos(fin ?? JORNADA_DEFAULT_FIN);
    if (a == null || b == null || b <= a) {
      throw new Error('La hora fin de jornada debe ser posterior a la hora de inicio');
    }
  }

  return { hora_inicio_jornada: inicio, hora_fin_jornada: fin };
}

export async function listProfesionales(page = 1, limit = 20, search = '') {
  const { from, to, page: p, limit: l } = pageRange(page, limit);
  let query = supabase
    .from('profesional')
    .select(PROFESIONAL_COLUMNS, { count: 'exact' })
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
    .select(PROFESIONAL_COLUMNS)
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

  const jornada = normalizeJornadaPayload(payload, { required: true });

  const { data, error } = await supabase
    .from('profesional')
    .insert({
      nombre,
      telefono,
      hora_inicio_jornada: jornada.hora_inicio_jornada,
      hora_fin_jornada: jornada.hora_fin_jornada,
    })
    .select(PROFESIONAL_COLUMNS)
    .single();
  throwIfError(error, 'Error al crear el profesional');
  return successOk(data);
}

export async function updateProfesional(id, payload) {
  const patch = {};
  if (payload.nombre?.trim()) patch.nombre = payload.nombre.trim();
  if (payload.telefono?.trim()) patch.telefono = payload.telefono.trim();

  if (
    payload.hora_inicio_jornada !== undefined ||
    payload.hora_fin_jornada !== undefined ||
    payload.horaInicioJornada !== undefined ||
    payload.horaFinJornada !== undefined
  ) {
    const jornada = normalizeJornadaPayload(
      {
        hora_inicio_jornada:
          payload.hora_inicio_jornada ?? payload.horaInicioJornada,
        hora_fin_jornada: payload.hora_fin_jornada ?? payload.horaFinJornada,
      },
      { required: true }
    );
    patch.hora_inicio_jornada = jornada.hora_inicio_jornada;
    patch.hora_fin_jornada = jornada.hora_fin_jornada;
  }

  if (Object.keys(patch).length === 0) {
    throw new Error('No hay campos para actualizar');
  }

  const { data, error } = await supabase
    .from('profesional')
    .update(patch)
    .eq('id', id)
    .eq('activo', true)
    .select(PROFESIONAL_COLUMNS)
    .single();
  throwIfError(error, 'Error al actualizar el profesional');
  return successOk(data);
}

/** IDs de profesionales con citas futuras no canceladas. */
export async function getIdsProfesionalesConCitasFuturas(idsProfesional = []) {
  const ids = [...new Set((idsProfesional || []).map(Number).filter(Boolean))];
  if (ids.length === 0) return successOk([]);

  const unique = new Set();
  const hoy = hoyLocalISO();
  const BATCH = 100;

  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from('agenda')
        .select('id_profesional')
        .in('id_profesional', slice)
        .eq('cancelada', false)
        .gte('fecha', hoy)
        .range(from, from + AGENDA_PAGE_SIZE - 1);
      throwIfError(error, 'Error al verificar citas futuras del profesional');
      const rows = data ?? [];
      for (const row of rows) {
        unique.add(row.id_profesional);
      }
      if (rows.length < AGENDA_PAGE_SIZE) break;
      from += AGENDA_PAGE_SIZE;
    }
  }

  return successOk([...unique]);
}

/** Mapa id_profesional → 'citas_futuras' cuando no es inactivable. */
export async function getMotivosProfesionalNoInactivar(idsProfesional = []) {
  const res = await getIdsProfesionalesConCitasFuturas(idsProfesional);
  const motivos = {};
  for (const id of res?.data ?? []) {
    motivos[id] = 'citas_futuras';
  }
  return successOk(motivos);
}

export function mensajeProfesionalNoInactivar(motivo) {
  if (motivo === 'citas_futuras') return MSG_PROFESIONAL_CITAS_FUTURAS;
  return null;
}

export async function assertProfesionalInactivable(id) {
  const { count, error } = await supabase
    .from('agenda')
    .select('id', { count: 'exact', head: true })
    .eq('id_profesional', Number(id))
    .eq('cancelada', false)
    .gte('fecha', hoyLocalISO());
  throwIfError(error, 'Error al verificar citas futuras del profesional');
  if ((count ?? 0) > 0) {
    throw new Error(MSG_PROFESIONAL_CITAS_FUTURAS);
  }
}

export async function deleteProfesional(id) {
  await assertProfesionalInactivable(id);
  const { data, error } = await supabase
    .from('profesional')
    .update({ activo: false })
    .eq('id', id)
    .select(PROFESIONAL_COLUMNS)
    .single();
  throwIfError(error, 'Error al inactivar el profesional');
  return {
    status: 'ok',
    message: 'Profesional inactivado correctamente',
    data,
  };
}

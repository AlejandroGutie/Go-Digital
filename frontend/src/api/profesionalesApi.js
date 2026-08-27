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

const PROFESIONAL_COLUMNS =
  'id, nombre, telefono, hora_inicio_jornada, hora_fin_jornada';

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

export async function deleteProfesional(id) {
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

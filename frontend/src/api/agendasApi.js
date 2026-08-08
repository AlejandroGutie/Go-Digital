import { supabase } from '../lib/supabaseClient';
import {
  successList,
  successOk,
  throwIfError,
} from '../lib/apiResponse';
import { toDateOnly } from '../utils/format';

const AGENDA_PAGE_SIZE = 1000;

function flattenAgendaRow(row) {
  const m = row.mascota;
  const t = row.tarifa;
  return {
    id: row.id,
    id_profesional: row.id_profesional,
    id_mascota: row.id_mascota,
    id_tarifa: row.id_tarifa ?? null,
    fecha: toDateOnly(row.fecha),
    hora_inicio: row.hora_inicio,
    hora_fin: row.hora_fin,
    cobrada: row.cobrada === true,
    mascota_nombre: m?.nombre ?? row.mascota_nombre,
    especie: m?.especie ?? row.especie,
    raza: m?.raza ?? row.raza,
    tamano: m?.tamano ?? row.tamano,
    tarifa_descripcion: t?.descripcion ?? null,
    tarifa_valor: t?.valor ?? null,
  };
}

function normalizeIdTarifa(valor) {
  if (valor == null || valor === '') return null;
  const id = Number(valor);
  if (!id || Number.isNaN(id)) {
    throw new Error('Tarifa inválida');
  }
  return id;
}

/** "HH:MM" o "HH:MM:SS" → minutos desde medianoche. */
export function horaAMinutos(hora) {
  if (!hora) return null;
  const [h, m] = String(hora).split(':');
  const hh = parseInt(h, 10);
  const mm = parseInt(m, 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

export function franjasSeSolapan(inicioA, finA, inicioB, finB) {
  const a0 = horaAMinutos(inicioA);
  const a1 = horaAMinutos(finA);
  const b0 = horaAMinutos(inicioB);
  const b1 = horaAMinutos(finB);
  if ([a0, a1, b0, b1].some((v) => v == null)) return false;
  return a0 < b1 && b0 < a1;
}

function assertHorarioValido(hora_inicio, hora_fin) {
  const ini = horaAMinutos(hora_inicio);
  const fin = horaAMinutos(hora_fin);
  if (ini == null || fin == null) {
    throw new Error('Horario inválido');
  }
  if (fin <= ini) {
    throw new Error('La hora final debe ser posterior a la hora de inicio');
  }
}

async function assertSinSolape({
  idProfesional,
  fecha,
  hora_inicio,
  hora_fin,
  excludeId = null,
}) {
  let query = supabase
    .from('agenda')
    .select('id, hora_inicio, hora_fin')
    .eq('id_profesional', idProfesional)
    .eq('fecha', fecha);

  const { data, error } = await query;
  throwIfError(error, 'Error al validar disponibilidad de agenda');

  for (const row of data ?? []) {
    if (excludeId != null && String(row.id) === String(excludeId)) continue;
    if (franjasSeSolapan(hora_inicio, hora_fin, row.hora_inicio, row.hora_fin)) {
      throw new Error('Ya existe una cita que se solapa en ese horario');
    }
  }
}

async function fetchAgendaRows(idProfesional, incluirCobradas) {
  const all = [];
  let from = 0;
  for (;;) {
    let query = supabase
      .from('agenda')
      .select(
        'id, id_profesional, id_mascota, id_tarifa, fecha, hora_inicio, hora_fin, cobrada, mascota(nombre, especie, raza, tamano), tarifa(descripcion, valor)'
      )
      .eq('id_profesional', idProfesional)
      .order('fecha', { ascending: true })
      .order('hora_inicio', { ascending: true })
      .range(from, from + AGENDA_PAGE_SIZE - 1);

    if (!incluirCobradas) {
      query = query.eq('cobrada', false);
    }

    const { data, error } = await query;
    throwIfError(error, 'Error al cargar la agenda');
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < AGENDA_PAGE_SIZE) break;
    from += AGENDA_PAGE_SIZE;
  }
  return all;
}

export async function getAgendaDeProfesional(idProfesional, options = {}) {
  const incluirCobradas = options.incluirCobradas === true;
  const data = await fetchAgendaRows(idProfesional, incluirCobradas);
  const rows = data.map(flattenAgendaRow);
  return successList(rows, rows.length, 1, rows.length || 1);
}

export async function marcarAgendaCobrada(idAgenda, idProfesional = null) {
  let query = supabase
    .from('agenda')
    .update({ cobrada: true })
    .eq('id', idAgenda);
  if (idProfesional != null && idProfesional !== '') {
    query = query.eq('id_profesional', idProfesional);
  }
  const { data, error } = await query.select('id, cobrada').maybeSingle();
  throwIfError(error, 'Error al marcar la agenda como cobrada');
  if (!data) {
    throw new Error('Agenda no encontrada');
  }
  return successOk(data);
}

function validateCitaPayload(payload) {
  const id_mascota = Number(payload.id_mascota);
  const id_tarifa = normalizeIdTarifa(payload.id_tarifa);
  const fecha = toDateOnly(payload.fecha?.trim()) || payload.fecha?.trim();
  const hora_inicio = payload.hora_inicio?.trim();
  const hora_fin = payload.hora_fin?.trim();

  if (!id_mascota || !fecha || !hora_inicio || !hora_fin) {
    throw new Error('Fecha, hora de inicio y hora final son requeridas');
  }
  if (!id_tarifa) {
    throw new Error('La tarifa es requerida');
  }
  assertHorarioValido(hora_inicio, hora_fin);

  return { id_mascota, id_tarifa, fecha, hora_inicio, hora_fin };
}

export async function crearCitaAgenda(idProfesional, payload) {
  const { id_mascota, id_tarifa, fecha, hora_inicio, hora_fin } =
    validateCitaPayload(payload);

  await assertSinSolape({
    idProfesional,
    fecha,
    hora_inicio,
    hora_fin,
  });

  const { data, error } = await supabase
    .from('agenda')
    .insert({
      id_profesional: idProfesional,
      id_mascota,
      id_tarifa,
      fecha,
      hora_inicio,
      hora_fin,
    })
    .select()
    .single();
  throwIfError(error, 'Error al agendar la mascota');
  return successOk(data);
}

export async function actualizarCitaAgenda(idProfesional, idAgenda, payload) {
  const { id_mascota, id_tarifa, fecha, hora_inicio, hora_fin } =
    validateCitaPayload(payload);

  await assertSinSolape({
    idProfesional,
    fecha,
    hora_inicio,
    hora_fin,
    excludeId: idAgenda,
  });

  const { data, error } = await supabase
    .from('agenda')
    .update({
      id_mascota,
      id_tarifa,
      fecha,
      hora_inicio,
      hora_fin,
    })
    .eq('id', idAgenda)
    .eq('id_profesional', idProfesional)
    .select()
    .maybeSingle();
  throwIfError(error, 'Error al reprogramar la cita');
  if (!data) {
    throw new Error('Cita no encontrada');
  }
  return successOk(data);
}

export async function eliminarCitaAgenda(idProfesional, idAgenda) {
  const { data, error } = await supabase
    .from('agenda')
    .delete()
    .eq('id', idAgenda)
    .eq('id_profesional', idProfesional)
    .select()
    .maybeSingle();
  throwIfError(error, 'Error al eliminar la cita');
  if (!data) {
    throw new Error('Cita no encontrada');
  }
  return successOk(data);
}

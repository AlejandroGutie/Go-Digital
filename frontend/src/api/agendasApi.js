import { supabase } from '../lib/supabaseClient';
import {
  successList,
  successOk,
  throwIfError,
} from '../lib/apiResponse';
import { toDateOnly } from '../utils/format';

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

export async function getAgendaDeProfesional(idProfesional) {
  const { data, error } = await supabase
    .from('agenda')
    .select(
      'id, id_profesional, id_mascota, id_tarifa, fecha, hora_inicio, hora_fin, mascota(nombre, especie, raza, tamano), tarifa(descripcion, valor)'
    )
    .eq('id_profesional', idProfesional)
    .order('fecha', { ascending: true })
    .order('hora_inicio', { ascending: true });
  throwIfError(error, 'Error al cargar la agenda');

  const rows = (data ?? []).map(flattenAgendaRow);
  return successList(rows, rows.length, 1, rows.length || 1);
}

export async function crearCitaAgenda(idProfesional, payload) {
  const id_mascota = Number(payload.id_mascota);
  const id_tarifa = normalizeIdTarifa(payload.id_tarifa);
  const fecha = payload.fecha?.trim();
  const hora_inicio = payload.hora_inicio?.trim();
  const hora_fin = payload.hora_fin?.trim();

  if (!id_mascota || !fecha || !hora_inicio || !hora_fin) {
    throw new Error('Fecha, hora de inicio y hora final son requeridas');
  }
  if (!id_tarifa) {
    throw new Error('La tarifa es requerida');
  }
  if (hora_fin <= hora_inicio) {
    throw new Error('La hora final debe ser posterior a la hora de inicio');
  }

  const { data, error } = await supabase
    .from('agenda')
    .insert({
      id_profesional: idProfesional,
      id_mascota,
      id_tarifa,
      // Guardar solo YYYY-MM-DD (tipo date) sin convertir a Date/UTC
      fecha: toDateOnly(fecha) || fecha,
      hora_inicio,
      hora_fin,
    })
    .select()
    .single();
  throwIfError(error, 'Error al agendar la mascota');
  return successOk(data);
}

export async function actualizarCitaAgenda(idProfesional, idAgenda, payload) {
  const id_mascota = Number(payload.id_mascota);
  const id_tarifa = normalizeIdTarifa(payload.id_tarifa);
  const fecha = payload.fecha?.trim();
  const hora_inicio = payload.hora_inicio?.trim();
  const hora_fin = payload.hora_fin?.trim();

  if (!id_mascota || !fecha || !hora_inicio || !hora_fin) {
    throw new Error('Fecha, hora de inicio y hora final son requeridas');
  }
  if (!id_tarifa) {
    throw new Error('La tarifa es requerida');
  }
  if (hora_fin <= hora_inicio) {
    throw new Error('La hora final debe ser posterior a la hora de inicio');
  }

  const { data, error } = await supabase
    .from('agenda')
    .update({
      id_mascota,
      id_tarifa,
      fecha: toDateOnly(fecha) || fecha,
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

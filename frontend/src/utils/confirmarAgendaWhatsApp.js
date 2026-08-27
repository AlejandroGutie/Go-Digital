import { getCuidadoresDeMascota, getMascotaById } from '../api/mascotasApi';
import { normalizeListPayload } from '../api/normalize';
import { formatFecha, formatHora, formatMoneda } from './format';
import {
  buildWhatsAppConfirmMessage,
  buildWhatsAppReprogramadaMessage,
  openWhatsAppChat,
  sanitizePhoneCO,
} from './whatsapp';

/**
 * Resuelve cuidador activo con teléfono válido para WhatsApp.
 * @throws {Error} si no hay cuidador o teléfono CO válido
 */
export async function resolverCuidadorParaWhatsApp(idMascota, mascotaFallback = null) {
  if (!idMascota) {
    throw new Error('La cita no tiene mascota asociada');
  }

  const [resCuidadores, resMascota] = await Promise.all([
    getCuidadoresDeMascota(idMascota),
    getMascotaById(idMascota).catch(() => null),
  ]);
  const cuidadores = normalizeListPayload(resCuidadores);
  const mascotaData =
    resMascota?.data?.[0] || resMascota?.data || mascotaFallback || null;

  const cuidador =
    cuidadores.find((c) => c.activo !== false && c.telefono) ||
    cuidadores.find((c) => c.telefono) ||
    cuidadores[0] ||
    null;

  if (!cuidador) {
    throw new Error(
      'Esta mascota no tiene un cuidador asignado. Asígnalo en el módulo de Asignación.'
    );
  }

  const phone = sanitizePhoneCO(cuidador.telefono);
  if (!phone) {
    throw new Error(
      'El cuidador no tiene un celular colombiano válido (10 dígitos iniciando en 3, o con prefijo 57). Actualízalo en Cuidadores.'
    );
  }

  return { cuidador, phone, mascotaData };
}

/**
 * Abre WhatsApp con mensaje de confirmación o reprogramación de agenda.
 * @param {'confirmacion'|'reprogramada'} [tipo='confirmacion']
 * @returns {{ cancel: Function }} handle de openWhatsAppChat
 */
export async function confirmarAgendaPorWhatsApp({
  cita,
  profesionalNombre = '',
  mascotaFallback = null,
  tarifaDescripcion = '',
  tarifaValor = null,
  tipo = 'confirmacion',
} = {}) {
  if (!cita) throw new Error('Cita inválida');

  const { cuidador, phone, mascotaData } = await resolverCuidadorParaWhatsApp(
    cita.id_mascota,
    mascotaFallback
  );

  const valor =
    tarifaValor != null && tarifaValor !== ''
      ? tarifaValor
      : cita.tarifa_valor != null && cita.tarifa_valor !== ''
        ? cita.tarifa_valor
        : null;

  const payload = {
    cuidadorNombre: cuidador.nombre,
    mascotaNombre:
      mascotaData?.nombre || cita.mascota_nombre || mascotaFallback?.nombre || '',
    mascotaEspecie:
      mascotaData?.especie || cita.especie || mascotaFallback?.especie || '',
    mascotaRaza: mascotaData?.raza || cita.raza || mascotaFallback?.raza || '',
    mascotaTamano:
      mascotaData?.tamano || cita.tamano || mascotaFallback?.tamano || '',
    profesionalNombre: profesionalNombre || cita.profesional_nombre || '',
    fechaLabel: formatFecha(cita.fecha),
    horaInicioLabel: formatHora(cita.hora_inicio),
    horaFinLabel: formatHora(cita.hora_fin),
    tarifaDescripcion: tarifaDescripcion || cita.tarifa_descripcion || '',
    valorLabel: valor != null && valor !== '' ? formatMoneda(valor) : '',
  };

  const message =
    tipo === 'reprogramada'
      ? buildWhatsAppReprogramadaMessage(payload)
      : buildWhatsAppConfirmMessage(payload);

  return openWhatsAppChat(phone, message);
}

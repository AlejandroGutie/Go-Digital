import { generarMensajeAgendaWhatsApp } from './agendaPlantillas';

/**
 * Normaliza un teléfono móvil colombiano para WhatsApp (solo dígitos, con prefijo 57).
 * Acepta: 3XXXXXXXXX (10 dígitos) o 573XXXXXXXXX (12 dígitos).
 * Rechaza números incompletos, fijos u otros formatos ambiguos.
 */
export function sanitizePhoneCO(telefono) {
  const digits = String(telefono ?? '').replace(/\D/g, '');
  if (!digits) return '';

  if (digits.length === 10 && digits.startsWith('3')) {
    return `57${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('57') && digits[2] === '3') {
    return digits;
  }
  return '';
}

/**
 * Mensaje de confirmación de agenda para WhatsApp.
 * Usa plantilla editable (localStorage) con fallback al texto por defecto.
 * Sin emojis: en varios móviles el deeplink muestra triángulos/rombos negros.
 */
export function buildWhatsAppConfirmMessage(payload) {
  return generarMensajeAgendaWhatsApp('confirmacion', payload);
}

/**
 * Mensaje de cita reprogramada para WhatsApp.
 */
export function buildWhatsAppReprogramadaMessage(payload) {
  return generarMensajeAgendaWhatsApp('reprogramada', payload);
}

/**
 * Aviso de "mascota lista" para recogida o entrega a domicilio.
 */
export function buildWhatsAppMascotaListaMessage(payload) {
  return generarMensajeAgendaWhatsApp('mascota_lista', payload);
}

/**
 * Abre WhatsApp priorizando la app nativa (`whatsapp://`).
 * Si no hay app o el sistema no la abre, cae a `wa.me` (web).
 * Devuelve `{ cancel }` para limpiar timers al desmontar / nuevo intento.
 */
export function openWhatsAppChat(phoneDigits, message) {
  if (!phoneDigits) {
    throw new Error('Número de teléfono no válido');
  }

  const text = encodeURIComponent(message || '');
  const nativeUrl = `whatsapp://send?phone=${phoneDigits}&text=${text}`;
  const webUrl = `https://wa.me/${phoneDigits}?text=${text}`;

  let fellBack = false;
  let cancelled = false;
  let iframeEl = null;
  let removeTimer = null;
  let fallbackTimer = null;

  const openWebFallback = () => {
    if (cancelled || fellBack) return;
    fellBack = true;
    window.open(webUrl, '_blank', 'noopener,noreferrer');
  };

  const cancel = () => {
    cancelled = true;
    if (removeTimer != null) clearTimeout(removeTimer);
    if (fallbackTimer != null) clearTimeout(fallbackTimer);
    if (iframeEl && iframeEl.parentNode) {
      try {
        iframeEl.parentNode.removeChild(iframeEl);
      } catch {
        /* ignore */
      }
    }
  };

  try {
    iframeEl = document.createElement('iframe');
    iframeEl.style.display = 'none';
    iframeEl.src = nativeUrl;
    document.body.appendChild(iframeEl);
    removeTimer = setTimeout(() => {
      if (iframeEl && iframeEl.parentNode) {
        try {
          iframeEl.parentNode.removeChild(iframeEl);
        } catch {
          /* ignore */
        }
      }
    }, 2000);
  } catch {
    try {
      window.location.href = nativeUrl;
    } catch {
      openWebFallback();
      return { cancel };
    }
  }

  fallbackTimer = setTimeout(() => {
    if (!cancelled && document.visibilityState === 'visible') {
      openWebFallback();
    }
  }, 1500);

  return { cancel };
}

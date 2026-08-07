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

export function buildWhatsAppConfirmMessage({
  cuidadorNombre,
  mascotaNombre,
  fechaLabel,
  horaLabel,
}) {
  const nombre = cuidadorNombre || 'cuidador';
  const mascota = mascotaNombre || 'tu mascota';
  const fecha = fechaLabel || 'la fecha indicada';
  const hora = horaLabel || 'la hora indicada';
  return (
    `Hola ${nombre}, te confirmamos la siguiente agenda asignada para la mascota ${mascota} ` +
    `el día ${fecha} a las ${hora}. ` +
    `Hemos descargado el comprobante en PDF en tu dispositivo; ` +
    `por favor adjúntalo manualmente a este chat si deseas enviarlo junto con la confirmación.`
  );
}

/**
 * Abre WhatsApp priorizando la app nativa (`whatsapp://`).
 * Si no hay app o el sistema no la abre, cae a `wa.me` (web).
 */
export function openWhatsAppChat(phoneDigits, message) {
  if (!phoneDigits) {
    throw new Error('Número de teléfono no válido');
  }

  const text = encodeURIComponent(message || '');
  const nativeUrl = `whatsapp://send?phone=${phoneDigits}&text=${text}`;
  const webUrl = `https://wa.me/${phoneDigits}?text=${text}`;

  let fellBack = false;
  const openWebFallback = () => {
    if (fellBack) return;
    fellBack = true;
    window.open(webUrl, '_blank', 'noopener,noreferrer');
  };

  // Intento nativo sin salir de la SPA
  try {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = nativeUrl;
    document.body.appendChild(iframe);
    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {
        /* ignore */
      }
    }, 2000);
  } catch {
    // Si el iframe falla, intenta por location (último recurso nativo)
    try {
      window.location.href = nativeUrl;
    } catch {
      openWebFallback();
      return;
    }
  }

  // Si la app no toma el foco, abrir WhatsApp Web como respaldo
  setTimeout(() => {
    if (document.visibilityState === 'visible') {
      openWebFallback();
    }
  }, 1500);
}

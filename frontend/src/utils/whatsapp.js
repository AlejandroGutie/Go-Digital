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

function line(label, value) {
  const v = value == null || String(value).trim() === '' ? '—' : String(value).trim();
  return `• ${label}: ${v}`;
}

/**
 * Mensaje de confirmación de agenda para WhatsApp (sin PDF).
 * Los labels de fecha/hora/valor deben venir ya formateados desde la UI.
 */
export function buildWhatsAppConfirmMessage({
  cuidadorNombre,
  cuidadorTelefono,
  mascotaNombre,
  mascotaEspecie,
  mascotaRaza,
  mascotaTamano,
  profesionalNombre,
  fechaLabel,
  horaInicioLabel,
  horaFinLabel,
  tarifaDescripcion,
  valorLabel,
}) {
  const nombre = cuidadorNombre?.trim() || 'cliente';
  const horaRango =
    horaInicioLabel && horaFinLabel
      ? `${horaInicioLabel} – ${horaFinLabel}`
      : horaInicioLabel || horaFinLabel || '—';

  const detalleMascota = [mascotaEspecie, mascotaRaza, mascotaTamano]
    .filter(Boolean)
    .join(' · ');

  const lines = [
    `🐾 ¡Hola, ${nombre}! 🐾`,
    '',
    '¡Tu agenda ha sido confirmada con éxito! 🎉',
    'A continuación te compartimos la información de tu reserva:',
    '',
    '📅 Detalles de la Agenda',
    line('Fecha', fechaLabel),
    line('Hora', horaRango),
    line(
      'Tarifa',
      [tarifaDescripcion, valorLabel].filter(Boolean).join(' · ') || '—'
    ),
  ];

  lines.push(
    '',
    '🐶 Mascota',
    line('Nombre', mascotaNombre || '—')
  );
  if (detalleMascota) {
    lines.push(line('Detalle', detalleMascota));
  }

  lines.push(
    '',
    '👨‍⚕️ Profesional asignado',
    line('Nombre', profesionalNombre || '—')
  );

  lines.push('', '👤 Datos del cuidador', line('Nombre', nombre));
  if (cuidadorTelefono) {
    lines.push(line('Teléfono', cuidadorTelefono));
  }

  lines.push(
    '',
    'Quedamos atentos a cualquier inquietud.',
    '¡Nos vemos pronto! 👋'
  );

  return lines.join('\n');
}

/**
 * Abre WhatsApp priorizando la app nativa (`whatsapp://`).
 * Si no hay app o el sistema no la abre, cae a `wa.me` (web).
 * El mensaje se codifica con encodeURIComponent.
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

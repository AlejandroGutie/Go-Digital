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
  const v = value == null || String(value).trim() === '' ? '-' : String(value).trim();
  return `- ${label}: ${v}`;
}

/**
 * Mensaje de confirmación de agenda para WhatsApp (sin PDF).
 * Sin emojis: en varios móviles el deeplink muestra triángulos/rombos negros.
 * Usa formato de texto plano compatible con WhatsApp (*negrita*).
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
      ? `${horaInicioLabel} - ${horaFinLabel}`
      : horaInicioLabel || horaFinLabel || '-';

  const detalleMascota = [mascotaEspecie, mascotaRaza, mascotaTamano]
    .filter(Boolean)
    .join(' / ');

  const tarifaTexto =
    [tarifaDescripcion, valorLabel].filter(Boolean).join(' - ') || '-';

  const lines = [
    `*¡Hola, ${nombre}!*`,
    '',
    'Tu agenda ha sido confirmada con éxito.',
    'Aquí tienes los detalles de tu reserva:',
    '',
    '*AGENDA*',
    line('Fecha', fechaLabel),
    line('Hora', horaRango),
    line('Tarifa', tarifaTexto),
    '',
    '*MASCOTA*',
    line('Nombre', mascotaNombre || '-'),
  ];

  if (detalleMascota) {
    lines.push(line('Detalle', detalleMascota));
  }

  lines.push(
    '',
    '*PROFESIONAL*',
    line('Nombre', profesionalNombre || ''),
    '',
    'Quedamos atentos a cualquier inquietud.',
    '¡Nos vemos pronto!'
  );

  return lines.join('\n');
}

/**
 * Mensaje de cita reprogramada para WhatsApp.
 * Misma estructura que la confirmación, con texto explícito de reprogramación.
 */
export function buildWhatsAppReprogramadaMessage({
  cuidadorNombre,
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
      ? `${horaInicioLabel} - ${horaFinLabel}`
      : horaInicioLabel || horaFinLabel || '-';

  const detalleMascota = [mascotaEspecie, mascotaRaza, mascotaTamano]
    .filter(Boolean)
    .join(' / ');

  const tarifaTexto =
    [tarifaDescripcion, valorLabel].filter(Boolean).join(' - ') || '-';

  const lines = [
    `*¡Hola, ${nombre}!*`,
    '',
    'Tu cita ha sido *reprogramada* con éxito.',
    'Estos son los nuevos datos de tu reserva:',
    '',
    '*NUEVA AGENDA*',
    line('Fecha', fechaLabel),
    line('Hora', horaRango),
    line('Tarifa', tarifaTexto),
    '',
    '*MASCOTA*',
    line('Nombre', mascotaNombre || '-'),
  ];

  if (detalleMascota) {
    lines.push(line('Detalle', detalleMascota));
  }

  lines.push(
    '',
    '*PROFESIONAL*',
    line('Nombre', profesionalNombre || ''),
    '',
    'Quedamos atentos a cualquier inquietud.',
    '¡Te esperamos!'
  );

  return lines.join('\n');
}

/**
 * Aviso de "mascota lista" para recogida o entrega a domicilio.
 * Sin emojis (compatibilidad con deeplink WhatsApp en móviles).
 */
export function buildWhatsAppMascotaListaMessage({
  cuidadorNombre,
  mascotaNombre,
  profesionalNombre,
  fechaLabel,
  horaFinLabel,
  tarifaDescripcion,
}) {
  const nombre = cuidadorNombre?.trim() || 'cliente';
  const mascota = mascotaNombre?.trim() || 'tu mascota';
  const profesional = profesionalNombre?.trim() || '-';
  const fecha = fechaLabel || '-';

  const lines = [
    `*¡Hola, ${nombre}!*`,
    '',
    `¡Grandes noticias! *${mascota}* ya ha terminado su sesión y está listo(a) para ser recogido(a) o entregado(a) en domicilio, según lo acordado.`,
    '',
    '*DETALLES DEL SERVICIO*',
    line('Mascota', mascota),
    line('Atendido por', profesional),
    line('Fecha', fecha),
  ];

  if (horaFinLabel) {
    lines.push(line('Hora de fin', horaFinLabel));
  }
  if (tarifaDescripcion) {
    lines.push(line('Servicio', tarifaDescripcion));
  }

  lines.push(
    '',
    '*INDICACIONES*',
    '- Si la recogida es en el salón, puedes pasar cuando te sea conveniente.',
    '- Si acordaron entrega a domicilio, te contactaremos o confirma la dirección y franja para coordinar.',
    '',
    '¡Te esperamos pronto para reencontrarte con tu peludito!'
  );

  return lines.join('\n');
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

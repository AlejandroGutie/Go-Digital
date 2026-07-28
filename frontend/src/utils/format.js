// Formato Fechas
export function formatFecha(iso) {
    if (!iso) return '—';
    const date = new Date(iso);
  
    // 1. Obtenemos el nombre del mes por separado y le ponemos mayúscula
    const mesBruto = date.toLocaleDateString('es-CO', { month: 'long' });
    const mesMayuscula = mesBruto.charAt(0).toUpperCase() + mesBruto.slice(1);
  
    // 2. Obtenemos el día y el año
    const dia = date.toLocaleDateString('es-CO', { day: '2-digit' });
    const anio = date.toLocaleDateString('es-CO', { year: 'numeric' });
  
    // 3. Unimos todo: "05 de Abril de 2026"
    return `${dia} de ${mesMayuscula} de ${anio}`;
  }
  
  // Formatos Hora
  export function formatHora(timeStr) {
    if (!timeStr) return '—';
  
    // 1. Creamos una fecha ficticia hoy con la hora que recibimos
    // "21:12:00" -> Date con esa hora
    const [horas, minutos] = timeStr.split(':');
    const date = new Date();
    date.setHours(parseInt(horas), parseInt(minutos));
  
    // 2. Formateamos a 12 horas con AM/PM
    const opciones = {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    };
  
    const horaFormateada = date.toLocaleTimeString('es-CO', opciones);
  
    // 3. Limpiamos el formato (a veces devuelve "p. m." y lo pasamos a "PM")
    return horaFormateada.replace(/\./g, '').toUpperCase();
  }
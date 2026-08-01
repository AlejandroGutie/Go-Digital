import { hoyLocalISO, parseFechaLocal, toDateOnly } from './format';

function addDays(date, days) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0 domingo
  const diff = day === 0 ? -6 : 1 - day; // lunes como inicio
  return addDays(d, diff);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export const PRESETS_INFORMES = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Esta semana' },
  { id: 'mes', label: 'Este mes' },
  { id: 'mes_anterior', label: 'Mes anterior' },
  { id: 'personalizado', label: 'Personalizado' },
];

export function rangoDesdePreset(presetId) {
  const hoy = parseFechaLocal(hoyLocalISO());
  switch (presetId) {
    case 'hoy':
      return { fecha_desde: toDateOnly(hoy), fecha_hasta: toDateOnly(hoy) };
    case 'semana': {
      const ini = startOfWeek(hoy);
      return { fecha_desde: toDateOnly(ini), fecha_hasta: toDateOnly(hoy) };
    }
    case 'mes':
      return {
        fecha_desde: toDateOnly(startOfMonth(hoy)),
        fecha_hasta: toDateOnly(hoy),
      };
    case 'mes_anterior': {
      const prev = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      return {
        fecha_desde: toDateOnly(startOfMonth(prev)),
        fecha_hasta: toDateOnly(endOfMonth(prev)),
      };
    }
    default:
      return {
        fecha_desde: toDateOnly(startOfMonth(hoy)),
        fecha_hasta: toDateOnly(hoy),
      };
  }
}

export function detectarPreset(fecha_desde, fecha_hasta) {
  for (const p of PRESETS_INFORMES) {
    if (p.id === 'personalizado') continue;
    const r = rangoDesdePreset(p.id);
    if (r.fecha_desde === fecha_desde && r.fecha_hasta === fecha_hasta) return p.id;
  }
  return 'personalizado';
}

export const EMPTY_FILTROS_INFORMES = () => {
  const r = rangoDesdePreset('mes');
  return {
    preset: 'mes',
    fecha_desde: r.fecha_desde,
    fecha_hasta: r.fecha_hasta,
    id_profesional: '',
    estado: '',
  };
};

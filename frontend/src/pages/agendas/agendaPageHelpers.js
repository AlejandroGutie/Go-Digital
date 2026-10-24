import { formatMoneda, hoyLocalISO } from '../../utils/format';
import { formatTarifasLabel, sumTarifasValor } from '../../components/ui/TarifaMultiSelect';
import { estadoPagoAgenda } from '../../api/agendasApi';

export const AGENDA_LIST_LIMIT = 500;

export function emptyCobroForm() {
  return {
    id_profesional: '',
    id_agenda: '',
    id_mascota: '',
    id_tarifa: '',
    id_tarifas: [],
    valor: '',
    metodo_pago: '',
    observacion: '',
    fecha_cobro: hoyLocalISO(),
    profesional_nombre: '',
    agenda_label: '',
  };
}

export function emptyEditForm() {
  return {
    id_mascota: '',
    id_tarifas: [],
    fecha: '',
    hora_inicio: '',
    hora_fin: '',
    observacion_ingreso: '',
  };
}

export function formatTarifaLabel(c) {
  if (Array.isArray(c?.tarifas) && c.tarifas.length) {
    return formatTarifasLabel(c.tarifas);
  }
  if (!c?.id_tarifa && c?.tarifa_descripcion == null && c?.tarifa_valor == null) {
    return '—';
  }
  const desc = c.tarifa_descripcion || 'Tarifa';
  if (c.tarifa_valor == null || c.tarifa_valor === '') return desc;
  return `${desc} · ${formatMoneda(c.tarifa_valor)}`;
}

/** Estado de pago UI (alias local sobre helper de API). */
export function estadoPagoCita(cita) {
  return estadoPagoAgenda(cita);
}

export function cuidadoresVisiblesMascota(m) {
  return (m?.cuidadores || []).filter((c) => c?.id && c.activo !== false);
}

export function nombresCuidadoresMascota(m) {
  return cuidadoresVisiblesMascota(m).map((c) => c?.nombre).filter(Boolean);
}

/** Segunda línea del combo de mascota: datos de la mascota y nombre del cuidador. */
export function subtituloMascotaAgenda(m) {
  const nombres = nombresCuidadoresMascota(m);
  const cuidador = nombres.length > 0 ? nombres.join(', ') : 'Sin cuidador';
  return [m?.especie, m?.raza, m?.tamano, cuidador].filter(Boolean).join(' · ') || '—';
}

export function filtrarMascotasLocal(lista, search) {
  const q = String(search || '')
    .trim()
    .toLowerCase();
  if (!q) return lista;
  return lista.filter((m) => {
    const haystack = [m.nombre, m.especie, m.raza, m.tamano, ...nombresCuidadoresMascota(m)]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function filtrarCuidadoresLocal(lista, search, seleccionado) {
  const q = String(search || '')
    .trim()
    .toLowerCase();
  const selectedName = String(seleccionado?.nombre || '')
    .trim()
    .toLowerCase();
  if (!q || (seleccionado && q === selectedName)) return lista;
  return (lista || []).filter((c) => {
    const haystack = [c?.nombre, c?.telefono, c?.email]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function idsTarifaDesdeCita(cita) {
  if (Array.isArray(cita?.id_tarifas) && cita.id_tarifas.length) {
    return cita.id_tarifas.map(String);
  }
  if (cita?.id_tarifa != null) return [String(cita.id_tarifa)];
  return [];
}

export function resolverTarifaCita(cita, tarifas = []) {
  if (Array.isArray(cita?.tarifas) && cita.tarifas.length) {
    const idTarifas = cita.tarifas.map((t) => String(t.id));
    return {
      tarifas: cita.tarifas,
      tarifaDescripcion: formatTarifasLabel(cita.tarifas),
      tarifaValor: sumTarifasValor(cita.tarifas, idTarifas),
      idTarifas,
    };
  }
  const ids = idsTarifaDesdeCita(cita);
  const fromList = ids
    .map((id) => tarifas.find((t) => String(t.id) === String(id)))
    .filter(Boolean);
  if (fromList.length) {
    return {
      tarifas: fromList,
      tarifaDescripcion: formatTarifasLabel(fromList),
      tarifaValor: sumTarifasValor(fromList, ids),
      idTarifas: ids,
    };
  }
  return {
    tarifas: [],
    tarifaDescripcion: cita?.tarifa_descripcion || '',
    tarifaValor: cita?.tarifa_valor,
    idTarifas: ids,
  };
}

export function tarifasParaEditarDesde(tarifas, idTarifasSeleccionadas) {
  const base = (tarifas || []).filter((t) => t.activo !== false);
  const currentIds = (idTarifasSeleccionadas || []).map(String);
  if (!currentIds.length) return base;
  const extras = (tarifas || []).filter(
    (t) =>
      currentIds.includes(String(t.id)) &&
      !base.some((b) => String(b.id) === String(t.id))
  );
  return extras.length ? [...base, ...extras] : base;
}

export const AGENDA_INPUT_ERROR_STYLE = {
  borderColor: '#dc2626',
};

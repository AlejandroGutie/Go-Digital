import { useEffect, useState, useRef } from 'react';
import { AlertTriangle, Banknote, Calendar, CalendarClock, MessageCircle, PawPrint, Stethoscope, Trash2 } from 'lucide-react';
import { listProfesionales } from '../api/profesionalesApi';
import {
  getAgendaDeProfesional,
  crearCitaAgenda,
  actualizarCitaAgenda,
  eliminarCitaAgenda,
} from '../api/agendasApi';
import { getCuidadoresDeMascota, getMascotaById, listMascotas } from '../api/mascotasApi';
import { listTarifas } from '../api/tarifasApi';
import { createCobro } from '../api/cobrosApi';
import { normalizeListPayload } from '../api/normalize';
import { useToast } from '../hooks/useToast';
import { useMutationLock } from '../hooks/useMutationLock';
import { Toast } from '../components/Toast';
import { formatFecha, formatHora, formatMoneda, hoyLocalISO, toDateOnly } from '../utils/format';
import {
  buildWhatsAppConfirmMessage,
  buildWhatsAppMascotaListaMessage,
  openWhatsAppChat,
  sanitizePhoneCO,
} from '../utils/whatsapp';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import Field, { DateInput, Input, Select } from '../components/ui/Field';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';
import Sheet from '../components/ui/Sheet';
import ConfirmSheet from '../components/ui/ConfirmSheet';
import CobroFormSheet from '../components/cobros/CobroFormSheet';
import '../index.css';

const LIST_LIMIT = 500;

function emptyCobroForm() {
  return {
    id_profesional: '',
    id_agenda: '',
    id_mascota: '',
    id_tarifa: '',
    valor: '',
    metodo_pago: '',
    observacion: '',
    fecha_cobro: hoyLocalISO(),
    profesional_nombre: '',
    agenda_label: '',
  };
}

function formatTarifaLabel(c) {
  if (!c?.id_tarifa && c?.tarifa_descripcion == null && c?.tarifa_valor == null) {
    return '—';
  }
  const desc = c.tarifa_descripcion || 'Tarifa';
  if (c.tarifa_valor == null || c.tarifa_valor === '') return desc;
  return `${desc} · ${formatMoneda(c.tarifa_valor)}`;
}

/** Convierte "HH:MM" o "HH:MM:SS" a minutos desde medianoche. */
function horaAMinutos(hora) {
  if (!hora) return null;
  const [h, m] = String(hora).split(':');
  const hh = parseInt(h, 10);
  const mm = parseInt(m, 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

function toTimeInputValue(hora) {
  if (!hora) return '';
  const s = String(hora);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

/**
 * Dos franjas se solapan si comparten minutos (inicio inclusivo, fin exclusivo).
 * Ej.: 10:00–11:00 y 11:00–12:00 NO se solapan; 10:00–11:00 y 10:30–11:30 SÍ.
 */
function franjasSeSolapan(inicioA, finA, inicioB, finB) {
  const a0 = horaAMinutos(inicioA);
  const a1 = horaAMinutos(finA);
  const b0 = horaAMinutos(inicioB);
  const b1 = horaAMinutos(finB);
  if ([a0, a1, b0, b1].some((v) => v == null)) return false;
  return a0 < b1 && b0 < a1;
}

/** Busca conflicto de franja; `excludeId` ignora la cita que se está reprogramando. */
function encontrarCitaConflicto(citas, fecha, horaInicio, horaFin, excludeId = null) {
  if (!fecha || !horaInicio || !horaFin) return null;
  const fechaNorm = toDateOnly(fecha);
  return (
    citas.find(
      (c) =>
        (excludeId == null || String(c.id) !== String(excludeId)) &&
        toDateOnly(c.fecha) === fechaNorm &&
        franjasSeSolapan(horaInicio, horaFin, c.hora_inicio, c.hora_fin)
    ) || null
  );
}

export default function AgendasPage() {
  const [profesionales, setProfesionales] = useState([]);
  const [mascotas, setMascotas] = useState([]);
  const [profSel, setProfSel] = useState(null);
  const [citas, setCitas] = useState([]);
  const [mascotaId, setMascotaId] = useState('');
  const [fecha, setFecha] = useState('');
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFin, setHoraFin] = useState('');
  const [idTarifa, setIdTarifa] = useState('');
  const [tarifas, setTarifas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [whatsappBusy, setWhatsappBusy] = useState(null); // { id, kind: 'confirm'|'lista' }
  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError] = useState(null);
  const [busquedaProf, setBusquedaProf] = useState('');
  const [listaAbierta, setListaAbierta] = useState(false);
  const [busquedaMascota, setBusquedaMascota] = useState('');
  const [listaMascotasAbierta, setListaMascotasAbierta] = useState(false);
  const [editCita, setEditCita] = useState(null);
  const [editForm, setEditForm] = useState({
    id_mascota: '',
    id_tarifa: '',
    fecha: '',
    hora_inicio: '',
    hora_fin: '',
  });
  const [editBusquedaMascota, setEditBusquedaMascota] = useState('');
  const [editListaMascotasAbierta, setEditListaMascotasAbierta] = useState(false);
  const [deleteModalId, setDeleteModalId] = useState(null);
  const [cobroModalOpen, setCobroModalOpen] = useState(false);
  const [cobroForm, setCobroForm] = useState(() => emptyCobroForm());
  const [cobroMascotaNombre, setCobroMascotaNombre] = useState('');
  const [cobroTarifas, setCobroTarifas] = useState([]);
  const { toasts, addToast, removeToast } = useToast();
  const { tryLock, unlock } = useMutationLock();
  const buscadorRef = useRef(null);
  const buscadorMascotaRef = useRef(null);
  const editBuscadorMascotaRef = useRef(null);
  const mascotaSearchReq = useRef(0);
  const profesionalSearchReq = useRef(0);
  const profesionalAgendaReq = useRef(0);
  const whatsappCancelRef = useRef(null);

  async function cargarMascotas(search = '') {
    const reqId = ++mascotaSearchReq.current;
    const res = await listMascotas(1, LIST_LIMIT, search);
    if (reqId !== mascotaSearchReq.current) return;
    setMascotas(normalizeListPayload(res));
  }

  async function cargarProfesionales(search = '') {
    const reqId = ++profesionalSearchReq.current;
    const res = await listProfesionales(1, LIST_LIMIT, search);
    if (reqId !== profesionalSearchReq.current) return;
    setProfesionales(normalizeListPayload(res));
  }

  useEffect(() => {
    async function init() {
      setInitLoading(true);
      setInitError(null);
      try {
        const [resProf, resMasc] = await Promise.all([
          listProfesionales(1, LIST_LIMIT),
          listMascotas(1, LIST_LIMIT),
        ]);
        setProfesionales(normalizeListPayload(resProf));
        setMascotas(normalizeListPayload(resMasc));
      } catch (e) {
        const msg =
          e?.message ||
          'No se pudieron cargar profesionales o mascotas (sesión, red o permisos de base de datos).';
        setInitError(msg);
        addToast(msg, 'error');
      } finally {
        setInitLoading(false);
      }
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      whatsappCancelRef.current?.cancel?.();
    };
  }, []);

  // Actualiza profesionales al buscar (incluye recién creados)
  useEffect(() => {
    if (profSel) return undefined;
    const q = busquedaProf.trim();
    const timer = setTimeout(() => {
      cargarProfesionales(q).catch((e) => {
        addToast(e?.message || 'No se pudo actualizar el listado de profesionales', 'error');
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [busquedaProf, profSel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handleClickOutside(e) {
      if (buscadorRef.current && !buscadorRef.current.contains(e.target)) {
        setListaAbierta(false);
      }
      if (buscadorMascotaRef.current && !buscadorMascotaRef.current.contains(e.target)) {
        setListaMascotasAbierta(false);
      }
      if (
        editBuscadorMascotaRef.current &&
        !editBuscadorMascotaRef.current.contains(e.target)
      ) {
        setEditListaMascotasAbierta(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Búsqueda de mascotas al crear cita (consulta todas las existentes)
  useEffect(() => {
    if (!profSel || mascotaId || editCita) return undefined;
    const q = busquedaMascota.trim();
    const timer = setTimeout(() => {
      cargarMascotas(q).catch((e) => {
        addToast(e?.message || 'No se pudo actualizar el listado de mascotas', 'error');
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [busquedaMascota, profSel, mascotaId, editCita]); // eslint-disable-line react-hooks/exhaustive-deps

  // Búsqueda de mascotas al reprogramar (consulta todas las existentes)
  useEffect(() => {
    if (!editCita || editForm.id_mascota) return undefined;
    const q = editBusquedaMascota.trim();
    const timer = setTimeout(() => {
      cargarMascotas(q).catch((e) => {
        addToast(e?.message || 'No se pudo actualizar el listado de mascotas', 'error');
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [editBusquedaMascota, editCita, editForm.id_mascota]); // eslint-disable-line react-hooks/exhaustive-deps

  // El listado ya viene filtrado por el servidor; no re-filtrar en cliente
  // (evita ocultar resultados si la coincidencia solo está en un campo).
  const profesionalesFiltrados = profesionales;
  const mascotasFiltradas = mascotas;
  const editMascotasFiltradas = mascotas;

  function limpiarMascotaSeleccion() {
    setMascotaId('');
    setBusquedaMascota('');
    setListaMascotasAbierta(false);
  }

  function seleccionarMascota(m) {
    setMascotaId(String(m.id));
    setBusquedaMascota(m.nombre || '');
    setListaMascotasAbierta(false);
  }

  function seleccionarMascotaEdit(m) {
    setEditForm((prev) => ({ ...prev, id_mascota: String(m.id) }));
    setEditBusquedaMascota(m.nombre || '');
    setEditListaMascotasAbierta(false);
  }

  function cerrarReprogramar() {
    setEditCita(null);
    setEditForm({ id_mascota: '', id_tarifa: '', fecha: '', hora_inicio: '', hora_fin: '' });
    setEditBusquedaMascota('');
    setEditListaMascotasAbierta(false);
  }

  async function abrirReprogramar(c) {
    setEditCita(c);
    setEditForm({
      id_mascota: String(c.id_mascota || ''),
      id_tarifa: c.id_tarifa != null ? String(c.id_tarifa) : '',
      fecha: toDateOnly(c.fecha),
      hora_inicio: toTimeInputValue(c.hora_inicio),
      hora_fin: toTimeInputValue(c.hora_fin),
    });
    setEditBusquedaMascota(c.mascota_nombre || '');
    setEditListaMascotasAbierta(false);
    try {
      await cargarMascotas('');
    } catch (e) {
      addToast(e?.message || 'No se pudo cargar el listado de mascotas', 'error');
    }
  }

  async function abrirListaMascotasCrear() {
    setListaMascotasAbierta(true);
    if (mascotaId) return;
    try {
      await cargarMascotas(busquedaMascota.trim());
    } catch (e) {
      addToast(e?.message || 'No se pudo actualizar el listado de mascotas', 'error');
    }
  }

  async function abrirListaProfesionales() {
    setListaAbierta(true);
    if (profSel) return;
    try {
      await cargarProfesionales(busquedaProf.trim());
    } catch (e) {
      addToast(e?.message || 'No se pudo actualizar el listado de profesionales', 'error');
    }
  }

  async function abrirListaMascotasEdit() {
    setEditListaMascotasAbierta(true);
    try {
      // Al abrir el listado se consultan todas; si hay texto y aún no hay selección, filtra
      const q = editForm.id_mascota ? '' : editBusquedaMascota.trim();
      await cargarMascotas(q);
    } catch (e) {
      addToast(e?.message || 'No se pudo actualizar el listado de mascotas', 'error');
    }
  }

  async function seleccionarProfesional(p) {
    const reqId = ++profesionalAgendaReq.current;
    setProfSel(p);
    setBusquedaProf(p.nombre || '');
    setListaAbierta(false);
    setCitas([]);
    setTarifas([]);
    limpiarMascotaSeleccion();
    setFecha('');
    setHoraInicio('');
    setHoraFin('');
    setIdTarifa('');
    cerrarReprogramar();
    setLoading(true);
    try {
      const [resAgenda, resTarifas] = await Promise.all([
        getAgendaDeProfesional(p.id),
        listTarifas(p.id),
      ]);
      if (reqId !== profesionalAgendaReq.current) return;
      setCitas(normalizeListPayload(resAgenda));
      setTarifas(normalizeListPayload(resTarifas));
    } catch (e) {
      if (reqId !== profesionalAgendaReq.current) return;
      setCitas([]);
      setTarifas([]);
      addToast(e?.message || 'Error al cargar la agenda del profesional', 'error');
    } finally {
      if (reqId === profesionalAgendaReq.current) setLoading(false);
    }
  }

  function limpiarSeleccion() {
    setProfSel(null);
    setBusquedaProf('');
    setCitas([]);
    setTarifas([]);
    limpiarMascotaSeleccion();
    setFecha('');
    setHoraInicio('');
    setHoraFin('');
    setIdTarifa('');
    setListaAbierta(false);
    cerrarReprogramar();
  }

  async function handleAgendar() {
    if (!mascotaId || !fecha || !horaInicio || !horaFin || !idTarifa) return;
    const fechaGuardar = toDateOnly(fecha);
    if (!fechaGuardar) {
      addToast('Fecha inválida', 'error');
      return;
    }
    if (horaAMinutos(horaFin) <= horaAMinutos(horaInicio)) {
      addToast('La hora final debe ser posterior a la hora de inicio', 'error');
      return;
    }
    const conflicto = encontrarCitaConflicto(citas, fechaGuardar, horaInicio, horaFin);
    if (conflicto) {
      addToast(
        `Cita ocupada: ${formatFecha(conflicto.fecha)} · ${formatHora(conflicto.hora_inicio)} – ${formatHora(conflicto.hora_fin)} (${conflicto.mascota_nombre || 'otra mascota'})`,
        'error'
      );
      return;
    }
    if (!tryLock()) return;
    setLoading(true);
    try {
      await crearCitaAgenda(profSel.id, {
        id_mascota: Number(mascotaId),
        id_tarifa: Number(idTarifa),
        fecha: fechaGuardar,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
      });
      addToast('Cita agendada correctamente', 'success');
      limpiarMascotaSeleccion();
      setFecha('');
      setHoraInicio('');
      setHoraFin('');
      setIdTarifa('');
      const res = await getAgendaDeProfesional(profSel.id);
      setCitas(normalizeListPayload(res));
    } catch (e) {
      addToast(e?.message || 'Error al agendar', 'error');
    } finally {
      setLoading(false);
      unlock();
    }
  }

  async function handleReprogramar() {
    if (!editCita || !profSel) return;
    const { id_mascota, id_tarifa, fecha: fechaEdit, hora_inicio, hora_fin } = editForm;
    if (!id_mascota || !id_tarifa || !fechaEdit || !hora_inicio || !hora_fin) {
      addToast('Mascota, tarifa, fecha, hora de inicio y hora final son requeridas', 'error');
      return;
    }
    const fechaGuardar = toDateOnly(fechaEdit);
    if (!fechaGuardar) {
      addToast('Fecha inválida', 'error');
      return;
    }
    if (horaAMinutos(hora_fin) <= horaAMinutos(hora_inicio)) {
      addToast('La hora final debe ser posterior a la hora de inicio', 'error');
      return;
    }
    const conflicto = encontrarCitaConflicto(
      citas,
      fechaGuardar,
      hora_inicio,
      hora_fin,
      editCita.id
    );
    if (conflicto) {
      addToast(
        `Cita ocupada: ${formatFecha(conflicto.fecha)} · ${formatHora(conflicto.hora_inicio)} – ${formatHora(conflicto.hora_fin)} (${conflicto.mascota_nombre || 'otra mascota'})`,
        'error'
      );
      return;
    }
    if (!tryLock()) return;
    setLoading(true);
    try {
      await actualizarCitaAgenda(profSel.id, editCita.id, {
        id_mascota: Number(id_mascota),
        id_tarifa: Number(id_tarifa),
        fecha: fechaGuardar,
        hora_inicio,
        hora_fin,
      });
      addToast('Cita reprogramada correctamente', 'success');
      cerrarReprogramar();
      const res = await getAgendaDeProfesional(profSel.id);
      setCitas(normalizeListPayload(res));
    } catch (e) {
      addToast(e?.message || 'Error al reprogramar la cita', 'error');
    } finally {
      setLoading(false);
      unlock();
    }
  }

  async function confirmEliminar() {
    if (deleteModalId == null || !profSel?.id) return;
    if (!tryLock()) return;
    const idAgenda = deleteModalId;
    setLoading(true);
    try {
      await eliminarCitaAgenda(profSel.id, idAgenda);
      addToast('Cita eliminada correctamente', 'success');
      setCitas((prev) => prev.filter((c) => c.id !== idAgenda));
      if (editCita?.id === idAgenda) cerrarReprogramar();
      setDeleteModalId(null);
    } catch (e) {
      addToast(e?.message || 'Error al eliminar la cita', 'error');
    } finally {
      setLoading(false);
      unlock();
    }
  }

  async function resolverCuidadorParaWhatsApp(cita) {
    if (!cita?.id_mascota) {
      throw new Error('La cita no tiene mascota asociada');
    }

    const [resCuidadores, resMascota] = await Promise.all([
      getCuidadoresDeMascota(cita.id_mascota),
      getMascotaById(cita.id_mascota).catch(() => null),
    ]);
    const cuidadores = normalizeListPayload(resCuidadores);
    const mascotaData = resMascota?.data?.[0] || resMascota?.data || null;

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

  function resolverTarifaCita(cita) {
    const tarifaFromList =
      cita.id_tarifa != null
        ? tarifas.find((t) => String(t.id) === String(cita.id_tarifa))
        : null;
    const tarifaDescripcion =
      cita.tarifa_descripcion || tarifaFromList?.descripcion || '';
    const tarifaValor =
      cita.tarifa_valor != null && cita.tarifa_valor !== ''
        ? cita.tarifa_valor
        : tarifaFromList?.valor;
    return { tarifaDescripcion, tarifaValor };
  }

  async function handleConfirmarWhatsApp(cita) {
    if (!tryLock()) return;
    setWhatsappBusy({ id: cita.id, kind: 'confirm' });
    try {
      whatsappCancelRef.current?.cancel?.();
      const { cuidador, phone, mascotaData } = await resolverCuidadorParaWhatsApp(cita);

      const mascotaNombre = mascotaData?.nombre || cita.mascota_nombre || '';
      const mascotaEspecie = mascotaData?.especie || cita.especie || '';
      const mascotaRaza = mascotaData?.raza || cita.raza || '';
      const mascotaTamano = mascotaData?.tamano || cita.tamano || '';
      const { tarifaDescripcion, tarifaValor } = resolverTarifaCita(cita);

      const message = buildWhatsAppConfirmMessage({
        cuidadorNombre: cuidador.nombre,
        mascotaNombre,
        mascotaEspecie,
        mascotaRaza,
        mascotaTamano,
        profesionalNombre: profSel?.nombre || '',
        fechaLabel: formatFecha(cita.fecha),
        horaInicioLabel: formatHora(cita.hora_inicio),
        horaFinLabel: formatHora(cita.hora_fin),
        tarifaDescripcion,
        valorLabel:
          tarifaValor != null && tarifaValor !== ''
            ? formatMoneda(tarifaValor)
            : '',
      });

      whatsappCancelRef.current = openWhatsAppChat(phone, message);
      addToast('Se abrió WhatsApp con el mensaje de confirmación.', 'success');
    } catch (e) {
      addToast(e?.message || 'No se pudo confirmar la agenda por WhatsApp', 'error');
    } finally {
      setWhatsappBusy(null);
      unlock();
    }
  }

  async function handleMascotaListaWhatsApp(cita) {
    if (!tryLock()) return;
    setWhatsappBusy({ id: cita.id, kind: 'lista' });
    try {
      whatsappCancelRef.current?.cancel?.();
      const { cuidador, phone, mascotaData } = await resolverCuidadorParaWhatsApp(cita);
      const mascotaNombre = mascotaData?.nombre || cita.mascota_nombre || '';
      const { tarifaDescripcion } = resolverTarifaCita(cita);

      const message = buildWhatsAppMascotaListaMessage({
        cuidadorNombre: cuidador.nombre,
        mascotaNombre,
        profesionalNombre: profSel?.nombre || '',
        fechaLabel: formatFecha(cita.fecha),
        horaFinLabel: formatHora(cita.hora_fin),
        tarifaDescripcion,
      });

      whatsappCancelRef.current = openWhatsAppChat(phone, message);
      addToast('Se abrió WhatsApp con el aviso de mascota lista.', 'success');
    } catch (e) {
      addToast(e?.message || 'No se pudo notificar por WhatsApp', 'error');
    } finally {
      setWhatsappBusy(null);
      unlock();
    }
  }

  function cerrarCobroModal({ force = false } = {}) {
    if (loading && !force) return;
    setCobroModalOpen(false);
    setCobroForm(emptyCobroForm());
    setCobroMascotaNombre('');
    setCobroTarifas([]);
  }

  async function abrirCobrar(cita) {
    if (!profSel?.id || !cita?.id) return;
    const { tarifaDescripcion, tarifaValor } = resolverTarifaCita(cita);
    let tarifasProf = tarifas;
    if (!tarifasProf.length) {
      try {
        const resT = await listTarifas(profSel.id);
        tarifasProf = normalizeListPayload(resT);
        setTarifas(tarifasProf);
      } catch (e) {
        addToast(e?.message || 'No se pudieron cargar las tarifas', 'error');
        return;
      }
    }

    const idTarifa =
      cita.id_tarifa != null
        ? String(cita.id_tarifa)
        : '';
    const valor =
      tarifaValor != null && tarifaValor !== ''
        ? String(tarifaValor)
        : '';

    setCobroTarifas(tarifasProf);
    setCobroMascotaNombre(cita.mascota_nombre || '');
    setCobroForm({
      id_profesional: String(profSel.id),
      id_agenda: String(cita.id),
      id_mascota: String(cita.id_mascota || ''),
      id_tarifa: idTarifa,
      valor,
      metodo_pago: '',
      observacion: tarifaDescripcion
        ? `Cobro agenda #${cita.id} · ${tarifaDescripcion}`
        : `Cobro agenda #${cita.id}`,
      fecha_cobro: toDateOnly(cita.fecha) || hoyLocalISO(),
      profesional_nombre: profSel.nombre || '',
      agenda_label: `${formatFecha(cita.fecha)} — ${cita.mascota_nombre || 'Mascota'} · ${formatHora(cita.hora_inicio)}-${formatHora(cita.hora_fin)}`,
    });
    setCobroModalOpen(true);
  }

  function handleCobroTarifaChange(id_tarifa) {
    const tarifa = cobroTarifas.find((t) => String(t.id) === String(id_tarifa));
    setCobroForm((prev) => ({
      ...prev,
      id_tarifa,
      valor: tarifa ? String(tarifa.valor) : prev.valor,
    }));
  }

  async function guardarCobroDesdeAgenda() {
    if (!cobroForm.id_profesional) {
      addToast('Selecciona un profesional', 'error');
      return;
    }
    if (!cobroForm.id_agenda) {
      addToast('La agenda es requerida', 'error');
      return;
    }
    if (!cobroForm.id_mascota) {
      addToast('La agenda debe tener una mascota asociada', 'error');
      return;
    }
    if (!cobroForm.id_tarifa) {
      addToast('Selecciona una tarifa', 'error');
      return;
    }
    const valorNum = parseFloat(cobroForm.valor);
    if (Number.isNaN(valorNum) || valorNum < 0) {
      addToast('Ingresa un valor válido (0 o mayor)', 'error');
      return;
    }
    if (!cobroForm.fecha_cobro) {
      addToast('La fecha de cobro es requerida', 'error');
      return;
    }

    if (!tryLock()) return;
    setLoading(true);
    try {
      const res = await createCobro({
        id_profesional: cobroForm.id_profesional,
        id_agenda: cobroForm.id_agenda,
        id_mascota: cobroForm.id_mascota,
        id_tarifa: cobroForm.id_tarifa,
        valor: cobroForm.valor,
        metodo_pago: cobroForm.metodo_pago,
        observacion: cobroForm.observacion,
        fecha_cobro: cobroForm.fecha_cobro,
      });
      if (res?.status === 'ok') {
        const agendaId = String(cobroForm.id_agenda);
        addToast('Cobro registrado. La agenda quedó marcada como cobrada.', 'success');
        setCitas((prev) => prev.filter((c) => String(c.id) !== agendaId));
        if (editCita != null && String(editCita.id) === agendaId) cerrarReprogramar();
        cerrarCobroModal({ force: true });
      } else {
        addToast(res?.message || 'Error al crear cobro', 'error');
      }
    } catch (e) {
      addToast(e?.message || 'Error al crear cobro', 'error');
    } finally {
      setLoading(false);
      unlock();
    }
  }

  const horaFinInvalida =
    !!horaInicio && !!horaFin && horaAMinutos(horaFin) <= horaAMinutos(horaInicio);

  const citaConflicto =
    !horaFinInvalida && fecha && horaInicio && horaFin
      ? encontrarCitaConflicto(citas, fecha, horaInicio, horaFin)
      : null;

  const franjaOcupada = !!citaConflicto;

  const editHoraFinInvalida =
    !!editForm.hora_inicio &&
    !!editForm.hora_fin &&
    horaAMinutos(editForm.hora_fin) <= horaAMinutos(editForm.hora_inicio);

  const editCitaConflicto =
    editCita &&
    !editHoraFinInvalida &&
    editForm.fecha &&
    editForm.hora_inicio &&
    editForm.hora_fin
      ? encontrarCitaConflicto(
          citas,
          editForm.fecha,
          editForm.hora_inicio,
          editForm.hora_fin,
          editCita.id
        )
      : null;

  const editFranjaOcupada = !!editCitaConflicto;

  const citasDelDia = fecha
    ? citas
        .filter((c) => toDateOnly(c.fecha) === toDateOnly(fecha))
        .sort(
          (a, b) =>
            (horaAMinutos(a.hora_inicio) ?? 0) - (horaAMinutos(b.hora_inicio) ?? 0)
        )
    : [];

  const editCitasDelDia = editForm.fecha
    ? citas
        .filter(
          (c) =>
            String(c.id) !== String(editCita?.id) &&
            toDateOnly(c.fecha) === toDateOnly(editForm.fecha)
        )
        .sort(
          (a, b) =>
            (horaAMinutos(a.hora_inicio) ?? 0) - (horaAMinutos(b.hora_inicio) ?? 0)
        )
    : [];

  const puedeAgendar =
    !!mascotaId &&
    !!idTarifa &&
    !!fecha &&
    !!horaInicio &&
    !!horaFin &&
    !horaFinInvalida &&
    !franjaOcupada;

  const puedeReprogramar =
    !!editForm.id_mascota &&
    !!editForm.id_tarifa &&
    !!editForm.fecha &&
    !!editForm.hora_inicio &&
    !!editForm.hora_fin &&
    !editHoraFinInvalida &&
    !editFranjaOcupada;

  const tarifasActivas = tarifas.filter((t) => t.activo !== false);
  const tarifasParaEditar = (() => {
    const base = tarifasActivas;
    const currentId = editForm.id_tarifa;
    if (!currentId) return base;
    if (base.some((t) => String(t.id) === String(currentId))) return base;
    const current = tarifas.find((t) => String(t.id) === String(currentId));
    return current ? [...base, current] : base;
  })();

  const inputErrorStyle = {
    borderColor: '#dc2626',
  };

  return (
    <div className="ui-page">
      <PageHeader
        title="Agendas"
        subtitle="Busca y selecciona un profesional para ver su agenda y asignar mascotas con fecha y franja horaria."
      />

      {initLoading ? (
        <Skeleton rows={5} />
      ) : initError ? (
        <EmptyState
          icon={<AlertTriangle size={24} />}
          title="No se pudo cargar la información"
          description={initError}
        />
      ) : profesionales.length === 0 ? (
        <EmptyState
          icon={<Stethoscope size={24} />}
          title="No hay profesionales registrados"
          description="Agrega un profesional desde el módulo de Profesionales"
        />
      ) : (
        <div className="ui-split">
          <div className="ui-card">
            <Field id="buscador-profesional" label="Profesional">
              <div ref={buscadorRef} className="ui-combo">
                <div className="ui-btn-row">
                  <Input
                    id="buscador-profesional"
                    type="text"
                    role="combobox"
                    aria-expanded={listaAbierta}
                    aria-controls="lista-profesionales"
                    aria-autocomplete="list"
                    placeholder="Buscar por nombre o teléfono…"
                    value={busquedaProf}
                    disabled={loading}
                    onChange={(e) => {
                      setBusquedaProf(e.target.value);
                      setListaAbierta(true);
                      if (profSel && e.target.value !== profSel.nombre) {
                        setProfSel(null);
                        setCitas([]);
                        setTarifas([]);
                        limpiarMascotaSeleccion();
                        setFecha('');
                        setHoraInicio('');
                        setHoraFin('');
                        setIdTarifa('');
                        cerrarReprogramar();
                      }
                    }}
                    onFocus={() => {
                      void abrirListaProfesionales();
                    }}
                  />
                  {(profSel || busquedaProf) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={limpiarSeleccion}
                      disabled={loading}
                    >
                      Limpiar
                    </Button>
                  )}
                </div>

                {listaAbierta && (
                  <ul id="lista-profesionales" role="listbox" className="ui-combo__list">
                    {profesionalesFiltrados.length === 0 ? (
                      <li className="ui-combo__item" style={{ cursor: 'default', color: 'var(--color-purple-light)' }}>
                        Sin resultados para “{busquedaProf.trim()}”
                      </li>
                    ) : (
                      profesionalesFiltrados.map((p) => (
                        <li key={p.id} role="option" aria-selected={profSel?.id === p.id}>
                          <button
                            type="button"
                            className={`ui-combo__item${profSel?.id === p.id ? ' ui-combo__item--active' : ''}`}
                            onClick={() => seleccionarProfesional(p)}
                          >
                            <div>{p.nombre}</div>
                            {p.telefono ? (
                              <div style={{ fontSize: '0.75rem', color: 'var(--color-purple-light)', fontWeight: 400 }}>
                                {p.telefono}
                              </div>
                            ) : null}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            </Field>
          </div>

          <div className="ui-card">
            {!profSel ? (
              <EmptyState
                icon={<Stethoscope size={24} />}
                title="Selecciona un profesional"
                description="Busca y selecciona un profesional para gestionar su agenda"
              />
            ) : (
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 16,
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 600 }}>{profSel.nombre}</div>
                    {profSel.telefono ? (
                      <div style={{ fontSize: '0.8125rem', color: 'var(--color-purple-light)' }}>
                        {profSel.telefono}
                      </div>
                    ) : null}
                  </div>
                  <span className="ui-badge" style={{ background: 'var(--color-entorno)', color: 'var(--color-black)' }}>
                    {citas.length} cita{citas.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {mascotas.length > 0 ? (
                  <div style={{ marginBottom: 20 }}>
                    <div className="agenda-form">
                      <div className="agenda-form__row">
                        <Field id="buscador-mascota" label="Mascota">
                          <div ref={buscadorMascotaRef} className="ui-combo">
                            <Input
                              id="buscador-mascota"
                              type="text"
                              role="combobox"
                              aria-expanded={listaMascotasAbierta}
                              aria-controls="lista-mascotas"
                              aria-autocomplete="list"
                              placeholder="Buscar por nombre, raza, especie o tamaño…"
                              value={busquedaMascota}
                              disabled={loading}
                              onChange={(e) => {
                                const value = e.target.value;
                                setBusquedaMascota(value);
                                setListaMascotasAbierta(true);
                                if (mascotaId) {
                                  const selected = mascotas.find(
                                    (m) => String(m.id) === String(mascotaId)
                                  );
                                  if (!selected || value !== (selected.nombre || '')) {
                                    setMascotaId('');
                                  }
                                }
                              }}
                              onFocus={() => {
                                void abrirListaMascotasCrear();
                              }}
                            />

                            {listaMascotasAbierta && (
                              <ul
                                id="lista-mascotas"
                                role="listbox"
                                className="ui-combo__list"
                              >
                                {mascotasFiltradas.length === 0 ? (
                                  <li
                                    className="ui-combo__item"
                                    style={{
                                      cursor: 'default',
                                      color: 'var(--color-purple-light)',
                                    }}
                                  >
                                    No se encontraron mascotas
                                  </li>
                                ) : (
                                  mascotasFiltradas.map((m) => (
                                    <li
                                      key={m.id}
                                      role="option"
                                      aria-selected={String(mascotaId) === String(m.id)}
                                    >
                                      <button
                                        type="button"
                                        className={`ui-combo__item${
                                          String(mascotaId) === String(m.id)
                                            ? ' ui-combo__item--active'
                                            : ''
                                        }`}
                                        onClick={() => seleccionarMascota(m)}
                                      >
                                        <div>{m.nombre}</div>
                                        <div
                                          style={{
                                            fontSize: '0.75rem',
                                            color: 'var(--color-purple-light)',
                                            fontWeight: 400,
                                          }}
                                        >
                                          {[m.especie, m.raza, m.tamano]
                                            .filter(Boolean)
                                            .join(' · ')}
                                        </div>
                                      </button>
                                    </li>
                                  ))
                                )}
                              </ul>
                            )}
                          </div>
                        </Field>
                        <Field label="Fecha">
                          <DateInput
                            value={fecha}
                            onChange={(e) => setFecha(e.target.value)}
                            disabled={loading}
                            style={franjaOcupada ? inputErrorStyle : undefined}
                          />
                        </Field>
                      </div>
                      <div className="agenda-form__row">
                        <Field id="tarifa-agenda" label="Tarifa" required>
                          <Select
                            id="tarifa-agenda"
                            value={idTarifa}
                            required
                            disabled={loading || tarifasActivas.length === 0}
                            onChange={(e) => setIdTarifa(e.target.value)}
                          >
                            <option value="">
                              {tarifasActivas.length === 0
                                ? 'Sin tarifas configuradas'
                                : 'Seleccionar tarifa'}
                            </option>
                            {tarifasActivas.map((t) => (
                              <option key={t.id} value={t.id}>
                                {`${t.descripcion} — ${formatMoneda(t.valor)}`}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                      <div className="agenda-form__row agenda-form__row--times">
                        <Field label="Inicio">
                          <Input
                            type="time"
                            value={horaInicio}
                            onChange={(e) => setHoraInicio(e.target.value)}
                            disabled={loading}
                            title="Hora inicio"
                            style={franjaOcupada || horaFinInvalida ? inputErrorStyle : undefined}
                          />
                        </Field>
                        <Field label="Fin">
                          <Input
                            type="time"
                            value={horaFin}
                            onChange={(e) => setHoraFin(e.target.value)}
                            disabled={loading}
                            title="Hora final"
                            style={franjaOcupada || horaFinInvalida ? inputErrorStyle : undefined}
                          />
                        </Field>
                        <div className="agenda-form__action">
                          <Button
                            variant="primary"
                            onClick={handleAgendar}
                            disabled={loading || !puedeAgendar}
                          >
                            {loading ? '…' : franjaOcupada ? 'Cita ocupada' : 'Agendar'}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {tarifasActivas.length === 0 && (
                      <div className="ui-banner ui-banner--warn" role="alert" style={{ marginTop: 10 }}>
                        Este profesional no tiene tarifas activas. Configúralas en Profesionales antes de agendar.
                      </div>
                    )}

                    {horaFinInvalida && (
                      <div className="ui-banner ui-banner--warn" role="alert" style={{ marginTop: 10 }}>
                        La hora final debe ser posterior a la hora de inicio.
                      </div>
                    )}

                    {franjaOcupada && (
                      <div className="ui-banner ui-banner--warn" role="alert" style={{ marginTop: 10 }}>
                        <strong>Cita ocupada.</strong> Este profesional ya tiene una cita el{' '}
                        {formatFecha(citaConflicto.fecha)} de {formatHora(citaConflicto.hora_inicio)} a{' '}
                        {formatHora(citaConflicto.hora_fin)}
                        {citaConflicto.mascota_nombre ? ` con ${citaConflicto.mascota_nombre}` : ''}. Elige otra
                        fecha u otra franja horaria.
                      </div>
                    )}

                    {fecha && citasDelDia.length > 0 && (
                      <div className="ui-banner" style={{ marginTop: 10 }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>Franjas ocupadas este día</div>
                        {citasDelDia.map((c) => (
                          <div key={c.id}>
                            {formatHora(c.hora_inicio)} – {formatHora(c.hora_fin)}
                            {c.mascota_nombre ? ` · ${c.mascota_nombre}` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="ui-banner ui-banner--warn" style={{ marginBottom: 20 }}>
                    No hay mascotas registradas. Crea mascotas primero en la sección Mascotas.
                  </div>
                )}

                {citas.length === 0 ? (
                  <EmptyState
                    icon={<Calendar size={24} />}
                    title="Sin citas agendadas"
                    description="Usa el formulario de arriba para agendar la primera cita de este profesional"
                  />
                ) : (
                  <div className="ui-table-wrap table-scroll">
                    <table className="ui-table">
                      <thead>
                        <tr>
                          {['ID', 'Mascota', 'Especie', 'Raza', 'Fecha', 'Inicio', 'Fin', 'Tarifa', ''].map((h) => (
                            <th key={h || 'acciones'}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {citas.map((c) => (
                          <tr key={c.id}>
                            <td className="ui-num">{c.id}</td>
                            <td>{c.mascota_nombre}</td>
                            <td>{c.especie || '—'}</td>
                            <td>{c.raza}</td>
                            <td style={{ color: 'var(--color-purple-light)' }}>{formatFecha(c.fecha)}</td>
                            <td>{formatHora(c.hora_inicio)}</td>
                            <td>{formatHora(c.hora_fin)}</td>
                            <td>{formatTarifaLabel(c)}</td>
                            <td>
                              <div className="ui-table__actions">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleConfirmarWhatsApp(c)}
                                  disabled={loading || whatsappBusy != null}
                                  aria-label="Confirmar por WhatsApp"
                                  style={{ color: '#128C7E' }}
                                >
                                  <MessageCircle size={14} />
                                  {whatsappBusy?.id === c.id && whatsappBusy?.kind === 'confirm'
                                    ? 'Abriendo…'
                                    : 'Confirmar'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleMascotaListaWhatsApp(c)}
                                  disabled={loading || whatsappBusy != null}
                                  aria-label="Notificar mascota lista por WhatsApp"
                                  style={{ color: '#128C7E' }}
                                >
                                  <PawPrint size={14} />
                                  {whatsappBusy?.id === c.id && whatsappBusy?.kind === 'lista'
                                    ? 'Abriendo…'
                                    : 'Mascota lista'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => abrirCobrar(c)}
                                  disabled={loading || whatsappBusy != null || cobroModalOpen}
                                  aria-label="Registrar cobro"
                                >
                                  <Banknote size={14} />
                                  Cobrar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => abrirReprogramar(c)}
                                  disabled={loading || whatsappBusy != null}
                                  aria-label="Reprogramar"
                                >
                                  <CalendarClock size={14} />
                                  Reprogramar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setDeleteModalId(c.id)}
                                  disabled={loading || whatsappBusy != null}
                                  aria-label="Quitar"
                                >
                                  <Trash2 size={14} />
                                  Quitar
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <Sheet
        open={!!editCita}
        onClose={cerrarReprogramar}
        title={editCita ? `Reprogramar cita #${editCita.id}` : 'Reprogramar cita'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={cerrarReprogramar} disabled={loading}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleReprogramar}
              disabled={loading || !puedeReprogramar}
            >
              {loading ? 'Guardando…' : editFranjaOcupada ? 'Cita ocupada' : 'Guardar cambios'}
            </Button>
          </>
        }
      >
        {editCita && (
          <div className="agenda-form">
            {!editForm.id_tarifa && (
              <div className="ui-banner ui-banner--warn" style={{ marginBottom: 12 }}>
                Esta cita no tiene tarifa asignada. Selecciona una tarifa obligatoria para poder guardar.
              </div>
            )}
            <div className="agenda-form__row">
              <Field id="edit-buscador-mascota" label="Mascota" required>
                <div ref={editBuscadorMascotaRef} className="ui-combo">
                  <Input
                    id="edit-buscador-mascota"
                    type="text"
                    role="combobox"
                    aria-expanded={editListaMascotasAbierta}
                    aria-controls="lista-mascotas-edit"
                    aria-autocomplete="list"
                    placeholder="Buscar por nombre, raza, especie o tamaño…"
                    value={editBusquedaMascota}
                    disabled={loading}
                    onChange={(e) => {
                      const value = e.target.value;
                      setEditBusquedaMascota(value);
                      setEditListaMascotasAbierta(true);
                      if (editForm.id_mascota) {
                        const selected = mascotas.find(
                          (m) => String(m.id) === String(editForm.id_mascota)
                        );
                        if (!selected || value !== (selected.nombre || '')) {
                          setEditForm((prev) => ({ ...prev, id_mascota: '' }));
                        }
                      }
                    }}
                    onFocus={() => {
                      void abrirListaMascotasEdit();
                    }}
                  />

                  {editListaMascotasAbierta && (
                    <ul id="lista-mascotas-edit" role="listbox" className="ui-combo__list">
                      {editMascotasFiltradas.length === 0 ? (
                        <li
                          className="ui-combo__item"
                          style={{ cursor: 'default', color: 'var(--color-purple-light)' }}
                        >
                          No se encontraron mascotas
                        </li>
                      ) : (
                        editMascotasFiltradas.map((m) => (
                          <li
                            key={m.id}
                            role="option"
                            aria-selected={String(editForm.id_mascota) === String(m.id)}
                          >
                            <button
                              type="button"
                              className={`ui-combo__item${
                                String(editForm.id_mascota) === String(m.id)
                                  ? ' ui-combo__item--active'
                                  : ''
                              }`}
                              onClick={() => seleccionarMascotaEdit(m)}
                            >
                              <div>{m.nombre}</div>
                              <div
                                style={{
                                  fontSize: '0.75rem',
                                  color: 'var(--color-purple-light)',
                                  fontWeight: 400,
                                }}
                              >
                                {[m.especie, m.raza, m.tamano].filter(Boolean).join(' · ')}
                              </div>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
              </Field>
              <Field label="Fecha" required>
                <DateInput
                  value={editForm.fecha}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, fecha: e.target.value }))}
                  disabled={loading}
                  style={editFranjaOcupada ? inputErrorStyle : undefined}
                />
              </Field>
            </div>
            <div className="agenda-form__row">
              <Field id="edit-tarifa-agenda" label="Tarifa" required>
                <Select
                  id="edit-tarifa-agenda"
                  value={editForm.id_tarifa}
                  required
                  disabled={loading || tarifasParaEditar.length === 0}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, id_tarifa: e.target.value }))
                  }
                >
                  <option value="">
                    {tarifasParaEditar.length === 0
                      ? 'Sin tarifas configuradas'
                      : 'Seleccionar tarifa'}
                  </option>
                  {tarifasParaEditar.map((t) => (
                    <option key={t.id} value={t.id}>
                      {`${t.descripcion} — ${formatMoneda(t.valor)}`}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="agenda-form__row agenda-form__row--times">
              <Field label="Inicio" required>
                <Input
                  type="time"
                  value={editForm.hora_inicio}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, hora_inicio: e.target.value }))
                  }
                  disabled={loading}
                  style={
                    editFranjaOcupada || editHoraFinInvalida ? inputErrorStyle : undefined
                  }
                />
              </Field>
              <Field label="Fin" required>
                <Input
                  type="time"
                  value={editForm.hora_fin}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, hora_fin: e.target.value }))
                  }
                  disabled={loading}
                  style={
                    editFranjaOcupada || editHoraFinInvalida ? inputErrorStyle : undefined
                  }
                />
              </Field>
            </div>

            {editHoraFinInvalida && (
              <div className="ui-banner ui-banner--warn" role="alert" style={{ marginTop: 10 }}>
                La hora final debe ser posterior a la hora de inicio.
              </div>
            )}

            {editFranjaOcupada && (
              <div className="ui-banner ui-banner--warn" role="alert" style={{ marginTop: 10 }}>
                <strong>Cita ocupada.</strong> Este profesional ya tiene una cita el{' '}
                {formatFecha(editCitaConflicto.fecha)} de {formatHora(editCitaConflicto.hora_inicio)}{' '}
                a {formatHora(editCitaConflicto.hora_fin)}
                {editCitaConflicto.mascota_nombre
                  ? ` con ${editCitaConflicto.mascota_nombre}`
                  : ''}
                . Elige otra fecha u otra franja horaria.
              </div>
            )}

            {editForm.fecha && editCitasDelDia.length > 0 && (
              <div className="ui-banner" style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  Otras franjas ocupadas este día
                </div>
                {editCitasDelDia.map((c) => (
                  <div key={c.id}>
                    {formatHora(c.hora_inicio)} – {formatHora(c.hora_fin)}
                    {c.mascota_nombre ? ` · ${c.mascota_nombre}` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Sheet>

      <CobroFormSheet
        open={cobroModalOpen}
        onClose={cerrarCobroModal}
        onSubmit={guardarCobroDesdeAgenda}
        loading={loading}
        title="Registrar cobro"
        values={cobroForm}
        nombreMascotaVisible={cobroMascotaNombre}
        tarifas={cobroTarifas}
        onTarifaChange={handleCobroTarifaChange}
        onFieldChange={setCobroForm}
        lockAgendaContext
      />

      <ConfirmSheet
        open={deleteModalId != null}
        onClose={() => setDeleteModalId(null)}
        onConfirm={confirmEliminar}
        title="Confirmar eliminación"
        confirmLabel="Quitar"
        loading={loading}
        danger
      >
        ¿Quitar la cita <b>#{deleteModalId}</b> de la agenda? Esta acción no se puede deshacer.
      </ConfirmSheet>

      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

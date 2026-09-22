import { useEffect, useMemo, useState, useRef } from 'react';
import {
  AlertTriangle,
  Banknote,
  Calendar,
  CalendarClock,
  MessageCircle,
  PawPrint,
  Search,
  Settings2,
  Stethoscope,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import {
  getAgendaDeProfesional,
  crearCitaYCobrar,
  cancelarAgenda,
  marcarAgendaAtendida,
  debeMostrarEnVistaActiva,
  puedeCancelarAgenda,
  motivoNoCancelarAgenda,
  puedeReprogramarAgenda,
  motivoNoReprogramarAgenda,
} from '../api/agendasApi';
import { listTarifas } from '../api/tarifasApi';
import { createCobro, updateCobro } from '../api/cobrosApi';
import { normalizeListPayload } from '../api/normalize';
import { useToast } from '../hooks/useToast';
import { useMutationLock } from '../hooks/useMutationLock';
import { useAgendasCatalog } from '../hooks/useAgendasCatalog';
import { Toast } from '../components/Toast';
import { formatFecha, formatFechaLecturaCliente, formatHora, hoyLocalISO, toDateOnly } from '../utils/format';
import {
  buildWhatsAppMascotaListaMessage,
  openWhatsAppChat,
} from '../utils/whatsapp';
import {
  confirmarAgendaPorWhatsApp,
  resolverCuidadorParaWhatsApp,
} from '../utils/confirmarAgendaWhatsApp';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import Field, { DateInput, Input, Select, Textarea } from '../components/ui/Field';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';
import TablePagination, { PageSizeSelect } from '../components/ui/TablePagination';
import CobroFormSheet from '../components/cobros/CobroFormSheet';
import AgendasReprogramarSheet from '../components/agendas/AgendasReprogramarSheet';
import AgendasCancelarSheet from '../components/agendas/AgendasCancelarSheet';
import AgendasPlantillasSheet from '../components/agendas/AgendasPlantillasSheet';
import TarifaMultiSelect, {
  formatTarifasLabel,
  sumTarifasValor,
  totalTarifasSeleccionadas,
} from '../components/ui/TarifaMultiSelect';
import HorarioSlotSelect from '../components/ui/HorarioSlotSelect';
import { useClientTablePagination } from '../hooks/useClientTablePagination';
import {
  generarBloquesHorarios,
  horaAMinutos as horaAMinutosUtil,
  jornadaDelProfesional,
  toTimeHHMM,
} from '../utils/horarios';
import {
  citasDelDiaParaSlots,
  encontrarCitaConflicto,
  filtrarSlotsFinLibres,
  slotOcupadoPorCitas,
} from '../utils/agendaConflictos';
import { loadAgendaPlantillas } from '../utils/agendaPlantillas';
import '../index.css';
import { TABLE_STICKY_COLS_2 } from '../lib/tableSticky';
import {
  emptyCobroForm,
  formatTarifaLabel,
  estadoPagoCita,
  resolverTarifaCita as resolverTarifaCitaHelper,
  AGENDA_INPUT_ERROR_STYLE,
} from './agendas/agendaPageHelpers';

/** Convierte "HH:MM" o "HH:MM:SS" a minutos desde medianoche. */
function horaAMinutos(hora) {
  return horaAMinutosUtil(hora);
}

export default function AgendasPage() {
  const { toasts, addToast, removeToast } = useToast();
  const { tryLock, unlock } = useMutationLock();

  const {
    profesionales,
    mascotas,
    setMascotas,
    initLoading,
    initError,
    busquedaProf,
    setBusquedaProf,
    listaAbierta,
    setListaAbierta,
    busquedaCuidador,
    setBusquedaCuidador,
    listaCuidadoresAbierta,
    setListaCuidadoresAbierta,
    busquedaMascota,
    setBusquedaMascota,
    listaMascotasAbierta,
    setListaMascotasAbierta,
    profSel,
    setProfSel,
    cuidadorSel,
    setCuidadorSel,
    mascotaId,
    setMascotaId,
    buscadorRef,
    buscadorCuidadorRef,
    buscadorMascotaRef,
    profesionalesFiltrados,
    cuidadoresFiltrados,
    mascotasFiltradas,
    limpiarMascotaSeleccion,
    limpiarCuidadorSeleccion,
    seleccionarCuidador,
    seleccionarMascota,
    abrirListaCuidadoresCrear,
    abrirListaMascotasCrear,
    abrirListaProfesionales,
  } = useAgendasCatalog({ addToast });

  const [citas, setCitas] = useState([]);
  const [fecha, setFecha] = useState('');
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFin, setHoraFin] = useState('');
  const [idTarifas, setIdTarifas] = useState([]);
  const [observacionIngreso, setObservacionIngreso] = useState('');
  const [cobroMetodoPago, setCobroMetodoPago] = useState('');
  const [cobroObservacion, setCobroObservacion] = useState('');
  const [tarifas, setTarifas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [plantillasOpen, setPlantillasOpen] = useState(false);
  const [agendaTemplates, setAgendaTemplates] = useState(() => loadAgendaPlantillas());
  const [whatsappBusy, setWhatsappBusy] = useState(null); // { id, kind: 'confirm'|'lista' }
  const [pagarBusyId, setPagarBusyId] = useState(null);
  const [filtroTabla, setFiltroTabla] = useState('');
  const [mostrarCanceladas, setMostrarCanceladas] = useState(false);
  const [reprogramCita, setReprogramCita] = useState(null);
  const [deleteModalId, setDeleteModalId] = useState(null);
  const [observacionCancelacion, setObservacionCancelacion] = useState('');
  const [cobroModalOpen, setCobroModalOpen] = useState(false);
  const [cobroForm, setCobroForm] = useState(() => emptyCobroForm());
  const [cobroMascotaNombre, setCobroMascotaNombre] = useState('');
  const [cobroTarifas, setCobroTarifas] = useState([]);
  const profesionalAgendaReq = useRef(0);
  const whatsappCancelRef = useRef(null);

  useEffect(() => {
    return () => {
      whatsappCancelRef.current?.cancel?.();
    };
  }, []);

  // Refresco al volver a la pestaña (sin Realtime): evita UI desfasada vs Cobros/Cuidadores
  useEffect(() => {
    if (!profSel?.id) return undefined;

    async function refrescarSiVisible() {
      if (document.visibilityState !== 'visible') return;
      const reqId = ++profesionalAgendaReq.current;
      try {
        const [resAgenda, resTarifas] = await Promise.all([
          getAgendaDeProfesional(profSel.id),
          listTarifas(profSel.id),
        ]);
        if (reqId !== profesionalAgendaReq.current) return;
        setCitas(normalizeListPayload(resAgenda));
        setTarifas(normalizeListPayload(resTarifas));
      } catch {
        /* silencioso: el usuario puede forzar con re-selección */
      }
    }

    function onVisibility() {
      void refrescarSiVisible();
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [profSel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function cerrarReprogramar() {
    setReprogramCita(null);
  }

  function abrirReprogramar(c) {
    const motivo = motivoNoReprogramarAgenda(c);
    if (motivo) {
      addToast(motivo, 'error');
      return;
    }
    setReprogramCita(c);
  }

  async function onReprogramSuccess() {
    if (!profSel?.id) {
      cerrarReprogramar();
      return;
    }
    try {
      const res = await getAgendaDeProfesional(profSel.id);
      setCitas(normalizeListPayload(res));
    } catch (e) {
      addToast(e?.message || 'Error al refrescar la agenda', 'error');
    } finally {
      cerrarReprogramar();
    }
  }

  async function seleccionarProfesional(p) {
    const reqId = ++profesionalAgendaReq.current;
    setProfSel(p);
    setBusquedaProf(p.nombre || '');
    setListaAbierta(false);
    setCitas([]);
    setTarifas([]);
    setFiltroTabla('');
    limpiarCuidadorSeleccion();
    setFecha('');
    setHoraInicio('');
    setHoraFin('');
    setIdTarifas([]);
    setObservacionIngreso('');
    setCobroMetodoPago('');
    setCobroObservacion('');
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
    setFiltroTabla('');
    limpiarCuidadorSeleccion();
    setFecha('');
    setHoraInicio('');
    setHoraFin('');
    setIdTarifas([]);
    setObservacionIngreso('');
    setCobroMetodoPago('');
    setCobroObservacion('');
    setListaAbierta(false);
    cerrarReprogramar();
  }

  function limpiarFormularioAgenda() {
    limpiarCuidadorSeleccion();
    setFecha('');
    setHoraInicio('');
    setHoraFin('');
    setIdTarifas([]);
    setObservacionIngreso('');
    setCobroMetodoPago('');
    setCobroObservacion('');
  }

  async function handleAgendarConCobro(estadoCobro) {
    if (!mascotaId || !fecha || !horaInicio || !horaFin || !idTarifas.length || !profSel?.id)
      return;
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
    const valor = sumTarifasValor(tarifas, idTarifas);
    if (Number.isNaN(valor) || valor < 0) {
      addToast('Las tarifas seleccionadas no tienen un valor válido', 'error');
      return;
    }
    if (!cobroMetodoPago?.trim()) {
      addToast('Selecciona un método de pago', 'error');
      return;
    }
    if (!tryLock()) return;
    setLoading(true);
    const esPendiente = estadoCobro === 'pendiente';
    try {
      const resCreate = await crearCitaYCobrar(
        Number(profSel.id),
        {
          id_mascota: Number(mascotaId),
          id_tarifas: idTarifas.map(Number),
          fecha: fechaGuardar,
          hora_inicio: horaInicio,
          hora_fin: horaFin,
          observacion_ingreso: observacionIngreso,
        },
        {
          valor,
          metodo_pago: cobroMetodoPago,
          observacion: cobroObservacion,
          fecha_cobro: fechaGuardar,
          estado: esPendiente ? 'pendiente' : 'pagado',
        }
      );

      const agendaCreada = resCreate?.data?.agenda || resCreate?.agenda || null;
      const mascotaSel =
        mascotas.find((m) => String(m.id) === String(mascotaId)) || null;
      const tarifasSeleccionadas = idTarifas
        .map((id) => tarifas.find((t) => String(t.id) === String(id)))
        .filter(Boolean);
      const tarifaDescripcion = formatTarifasLabel(tarifasSeleccionadas);

      addToast(
        esPendiente
          ? 'Cita agendada con cobro pendiente.'
          : 'Cita agendada y pagada correctamente.',
        'success'
      );

      try {
        whatsappCancelRef.current?.cancel?.();
        const citaWa = {
          ...(agendaCreada || {}),
          id_mascota: Number(mascotaId),
          fecha: fechaGuardar,
          hora_inicio: horaInicio,
          hora_fin: horaFin,
          mascota_nombre: mascotaSel?.nombre,
          especie: mascotaSel?.especie,
          raza: mascotaSel?.raza,
          tamano: mascotaSel?.tamano,
          tarifas: tarifasSeleccionadas,
        };
        whatsappCancelRef.current = await confirmarAgendaPorWhatsApp({
          cita: citaWa,
          profesionalNombre: profSel?.nombre || '',
          mascotaFallback: mascotaSel,
          tarifaDescripcion,
          tarifaValor: valor,
          tarifas: tarifasSeleccionadas,
        });
        addToast('Se abrió WhatsApp con el mensaje de confirmación.', 'success');
      } catch (waErr) {
        addToast(
          `No se abrió WhatsApp: ${waErr?.message || 'sin cuidador/teléfono válido'}`,
          'error'
        );
      }

      limpiarFormularioAgenda();
      const res = await getAgendaDeProfesional(profSel.id);
      setCitas(normalizeListPayload(res));
    } catch (e) {
      addToast(
        e?.message ||
          (esPendiente ? 'Error al agendar' : 'Error al agendar y pagar'),
        'error'
      );
    } finally {
      setLoading(false);
      unlock();
    }
  }

  async function handleAgendar() {
    await handleAgendarConCobro('pendiente');
  }

  async function handleAgendarYPagar() {
    await handleAgendarConCobro('pagado');
  }

  async function confirmCancelarAgenda() {
    if (deleteModalId == null || !profSel?.id) return;
    if (!tryLock()) return;
    const idAgenda = deleteModalId;
    setLoading(true);
    try {
      const res = await cancelarAgenda(profSel.id, idAgenda, observacionCancelacion);
      const updated = res?.data || {
        cancelada: true,
        observacion_cancelacion: observacionCancelacion.trim() || null,
      };
      addToast('Cita cancelada y cobro anulado. La franja quedó libre.', 'success');
      setCitas((prev) =>
        prev.map((c) =>
          String(c.id) === String(idAgenda)
            ? {
                ...c,
                cancelada: true,
                cobrada: false,
                cobro_estado: 'anulado',
                observacion_cancelacion:
                  updated.observacion_cancelacion ??
                  (observacionCancelacion.trim() || null),
              }
            : c
        )
      );
      if (reprogramCita?.id === idAgenda) cerrarReprogramar();
      setDeleteModalId(null);
      setObservacionCancelacion('');
    } catch (e) {
      addToast(e?.message || 'Error al cancelar la cita', 'error');
    } finally {
      setLoading(false);
      unlock();
    }
  }

  function cerrarModalCancelar() {
    if (loading) return;
    setDeleteModalId(null);
    setObservacionCancelacion('');
  }

  async function resolverCuidadorParaWhatsAppLocal(cita) {
    return resolverCuidadorParaWhatsApp(cita?.id_mascota, {
      nombre: cita?.mascota_nombre,
      especie: cita?.especie,
      raza: cita?.raza,
      tamano: cita?.tamano,
    });
  }

  function resolverTarifaCita(cita) {
    return resolverTarifaCitaHelper(cita, tarifas);
  }

  async function handleConfirmarWhatsApp(cita) {
    if (!tryLock()) return;
    setWhatsappBusy({ id: cita.id, kind: 'confirm' });
    try {
      whatsappCancelRef.current?.cancel?.();
      const { tarifaDescripcion, tarifaValor, tarifas: tarifasMsg } =
        resolverTarifaCita(cita);
      whatsappCancelRef.current = await confirmarAgendaPorWhatsApp({
        cita,
        profesionalNombre: profSel?.nombre || '',
        tarifaDescripcion,
        tarifaValor,
        tarifas: tarifasMsg,
      });
      addToast('Se abrió WhatsApp con el mensaje de confirmación.', 'success');
    } catch (e) {
      addToast(e?.message || 'No se pudo confirmar la agenda por WhatsApp', 'error');
    } finally {
      setWhatsappBusy(null);
      unlock();
    }
  }

  async function handleMascotaListaWhatsApp(cita) {
    if (cita?.cancelada === true) return;
    if (cita?.atendida === true) {
      addToast('Esta cita ya está marcada como Mascota lista.', 'success');
      return;
    }
    if (!tryLock()) return;
    setWhatsappBusy({ id: cita.id, kind: 'lista' });
    try {
      whatsappCancelRef.current?.cancel?.();

      await marcarAgendaAtendida(cita.id, profSel?.id ?? null);
      setCitas((prev) =>
        prev
          .map((c) =>
            String(c.id) === String(cita.id) ? { ...c, atendida: true } : c
          )
          .filter(debeMostrarEnVistaActiva)
      );
      if (reprogramCita != null && String(reprogramCita.id) === String(cita.id)) {
        cerrarReprogramar();
      }

      let whatsappOk = false;
      try {
        const { cuidador, phone, mascotaData } =
          await resolverCuidadorParaWhatsAppLocal(cita);
        const mascotaNombre = mascotaData?.nombre || cita.mascota_nombre || '';
        const { tarifaDescripcion } = resolverTarifaCita(cita);
        const message = buildWhatsAppMascotaListaMessage({
          cuidadorNombre: cuidador.nombre,
          mascotaNombre,
          profesionalNombre: profSel?.nombre || '',
          fechaLabel: formatFechaLecturaCliente(cita.fecha),
          horaFinLabel: formatHora(cita.hora_fin),
          tarifaDescripcion,
        });
        whatsappCancelRef.current = openWhatsAppChat(phone, message);
        whatsappOk = true;
      } catch (waErr) {
        addToast(
          `Mascota lista registrada. No se abrió WhatsApp: ${waErr?.message || 'sin cuidador/teléfono válido'}`,
          'success'
        );
      }

      if (whatsappOk) {
        addToast(
          estadoPagoCita(cita) === 'pagado'
            ? 'Mascota lista y WhatsApp abierto. La cita quedó archivada.'
            : 'Mascota lista y WhatsApp abierto. La cita sigue visible hasta pagar.',
          'success'
        );
      }
    } catch (e) {
      addToast(e?.message || 'No se pudo marcar la mascota como lista', 'error');
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
    if (estadoPagoCita(cita) === 'pagado') return;
    const { tarifaDescripcion, idTarifas: idsRaw } = resolverTarifaCita(cita);
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

    const { ids, total } = totalTarifasSeleccionadas(tarifasProf, idsRaw);

    setCobroTarifas(tarifasProf);
    setCobroMascotaNombre(cita.mascota_nombre || '');
    setCobroForm({
      id_profesional: String(profSel.id),
      id_agenda: String(cita.id),
      id_mascota: String(cita.id_mascota || ''),
      id_tarifas: ids,
      id_tarifa: ids[0] || '',
      valor: String(total),
      metodo_pago: '',
      observacion: tarifaDescripcion
        ? `Pago agenda #${cita.id} · ${tarifaDescripcion}`
        : `Pago agenda #${cita.id}`,
      fecha_cobro: toDateOnly(cita.fecha) || hoyLocalISO(),
      profesional_nombre: profSel.nombre || '',
      agenda_label: `${formatFecha(cita.fecha)} — ${cita.mascota_nombre || 'Mascota'} · ${formatHora(cita.hora_inicio)}-${formatHora(cita.hora_fin)}`,
    });
    setCobroModalOpen(true);
  }

  async function handlePagar(cita) {
    if (!cita?.id || cita.cancelada) return;
    if (estadoPagoCita(cita) === 'pagado') return;

    // Cobro pendiente existente → marcar pagado
    if (cita.cobro_id && cita.cobro_estado === 'pendiente') {
      if (!tryLock()) return;
      setPagarBusyId(cita.id);
      try {
        const res = await updateCobro(cita.cobro_id, { estado: 'pagado' });
        if (res?.status === 'ok') {
          setCitas((prev) =>
            prev
              .map((c) =>
                String(c.id) === String(cita.id)
                  ? { ...c, cobrada: true, cobro_estado: 'pagado' }
                  : c
              )
              .filter(debeMostrarEnVistaActiva)
          );
          addToast(
            cita.atendida === true
              ? 'Pago registrado. La cita quedó archivada (lista + pagada).'
              : 'Pago registrado. La cita quedó como pagada.',
            'success'
          );
        } else {
          addToast(res?.message || 'Error al registrar el pago', 'error');
        }
      } catch (e) {
        addToast(e?.message || 'Error al registrar el pago', 'error');
      } finally {
        setPagarBusyId(null);
        unlock();
      }
      return;
    }

    // Sin cobro (citas antiguas): abrir formulario
    await abrirCobrar(cita);
  }

  function handleCobroTarifasChange(id_tarifas) {
    const { ids, total } = totalTarifasSeleccionadas(cobroTarifas, id_tarifas);
    setCobroForm((prev) => ({
      ...prev,
      id_tarifas: ids,
      id_tarifa: ids[0] || '',
      valor: String(total),
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
    if (!cobroForm.id_tarifas?.length) {
      addToast('Selecciona al menos una tarifa', 'error');
      return;
    }
    if (!cobroForm.metodo_pago?.trim()) {
      addToast('Selecciona un método de pago', 'error');
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
        id_profesional: Number(cobroForm.id_profesional),
        id_agenda: Number(cobroForm.id_agenda),
        id_mascota: Number(cobroForm.id_mascota),
        id_tarifas: (cobroForm.id_tarifas || []).map(Number),
        valor: cobroForm.valor,
        metodo_pago: cobroForm.metodo_pago,
        observacion: cobroForm.observacion,
        fecha_cobro: cobroForm.fecha_cobro,
        estado: 'pagado',
      });
      if (res?.status === 'ok') {
        const agendaId = String(cobroForm.id_agenda);
        const cobroCreado = res?.data;
        addToast('Pago registrado. La cita quedó como pagada.', 'success');
        setCitas((prev) =>
          prev
            .map((c) =>
              String(c.id) === agendaId
                ? {
                    ...c,
                    cobrada: true,
                    cobro_id: cobroCreado?.id ?? c.cobro_id,
                    cobro_estado: 'pagado',
                  }
                : c
            )
            .filter(debeMostrarEnVistaActiva)
        );
        cerrarCobroModal({ force: true });
      } else {
        addToast(res?.message || 'Error al registrar el pago', 'error');
      }
    } catch (e) {
      addToast(e?.message || 'Error al registrar el pago', 'error');
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

  const citasDelDia = fecha
    ? citas
        .filter(
          (c) =>
            toDateOnly(c.fecha) === toDateOnly(fecha) &&
            c.cancelada !== true &&
            c.atendida !== true
        )
        .sort(
          (a, b) =>
            (horaAMinutos(a.hora_inicio) ?? 0) - (horaAMinutos(b.hora_inicio) ?? 0)
        )
    : [];

  const jornadaProf = useMemo(() => jornadaDelProfesional(profSel), [profSel]);

  const slotsInicioAgenda = useMemo(() => {
    const base = generarBloquesHorarios(jornadaProf.inicio, jornadaProf.fin, 30, {
      includeEnd: false,
    });
    if (!fecha) return base;
    const ocupadas = citasDelDiaParaSlots(citas, fecha);
    return base.filter((slot) => !slotOcupadoPorCitas(slot, ocupadas));
  }, [jornadaProf, fecha, citas]);

  const slotsFinAgenda = useMemo(() => {
    if (!horaInicio) {
      const base = generarBloquesHorarios(jornadaProf.inicio, jornadaProf.fin, 30, {
        includeEnd: true,
      }).filter((s) => s > jornadaProf.inicio);
      return filtrarSlotsFinLibres(base, { citas, fecha });
    }
    const despues = generarBloquesHorarios(horaInicio, jornadaProf.fin, 30, {
      includeEnd: true,
    }).filter((s) => s > horaInicio);
    return filtrarSlotsFinLibres(despues, {
      citas,
      fecha,
      horaInicio,
    });
  }, [jornadaProf, horaInicio, fecha, citas]);

  function onChangeHoraInicioCrear(value) {
    const inicio = toTimeHHMM(value);
    setHoraInicio(inicio);
    // Selección explícita de fin: no autocompletar duración fija.
    setHoraFin('');
  }

  const citasFiltradas = useMemo(() => {
    const base = mostrarCanceladas
      ? citas
      : citas.filter((c) => c.cancelada !== true);
    const q = filtroTabla.trim().toLowerCase();
    if (!q) return base;
    return base.filter((c) => {
      const haystack = [
        c.id,
        c.mascota_nombre,
        c.especie,
        c.raza,
        c.tamano,
        formatFecha(c.fecha),
        formatHora(c.hora_inicio),
        formatHora(c.hora_fin),
        formatTarifaLabel(c),
        c.cancelada
          ? 'cancelada'
          : estadoPagoCita(c) === 'pagado'
            ? 'pagada cobrada'
            : 'pendiente de pago cobro',
        c.observacion_cancelacion,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [citas, filtroTabla, mostrarCanceladas]);

  const {
    pageRows: citasPageRows,
    page: citasPage,
    pages: citasPages,
    total: citasTotal,
    itemsPerPage: citasPerPage,
    handlePageSizeChange: handleCitasPageSize,
    goToPage: goToCitasPage,
  } = useClientTablePagination(
    citasFiltradas,
    `${profSel?.id || ''}|${filtroTabla.trim()}|${mostrarCanceladas ? '1' : '0'}`
  );

  const puedeAgendar =
    !!mascotaId &&
    idTarifas.length > 0 &&
    !!fecha &&
    !!horaInicio &&
    !!horaFin &&
    !horaFinInvalida &&
    !franjaOcupada;

  const tarifasActivas = tarifas.filter((t) => t.activo !== false);
  const inputErrorStyle = AGENDA_INPUT_ERROR_STYLE;

  return (
    <div className="ui-page">
      <PageHeader
        title="Agendas"
        subtitle="Busca y selecciona un profesional para ver su agenda y asignar mascotas con fecha y franja horaria."
      />

      <hr className="ui-divider" />

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
        <>
          <div className="ui-card ui-card--filters">
            <div className="ui-card__section-title">Filtros de agenda</div>
            <div className="fields-row">
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
                          limpiarCuidadorSeleccion();
                          setFecha('');
                          setHoraInicio('');
                          setHoraFin('');
                          setIdTarifas([]);
                          setObservacionIngreso('');
                          cerrarReprogramar();
                        }
                      }}
                      onFocus={() => {
                        void abrirListaProfesionales();
                      }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setAgendaTemplates(loadAgendaPlantillas());
                        setPlantillasOpen(true);
                      }}
                      disabled={loading}
                      title="Editar plantillas de WhatsApp"
                    >
                      <Settings2 size={16} />
                      Plantillas
                    </Button>
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
                <div className="ui-selection-header">
                  <div>
                    <div className="ui-selection-header__name">{profSel.nombre}</div>
                    {profSel.telefono ? (
                      <div className="ui-selection-header__detail">{profSel.telefono}</div>
                    ) : null}
                  </div>
                  <span className="ui-badge" style={{ background: 'var(--color-entorno)', color: 'var(--color-black)' }}>
                    {citas.length} cita{citas.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div style={{ marginBottom: 20 }}>
                    <div className="agenda-form">
                      <div className="agenda-form__row">
                        <Field id="buscador-cuidador-agenda" label="Cuidador">
                          <div ref={buscadorCuidadorRef} className="ui-combo">
                            <Input
                              id="buscador-cuidador-agenda"
                              type="text"
                              role="combobox"
                              aria-expanded={listaCuidadoresAbierta}
                              aria-controls="lista-cuidadores-agenda"
                              aria-autocomplete="list"
                              placeholder="Buscar por nombre, teléfono o email…"
                              value={busquedaCuidador}
                              disabled={loading}
                              onChange={(e) => {
                                const value = e.target.value;
                                setBusquedaCuidador(value);
                                setListaCuidadoresAbierta(true);
                                if (cuidadorSel && value !== (cuidadorSel.nombre || '')) {
                                  setCuidadorSel(null);
                                  setMascotas([]);
                                  limpiarMascotaSeleccion();
                                }
                              }}
                              onFocus={() => {
                                void abrirListaCuidadoresCrear();
                              }}
                            />

                            {listaCuidadoresAbierta && (
                              <ul
                                id="lista-cuidadores-agenda"
                                role="listbox"
                                className="ui-combo__list"
                              >
                                {cuidadoresFiltrados.length === 0 ? (
                                  <li
                                    className="ui-combo__item"
                                    style={{
                                      cursor: 'default',
                                      color: 'var(--color-purple-light)',
                                    }}
                                  >
                                    {busquedaCuidador.trim()
                                      ? `Sin resultados para “${busquedaCuidador.trim()}”`
                                      : 'No hay cuidadores registrados'}
                                  </li>
                                ) : (
                                  cuidadoresFiltrados.map((c) => (
                                    <li
                                      key={c.id}
                                      role="option"
                                      aria-selected={cuidadorSel?.id === c.id}
                                    >
                                      <button
                                        type="button"
                                        className={`ui-combo__item${
                                          cuidadorSel?.id === c.id
                                            ? ' ui-combo__item--active'
                                            : ''
                                        }`}
                                        onClick={() => seleccionarCuidador(c)}
                                      >
                                        <div>{c.nombre}</div>
                                        <div
                                          style={{
                                            fontSize: '0.75rem',
                                            color: 'var(--color-purple-light)',
                                            fontWeight: 400,
                                          }}
                                        >
                                          {[c.telefono, c.email].filter(Boolean).join(' · ') ||
                                            'Sin contacto'}
                                        </div>
                                      </button>
                                    </li>
                                  ))
                                )}
                              </ul>
                            )}
                          </div>
                        </Field>
                        <Field id="buscador-mascota" label="Mascota">
                          <div ref={buscadorMascotaRef} className="ui-combo">
                            <Input
                              id="buscador-mascota"
                              type="text"
                              role="combobox"
                              aria-expanded={listaMascotasAbierta}
                              aria-controls="lista-mascotas"
                              aria-autocomplete="list"
                              placeholder={
                                cuidadorSel
                                  ? 'Buscar por nombre, raza, especie o tamaño…'
                                  : 'Seleccione primero un cuidador'
                              }
                              value={busquedaMascota}
                              disabled={loading || !cuidadorSel}
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

                            {listaMascotasAbierta && cuidadorSel && (
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
                                    {mascotas.length === 0
                                      ? 'Este cuidador no tiene mascotas asignadas'
                                      : 'No se encontraron mascotas'}
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
                      </div>
                      <div className="agenda-form__row">
                        <Field label="Fecha">
                          <DateInput
                            value={fecha}
                            onChange={(e) => {
                              setFecha(e.target.value);
                              setHoraInicio('');
                              setHoraFin('');
                            }}
                            disabled={loading}
                            style={franjaOcupada ? inputErrorStyle : undefined}
                          />
                        </Field>
                      </div>
                      <div className="agenda-form__row">
                        <Field id="tarifa-agenda" label="Tarifas" required>
                          <TarifaMultiSelect
                            id="tarifa-agenda"
                            tarifas={tarifasActivas}
                            value={idTarifas}
                            onChange={setIdTarifas}
                            disabled={loading || tarifasActivas.length === 0}
                            required
                            emptyLabel="Sin tarifas configuradas"
                          />
                        </Field>
                      </div>
                      <div className="agenda-form__row">
                        <Field
                          id="observacion-ingreso-agenda"
                          label="Observaciones de ingreso / mascota"
                        >
                          <Textarea
                            id="observacion-ingreso-agenda"
                            value={observacionIngreso}
                            onChange={(e) => setObservacionIngreso(e.target.value)}
                            placeholder="Notas al ingresar la mascota (opcional)"
                            disabled={loading}
                            rows={2}
                          />
                        </Field>
                      </div>
                      <div className="agenda-form__row agenda-form__row--times">
                        <Field label="Inicio">
                          <HorarioSlotSelect
                            value={horaInicio}
                            slots={slotsInicioAgenda}
                            disabled={loading || !profSel}
                            placeholder="Hora inicio"
                            emptyLabel="Sin horarios libres"
                            style={franjaOcupada || horaFinInvalida ? inputErrorStyle : undefined}
                            onChange={onChangeHoraInicioCrear}
                          />
                        </Field>
                        <Field label="Fin">
                          <HorarioSlotSelect
                            value={horaFin}
                            slots={slotsFinAgenda}
                            disabled={loading || !profSel || !horaInicio}
                            placeholder="Hora fin"
                            emptyLabel="Sin horarios disponibles"
                            style={franjaOcupada || horaFinInvalida ? inputErrorStyle : undefined}
                            onChange={(v) => setHoraFin(toTimeHHMM(v))}
                          />
                        </Field>
                        <div className="agenda-form__action">
                          <Button
                            variant="primary"
                            onClick={handleAgendar}
                            disabled={
                              loading || !puedeAgendar || !cobroMetodoPago.trim()
                            }
                          >
                            {loading ? '…' : franjaOcupada ? 'Cita ocupada' : 'Agendar'}
                          </Button>
                        </div>
                      </div>
                      <div className="agenda-form__row">
                        <Field
                          label="Método de pago"
                          required
                        >
                          <Select
                            value={cobroMetodoPago}
                            onChange={(e) => setCobroMetodoPago(e.target.value)}
                            disabled={loading}
                            required
                            aria-required="true"
                          >
                            <option value="">Seleccionar método de pago</option>
                            <option value="Efectivo">Efectivo</option>
                            <option value="Transferencia">Transferencia</option>
                            <option value="Tarjeta">Tarjeta</option>
                          </Select>
                          <div
                            style={{
                              marginTop: 6,
                              fontSize: '0.75rem',
                              color: 'var(--color-purple-light)',
                            }}
                          >
                            Obligatorio para Agendar (cobro pendiente) y Agendar y Pagar
                          </div>
                        </Field>
                        <Field label="Observación del cobro">
                          <Textarea
                            value={cobroObservacion}
                            onChange={(e) => setCobroObservacion(e.target.value)}
                            placeholder="Observación financiera del cobro (opcional)"
                            disabled={loading}
                            rows={2}
                          />
                        </Field>
                      </div>
                      <div className="agenda-form__row" style={{ justifyContent: 'flex-end' }}>
                        <div className="agenda-form__action">
                          <Button
                            variant="ghost"
                            onClick={handleAgendarYPagar}
                            disabled={loading || !puedeAgendar || !cobroMetodoPago.trim()}
                            title="Crea la cita, registra el cobro como pagado y confirma por WhatsApp"
                          >
                            <Banknote size={14} />
                            Agendar y Pagar
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

                {citas.length === 0 ? (
                  <EmptyState
                    icon={<Calendar size={24} />}
                    title="Sin citas agendadas"
                    description="Usa el formulario de arriba para agendar la primera cita de este profesional"
                  />
                ) : (
                  <>
                    <div className="ui-toolbar">
                      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                        <Search
                          size={16}
                          style={{
                            position: 'absolute',
                            left: 14,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: 'var(--color-purple-light)',
                            pointerEvents: 'none',
                          }}
                        />
                        <Input
                          type="text"
                          placeholder="Buscar cita por mascota, fecha, horario o tarifa…"
                          value={filtroTabla}
                          onChange={(e) => setFiltroTabla(e.target.value)}
                          style={{ paddingLeft: 40 }}
                          aria-label="Buscar en la agenda"
                        />
                      </div>
                      {filtroTabla && (
                        <Button variant="ghost" size="sm" onClick={() => setFiltroTabla('')}>
                          <X size={16} />
                          Limpiar
                        </Button>
                      )}
                      <label
                        htmlFor="mostrar-canceladas-agenda"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          flexShrink: 0,
                          fontSize: '0.8125rem',
                          color: 'var(--color-purple-light)',
                          cursor: 'pointer',
                          userSelect: 'none',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <input
                          id="mostrar-canceladas-agenda"
                          type="checkbox"
                          checked={mostrarCanceladas}
                          onChange={(e) => setMostrarCanceladas(e.target.checked)}
                          disabled={loading}
                          style={{ width: 16, height: 16, accentColor: 'var(--color-entorno)' }}
                        />
                        Mostrar canceladas
                      </label>
                      <PageSizeSelect
                        value={citasPerPage}
                        onChange={handleCitasPageSize}
                        disabled={loading}
                      />
                      <span className="ui-toolbar__meta">
                        {citasTotal} cita{citasTotal !== 1 ? 's' : ''}
                        {!mostrarCanceladas && citas.some((c) => c.cancelada) ? ' (ocultas canceladas)' : ''}
                      </span>
                    </div>

                    {citasTotal === 0 ? (
                      <EmptyState
                        icon={<Calendar size={24} />}
                        title={
                          filtroTabla.trim()
                            ? `Sin resultados para "${filtroTabla.trim()}"`
                            : mostrarCanceladas
                              ? 'Sin citas para mostrar'
                              : 'Sin citas activas'
                        }
                        description={
                          filtroTabla.trim()
                            ? 'La búsqueda aplica a las citas visibles de este profesional'
                            : mostrarCanceladas
                              ? 'Este profesional aún no tiene citas registradas'
                              : 'Activa “Mostrar canceladas” si quieres ver el historial de cancelaciones'
                        }
                      />
                    ) : (
                      <>
                        <div className="ui-table-wrap table-scroll">
                          <table className={TABLE_STICKY_COLS_2}>
                            <thead>
                              <tr>
                                {[
                                  'ID',
                                  'Mascota',
                                  'Especie',
                                  'Raza',
                                  'Fecha',
                                  'Inicio',
                                  'Fin',
                                  'Tarifa',
                                  'Estado',
                                  '',
                                ].map((h) => (
                                  <th key={h || 'acciones'}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {citasPageRows.map((c) => (
                                <tr key={c.id}>
                                  <td className="ui-num">{c.id}</td>
                                  <td>{c.mascota_nombre}</td>
                                  <td>{c.especie || '—'}</td>
                                  <td>{c.raza}</td>
                                  <td style={{ color: 'var(--color-purple-light)' }}>
                                    {formatFecha(c.fecha)}
                                  </td>
                                  <td>{formatHora(c.hora_inicio)}</td>
                                  <td>{formatHora(c.hora_fin)}</td>
                                  <td>{formatTarifaLabel(c)}</td>
                                  <td>
                                    {c.cancelada ? (
                                      <span
                                        className="ui-badge"
                                        title={
                                          c.observacion_cancelacion
                                            ? `Cancelada: ${c.observacion_cancelacion}`
                                            : 'Cita cancelada'
                                        }
                                        style={{
                                          background:
                                            'color-mix(in srgb, #b91c1c 14%, var(--color-white))',
                                          color: '#991b1b',
                                          border:
                                            '1px solid color-mix(in srgb, #b91c1c 30%, transparent)',
                                          fontWeight: 600,
                                        }}
                                      >
                                        Cancelada
                                      </span>
                                    ) : estadoPagoCita(c) === 'pagado' ? (
                                      <span
                                        className="ui-badge"
                                        title="Pago registrado; pendiente de Mascota lista"
                                        style={{
                                          background: 'color-mix(in srgb, #0d9488 18%, var(--color-white))',
                                          color: '#0f766e',
                                          border: '1px solid color-mix(in srgb, #0d9488 35%, transparent)',
                                          fontWeight: 600,
                                        }}
                                      >
                                        Pagada
                                      </span>
                                    ) : (
                                      <span
                                        className="ui-badge"
                                        title="Cobro pendiente de pago"
                                        style={{
                                          background: 'var(--bg-selected)',
                                          color: 'var(--color-entorno)',
                                          fontWeight: 600,
                                        }}
                                      >
                                        Pendiente de pago
                                      </span>
                                    )}
                                    {c.cancelada && c.observacion_cancelacion ? (
                                      <div
                                        style={{
                                          marginTop: 4,
                                          fontSize: '0.75rem',
                                          color: 'var(--color-purple-light)',
                                          maxWidth: 220,
                                        }}
                                      >
                                        {c.observacion_cancelacion}
                                      </div>
                                    ) : null}
                                  </td>
                                  <td>
                                    <div className="ui-table__actions">
                                      {!c.cancelada && (
                                      <>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleConfirmarWhatsApp(c)}
                                        disabled={
                                          loading ||
                                          whatsappBusy != null ||
                                          pagarBusyId != null
                                        }
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
                                        disabled={
                                          loading ||
                                          whatsappBusy != null ||
                                          pagarBusyId != null ||
                                          c.atendida === true
                                        }
                                        aria-label="Marcar mascota lista y notificar"
                                        title={
                                          c.atendida === true
                                            ? 'Esta cita ya está marcada como Mascota lista'
                                            : 'Marcar atención completada y notificar'
                                        }
                                        style={{ color: '#128C7E' }}
                                      >
                                        <PawPrint size={14} />
                                        {whatsappBusy?.id === c.id && whatsappBusy?.kind === 'lista'
                                          ? 'Procesando…'
                                          : 'Mascota lista'}
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handlePagar(c)}
                                        disabled={
                                          loading ||
                                          whatsappBusy != null ||
                                          cobroModalOpen ||
                                          pagarBusyId != null ||
                                          estadoPagoCita(c) === 'pagado'
                                        }
                                        aria-label="Registrar pago"
                                        title={
                                          estadoPagoCita(c) === 'pagado'
                                            ? 'Esta cita ya está pagada'
                                            : 'Marcar el cobro como pagado'
                                        }
                                        style={
                                          estadoPagoCita(c) === 'pagado'
                                            ? { cursor: 'not-allowed' }
                                            : undefined
                                        }
                                      >
                                        <Wallet size={14} />
                                        {pagarBusyId === c.id ? 'Pagando…' : 'Pagar'}
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => abrirReprogramar(c)}
                                        disabled={
                                          loading ||
                                          whatsappBusy != null ||
                                          pagarBusyId != null ||
                                          !puedeReprogramarAgenda(c)
                                        }
                                        aria-label="Reprogramar"
                                        title={
                                          motivoNoReprogramarAgenda(c) ||
                                          'Reprogramar cita'
                                        }
                                      >
                                        <CalendarClock size={14} />
                                        Reprogramar
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          setObservacionCancelacion('');
                                          setDeleteModalId(c.id);
                                        }}
                                        disabled={
                                          loading ||
                                          whatsappBusy != null ||
                                          pagarBusyId != null ||
                                          !puedeCancelarAgenda(c)
                                        }
                                        aria-label="Cancelar agenda"
                                        title={
                                          motivoNoCancelarAgenda(c) ||
                                          'Cancelar agenda y liberar horario'
                                        }
                                      >
                                        <XCircle size={14} />
                                        Cancelar
                                      </Button>
                                      </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <TablePagination
                          page={citasPage}
                          pages={citasPages}
                          total={citasTotal}
                          itemsPerPage={citasPerPage}
                          onPageChange={goToCitasPage}
                          disabled={loading}
                        />
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}

      <AgendasReprogramarSheet
        open={!!reprogramCita}
        onClose={cerrarReprogramar}
        cita={reprogramCita}
        profesional={profSel}
        citas={citas}
        tarifas={tarifas}
        addToast={addToast}
        onSuccess={onReprogramSuccess}
      />

      <CobroFormSheet
        open={cobroModalOpen}
        onClose={cerrarCobroModal}
        onSubmit={guardarCobroDesdeAgenda}
        loading={loading}
        title="Registrar pago"
        values={cobroForm}
        nombreMascotaVisible={cobroMascotaNombre}
        tarifas={cobroTarifas}
        onTarifasChange={handleCobroTarifasChange}
        onFieldChange={setCobroForm}
        lockAgendaContext
      />

      <AgendasCancelarSheet
        open={deleteModalId != null}
        agendaId={deleteModalId}
        loading={loading}
        observacion={observacionCancelacion}
        onObservacionChange={setObservacionCancelacion}
        onClose={cerrarModalCancelar}
        onConfirm={confirmCancelarAgenda}
      />

      <AgendasPlantillasSheet
        open={plantillasOpen}
        onClose={() => setPlantillasOpen(false)}
        templates={agendaTemplates}
        onTemplatesChange={setAgendaTemplates}
        addToast={addToast}
      />

      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Banknote, Pencil, Plus, RotateCcw, Search, Undo2, X } from 'lucide-react';
import {
  listCobros,
  createCobro,
  updateCobro,
  updateCobroPendiente,
  restaurarCobro,
  devolverPagoCobro,
} from '../api/cobrosApi';
import { listProfesionales } from '../api/profesionalesApi';
import { listTarifas } from '../api/tarifasApi';
import { getAgendaDeProfesional } from '../api/agendasApi';
import { normalizeListPayload, normalizeMeta } from '../api/normalize';
import { useToast } from '../hooks/useToast';
import { useMutationLock } from '../hooks/useMutationLock';
import { Toast } from '../components/Toast';
import { formatFecha, hoyLocalISO, formatMoneda, rangoFechasInvalido, toDateOnly } from '../utils/format';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import Field, { DateInput, Input, Select } from '../components/ui/Field';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';
import ConfirmSheet from '../components/ui/ConfirmSheet';
import TablePagination, {
  DEFAULT_PAGE_SIZE,
  PageSizeSelect,
} from '../components/ui/TablePagination';
import CobroFormSheet from '../components/cobros/CobroFormSheet';
import { totalTarifasSeleccionadas } from '../components/ui/TarifaMultiSelect';
import '../index.css';
import { TABLE_STICKY_COLS_2 } from '../lib/tableSticky';

const EMPTY_FILTROS = { estado: '', id_profesional: '', fecha_desde: '', fecha_hasta: '' };

function filtrosActivos(f) {
  return !!(f.estado || f.id_profesional || f.fecha_desde || f.fecha_hasta);
}

function buildCobrosParams(p, f, search = '', limit = DEFAULT_PAGE_SIZE) {
  const params = { page: p, limit };
  if (f.estado) params.estado = f.estado;
  if (f.id_profesional) params.id_profesional = f.id_profesional;
  if (f.fecha_desde) params.fecha_desde = f.fecha_desde;
  if (f.fecha_hasta) params.fecha_hasta = f.fecha_hasta;
  const term = search?.trim();
  if (term) params.search = term;
  return params;
}

export default function CobrosPage() {
  const [cobros, setCobros] = useState([]);
  const [profesionales, setProfesionales] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGE_SIZE);
  const [filtros, setFiltros] = useState(EMPTY_FILTROS);
  const [filtro, setFiltro] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { toasts, addToast, removeToast } = useToast();
  const { tryLock, unlock } = useMutationLock();

  const [modalOpen, setModalOpen] = useState(false);
  const [nuevoCobro, setNuevoCobro] = useState({
    id_profesional: '',
    id_agenda: '',
    id_mascota: '',
    id_tarifa: '',
    id_tarifas: [],
    valor: '',
    metodo_pago: '',
    observacion: '',
    fecha_cobro: hoyLocalISO(),
  });
  const [agendas, setAgendas] = useState([]);
  const [tarifas, setTarifas] = useState([]);
  const [nombreMascotaVisible, setNombreMascotaVisible] = useState('');
  const [busquedaProfFiltro, setBusquedaProfFiltro] = useState('');
  const [listaProfFiltroAbierta, setListaProfFiltroAbierta] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'anular'|'restaurar'|'devolver', id }
  const [submittingEstado, setSubmittingEstado] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [editTarifas, setEditTarifas] = useState([]);
  const [editMascotaNombre, setEditMascotaNombre] = useState('');

  const pageRef = useRef(page);
  const itemsPerPageRef = useRef(itemsPerPage);
  const skipPageEffect = useRef(false);
  const fetchIdRef = useRef(0);
  const cobroProfReq = useRef(0);
  const buscadorProfFiltroRef = useRef(null);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    itemsPerPageRef.current = itemsPerPage;
  }, [itemsPerPage]);

  async function refresh(p = page, f = filtros, search = filtro, limit = itemsPerPageRef.current) {
    const fetchId = ++fetchIdRef.current;
    setListLoading(true);
    setLoadError(null);
    try {
      const res = await listCobros(buildCobrosParams(p, f, search, limit));
      if (fetchId !== fetchIdRef.current) return;
      if (res?.status === 'error') throw new Error(res.message || 'Error al cargar cobros');
      setCobros(normalizeListPayload(res));
      setMeta(normalizeMeta(res, p, limit));
    } catch (e) {
      if (fetchId !== fetchIdRef.current) return;
      const msg = e?.message || 'No se pudo cargar la lista (revisa la sesión o la conexión con el servidor).';
      setLoadError(msg);
      setCobros([]);
      setMeta(null);
      addToast(msg, 'error');
    } finally {
      if (fetchId === fetchIdRef.current) {
        setListLoading(false);
      }
    }
  }

  useEffect(() => {
    async function loadProfesionales() {
      try {
        const res = await listProfesionales(1, 500);
        setProfesionales(normalizeListPayload(res));
      } catch (e) {
        addToast(e?.message || 'Error al cargar profesionales', 'error');
      }
    }
    loadProfesionales();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!filtros.id_profesional) return;
    const selected = profesionales.find(
      (p) => String(p.id) === String(filtros.id_profesional)
    );
    if (selected) setBusquedaProfFiltro(selected.nombre || '');
  }, [filtros.id_profesional, profesionales]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (buscadorProfFiltroRef.current && !buscadorProfFiltroRef.current.contains(e.target)) {
        setListaProfFiltroAbierta(false);
        if (!filtros.id_profesional) {
          setBusquedaProfFiltro('');
        } else {
          const selected = profesionales.find(
            (p) => String(p.id) === String(filtros.id_profesional)
          );
          setBusquedaProfFiltro(selected?.nombre || '');
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filtros.id_profesional, profesionales]);

  useEffect(() => {
    if (rangoFechasInvalido(filtros.fecha_desde, filtros.fecha_hasta)) {
      return undefined;
    }
    const timer = setTimeout(() => {
      refresh(1, filtros, filtro);
      if (pageRef.current !== 1) {
        skipPageEffect.current = true;
      }
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [filtros.estado, filtros.id_profesional, filtros.fecha_desde, filtros.fecha_hasta, filtro]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (skipPageEffect.current) {
      skipPageEffect.current = false;
      return;
    }
    if (rangoFechasInvalido(filtros.fecha_desde, filtros.fecha_hasta)) return;
    refresh(page, filtros, filtro);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const rangoFechasError = rangoFechasInvalido(filtros.fecha_desde, filtros.fecha_hasta);

  function goToPage(p) {
    setPage(p);
  }

  function handlePageSizeChange(size) {
    setItemsPerPage(size);
    itemsPerPageRef.current = size;
    if (pageRef.current !== 1) {
      skipPageEffect.current = true;
    }
    setPage(1);
    refresh(1, filtros, filtro, size);
  }

  function limpiarFiltros() {
    setFiltros(EMPTY_FILTROS);
    setBusquedaProfFiltro('');
    setListaProfFiltroAbierta(false);
  }

  async function recargarTrasMutacion() {
    setFiltros(EMPTY_FILTROS);
    setFiltro('');
    setBusquedaProfFiltro('');
    setListaProfFiltroAbierta(false);
    setPage(1);
    await refresh(1, EMPTY_FILTROS, '');
  }

  const TODOS_PROF_LABEL = 'Todos los profesionales';

  const profesionalesFiltroFiltrados = profesionales.filter((p) => {
    const q = busquedaProfFiltro.trim().toLowerCase();
    if (!q) return true;
    return (
      (p.nombre || '').toLowerCase().includes(q) ||
      (p.telefono || '').toLowerCase().includes(q)
    );
  });

  const mostrarOpcionTodosProf =
    !busquedaProfFiltro.trim() ||
    TODOS_PROF_LABEL.toLowerCase().includes(busquedaProfFiltro.trim().toLowerCase());

  function seleccionarProfFiltroTodos() {
    setFiltros({ ...filtros, id_profesional: '' });
    setBusquedaProfFiltro('');
    setListaProfFiltroAbierta(false);
  }

  function seleccionarProfFiltro(p) {
    setFiltros({ ...filtros, id_profesional: String(p.id) });
    setBusquedaProfFiltro(p.nombre || '');
    setListaProfFiltroAbierta(false);
  }

  const handleProfesionalChange = async (id_profesional) => {
    const reqId = ++cobroProfReq.current;
    setNuevoCobro((prev) => ({
      ...prev,
      id_profesional,
      id_agenda: '',
      id_mascota: '',
      id_tarifa: '',
      id_tarifas: [],
      valor: '',
    }));
    setNombreMascotaVisible('');
    if (id_profesional) {
      try {
        const [resAg, resT] = await Promise.all([
          getAgendaDeProfesional(id_profesional),
          listTarifas(id_profesional),
        ]);
        if (reqId !== cobroProfReq.current) return;
        // Solo agendas activas pendientes de cobro (no cobradas)
        setAgendas(
          normalizeListPayload(resAg).filter((a) => a.cobrada !== true)
        );
        setTarifas(normalizeListPayload(resT));
      } catch (e) {
        if (reqId !== cobroProfReq.current) return;
        setAgendas([]);
        setTarifas([]);
        addToast(e?.message || 'Error al cargar agendas y tarifas', 'error');
      }
    } else {
      setAgendas([]);
      setTarifas([]);
    }
  };

  const handleAgendaChange = (id_agenda) => {
    const agenda = agendas.find((a) => String(a.id) === String(id_agenda));
    if (agenda) {
      const idsRaw =
        Array.isArray(agenda.id_tarifas) && agenda.id_tarifas.length
          ? agenda.id_tarifas.map(String)
          : agenda.id_tarifa != null && agenda.id_tarifa !== ''
            ? [String(agenda.id_tarifa)]
            : [];
      const tarifasParaSuma =
        Array.isArray(agenda.tarifas) && agenda.tarifas.length ? agenda.tarifas : tarifas;
      const { ids, total } = totalTarifasSeleccionadas(tarifasParaSuma, idsRaw);
      setNuevoCobro((prev) => ({
        ...prev,
        id_agenda,
        id_mascota: agenda.id_mascota,
        id_tarifas: ids,
        id_tarifa: ids[0] || '',
        valor: ids.length ? String(total) : prev.valor,
      }));
      setNombreMascotaVisible(agenda.mascota_nombre);
    }
  };

  const handleTarifasChange = (id_tarifas) => {
    const { ids, total } = totalTarifasSeleccionadas(tarifas, id_tarifas);
    setNuevoCobro((prev) => ({
      ...prev,
      id_tarifas: ids,
      id_tarifa: ids[0] || '',
      valor: String(total),
    }));
  };

  const guardarCobro = async (estado = 'pagado') => {
    const estadoFinal = estado === 'pendiente' ? 'pendiente' : 'pagado';
    if (!nuevoCobro.id_profesional) {
      addToast('Selecciona un profesional', 'error');
      return;
    }
    if (!nuevoCobro.id_agenda) {
      addToast('Selecciona una agenda', 'error');
      return;
    }
    if (!nuevoCobro.id_mascota) {
      addToast('La agenda debe tener una mascota asociada', 'error');
      return;
    }
    if (!nuevoCobro.id_tarifas?.length) {
      addToast('Selecciona al menos una tarifa', 'error');
      return;
    }
    if (!nuevoCobro.metodo_pago?.trim()) {
      addToast('Selecciona un método de pago', 'error');
      return;
    }
    const valorNum = parseFloat(nuevoCobro.valor);
    if (Number.isNaN(valorNum) || valorNum < 0) {
      addToast('Ingresa un valor válido (0 o mayor)', 'error');
      return;
    }
    if (!nuevoCobro.fecha_cobro) {
      addToast('La fecha de cobro es requerida', 'error');
      return;
    }

    if (!tryLock()) return;
    setSubmittingEstado(estadoFinal);
    setLoading(true);
    try {
      const res = await createCobro({
        id_profesional: Number(nuevoCobro.id_profesional),
        id_agenda: Number(nuevoCobro.id_agenda),
        id_mascota: Number(nuevoCobro.id_mascota),
        id_tarifas: (nuevoCobro.id_tarifas || []).map(Number),
        valor: nuevoCobro.valor,
        metodo_pago: nuevoCobro.metodo_pago,
        observacion: nuevoCobro.observacion,
        fecha_cobro: nuevoCobro.fecha_cobro,
        estado: estadoFinal,
      });
      if (res?.status === 'ok') {
        addToast(
          estadoFinal === 'pagado'
            ? 'Cobro registrado como pagado'
            : 'Cobro registrado como pendiente de pago',
          'success'
        );
        setModalOpen(false);
        setNuevoCobro({
          id_profesional: '',
          id_agenda: '',
          id_mascota: '',
          id_tarifa: '',
          id_tarifas: [],
          valor: '',
          metodo_pago: '',
          observacion: '',
          fecha_cobro: hoyLocalISO(),
        });
        setNombreMascotaVisible('');
        setAgendas([]);
        setTarifas([]);
        await recargarTrasMutacion();
      } else {
        addToast(res?.message || 'Error al crear cobro', 'error');
      }
    } catch (e) {
      addToast(e?.message || 'Error al crear cobro', 'error');
    } finally {
      setLoading(false);
      setSubmittingEstado(null);
      unlock();
    }
  };

  const cambiarEstado = async (id, nuevoEstado) => {
    if (!tryLock()) return;
    setLoading(true);
    try {
      const res = await updateCobro(id, { estado: nuevoEstado });
      if (res?.status === 'ok') {
        addToast(`Cobro ${nuevoEstado}`, 'success');
        setConfirmAction(null);
        await refresh(page, filtros, filtro);
      } else {
        addToast(res?.message || 'Error al actualizar', 'error');
      }
    } catch (e) {
      addToast(e?.message || 'Error al actualizar cobro', 'error');
    } finally {
      setLoading(false);
      unlock();
    }
  };

  const restaurarCobroAnulado = async (id) => {
    if (!tryLock()) return;
    setLoading(true);
    try {
      const res = await restaurarCobro(id);
      if (res?.status === 'ok') {
        addToast('Cobro restaurado como pendiente', 'success');
        setConfirmAction(null);
        await refresh(page, filtros, filtro);
      } else {
        addToast(res?.message || 'Error al restaurar', 'error');
      }
    } catch (e) {
      addToast(e?.message || 'Error al restaurar cobro', 'error');
    } finally {
      setLoading(false);
      unlock();
    }
  };

  const devolverPago = async (id) => {
    if (!tryLock()) return;
    setLoading(true);
    try {
      const res = await devolverPagoCobro(id);
      if (res?.status === 'ok') {
        addToast('Pago devuelto: el cobro quedó pendiente', 'success');
        setConfirmAction(null);
        await refresh(page, filtros, filtro);
      } else {
        addToast(res?.message || 'Error al devolver el pago', 'error');
      }
    } catch (e) {
      addToast(e?.message || 'Error al devolver el pago', 'error');
    } finally {
      setLoading(false);
      unlock();
    }
  };

  async function confirmarAccionCobro() {
    if (!confirmAction) return;
    if (confirmAction.type === 'anular') {
      await cambiarEstado(confirmAction.id, 'anulado');
      return;
    }
    if (confirmAction.type === 'restaurar') {
      await restaurarCobroAnulado(confirmAction.id);
      return;
    }
    if (confirmAction.type === 'devolver') {
      await devolverPago(confirmAction.id);
    }
  }

  const getBadgeStyle = (estado) => {
    if (estado === 'pagado') return { backgroundColor: 'var(--color-entorno)', color: 'var(--color-white)' };
    if (estado === 'anulado') return { backgroundColor: 'var(--color-entorno)', color: 'var(--color-black)' };
    return { backgroundColor: 'var(--color-entorno)', color: 'var(--color-yellow)' };
  };

  const hayFiltros = filtrosActivos(filtros);
  const hayBusqueda = !!filtro.trim();

  function closeModal() {
    if (!loading) setModalOpen(false);
  }

  function closeEditModal({ force = false } = {}) {
    if (loading && !force) return;
    setEditOpen(false);
    setEditForm(null);
    setEditTarifas([]);
    setEditMascotaNombre('');
  }

  async function abrirEditar(cobro) {
    if (!cobro?.id || cobro.estado !== 'pendiente') return;
    if (!tryLock()) return;
    setLoading(true);
    try {
      const resT = await listTarifas(cobro.id_profesional);
      const tarifasProf = normalizeListPayload(resT);
      const ids =
        Array.isArray(cobro.id_tarifas) && cobro.id_tarifas.length
          ? cobro.id_tarifas.map(String)
          : cobro.id_tarifa != null
            ? [String(cobro.id_tarifa)]
            : [];
      const { ids: idsOk, total } = totalTarifasSeleccionadas(tarifasProf, ids);

      setEditTarifas(tarifasProf);
      setEditMascotaNombre(cobro.mascota_nombre || '');
      setEditForm({
        id: cobro.id,
        id_profesional: String(cobro.id_profesional || ''),
        id_agenda: String(cobro.id_agenda || ''),
        id_mascota: String(cobro.id_mascota || ''),
        id_tarifas: idsOk.length ? idsOk : ids,
        id_tarifa: (idsOk[0] || ids[0] || '') + '',
        valor:
          cobro.valor != null && cobro.valor !== ''
            ? String(cobro.valor)
            : String(total || 0),
        metodo_pago: cobro.metodo_pago || '',
        observacion: cobro.observacion || '',
        fecha_cobro: toDateOnly(cobro.fecha_cobro) || hoyLocalISO(),
        profesional_nombre: cobro.profesional_nombre || '',
        agenda_label: `Agenda #${cobro.id_agenda} — ${cobro.mascota_nombre || 'Mascota'}`,
      });
      setEditOpen(true);
    } catch (e) {
      addToast(e?.message || 'No se pudieron cargar las tarifas del cobro', 'error');
    } finally {
      setLoading(false);
      unlock();
    }
  }

  function handleEditTarifasChange(id_tarifas) {
    const { ids, total } = totalTarifasSeleccionadas(editTarifas, id_tarifas);
    setEditForm((prev) =>
      prev
        ? {
            ...prev,
            id_tarifas: ids,
            id_tarifa: ids[0] || '',
            valor: String(total),
          }
        : prev
    );
  }

  async function guardarEdicion() {
    if (!editForm?.id) return;
    if (!editForm.id_tarifas?.length) {
      addToast('Selecciona al menos una tarifa', 'error');
      return;
    }
    if (!editForm.metodo_pago?.trim()) {
      addToast('Selecciona un método de pago', 'error');
      return;
    }
    const valorNum = parseFloat(editForm.valor);
    if (Number.isNaN(valorNum) || valorNum < 0) {
      addToast('Ingresa un valor válido (0 o mayor)', 'error');
      return;
    }
    if (!editForm.fecha_cobro) {
      addToast('La fecha de cobro es requerida', 'error');
      return;
    }

    if (!tryLock()) return;
    setLoading(true);
    try {
      const res = await updateCobroPendiente(editForm.id, {
        valor: editForm.valor,
        metodo_pago: editForm.metodo_pago,
        observacion: editForm.observacion,
        fecha_cobro: editForm.fecha_cobro,
        id_tarifas: (editForm.id_tarifas || []).map(Number),
      });
      if (res?.status === 'ok') {
        addToast('Cobro actualizado', 'success');
        closeEditModal({ force: true });
        await refresh(page, filtros, filtro);
      } else {
        addToast(res?.message || 'Error al actualizar cobro', 'error');
      }
    } catch (e) {
      addToast(e?.message || 'Error al actualizar cobro', 'error');
    } finally {
      setLoading(false);
      unlock();
    }
  }

  return (
    <div className="ui-page">
      <PageHeader
        title="Cobros"
        actions={
          <Button variant="primary" onClick={() => setModalOpen(true)} disabled={loading}>
            <Plus size={16} />
            Nuevo cobro
          </Button>
        }
      />

      <hr className="ui-divider" />

      {listLoading ? (
        <Skeleton rows={5} />
      ) : loadError ? (
        <EmptyState icon={<AlertTriangle size={24} />} title="No se pudo cargar la información" description={loadError} />
      ) : null}

      {!listLoading && !loadError && (
        <>
          <div className="ui-card ui-card--filters">
            <div className="ui-card__section-title">Filtros de cobros</div>
            <div className="ui-form-grid ui-form-grid--2">
              <Field label="Estado">
                <Select
                  value={filtros.estado}
                  onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}
                >
                  <option value="">Todos los estados</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="pagado">Pagado</option>
                  <option value="anulado">Anulado</option>
                </Select>
              </Field>
              <Field id="filtro-profesional-cobros" label="Profesional">
                <div ref={buscadorProfFiltroRef} className="ui-combo">
                  <Input
                    id="filtro-profesional-cobros"
                    type="text"
                    role="combobox"
                    aria-expanded={listaProfFiltroAbierta}
                    aria-controls="lista-profesionales-cobros"
                    aria-autocomplete="list"
                    placeholder="Buscar por nombre o teléfono…"
                    value={busquedaProfFiltro}
                    onChange={(e) => {
                      setBusquedaProfFiltro(e.target.value);
                      setListaProfFiltroAbierta(true);
                    }}
                    onFocus={() => setListaProfFiltroAbierta(true)}
                    aria-label="Buscar profesional"
                  />

                  {listaProfFiltroAbierta && (
                    <ul
                      id="lista-profesionales-cobros"
                      role="listbox"
                      className="ui-combo__list"
                    >
                      {mostrarOpcionTodosProf && (
                        <li role="option" aria-selected={!filtros.id_profesional}>
                          <button
                            type="button"
                            className={`ui-combo__item${!filtros.id_profesional ? ' ui-combo__item--active' : ''}`}
                            onClick={seleccionarProfFiltroTodos}
                          >
                            {TODOS_PROF_LABEL}
                          </button>
                        </li>
                      )}

                      {profesionalesFiltroFiltrados.length === 0 && !mostrarOpcionTodosProf ? (
                        <li
                          className="ui-combo__item"
                          style={{ cursor: 'default', color: 'var(--color-purple-light)' }}
                        >
                          No se encontraron profesionales
                        </li>
                      ) : (
                        profesionalesFiltroFiltrados.map((p) => (
                          <li
                            key={p.id}
                            role="option"
                            aria-selected={String(filtros.id_profesional) === String(p.id)}
                          >
                            <button
                              type="button"
                              className={`ui-combo__item${
                                String(filtros.id_profesional) === String(p.id)
                                  ? ' ui-combo__item--active'
                                  : ''
                              }`}
                              onClick={() => seleccionarProfFiltro(p)}
                            >
                              <div>{p.nombre}</div>
                              {p.telefono ? (
                                <div
                                  style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--color-purple-light)',
                                    fontWeight: 400,
                                  }}
                                >
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
              <Field label="Desde">
                <DateInput
                  value={filtros.fecha_desde}
                  onChange={(e) => setFiltros({ ...filtros, fecha_desde: e.target.value })}
                  max={filtros.fecha_hasta || undefined}
                />
              </Field>
              <Field label="Hasta">
                <DateInput
                  value={filtros.fecha_hasta}
                  onChange={(e) => setFiltros({ ...filtros, fecha_hasta: e.target.value })}
                  min={filtros.fecha_desde || undefined}
                />
              </Field>
            </div>
            {hayFiltros && (
              <div
                className="fields-row fields-row--end"
                style={{ marginTop: 12 }}
              >
                <div className="fields-row__action">
                  <Button variant="ghost" onClick={limpiarFiltros}>
                    Limpiar
                  </Button>
                </div>
                {meta != null && (
                  <span className="ui-toolbar__meta fields-row__meta">
                    {meta.total} resultado{meta.total !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}
            {rangoFechasError && (
              <div className="ui-banner ui-banner--warn" style={{ marginTop: 12 }}>
                La fecha «Desde» no puede ser posterior a «Hasta».
              </div>
            )}
          </div>

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
                placeholder="Buscar por mascota, profesional, estado, método, ID o valor…"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                style={{ paddingLeft: 40 }}
              />
            </div>
            {filtro && (
              <Button variant="ghost" size="sm" onClick={() => setFiltro('')}>
                <X size={16} />
                Limpiar
              </Button>
            )}
            <PageSizeSelect
              value={itemsPerPage}
              onChange={handlePageSizeChange}
              disabled={listLoading || loading}
            />
            {filtro && meta != null && (
              <span className="ui-toolbar__meta">
                {meta.total} resultado{meta.total !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {(meta?.total ?? cobros.length) === 0 ? (
            <EmptyState
              icon={<Banknote size={24} />}
              title={
                hayBusqueda
                  ? `Sin resultados para "${filtro.trim()}"`
                  : hayFiltros
                    ? 'Sin resultados con los filtros aplicados'
                    : 'No hay cobros registrados'
              }
              description={
                hayBusqueda
                  ? 'Intenta con otro nombre, estado, método, ID o valor'
                  : hayFiltros
                    ? 'Ajusta los filtros o pulsa Limpiar para ver todos los cobros'
                    : 'Usa el botón «Nuevo cobro» para registrar el primer cobro'
              }
            />
          ) : (
            <>
              <div className="ui-table-wrap table-scroll">
                <table className={TABLE_STICKY_COLS_2}>
                  <thead>
                    <tr>
                      {['ID', 'Mascota', 'Profesional', 'Fecha', 'Valor', 'Estado', 'Método', 'Acciones'].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cobros.map((c) => (
                      <tr key={c.id}>
                        <td className="ui-num">{c.id}</td>
                        <td>{c.mascota_nombre}</td>
                        <td>{c.profesional_nombre}</td>
                        <td>{formatFecha(c.fecha_cobro)}</td>
                        <td style={{ fontWeight: 600 }}>{formatMoneda(c.valor)}</td>
                        <td>
                          <span className="ui-badge" style={getBadgeStyle(c.estado)}>
                            {(c.estado || '—').toString().toUpperCase()}
                          </span>
                        </td>
                        <td>{c.metodo_pago || '—'}</td>
                        <td>
                          <div className="ui-table__actions">
                            {c.estado === 'pendiente' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => abrirEditar(c)}
                                  disabled={loading || editOpen}
                                  title="Editar cobro pendiente"
                                >
                                  <Pencil size={14} />
                                  Editar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => cambiarEstado(c.id, 'pagado')}
                                  disabled={loading}
                                >
                                  Pagar
                                </Button>
                              </>
                            )}
                            {c.estado === 'pagado' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setConfirmAction({ type: 'devolver', id: c.id })
                                }
                                disabled={loading}
                                title="Devolver pago y dejar el cobro pendiente"
                              >
                                <Undo2 size={14} />
                                Devolver pago
                              </Button>
                            )}
                            {(c.estado === 'pendiente' || c.estado === 'pagado') && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setConfirmAction({
                                    type: 'anular',
                                    id: c.id,
                                    estado: c.estado,
                                  })
                                }
                                disabled={loading}
                                title={
                                  c.estado === 'pagado'
                                    ? 'Anular cobro pagado y liberar la cita en agenda'
                                    : 'Anular cobro pendiente'
                                }
                              >
                                Anular
                              </Button>
                            )}
                            {c.estado === 'anulado' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setConfirmAction({ type: 'restaurar', id: c.id })
                                }
                                disabled={loading}
                                title="Restaurar cobro anulado a pendiente"
                              >
                                <RotateCcw size={14} />
                                Restaurar
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {meta && (
                <TablePagination
                  page={meta.page}
                  pages={meta.pages}
                  total={meta.total}
                  itemsPerPage={itemsPerPage}
                  onPageChange={goToPage}
                  disabled={loading || listLoading}
                />
              )}
            </>
          )}
        </>
      )}

      <CobroFormSheet
        open={modalOpen}
        onClose={closeModal}
        onSubmit={guardarCobro}
        loading={loading}
        submittingEstado={submittingEstado}
        creationEstadoActions
        title="Nuevo cobro"
        values={nuevoCobro}
        nombreMascotaVisible={nombreMascotaVisible}
        profesionales={profesionales}
        agendas={agendas}
        tarifas={tarifas}
        onProfesionalChange={handleProfesionalChange}
        onAgendaChange={handleAgendaChange}
        onTarifasChange={handleTarifasChange}
        onFieldChange={setNuevoCobro}
      />

      <CobroFormSheet
        open={editOpen && !!editForm}
        onClose={closeEditModal}
        onSubmit={guardarEdicion}
        loading={loading}
        editMode
        title={editForm?.id ? `Editar cobro #${editForm.id}` : 'Editar cobro'}
        values={
          editForm || {
            id_profesional: '',
            id_agenda: '',
            id_mascota: '',
            id_tarifas: [],
            valor: '',
            metodo_pago: '',
            observacion: '',
            fecha_cobro: hoyLocalISO(),
          }
        }
        nombreMascotaVisible={editMascotaNombre}
        tarifas={editTarifas}
        onTarifasChange={handleEditTarifasChange}
        onFieldChange={setEditForm}
      />

      <ConfirmSheet
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={confirmarAccionCobro}
        title={
          confirmAction?.type === 'restaurar'
            ? 'Confirmar restauración'
            : confirmAction?.type === 'devolver'
              ? 'Confirmar devolución de pago'
              : 'Confirmar anulación'
        }
        confirmLabel={
          confirmAction?.type === 'restaurar'
            ? 'Restaurar'
            : confirmAction?.type === 'devolver'
              ? 'Devolver pago'
              : 'Anular'
        }
        loading={loading}
        danger={confirmAction?.type === 'anular'}
      >
        {confirmAction?.type === 'restaurar' ? (
          <>
            ¿Restaurar el cobro <b>#{confirmAction?.id}</b> a estado pendiente? La cita
            volverá a quedar marcada como cobrada.
          </>
        ) : confirmAction?.type === 'devolver' ? (
          <>
            ¿Devolver el pago del cobro <b>#{confirmAction?.id}</b>? Pasará a pendiente y
            podrás volver a marcarlo como pagado. La cita seguirá asociada a este cobro.
          </>
        ) : confirmAction?.estado === 'pagado' ? (
          <>
            ¿Anular el cobro pagado <b>#{confirmAction?.id}</b>? Se liberará el cobro de la
            cita. Si el horario ya se reutilizó con otra cita, la original permanece
            archivada (Mascota lista) y no vuelve a ocupar el cupo.
          </>
        ) : (
          <>
            ¿Anular el cobro <b>#{confirmAction?.id}</b>? La cita quedará disponible para un
            nuevo cobro (si el cupo no está ocupado).
          </>
        )}
      </ConfirmSheet>

      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

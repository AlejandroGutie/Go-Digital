import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Banknote, Plus, Search, X } from 'lucide-react';
import { listCobros, createCobro, updateCobro, deleteCobro } from '../api/cobrosApi';
import { listProfesionales } from '../api/profesionalesApi';
import { listTarifas } from '../api/tarifasApi';
import { getAgendaDeProfesional } from '../api/agendasApi';
import { normalizeListPayload, normalizeMeta } from '../api/normalize';
import { useToast } from '../hooks/useToast';
import { useMutationLock } from '../hooks/useMutationLock';
import { Toast } from '../components/Toast';
import { formatFecha, hoyLocalISO, formatMoneda, rangoFechasInvalido } from '../utils/format';
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
import '../index.css';

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
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'anular'|'eliminar', id }

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
        const res = await listProfesionales(1, 100);
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
        setAgendas(normalizeListPayload(resAg));
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
      setNuevoCobro((prev) => ({
        ...prev,
        id_agenda,
        id_mascota: agenda.id_mascota,
      }));
      setNombreMascotaVisible(agenda.mascota_nombre);
    }
  };

  const handleTarifaChange = (id_tarifa) => {
    const tarifa = tarifas.find((t) => String(t.id) === String(id_tarifa));
    setNuevoCobro((prev) => ({
      ...prev,
      id_tarifa,
      valor: tarifa ? tarifa.valor : '',
    }));
  };

  const guardarCobro = async () => {
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
    if (!nuevoCobro.id_tarifa) {
      addToast('Selecciona una tarifa', 'error');
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
    setLoading(true);
    try {
      const res = await createCobro(nuevoCobro);
      if (res?.status === 'ok') {
        addToast('Cobro creado exitosamente', 'success');
        setModalOpen(false);
        setNuevoCobro({
          id_profesional: '',
          id_agenda: '',
          id_mascota: '',
          id_tarifa: '',
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

  const eliminarCobro = async (id) => {
    if (!tryLock()) return;
    setLoading(true);
    try {
      const res = await deleteCobro(id);
      if (res?.status === 'ok') {
        addToast('Cobro eliminado', 'success');
        setConfirmAction(null);
        await recargarTrasMutacion();
      } else {
        addToast(res?.message || 'Error al eliminar', 'error');
      }
    } catch (e) {
      addToast(e?.message || 'Error al eliminar cobro', 'error');
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
    if (confirmAction.type === 'eliminar') {
      await eliminarCobro(confirmAction.id);
    }
  };

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
          <div className="ui-card" style={{ marginBottom: 16 }}>
            <div className="fields-row fields-row--end">
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
              {hayFiltros && (
                <div className="fields-row__action">
                  <Button variant="ghost" onClick={limpiarFiltros}>
                    Limpiar
                  </Button>
                </div>
              )}
              {hayFiltros && meta != null && (
                <span className="ui-toolbar__meta fields-row__meta">
                  {meta.total} resultado{meta.total !== 1 ? 's' : ''}
                </span>
              )}
            </div>
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
                <table className="ui-table">
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
                                  onClick={() => cambiarEstado(c.id, 'pagado')}
                                  disabled={loading}
                                >
                                  Pagar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setConfirmAction({ type: 'anular', id: c.id })}
                                  disabled={loading}
                                >
                                  Anular
                                </Button>
                              </>
                            )}
                            {c.estado === 'anulado' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setConfirmAction({ type: 'eliminar', id: c.id })}
                                disabled={loading}
                              >
                                Eliminar
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
        title="Nuevo cobro"
        values={nuevoCobro}
        nombreMascotaVisible={nombreMascotaVisible}
        profesionales={profesionales}
        agendas={agendas}
        tarifas={tarifas}
        onProfesionalChange={handleProfesionalChange}
        onAgendaChange={handleAgendaChange}
        onTarifaChange={handleTarifaChange}
        onFieldChange={setNuevoCobro}
      />

      <ConfirmSheet
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={confirmarAccionCobro}
        title={confirmAction?.type === 'eliminar' ? 'Confirmar eliminación' : 'Confirmar anulación'}
        confirmLabel={confirmAction?.type === 'eliminar' ? 'Eliminar' : 'Anular'}
        loading={loading}
        danger
      >
        {confirmAction?.type === 'eliminar'
          ? <>¿Eliminar el cobro <b>#{confirmAction?.id}</b>? Esta acción no se puede deshacer.</>
          : <>¿Anular el cobro <b>#{confirmAction?.id}</b>?</>}
      </ConfirmSheet>

      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

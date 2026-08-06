import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Banknote, Plus } from 'lucide-react';
import { listCobros, createCobro, updateCobro, deleteCobro } from '../api/cobrosApi';
import { listProfesionales } from '../api/profesionalesApi';
import { listTarifas } from '../api/tarifasApi';
import { getAgendaDeProfesional } from '../api/agendasApi';
import { normalizeListPayload, normalizeMeta } from '../api/normalize';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import { formatFecha, hoyLocalISO } from '../utils/format';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import Field, { DateInput, Input, Select, Textarea } from '../components/ui/Field';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';
import Sheet from '../components/ui/Sheet';
import '../index.css';

const EMPTY_FILTROS = { estado: '', id_profesional: '', fecha_desde: '', fecha_hasta: '' };
const PAGE_SIZE = 20;

const formatMoneda = (valor) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor);

function filtrosActivos(f) {
  return !!(f.estado || f.id_profesional || f.fecha_desde || f.fecha_hasta);
}

function buildCobrosParams(p, f) {
  const params = { page: p, limit: PAGE_SIZE };
  if (f.estado) params.estado = f.estado;
  if (f.id_profesional) params.id_profesional = f.id_profesional;
  if (f.fecha_desde) params.fecha_desde = f.fecha_desde;
  if (f.fecha_hasta) params.fecha_hasta = f.fecha_hasta;
  return params;
}

export default function CobrosPage() {
  const [cobros, setCobros] = useState([]);
  const [profesionales, setProfesionales] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [filtros, setFiltros] = useState(EMPTY_FILTROS);
  const [listLoading, setListLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

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

  const pageRef = useRef(page);
  const skipPageEffect = useRef(false);
  const fetchIdRef = useRef(0);
  const buscadorProfFiltroRef = useRef(null);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  async function refresh(p = page, f = filtros) {
    const fetchId = ++fetchIdRef.current;
    setListLoading(true);
    setLoadError(null);
    try {
      const res = await listCobros(buildCobrosParams(p, f));
      if (fetchId !== fetchIdRef.current) return;
      if (res?.status === 'error') throw new Error(res.message || 'Error al cargar cobros');
      setCobros(normalizeListPayload(res));
      setMeta(normalizeMeta(res, p, PAGE_SIZE));
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
    const timer = setTimeout(() => {
      refresh(1, filtros);
      if (pageRef.current !== 1) {
        skipPageEffect.current = true;
      }
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [filtros.estado, filtros.id_profesional, filtros.fecha_desde, filtros.fecha_hasta]);

  useEffect(() => {
    if (skipPageEffect.current) {
      skipPageEffect.current = false;
      return;
    }
    refresh(page, filtros);
  }, [page]);

  function goToPage(p) {
    setPage(p);
  }

  function limpiarFiltros() {
    setFiltros(EMPTY_FILTROS);
    setBusquedaProfFiltro('');
    setListaProfFiltroAbierta(false);
  }

  async function recargarTrasMutacion() {
    setFiltros(EMPTY_FILTROS);
    setBusquedaProfFiltro('');
    setListaProfFiltroAbierta(false);
    setPage(1);
    await refresh(1, EMPTY_FILTROS);
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
    setNuevoCobro({ ...nuevoCobro, id_profesional, id_agenda: '', id_mascota: '', id_tarifa: '', valor: '' });
    setNombreMascotaVisible('');
    if (id_profesional) {
      try {
        const [resAg, resT] = await Promise.all([
          getAgendaDeProfesional(id_profesional),
          listTarifas(id_profesional),
        ]);
        setAgendas(normalizeListPayload(resAg));
        setTarifas(normalizeListPayload(resT));
      } catch (e) {
        addToast(e?.message || 'Error al cargar agendas y tarifas', 'error');
      }
    } else {
      setAgendas([]);
      setTarifas([]);
    }
  };

  const handleAgendaChange = (id_agenda) => {
    const agenda = agendas.find((a) => a.id == id_agenda);
    if (agenda) {
      setNuevoCobro({ ...nuevoCobro, id_agenda, id_mascota: agenda.id_mascota });
      setNombreMascotaVisible(agenda.mascota_nombre);
    }
  };

  const handleTarifaChange = (id_tarifa) => {
    const tarifa = tarifas.find((t) => t.id == id_tarifa);
    setNuevoCobro({ ...nuevoCobro, id_tarifa, valor: tarifa ? tarifa.valor : '' });
  };

  const guardarCobro = async () => {
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
    }
  };

  const cambiarEstado = async (id, nuevoEstado) => {
    setLoading(true);
    try {
      const res = await updateCobro(id, { estado: nuevoEstado });
      if (res?.status === 'ok') {
        addToast(`Cobro ${nuevoEstado}`, 'success');
        await refresh(page, filtros);
      } else {
        addToast(res?.message || 'Error al actualizar', 'error');
      }
    } catch (e) {
      addToast(e?.message || 'Error al actualizar cobro', 'error');
    } finally {
      setLoading(false);
    }
  };

  const eliminarCobro = async (id) => {
    if (!confirm('¿Estás seguro de eliminar este cobro?')) return;
    setLoading(true);
    try {
      const res = await deleteCobro(id);
      if (res?.status === 'ok') {
        addToast('Cobro eliminado', 'success');
        await recargarTrasMutacion();
      } else {
        addToast(res?.message || 'Error al eliminar', 'error');
      }
    } catch (e) {
      addToast(e?.message || 'Error al eliminar cobro', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getBadgeStyle = (estado) => {
    if (estado === 'pagado') return { backgroundColor: 'var(--color-entorno)', color: 'var(--color-white)' };
    if (estado === 'anulado') return { backgroundColor: 'var(--color-entorno)', color: 'var(--color-black)' };
    return { backgroundColor: 'var(--color-entorno)', color: 'var(--color-yellow)' };
  };

  const hayFiltros = filtrosActivos(filtros);

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
                />
              </Field>
              <Field label="Hasta">
                <DateInput
                  value={filtros.fecha_hasta}
                  onChange={(e) => setFiltros({ ...filtros, fecha_hasta: e.target.value })}
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
          </div>

          {(meta?.total ?? cobros.length) === 0 ? (
            <EmptyState
              icon={<Banknote size={24} />}
              title={hayFiltros ? 'Sin resultados con los filtros aplicados' : 'No hay cobros registrados'}
              description={
                hayFiltros
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
                            {c.estado.toUpperCase()}
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
                                  onClick={() => cambiarEstado(c.id, 'anulado')}
                                  disabled={loading}
                                >
                                  Anular
                                </Button>
                              </>
                            )}
                            {c.estado === 'anulado' && (
                              <Button size="sm" variant="ghost" onClick={() => eliminarCobro(c.id)} disabled={loading}>
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

              {meta && meta.pages > 1 && (
                <div className="ui-pagination">
                  <Button variant="ghost" size="sm" onClick={() => goToPage(page - 1)} disabled={page === 1 || loading}>
                    Anterior
                  </Button>
                  <span className="ui-pagination__label">
                    Página {meta.page} de {meta.pages} — {meta.total} registros
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => goToPage(page + 1)}
                    disabled={page >= meta.pages || loading}
                  >
                    Siguiente
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      <Sheet
        open={modalOpen}
        onClose={closeModal}
        title="Nuevo cobro"
        dismissible={!loading}
        footer={
          <div className="ui-btn-row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={closeModal} disabled={loading}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={guardarCobro} disabled={loading}>
              {loading ? 'Procesando…' : 'Guardar'}
            </Button>
          </div>
        }
      >
        <div className="ui-form">
          <Field label="Profesional">
            <Select
              value={nuevoCobro.id_profesional}
              onChange={(e) => handleProfesionalChange(e.target.value)}
              disabled={loading}
            >
              <option value="">Seleccionar profesional</option>
              {profesionales.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Agenda">
            <Select
              value={nuevoCobro.id_agenda}
              onChange={(e) => handleAgendaChange(e.target.value)}
              disabled={loading || !nuevoCobro.id_profesional}
            >
              <option value="">Seleccionar agenda</option>
              {agendas.map((a) => (
                <option key={a.id} value={a.id}>{`${formatFecha(a.fecha)} — ${a.mascota_nombre}`}</option>
              ))}
            </Select>
          </Field>
          <Field label="Mascota">
            <Input type="text" value={nombreMascotaVisible} readOnly placeholder="Mascota (se autocompleta)" />
          </Field>
          <Field label="Tarifa">
            <Select
              value={nuevoCobro.id_tarifa}
              onChange={(e) => handleTarifaChange(e.target.value)}
              disabled={loading || !nuevoCobro.id_profesional}
            >
              <option value="">Seleccionar tarifa</option>
              {tarifas.map((t) => (
                <option key={t.id} value={t.id}>{`${t.descripcion} — ${formatMoneda(t.valor)}`}</option>
              ))}
            </Select>
          </Field>
          <Field label="Valor">
            <Input
              type="number"
              value={nuevoCobro.valor}
              onChange={(e) => setNuevoCobro({ ...nuevoCobro, valor: e.target.value })}
              placeholder="Valor"
              disabled={loading}
            />
          </Field>
          <Field label="Método de pago">
            <Select
              value={nuevoCobro.metodo_pago}
              onChange={(e) => setNuevoCobro({ ...nuevoCobro, metodo_pago: e.target.value })}
              disabled={loading}
            >
              <option value="">Método de pago</option>
              <option value="Efectivo">Efectivo</option>
              <option value="Transferencia">Transferencia</option>
              <option value="Tarjeta">Tarjeta</option>
            </Select>
          </Field>
          <Field label="Observación">
            <Textarea
              value={nuevoCobro.observacion}
              onChange={(e) => setNuevoCobro({ ...nuevoCobro, observacion: e.target.value })}
              placeholder="Observación (opcional)"
              disabled={loading}
            />
          </Field>
          <Field label="Fecha de cobro">
            <DateInput
              value={nuevoCobro.fecha_cobro}
              onChange={(e) => setNuevoCobro({ ...nuevoCobro, fecha_cobro: e.target.value })}
              disabled={loading}
            />
          </Field>
        </div>
      </Sheet>

      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

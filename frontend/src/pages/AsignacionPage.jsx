import { useEffect, useMemo, useState, useRef } from 'react';
import { AlertTriangle, PawPrint, Search, User, UserX, X } from 'lucide-react';
import { listCuidadores, getMascotasDeCuidador, asignarMascota, desasignarMascota } from '../api/cuidadoresApi';
import { listMascotas } from '../api/mascotasApi';
import { normalizeListPayload } from '../api/normalize';
import { useToast } from '../hooks/useToast';
import { useMutationLock } from '../hooks/useMutationLock';
import { useClientTablePagination } from '../hooks/useClientTablePagination';
import { Toast } from '../components/Toast';
import { formatFecha } from '../utils/format';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import Field, { Input } from '../components/ui/Field';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';
import ConfirmSheet from '../components/ui/ConfirmSheet';
import TablePagination, { PageSizeSelect } from '../components/ui/TablePagination';
import '../index.css';
import { TABLE_STICKY_COLS_2 } from '../lib/tableSticky';

const LIST_LIMIT = 500;

export default function AsignacionPage() {
  const [cuidadores, setCuidadores] = useState([]);
  const [mascotasDisp, setMascotasDisp] = useState([]);
  const [cuidadorSel, setCuidadorSel] = useState(null);
  const [mascotasSel, setMascotasSel] = useState([]);
  const [mascotaIdAsignar, setMascotaIdAsignar] = useState('');
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError] = useState(null);
  const [busquedaCuidador, setBusquedaCuidador] = useState('');
  const [listaAbierta, setListaAbierta] = useState(false);
  const [busquedaMascota, setBusquedaMascota] = useState('');
  const [listaMascotasAbierta, setListaMascotasAbierta] = useState(false);
  const [filtroTabla, setFiltroTabla] = useState('');
  const [desasignarModalId, setDesasignarModalId] = useState(null);
  const { toasts, addToast, removeToast } = useToast();
  const { tryLock, unlock } = useMutationLock();
  const buscadorRef = useRef(null);
  const buscadorMascotaRef = useRef(null);
  const mascotaSearchReq = useRef(0);
  const cuidadorSearchReq = useRef(0);

  async function cargarMascotas(search = '') {
    const reqId = ++mascotaSearchReq.current;
    const res = await listMascotas(1, LIST_LIMIT, search);
    if (reqId !== mascotaSearchReq.current) return;
    setMascotasDisp(normalizeListPayload(res));
  }

  async function cargarCuidadores(search = '') {
    const reqId = ++cuidadorSearchReq.current;
    const res = await listCuidadores(1, LIST_LIMIT, search);
    if (reqId !== cuidadorSearchReq.current) return;
    setCuidadores(normalizeListPayload(res));
  }

  useEffect(() => {
    async function init() {
      setInitLoading(true);
      setInitError(null);
      try {
        const [resCuidadores, resMascotas] = await Promise.all([
          listCuidadores(1, LIST_LIMIT),
          listMascotas(1, LIST_LIMIT),
        ]);
        setCuidadores(normalizeListPayload(resCuidadores));
        setMascotasDisp(normalizeListPayload(resMascotas));
      } catch (e) {
        const msg =
          e?.message ||
          'No se pudieron cargar cuidadores o mascotas (sesión, red o permisos de base de datos).';
        setInitError(msg);
        addToast(msg, 'error');
      } finally {
        setInitLoading(false);
      }
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handleClickOutside(e) {
      if (buscadorRef.current && !buscadorRef.current.contains(e.target)) {
        setListaAbierta(false);
      }
      if (buscadorMascotaRef.current && !buscadorMascotaRef.current.contains(e.target)) {
        setListaMascotasAbierta(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Actualiza cuidadores al buscar (incluye recién creados)
  useEffect(() => {
    if (cuidadorSel) return undefined;
    const q = busquedaCuidador.trim();
    const timer = setTimeout(() => {
      cargarCuidadores(q).catch((e) => {
        addToast(e?.message || 'No se pudo actualizar el listado de cuidadores', 'error');
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [busquedaCuidador, cuidadorSel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Actualiza el listado de mascotas al buscar (incluye recién creadas)
  useEffect(() => {
    if (!cuidadorSel || mascotaIdAsignar) return undefined;
    const q = busquedaMascota.trim();
    const timer = setTimeout(() => {
      cargarMascotas(q).catch((e) => {
        addToast(e?.message || 'No se pudo actualizar el listado de mascotas', 'error');
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [busquedaMascota, cuidadorSel, mascotaIdAsignar]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listados filtrados en servidor; en cliente solo se excluyen las ya asignadas.
  const cuidadoresFiltrados = cuidadores;

  function limpiarMascotaAsignar() {
    setMascotaIdAsignar('');
    setBusquedaMascota('');
    setListaMascotasAbierta(false);
  }

  async function seleccionarCuidador(c) {
    setCuidadorSel(c);
    setBusquedaCuidador(c.nombre || '');
    setListaAbierta(false);
    setFiltroTabla('');
    limpiarMascotaAsignar();
    try {
      const [resAsignadas] = await Promise.all([
        getMascotasDeCuidador(c.id),
        cargarMascotas(''),
      ]);
      setMascotasSel(normalizeListPayload(resAsignadas));
    } catch (e) {
      addToast(e?.message || 'Error al cargar mascotas del cuidador', 'error');
    }
  }

  function limpiarSeleccion() {
    setCuidadorSel(null);
    setBusquedaCuidador('');
    setMascotasSel([]);
    setFiltroTabla('');
    limpiarMascotaAsignar();
    setListaAbierta(false);
  }

  function seleccionarMascota(m) {
    setMascotaIdAsignar(String(m.id));
    setBusquedaMascota(m.nombre || '');
    setListaMascotasAbierta(false);
  }

  const mascotasNoAsignadas = mascotasDisp.filter(
    (m) => !mascotasSel.some((ms) => ms.id === m.id)
  );

  const mascotasFiltradas = mascotasNoAsignadas;

  const mascotasSelFiltradas = useMemo(() => {
    const q = filtroTabla.trim().toLowerCase();
    if (!q) return mascotasSel;
    return mascotasSel.filter((m) => {
      const haystack = [
        m.id,
        m.nombre,
        m.especie,
        m.raza,
        m.tamano,
        formatFecha(m.fecha_inicio),
        m.activo ? 'activo' : 'inactivo',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [mascotasSel, filtroTabla]);

  const {
    pageRows: asignadasPageRows,
    page: asignadasPage,
    pages: asignadasPages,
    total: asignadasTotal,
    itemsPerPage: asignadasPerPage,
    handlePageSizeChange: handleAsignadasPageSize,
    goToPage: goToAsignadasPage,
  } = useClientTablePagination(
    mascotasSelFiltradas,
    `${cuidadorSel?.id || ''}|${filtroTabla.trim()}`
  );

  async function handleAsignar() {
    if (!mascotaIdAsignar) return;
    if (!tryLock()) return;
    setLoading(true);
    try {
      await asignarMascota(cuidadorSel.id, Number(mascotaIdAsignar));
      addToast('Mascota asignada correctamente', 'success');
      limpiarMascotaAsignar();
      const res = await getMascotasDeCuidador(cuidadorSel.id);
      setMascotasSel(normalizeListPayload(res));
      await cargarMascotas('');
    } catch (e) {
      addToast(e?.message || 'Error al asignar mascota', 'error');
    } finally {
      setLoading(false);
      unlock();
    }
  }

  async function confirmDesasignar() {
    if (desasignarModalId == null || !cuidadorSel?.id) return;
    if (!tryLock()) return;
    const idMascota = desasignarModalId;
    setLoading(true);
    try {
      await desasignarMascota(cuidadorSel.id, idMascota);
      addToast('Mascota desasignada correctamente', 'success');
      setMascotasSel((prev) => prev.filter((m) => m.id !== idMascota));
      setDesasignarModalId(null);
      await cargarMascotas(busquedaMascota.trim());
    } catch (e) {
      addToast(e?.message || 'Error al desasignar mascota', 'error');
    } finally {
      setLoading(false);
      unlock();
    }
  }

  async function abrirListaMascotas() {
    setListaMascotasAbierta(true);
    if (mascotaIdAsignar) return;
    try {
      await cargarMascotas(busquedaMascota.trim());
    } catch (e) {
      addToast(e?.message || 'No se pudo actualizar el listado de mascotas', 'error');
    }
  }

  async function abrirListaCuidadores() {
    setListaAbierta(true);
    if (cuidadorSel) return;
    try {
      await cargarCuidadores(busquedaCuidador.trim());
    } catch (e) {
      addToast(e?.message || 'No se pudo actualizar el listado de cuidadores', 'error');
    }
  }

  return (
    <div className="ui-page">
      <PageHeader
        title="Asignación de mascotas"
        subtitle="Busca y selecciona un cuidador para ver y gestionar sus mascotas asignadas."
      />

      {initLoading ? (
        <Skeleton rows={5} />
      ) : initError ? (
        <EmptyState
          icon={<AlertTriangle size={24} />}
          title="No se pudo cargar la información"
          description={initError}
        />
      ) : (
        <div className="ui-split">
          <div className="ui-card">
            <Field id="buscador-cuidador" label="Cuidador">
              <div ref={buscadorRef} className="ui-combo">
                <div className="ui-btn-row">
                  <Input
                    id="buscador-cuidador"
                    type="text"
                    role="combobox"
                    aria-expanded={listaAbierta}
                    aria-controls="lista-cuidadores"
                    aria-autocomplete="list"
                    placeholder="Buscar por nombre, teléfono o email…"
                    value={busquedaCuidador}
                    disabled={loading}
                    onChange={(e) => {
                      setBusquedaCuidador(e.target.value);
                      setListaAbierta(true);
                      if (cuidadorSel && e.target.value !== cuidadorSel.nombre) {
                        setCuidadorSel(null);
                        setMascotasSel([]);
                        limpiarMascotaAsignar();
                      }
                    }}
                    onFocus={() => {
                      void abrirListaCuidadores();
                    }}
                  />
                  {(cuidadorSel || busquedaCuidador) && (
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
                  <ul id="lista-cuidadores" role="listbox" className="ui-combo__list">
                    {cuidadoresFiltrados.length === 0 ? (
                      <li className="ui-combo__item" style={{ cursor: 'default', color: 'var(--color-purple-light)' }}>
                        {busquedaCuidador.trim()
                          ? `Sin resultados para “${busquedaCuidador.trim()}”`
                          : 'No hay cuidadores registrados'}
                      </li>
                    ) : (
                      cuidadoresFiltrados.map((c) => (
                        <li key={c.id} role="option" aria-selected={cuidadorSel?.id === c.id}>
                          <button
                            type="button"
                            className={`ui-combo__item${cuidadorSel?.id === c.id ? ' ui-combo__item--active' : ''}`}
                            onClick={() => seleccionarCuidador(c)}
                          >
                            <div>{c.nombre}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-purple-light)', fontWeight: 400 }}>
                              {[c.telefono, c.email].filter(Boolean).join(' · ') || 'Sin contacto'}
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

          <div className="ui-card">
            {!cuidadorSel ? (
              <EmptyState
                icon={<User size={24} />}
                title="Selecciona un cuidador"
                description="Busca y selecciona un cuidador para gestionar sus mascotas"
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
                    <div style={{ fontSize: '1rem', fontWeight: 600 }}>{cuidadorSel.nombre}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-purple-light)' }}>
                      {cuidadorSel.telefono}
                    </div>
                  </div>
                  <span className="ui-badge" style={{ background: 'var(--color-entorno)', color: 'var(--color-black)' }}>
                    {mascotasSel.length} mascota{mascotasSel.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {mascotasNoAsignadas.length > 0 ? (
                  <div style={{ marginBottom: 20 }}>
                    <label className="ui-field__label" htmlFor="buscador-mascota">
                      Asignar mascota
                    </label>
                    <div
                      className="ui-btn-row"
                      style={{
                        marginTop: 6,
                        alignItems: 'center',
                        flexWrap: 'nowrap',
                      }}
                    >
                      <div ref={buscadorMascotaRef} className="ui-combo" style={{ flex: 1, minWidth: 0 }}>
                        <Input
                          id="buscador-mascota"
                          type="text"
                          role="combobox"
                          aria-expanded={listaMascotasAbierta}
                          aria-controls="lista-mascotas-asignar"
                          aria-autocomplete="list"
                          placeholder="Buscar por nombre, raza, especie o tamaño…"
                          value={busquedaMascota}
                          disabled={loading}
                          onChange={(e) => {
                            const value = e.target.value;
                            setBusquedaMascota(value);
                            setListaMascotasAbierta(true);
                            if (mascotaIdAsignar) {
                              const selected = mascotasNoAsignadas.find(
                                (m) => String(m.id) === String(mascotaIdAsignar)
                              );
                              if (!selected || value !== (selected.nombre || '')) {
                                setMascotaIdAsignar('');
                              }
                            }
                          }}
                          onFocus={() => {
                            void abrirListaMascotas();
                          }}
                        />

                        {listaMascotasAbierta && (
                          <ul
                            id="lista-mascotas-asignar"
                            role="listbox"
                            className="ui-combo__list"
                          >
                            {mascotasFiltradas.length === 0 ? (
                              <li
                                className="ui-combo__item"
                                style={{ cursor: 'default', color: 'var(--color-purple-light)' }}
                              >
                                No se encontraron mascotas
                              </li>
                            ) : (
                              mascotasFiltradas.map((m) => (
                                <li
                                  key={m.id}
                                  role="option"
                                  aria-selected={String(mascotaIdAsignar) === String(m.id)}
                                >
                                  <button
                                    type="button"
                                    className={`ui-combo__item${
                                      String(mascotaIdAsignar) === String(m.id)
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
                                      {[m.especie, m.raza, m.tamano].filter(Boolean).join(' · ')}
                                    </div>
                                  </button>
                                </li>
                              ))
                            )}
                          </ul>
                        )}
                      </div>
                      <Button
                        variant="primary"
                        onClick={handleAsignar}
                        disabled={loading || !mascotaIdAsignar}
                        style={{ flexShrink: 0, alignSelf: 'center' }}
                      >
                        {loading ? '…' : 'Asignar'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="ui-banner ui-banner--warn" style={{ marginBottom: 20 }}>
                    {busquedaMascota.trim()
                      ? 'No hay mascotas disponibles con esa búsqueda para asignar a este cuidador.'
                      : 'No hay mascotas disponibles para asignar en el listado actual. Usa la búsqueda por nombre si necesitas encontrar otra.'}
                  </div>
                )}

                {mascotasSel.length === 0 ? (
                  <EmptyState
                    icon={<PawPrint size={24} />}
                    title="Sin mascotas asignadas"
                    description="Usa el selector de arriba para asignar una mascota a este cuidador"
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
                          placeholder="Buscar mascota asignada por nombre, especie, raza…"
                          value={filtroTabla}
                          onChange={(e) => setFiltroTabla(e.target.value)}
                          style={{ paddingLeft: 40 }}
                          aria-label="Buscar en mascotas asignadas"
                        />
                      </div>
                      {filtroTabla && (
                        <Button variant="ghost" size="sm" onClick={() => setFiltroTabla('')}>
                          <X size={16} />
                          Limpiar
                        </Button>
                      )}
                      <PageSizeSelect
                        value={asignadasPerPage}
                        onChange={handleAsignadasPageSize}
                        disabled={loading}
                      />
                      {filtroTabla.trim() && (
                        <span className="ui-toolbar__meta">
                          {asignadasTotal} resultado{asignadasTotal !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {asignadasTotal === 0 ? (
                      <EmptyState
                        icon={<PawPrint size={24} />}
                        title={`Sin resultados para "${filtroTabla.trim()}"`}
                        description="La búsqueda aplica a todas las mascotas asignadas a este cuidador"
                      />
                    ) : (
                      <>
                        <div className="ui-table-wrap table-scroll">
                          <table className={TABLE_STICKY_COLS_2}>
                            <thead>
                              <tr>
                                {['ID', 'Nombre', 'Especie', 'Raza', 'Tamaño', 'Desde', 'Activo', ''].map(
                                  (h) => (
                                    <th key={h || 'acciones'}>{h}</th>
                                  )
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {asignadasPageRows.map((m) => (
                                <tr key={m.id}>
                                  <td className="ui-num">{m.id}</td>
                                  <td>{m.nombre}</td>
                                  <td>{m.especie || '—'}</td>
                                  <td>{m.raza}</td>
                                  <td>{m.tamano}</td>
                                  <td style={{ color: 'var(--color-purple-light)' }}>
                                    {formatFecha(m.fecha_inicio)}
                                  </td>
                                  <td>
                                    <span
                                      className="ui-badge"
                                      style={{
                                        background: m.activo
                                          ? 'var(--color-entorno)'
                                          : 'var(--color-purple-light)',
                                        color: 'var(--color-white)',
                                      }}
                                    >
                                      {m.activo ? 'Activo' : 'Inactivo'}
                                    </span>
                                  </td>
                                  <td>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setDesasignarModalId(m.id)}
                                      disabled={loading}
                                    >
                                      <UserX size={14} />
                                      Quitar
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <TablePagination
                          page={asignadasPage}
                          pages={asignadasPages}
                          total={asignadasTotal}
                          itemsPerPage={asignadasPerPage}
                          onPageChange={goToAsignadasPage}
                          disabled={loading}
                        />
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmSheet
        open={desasignarModalId != null}
        onClose={() => setDesasignarModalId(null)}
        onConfirm={confirmDesasignar}
        title="Confirmar desasignación"
        confirmLabel="Quitar"
        loading={loading}
        danger
      >
        ¿Quitar la mascota <b>#{desasignarModalId}</b> de este cuidador?
      </ConfirmSheet>

      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

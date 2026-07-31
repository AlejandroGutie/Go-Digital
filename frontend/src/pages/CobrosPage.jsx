import { useState, useEffect, useRef } from 'react';
import { listCobros, createCobro, updateCobro, deleteCobro } from '../api/cobrosApi';
import { listProfesionales } from '../api/profesionalesApi';
import { listTarifas } from '../api/tarifasApi';
import { getAgendaDeProfesional } from '../api/agendasApi';
import { normalizeListPayload, normalizeMeta } from '../api/normalize';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import { formatFecha, hoyLocalISO } from '../utils/format';
import EmptyState from '../components/EmptyState';
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

  const pageRef = useRef(page);
  const skipPageEffect = useRef(false);
  const fetchIdRef = useRef(0);

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
  }

  async function recargarTrasMutacion() {
    setFiltros(EMPTY_FILTROS);
    setPage(1);
    await refresh(1, EMPTY_FILTROS);
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
          id_profesional: '', id_agenda: '', id_mascota: '', id_tarifa: '',
          valor: '', metodo_pago: '', observacion: '',
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
    return { backgroundColor: 'var(--color-entorno)', color: 'var(--color-yellow)'};
  };

  const hayFiltros = filtrosActivos(filtros);

  return (
    <div style={{ fontFamily: 'var(--font-fallback)', color: 'var(--color-black)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 className="font-display" style={{ fontSize: 22, fontWeight: 600, color: 'var(--color-entorno)', margin: 0 }}>Cobros</h1>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          disabled={loading}
          style={{background: 'none', color: 'var(--color-entorno)', border: '1px solid var(--color-entorno)', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
          Nuevo cobro
        </button>
      </div>

      <hr style={{ margin: '0 0 24px' }} />

      {listLoading ? (
        <p style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-purple-light)', fontSize: 14 }}>
          Cargando lista de cobros…
        </p>
      ) : loadError ? (
        <EmptyState icon="⚠️" title="No se pudo cargar la información" description={loadError} />
      ) : null}

      {!listLoading && !loadError && (
        <>
          <div
            className="fields-row"
            style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}
          >
            <select
              value={filtros.estado}
              onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-purple-light)', fontSize: 14, width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
              <option value="">Todos los estados</option>
              <option value="pendiente">Pendiente</option>
              <option value="pagado">Pagado</option>
              <option value="anulado">Anulado</option>
            </select>
            <select
              value={filtros.id_profesional}
              onChange={(e) => setFiltros({ ...filtros, id_profesional: e.target.value })}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-purple-light)', fontSize: 14, width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}
            >
              <option value="">Todos los profesionales</option>
              {profesionales.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
            <input
              type="date"
              value={filtros.fecha_desde}
              onChange={(e) => setFiltros({ ...filtros, fecha_desde: e.target.value })}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-purple-light)', fontSize: 14, width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}
            />
            <input
              type="date"
              value={filtros.fecha_hasta}
              onChange={(e) => setFiltros({ ...filtros, fecha_hasta: e.target.value })}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-purple-light)', fontSize: 14, width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}
            />
            {hayFiltros && (
              <button
                type="button"
                onClick={limpiarFiltros}
                style={{ fontSize: 13, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 6, padding: '7px 12px', cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}>
                Limpiar 
              </button>
            )}
            {hayFiltros && meta != null && (
              <span style={{ fontSize: 13, color: 'var(--color-entorno)' }}>
                {meta.total} resultado{meta.total !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {(meta?.total ?? cobros.length) === 0 ? (
            <EmptyState
              icon="💰"
              title={hayFiltros ? 'Sin resultados con los filtros aplicados' : 'No hay cobros registrados'}
              description={hayFiltros ? 'Ajusta los filtros o pulsa Limpiar para ver todos los cobros' : 'Usa el botón «Nuevo cobro» para registrar el primer cobro'}
            />
          ) : (
            <>
              <div className="table-scroll">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-fallback)' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-purple-light)', textAlign: 'left' }}>
                    {['ID', 'Mascota', 'Profesional', 'Fecha', 'Valor', 'Estado', 'Método', 'Acciones'].map((h) => (
                      <th key={h} style={{ padding: '8px 12px', fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cobros.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--color-purple-light)' }}>
                      <td style={{ padding: '8px 12px' }}>{c.id}</td>
                      <td style={{ padding: '8px 12px' }}>{c.mascota_nombre}</td>
                      <td style={{ padding: '8px 12px' }}>{c.profesional_nombre}</td>
                      <td style={{ padding: '8px 12px' }}>{formatFecha(c.fecha_cobro)}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{formatMoneda(c.valor)}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ ...getBadgeStyle(c.estado), padding: '4px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                          {c.estado.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px' }}>{c.metodo_pago || '—'}</td>
                      <td style={{ padding: '8px 12px', display: 'flex', gap: 8 }}>
                        {c.estado === 'pendiente' && (
                          <>
                            <button type="button" onClick={() => cambiarEstado(c.id, 'pagado')} disabled={loading}
                              style={{ fontSize: 12, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
                              Pagar</button>
                            <button type="button" onClick={() => cambiarEstado(c.id, 'anulado')} disabled={loading}
                              style={{ fontSize: 12, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
                              Anular</button>
                          </>
                        )}
                        {c.estado === 'anulado' && (
                          <button type="button" onClick={() => eliminarCobro(c.id)} disabled={loading}
                            style={{ fontSize: 12, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
                            Eliminar</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>

              {meta && meta.pages > 1 && (
                <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => goToPage(page - 1)}
                    disabled={page === 1 || loading}
                    style={{ background: 'none', padding: '6px 12px', borderRadius: 6, border: '1px solid var(--color-entorno)', cursor: page === 1 ? 'not-allowed' : 'pointer', color: 'var(--color-entorno)' }}>
                    Anterior
                  </button>
                  <span style={{ fontSize: 14, color: 'var(--color-entorno)'}}>Página {meta.page} de {meta.pages} — {meta.total} registros</span>
                  <button
                    type="button"
                    onClick={() => goToPage(page + 1)}
                    disabled={page >= meta.pages || loading}
                    style={{ background: 'none', padding: '6px 12px', borderRadius: 6, border: '1px solid var(--color-entorno)', cursor: page >= meta.pages ? 'not-allowed' : 'pointer', color: 'var(--color-entorno)' }}>
                    Siguiente
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {modalOpen && (
        <div
          onClick={() => !loading && setModalOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--color-white)', padding: 24, borderRadius: 8, width: 500, maxWidth: '90%', maxHeight: '80vh', overflowY: 'auto' }}
          >
            <h3 style={{ marginTop: 0, color: 'var(--color-entorno)'}}>Nuevo cobro</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <select
                value={nuevoCobro.id_profesional}
                onChange={(e) => handleProfesionalChange(e.target.value)}
                disabled={loading}
                style={{ padding: 8, borderRadius: 6, border: '1px solid var(--color-purple-light)' }}
              >
                <option value="">Seleccionar profesional</option>
                {profesionales.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
              <select
                value={nuevoCobro.id_agenda}
                onChange={(e) => handleAgendaChange(e.target.value)}
                disabled={loading || !nuevoCobro.id_profesional}
                style={{ padding: 8, borderRadius: 6, border: '1px solid var(--color-purple-light)' }}
              >
                <option value="">Seleccionar agenda</option>
                {agendas.map((a) => (
                  <option key={a.id} value={a.id}>{`${formatFecha(a.fecha)} — ${a.mascota_nombre}`}</option>
                ))}
              </select>
              <input
                type="text"
                value={nombreMascotaVisible}
                readOnly
                placeholder="Mascota (se autocompleta)"
                style={{ padding: 8, borderRadius: 6, border: '1px solid var(--color-purple-light)', background: 'var(--bg-main)' }}
              />
              <select
                value={nuevoCobro.id_tarifa}
                onChange={(e) => handleTarifaChange(e.target.value)}
                disabled={loading || !nuevoCobro.id_profesional}
                style={{ padding: 8, borderRadius: 6, border: '1px solid var(--color-purple-light)' }}
              >
                <option value="">Seleccionar tarifa</option>
                {tarifas.map((t) => (
                  <option key={t.id} value={t.id}>{`${t.descripcion} — ${formatMoneda(t.valor)}`}</option>
                ))}
              </select>
              <input
                type="number"
                value={nuevoCobro.valor}
                onChange={(e) => setNuevoCobro({ ...nuevoCobro, valor: e.target.value })}
                placeholder="Valor"
                disabled={loading}
                style={{ padding: 8, borderRadius: 6, border: '1px solid var(--color-purple-light)' }}
              />
              <select
                value={nuevoCobro.metodo_pago}
                onChange={(e) => setNuevoCobro({ ...nuevoCobro, metodo_pago: e.target.value })}
                disabled={loading}
                style={{ padding: 8, borderRadius: 6, border: '1px solid var(--color-purple-light)' }}
              >
                <option value="">Método de pago</option>
                <option value="Efectivo">Efectivo</option>
                <option value="Transferencia">Transferencia</option>
                <option value="Tarjeta">Tarjeta</option>
              </select>
              <textarea
                value={nuevoCobro.observacion}
                onChange={(e) => setNuevoCobro({ ...nuevoCobro, observacion: e.target.value })}
                placeholder="Observación (opcional)"
                disabled={loading}
                style={{ padding: 8, borderRadius: 6, border: '1px solid var(--color-purple-light)', minHeight: 60 }}
              />
              <input
                type="date"
                value={nuevoCobro.fecha_cobro}
                onChange={(e) => setNuevoCobro({ ...nuevoCobro, fecha_cobro: e.target.value })}
                disabled={loading}
                style={{ padding: 8, borderRadius: 6, border: '1px solid var(--color-purple-light)', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
              <button type="button" onClick={() => setModalOpen(false)} disabled={loading} style={{background: 'none', color: 'var(--color-entorno)', border: '1px solid var(--color-entorno)', borderRadius: 6}}>Cancelar</button>
              <button
                type="button"
                onClick={guardarCobro}
                disabled={loading}
                style={{background: 'none', color: 'var(--color-entorno)', border: '1px solid var(--color-entorno)', padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}>
                {loading ? 'Procesando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

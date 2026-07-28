import { useEffect, useState, useRef } from 'react';
import {
  listProfesionales,
  createProfesional,
  updateProfesional,
  deleteProfesional,
} from '../api/profesionalesApi';
import { normalizeListPayload, normalizeMeta } from '../api/normalize';
import { getAgendaDeProfesional } from '../api/agendasApi';
import { listTarifas, createTarifa, deleteTarifa } from '../api/tarifasApi'; // NUEVO: Importar APIs de tarifas
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import EmptyState from '../components/EmptyState';
import { formatFecha, formatHora } from '../utils/format';
import '../index.css';

const EMPTY_FORM = { nombre: '', telefono: '' };
const PAGE_SIZE = 20;

export default function ProfesionalesPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [profesionales, setProfesionales] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [filtro, setFiltro] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { toasts, addToast, removeToast } = useToast();
  const [inlineEditId, setInlineEditId] = useState(null);
  const [inlineDraft, setInlineDraft] = useState(EMPTY_FORM);
  const [deleteModalId, setDeleteModalId] = useState(null);
  const [agendaModal, setAgendaModal] = useState(null);
  const [tarifasModal, setTarifasModal] = useState(null); // NUEVO: Estado para el modal de tarifas
  const [nuevaTarifa, setNuevaTarifa] = useState({ descripcion: '', valor: '' });

  const pageRef = useRef(page);
  const skipPageEffect = useRef(false);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  async function refresh(p = page, search = filtro) {
    const fetchId = ++fetchIdRef.current;
    setListLoading(true);
    setLoadError(null);
    try {
      const res = await listProfesionales(p, PAGE_SIZE, search);
      if (fetchId !== fetchIdRef.current) return;
      setProfesionales(normalizeListPayload(res));
      setMeta(normalizeMeta(res, p, PAGE_SIZE));
    } catch (e) {
      if (fetchId !== fetchIdRef.current) return;
      const msg = e?.message || 'No se pudo cargar la lista (revisa la sesión o la conexión con el servidor).';
      setLoadError(msg);
      setProfesionales([]);
      setMeta(null);
      addToast(msg, 'error');
    } finally {
      if (fetchId === fetchIdRef.current) {
        setListLoading(false);
      }
    }
  }

  // Efecto para la búsqueda con Debounce (Al escribir)
  useEffect(() => {
    const timer = setTimeout(() => {
      refresh(1, filtro);
      if (pageRef.current !== 1) {
        skipPageEffect.current = true;
      }
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [filtro]);

  // Efecto para el cambio de página (Al usar paginación)
  useEffect(() => {
    if (skipPageEffect.current) {
      skipPageEffect.current = false;
      return;
    }
    refresh(page, filtro);
  }, [page]);

  // --- Lógica de Tarifas (NUEVO) ---
  async function abrirTarifas(p) {
    try {
      const res = await listTarifas(p.id);
      setTarifasModal({
        id: p.id,
        nombre: p.nombre,
        lista: res.data || []
      });
    } catch (e) {
      addToast('Error al cargar tarifas', 'error');
    }
  }

  async function handleAddTarifa() {
    if (!nuevaTarifa.descripcion || !nuevaTarifa.valor) return;
    setLoading(true);
    try {
      await createTarifa(tarifasModal.id, {
        descripcion: nuevaTarifa.descripcion,
        valor: parseFloat(nuevaTarifa.valor)
      });
      addToast('Tarifa agregada', 'success');
      setNuevaTarifa({ descripcion: '', valor: '' });
      // Recargar la lista del modal
      const res = await listTarifas(tarifasModal.id);
      setTarifasModal(prev => ({ ...prev, lista: res.data }));
    } catch (e) {
      addToast('Error al guardar tarifa', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteTarifa(tid) {
    if (!window.confirm('¿Eliminar esta tarifa?')) return;
    try {
      await deleteTarifa(tarifasModal.id, tid);
      const res = await listTarifas(tarifasModal.id);
      setTarifasModal(prev => ({ ...prev, lista: res.data }));
      addToast('Tarifa eliminada', 'success');
    } catch (e) {
      addToast('Error al eliminar', 'error');
    }
  }
  // --- Fin Lógica de Tarifas ---

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const nombre = form.nombre.trim();
      const telefono = form.telefono.trim();
      if (!nombre || !telefono) throw new Error('Nombre y teléfono son requeridos');
      await createProfesional({ nombre, telefono });
      addToast('Profesional guardado correctamente', 'success');
      setForm(EMPTY_FORM);
      setFiltro('');
      setPage(1);
      await refresh(1, '');
    } catch (e) {
      addToast(e?.message || 'Error al guardar', 'error');
    } finally {
      setLoading(false);
    }
  }

  function startEdit(p) {
    setInlineEditId(p.id);
    setInlineDraft({ nombre: p.nombre, telefono: p.telefono || '' });
  }

  function cancelEdit() {
    setInlineEditId(null);
    setInlineDraft(EMPTY_FORM);
  }

  async function saveEdit(id) {
    setLoading(true);
    try {
      const nombre = inlineDraft.nombre.trim();
      const telefono = inlineDraft.telefono.trim();
      if (!nombre || !telefono) throw new Error('Nombre y teléfono son requeridos');

      await updateProfesional(id, { nombre, telefono });
      addToast('Actualizado correctamente', 'success');
      cancelEdit();
      await refresh();
    } catch (e) {
      addToast(e?.message || 'Error al actualizar', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function confirmDelete() {
    setLoading(true);
    try {
      await deleteProfesional(deleteModalId);
      addToast('Profesional inactivado correctamente', 'success');
      if (inlineEditId === deleteModalId) cancelEdit();
      setDeleteModalId(null);
      setFiltro('');
      setPage(1);
      await refresh(1, '');
    } catch (e) {
      addToast(e?.message || 'Error al inactivar el profesional', 'error'); // ✅ era 'Error al eliminar'
    } finally {
      setLoading(false);
    }
  }

  async function verAgenda(p) {
    try {
      const res = await getAgendaDeProfesional(p.id);
      setAgendaModal({
        id: p.id,
        nombre: p.nombre,
        citas: normalizeListPayload(res),
      });
    } catch (e) {
      addToast('Error al cargar agenda', 'error');
    }
  }

  async function goToPage(p) {
    setPage(p);
  }

  return (
    <div>
      <h1 className="font-display" style={{ fontSize: 22, fontWeight: 600, marginBottom: 20, color: 'var(--color-entorno)' }}>Profesionales</h1>

      {/* Bloque de Edición Inline */}
      {inlineEditId && (
        <div style={{ padding: '10px 14px', background: 'var(--bg-highlight)', borderRadius: 6, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Editando profesional <b>#{inlineEditId}</b> — cancela para crear uno nuevo.</span>
          <button type="button" onClick={cancelEdit} disabled={loading} style={{ fontSize: 12, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>Cancelar</button>
        </div>
      )}

      {/* Formulario de creación */}
      <form onSubmit={onSubmit} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, maxWidth: 480 }}>
        <label htmlFor="pnombre">Nombre*</label>
        <input id="pnombre" type="text" value={form.nombre} required disabled={loading || !!inlineEditId} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} />
        <label htmlFor="ptelefono">Teléfono*</label>
        <input id="ptelefono" type="text" value={form.telefono} disabled={loading || !!inlineEditId} onChange={(e) => setForm((p) => ({ ...p, telefono: e.target.value }))} />
        <div style={{ gridColumn: '2' }}>
          <button type="submit" disabled={loading || !!inlineEditId} style={{ fontSize: 12, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
            {loading ? 'Procesando...' : 'Guardar'}
          </button>
        </div>
      </form>

      <hr style={{ margin: '24px 0' }} />

      {listLoading ? (
        <p style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-purple-light)', fontSize: 14 }}>
          Cargando lista de profesionales...
        </p>
      ) : loadError ? (
        <EmptyState
          icon="⚠️"
          title="No se pudo cargar la información"
          description={loadError}
        />
      ) : null}

      {!listLoading && !loadError && (
        <>
          {/* Buscador */}
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="text"
              placeholder="Buscar por nombre o teléfono..."
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-purple-light)', fontSize: 14, width: 280 }}
            />
            {filtro && (
              <button onClick={() => setFiltro('')} style={{ fontSize: 13, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 6, padding: '7px 12px', cursor: 'pointer' }}>
                Limpiar
              </button>
            )}
            {filtro && meta != null && (
              <span style={{ fontSize: 13, color: 'var(--color-entorno)' }}>
                {meta.total} resultado{meta.total !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {(meta?.total ?? profesionales.length) === 0 ? (
            <EmptyState
              icon="👨‍⚕️"
              title={filtro ? `Sin resultados para "${filtro}"` : 'No hay profesionales registrados'}
              description={filtro ? 'Intenta con otro nombre o teléfono' : 'Usa el formulario de arriba para agregar el primer profesional'}
            />
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-fallback)' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-purple-light)', textAlign: 'left' }}>
                    {['ID', 'Nombre', 'Teléfono', 'Acciones'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {profesionales.map((p) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--color-purple-light)' }}>
                      <td style={{ padding: '8px 12px' }}>{p.id}</td>
                      {inlineEditId === p.id ? (
                        <>
                          <td style={{ padding: '6px 8px' }}>
                            <input type="text" value={inlineDraft.nombre} disabled={loading}
                              onChange={(e) => setInlineDraft(d => ({ ...d, nombre: e.target.value }))} />
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <input type="text" value={inlineDraft.telefono} disabled={loading}
                              onChange={(e) => setInlineDraft(d => ({ ...d, telefono: e.target.value }))} />
                          </td>
                          <td style={{ padding: '6px 8px', display: 'flex', gap: 8 }}>
                            <button onClick={() => saveEdit(p.id)} disabled={loading}
                              style={{ fontSize: 12, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
                              Guardar</button>
                            <button onClick={cancelEdit} disabled={loading}
                              style={{ fontSize: 12, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
                              Cancelar</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ padding: '8px 12px' }}>{p.nombre}</td>
                          <td style={{ padding: '8px 12px' }}>{p.telefono || '—'}</td>
                          <td style={{ padding: '8px 12px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button onClick={() => startEdit(p)} disabled={loading}
                              style={{ fontSize: 12, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>Editar</button>
                            <button onClick={() => verAgenda(p)} disabled={loading}
                              style={{ fontSize: 12, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>Agenda</button>
                            <button onClick={() => abrirTarifas(p)} disabled={loading}
                              style={{ fontSize: 12, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
                              Tarifas</button>
                            <button onClick={() => setDeleteModalId(p.id)} disabled={loading}
                              style={{ fontSize: 12, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>Inactivar</button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {meta && meta.pages > 1 && (
                <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
                  <button
                    onClick={() => goToPage(page - 1)}
                    disabled={page === 1 || loading}
                    style={{ background: 'none', padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--color-entorno)', cursor: page === 1 ? 'not-allowed' : 'pointer', color: 'var(--color-entorno)' }}
                  >Anterior</button>
                  <span style={{ fontSize: 14, color: 'var(--color-entorno)'}}>Página {meta.page} de {meta.pages} — {meta.total} registros</span>
                  <button
                    onClick={() => goToPage(page + 1)}
                    disabled={page >= meta.pages || loading}
                    style={{ background: 'none', padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--color-entorno)', cursor: page >= meta.pages ? 'not-allowed' : 'pointer', color: 'var(--color-entorno)' }}
                  >Siguiente</button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* --- MODAL DE TARIFAS (NUEVO) --- */}
      {tarifasModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div style={{ background: 'var(--color-white)', borderRadius: 8, padding: 24, width: 450, maxWidth: '90%' }}>
            <h3 style={{ marginTop: 0, color: 'var(--color-entorno)' }}>Tarifas de {tarifasModal.nombre}</h3>
            
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input 
                placeholder="Descripción (ej: Baño)" 
                value={nuevaTarifa.descripcion} 
                onChange={e => setNuevaTarifa(t => ({...t, descripcion: e.target.value}))}
                style={{ flex: 2, padding: 6 }}
              />
              <input 
                type="number" 
                placeholder="Valor" 
                value={nuevaTarifa.valor} 
                onChange={e => setNuevaTarifa(t => ({...t, valor: e.target.value}))}
                style={{ flex: 1, padding: 6 }}
              />
              <button onClick={handleAddTarifa} disabled={loading} style={{ background: 'var(--color-entorno)', color: 'var(--color-white)', border: 'none', borderRadius: 4, padding: '6px 12px' }}>+</button>
            </div>

            <div style={{ maxHeight: 250, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: 13 }}>
                <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-purple-light)' }}><th>Servicio</th><th>Valor</th><th></th></tr></thead>
                <tbody>
                  {tarifasModal.lista.map(t => (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--bg-main)' }}>
                      <td style={{ padding: '6px 0' }}>{t.descripcion}</td>
                      <td>${parseFloat(t.valor).toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button onClick={() => handleDeleteTarifa(t.id)} style={{ color: 'var(--color-entorno)', border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tarifasModal.lista.length === 0 && <p style={{ fontSize: 12, color: 'var(--color-purple-light)', textAlign: 'center' }}>No hay tarifas configuradas.</p>}
            </div>

            <div style={{ marginTop: 20, textAlign: 'right' }}>
              <button onClick={() => setTarifasModal(null)} style={{ borderRadius: '6px', background: 'none', padding: '6px 16px',color: 'var(--color-entorno)', border: '1px solid var(--color-entorno)' }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modales Existentes (Agenda, Delete, etc.) */}
      {agendaModal && (
        <div onClick={() => setAgendaModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--color-white)', borderRadius: 8, padding: 24, width: 560, maxWidth: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0, color: 'var(--color-entorno)'}}>Agenda de {agendaModal.nombre}</h3>
            {agendaModal.citas.length === 0 ? (
              <p style={{ color: 'var(--color-purple-light)', fontSize: 14 }}>Este profesional no tiene citas agendadas.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-purple-light)', textAlign: 'left' }}>
                    {['ID', 'Mascota', 'Raza', 'Fecha', 'Inicio', 'Fin'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', fontWeight: 500, fontSize: 13 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agendaModal.citas.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--color-purple-light)' }}>
                      <td style={{ padding: '6px 10px', fontSize: 13 }}>{c.id}</td>
                      <td style={{ padding: '6px 10px', fontSize: 13 }}>{c.mascota_nombre}</td>
                      <td style={{ padding: '6px 10px', fontSize: 13 }}>{c.raza}</td>
                      <td style={{ padding: '6px 10px', fontSize: 13, color: 'var(--color-purple-light)' }}>{formatFecha(c.fecha)}</td>
                      <td style={{ padding: '6px 10px', fontSize: 13 }}>{formatHora(c.hora_inicio)}</td>
                      <td style={{ padding: '6px 10px', fontSize: 13 }}>{formatHora(c.hora_fin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16}}>
              <button type="button" onClick={() => setAgendaModal(null)} style={{ borderRadius: '6px', background: 'none', color: 'var(--color-entorno)', border: '1px solid var(--color-entorno)'}}>
                Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteModalId && (
        <div onClick={() => setDeleteModalId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--color-white)', borderRadius: 8, padding: 24, width: 380, maxWidth: '90%' }}>
            <h3 style={{ marginTop: 0, color: 'var(--color-entorno)' }}>Confirmar inactivación</h3>
            <p style={{ fontSize: 14, color: 'var(--color-purple-light)' }}>
              El profesional dejará de aparecer en la lista, pero sus datos se conservan.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button type="button" onClick={() => setDeleteModalId(null)} disabled={loading} style={{ borderRadius: '6px', background: 'none', color: 'var(--color-entorno)', border: '1px solid var(--color-entorno)' }}>
                Cancelar</button>
              <button
                onClick={confirmDelete}
                disabled={loading}
                style={{ background: 'none', color: 'var(--color-entorno)', border: '1px solid var(--color-entorno)', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer' }}>
                {loading ? 'Procesando...' : 'Inactivar'} {/* ✅ era 'Eliminar' */}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
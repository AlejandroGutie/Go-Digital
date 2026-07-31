import { useEffect, useState, useRef } from 'react';

import {
  listMascotas,
  createMascota,
  updateMascota,
  deleteMascota,
} from '../api/mascotasApi';
import { normalizeListPayload, normalizeMeta } from '../api/normalize';
import { useToast }  from '../hooks/useToast';
import { Toast }     from '../components/Toast';
import EmptyState from '../components/EmptyState';
import '../index.css';

const EMPTY_FORM = { nombre: '', especie:'', raza: '', tamano: '' };
const PAGE_SIZE = 20;

export default function MascotasPage() {
  const [form,          setForm]          = useState(EMPTY_FORM);
  const [mascotas,      setMascotas]      = useState([]);
  const [meta,          setMeta]          = useState(null);
  const [page,          setPage]          = useState(1);
  const [filtro,        setFiltro]        = useState('');
  const { toasts, addToast, removeToast } = useToast();
  const [listLoading,   setListLoading]   = useState(true);
  const [loadError,     setLoadError]     = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [inlineEditId,  setInlineEditId]  = useState(null);
  const [inlineDraft,   setInlineDraft]   = useState(EMPTY_FORM);
  const [deleteModalId, setDeleteModalId] = useState(null);

  const pageRef = useRef(page);
  const skipPageEffect = useRef(false);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);
  
  const SUGGESTED_ESPECIES = [
    "Perro",
    "Gato",
  ];
  
  const SUGGESTED_RAZAS = [
    "Criollo",
    "Labrador Retriever",
    "Golden Retriever",
    "Poodle (Caniche)",
    "Bulldog Frances",
    "Bulldog Ingles",
    "Beagle",
    "Pinscher",
    "Schnauzer",
    "Pastor Aleman",
    "Shih Tzu",
    "Yorkshire Terrier",
    "Pug",
    "Pitbull",
    "Siberian Husky",
    "Boston Terrier",
    "Chihuahua",
    "Cocker Spaniel",
    "Boxer",
    "Rottweiler",
    "Border Collie",
    "Pomerania",
    "Maltes",
    "Doberman",
    "San Bernardo",
    "Persa",
    "Siames",
    "Angora Turco",
    "Maine Coon",
    "Bengala (Bengali)",
    "Azul Ruso",
    "British Shorthair",
    "Ragdoll",
    "Esfinge (Sphynx)",
    "Himalayo",
    "Abisinio",
    "Somali",
    "Bobtail Japones",
    "American Shorthair"
  ];
  
  const SUGGESTED_TAMANOS = [
    "Miniatura",
    "Pequeño",
    "Mediano",
    "Grande",
    "Gigante"
  ];

  async function refresh(p = page, search = filtro) {
    const fetchId = ++fetchIdRef.current;
    setListLoading(true);
    setLoadError(null);
    try {
      const res = await listMascotas(p, PAGE_SIZE, search);
      if (fetchId !== fetchIdRef.current) return;
      setMascotas(normalizeListPayload(res));
      setMeta(normalizeMeta(res, p, PAGE_SIZE));
    } catch (e) {
      if (fetchId !== fetchIdRef.current) return;
      const msg =
        e?.message || 'No se pudo cargar la lista (revisa la sesión o la conexión con el servidor).';
      setLoadError(msg);
      setMascotas([]);
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

  // ── Crear ──────────────────────────────────────────────────
  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const nombre = form.nombre.trim();
      const especie = form.especie.trim();
      const raza   = form.raza.trim();
      const tamano = form.tamano.trim();

      if (!nombre || !especie || !raza || !tamano) throw new Error('Todos los campos son requeridos');

      await createMascota({ nombre, especie, raza, tamano });
      addToast('Mascota guardada correctamente', 'success');
      setForm(EMPTY_FORM);
      setFiltro('');
      setPage(1);
      await refresh(1, '');
    } catch (e) {
      addToast(e?.message || 'Error al guardar la mascota', 'error');
    } finally {
      setLoading(false);
    }
  }

  // ── Edición inline ─────────────────────────────────────────
  function startEdit(m) {
    setInlineEditId(m.id);
    setInlineDraft({ nombre: m.nombre, especie: m.especie, raza: m.raza, tamano: m.tamano });
  }

  function cancelEdit() {
    setInlineEditId(null);
    setInlineDraft(EMPTY_FORM);
  }

  async function saveEdit(id) {
    setLoading(true);
    try {
      const nombre = inlineDraft.nombre.trim();
      const especie = inlineDraft.especie.trim();
      const raza   = inlineDraft.raza.trim();
      const tamano = inlineDraft.tamano.trim();

      if (!nombre || !especie || !raza || !tamano) throw new Error('Todos los campos son requeridos');

      await updateMascota(id, { nombre, especie, raza, tamano });
      addToast('Mascota actualizada correctamente', 'success');
      cancelEdit();
      await refresh();
    } catch (e) {
      addToast(e?.message || 'Error al actualizar', 'error');
    } finally {
      setLoading(false);
    }
  }

  // ── Eliminar ───────────────────────────────────────────────
  async function confirmDelete() {
    setLoading(true);
    try {
      await deleteMascota(deleteModalId);
      addToast('Mascota eliminada correctamente', 'success');
      if (inlineEditId === deleteModalId) cancelEdit();
      setDeleteModalId(null);
      setFiltro('');
      setPage(1);
      await refresh(1, '');
    } catch (e) {
      addToast(e?.message || 'Error al eliminar', 'error');
    } finally {
      setLoading(false);
    }
  }

  // ── Paginación ─────────────────────────────────────────────
  async function goToPage(p) {
    setPage(p);
  }

  return (
    <div>
      <h1 className="font-display" style={{ fontSize: 22, fontWeight: 600, marginBottom: 20, color: 'var(--color-entorno)' }}>Mascotas</h1>

      {inlineEditId && (
        <div style={{ padding: '10px 14px', background: 'var(--bg-highlight)', borderRadius: 6, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Editando mascota <b>#{inlineEditId}</b> — cancela para crear una nueva.</span>
          <button onClick={cancelEdit} disabled={loading}
              style={{ fontSize: 12, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
            Cancelar</button>
        </div>
      )}

      {/* Formulario crear */}
      <form onSubmit={onSubmit} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, maxWidth: 480 }}>
        
        <label htmlFor="nombre">
          Nombre<span style={{ color: 'var(--color-magenta)', marginLeft: 2 }}>*</span>
        </label>
        <input id="nombre" type="text" value={form.nombre} required
          disabled={loading || !!inlineEditId}
          onChange={(e) => setForm(p => ({ ...p, nombre: e.target.value }))} />

        <label htmlFor="especie">
          Especie<span style={{ color: 'var(--color-magenta)', marginLeft: 2 }}>*</span>
        </label>
        <div style={{ width: '100%' }}>
          <input 
            id="especie" 
            list="listado-especies" // Conecta con el datalist
            type="text" 
            value={form.especie} 
            required
            disabled={loading || !!inlineEditId}
            onChange={(e) => setForm(p => ({ ...p, especie: e.target.value }))} 
          />
          <datalist id="listado-especies">
            {SUGGESTED_ESPECIES.map(opcion => (
              <option key={opcion} value={opcion} />
            ))}
          </datalist>
        </div>

        <label htmlFor="raza">
          Raza<span style={{ color: 'var(--color-magenta)', marginLeft: 2 }}>*</span>
        </label>
        <div style={{ width: '100%' }}>
          <input 
            id="raza" 
            list="listado-razas" // Conecta con el datalist
            type="text" 
            value={form.raza} 
            required
            disabled={loading || !!inlineEditId}
            onChange={(e) => setForm(p => ({ ...p, raza: e.target.value }))} 
          />
          <datalist id="listado-razas">
            {SUGGESTED_RAZAS.map(opcion => (
              <option key={opcion} value={opcion} />
            ))}
          </datalist>
        </div>

        <label htmlFor="tamano">
          Tamaño<span style={{ color: 'var(--color-magenta)', marginLeft: 2 }}>*</span>
        </label>
        <div style={{ width: '100%' }}>
          <input 
            id="tamano" 
            list="listado-tamanos" // Conecta con el datalist
            type="text" 
            value={form.tamano} 
            required
            disabled={loading || !!inlineEditId}
            onChange={(e) => setForm(p => ({ ...p, tamano: e.target.value }))} 
          />
          <datalist id="listado-tamanos">
            {SUGGESTED_TAMANOS.map(opcion => (
              <option key={opcion} value={opcion} />
            ))}
          </datalist>
        </div>

        <div style={{ gridColumn: '2' }}>
          <button type="submit" disabled={loading || !!inlineEditId}
              style={{ fontSize: 12, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
            {loading ? 'Procesando...' : 'Guardar'}
          </button>
        </div>
      </form>

      <hr style={{ margin: '24px 0' }} />

      {listLoading ? (
        <p style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-purple-light)', fontSize: 14 }}>
          Cargando lista de mascotas…
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
          placeholder="Buscar por nombre o raza..."
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-purple-light)', fontSize: 14, width: 280 }}
        />
        {filtro && (
          <button onClick={() => setFiltro('')}
            style={{ fontSize: 13, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 6, padding: '7px 12px', cursor: 'pointer' }}>
            Limpiar
          </button>
        )}
        {filtro && meta != null && (
          <span style={{ fontSize: 13, color: 'var(--color-entorno)' }}>
            {meta.total} resultado{meta.total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Tabla */}
      {(meta?.total ?? mascotas.length) === 0 ? (
        <EmptyState
          icon="🐶🐱"
          title={filtro ? `Sin resultados para "${filtro}"` : 'No hay mascotas registradas'}
          description={filtro ? 'Intenta con otro nombre o raza' : 'Usa el formulario de arriba para agregar la primera mascota'}
        />
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-fallback)'}}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-purple-light)', textAlign: 'left' }}>
                {['ID', 'Nombre', 'Especie', 'Raza', 'Tamaño', 'Acciones'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mascotas.map((m) => (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--color-purple-light)' }}>
                  <td style={{ padding: '8px 12px' }}>{m.id}</td>

                  {inlineEditId === m.id ? (
                    <>                      
                      {/* Campo Nombre (Normal) */}
                      <td style={{ padding: '6px 8px' }}>
                        <input 
                          type="text" 
                          value={inlineDraft.nombre} 
                          disabled={loading}
                          onChange={(e) => setInlineDraft(p => ({ ...p, nombre: e.target.value }))} 
                        />
                      </td>

                      {/* Campo Especie (Con Datalist) */}
                      <td style={{ padding: '6px 8px' }}>
                        <input 
                          type="text" 
                          list="listado-especies" // Reutiliza el datalist del formulario
                          value={inlineDraft.especie} 
                          disabled={loading}
                          onChange={(e) => setInlineDraft(p => ({ ...p, especie: e.target.value }))} 
                        />
                      </td>

                      {/* Campo Raza (Con Datalist) */}
                      <td style={{ padding: '6px 8px' }}>
                        <input 
                          type="text" 
                          list="listado-razas" // Reutiliza el datalist del formulario
                          value={inlineDraft.raza} 
                          disabled={loading}
                          onChange={(e) => setInlineDraft(p => ({ ...p, raza: e.target.value }))} 
                        />
                      </td>

                      {/* Campo Tamaño (Con Datalist) */}
                      <td style={{ padding: '6px 8px' }}>
                        <input 
                          type="text" 
                          list="listado-tamanos" // Reutiliza el datalist del formulario
                          value={inlineDraft.tamano} 
                          disabled={loading}
                          onChange={(e) => setInlineDraft(p => ({ ...p, tamano: e.target.value }))} 
                        />
                      </td>

                      <td style={{ padding: '6px 8px', display: 'flex', gap: 8 }}>
                        <button onClick={() => saveEdit(m.id)} disabled={loading}
                          style={{ fontSize: 12, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
                            Guardar</button>
                        <button onClick={cancelEdit} disabled={loading}
                          style={{ fontSize: 12, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
                            Cancelar</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ padding: '8px 12px' }}>{m.nombre}</td>
                      <td style={{ padding: '8px 12px' }}>{m.especie}</td>
                      <td style={{ padding: '8px 12px' }}>{m.raza}</td>
                      <td style={{ padding: '8px 12px' }}>{m.tamano}</td>
                      <td style={{ padding: '8px 12px', display: 'flex', gap: 8 }}>
                        <button onClick={() => startEdit(m)}           disabled={loading}
                          style={{ fontSize: 12, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
                            Editar</button>
                        <button onClick={() => setDeleteModalId(m.id)} disabled={loading}
                          style={{ fontSize: 12, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
                            Eliminar</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Paginación — Ahora visible siempre que haya más de una página */}
          {meta && meta.pages > 1 && (
            <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
              <button 
                onClick={() => goToPage(page - 1)}
                disabled={page === 1 || loading}
                style={{ background: 'none', padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--color-entorno)', cursor: page === 1 ? 'not-allowed' : 'pointer', color: 'var(--color-entorno)'}}
              >Anterior</button>
              <span style={{ fontSize: 14, color: 'var(--color-entorno)'}}>Página {meta.page} de {meta.pages} — {meta.total} registros</span>
              <button 
                onClick={() => goToPage(page + 1)} 
                disabled={page >= meta.pages || loading}
                style={{ background: 'none', padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--color-entorno)', cursor: page >= meta.pages ? 'not-allowed' : 'pointer', color: 'var(--color-entorno)'}}
              >Siguiente</button>
            </div>
          )}
        </>
      )}
      </>
      )}

      {/* Modal eliminar */}
      {deleteModalId && (
        <div onClick={() => setDeleteModalId(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--color-white)', borderRadius: 8, padding: 24, width: 380, maxWidth: '90%' }}>
            <h3 style={{ marginTop: 0 }}>Confirmar eliminación</h3>
            <p>¿Eliminar la mascota <b>#{deleteModalId}</b>? Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button onClick={() => setDeleteModalId(null)} disabled={loading}>Cancelar</button>
              <button onClick={confirmDelete} disabled={loading}
                style={{ background: 'var(--color-entorno)', color: 'var(--color-white)', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}>
                {loading ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <datalist id="listado-especies">
        {SUGGESTED_ESPECIES.map(opcion => <option key={opcion} value={opcion} />)}
      </datalist>

      <datalist id="listado-razas">
        {SUGGESTED_RAZAS.map(opcion => <option key={opcion} value={opcion} />)}
      </datalist>
      
      <datalist id="listado-tamanos">
        {SUGGESTED_TAMANOS.map(opcion => <option key={opcion} value={opcion} />)}
      </datalist>

      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
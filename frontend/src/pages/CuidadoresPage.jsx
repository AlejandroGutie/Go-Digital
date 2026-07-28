import { useEffect, useState, useRef } from 'react';
import {
  listCuidadores,
  createCuidador,
  updateCuidador,
  deleteCuidador,
  getMascotasDeCuidador,
  asignarMascota, // Importado desde cuidadoresApi para realizar la vinculación
} from '../api/cuidadoresApi';
import { createMascota } from '../api/mascotasApi'; // Importado para registrar la nueva mascota
import { normalizeListPayload, normalizeMeta } from '../api/normalize';
import { useToast }  from '../hooks/useToast';
import { Toast }     from '../components/Toast';
import EmptyState from '../components/EmptyState';
import '../index.css';

const EMPTY_FORM = { nombre: '', telefono: '', direccion: '', email: '' };
const EMPTY_MASCOTA_FORM = { nombre: '', especie: '', raza: '', tamano: '' };
const PAGE_SIZE = 20;

export default function CuidadoresPage() {
  // ── Estados Principales de Cuidadores ───────────────────────
  const [form,           setForm]           = useState(EMPTY_FORM);
  const [cuidadores,     setCuidadores]     = useState([]);
  const [meta,           setMeta]           = useState(null);
  const [page,           setPage]           = useState(1);
  const [filtro,         setFiltro]         = useState('');
  const [listLoading,    setListLoading]    = useState(true);
  const [loadError,      setLoadError]      = useState(null);
  const [loading,        setLoading]        = useState(false);
  const { toasts, addToast, removeToast } = useToast();
  const [inlineEditId,   setInlineEditId]   = useState(null);
  const [inlineDraft,    setInlineDraft]    = useState(EMPTY_FORM);
  const [deleteModalId,  setDeleteModalId]  = useState(null);

  // ── Estados del Modal de Mascotas y su Formulario Interno ──
  const [mascotasModal,  setMascotasModal]  = useState(null); // Contiene { id, nombre, mascotas: [] }
  const [mascotaForm,    setMascotaForm]    = useState(EMPTY_MASCOTA_FORM);
  const [modalLoading,   setModalLoading]   = useState(false);

  const colWidths = { 'ID': 50, 'Acciones': 210 };

  // ── Constantes de Sugerencias para el Autocompletado ────────
  const SUGGESTED_ESPECIES = ["Perro", "Gato"];
  
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
      const res = await listCuidadores(p, PAGE_SIZE, search);
      if (fetchId !== fetchIdRef.current) return;
      setCuidadores(normalizeListPayload(res));
      setMeta(normalizeMeta(res, p, PAGE_SIZE));
    } catch (e) {
      if (fetchId !== fetchIdRef.current) return;
      const msg = e?.message || 'No se pudo cargar la lista (revisa la sesión o la conexión con el servidor).';
      setLoadError(msg);
      setCuidadores([]);
      setMeta(null);
      addToast(msg, 'error');
    } finally {
      if (fetchId === fetchIdRef.current) {
        setListLoading(false);
      }
    }
  }

  // Sub-función para refrescar instantáneamente las mascotas del cuidador abierto en el modal
  async function refreshModalMascotas(cuidadorId) {
    setModalLoading(true);
    try {
      const updatedMascotas = await getMascotasDeCuidador(cuidadorId);
      setMascotasModal(prev => prev ? { ...prev, mascotas: updatedMascotas } : null);
    } catch (e) {
      addToast('No se pudo actualizar la lista de mascotas del cuidador', 'error');
    } finally {
      setModalLoading(false);
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

  // ── ACCIONES ──

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const { nombre, email, telefono, direccion } = form;
      if (!nombre.trim() || !telefono.trim()) throw new Error('Nombre y teléfono son requeridos');

      await createCuidador({ 
        nombre: nombre.trim(), 
        telefono: telefono.trim(), 
        direccion: direccion.trim(), 
        email: email.trim() 
      });
      
      addToast('Cuidador guardado correctamente', 'success');
      setForm(EMPTY_FORM);
      setFiltro(''); // Limpiar filtro al crear para ver el nuevo registro
      setPage(1);
      await refresh(1, '');
    } catch (e) {
      addToast(e?.message || 'Error al guardar el cuidador', 'error');
    } finally {
      setLoading(false);
    }
  }

  // ── Edición inline ─────────────────────────────────────────
  function startEdit(c) {
    setInlineEditId(c.id);
    setInlineDraft({
      nombre:    c.nombre,
      telefono:  c.telefono  || '',
      direccion: c.direccion || '',
      email:     c.email     || '',
    });
  }

  function cancelEdit() {
    setInlineEditId(null);
    setInlineDraft(EMPTY_FORM);
  }

  async function saveEdit(id) {
    setLoading(true);
    try {
      const nombre   = inlineDraft.nombre.trim();
      const telefono = inlineDraft.telefono.trim();
  
      // 1. Agregamos la validación preventiva
      if (!nombre || !telefono) {
        throw new Error('Nombre y teléfono son requeridos para actualizar');
      }
  
      // 2. Enviamos los datos (direccion y email pueden ir vacíos)
      await updateCuidador(id, {
        nombre:    nombre,
        telefono:  telefono,
        direccion: inlineDraft.direccion.trim(),
        email:     inlineDraft.email.trim(),
      });
  
      addToast('Cuidador actualizado correctamente', 'success');
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
      await deleteCuidador(deleteModalId);
      addToast('Cuidador eliminado correctamente', 'success');
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

  // ── Ver mascotas ───────────────────────────────────────────
  async function verMascotas(c) {
    try {
      const res = await getMascotasDeCuidador(c.id);
      setMascotasModal({
        id: c.id,
        nombre: c.nombre,
        mascotas: normalizeListPayload(res),
      });
    } catch (e) {
      addToast(e?.message || 'Error al cargar mascotas', 'error');
    }
  }

  // ── Lógica de Creación e Vinculación de Mascotas Interna ──
  async function handleCrearYAsociarMascota(e) {
    e.preventDefault();
    if (loading || modalLoading) return;

    const nombre = mascotaForm.nombre.trim();
    const especie = mascotaForm.especie.trim();
    const raza = mascotaForm.raza.trim();
    const tamano = mascotaForm.tamano.trim();

    try {
      if (!nombre || !especie || !raza || !tamano) {
        throw new Error('Todos los campos de la mascota son requeridos');
      }

      setModalLoading(true);

      // Paso 1: Crear la mascota en la base de datos global
      const resMascota = await createMascota({ nombre, especie, raza, tamano });
      const nuevaMascota = resMascota?.data;

      if (!nuevaMascota?.id) {
        throw new Error('No se recibió el identificador de la mascota creada');
      }

      // Paso 2: Vincular la nueva mascota al cuidador actual del modal
      await asignarMascota(mascotasModal.id, nuevaMascota.id);

      addToast('Mascota creada y asignada al cuidador correctamente', 'success');
      setMascotaForm(EMPTY_MASCOTA_FORM);
      
      // Paso 3: Forzar actualización instantánea del listado interno del modal
      await refreshModalMascotas(mascotasModal.id);
    } catch (error) {
      addToast(error?.message || 'Error en el flujo de guardado de mascota', 'error');
    } finally {
      setModalLoading(false);
    }
  }

  // ── Paginación ─────────────────────────────────────────────
  async function goToPage(p) {
    setPage(p);
  }

  return (
    <div>
      <h1 className="font-display" style={{ fontSize: 22, fontWeight: 600, marginBottom: 20, color: 'var(--color-entorno)' }}>Cuidadores</h1>

      {inlineEditId && (
        <div style={{ padding: '10px 14px', background: 'var(--bg-highlight)', borderRadius: 6, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Editando cuidador <b>#{inlineEditId}</b> — cancela para crear uno nuevo.</span>
          <button onClick={cancelEdit} disabled={loading}
              style={{ fontSize: 12, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
            Cancelar</button>
        </div>
      )}

      {/* Formulario crear */}
      <form onSubmit={onSubmit} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, maxWidth: 480 }}>
        <label htmlFor="cnombre">Nombre<span style={{ color: 'var(--color-entorno)', marginLeft: 2 }}>*</span></label>
        <input id="cnombre" type="text" value={form.nombre} required
          disabled={loading || !!inlineEditId}
          onChange={(e) => setForm(p => ({ ...p, nombre: e.target.value }))} />

        <label htmlFor="cemail">Email</label>
        <input id="cemail" type="email" value={form.email}
          disabled={loading || !!inlineEditId}
          onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} />

        <label htmlFor="ctelefono">Teléfono<span style={{ color: 'var(--color-entorno)', marginLeft: 2 }}>*</span></label>
        <input id="ctelefono" type="text" value={form.telefono} required
          disabled={loading || !!inlineEditId}
          onChange={(e) => setForm(p => ({ ...p, telefono: e.target.value }))} />

        <label htmlFor="cdireccion">Dirección</label>
        <input id="cdireccion" type="text" value={form.direccion}
          disabled={loading || !!inlineEditId}
          onChange={(e) => setForm(p => ({ ...p, direccion: e.target.value }))} />

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
          Cargando lista de cuidadores…
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
          placeholder="Buscar por nombre, teléfono o email..."
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
      {(meta?.total ?? cuidadores.length) === 0 ? (
        <EmptyState
          icon="👤"
          title={filtro ? `Sin resultados para "${filtro}"` : 'No hay cuidadores registrados'}
          description={filtro ? 'Intenta con otro nombre, teléfono o email' : 'Usa el formulario de arriba para agregar el primer cuidador'}
        />
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-fallback)'}}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-purple-light)', textAlign: 'left' }}>
              {['ID', 'Nombre', 'Email', 'Teléfono', 'Dirección', 'Acciones'].map(h => (
                <th key={h} style={{
                  padding:    '8px 12px',
                  fontWeight: 500,
                  width:      colWidths[h] || 'auto',
                }}>{h}</th>
              ))}
              </tr>
            </thead>
            <tbody>
              {cuidadores.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--color-purple-light)' }}>
                  <td style={{ padding: '8px 12px' }}>{c.id}</td>

                  {inlineEditId === c.id ? (
                    <>
                      {['nombre', 'email', 'telefono', 'direccion'].map(field => (
                        <td key={field} style={{ padding: '6px 8px' }}>
                          <input type="text" value={inlineDraft[field]} disabled={loading}
                            onChange={(e) => setInlineDraft(p => ({ ...p, [field]: e.target.value }))} />
                        </td>
                      ))}
                      <td style={{ padding: '6px 8px', display: 'flex', gap: 8 }}>
                        <button onClick={() => saveEdit(c.id)} disabled={loading}
                          style={{ fontSize: 12, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
                            Guardar</button>
                        <button onClick={cancelEdit}           disabled={loading}
                          style={{ fontSize: 12, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
                            Cancelar</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ padding: '8px 12px' }}>{c.nombre}</td>
                      <td style={{ padding: '8px 12px' }}>{c.email || '—'}</td>
                      <td style={{ padding: '8px 12px' }}>{c.telefono}</td>
                      <td style={{ padding: '8px 12px' }}>{c.direccion || 'No registra'}</td>
                      
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap' }}>
                          <button
                            onClick={() => startEdit(c)}
                            disabled={loading}
                            style={{ fontSize: 12, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
                            Editar
                          </button>
                          <button
                            onClick={() => verMascotas(c)}
                            disabled={loading}
                            style={{ fontSize: 12, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
                            Mascotas
                          </button>
                          <button
                            onClick={() => setDeleteModalId(c.id)}
                            disabled={loading}
                            style={{ fontSize: 12, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-purple-light)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Paginación — Ahora visible siempre que haya más de una página */}
          {meta && meta.pages > 1 && (
            <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center', color: 'var(--color-entorno)'}}>
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

      {/* ── MODAL COMPLETO: GESTIÓN Y CREACIÓN DE MASCOTA INTERNA ── */}
      {mascotasModal && (
        <div onClick={() => setMascotasModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--color-white)', borderRadius: 8, padding: 24, width: 620, maxWidth: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            
            <h3 style={{ marginTop: 0, color: 'var(--color-entorno)' }}>Mascotas a cargo de: {mascotasModal.nombre}</h3>
            
            {/* Formulario Interno para Registrar Nueva Mascota directamente en el Cuidador */}
            <form onSubmit={handleCrearYAsociarMascota} style={{ background: '#f9f9f9', padding: 14, borderRadius: 6, marginBottom: 20, border: '1px solid var(--color-purple-light)' }}>
              <h4 style={{ marginTop: 0, marginBottom: 12, fontSize: 14, color: 'var(--color-entorno)' }}>Registrar y asignar nueva mascota</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label htmlFor="m-nombre" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Nombre*</label>
                  <input id="m-nombre" type="text" style={{ width: '100%', padding: '4px 8px', fontSize: 13 }} value={mascotaForm.nombre} required disabled={modalLoading}
                    onChange={e => setMascotaForm(p => ({ ...p, nombre: e.target.value }))} />
                </div>
                <div>
                  <label htmlFor="m-especie" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Especie*</label>
                  <input id="m-especie" type="text" list="listado-especies" style={{ width: '100%', padding: '4px 8px', fontSize: 13 }} value={mascotaForm.especie} required disabled={modalLoading}
                    onChange={e => setMascotaForm(p => ({ ...p, especie: e.target.value }))} />
                </div>
                <div>
                  <label htmlFor="m-raza" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Raza*</label>
                  <input id="m-raza" type="text" list="listado-razas" style={{ width: '100%', padding: '4px 8px', fontSize: 13 }} value={mascotaForm.raza} required disabled={modalLoading}
                    onChange={e => setMascotaForm(p => ({ ...p, raza: e.target.value }))} />
                </div>
                <div>
                  <label htmlFor="m-tamano" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Tamaño*</label>
                  <input id="m-tamano" type="text" list="listado-tamanos" style={{ width: '100%', padding: '4px 8px', fontSize: 13 }} value={mascotaForm.tamano} required disabled={modalLoading}
                    onChange={e => setMascotaForm(p => ({ ...p, tamano: e.target.value }))} />
                </div>
              </div>
              <div style={{ marginTop: 12, textAlign: 'right' }}>
                <button type="submit" disabled={modalLoading}
                  style={{ fontSize: 12, color: 'var(--color-white)', background: 'var(--color-entorno)', border: 'none', borderRadius: 4, padding: '5px 14px', cursor: modalLoading ? 'not-allowed' : 'pointer' }}>
                  {modalLoading ? 'Procesando...' : 'Guardar y Asociar'}
                </button>
              </div>
            </form>

            {/* Listado de Mascotas Existentes */}
            {modalLoading && mascotasModal.mascotas.length === 0 ? (
              <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--color-purple-light)' }}>Cargando relación de mascotas...</p>
            ) : mascotasModal.mascotas.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '16px 0', fontSize: 14, color: 'var(--color-purple-light)' }}>Este cuidador no tiene mascotas asignadas todavía.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-purple-light)', textAlign: 'left', fontSize: 13 }}>
                    {['ID', 'Nombre', 'Especie', 'Raza', 'Tamaño'].map(th => (
                      <th key={th} style={{ padding: '6px 8px', fontWeight: 500 }}>{th}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mascotasModal.mascotas.map(m => (
                    <tr key={m.id} style={{ borderBottom: '1px solid #eee', fontSize: 13 }}>
                      <td style={{ padding: '6px 8px' }}>{m.id}</td>
                      <td style={{ padding: '6px 8px' }}>{m.nombre}</td>
                      <td style={{ padding: '6px 8px' }}>{m.especie}</td>
                      <td style={{ padding: '6px 8px' }}>{m.raza}</td>
                      <td style={{ padding: '6px 8px' }}>{m.tamano}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setMascotasModal(null)} style={{ padding: '4px 14px', borderRadius: 4, color: 'var(--color-entorno)', border: '1px solid var(--color-entorno)', cursor: 'pointer', background: 'none' }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal eliminar */}
      {deleteModalId && (
        <div onClick={() => setDeleteModalId(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--color-white)', borderRadius: 8, padding: 24, width: 380, maxWidth: '90%' }}>
            <h3 style={{ marginTop: 0 }}>Confirmar eliminación</h3>
            <p>¿Eliminar el cuidador <b>#{deleteModalId}</b>? Sus relaciones con mascotas también se eliminarán.</p>
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
      
      {/* Datalists Compartidos de Autocompletado */}
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
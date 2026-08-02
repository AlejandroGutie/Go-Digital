import { useEffect, useState, useRef } from 'react';
import { Users, Pencil, Trash2, PawPrint, Search, X, Plus } from 'lucide-react';
import {
  listCuidadores,
  createCuidador,
  updateCuidador,
  deleteCuidador,
  getMascotasDeCuidador,
  asignarMascota,
} from '../api/cuidadoresApi';
import { createMascota } from '../api/mascotasApi';
import { normalizeListPayload, normalizeMeta } from '../api/normalize';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import Field, { Input } from '../components/ui/Field';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';
import ConfirmSheet from '../components/ui/ConfirmSheet';
import Sheet from '../components/ui/Sheet';
import '../index.css';

const EMPTY_FORM = { nombre: '', telefono: '', direccion: '', email: '' };
const EMPTY_MASCOTA_FORM = { nombre: '', especie: '', raza: '', tamano: '' };
const PAGE_SIZE = 20;

export default function CuidadoresPage() {
  // ── Estados Principales de Cuidadores ───────────────────────
  const [form, setForm] = useState(EMPTY_FORM);
  const [cuidadores, setCuidadores] = useState([]);
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
  const [formOpen, setFormOpen] = useState(true);

  // ── Estados del Modal de Mascotas y su Formulario Interno ──
  const [mascotasModal, setMascotasModal] = useState(null);
  const [mascotaForm, setMascotaForm] = useState(EMPTY_MASCOTA_FORM);
  const [modalLoading, setModalLoading] = useState(false);

  // ── Constantes de Sugerencias para el Autocompletado ────────
  const SUGGESTED_ESPECIES = ['Perro', 'Gato'];

  const SUGGESTED_RAZAS = [
    'Criollo',
    'Labrador Retriever',
    'Golden Retriever',
    'Poodle (Caniche)',
    'Bulldog Frances',
    'Bulldog Ingles',
    'Beagle',
    'Pinscher',
    'Schnauzer',
    'Pastor Aleman',
    'Shih Tzu',
    'Yorkshire Terrier',
    'Pug',
    'Pitbull',
    'Siberian Husky',
    'Boston Terrier',
    'Chihuahua',
    'Cocker Spaniel',
    'Boxer',
    'Rottweiler',
    'Border Collie',
    'Pomerania',
    'Maltes',
    'Doberman',
    'San Bernardo',
    'Persa',
    'Siames',
    'Angora Turco',
    'Maine Coon',
    'Bengala (Bengali)',
    'Azul Ruso',
    'British Shorthair',
    'Ragdoll',
    'Esfinge (Sphynx)',
    'Himalayo',
    'Abisinio',
    'Somali',
    'Bobtail Japones',
    'American Shorthair',
  ];

  const SUGGESTED_TAMANOS = ['Miniatura', 'Pequeño', 'Mediano', 'Grande', 'Gigante'];

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
      const msg =
        e?.message ||
        'No se pudo cargar la lista (revisa la sesión o la conexión con el servidor).';
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

  async function refreshModalMascotas(cuidadorId) {
    setModalLoading(true);
    try {
      const res = await getMascotasDeCuidador(cuidadorId);
      setMascotasModal((prev) =>
        prev ? { ...prev, mascotas: normalizeListPayload(res) } : null
      );
    } catch (e) {
      addToast('No se pudo actualizar la lista de mascotas del cuidador', 'error');
    } finally {
      setModalLoading(false);
    }
  }

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

  useEffect(() => {
    if (skipPageEffect.current) {
      skipPageEffect.current = false;
      return;
    }
    refresh(page, filtro);
  }, [page]);

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
        email: email.trim(),
      });

      addToast('Cuidador guardado correctamente', 'success');
      setForm(EMPTY_FORM);
      setFiltro('');
      setPage(1);
      await refresh(1, '');
    } catch (e) {
      addToast(e?.message || 'Error al guardar el cuidador', 'error');
    } finally {
      setLoading(false);
    }
  }

  function startEdit(c) {
    setInlineEditId(c.id);
    setInlineDraft({
      nombre: c.nombre,
      telefono: c.telefono || '',
      direccion: c.direccion || '',
      email: c.email || '',
    });
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

      if (!nombre || !telefono) {
        throw new Error('Nombre y teléfono son requeridos para actualizar');
      }

      await updateCuidador(id, {
        nombre,
        telefono,
        direccion: inlineDraft.direccion.trim(),
        email: inlineDraft.email.trim(),
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

      const resMascota = await createMascota({ nombre, especie, raza, tamano });
      const nuevaMascota = resMascota?.data;

      if (!nuevaMascota?.id) {
        throw new Error('No se recibió el identificador de la mascota creada');
      }

      await asignarMascota(mascotasModal.id, nuevaMascota.id);

      addToast('Mascota creada y asignada al cuidador correctamente', 'success');
      setMascotaForm(EMPTY_MASCOTA_FORM);

      await refreshModalMascotas(mascotasModal.id);
    } catch (error) {
      addToast(error?.message || 'Error en el flujo de guardado de mascota', 'error');
    } finally {
      setModalLoading(false);
    }
  }

  async function goToPage(p) {
    setPage(p);
  }

  return (
    <div className="ui-page">
      <PageHeader
        title="Cuidadores"
        subtitle="Registra y gestiona los cuidadores del salón"
      />

      {inlineEditId && (
        <div className="ui-banner ui-banner--edit">
          <span>
            Editando cuidador <b>#{inlineEditId}</b> — cancela para crear uno nuevo.
          </span>
          <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={loading}>
            Cancelar
          </Button>
        </div>
      )}

      <div className="ui-accordion">
        <button
          type="button"
          className="ui-accordion__trigger"
          onClick={() => setFormOpen((v) => !v)}
          aria-expanded={formOpen}
        >
          <span>Nuevo cuidador</span>
          <span style={{ opacity: 0.7 }}>{formOpen ? '−' : '+'}</span>
        </button>
        {formOpen && (
          <div className="ui-accordion__body">
            <form className="ui-form" onSubmit={onSubmit} style={{ paddingTop: 16 }}>
              <div className="ui-form-grid ui-form-grid--2">
                <Field id="cnombre" label="Nombre" required>
                  <Input
                    id="cnombre"
                    type="text"
                    value={form.nombre}
                    required
                    disabled={loading || !!inlineEditId}
                    onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
                  />
                </Field>
                <Field id="cemail" label="Email">
                  <Input
                    id="cemail"
                    type="email"
                    value={form.email}
                    disabled={loading || !!inlineEditId}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  />
                </Field>
                <Field id="ctelefono" label="Teléfono" required>
                  <Input
                    id="ctelefono"
                    type="text"
                    value={form.telefono}
                    required
                    disabled={loading || !!inlineEditId}
                    onChange={(e) => setForm((p) => ({ ...p, telefono: e.target.value }))}
                  />
                </Field>
                <Field id="cdireccion" label="Dirección">
                  <Input
                    id="cdireccion"
                    type="text"
                    value={form.direccion}
                    disabled={loading || !!inlineEditId}
                    onChange={(e) => setForm((p) => ({ ...p, direccion: e.target.value }))}
                  />
                </Field>
              </div>
              <Button
                type="submit"
                variant="primary"
                disabled={loading || !!inlineEditId}
                block
              >
                {loading ? 'Procesando…' : 'Guardar cuidador'}
              </Button>
            </form>
          </div>
        )}
      </div>

      <hr className="ui-divider" />

      {listLoading ? (
        <Skeleton rows={5} />
      ) : loadError ? (
        <EmptyState
          icon={<Users size={24} />}
          title="No se pudo cargar la información"
          description={loadError}
        />
      ) : null}

      {!listLoading && !loadError && (
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
                placeholder="Buscar por nombre, teléfono o email…"
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
            {filtro && meta != null && (
              <span className="ui-toolbar__meta">
                {meta.total} resultado{meta.total !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {(meta?.total ?? cuidadores.length) === 0 ? (
            <EmptyState
              icon={<Users size={24} />}
              title={filtro ? `Sin resultados para "${filtro}"` : 'No hay cuidadores registrados'}
              description={
                filtro
                  ? 'Intenta con otro nombre, teléfono o email'
                  : 'Usa el formulario de arriba para agregar el primer cuidador'
              }
            />
          ) : (
            <>
              <div className="ui-table-wrap table-scroll">
                <table className="ui-table">
                  <thead>
                    <tr>
                      {['ID', 'Nombre', 'Email', 'Teléfono', 'Dirección', 'Acciones'].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cuidadores.map((c) => (
                      <tr key={c.id}>
                        <td className="ui-num">{c.id}</td>
                        {inlineEditId === c.id ? (
                          <>
                            <td>
                              <Input
                                type="text"
                                value={inlineDraft.nombre}
                                disabled={loading}
                                onChange={(e) =>
                                  setInlineDraft((p) => ({ ...p, nombre: e.target.value }))
                                }
                              />
                            </td>
                            <td>
                              <Input
                                type="email"
                                value={inlineDraft.email}
                                disabled={loading}
                                onChange={(e) =>
                                  setInlineDraft((p) => ({ ...p, email: e.target.value }))
                                }
                              />
                            </td>
                            <td>
                              <Input
                                type="text"
                                value={inlineDraft.telefono}
                                disabled={loading}
                                onChange={(e) =>
                                  setInlineDraft((p) => ({ ...p, telefono: e.target.value }))
                                }
                              />
                            </td>
                            <td>
                              <Input
                                type="text"
                                value={inlineDraft.direccion}
                                disabled={loading}
                                onChange={(e) =>
                                  setInlineDraft((p) => ({ ...p, direccion: e.target.value }))
                                }
                              />
                            </td>
                            <td>
                              <div className="ui-table__actions">
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => saveEdit(c.id)}
                                  disabled={loading}
                                >
                                  Guardar
                                </Button>
                                <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={loading}>
                                  Cancelar
                                </Button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{c.nombre}</td>
                            <td>{c.email || '—'}</td>
                            <td>{c.telefono}</td>
                            <td>{c.direccion || 'No registra'}</td>
                            <td>
                              <div className="ui-table__actions">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => startEdit(c)}
                                  disabled={loading}
                                  aria-label="Editar"
                                >
                                  <Pencil size={14} />
                                  Editar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => verMascotas(c)}
                                  disabled={loading}
                                  aria-label="Mascotas"
                                >
                                  <PawPrint size={14} />
                                  Mascotas
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setDeleteModalId(c.id)}
                                  disabled={loading}
                                  aria-label="Eliminar"
                                >
                                  <Trash2 size={14} />
                                  Eliminar
                                </Button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {meta && meta.pages > 1 && (
                <div className="ui-pagination">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => goToPage(page - 1)}
                    disabled={page === 1 || loading}
                  >
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

      <ConfirmSheet
        open={!!deleteModalId}
        onClose={() => setDeleteModalId(null)}
        onConfirm={confirmDelete}
        title="Confirmar eliminación"
        confirmLabel="Eliminar"
        loading={loading}
        danger
      >
        ¿Eliminar el cuidador <b>#{deleteModalId}</b>? Sus relaciones con mascotas también se
        eliminarán.
      </ConfirmSheet>

      <Sheet
        open={!!mascotasModal}
        onClose={() => setMascotasModal(null)}
        title={mascotasModal ? `Mascotas de ${mascotasModal.nombre}` : ''}
        size="lg"
        footer={
          <Button variant="ghost" onClick={() => setMascotasModal(null)}>
            Cerrar
          </Button>
        }
      >
        {modalLoading && mascotasModal?.mascotas.length === 0 ? (
          <Skeleton rows={3} />
        ) : mascotasModal?.mascotas.length === 0 ? (
          <EmptyState
            icon={<PawPrint size={24} />}
            title="Sin mascotas asignadas"
            description="Este cuidador no tiene mascotas asignadas todavía."
          />
        ) : (
          <div className="ui-table-wrap table-scroll">
            <table className="ui-table">
              <thead>
                <tr>
                  {['ID', 'Nombre', 'Especie', 'Raza', 'Tamaño'].map((th) => (
                    <th key={th}>{th}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mascotasModal?.mascotas.map((m) => (
                  <tr key={m.id}>
                    <td className="ui-num">{m.id}</td>
                    <td>{m.nombre}</td>
                    <td>{m.especie}</td>
                    <td>{m.raza}</td>
                    <td>{m.tamano}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <hr className="ui-divider" />

        <form className="ui-form" onSubmit={handleCrearYAsociarMascota}>
          <p
            style={{
              margin: '0 0 12px',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'var(--color-entorno)',
            }}
          >
            Registrar y asignar nueva mascota
          </p>
          <div className="ui-form-grid ui-form-grid--2">
            <Field id="m-nombre" label="Nombre" required>
              <Input
                id="m-nombre"
                type="text"
                value={mascotaForm.nombre}
                required
                disabled={modalLoading}
                onChange={(e) => setMascotaForm((p) => ({ ...p, nombre: e.target.value }))}
              />
            </Field>
            <Field id="m-especie" label="Especie" required>
              <Input
                id="m-especie"
                type="text"
                list="listado-especies"
                value={mascotaForm.especie}
                required
                disabled={modalLoading}
                onChange={(e) => setMascotaForm((p) => ({ ...p, especie: e.target.value }))}
              />
            </Field>
            <Field id="m-raza" label="Raza" required>
              <Input
                id="m-raza"
                type="text"
                list="listado-razas"
                value={mascotaForm.raza}
                required
                disabled={modalLoading}
                onChange={(e) => setMascotaForm((p) => ({ ...p, raza: e.target.value }))}
              />
            </Field>
            <Field id="m-tamano" label="Tamaño" required>
              <Input
                id="m-tamano"
                type="text"
                list="listado-tamanos"
                value={mascotaForm.tamano}
                required
                disabled={modalLoading}
                onChange={(e) => setMascotaForm((p) => ({ ...p, tamano: e.target.value }))}
              />
            </Field>
          </div>
          <Button type="submit" variant="primary" disabled={modalLoading} block>
            <Plus size={16} />
            {modalLoading ? 'Procesando…' : 'Guardar y asociar'}
          </Button>
        </form>
      </Sheet>

      <datalist id="listado-especies">
        {SUGGESTED_ESPECIES.map((opcion) => (
          <option key={opcion} value={opcion} />
        ))}
      </datalist>
      <datalist id="listado-razas">
        {SUGGESTED_RAZAS.map((opcion) => (
          <option key={opcion} value={opcion} />
        ))}
      </datalist>
      <datalist id="listado-tamanos">
        {SUGGESTED_TAMANOS.map((opcion) => (
          <option key={opcion} value={opcion} />
        ))}
      </datalist>

      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

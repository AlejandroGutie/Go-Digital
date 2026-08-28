import { useEffect, useState, useRef } from 'react';
import { PawPrint, Pencil, Trash2, Search, X } from 'lucide-react';
import {
  listMascotas,
  createMascota,
  updateMascota,
  deleteMascota,
  getMotivosMascotaNoEliminar,
  assertMascotaEliminable,
  mensajeMascotaNoEliminar,
  MSG_MASCOTA_COBROS,
} from '../api/mascotasApi';
import { normalizeListPayload, normalizeMeta } from '../api/normalize';
import { useToast } from '../hooks/useToast';
import { useMutationLock } from '../hooks/useMutationLock';
import { Toast } from '../components/Toast';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import Field, { DateInput, Input } from '../components/ui/Field';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';
import ConfirmSheet from '../components/ui/ConfirmSheet';
import TablePagination, {
  DEFAULT_PAGE_SIZE,
  PageSizeSelect,
} from '../components/ui/TablePagination';
import { formatFecha, hoyLocalISO, toDateOnly } from '../utils/format';
import { TABLE_STICKY_COLS_2 } from '../lib/tableSticky';
import '../index.css';

const EMPTY_FORM = {
  nombre: '',
  especie: '',
  raza: '',
  tamano: '',
  fecha_nacimiento: '',
};

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

const MSG_MASCOTA_NO_ELIMINAR = MSG_MASCOTA_COBROS;

export default function MascotasPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [mascotas, setMascotas] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGE_SIZE);
  const [filtro, setFiltro] = useState('');
  const { toasts, addToast, removeToast } = useToast();
  const { tryLock, unlock } = useMutationLock();
  const [listLoading, setListLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [inlineEditId, setInlineEditId] = useState(null);
  const [inlineDraft, setInlineDraft] = useState(EMPTY_FORM);
  const [deleteModalId, setDeleteModalId] = useState(null);
  const [motivosNoEliminarMascota, setMotivosNoEliminarMascota] = useState(() => new Map());
  const [formOpen, setFormOpen] = useState(true);

  const pageRef = useRef(page);
  const itemsPerPageRef = useRef(itemsPerPage);
  const skipPageEffect = useRef(false);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    itemsPerPageRef.current = itemsPerPage;
  }, [itemsPerPage]);

  async function refresh(p = page, search = filtro, limit = itemsPerPageRef.current) {
    const fetchId = ++fetchIdRef.current;
    setListLoading(true);
    setLoadError(null);
    try {
      const res = await listMascotas(p, limit, search);
      if (fetchId !== fetchIdRef.current) return;
      const rows = normalizeListPayload(res);
      setMascotas(rows);
      setMeta(normalizeMeta(res, p, limit));
      await cargarFlagsEliminacion(rows);
    } catch (e) {
      if (fetchId !== fetchIdRef.current) return;
      const msg =
        e?.message ||
        'No se pudo cargar la lista (revisa la sesión o la conexión con el servidor).';
      setLoadError(msg);
      setMascotas([]);
      setMeta(null);
      setMotivosNoEliminarMascota(new Map());
      addToast(msg, 'error');
    } finally {
      if (fetchId === fetchIdRef.current) {
        setListLoading(false);
      }
    }
  }

  async function cargarFlagsEliminacion(rows) {
    try {
      const res = await getMotivosMascotaNoEliminar((rows || []).map((m) => m.id));
      const map = new Map(
        Object.entries(res?.data ?? {}).map(([id, motivo]) => [Number(id), motivo])
      );
      setMotivosNoEliminarMascota(map);
    } catch {
      /* Mantener flags previos: evita habilitar eliminación si falla la verificación */
    }
  }

  function motivoNoEliminarMascota(id) {
    return motivosNoEliminarMascota.get(Number(id)) ?? null;
  }

  function mensajeNoEliminarMascota(id) {
    return mensajeMascotaNoEliminar(motivoNoEliminarMascota(id));
  }

  function mascotaSePuedeEliminar(id) {
    return !motivosNoEliminarMascota.has(Number(id));
  }

  function marcarMascotaNoEliminable(id, motivo = 'cobros') {
    setMotivosNoEliminarMascota((prev) => new Map(prev).set(Number(id), motivo));
  }

  async function solicitarEliminarMascota(m) {
    if (loading) return;
    try {
      await assertMascotaEliminable(m.id);
      setDeleteModalId(m.id);
    } catch (e) {
      marcarMascotaNoEliminable(m.id);
      addToast(e?.message || MSG_MASCOTA_NO_ELIMINAR, 'error');
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

  function handlePageSizeChange(size) {
    setItemsPerPage(size);
    itemsPerPageRef.current = size;
    if (pageRef.current !== 1) {
      skipPageEffect.current = true;
    }
    setPage(1);
    refresh(1, filtro, size);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!tryLock()) return;
    setLoading(true);
    try {
      const nombre = form.nombre.trim();
      const especie = form.especie.trim();
      const raza = form.raza.trim();
      const tamano = form.tamano.trim();
      const fecha_nacimiento = toDateOnly(form.fecha_nacimiento);

      if (!nombre || !especie || !raza || !tamano || !fecha_nacimiento) {
        throw new Error('Todos los campos con * son requeridos (incluye fecha de nacimiento)');
      }
      if (fecha_nacimiento > hoyLocalISO()) {
        throw new Error('La fecha de nacimiento no puede ser futura');
      }

      await createMascota({ nombre, especie, raza, tamano, fecha_nacimiento });
      addToast('Mascota guardada correctamente', 'success');
      setForm(EMPTY_FORM);
      setFiltro('');
      setPage(1);
      await refresh(1, '');
    } catch (e) {
      addToast(e?.message || 'Error al guardar la mascota', 'error');
    } finally {
      setLoading(false);
      unlock();
    }
  }

  function startEdit(m) {
    const fecha = toDateOnly(m.fecha_nacimiento);
    setInlineEditId(m.id);
    setInlineDraft({
      nombre: m.nombre,
      especie: m.especie,
      raza: m.raza,
      tamano: m.tamano,
      fecha_nacimiento: fecha,
    });
    if (!fecha) {
      addToast(
        'Esta mascota no tiene fecha de nacimiento. Complétala para poder guardar (campo obligatorio).',
        'error'
      );
    }
  }

  function cancelEdit() {
    setInlineEditId(null);
    setInlineDraft(EMPTY_FORM);
  }

  async function saveEdit(id) {
    if (!tryLock()) return;
    setLoading(true);
    try {
      const nombre = inlineDraft.nombre.trim();
      const especie = inlineDraft.especie.trim();
      const raza = inlineDraft.raza.trim();
      const tamano = inlineDraft.tamano.trim();
      const fecha_nacimiento = toDateOnly(inlineDraft.fecha_nacimiento);

      if (!nombre || !especie || !raza || !tamano || !fecha_nacimiento) {
        throw new Error(
          'Todos los campos son requeridos, incluida la fecha de nacimiento (también en registros antiguos)'
        );
      }
      if (fecha_nacimiento > hoyLocalISO()) {
        throw new Error('La fecha de nacimiento no puede ser futura');
      }

      await updateMascota(id, { nombre, especie, raza, tamano, fecha_nacimiento });
      addToast('Mascota actualizada correctamente', 'success');
      cancelEdit();
      await refresh();
    } catch (e) {
      addToast(e?.message || 'Error al actualizar', 'error');
    } finally {
      setLoading(false);
      unlock();
    }
  }

  async function confirmDelete() {
    if (!deleteModalId) return;
    try {
      await assertMascotaEliminable(deleteModalId);
    } catch (e) {
      marcarMascotaNoEliminable(deleteModalId);
      addToast(e?.message || MSG_MASCOTA_NO_ELIMINAR, 'error');
      setDeleteModalId(null);
      return;
    }
    if (!tryLock()) return;
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
      if (e?.message === MSG_MASCOTA_COBROS || e?.message === MSG_MASCOTA_NO_ELIMINAR) {
        marcarMascotaNoEliminable(deleteModalId);
      }
      addToast(e?.message || 'Error al eliminar', 'error');
    } finally {
      setLoading(false);
      unlock();
    }
  }

  function goToPage(p) {
    setPage(p);
  }

  return (
    <div className="ui-page">
      <PageHeader
        title="Mascotas"
        subtitle="Registra y gestiona las mascotas del salón"
      />

      {inlineEditId && (
        <div className="ui-banner ui-banner--edit">
          <span>
            Editando mascota <b>#{inlineEditId}</b>
            {!inlineDraft.fecha_nacimiento
              ? ' — falta la fecha de nacimiento (obligatoria para guardar).'
              : ' — cancela para crear una nueva.'}
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
          <span>Nueva mascota</span>
          <span style={{ opacity: 0.7 }}>{formOpen ? '−' : '+'}</span>
        </button>
        {formOpen && (
          <div className="ui-accordion__body">
            <form className="ui-form" onSubmit={onSubmit} style={{ paddingTop: 16 }}>
              <div className="ui-form-grid ui-form-grid--2">
                <Field id="nombre" label="Nombre" required>
                  <Input
                    id="nombre"
                    type="text"
                    value={form.nombre}
                    required
                    disabled={loading || !!inlineEditId}
                    onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
                  />
                </Field>
                <Field id="especie" label="Especie" required>
                  <Input
                    id="especie"
                    list="listado-especies"
                    type="text"
                    value={form.especie}
                    required
                    disabled={loading || !!inlineEditId}
                    onChange={(e) => setForm((p) => ({ ...p, especie: e.target.value }))}
                  />
                </Field>
                <Field id="raza" label="Raza" required>
                  <Input
                    id="raza"
                    list="listado-razas"
                    type="text"
                    value={form.raza}
                    required
                    disabled={loading || !!inlineEditId}
                    onChange={(e) => setForm((p) => ({ ...p, raza: e.target.value }))}
                  />
                </Field>
                <Field id="tamano" label="Tamaño" required>
                  <Input
                    id="tamano"
                    list="listado-tamanos"
                    type="text"
                    value={form.tamano}
                    required
                    disabled={loading || !!inlineEditId}
                    onChange={(e) => setForm((p) => ({ ...p, tamano: e.target.value }))}
                  />
                </Field>
                <Field id="fecha_nacimiento" label="Fecha de Nacimiento" required>
                  <DateInput
                    id="fecha_nacimiento"
                    value={form.fecha_nacimiento}
                    required
                    max={hoyLocalISO()}
                    disabled={loading || !!inlineEditId}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, fecha_nacimiento: e.target.value }))
                    }
                  />
                </Field>
              </div>
              <Button
                type="submit"
                variant="primary"
                disabled={loading || !!inlineEditId}
                block
              >
                {loading ? 'Procesando…' : 'Guardar mascota'}
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
          icon={<PawPrint size={24} />}
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
                placeholder="Buscar por nombre, raza, especie o tamaño…"
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

          {(meta?.total ?? mascotas.length) === 0 ? (
            <EmptyState
              icon={<PawPrint size={24} />}
              title={filtro ? `Sin resultados para "${filtro}"` : 'No hay mascotas registradas'}
              description={
                filtro
                  ? 'Intenta con otro nombre o raza'
                  : 'Usa el formulario de arriba para agregar la primera mascota'
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
                        'Nombre',
                        'Especie',
                        'Raza',
                        'Tamaño',
                        'Fecha de Nacimiento',
                        'Acciones',
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mascotas.map((m) => (
                      <tr key={m.id}>
                        <td className="ui-num">{m.id}</td>
                        {inlineEditId === m.id ? (
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
                                type="text"
                                list="listado-especies"
                                value={inlineDraft.especie}
                                disabled={loading}
                                onChange={(e) =>
                                  setInlineDraft((p) => ({ ...p, especie: e.target.value }))
                                }
                              />
                            </td>
                            <td>
                              <Input
                                type="text"
                                list="listado-razas"
                                value={inlineDraft.raza}
                                disabled={loading}
                                onChange={(e) =>
                                  setInlineDraft((p) => ({ ...p, raza: e.target.value }))
                                }
                              />
                            </td>
                            <td>
                              <Input
                                type="text"
                                list="listado-tamanos"
                                value={inlineDraft.tamano}
                                disabled={loading}
                                onChange={(e) =>
                                  setInlineDraft((p) => ({ ...p, tamano: e.target.value }))
                                }
                              />
                            </td>
                            <td>
                              <DateInput
                                value={inlineDraft.fecha_nacimiento}
                                max={hoyLocalISO()}
                                required
                                disabled={loading}
                                onChange={(e) =>
                                  setInlineDraft((p) => ({
                                    ...p,
                                    fecha_nacimiento: e.target.value,
                                  }))
                                }
                              />
                            </td>
                            <td>
                              <div className="ui-table__actions">
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => saveEdit(m.id)}
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
                            <td>{m.nombre}</td>
                            <td>{m.especie}</td>
                            <td>{m.raza}</td>
                            <td>{m.tamano}</td>
                            <td>{formatFecha(m.fecha_nacimiento)}</td>
                            <td>
                              <div className="ui-table__actions">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => startEdit(m)}
                                  disabled={loading}
                                  aria-label="Editar"
                                >
                                  <Pencil size={14} />
                                  Editar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => solicitarEliminarMascota(m)}
                                  disabled={loading || !mascotaSePuedeEliminar(m.id)}
                                  aria-label="Eliminar"
                                  title={
                                    mascotaSePuedeEliminar(m.id)
                                      ? 'Eliminar mascota'
                                      : mensajeNoEliminarMascota(m.id) || MSG_MASCOTA_NO_ELIMINAR
                                  }
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

      <ConfirmSheet
        open={!!deleteModalId}
        onClose={() => setDeleteModalId(null)}
        onConfirm={confirmDelete}
        title="Confirmar eliminación"
        confirmLabel="Eliminar"
        loading={loading}
        danger
        confirmDisabled={!deleteModalId || !mascotaSePuedeEliminar(deleteModalId)}
      >
        {deleteModalId && !mascotaSePuedeEliminar(deleteModalId) ? (
          <p>{mensajeNoEliminarMascota(deleteModalId) || MSG_MASCOTA_NO_ELIMINAR}</p>
        ) : (
          <>
            ¿Eliminar la mascota{' '}
            <b>
              {mascotas.find((m) => m.id === deleteModalId)?.nombre ?? `#${deleteModalId}`}
            </b>
            ? Esta acción no se puede deshacer.
            {deleteModalId && mascotaSePuedeEliminar(deleteModalId) && (
              <p style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                Si tiene citas sin cobros asociados, también se eliminarán.
              </p>
            )}
          </>
        )}
      </ConfirmSheet>

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

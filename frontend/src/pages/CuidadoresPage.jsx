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
import { createMascota, listMascotasConCuidadores } from '../api/mascotasApi';
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
import Sheet from '../components/ui/Sheet';
import TablePagination, {
  DEFAULT_PAGE_SIZE,
  PageSizeSelect,
} from '../components/ui/TablePagination';
import { formatFecha, hoyLocalISO, toDateOnly } from '../utils/format';
import '../index.css';

const EMPTY_FORM = { nombre: '', telefono: '', direccion: '', email: '' };
const EMPTY_MASCOTA_FORM = {
  nombre: '',
  especie: '',
  raza: '',
  tamano: '',
  fecha_nacimiento: '',
};
const MASCOTAS_LIST_LIMIT = 500;

function labelCuidadoresMascota(m) {
  const nombres = (m.cuidadores || []).map((c) => c.nombre).filter(Boolean);
  if (nombres.length === 0) return 'Sin cuidador asignado';
  return `Cuidador${nombres.length > 1 ? 'es' : ''}: ${nombres.join(', ')}`;
}

export default function CuidadoresPage() {
  // ── Estados Principales de Cuidadores ───────────────────────
  const [form, setForm] = useState(EMPTY_FORM);
  const [cuidadores, setCuidadores] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGE_SIZE);
  const [filtro, setFiltro] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { toasts, addToast, removeToast } = useToast();
  const { tryLock, unlock } = useMutationLock();
  const [inlineEditId, setInlineEditId] = useState(null);
  const [inlineDraft, setInlineDraft] = useState(EMPTY_FORM);
  const [deleteModalId, setDeleteModalId] = useState(null);
  const [formOpen, setFormOpen] = useState(true);

  // ── Estados del Modal de Mascotas y su Formulario Interno ──
  const [mascotasModal, setMascotasModal] = useState(null);
  const [mascotaForm, setMascotaForm] = useState(EMPTY_MASCOTA_FORM);
  const [modalLoading, setModalLoading] = useState(false);
  const [mascotasDisp, setMascotasDisp] = useState([]);
  const [busquedaMascota, setBusquedaMascota] = useState('');
  const [listaMascotasAbierta, setListaMascotasAbierta] = useState(false);
  const [mascotaIdAsignar, setMascotaIdAsignar] = useState('');
  const [buscandoMascotas, setBuscandoMascotas] = useState(false);
  const buscadorMascotaRef = useRef(null);
  const mascotaSearchReq = useRef(0);

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
      const res = await listCuidadores(p, limit, search);
      if (fetchId !== fetchIdRef.current) return;
      setCuidadores(normalizeListPayload(res));
      setMeta(normalizeMeta(res, p, limit));
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

  function resetAsignacionModal() {
    setMascotasDisp([]);
    setBusquedaMascota('');
    setListaMascotasAbierta(false);
    setMascotaIdAsignar('');
    setBuscandoMascotas(false);
    setMascotaForm(EMPTY_MASCOTA_FORM);
  }

  function cerrarMascotasModal() {
    setMascotasModal(null);
    resetAsignacionModal();
  }

  async function cargarMascotasDisponibles(search = '') {
    const reqId = ++mascotaSearchReq.current;
    setBuscandoMascotas(true);
    try {
      const res = await listMascotasConCuidadores(1, MASCOTAS_LIST_LIMIT, search);
      if (reqId !== mascotaSearchReq.current) return;
      setMascotasDisp(normalizeListPayload(res));
    } catch (e) {
      if (reqId !== mascotaSearchReq.current) return;
      addToast(e?.message || 'No se pudo cargar el listado de mascotas', 'error');
      setMascotasDisp([]);
    } finally {
      if (reqId === mascotaSearchReq.current) {
        setBuscandoMascotas(false);
      }
    }
  }

  useEffect(() => {
    function handleClickOutside(e) {
      if (buscadorMascotaRef.current && !buscadorMascotaRef.current.contains(e.target)) {
        setListaMascotasAbierta(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Búsqueda de mascotas existentes dentro del modal (servidor)
  useEffect(() => {
    if (!mascotasModal || mascotaIdAsignar) return undefined;
    const q = busquedaMascota.trim();
    const timer = setTimeout(() => {
      cargarMascotasDisponibles(q).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [busquedaMascota, mascotasModal, mascotaIdAsignar]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const { nombre, email, telefono, direccion } = form;
      if (!nombre.trim() || !telefono.trim() || !direccion.trim()) {
        throw new Error('Nombre, teléfono y dirección son requeridos');
      }

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
      unlock();
    }
  }

  function startEdit(c) {
    const direccion = c.direccion || '';
    setInlineEditId(c.id);
    setInlineDraft({
      nombre: c.nombre,
      telefono: c.telefono || '',
      direccion,
      email: c.email || '',
    });
    if (!direccion.trim()) {
      addToast(
        'Este cuidador no tiene dirección. Complétala para poder guardar (campo obligatorio).',
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
      const telefono = inlineDraft.telefono.trim();
      const direccion = inlineDraft.direccion.trim();

      if (!nombre || !telefono || !direccion) {
        throw new Error(
          'Nombre, teléfono y dirección son requeridos (también en registros antiguos)'
        );
      }

      await updateCuidador(id, {
        nombre,
        telefono,
        direccion,
        email: inlineDraft.email.trim(),
      });

      addToast('Cuidador actualizado correctamente', 'success');
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
    if (!tryLock()) return;
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
      unlock();
    }
  }

  async function verMascotas(c) {
    resetAsignacionModal();
    try {
      const [resAsignadas] = await Promise.all([
        getMascotasDeCuidador(c.id),
        cargarMascotasDisponibles(''),
      ]);
      setMascotasModal({
        id: c.id,
        nombre: c.nombre,
        mascotas: normalizeListPayload(resAsignadas),
      });
    } catch (e) {
      addToast(e?.message || 'Error al cargar mascotas', 'error');
    }
  }

  function seleccionarMascotaExistente(m) {
    setMascotaIdAsignar(String(m.id));
    setBusquedaMascota(m.nombre || '');
    setListaMascotasAbierta(false);
  }

  function limpiarMascotaAsignar() {
    setMascotaIdAsignar('');
    setBusquedaMascota('');
    setListaMascotasAbierta(false);
  }

  async function abrirListaMascotasExistentes() {
    setListaMascotasAbierta(true);
    if (mascotaIdAsignar) return;
    try {
      await cargarMascotasDisponibles(busquedaMascota.trim());
    } catch {
      /* toast ya en cargarMascotasDisponibles */
    }
  }

  async function handleAsignarExistente() {
    if (!mascotasModal?.id || !mascotaIdAsignar || modalLoading) return;
    setModalLoading(true);
    try {
      await asignarMascota(mascotasModal.id, Number(mascotaIdAsignar));
      addToast('Mascota asignada al cuidador correctamente', 'success');
      limpiarMascotaAsignar();
      await refreshModalMascotas(mascotasModal.id);
      await cargarMascotasDisponibles('');
    } catch (error) {
      addToast(error?.message || 'Error al asignar la mascota', 'error');
    } finally {
      setModalLoading(false);
    }
  }

  async function handleCrearYAsociarMascota(e) {
    e.preventDefault();
    if (loading || modalLoading) return;

    const nombre = mascotaForm.nombre.trim();
    const especie = mascotaForm.especie.trim();
    const raza = mascotaForm.raza.trim();
    const tamano = mascotaForm.tamano.trim();
    const fecha_nacimiento = toDateOnly(mascotaForm.fecha_nacimiento);

    try {
      if (!nombre || !especie || !raza || !tamano || !fecha_nacimiento) {
        throw new Error('Todos los campos de la mascota son requeridos');
      }
      if (fecha_nacimiento > hoyLocalISO()) {
        throw new Error('La fecha de nacimiento no puede ser futura');
      }

      setModalLoading(true);

      const resMascota = await createMascota({
        nombre,
        especie,
        raza,
        tamano,
        fecha_nacimiento,
      });
      const nuevaMascota = resMascota?.data;

      if (!nuevaMascota?.id) {
        throw new Error('No se recibió el identificador de la mascota creada');
      }

      await asignarMascota(mascotasModal.id, nuevaMascota.id);

      addToast('Mascota creada y asignada al cuidador correctamente', 'success');
      setMascotaForm(EMPTY_MASCOTA_FORM);
      limpiarMascotaAsignar();

      await refreshModalMascotas(mascotasModal.id);
      await cargarMascotasDisponibles('');
    } catch (error) {
      addToast(error?.message || 'Error en el flujo de guardado de mascota', 'error');
    } finally {
      setModalLoading(false);
    }
  }

  async function goToPage(p) {
    setPage(p);
  }

  const mascotasAsignadasIds = new Set((mascotasModal?.mascotas || []).map((m) => m.id));
  const mascotasParaAsignar = mascotasDisp.filter((m) => !mascotasAsignadasIds.has(m.id));

  return (
    <div className="ui-page">
      <PageHeader
        title="Cuidadores"
        subtitle="Registra y gestiona los cuidadores del salón"
      />

      {inlineEditId && (
        <div className="ui-banner ui-banner--edit">
          <span>
            Editando cuidador <b>#{inlineEditId}</b>
            {!inlineDraft.direccion?.trim()
              ? ' — falta la dirección (obligatoria para guardar).'
              : ' — cancela para crear uno nuevo.'}
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
                <Field id="cdireccion" label="Dirección" required>
                  <Input
                    id="cdireccion"
                    type="text"
                    value={form.direccion}
                    required
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
                                required
                                placeholder="Dirección obligatoria"
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
      >
        ¿Eliminar el cuidador <b>#{deleteModalId}</b>? Sus relaciones con mascotas también se
        eliminarán.
      </ConfirmSheet>

      <Sheet
        open={!!mascotasModal}
        onClose={cerrarMascotasModal}
        title={mascotasModal ? `Mascotas de ${mascotasModal.nombre}` : ''}
        size="lg"
        footer={
          <Button variant="ghost" onClick={cerrarMascotasModal}>
            Cerrar
          </Button>
        }
      >
        {modalLoading && (!mascotasModal?.mascotas || mascotasModal.mascotas.length === 0) ? (
          <Skeleton rows={3} />
        ) : mascotasModal?.mascotas.length === 0 ? (
          <EmptyState
            icon={<PawPrint size={24} />}
            title="Sin mascotas asignadas"
            description="Asigna una mascota existente o registra una nueva abajo."
          />
        ) : (
          <div className="ui-table-wrap table-scroll">
            <table className="ui-table">
              <thead>
                <tr>
                  {['ID', 'Nombre', 'Especie', 'Raza', 'Tamaño', 'Fecha de Nacimiento'].map(
                    (th) => (
                      <th key={th}>{th}</th>
                    )
                  )}
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
                    <td>{formatFecha(m.fecha_nacimiento)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <hr className="ui-divider" />

        <div style={{ marginBottom: 20 }}>
          <p
            style={{
              margin: '0 0 12px',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'var(--color-entorno)',
            }}
          >
            Asignar mascota existente
          </p>
          <label className="ui-field__label" htmlFor="buscador-mascota-cuidador">
            Buscar mascota
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
                id="buscador-mascota-cuidador"
                type="text"
                role="combobox"
                aria-expanded={listaMascotasAbierta}
                aria-controls="lista-mascotas-cuidador"
                aria-autocomplete="list"
                placeholder="Buscar por nombre, raza, especie o tamaño…"
                value={busquedaMascota}
                disabled={modalLoading}
                onChange={(e) => {
                  const value = e.target.value;
                  setBusquedaMascota(value);
                  setListaMascotasAbierta(true);
                  if (mascotaIdAsignar) {
                    const selected = mascotasParaAsignar.find(
                      (m) => String(m.id) === String(mascotaIdAsignar)
                    );
                    if (!selected || value !== (selected.nombre || '')) {
                      setMascotaIdAsignar('');
                    }
                  }
                }}
                onFocus={() => {
                  void abrirListaMascotasExistentes();
                }}
              />

              {listaMascotasAbierta && (
                <ul
                  id="lista-mascotas-cuidador"
                  role="listbox"
                  className="ui-combo__list"
                >
                  {buscandoMascotas ? (
                    <li
                      className="ui-combo__item"
                      style={{ cursor: 'default', color: 'var(--color-purple-light)' }}
                    >
                      Buscando mascotas…
                    </li>
                  ) : mascotasParaAsignar.length === 0 ? (
                    <li
                      className="ui-combo__item"
                      style={{ cursor: 'default', color: 'var(--color-purple-light)' }}
                    >
                      {busquedaMascota.trim()
                        ? 'No hay mascotas disponibles con esa búsqueda'
                        : 'No hay mascotas disponibles para asignar'}
                    </li>
                  ) : (
                    mascotasParaAsignar.map((m) => (
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
                          onClick={() => seleccionarMascotaExistente(m)}
                        >
                          <div>
                            {m.nombre}
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: '0.75rem',
                                color: 'var(--color-purple-light)',
                                fontWeight: 400,
                              }}
                            >
                              #{m.id}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--color-purple-light)',
                              fontWeight: 400,
                            }}
                          >
                            {[m.especie, m.raza, m.tamano].filter(Boolean).join(' · ')}
                          </div>
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--color-purple-light)',
                              fontWeight: 400,
                            }}
                          >
                            {labelCuidadoresMascota(m)}
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
              onClick={handleAsignarExistente}
              disabled={modalLoading || !mascotaIdAsignar}
              style={{ flexShrink: 0, alignSelf: 'center' }}
            >
              {modalLoading ? '…' : 'Asignar'}
            </Button>
          </div>
        </div>

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
            <Field id="m-fecha_nacimiento" label="Fecha de Nacimiento" required>
              <DateInput
                id="m-fecha_nacimiento"
                value={mascotaForm.fecha_nacimiento}
                required
                max={hoyLocalISO()}
                disabled={modalLoading}
                onChange={(e) =>
                  setMascotaForm((p) => ({ ...p, fecha_nacimiento: e.target.value }))
                }
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

import { useEffect, useState, useRef } from 'react';
import {
  Stethoscope,
  Pencil,
  CalendarDays,
  Tags,
  UserX,
  Search,
  X,
  Plus,
} from 'lucide-react';
import {
  listProfesionales,
  createProfesional,
  updateProfesional,
  deleteProfesional,
} from '../api/profesionalesApi';
import { normalizeListPayload, normalizeMeta } from '../api/normalize';
import { getAgendaDeProfesional } from '../api/agendasApi';
import { listTarifas, createTarifa, deleteTarifa } from '../api/tarifasApi';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import Field, { Input } from '../components/ui/Field';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';
import ConfirmSheet from '../components/ui/ConfirmSheet';
import Sheet from '../components/ui/Sheet';
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
  const [tarifasModal, setTarifasModal] = useState(null);
  const [nuevaTarifa, setNuevaTarifa] = useState({ descripcion: '', valor: '' });
  const [formOpen, setFormOpen] = useState(true);

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
      addToast(e?.message || 'Error al inactivar el profesional', 'error');
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
    <div className="ui-page">
      <PageHeader
        title="Profesionales"
        subtitle="Registra y gestiona los profesionales del salón"
      />

      {inlineEditId && (
        <div className="ui-banner ui-banner--edit">
          <span>
            Editando profesional <b>#{inlineEditId}</b> — cancela para crear uno nuevo.
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
          <span>Nuevo profesional</span>
          <span style={{ opacity: 0.7 }}>{formOpen ? '−' : '+'}</span>
        </button>
        {formOpen && (
          <div className="ui-accordion__body">
            <form className="ui-form" onSubmit={onSubmit} style={{ paddingTop: 16 }}>
              <div className="ui-form-grid ui-form-grid--2">
                <Field id="pnombre" label="Nombre" required>
                  <Input
                    id="pnombre"
                    type="text"
                    value={form.nombre}
                    required
                    disabled={loading || !!inlineEditId}
                    onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
                  />
                </Field>
                <Field id="ptelefono" label="Teléfono" required>
                  <Input
                    id="ptelefono"
                    type="text"
                    value={form.telefono}
                    disabled={loading || !!inlineEditId}
                    onChange={(e) => setForm((p) => ({ ...p, telefono: e.target.value }))}
                  />
                </Field>
              </div>
              <Button
                type="submit"
                variant="primary"
                disabled={loading || !!inlineEditId}
                block
              >
                {loading ? 'Procesando…' : 'Guardar profesional'}
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
          icon={<Stethoscope size={24} />}
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
                placeholder="Buscar por nombre o teléfono…"
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

          {(meta?.total ?? profesionales.length) === 0 ? (
            <EmptyState
              icon={<Stethoscope size={24} />}
              title={filtro ? `Sin resultados para "${filtro}"` : 'No hay profesionales registrados'}
              description={
                filtro
                  ? 'Intenta con otro nombre o teléfono'
                  : 'Usa el formulario de arriba para agregar el primer profesional'
              }
            />
          ) : (
            <>
              <div className="ui-table-wrap table-scroll">
                <table className="ui-table">
                  <thead>
                    <tr>
                      {['ID', 'Nombre', 'Teléfono', 'Acciones'].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {profesionales.map((p) => (
                      <tr key={p.id}>
                        <td className="ui-num">{p.id}</td>
                        {inlineEditId === p.id ? (
                          <>
                            <td>
                              <Input
                                type="text"
                                value={inlineDraft.nombre}
                                disabled={loading}
                                onChange={(e) =>
                                  setInlineDraft((d) => ({ ...d, nombre: e.target.value }))
                                }
                              />
                            </td>
                            <td>
                              <Input
                                type="text"
                                value={inlineDraft.telefono}
                                disabled={loading}
                                onChange={(e) =>
                                  setInlineDraft((d) => ({ ...d, telefono: e.target.value }))
                                }
                              />
                            </td>
                            <td>
                              <div className="ui-table__actions">
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => saveEdit(p.id)}
                                  disabled={loading}
                                >
                                  Guardar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={cancelEdit}
                                  disabled={loading}
                                >
                                  Cancelar
                                </Button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{p.nombre}</td>
                            <td>{p.telefono || '—'}</td>
                            <td>
                              <div className="ui-table__actions">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => startEdit(p)}
                                  disabled={loading}
                                  aria-label="Editar"
                                >
                                  <Pencil size={14} />
                                  Editar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => verAgenda(p)}
                                  disabled={loading}
                                  aria-label="Agenda"
                                >
                                  <CalendarDays size={14} />
                                  Agenda
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => abrirTarifas(p)}
                                  disabled={loading}
                                  aria-label="Tarifas"
                                >
                                  <Tags size={14} />
                                  Tarifas
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setDeleteModalId(p.id)}
                                  disabled={loading}
                                  aria-label="Inactivar"
                                >
                                  <UserX size={14} />
                                  Inactivar
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

      <Sheet
        open={!!tarifasModal}
        onClose={() => setTarifasModal(null)}
        title={tarifasModal ? `Tarifas de ${tarifasModal.nombre}` : ''}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="ghost" onClick={() => setTarifasModal(null)}>
              Cerrar
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <Input
            placeholder="Descripción (ej: Baño)"
            value={nuevaTarifa.descripcion}
            onChange={(e) => setNuevaTarifa((t) => ({ ...t, descripcion: e.target.value }))}
            style={{ flex: '2 1 140px', minWidth: 0 }}
          />
          <Input
            type="number"
            placeholder="Valor"
            value={nuevaTarifa.valor}
            onChange={(e) => setNuevaTarifa((t) => ({ ...t, valor: e.target.value }))}
            style={{ flex: '1 1 80px', minWidth: 0 }}
          />
          <Button
            variant="primary"
            onClick={handleAddTarifa}
            disabled={loading}
            aria-label="Agregar tarifa"
          >
            <Plus size={16} />
          </Button>
        </div>

        {tarifasModal?.lista.length === 0 ? (
          <EmptyState
            icon={<Tags size={24} />}
            title="No hay tarifas configuradas"
            description="Agrega una descripción y valor arriba"
          />
        ) : (
          <div className="ui-table-wrap table-scroll">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Servicio</th>
                  <th>Valor</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tarifasModal?.lista.map((t) => (
                  <tr key={t.id}>
                    <td>{t.descripcion}</td>
                    <td>${parseFloat(t.valor).toLocaleString()}</td>
                    <td>
                      <Button
                        variant="ghost"
                        icon
                        aria-label="Eliminar tarifa"
                        onClick={() => handleDeleteTarifa(t.id)}
                      >
                        <X size={16} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Sheet>

      <Sheet
        open={!!agendaModal}
        onClose={() => setAgendaModal(null)}
        size="lg"
        title={agendaModal ? `Agenda de ${agendaModal.nombre}` : ''}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="ghost" onClick={() => setAgendaModal(null)}>
              Cerrar
            </Button>
          </div>
        }
      >
        {agendaModal?.citas.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={24} />}
            title="Sin citas agendadas"
            description="Este profesional no tiene citas agendadas."
          />
        ) : (
          <div className="ui-table-wrap table-scroll">
            <table className="ui-table">
              <thead>
                <tr>
                  {['ID', 'Mascota', 'Raza', 'Fecha', 'Inicio', 'Fin'].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agendaModal?.citas.map((c) => (
                  <tr key={c.id}>
                    <td className="ui-num">{c.id}</td>
                    <td>{c.mascota_nombre}</td>
                    <td>{c.raza}</td>
                    <td style={{ color: 'var(--color-purple-light)' }}>{formatFecha(c.fecha)}</td>
                    <td>{formatHora(c.hora_inicio)}</td>
                    <td>{formatHora(c.hora_fin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Sheet>

      <ConfirmSheet
        open={!!deleteModalId}
        onClose={() => setDeleteModalId(null)}
        onConfirm={confirmDelete}
        title="Confirmar inactivación"
        confirmLabel="Inactivar"
        loading={loading}
        danger
      >
        El profesional dejará de aparecer en la lista, pero sus datos se conservan.
      </ConfirmSheet>

      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

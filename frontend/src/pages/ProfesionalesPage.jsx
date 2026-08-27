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
import { listTarifas, createTarifa, updateTarifa, deleteTarifa } from '../api/tarifasApi';
import { useToast } from '../hooks/useToast';
import { useMutationLock } from '../hooks/useMutationLock';
import { Toast } from '../components/Toast';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import Field, { Input } from '../components/ui/Field';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';
import ConfirmSheet from '../components/ui/ConfirmSheet';
import Sheet from '../components/ui/Sheet';
import TablePagination, {
  DEFAULT_PAGE_SIZE,
  PageSizeSelect,
} from '../components/ui/TablePagination';
import HorarioSlotSelect from '../components/ui/HorarioSlotSelect';
import { formatFecha, formatHora, formatMoneda } from '../utils/format';
import {
  JORNADA_DEFAULT_FIN,
  JORNADA_DEFAULT_INICIO,
  generarBloquesHorarios,
  jornadaDelProfesional,
  labelJornadaProfesional,
  toTimeHHMM,
} from '../utils/horarios';
import '../index.css';
import { TABLE_STICKY_COLS_2 } from '../lib/tableSticky';

const EMPTY_FORM = {
  nombre: '',
  telefono: '',
  hora_inicio_jornada: JORNADA_DEFAULT_INICIO,
  hora_fin_jornada: JORNADA_DEFAULT_FIN,
};

const SLOTS_JORNADA_CONFIG = generarBloquesHorarios('05:00', '23:00', 30, {
  includeEnd: true,
});

export default function ProfesionalesPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [profesionales, setProfesionales] = useState([]);
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
  const [deleteTarifaId, setDeleteTarifaId] = useState(null);
  const [agendaModal, setAgendaModal] = useState(null);
  const [tarifasModal, setTarifasModal] = useState(null);
  const [nuevaTarifa, setNuevaTarifa] = useState({ descripcion: '', valor: '' });
  const [editTarifaId, setEditTarifaId] = useState(null);
  const [editTarifaDraft, setEditTarifaDraft] = useState({ descripcion: '', valor: '' });
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
      const res = await listProfesionales(p, limit, search);
      if (fetchId !== fetchIdRef.current) return;
      setProfesionales(normalizeListPayload(res));
      setMeta(normalizeMeta(res, p, limit));
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

  function handlePageSizeChange(size) {
    setItemsPerPage(size);
    itemsPerPageRef.current = size;
    if (pageRef.current !== 1) {
      skipPageEffect.current = true;
    }
    setPage(1);
    refresh(1, filtro, size);
  }

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
    const descripcion = nuevaTarifa.descripcion.trim();
    const valorNum = parseFloat(nuevaTarifa.valor);
    if (!descripcion || Number.isNaN(valorNum) || valorNum < 0) {
      addToast('Ingresa descripción y un valor válido (0 o mayor)', 'error');
      return;
    }
    if (!tryLock()) return;
    setLoading(true);
    try {
      await createTarifa(tarifasModal.id, {
        descripcion,
        valor: valorNum,
      });
      addToast('Tarifa agregada', 'success');
      setNuevaTarifa({ descripcion: '', valor: '' });
      const res = await listTarifas(tarifasModal.id);
      setTarifasModal((prev) => ({ ...prev, lista: res.data }));
    } catch (e) {
      addToast(e?.message || 'Error al guardar tarifa', 'error');
    } finally {
      setLoading(false);
      unlock();
    }
  }

  function startEditTarifa(t) {
    setEditTarifaId(t.id);
    setEditTarifaDraft({
      descripcion: t.descripcion || '',
      valor: t.valor != null ? String(t.valor) : '',
    });
  }

  function cancelEditTarifa() {
    setEditTarifaId(null);
    setEditTarifaDraft({ descripcion: '', valor: '' });
  }

  async function saveEditTarifa() {
    if (editTarifaId == null || !tarifasModal?.id) return;
    const descripcion = editTarifaDraft.descripcion.trim();
    const valorNum = parseFloat(editTarifaDraft.valor);
    if (!descripcion || Number.isNaN(valorNum) || valorNum < 0) {
      addToast('Ingresa descripción y un valor válido (0 o mayor)', 'error');
      return;
    }
    if (!tryLock()) return;
    setLoading(true);
    try {
      await updateTarifa(tarifasModal.id, editTarifaId, {
        descripcion,
        valor: valorNum,
      });
      const res = await listTarifas(tarifasModal.id);
      setTarifasModal((prev) => ({ ...prev, lista: res.data }));
      cancelEditTarifa();
      addToast('Tarifa actualizada', 'success');
    } catch (e) {
      addToast(e?.message || 'Error al actualizar tarifa', 'error');
    } finally {
      setLoading(false);
      unlock();
    }
  }

  async function confirmDeleteTarifa() {
    if (deleteTarifaId == null || !tarifasModal?.id) return;
    if (!tryLock()) return;
    setLoading(true);
    try {
      await deleteTarifa(tarifasModal.id, deleteTarifaId);
      const res = await listTarifas(tarifasModal.id);
      setTarifasModal((prev) => ({ ...prev, lista: res.data }));
      if (editTarifaId === deleteTarifaId) cancelEditTarifa();
      setDeleteTarifaId(null);
      addToast('Tarifa eliminada', 'success');
    } catch (e) {
      addToast(e?.message || 'Error al eliminar', 'error');
    } finally {
      setLoading(false);
      unlock();
    }
  }
  // --- Fin Lógica de Tarifas ---

  async function onSubmit(e) {
    e.preventDefault();
    if (!tryLock()) return;
    setLoading(true);
    try {
      const nombre = form.nombre.trim();
      const telefono = form.telefono.trim();
      if (!nombre || !telefono) throw new Error('Nombre y teléfono son requeridos');
      await createProfesional({
        nombre,
        telefono,
        hora_inicio_jornada: form.hora_inicio_jornada,
        hora_fin_jornada: form.hora_fin_jornada,
      });
      addToast('Profesional guardado correctamente', 'success');
      setForm(EMPTY_FORM);
      setFiltro('');
      setPage(1);
      await refresh(1, '');
    } catch (e) {
      addToast(e?.message || 'Error al guardar', 'error');
    } finally {
      setLoading(false);
      unlock();
    }
  }

  function startEdit(p) {
    const j = jornadaDelProfesional(p);
    setInlineEditId(p.id);
    setInlineDraft({
      nombre: p.nombre,
      telefono: p.telefono || '',
      hora_inicio_jornada: j.inicio,
      hora_fin_jornada: j.fin,
    });
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
      if (!nombre || !telefono) throw new Error('Nombre y teléfono son requeridos');

      await updateProfesional(id, {
        nombre,
        telefono,
        hora_inicio_jornada: inlineDraft.hora_inicio_jornada,
        hora_fin_jornada: inlineDraft.hora_fin_jornada,
      });
      addToast('Actualizado correctamente', 'success');
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
      unlock();
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
                    required
                    disabled={loading || !!inlineEditId}
                    onChange={(e) => setForm((p) => ({ ...p, telefono: e.target.value }))}
                  />
                </Field>
                <Field id="pjornada-inicio" label="Hora inicio jornada" required>
                  <HorarioSlotSelect
                    id="pjornada-inicio"
                    value={form.hora_inicio_jornada}
                    slots={SLOTS_JORNADA_CONFIG}
                    disabled={loading || !!inlineEditId}
                    required
                    placeholder="Inicio de atención"
                    onChange={(v) =>
                      setForm((p) => {
                        const next = { ...p, hora_inicio_jornada: v };
                        const ini = toTimeHHMM(v);
                        const fin = toTimeHHMM(p.hora_fin_jornada);
                        if (ini && fin && fin <= ini) {
                          const posteriores = generarBloquesHorarios(ini, '23:00', 30, {
                            includeEnd: true,
                          }).filter((s) => s > ini);
                          next.hora_fin_jornada = posteriores[0] || JORNADA_DEFAULT_FIN;
                        }
                        return next;
                      })
                    }
                  />
                </Field>
                <Field id="pjornada-fin" label="Hora fin jornada" required>
                  <HorarioSlotSelect
                    id="pjornada-fin"
                    value={form.hora_fin_jornada}
                    slots={generarBloquesHorarios(
                      form.hora_inicio_jornada || JORNADA_DEFAULT_INICIO,
                      '23:00',
                      30,
                      { includeEnd: true }
                    ).filter(
                      (s) =>
                        s >
                        (toTimeHHMM(form.hora_inicio_jornada) || JORNADA_DEFAULT_INICIO)
                    )}
                    disabled={loading || !!inlineEditId}
                    required
                    placeholder="Fin de atención"
                    onChange={(v) =>
                      setForm((p) => ({ ...p, hora_fin_jornada: v }))
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
                <table className={TABLE_STICKY_COLS_2}>
                  <thead>
                    <tr>
                      {['ID', 'Nombre', 'Teléfono', 'Jornada', 'Acciones'].map((h) => (
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
                                required
                                disabled={loading}
                                onChange={(e) =>
                                  setInlineDraft((d) => ({ ...d, telefono: e.target.value }))
                                }
                              />
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <HorarioSlotSelect
                                  value={inlineDraft.hora_inicio_jornada}
                                  slots={SLOTS_JORNADA_CONFIG}
                                  disabled={loading}
                                  required
                                  placeholder="Inicio"
                                  onChange={(v) =>
                                    setInlineDraft((d) => {
                                      const next = { ...d, hora_inicio_jornada: v };
                                      const ini = toTimeHHMM(v);
                                      const fin = toTimeHHMM(d.hora_fin_jornada);
                                      if (ini && fin && fin <= ini) {
                                        const posteriores = generarBloquesHorarios(
                                          ini,
                                          '23:00',
                                          30,
                                          { includeEnd: true }
                                        ).filter((s) => s > ini);
                                        next.hora_fin_jornada =
                                          posteriores[0] || JORNADA_DEFAULT_FIN;
                                      }
                                      return next;
                                    })
                                  }
                                />
                                <HorarioSlotSelect
                                  value={inlineDraft.hora_fin_jornada}
                                  slots={generarBloquesHorarios(
                                    inlineDraft.hora_inicio_jornada ||
                                      JORNADA_DEFAULT_INICIO,
                                    '23:00',
                                    30,
                                    { includeEnd: true }
                                  ).filter(
                                    (s) =>
                                      s >
                                      (toTimeHHMM(inlineDraft.hora_inicio_jornada) ||
                                        JORNADA_DEFAULT_INICIO)
                                  )}
                                  disabled={loading}
                                  required
                                  placeholder="Fin"
                                  onChange={(v) =>
                                    setInlineDraft((d) => ({
                                      ...d,
                                      hora_fin_jornada: v,
                                    }))
                                  }
                                />
                              </div>
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
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {labelJornadaProfesional(p)}
                            </td>
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

      <Sheet
        open={!!tarifasModal}
        onClose={() => {
          setTarifasModal(null);
          cancelEditTarifa();
          setNuevaTarifa({ descripcion: '', valor: '' });
        }}
        title={tarifasModal ? `Tarifas de ${tarifasModal.nombre}` : ''}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button
              variant="ghost"
              onClick={() => {
                setTarifasModal(null);
                cancelEditTarifa();
                setNuevaTarifa({ descripcion: '', valor: '' });
              }}
            >
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
            disabled={loading || editTarifaId != null}
            style={{ flex: '2 1 140px', minWidth: 0 }}
          />
          <Input
            type="number"
            placeholder="Valor"
            value={nuevaTarifa.valor}
            onChange={(e) => setNuevaTarifa((t) => ({ ...t, valor: e.target.value }))}
            disabled={loading || editTarifaId != null}
            min="0"
            step="any"
            style={{ flex: '1 1 80px', minWidth: 0 }}
          />
          <Button
            variant="primary"
            onClick={handleAddTarifa}
            disabled={loading || editTarifaId != null}
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
                    {editTarifaId === t.id ? (
                      <>
                        <td>
                          <Input
                            value={editTarifaDraft.descripcion}
                            disabled={loading}
                            onChange={(e) =>
                              setEditTarifaDraft((d) => ({ ...d, descripcion: e.target.value }))
                            }
                          />
                        </td>
                        <td>
                          <Input
                            type="number"
                            value={editTarifaDraft.valor}
                            disabled={loading}
                            min="0"
                            step="any"
                            onChange={(e) =>
                              setEditTarifaDraft((d) => ({ ...d, valor: e.target.value }))
                            }
                          />
                        </td>
                        <td>
                          <div className="ui-table__actions">
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={saveEditTarifa}
                              disabled={loading}
                            >
                              Guardar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={cancelEditTarifa}
                              disabled={loading}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{t.descripcion}</td>
                        <td>{formatMoneda(t.valor)}</td>
                        <td>
                          <div className="ui-table__actions">
                            <Button
                              variant="ghost"
                              icon
                              aria-label="Editar tarifa"
                              onClick={() => startEditTarifa(t)}
                              disabled={loading || editTarifaId != null}
                            >
                              <Pencil size={16} />
                            </Button>
                            <Button
                              variant="ghost"
                              icon
                              aria-label="Eliminar tarifa"
                              onClick={() => setDeleteTarifaId(t.id)}
                              disabled={loading || editTarifaId != null}
                            >
                              <X size={16} />
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
                  {['ID', 'Mascota', 'Especie', 'Raza', 'Fecha', 'Inicio', 'Fin'].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agendaModal?.citas.map((c) => (
                  <tr key={c.id}>
                    <td className="ui-num">{c.id}</td>
                    <td>{c.mascota_nombre}</td>
                    <td>{c.especie || '—'}</td>
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

      <ConfirmSheet
        open={deleteTarifaId != null}
        onClose={() => setDeleteTarifaId(null)}
        onConfirm={confirmDeleteTarifa}
        title="Confirmar eliminación"
        confirmLabel="Eliminar"
        loading={loading}
        danger
      >
        ¿Eliminar la tarifa <b>#{deleteTarifaId}</b>? Esta acción no se puede deshacer.
      </ConfirmSheet>

      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

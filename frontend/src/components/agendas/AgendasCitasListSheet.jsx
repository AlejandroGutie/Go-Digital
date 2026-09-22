import {
  Calendar,
  CalendarClock,
  MessageCircle,
  PawPrint,
  Search,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import EmptyState from '../EmptyState';
import Button from '../ui/Button';
import { Input } from '../ui/Field';
import Sheet from '../ui/Sheet';
import TablePagination, { PageSizeSelect } from '../ui/TablePagination';
import { formatFecha, formatHora } from '../../utils/format';
import {
  puedeCancelarAgenda,
  motivoNoCancelarAgenda,
  puedeReprogramarAgenda,
  motivoNoReprogramarAgenda,
} from '../../api/agendasApi';
import { TABLE_STICKY_COLS_1 } from '../../lib/tableSticky';
import {
  formatTarifaLabel,
  estadoPagoCita,
} from '../../pages/agendas/agendaPageHelpers';

/**
 * Sheet con la lista detallada de citas (misma UI que la tabla de AgendasPage).
 * No reemplaza la tabla de la página: solo la despliega en modal al clic del badge.
 */
export default function AgendasCitasListSheet({
  open,
  onClose,
  profesionalNombre = '',
  citas = [],
  citasPageRows = [],
  citasTotal = 0,
  citasPage = 1,
  citasPages = 1,
  citasPerPage = 10,
  onPageChange,
  onPageSizeChange,
  filtroTabla = '',
  onFiltroTablaChange,
  onClearFiltro,
  mostrarCanceladas = false,
  onMostrarCanceladasChange,
  loading = false,
  whatsappBusy = null,
  pagarBusyId = null,
  cobroModalOpen = false,
  onConfirmarWhatsApp,
  onMascotaLista,
  onPagar,
  onReprogramar,
  onCancelar,
}) {
  const title = profesionalNombre
    ? `Citas · ${profesionalNombre}`
    : 'Citas agendadas';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={`${citas.length} cita${citas.length !== 1 ? 's' : ''} cargada${citas.length !== 1 ? 's' : ''} para este profesional`}
      size="lg"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      {citas.length === 0 ? (
        <EmptyState
          icon={<Calendar size={24} />}
          title="Sin citas agendadas"
          description="Usa el formulario de la página para agendar la primera cita de este profesional"
        />
      ) : (
        <>
          <div className="ui-toolbar ui-toolbar--sheet">
            <div className="ui-toolbar__search">
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
                placeholder="Buscar cita por mascota, fecha, horario o tarifa…"
                value={filtroTabla}
                onChange={(e) => onFiltroTablaChange?.(e.target.value)}
                style={{ paddingLeft: 40 }}
                aria-label="Buscar en la agenda (modal)"
              />
            </div>
            <div className="ui-toolbar__options">
              {filtroTabla ? (
                <Button variant="ghost" size="sm" onClick={onClearFiltro}>
                  <X size={16} />
                  Limpiar
                </Button>
              ) : null}
              <label
                htmlFor="mostrar-canceladas-agenda-sheet"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  flexShrink: 0,
                  fontSize: '0.8125rem',
                  color: 'var(--color-purple-light)',
                  cursor: 'pointer',
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                <input
                  id="mostrar-canceladas-agenda-sheet"
                  type="checkbox"
                  checked={mostrarCanceladas}
                  onChange={(e) => onMostrarCanceladasChange?.(e.target.checked)}
                  disabled={loading}
                  style={{ width: 16, height: 16, accentColor: 'var(--color-entorno)' }}
                />
                Mostrar canceladas
              </label>
              <PageSizeSelect
                value={citasPerPage}
                onChange={onPageSizeChange}
                disabled={loading}
              />
              <span className="ui-toolbar__meta">
                {citasTotal} cita{citasTotal !== 1 ? 's' : ''}
                {!mostrarCanceladas && citas.some((c) => c.cancelada)
                  ? ' (ocultas canceladas)'
                  : ''}
              </span>
            </div>
          </div>

          {citasTotal === 0 ? (
            <EmptyState
              icon={<Calendar size={24} />}
              title={
                filtroTabla.trim()
                  ? `Sin resultados para "${filtroTabla.trim()}"`
                  : mostrarCanceladas
                    ? 'Sin citas para mostrar'
                    : 'Sin citas activas'
              }
              description={
                filtroTabla.trim()
                  ? 'La búsqueda aplica a las citas visibles de este profesional'
                  : mostrarCanceladas
                    ? 'Este profesional aún no tiene citas registradas'
                    : 'Activa “Mostrar canceladas” si quieres ver el historial de cancelaciones'
              }
            />
          ) : (
            <>
              <div className="ui-table-wrap table-scroll">
                <table className={TABLE_STICKY_COLS_1}>
                  <thead>
                    <tr>
                      {[
                        'Mascota',
                        'Especie',
                        'Raza',
                        'Fecha',
                        'Inicio',
                        'Fin',
                        'Tarifa',
                        'Estado',
                        '',
                      ].map((h) => (
                        <th key={h || 'acciones'}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {citasPageRows.map((c) => (
                      <tr key={c.id}>
                        <td>{c.mascota_nombre}</td>
                        <td>{c.especie || '—'}</td>
                        <td>{c.raza}</td>
                        <td style={{ color: 'var(--color-purple-light)' }}>
                          {formatFecha(c.fecha)}
                        </td>
                        <td>{formatHora(c.hora_inicio)}</td>
                        <td>{formatHora(c.hora_fin)}</td>
                        <td>{formatTarifaLabel(c)}</td>
                        <td>
                          {c.cancelada ? (
                            <span
                              className="ui-badge"
                              title={
                                c.observacion_cancelacion
                                  ? `Cancelada: ${c.observacion_cancelacion}`
                                  : 'Cita cancelada'
                              }
                              style={{
                                background:
                                  'color-mix(in srgb, #b91c1c 14%, var(--color-white))',
                                color: '#991b1b',
                                border:
                                  '1px solid color-mix(in srgb, #b91c1c 30%, transparent)',
                                fontWeight: 600,
                              }}
                            >
                              Cancelada
                            </span>
                          ) : estadoPagoCita(c) === 'pagado' ? (
                            <span
                              className="ui-badge"
                              title="Pago registrado; pendiente de Mascota lista"
                              style={{
                                background:
                                  'color-mix(in srgb, #0d9488 18%, var(--color-white))',
                                color: '#0f766e',
                                border:
                                  '1px solid color-mix(in srgb, #0d9488 35%, transparent)',
                                fontWeight: 600,
                              }}
                            >
                              Pagada
                            </span>
                          ) : (
                            <span
                              className="ui-badge"
                              title="Cobro pendiente de pago"
                              style={{
                                background: 'var(--bg-selected)',
                                color: 'var(--color-entorno)',
                                fontWeight: 600,
                              }}
                            >
                              Pendiente de pago
                            </span>
                          )}
                          {c.cancelada && c.observacion_cancelacion ? (
                            <div
                              style={{
                                marginTop: 4,
                                fontSize: '0.75rem',
                                color: 'var(--color-purple-light)',
                                maxWidth: 220,
                              }}
                            >
                              {c.observacion_cancelacion}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <div className="ui-table__actions">
                            {!c.cancelada && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => onConfirmarWhatsApp?.(c)}
                                  disabled={
                                    loading ||
                                    whatsappBusy != null ||
                                    pagarBusyId != null
                                  }
                                  aria-label="Confirmar por WhatsApp"
                                  style={{ color: '#128C7E' }}
                                >
                                  <MessageCircle size={14} />
                                  {whatsappBusy?.id === c.id &&
                                  whatsappBusy?.kind === 'confirm'
                                    ? 'Abriendo…'
                                    : 'Confirmar'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => onMascotaLista?.(c)}
                                  disabled={
                                    loading ||
                                    whatsappBusy != null ||
                                    pagarBusyId != null ||
                                    c.atendida === true
                                  }
                                  aria-label="Marcar mascota lista y notificar"
                                  title={
                                    c.atendida === true
                                      ? 'Esta cita ya está marcada como Mascota lista'
                                      : 'Marcar atención completada y notificar'
                                  }
                                  style={{ color: '#128C7E' }}
                                >
                                  <PawPrint size={14} />
                                  {whatsappBusy?.id === c.id &&
                                  whatsappBusy?.kind === 'lista'
                                    ? 'Procesando…'
                                    : 'Mascota lista'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => onPagar?.(c)}
                                  disabled={
                                    loading ||
                                    whatsappBusy != null ||
                                    cobroModalOpen ||
                                    pagarBusyId != null ||
                                    estadoPagoCita(c) === 'pagado'
                                  }
                                  aria-label="Registrar pago"
                                  title={
                                    estadoPagoCita(c) === 'pagado'
                                      ? 'Esta cita ya está pagada'
                                      : 'Marcar el cobro como pagado'
                                  }
                                  style={
                                    estadoPagoCita(c) === 'pagado'
                                      ? { cursor: 'not-allowed' }
                                      : undefined
                                  }
                                >
                                  <Wallet size={14} />
                                  {pagarBusyId === c.id ? 'Pagando…' : 'Pagar'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => onReprogramar?.(c)}
                                  disabled={
                                    loading ||
                                    whatsappBusy != null ||
                                    pagarBusyId != null ||
                                    !puedeReprogramarAgenda(c)
                                  }
                                  aria-label="Reprogramar"
                                  title={
                                    motivoNoReprogramarAgenda(c) ||
                                    'Reprogramar cita'
                                  }
                                >
                                  <CalendarClock size={14} />
                                  Reprogramar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => onCancelar?.(c)}
                                  disabled={
                                    loading ||
                                    whatsappBusy != null ||
                                    pagarBusyId != null ||
                                    !puedeCancelarAgenda(c)
                                  }
                                  aria-label="Cancelar agenda"
                                  title={
                                    motivoNoCancelarAgenda(c) ||
                                    'Cancelar agenda y liberar horario'
                                  }
                                >
                                  <XCircle size={14} />
                                  Cancelar
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TablePagination
                page={citasPage}
                pages={citasPages}
                total={citasTotal}
                itemsPerPage={citasPerPage}
                onPageChange={onPageChange}
                disabled={loading}
              />
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

import Field, { DateInput, Input, Select, Textarea } from '../ui/Field';
import Button from '../ui/Button';
import Sheet from '../ui/Sheet';
import TarifaMultiSelect, {
  idsTarifasEnLista,
  sumTarifasValor,
  tarifasActivas,
  totalTarifasSeleccionadas,
} from '../ui/TarifaMultiSelect';
import { formatFecha, formatMoneda } from '../../utils/format';

/**
 * Modal de registro/edición de cobro.
 * `lockAgendaContext`: prellenado desde una agenda (profesional/agenda/mascota fijos).
 * `editMode`: edición de cobro pendiente (contexto bloqueado + Guardar cambios).
 * Tarifas: selección múltiple; el valor se recalcula como suma (editable).
 */
export default function CobroFormSheet({
  open,
  onClose,
  onSubmit,
  loading = false,
  title = 'Nuevo cobro',
  values,
  nombreMascotaVisible = '',
  profesionales = [],
  agendas = [],
  tarifas = [],
  onProfesionalChange,
  onAgendaChange,
  onTarifasChange,
  onFieldChange,
  lockAgendaContext = false,
  stackLevel = 0,
  /** En CobrosPage: footer con Cancelar + Pendiente + Pagar */
  creationEstadoActions = false,
  /** Edición de cobro pendiente */
  editMode = false,
  submittingEstado = null,
}) {
  function setField(key, value) {
    onFieldChange?.({ ...values, [key]: value });
  }

  const lockedContext = lockAgendaContext || editMode;
  const tarifasVisibles = tarifasActivas(tarifas);
  const selectedIds = (values.id_tarifas || []).map(String);
  const { ids: idsActivos, total: suma } = totalTarifasSeleccionadas(tarifas, selectedIds);
  const valorNum = parseFloat(values.valor);
  const canSubmit =
    !loading &&
    !!String(values.id_profesional || '').trim() &&
    !!String(values.id_agenda || '').trim() &&
    idsActivos.length > 0 &&
    !!String(values.metodo_pago || '').trim() &&
    !Number.isNaN(valorNum) &&
    valorNum >= 0 &&
    !!String(values.fecha_cobro || '').trim();

  function handleTarifasChange(nextIds) {
    if (onTarifasChange) {
      onTarifasChange(nextIds);
      return;
    }
    const ids = idsTarifasEnLista(tarifasVisibles, nextIds);
    const total = sumTarifasValor(tarifasVisibles, ids);
    onFieldChange?.({
      ...values,
      id_tarifas: ids,
      id_tarifa: ids[0] || '',
      valor: String(total),
    });
  }

  const footer = creationEstadoActions ? (
    <div
      className="ui-btn-row ui-btn-row--mobile-stack"
      style={{ justifyContent: 'flex-end', width: '100%' }}
    >
      <Button variant="ghost" onClick={onClose} disabled={loading}>
        Cancelar
      </Button>
      <Button
        variant="secondary"
        onClick={() => onSubmit?.('pendiente')}
        disabled={!canSubmit || loading}
        title={
          !String(values.metodo_pago || '').trim()
            ? 'Selecciona un método de pago'
            : undefined
        }
      >
        {loading && submittingEstado === 'pendiente'
          ? 'Guardando…'
          : 'Pendiente de pago'}
      </Button>
      <Button
        variant="primary"
        onClick={() => onSubmit?.('pagado')}
        disabled={!canSubmit || loading}
        title={
          !String(values.metodo_pago || '').trim()
            ? 'Selecciona un método de pago'
            : undefined
        }
      >
        {loading && submittingEstado === 'pagado' ? 'Guardando…' : 'Pagar'}
      </Button>
    </div>
  ) : (
    <div className="ui-btn-row" style={{ justifyContent: 'flex-end' }}>
      <Button variant="ghost" onClick={onClose} disabled={loading}>
        Cancelar
      </Button>
      <Button
        variant="primary"
        onClick={() => onSubmit?.()}
        disabled={!canSubmit}
        title={
          !String(values.metodo_pago || '').trim()
            ? 'Selecciona un método de pago'
            : undefined
        }
      >
        {loading ? 'Guardando…' : editMode ? 'Guardar cambios' : 'Guardar'}
      </Button>
    </div>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      dismissible={!loading}
      stackLevel={stackLevel}
      footer={footer}
    >
      <div className="ui-form">
        <Field label="Profesional" required>
          {lockedContext ? (
            <Input
              type="text"
              value={values.profesional_nombre || ''}
              readOnly
              disabled={loading}
            />
          ) : (
            <Select
              value={values.id_profesional}
              onChange={(e) => onProfesionalChange?.(e.target.value)}
              disabled={loading}
              required
            >
              <option value="">Seleccionar profesional</option>
              {profesionales.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Agenda" required>
          {lockedContext ? (
            <Input
              type="text"
              value={values.agenda_label || ''}
              readOnly
              disabled={loading}
            />
          ) : (
            <Select
              value={values.id_agenda}
              onChange={(e) => onAgendaChange?.(e.target.value)}
              disabled={loading || !values.id_profesional}
              required
            >
              <option value="">
                {agendas.length === 0
                  ? 'Sin citas pendientes de cobro'
                  : 'Seleccionar agenda'}
              </option>
              {agendas.map((a) => (
                <option key={a.id} value={a.id}>
                  {`${formatFecha(a.fecha)} — ${a.mascota_nombre}`}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Mascota" required>
          <Input
            type="text"
            value={nombreMascotaVisible}
            readOnly
            placeholder="Mascota (se autocompleta)"
            disabled={loading}
          />
        </Field>

        <Field label="Tarifas" required>
          <TarifaMultiSelect
            id={editMode ? 'cobro-tarifas-edit' : 'cobro-tarifas'}
            tarifas={tarifasVisibles}
            value={idsActivos}
            onChange={handleTarifasChange}
            disabled={loading || (!lockedContext && !values.id_profesional)}
            required
            emptyLabel={
              !lockedContext && !values.id_profesional
                ? 'Elige un profesional primero'
                : 'Sin tarifas configuradas'
            }
          />
        </Field>

        <Field label="Valor" required>
          <Input
            type="number"
            value={values.valor}
            onChange={(e) => setField('valor', e.target.value)}
            placeholder="Valor"
            disabled={loading}
            required
            min="0"
            step="any"
          />
          {idsActivos.length > 0 && (
            <div
              style={{
                marginTop: 6,
                fontSize: '0.75rem',
                color: 'var(--color-purple-light)',
              }}
            >
              Suma de tarifas: {formatMoneda(suma)} (puedes ajustar el valor)
            </div>
          )}
        </Field>

        <Field label="Método de pago" required>
          <Select
            value={values.metodo_pago}
            onChange={(e) => setField('metodo_pago', e.target.value)}
            disabled={loading}
            required
            aria-required="true"
          >
            <option value="">Seleccionar método de pago</option>
            <option value="Efectivo">Efectivo</option>
            <option value="Transferencia">Transferencia</option>
            <option value="Tarjeta">Tarjeta</option>
          </Select>
          {!String(values.metodo_pago || '').trim() && (
            <div
              style={{
                marginTop: 6,
                fontSize: '0.75rem',
                color: 'var(--color-purple-light)',
              }}
            >
              Obligatorio para registrar el cobro
            </div>
          )}
        </Field>

        <Field label="Observación">
          <Textarea
            value={values.observacion || ''}
            onChange={(e) => setField('observacion', e.target.value)}
            placeholder="Observación (opcional)"
            disabled={loading}
          />
        </Field>

        <Field label="Fecha de cobro" required>
          <DateInput
            value={values.fecha_cobro}
            onChange={(e) => setField('fecha_cobro', e.target.value)}
            disabled={loading}
            required
          />
        </Field>
      </div>
    </Sheet>
  );
}

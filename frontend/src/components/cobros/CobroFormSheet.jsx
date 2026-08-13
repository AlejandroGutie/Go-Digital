import Field, { DateInput, Input, Select, Textarea } from '../ui/Field';
import Button from '../ui/Button';
import Sheet from '../ui/Sheet';
import { formatFecha, formatMoneda } from '../../utils/format';

/**
 * Modal de registro de cobro (mismo diseño/campos que CobrosPage).
 * `lockAgendaContext`: prellenado desde una agenda (profesional/agenda/mascota fijos).
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
  onTarifaChange,
  onFieldChange,
  lockAgendaContext = false,
  stackLevel = 0,
}) {
  function setField(key, value) {
    onFieldChange?.({ ...values, [key]: value });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      dismissible={!loading}
      stackLevel={stackLevel}
      footer={
        <div className="ui-btn-row" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={onSubmit} disabled={loading}>
            {loading ? 'Procesando…' : 'Guardar'}
          </Button>
        </div>
      }
    >
      <div className="ui-form">
        <Field label="Profesional" required>
          {lockAgendaContext ? (
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
          {lockAgendaContext ? (
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

        <Field label="Tarifa" required>
          <Select
            value={values.id_tarifa}
            onChange={(e) => onTarifaChange?.(e.target.value)}
            disabled={loading || (!lockAgendaContext && !values.id_profesional)}
            required
          >
            <option value="">Seleccionar tarifa</option>
            {tarifas.map((t) => (
              <option key={t.id} value={t.id}>
                {`${t.descripcion} — ${formatMoneda(t.valor)}`}
              </option>
            ))}
          </Select>
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
        </Field>

        <Field label="Método de pago" required>
          <Select
            value={values.metodo_pago}
            onChange={(e) => setField('metodo_pago', e.target.value)}
            disabled={loading}
            required
          >
            <option value="">Seleccionar método de pago</option>
            <option value="Efectivo">Efectivo</option>
            <option value="Transferencia">Transferencia</option>
            <option value="Tarjeta">Tarjeta</option>
          </Select>
        </Field>

        <Field label="Observación">
          <Textarea
            value={values.observacion}
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

import Field, { Textarea } from '../ui/Field';
import Button from '../ui/Button';
import Sheet from '../ui/Sheet';

export default function AgendasCancelarSheet({
  open,
  agendaId,
  loading = false,
  observacion = '',
  onObservacionChange,
  onClose,
  onConfirm,
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Cancelar agenda"
      dismissible={!loading}
      footer={
        <div
          className="ui-btn-row ui-btn-row--mobile-stack"
          style={{ width: '100%', justifyContent: 'flex-end' }}
        >
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Volver
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={loading}>
            {loading ? 'Cancelando…' : 'Cancelar agenda'}
          </Button>
        </div>
      }
    >
      <p
        style={{
          margin: '0 0 14px',
          fontSize: '0.875rem',
          color: 'var(--color-purple-light)',
          lineHeight: 1.5,
        }}
      >
        ¿Cancelar la cita <b>#{agendaId}</b>? El registro se conserva en historial, la franja
        horaria quedará libre y el cobro asociado pasará a estado anulado.
      </p>
      <Field id="observacion-cancelacion" label="Observación de cancelación">
        <Textarea
          id="observacion-cancelacion"
          value={observacion}
          onChange={(e) => onObservacionChange?.(e.target.value)}
          placeholder="Motivo de la cancelación (opcional)"
          disabled={loading}
          rows={3}
        />
      </Field>
    </Sheet>
  );
}

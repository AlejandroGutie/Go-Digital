import Sheet from './Sheet';
import Button from './Button';

export default function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  loading = false,
  danger = false,
  confirmDisabled = false,
}) {
  return (
    <Sheet
      open={open}
      onClose={loading ? undefined : onClose}
      dismissible={!loading}
      title={title}
      footer={
        <div
          className="ui-btn-row ui-btn-row--mobile-stack"
          style={{ width: '100%', justifyContent: 'flex-end' }}
        >
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={loading || confirmDisabled}
          >
            {loading ? 'Procesando…' : confirmLabel}
          </Button>
        </div>
      }
    >
      <div style={{ fontSize: '0.875rem', color: 'var(--color-purple-light)', lineHeight: 1.5 }}>
        {children}
      </div>
    </Sheet>
  );
}

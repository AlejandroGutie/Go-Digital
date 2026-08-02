import { useEffect } from 'react';
import { X } from 'lucide-react';
import Button from './Button';

/**
 * Bottom sheet on mobile, centered dialog on desktop.
 * Preserves children content; only presentation layer.
 */
export default function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape' && dismissible) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return (
    <div className="ui-sheet-root" role="dialog" aria-modal="true" aria-label={title}>
      <div
        className="ui-sheet-backdrop"
        onClick={() => dismissible && onClose?.()}
        aria-hidden="true"
      />
      <div
        className={`ui-sheet-panel ${size === 'lg' ? 'ui-sheet-panel--lg' : ''}`.trim()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ui-sheet-handle" aria-hidden="true" />
        <div className="ui-sheet-header">
          <div style={{ minWidth: 0 }}>
            {title ? <h3 className="ui-sheet-title">{title}</h3> : null}
            {description ? <p className="ui-sheet-desc">{description}</p> : null}
          </div>
          {dismissible && (
            <Button
              variant="ghost"
              icon
              aria-label="Cerrar"
              onClick={onClose}
            >
              <X size={18} strokeWidth={2.25} />
            </Button>
          )}
        </div>
        <div className="ui-sheet-body">{children}</div>
        {footer ? <div className="ui-sheet-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

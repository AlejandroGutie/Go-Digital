import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import Button from './Button';

let sheetScrollLocks = 0;
let prevHtmlOverflow = '';
let prevBodyOverflow = '';
let prevBodyOverscroll = '';
let prevBodyTouchAction = '';

function lockPageScroll() {
  if (sheetScrollLocks === 0) {
    prevHtmlOverflow = document.documentElement.style.overflow;
    prevBodyOverflow = document.body.style.overflow;
    prevBodyOverscroll = document.body.style.overscrollBehavior;
    prevBodyTouchAction = document.body.style.touchAction;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    // Evita que el fondo “tire” el gestos en Android; el sheet gestiona su scroll.
    document.body.style.touchAction = 'none';
  }
  sheetScrollLocks += 1;
}

function unlockPageScroll() {
  sheetScrollLocks = Math.max(0, sheetScrollLocks - 1);
  if (sheetScrollLocks === 0) {
    document.documentElement.style.overflow = prevHtmlOverflow;
    document.body.style.overflow = prevBodyOverflow;
    document.body.style.overscrollBehavior = prevBodyOverscroll;
    document.body.style.touchAction = prevBodyTouchAction;
  }
}

/** Zonas donde el scroll táctil nativo debe permitirse dentro del sheet. */
function isInsideSheetScroll(target) {
  return !!target?.closest?.(
    [
      '.ui-sheet-body',
      '.ui-sheet-panel',
      '.ui-combo__list',
      '.table-scroll',
      '.ui-table-wrap',
      'textarea',
      'select',
      '[contenteditable="true"]',
    ].join(', ')
  );
}

/**
 * Bottom sheet on mobile, centered dialog on desktop.
 * Preserves children content; only presentation layer.
 *
 * Nota Android: no usar touch-action:none en el root del sheet ni
 * preventDefault agresivo sobre touchmove dentro del panel — bloquea el scroll.
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
  stackLevel = 0,
}) {
  useEffect(() => {
    if (!open) return undefined;
    lockPageScroll();

    const onKey = (e) => {
      if (e.key === 'Escape' && dismissible) onClose?.();
    };

    // Solo bloquear scroll del documento detrás del sheet (backdrop / fuera del panel).
    // Dentro del panel dejamos el scroll nativo (crítico en Chrome Android).
    const onWheel = (e) => {
      if (!isInsideSheetScroll(e.target)) e.preventDefault();
    };

    const onTouchMove = (e) => {
      if (!isInsideSheetScroll(e.target)) e.preventDefault();
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      unlockPageScroll();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={`ui-sheet-root${stackLevel > 0 ? ` ui-sheet-root--stack-${stackLevel}` : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
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
    </div>,
    document.body
  );
}

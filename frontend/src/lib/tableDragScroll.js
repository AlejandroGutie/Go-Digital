/**
 * Drag-to-scroll horizontal en contenedores de tablas (.table-scroll / .ui-table-wrap).
 * Touch nativo no se intercepta; solo pointer mouse/pen.
 */
const SCROLL_SEL = '.table-scroll, .ui-table-wrap';
const INTERACTIVE_SEL =
  'a, button, input, select, textarea, label, option, summary, [role="button"], [contenteditable="true"]';

export function enableTableDragScroll(root = typeof document !== 'undefined' ? document : null) {
  if (!root) return () => {};

  let drag = null;

  function clearDrag(el, pointerId) {
    if (!el) return;
    el.classList.remove('is-drag-scrolling');
    try {
      if (pointerId != null) el.releasePointerCapture(pointerId);
    } catch {
      /* ignore */
    }
  }

  function endDrag() {
    if (!drag) return;
    const { el, pointerId } = drag;
    drag = null;
    clearDrag(el, pointerId);
  }

  function onPointerDown(e) {
    if (e.pointerType === 'touch') return;
    if (e.button !== 0) return;

    const el = e.target.closest?.(SCROLL_SEL);
    if (!el || !root.contains(el)) return;
    if (e.target.closest?.(INTERACTIVE_SEL)) return;
    if (el.scrollWidth <= el.clientWidth + 1) return;

    drag = {
      el,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: el.scrollLeft,
      moved: false,
      pointerId: e.pointerId,
    };
    el.classList.add('is-drag-scrolling');
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (!drag.moved) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      // Gesto vertical: soltar para no pelear con selección/scroll de página
      if (Math.abs(dy) > Math.abs(dx)) {
        endDrag();
        return;
      }
      drag.moved = true;
    }

    e.preventDefault();
    drag.el.scrollLeft = drag.scrollLeft - dx;
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    endDrag();
  }

  root.addEventListener('pointerdown', onPointerDown, { capture: true });
  root.addEventListener('pointermove', onPointerMove, { passive: false });
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', onPointerUp);
  root.addEventListener('lostpointercapture', onPointerUp);

  return () => {
    endDrag();
    root.removeEventListener('pointerdown', onPointerDown, { capture: true });
    root.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('pointerup', onPointerUp);
    root.removeEventListener('pointercancel', onPointerUp);
    root.removeEventListener('lostpointercapture', onPointerUp);
  };
}

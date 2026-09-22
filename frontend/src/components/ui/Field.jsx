import { useEffect, useRef, useState } from 'react';
import { formatFecha, toDateOnly } from '../../utils/format';

export default function Field({
  id,
  label,
  required,
  hint,
  children,
  className = '',
}) {
  return (
    <div className={`ui-field ${className}`.trim()}>
      {label != null && (
        <label className="ui-field__label" htmlFor={id}>
          {label}
          {required ? <span className="ui-field__req">*</span> : null}
        </label>
      )}
      {children}
      {hint ? <span className="ui-field__hint">{hint}</span> : null}
    </div>
  );
}

export function Input({ className = '', ...rest }) {
  return <input className={`ui-input ${className}`.trim()} {...rest} />;
}

/** iOS/iPadOS: showPicker() no abre type=date; hace falta el overlay nativo. */
function prefersNativeDateOverlay() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  // iPadOS desktop UA
  if (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1) {
    return true;
  }
  return false;
}

/**
 * Campo de fecha con visualización/entrada dd/mm/yyyy.
 * El value y onChange usan ISO YYYY-MM-DD (misma API que input type="date").
 *
 * En Android/desktop el calendario se abre con showPicker() diferido para que
 * el mismo toque de apertura no seleccione un día y cierre el control.
 */
export function DateInput({
  className = '',
  value = '',
  onChange,
  max,
  min,
  disabled,
  required,
  id,
  name,
  style,
  ...rest
}) {
  const isoValue = toDateOnly(value) || '';
  const maxIso = toDateOnly(max) || undefined;
  const minIso = toDateOnly(min) || undefined;
  const [text, setText] = useState(isoValue ? formatFecha(isoValue) : '');
  const pickerRef = useRef(null);
  const suppressChangeUntilRef = useRef(0);
  const isoValueRef = useRef(isoValue);
  isoValueRef.current = isoValue;
  const useOverlay = prefersNativeDateOverlay();

  useEffect(() => {
    const next = isoValue ? formatFecha(isoValue) : '';
    setText((prev) => (toDateOnly(prev) === isoValue ? prev : next));
  }, [isoValue]);

  function emit(iso) {
    if (!onChange) return;
    onChange({
      target: { value: iso, name: name || '', id: id || '' },
      currentTarget: { value: iso, name: name || '', id: id || '' },
    });
  }

  function inBounds(iso) {
    if (!iso) return true;
    if (minIso && iso < minIso) return false;
    if (maxIso && iso > maxIso) return false;
    return true;
  }

  function commitText(raw) {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) {
      setText('');
      emit('');
      return;
    }
    const iso = toDateOnly(trimmed);
    if (iso && inBounds(iso)) {
      setText(formatFecha(iso));
      emit(iso);
      return;
    }
    setText(isoValue ? formatFecha(isoValue) : '');
  }

  function handleTextChange(e) {
    const raw = e.target.value;
    setText(raw);
    if (!raw.trim()) {
      emit('');
      return;
    }
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw.trim())) {
      const iso = toDateOnly(raw);
      if (iso && inBounds(iso)) emit(iso);
    }
  }

  function restorePickerDomValue(el) {
    if (!el) return;
    el.value = isoValueRef.current || '';
  }

  function handlePickerChange(e) {
    const el = e.target;
    const iso = toDateOnly(el.value) || '';
    const prev = isoValueRef.current || '';

    // Cambio espurio al abrir (p. ej. vacío → hoy en Android) o mismo valor al cerrar.
    if (Date.now() < suppressChangeUntilRef.current) {
      restorePickerDomValue(el);
      return;
    }
    if (iso === prev) return;

    setText(iso ? formatFecha(iso) : '');
    emit(iso);
  }

  function launchNativePicker() {
    const el = pickerRef.current;
    if (!el || disabled) return;

    // Ventana corta: ignora onChange disparado al abrir, no al elegir el usuario.
    suppressChangeUntilRef.current = Date.now() + 350;

    const run = () => {
      try {
        if (typeof el.showPicker === 'function') {
          el.showPicker();
          return;
        }
      } catch {
        /* fall through */
      }
      try {
        el.focus({ preventScroll: true });
        el.click();
      } catch {
        /* ignore */
      }
    };

    // Diferir tras pointerup/click para que el dedo ya no esté sobre el día del calendario.
    window.setTimeout(run, 50);
  }

  function handleOpenPointerDown(e) {
    // Evita que el text input robe el foco y el teclado tape el picker en móvil.
    e.preventDefault();
  }

  return (
    <div className="ui-date-input">
      <input
        type="text"
        className={`ui-input ui-date-input__text ${className}`.trim()}
        value={text}
        onChange={handleTextChange}
        onBlur={() => commitText(text)}
        placeholder="dd/mm/yyyy"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        required={required}
        id={id}
        name={name}
        style={style}
        aria-label={rest['aria-label']}
        {...rest}
      />
      {useOverlay ? (
        /*
          iOS: el toque debe caer en type="date" (showPicker no abre date).
          El indicador cubre solo el ícono; no diferimos showPicker.
        */
        <input
          ref={pickerRef}
          type="date"
          className="ui-date-input__picker"
          value={isoValue}
          onChange={handlePickerChange}
          onFocus={() => {
            suppressChangeUntilRef.current = Date.now() + 350;
          }}
          max={maxIso}
          min={minIso}
          disabled={disabled}
          tabIndex={-1}
          aria-label="Abrir calendario"
        />
      ) : (
        <>
          <input
            ref={pickerRef}
            type="date"
            className="ui-date-input__picker ui-date-input__picker--sr"
            value={isoValue}
            onChange={handlePickerChange}
            max={maxIso}
            min={minIso}
            disabled={disabled}
            tabIndex={-1}
            aria-hidden="true"
          />
          <button
            type="button"
            className="ui-date-input__open"
            disabled={disabled}
            aria-label="Abrir calendario"
            onPointerDown={handleOpenPointerDown}
            onClick={launchNativePicker}
          />
        </>
      )}
    </div>
  );
}

export function Select({ className = '', children, ...rest }) {
  return (
    <select className={`ui-select ${className}`.trim()} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className = '', ...rest }) {
  return <textarea className={`ui-textarea ${className}`.trim()} {...rest} />;
}

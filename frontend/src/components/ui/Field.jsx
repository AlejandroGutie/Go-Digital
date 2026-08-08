import { useEffect, useState } from 'react';
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

/**
 * Campo de fecha con visualización/entrada dd/mm/yyyy.
 * El value y onChange usan ISO YYYY-MM-DD (misma API que input type="date").
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

  function handlePickerChange(e) {
    const iso = toDateOnly(e.target.value);
    setText(iso ? formatFecha(iso) : '');
    emit(iso);
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
      {/*
        Cubre el ícono del calendario. El toque/clic directo en type="date"
        abre el picker nativo (necesario en iOS; showPicker no soporta date ahí).
      */}
      <input
        type="date"
        className="ui-date-input__picker"
        value={isoValue}
        onChange={handlePickerChange}
        max={maxIso}
        min={minIso}
        disabled={disabled}
        tabIndex={-1}
        aria-label="Abrir calendario"
      />
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

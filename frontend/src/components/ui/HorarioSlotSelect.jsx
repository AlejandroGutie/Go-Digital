import Field, { Select } from './Field';
import {
  asegurarSlotEnLista,
  generarBloquesHorarios,
  labelHoraSlot,
  toTimeHHMM,
} from '../../utils/horarios';

/**
 * Select de hora en intervalos fijos (default 30 min).
 * `value` / `onChange` usan "HH:MM".
 */
export default function HorarioSlotSelect({
  id,
  value,
  onChange,
  slots = [],
  disabled = false,
  required = false,
  placeholder = 'Seleccionar hora',
  emptyLabel = 'Sin horarios disponibles',
  style,
  includeValueIfMissing = true,
}) {
  const normalized = toTimeHHMM(value);
  const options = includeValueIfMissing
    ? asegurarSlotEnLista(slots, normalized)
    : slots || [];

  return (
    <Select
      id={id}
      value={normalized}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={disabled || options.length === 0}
      required={required}
      style={style}
      aria-required={required || undefined}
    >
      <option value="">
        {options.length === 0 ? emptyLabel : placeholder}
      </option>
      {options.map((slot) => (
        <option key={slot} value={slot}>
          {labelHoraSlot(slot)}
        </option>
      ))}
    </Select>
  );
}

/** Field wrapper opcional con label. */
export function HorarioSlotField({
  id,
  label,
  required,
  ...selectProps
}) {
  return (
    <Field id={id} label={label} required={required}>
      <HorarioSlotSelect id={id} required={required} {...selectProps} />
    </Field>
  );
}

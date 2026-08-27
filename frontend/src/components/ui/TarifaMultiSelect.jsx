/**
 * Selector múltiple de tarifas (checkboxes + chips).
 * Conserva el look del form existente; no cambia layout global.
 */
import { formatMoneda } from '../../utils/format';

export function sumTarifasValor(tarifas = [], selectedIds = []) {
  const set = new Set((selectedIds || []).map(String));
  return (tarifas || [])
    .filter((t) => set.has(String(t.id)))
    .reduce((acc, t) => acc + (Number(t.valor) || 0), 0);
}

export function formatTarifasLabel(tarifas = []) {
  if (!tarifas?.length) return '—';
  if (tarifas.length === 1) {
    const t = tarifas[0];
    const desc = t.descripcion || t.tarifa_descripcion || 'Tarifa';
    const valor = t.valor ?? t.tarifa_valor;
    if (valor == null || valor === '') return desc;
    return `${desc} · ${formatMoneda(valor)}`;
  }
  const total = tarifas.reduce((acc, t) => acc + (Number(t.valor ?? t.tarifa_valor) || 0), 0);
  return `${tarifas.length} tarifas · ${formatMoneda(total)}`;
}

export default function TarifaMultiSelect({
  id = 'tarifas-multi',
  tarifas = [],
  value = [],
  onChange,
  disabled = false,
  required = false,
  emptyLabel = 'Sin tarifas configuradas',
}) {
  const selected = (value || []).map(String);
  const selectedSet = new Set(selected);

  function toggle(tid) {
    if (disabled) return;
    const key = String(tid);
    const next = selectedSet.has(key)
      ? selected.filter((x) => x !== key)
      : [...selected, key];
    onChange?.(next);
  }

  function remove(tid) {
    if (disabled) return;
    onChange?.(selected.filter((x) => x !== String(tid)));
  }

  const selectedRows = (tarifas || []).filter((t) => selectedSet.has(String(t.id)));
  const total = sumTarifasValor(tarifas, selected);

  return (
    <div className="tarifa-multi" id={id}>
      {selectedRows.length > 0 && (
        <div className="tarifa-multi__chips" aria-live="polite">
          {selectedRows.map((t) => (
            <button
              key={t.id}
              type="button"
              className="tarifa-multi__chip"
              onClick={() => remove(t.id)}
              disabled={disabled}
              title="Quitar tarifa"
            >
              <span>{t.descripcion || 'Tarifa'}</span>
              <span className="tarifa-multi__chip-val">{formatMoneda(t.valor)}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}

      <div
        className="tarifa-multi__list"
        role="group"
        aria-required={required || undefined}
        aria-label="Seleccionar tarifas"
      >
        {tarifas.length === 0 ? (
          <div className="tarifa-multi__empty">{emptyLabel}</div>
        ) : (
          tarifas.map((t) => {
            const checked = selectedSet.has(String(t.id));
            const inputId = `${id}-${t.id}`;
            return (
              <label
                key={t.id}
                htmlFor={inputId}
                className={`tarifa-multi__option${checked ? ' tarifa-multi__option--on' : ''}`}
              >
                <input
                  id={inputId}
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(t.id)}
                />
                <span className="tarifa-multi__option-text">
                  <span>{t.descripcion || 'Tarifa'}</span>
                  <span className="tarifa-multi__option-val">{formatMoneda(t.valor)}</span>
                </span>
              </label>
            );
          })
        )}
      </div>

      {selected.length > 0 && (
        <div className="tarifa-multi__total">
          Total tarifas: <strong>{formatMoneda(total)}</strong>
        </div>
      )}
    </div>
  );
}

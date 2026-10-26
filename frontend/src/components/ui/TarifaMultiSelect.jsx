/**
 * Selector múltiple de tarifas como botones toggle.
 * Orden: seleccionadas → domicilio/transporte → resto.
 */
import { useLayoutEffect, useRef } from 'react';
import { formatMoneda } from '../../utils/format';

function normalizarDescTarifa(t) {
  return String(t?.descripcion || t?.tarifa_descripcion || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function sumTarifasValor(tarifas = [], selectedIds = []) {
  const set = new Set((selectedIds || []).map(String));
  return (tarifas || [])
    .filter((t) => set.has(String(t.id)))
    .reduce((acc, t) => acc + (Number(t.valor ?? t.tarifa_valor) || 0), 0);
}

/** Tarifas visibles en el selector (activas). */
export function tarifasActivas(tarifas = []) {
  return (tarifas || []).filter((t) => t.activo !== false);
}

/** IDs seleccionados que existen en la lista de tarifas (p. ej. solo activas). */
export function idsTarifasEnLista(tarifas = [], selectedIds = []) {
  const list = tarifas || [];
  const allowed = new Set(list.map((t) => String(t.id)));
  return (selectedIds || []).map(String).filter((id) => allowed.has(id));
}

/** Suma coherente: solo tarifas activas y IDs presentes en esa lista. */
export function totalTarifasSeleccionadas(tarifas = [], selectedIds = []) {
  const activas = tarifasActivas(tarifas);
  const ids = idsTarifasEnLista(activas, selectedIds);
  return {
    ids,
    total: sumTarifasValor(activas, ids),
    tarifas: activas,
  };
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

function esServicioIntegral(t) {
  return normalizarDescTarifa(t).includes('servicio integral');
}

function esDomicilioOTransporte(t) {
  const desc = normalizarDescTarifa(t);
  return desc.includes('domicilio') || desc.includes('transporte');
}

/**
 * Si hay al menos un Servicio integral seleccionado, oculta el resto de
 * servicios integrales (gato/perro) para dejar visibles extras y la elegida.
 */
export function filtrarTarifasIntegralUnica(tarifas = [], selectedIds = []) {
  const list = tarifas || [];
  const selectedSet = new Set((selectedIds || []).map(String));
  const hayIntegralSeleccionada = list.some(
    (t) => selectedSet.has(String(t.id)) && esServicioIntegral(t)
  );
  if (!hayIntegralSeleccionada) return list;
  return list.filter(
    (t) => !esServicioIntegral(t) || selectedSet.has(String(t.id))
  );
}

/**
 * Orden: seleccionadas (orden de value) → domicilio/transporte → resto.
 * Conserva el orden relativo del catálogo dentro de cada grupo.
 */
export function ordenarTarifasSeleccionadasPrimero(tarifas = [], selectedIds = []) {
  const list = tarifas || [];
  const selected = (selectedIds || []).map(String);
  const selectedSet = new Set(selected);
  const byId = new Map(list.map((t) => [String(t.id), t]));
  const first = [];
  for (const id of selected) {
    const row = byId.get(id);
    if (row) first.push(row);
  }
  const rest = list.filter((t) => !selectedSet.has(String(t.id)));
  const domicilioTransporte = rest.filter(esDomicilioOTransporte);
  const otras = rest.filter((t) => !esDomicilioOTransporte(t));
  return [...first, ...domicilioTransporte, ...otras];
}

function leerScrollY() {
  return (
    window.scrollY ||
    window.pageYOffset ||
    document.documentElement.scrollTop ||
    document.body.scrollTop ||
    0
  );
}

function fijarScrollY(y) {
  window.scrollTo(0, y);
  if (document.documentElement) document.documentElement.scrollTop = y;
  if (document.body) document.body.scrollTop = y;
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
  const visibles = filtrarTarifasIntegralUnica(tarifas, selected);
  const ordered = ordenarTarifasSeleccionadasPrimero(visibles, selected);
  const scrollLockRef = useRef(null);

  useLayoutEffect(() => {
    if (scrollLockRef.current == null) return;
    const y = scrollLockRef.current;
    scrollLockRef.current = null;
    fijarScrollY(y);
    requestAnimationFrame(() => fijarScrollY(y));
  }, [selected.join('|'), ordered.length]);

  function toggle(tid) {
    if (disabled) return;
    scrollLockRef.current = leerScrollY();
    const key = String(tid);
    if (selectedSet.has(key)) {
      onChange?.(selected.filter((x) => x !== key));
      return;
    }
    const row = (tarifas || []).find((t) => String(t.id) === key);
    // Al elegir un Servicio integral, quitar cualquier otra integral previa.
    let next = selected;
    if (row && esServicioIntegral(row)) {
      next = selected.filter((idSel) => {
        const t = (tarifas || []).find((x) => String(x.id) === idSel);
        return !t || !esServicioIntegral(t);
      });
    }
    onChange?.([...next, key]);
  }

  const total = sumTarifasValor(tarifas, selected);

  return (
    <div className="tarifa-multi" id={id}>
      <div
        className="tarifa-multi__buttons"
        role="group"
        aria-required={required || undefined}
        aria-label="Seleccionar tarifas"
      >
        {tarifas.length === 0 ? (
          <div className="tarifa-multi__empty">{emptyLabel}</div>
        ) : (
          ordered.map((t) => {
            const checked = selectedSet.has(String(t.id));
            return (
              <button
                key={t.id}
                type="button"
                id={`${id}-${t.id}`}
                className={`tarifa-multi__btn${checked ? ' tarifa-multi__btn--on' : ''}`}
                aria-pressed={checked}
                disabled={disabled}
                onMouseDown={(e) => {
                  // Evita que el foco mueva el viewport (salto a arriba en móvil).
                  e.preventDefault();
                }}
                onClick={() => toggle(t.id)}
              >
                <span className="tarifa-multi__btn-text">
                  {t.descripcion || 'Tarifa'}
                </span>
                <span className="tarifa-multi__btn-val">{formatMoneda(t.valor)}</span>
              </button>
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

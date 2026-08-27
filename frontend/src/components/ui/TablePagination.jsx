import Button from './Button';
import { Select } from './Field';

export const PAGE_SIZE_OPTIONS = [5, 10, 20];
export const INFORMES_LIBRES_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
export const DEFAULT_PAGE_SIZE = 10;

/** Selector “N por página” (mismo patrón que Informes). */
export function PageSizeSelect({
  value,
  onChange,
  disabled = false,
  id,
  options = PAGE_SIZE_OPTIONS,
}) {
  return (
    <Select
      id={id}
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || DEFAULT_PAGE_SIZE)}
      disabled={disabled}
      aria-label="Filas por página"
      style={{ maxWidth: 140, flex: '0 0 auto' }}
    >
      {options.map((n) => (
        <option key={n} value={n}>
          {n} por página
        </option>
      ))}
    </Select>
  );
}

/**
 * Pie de paginación: Anterior / Mostrando X a Y de Z / Siguiente.
 * Visible cuando total > 0 (igual que Informes).
 */
export default function TablePagination({
  page,
  pages,
  total,
  itemsPerPage,
  onPageChange,
  disabled = false,
}) {
  if (!total || total <= 0) return null;

  const safePages = Math.max(1, pages || 1);
  const safePage = Math.min(Math.max(1, page || 1), safePages);
  const fromRecord = (safePage - 1) * itemsPerPage + 1;
  const toRecord = Math.min(safePage * itemsPerPage, total);

  return (
    <div className="ui-pagination">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onPageChange(safePage - 1)}
        disabled={disabled || safePage <= 1}
      >
        Anterior
      </Button>
      <span className="ui-pagination__label">
        Mostrando {fromRecord} a {toRecord} de {total} resultados
        {safePages > 1 ? ` — Página ${safePage} de ${safePages}` : ''}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onPageChange(safePage + 1)}
        disabled={disabled || safePage >= safePages}
      >
        Siguiente
      </Button>
    </div>
  );
}

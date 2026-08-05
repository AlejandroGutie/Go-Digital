import { useEffect, useMemo, useState } from 'react';
import { Search, Stethoscope, X } from 'lucide-react';
import { formatMoneda, formatMesLabel } from '../../utils/exportInformes';
import EmptyState from '../EmptyState';
import Button from '../ui/Button';
import { Input, Select } from '../ui/Field';

const PAGE_SIZE_OPTIONS = [5, 10, 20];
const DEFAULT_PAGE_SIZE = 10;

function TableShell({ title, toolbar, children, footer }) {
  return (
    <div className="ui-card ui-card--flush" style={{ marginBottom: 24 }}>
      <div className="ui-card__head">{title}</div>
      {toolbar ? (
        <div style={{ padding: '12px 16px 0' }}>{toolbar}</div>
      ) : null}
      <div className="table-scroll" style={{ padding: toolbar || footer ? '12px 0 0' : 0 }}>
        {children}
      </div>
      {footer ? <div style={{ padding: '12px 16px 16px' }}>{footer}</div> : null}
    </div>
  );
}

export function TablaProfesionales({ rows, filtros = {} }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGE_SIZE);

  const filtrosKey = [
    filtros.fecha_desde || '',
    filtros.fecha_hasta || '',
    filtros.id_profesional || '',
    filtros.estado || '',
  ].join('|');

  // Paso 1 — filas ya agregadas por el dashboard (fechas/estado) + filtro de profesional
  const scopedRows = useMemo(() => {
    let list = rows || [];
    const idProf = filtros.id_profesional ? String(filtros.id_profesional) : '';

    if (idProf) {
      list = list.filter((p) => String(p.id) === idProf);
    } else {
      // Solo profesionales con actividad en el periodo/filtros superiores
      list = list.filter(
        (p) =>
          Number(p.atenciones) > 0 ||
          Number(p.ingresos) > 0 ||
          Number(p.pagado) > 0 ||
          Number(p.pendiente) > 0 ||
          Number(p.citas_agenda) > 0
      );
    }

    return list;
  }, [rows, filtros.id_profesional]);

  // Al cambiar filtros superiores o el dataset, reiniciar búsqueda local y página
  useEffect(() => {
    setSearchTerm('');
    setCurrentPage(1);
  }, [filtrosKey, rows]);

  // Paso 2 — búsqueda local sobre el resultado del Paso 1 (todo el set, no solo la página)
  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return scopedRows;
    return scopedRows.filter((p) => (p.nombre || '').toLowerCase().includes(q));
  }, [scopedRows, searchTerm]);

  const total = filteredRows.length;
  const pages = Math.max(1, Math.ceil(total / itemsPerPage) || 1);
  const page = Math.min(currentPage, pages);

  // Paso 3 — paginación
  const pageRows = useMemo(() => {
    const from = (page - 1) * itemsPerPage;
    return filteredRows.slice(from, from + itemsPerPage);
  }, [filteredRows, page, itemsPerPage]);

  const fromRecord = total === 0 ? 0 : (page - 1) * itemsPerPage + 1;
  const toRecord = Math.min(page * itemsPerPage, total);

  const hasTopFilters = !!(
    filtros.fecha_desde ||
    filtros.fecha_hasta ||
    filtros.id_profesional ||
    filtros.estado
  );

  function handleSearchChange(value) {
    setSearchTerm(value);
    setCurrentPage(1);
  }

  function handlePageSizeChange(value) {
    setItemsPerPage(Number(value) || DEFAULT_PAGE_SIZE);
    setCurrentPage(1);
  }

  function goToPage(p) {
    setCurrentPage(Math.max(1, Math.min(p, pages)));
  }

  const emptyTitle = searchTerm.trim()
    ? 'No se encontraron profesionales que coincidan con la búsqueda'
    : 'No se encontraron resultados para los filtros seleccionados';

  const emptyDescription = searchTerm.trim()
    ? `Sin resultados para “${searchTerm.trim()}” dentro del resumen filtrado`
    : hasTopFilters
      ? 'Prueba otro rango de fechas, profesional o estado, o limpia los filtros superiores'
      : 'No hay movimientos por profesional en el periodo';

  return (
    <TableShell
      title="Resumen por profesional"
      toolbar={
        <div className="ui-toolbar" style={{ marginBottom: 12 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-purple-light)',
                pointerEvents: 'none',
              }}
            />
            <Input
              type="text"
              placeholder="Buscar por nombre del profesional…"
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              style={{ paddingLeft: 40 }}
              aria-label="Buscar profesional"
            />
          </div>
          {searchTerm && (
            <Button variant="ghost" size="sm" onClick={() => handleSearchChange('')}>
              <X size={16} />
              Limpiar
            </Button>
          )}
          <Select
            value={itemsPerPage}
            onChange={(e) => handlePageSizeChange(e.target.value)}
            aria-label="Filas por página"
            style={{ maxWidth: 140, flex: '0 0 auto' }}
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} por página
              </option>
            ))}
          </Select>
          {(searchTerm || hasTopFilters) && (
            <span className="ui-toolbar__meta">
              {total} resultado{total !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      }
      footer={
        total > 0 ? (
          <div className="ui-pagination">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
            >
              Anterior
            </Button>
            <span className="ui-pagination__label">
              Mostrando {fromRecord} a {toRecord} de {total} resultados
              {pages > 1 ? ` — Página ${page} de ${pages}` : ''}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => goToPage(page + 1)}
              disabled={page >= pages}
            >
              Siguiente
            </Button>
          </div>
        ) : null
      }
    >
      {total === 0 ? (
        <div style={{ padding: '8px 16px 16px' }}>
          <EmptyState
            icon={<Stethoscope size={24} />}
            title={emptyTitle}
            description={emptyDescription}
          />
        </div>
      ) : (
        <table className="ui-table">
          <thead>
            <tr>
              {['Profesional', 'Atenciones', 'Citas agenda', 'Ingresos', 'Pagado', 'Pendiente'].map(
                (h) => (
                  <th
                    key={h}
                    style={{ textAlign: h === 'Profesional' ? 'left' : 'right' }}
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((p) => (
              <tr key={p.id}>
                <td>{p.nombre}</td>
                <td className="ui-num" style={{ textAlign: 'right' }}>
                  {p.atenciones}
                </td>
                <td className="ui-num" style={{ textAlign: 'right' }}>
                  {p.citas_agenda ?? 0}
                </td>
                <td className="ui-num" style={{ textAlign: 'right' }}>
                  {formatMoneda(p.ingresos)}
                </td>
                <td className="ui-num" style={{ textAlign: 'right' }}>
                  {formatMoneda(p.pagado)}
                </td>
                <td className="ui-num" style={{ textAlign: 'right' }}>
                  {formatMoneda(p.pendiente)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TableShell>
  );
}


export function TablaMensual({ rows }) {
  return (
    <TableShell title="Histórico mensual">
      <table className="ui-table">
        <thead>
          <tr>
            {['Mes', 'Atenciones', 'Ingresos', 'Pagado', 'Pendiente'].map((h) => (
              <th key={h} style={{ textAlign: h === 'Mes' ? 'left' : 'right' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(rows || []).length === 0 ? (
            <tr>
              <td
                colSpan={5}
                style={{
                  padding: 16,
                  textAlign: 'center',
                  color: 'var(--color-purple-light)',
                }}
              >
                Sin histórico mensual
              </td>
            </tr>
          ) : (
            rows.map((m) => (
              <tr key={m.mes}>
                <td>{formatMesLabel(m.mes)}</td>
                <td className="ui-num" style={{ textAlign: 'right' }}>
                  {m.atenciones}
                </td>
                <td className="ui-num" style={{ textAlign: 'right' }}>
                  {formatMoneda(m.ingresos)}
                </td>
                <td className="ui-num" style={{ textAlign: 'right' }}>
                  {formatMoneda(m.pagado)}
                </td>
                <td className="ui-num" style={{ textAlign: 'right' }}>
                  {formatMoneda(m.pendiente)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </TableShell>
  );
}

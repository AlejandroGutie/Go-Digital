import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_PAGE_SIZE } from '../components/ui/TablePagination';

/**
 * Paginación cliente: filtra/slice sobre el array completo (ya filtrado por el caller).
 * `resetKey` cambia → vuelve a página 1 (p. ej. cambio de profesional o búsqueda).
 */
export function useClientTablePagination(rows, resetKey = '') {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [resetKey]);

  const list = rows || [];
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / itemsPerPage) || 1);
  const page = Math.min(currentPage, pages);

  const pageRows = useMemo(() => {
    const from = (page - 1) * itemsPerPage;
    return list.slice(from, from + itemsPerPage);
  }, [list, page, itemsPerPage]);

  function handlePageSizeChange(size) {
    setItemsPerPage(Number(size) || DEFAULT_PAGE_SIZE);
    setCurrentPage(1);
  }

  function goToPage(p) {
    setCurrentPage(Math.max(1, Math.min(p, pages)));
  }

  return {
    pageRows,
    page,
    pages,
    total,
    itemsPerPage,
    handlePageSizeChange,
    goToPage,
    setCurrentPage,
  };
}

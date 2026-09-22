import { useEffect, useMemo, useRef, useState } from 'react';
import { listProfesionales } from '../api/profesionalesApi';
import { getMascotasDeCuidador, listCuidadores } from '../api/cuidadoresApi';
import { normalizeListPayload } from '../api/normalize';
import {
  AGENDA_LIST_LIMIT,
  filtrarMascotasLocal,
} from '../pages/agendas/agendaPageHelpers';

/**
 * Catálogo de profesionales / cuidadores / mascotas para AgendasPage:
 * loaders, init, debounce de búsqueda y click-outside de combos.
 */
export function useAgendasCatalog({ addToast } = {}) {
  const [profesionales, setProfesionales] = useState([]);
  const [cuidadores, setCuidadores] = useState([]);
  const [mascotas, setMascotas] = useState([]);
  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError] = useState(null);

  const [busquedaProf, setBusquedaProf] = useState('');
  const [listaAbierta, setListaAbierta] = useState(false);
  const [busquedaCuidador, setBusquedaCuidador] = useState('');
  const [listaCuidadoresAbierta, setListaCuidadoresAbierta] = useState(false);
  const [busquedaMascota, setBusquedaMascota] = useState('');
  const [listaMascotasAbierta, setListaMascotasAbierta] = useState(false);

  const [profSel, setProfSel] = useState(null);
  const [cuidadorSel, setCuidadorSel] = useState(null);
  const [mascotaId, setMascotaId] = useState('');

  const buscadorRef = useRef(null);
  const buscadorCuidadorRef = useRef(null);
  const buscadorMascotaRef = useRef(null);
  const cuidadorSearchReq = useRef(0);
  const mascotasCuidadorReq = useRef(0);
  const profesionalSearchReq = useRef(0);

  async function cargarCuidadores(search = '') {
    const reqId = ++cuidadorSearchReq.current;
    const res = await listCuidadores(1, AGENDA_LIST_LIMIT, search);
    if (reqId !== cuidadorSearchReq.current) return;
    setCuidadores(normalizeListPayload(res));
  }

  async function cargarMascotasDeCuidador(idCuidador) {
    const reqId = ++mascotasCuidadorReq.current;
    const res = await getMascotasDeCuidador(idCuidador);
    if (reqId !== mascotasCuidadorReq.current) return [];
    const rows = normalizeListPayload(res).filter(
      (m) => m?.id != null && m.activo !== false
    );
    setMascotas(rows);
    return rows;
  }

  async function cargarProfesionales(search = '') {
    const reqId = ++profesionalSearchReq.current;
    const res = await listProfesionales(1, AGENDA_LIST_LIMIT, search);
    if (reqId !== profesionalSearchReq.current) return;
    setProfesionales(normalizeListPayload(res));
  }

  useEffect(() => {
    async function init() {
      setInitLoading(true);
      setInitError(null);
      try {
        const [resProf, resCuid] = await Promise.all([
          listProfesionales(1, AGENDA_LIST_LIMIT),
          listCuidadores(1, AGENDA_LIST_LIMIT),
        ]);
        setProfesionales(normalizeListPayload(resProf));
        setCuidadores(normalizeListPayload(resCuid));
      } catch (e) {
        const msg =
          e?.message ||
          'No se pudieron cargar profesionales o cuidadores (sesión, red o permisos de base de datos).';
        setInitError(msg);
        addToast?.(msg, 'error');
      } finally {
        setInitLoading(false);
      }
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Actualiza profesionales al buscar (incluye recién creados)
  useEffect(() => {
    if (profSel) return undefined;
    const q = busquedaProf.trim();
    const timer = setTimeout(() => {
      cargarProfesionales(q).catch((e) => {
        addToast?.(
          e?.message || 'No se pudo actualizar el listado de profesionales',
          'error'
        );
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [busquedaProf, profSel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Actualiza cuidadores al buscar (crear cita)
  useEffect(() => {
    if (!profSel) return undefined;
    if (cuidadorSel) return undefined;
    const q = busquedaCuidador.trim();
    const timer = setTimeout(() => {
      cargarCuidadores(q).catch((e) => {
        addToast?.(
          e?.message || 'No se pudo actualizar el listado de cuidadores',
          'error'
        );
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [busquedaCuidador, profSel, cuidadorSel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handleClickOutside(e) {
      if (buscadorRef.current && !buscadorRef.current.contains(e.target)) {
        setListaAbierta(false);
      }
      if (
        buscadorCuidadorRef.current &&
        !buscadorCuidadorRef.current.contains(e.target)
      ) {
        setListaCuidadoresAbierta(false);
      }
      if (
        buscadorMascotaRef.current &&
        !buscadorMascotaRef.current.contains(e.target)
      ) {
        setListaMascotasAbierta(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const profesionalesFiltrados = profesionales;
  const cuidadoresFiltrados = cuidadores;
  const mascotasFiltradas = useMemo(
    () => filtrarMascotasLocal(mascotas, mascotaId ? '' : busquedaMascota),
    [mascotas, busquedaMascota, mascotaId]
  );

  function limpiarMascotaSeleccion() {
    setMascotaId('');
    setBusquedaMascota('');
    setListaMascotasAbierta(false);
  }

  function limpiarCuidadorSeleccion() {
    setCuidadorSel(null);
    setBusquedaCuidador('');
    setListaCuidadoresAbierta(false);
    setMascotas([]);
    limpiarMascotaSeleccion();
  }

  async function seleccionarCuidador(c) {
    setCuidadorSel(c);
    setBusquedaCuidador(c.nombre || '');
    setListaCuidadoresAbierta(false);
    limpiarMascotaSeleccion();
    try {
      await cargarMascotasDeCuidador(c.id);
    } catch (e) {
      setMascotas([]);
      addToast?.(
        e?.message || 'No se pudieron cargar las mascotas del cuidador',
        'error'
      );
    }
  }

  function seleccionarMascota(m) {
    setMascotaId(String(m.id));
    setBusquedaMascota(m.nombre || '');
    setListaMascotasAbierta(false);
  }

  async function abrirListaCuidadoresCrear() {
    setListaCuidadoresAbierta(true);
    if (cuidadorSel) return;
    try {
      await cargarCuidadores(busquedaCuidador.trim());
    } catch (e) {
      addToast?.(
        e?.message || 'No se pudo actualizar el listado de cuidadores',
        'error'
      );
    }
  }

  async function abrirListaMascotasCrear() {
    if (!cuidadorSel) {
      setListaMascotasAbierta(false);
      return;
    }
    setListaMascotasAbierta(true);
  }

  async function abrirListaProfesionales() {
    setListaAbierta(true);
    if (profSel) return;
    try {
      await cargarProfesionales(busquedaProf.trim());
    } catch (e) {
      addToast?.(
        e?.message || 'No se pudo actualizar el listado de profesionales',
        'error'
      );
    }
  }

  return {
    AGENDA_LIST_LIMIT,
    profesionales,
    setProfesionales,
    cuidadores,
    setCuidadores,
    mascotas,
    setMascotas,
    initLoading,
    initError,
    busquedaProf,
    setBusquedaProf,
    listaAbierta,
    setListaAbierta,
    busquedaCuidador,
    setBusquedaCuidador,
    listaCuidadoresAbierta,
    setListaCuidadoresAbierta,
    busquedaMascota,
    setBusquedaMascota,
    listaMascotasAbierta,
    setListaMascotasAbierta,
    profSel,
    setProfSel,
    cuidadorSel,
    setCuidadorSel,
    mascotaId,
    setMascotaId,
    buscadorRef,
    buscadorCuidadorRef,
    buscadorMascotaRef,
    profesionalesFiltrados,
    cuidadoresFiltrados,
    mascotasFiltradas,
    cargarCuidadores,
    cargarMascotasDeCuidador,
    cargarProfesionales,
    limpiarMascotaSeleccion,
    limpiarCuidadorSeleccion,
    seleccionarCuidador,
    seleccionarMascota,
    abrirListaCuidadoresCrear,
    abrirListaMascotasCrear,
    abrirListaProfesionales,
  };
}

export default useAgendasCatalog;

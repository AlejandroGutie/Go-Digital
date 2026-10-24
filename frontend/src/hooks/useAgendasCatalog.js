import { useEffect, useMemo, useRef, useState } from 'react';
import { listProfesionales } from '../api/profesionalesApi';
import { listMascotasConCuidadores } from '../api/mascotasApi';
import { normalizeListPayload } from '../api/normalize';
import {
  AGENDA_LIST_LIMIT,
  cuidadoresVisiblesMascota,
  filtrarCuidadoresLocal,
  filtrarMascotasLocal,
} from '../pages/agendas/agendaPageHelpers';

/**
 * Catálogo de profesionales / mascotas / cuidadores para AgendasPage.
 * La mascota se elige primero; el cuidador se limita a los de esa mascota.
 */
export function useAgendasCatalog({ addToast } = {}) {
  const [profesionales, setProfesionales] = useState([]);
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
  const mascotasSearchReq = useRef(0);
  const profesionalSearchReq = useRef(0);

  async function cargarMascotas() {
    const reqId = ++mascotasSearchReq.current;
    const res = await listMascotasConCuidadores(1, AGENDA_LIST_LIMIT);
    if (reqId !== mascotasSearchReq.current) return;
    setMascotas(normalizeListPayload(res));
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
        const [resProf, resMasc] = await Promise.all([
          listProfesionales(1, AGENDA_LIST_LIMIT),
          listMascotasConCuidadores(1, AGENDA_LIST_LIMIT),
        ]);
        setProfesionales(normalizeListPayload(resProf));
        setMascotas(normalizeListPayload(resMasc));
      } catch (e) {
        const msg =
          e?.message ||
          'No se pudieron cargar profesionales o mascotas (sesión, red o permisos de base de datos).';
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

  const cuidadoresDeMascota = useMemo(() => {
    if (!mascotaId) return [];
    const mascota = mascotas.find((m) => String(m.id) === String(mascotaId));
    return cuidadoresVisiblesMascota(mascota);
  }, [mascotas, mascotaId]);

  const cuidadoresFiltrados = useMemo(
    () => filtrarCuidadoresLocal(cuidadoresDeMascota, busquedaCuidador, cuidadorSel),
    [cuidadoresDeMascota, busquedaCuidador, cuidadorSel]
  );

  const mascotasFiltradas = useMemo(
    () => filtrarMascotasLocal(mascotas, mascotaId ? '' : busquedaMascota),
    [mascotas, busquedaMascota, mascotaId]
  );

  function limpiarMascotaSeleccion() {
    setMascotaId('');
    setBusquedaMascota('');
    setListaMascotasAbierta(false);
    setCuidadorSel(null);
    setBusquedaCuidador('');
    setListaCuidadoresAbierta(false);
  }

  function limpiarCuidadorSeleccion() {
    limpiarMascotaSeleccion();
  }

  function seleccionarCuidador(c) {
    setCuidadorSel(c);
    setBusquedaCuidador(c.nombre || '');
    setListaCuidadoresAbierta(false);
  }

  function seleccionarMascota(m) {
    const lista = cuidadoresVisiblesMascota(m);
    const sigue = lista.find((c) => String(c.id) === String(cuidadorSel?.id));
    const siguiente = sigue || (lista.length === 1 ? lista[0] : null);
    setMascotaId(String(m.id));
    setBusquedaMascota(m.nombre || '');
    setListaMascotasAbierta(false);
    setCuidadorSel(siguiente);
    setBusquedaCuidador(siguiente?.nombre || '');
    setListaCuidadoresAbierta(false);
  }

  function abrirListaCuidadoresCrear() {
    if (!mascotaId) {
      setListaCuidadoresAbierta(false);
      return;
    }
    setListaCuidadoresAbierta(true);
  }

  async function abrirListaMascotasCrear() {
    setListaMascotasAbierta(true);
    try {
      await cargarMascotas();
    } catch (e) {
      addToast?.(
        e?.message || 'No se pudo actualizar el listado de mascotas',
        'error'
      );
    }
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
    cuidadoresDeMascota,
    mascotasFiltradas,
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

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Cake,
  HeartHandshake,
  MessageCircle,
  Settings2,
  Trophy,
} from 'lucide-react';
import {
  getInformeFidelizacion,
  listContactosFidelizacion,
  marcarContactoFidelizacion,
} from '../../api/informesApi';
import { useToast } from '../../hooks/useToast';
import { useClientTablePagination } from '../../hooks/useClientTablePagination';
import EmptyState from '../EmptyState';
import Skeleton from '../ui/Skeleton';
import Button from '../ui/Button';
import Field, { Input, Select, Textarea } from '../ui/Field';
import Sheet from '../ui/Sheet';
import TablePagination, { PageSizeSelect } from '../ui/TablePagination';
import { TABLE_STICKY_COLS_1 } from '../../lib/tableSticky';
import { KpiCardsFidelizacion } from './KpiCards';
import { formatFecha } from '../../utils/format';
import { openWhatsAppChat, sanitizePhoneCO } from '../../utils/whatsapp';
import {
  FIDELIZACION_DIAS_OPTIONS,
  generarMensajeWhatsApp,
  labelDiasRestantes,
  labelTipoEvento,
  loadFidelizacionStore,
  markFidelizacionEnviadoLocal,
  PLANTILLA_CUMPLE_DEFAULT,
  PLANTILLA_HITO_DEFAULT,
  saveFidelizacionTemplates,
} from '../../utils/fidelizacion';

const TODOS_PROF_LABEL = 'Todos los profesionales';

const DIAS_LABEL = {
  7: 'Esta semana (7 días)',
  15: '15 días',
  30: 'Este mes (30 días)',
};

function enviadoKey(tipo, idMascota, clave) {
  return `${tipo}:${idMascota}:${clave}`;
}

function rowEnviado(enviados, tipo, row) {
  return Boolean(enviados[enviadoKey(tipo, row.id_mascota, row.clave_contacto)]);
}

function badgeDiasStyle(dias) {
  if (dias <= 0) {
    return { background: 'var(--color-entorno)', color: 'var(--color-white)' };
  }
  if (dias <= 7) {
    return { background: 'color-mix(in srgb, var(--color-entorno) 18%, white)', color: 'var(--color-entorno)' };
  }
  return { background: 'var(--color-white)', color: 'var(--color-entorno)', border: '1px solid var(--color-purple-light)' };
}

function cellOrDash(value) {
  const s = value == null ? '' : String(value).trim();
  return s || '—';
}

export default function InformesFidelizacionTab({ profesionales, addToast }) {
  const [diasVentana, setDiasVentana] = useState(30);
  const [estadoMsg, setEstadoMsg] = useState('');
  const [idProfesional, setIdProfesional] = useState('');
  const [busquedaProf, setBusquedaProf] = useState('');
  const [listaProfAbierta, setListaProfAbierta] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [listaBuscarAbierta, setListaBuscarAbierta] = useState(false);
  const buscadorProfRef = useRef(null);
  const buscadorMascotaRef = useRef(null);
  const [cumpleanos, setCumpleanos] = useState([]);
  const [hitos, setHitos] = useState([]);
  const [enviados, setEnviados] = useState({});
  const [listLoading, setListLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [draft, setDraft] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [sending, setSending] = useState(false);
  const [plantillasOpen, setPlantillasOpen] = useState(false);
  const [templates, setTemplates] = useState(() => loadFidelizacionStore().templates);
  const fetchIdRef = useRef(0);
  const waCancelRef = useRef(null);
  const localToast = useToast();
  const notify = addToast || localToast.addToast;

  useEffect(() => {
    return () => waCancelRef.current?.cancel?.();
  }, []);

  useEffect(() => {
    if (!idProfesional) return;
    const selected = (profesionales || []).find((p) => String(p.id) === String(idProfesional));
    if (selected) setBusquedaProf(selected.nombre || '');
  }, [idProfesional, profesionales]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (buscadorProfRef.current && !buscadorProfRef.current.contains(e.target)) {
        setListaProfAbierta(false);
        if (!idProfesional) {
          setBusquedaProf('');
        } else {
          const selected = (profesionales || []).find(
            (p) => String(p.id) === String(idProfesional)
          );
          setBusquedaProf(selected?.nombre || '');
        }
      }
      if (buscadorMascotaRef.current && !buscadorMascotaRef.current.contains(e.target)) {
        setListaBuscarAbierta(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [idProfesional, profesionales]);

  function mergeEnviados(dbRows) {
    const map = {};
    const store = loadFidelizacionStore();
    Object.assign(map, store.enviados || {});
    for (const r of dbRows || []) {
      map[enviadoKey(r.tipo, r.id_mascota, r.clave)] = r.enviado_en || true;
    }
    setEnviados(map);
  }

  async function refresh(profId = idProfesional) {
    const reqId = ++fetchIdRef.current;
    setListLoading(true);
    setLoadError(null);
    try {
      const [res, contactos] = await Promise.all([
        getInformeFidelizacion({
          dias_ventana: 30,
          id_profesional: profId || undefined,
        }),
        listContactosFidelizacion(),
      ]);
      if (reqId !== fetchIdRef.current) return;
      if (res?.status === 'error') throw new Error(res.message || 'Error al generar fidelización');
      setCumpleanos(res.data?.cumpleanos || []);
      setHitos(res.data?.hitos || []);
      mergeEnviados(contactos?.data || []);
      if (res?.warning) notify(res.warning, 'info');
    } catch (e) {
      if (reqId !== fetchIdRef.current) return;
      const msg = e?.message || 'No se pudo cargar fidelización.';
      setLoadError(msg);
      setCumpleanos([]);
      setHitos([]);
      notify(msg, 'error');
    } finally {
      if (reqId === fetchIdRef.current) setListLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => refresh(idProfesional), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idProfesional]);

  const kpis = useMemo(() => {
    return {
      proximos_7: cumpleanos.filter((r) => r.dias_restantes <= 7).length,
      proximos_15: cumpleanos.filter((r) => r.dias_restantes <= 15).length,
      proximos_30: cumpleanos.length,
      hitos_alcanzados: hitos.filter((r) => r.estado_hito === 'alcanzado').length,
      hitos_por_alcanzar: hitos.filter((r) => r.estado_hito === 'por_alcanzar').length,
    };
  }, [cumpleanos, hitos]);

  const q = searchTerm.trim().toLowerCase();

  const profesionalesFiltrados = useMemo(() => {
    const term = busquedaProf.trim().toLowerCase();
    const list = profesionales || [];
    if (!term) return list;
    return list.filter(
      (p) =>
        (p.nombre || '').toLowerCase().includes(term) ||
        (p.telefono || '').toLowerCase().includes(term)
    );
  }, [profesionales, busquedaProf]);

  const mostrarTodosProf =
    !busquedaProf.trim() ||
    TODOS_PROF_LABEL.toLowerCase().includes(busquedaProf.trim().toLowerCase());

  const opcionesBuscar = useMemo(() => {
    const map = new Map();
    for (const r of [...cumpleanos, ...hitos]) {
      const id = r.id_mascota;
      if (!id || map.has(id)) continue;
      map.set(id, {
        id,
        nombre: r.mascota_nombre || '',
        especie: r.especie || '',
        cuidador: r.cuidador_nombre || '',
        telefono: r.cuidador_telefono || '',
      });
    }
    return [...map.values()].sort((a, b) =>
      String(a.nombre).localeCompare(String(b.nombre), 'es')
    );
  }, [cumpleanos, hitos]);

  const opcionesBuscarFiltradas = useMemo(() => {
    if (!q) return opcionesBuscar;
    return opcionesBuscar.filter((m) => {
      const blob = `${m.nombre} ${m.especie} ${m.cuidador} ${m.telefono}`.toLowerCase();
      return blob.includes(q);
    });
  }, [opcionesBuscar, q]);

  const cumpleFiltrados = useMemo(() => {
    return cumpleanos.filter((r) => {
      if (r.dias_restantes > diasVentana) return false;
      const enviado = rowEnviado(enviados, r.tipo_evento, r);
      if (estadoMsg === 'pendiente' && enviado) return false;
      if (estadoMsg === 'enviado' && !enviado) return false;
      if (!q) return true;
      const blob = `${r.mascota_nombre} ${r.especie} ${r.cuidador_nombre} ${r.cuidador_telefono}`.toLowerCase();
      return blob.includes(q);
    });
  }, [cumpleanos, diasVentana, estadoMsg, enviados, q]);

  const hitosFiltrados = useMemo(() => {
    return hitos.filter((r) => {
      const enviado = rowEnviado(enviados, 'hito', r);
      if (estadoMsg === 'pendiente' && enviado) return false;
      if (estadoMsg === 'enviado' && !enviado) return false;
      if (!q) return true;
      const blob = `${r.mascota_nombre} ${r.especie} ${r.cuidador_nombre} ${r.cuidador_telefono}`.toLowerCase();
      return blob.includes(q);
    });
  }, [hitos, estadoMsg, enviados, q]);

  const pagCumple = useClientTablePagination(
    cumpleFiltrados,
    `${diasVentana}|${estadoMsg}|${idProfesional}|${q}|c`
  );
  const pagHitos = useClientTablePagination(
    hitosFiltrados,
    `${estadoMsg}|${idProfesional}|${q}|h`
  );

  function abrirWhatsApp(kind, row) {
    const tipo = kind === 'hito' ? 'hito' : row.tipo_evento;
    setDraft({ kind, tipo, row });
    setMensaje(generarMensajeWhatsApp({ tipo, row, templates }));
  }

  async function confirmarEnvio() {
    if (!draft?.row) return;
    const phone = sanitizePhoneCO(draft.row.cuidador_telefono);
    if (!phone) {
      notify(
        'El cuidador no tiene un celular colombiano válido. Actualízalo en Cuidadores.',
        'error'
      );
      return;
    }
    setSending(true);
    try {
      waCancelRef.current?.cancel?.();
      waCancelRef.current = openWhatsAppChat(phone, mensaje);
      const tipo = draft.tipo;
      const clave = draft.row.clave_contacto;
      markFidelizacionEnviadoLocal(draft.row.id_mascota, tipo, clave);
      setEnviados((prev) => ({
        ...prev,
        [enviadoKey(tipo, draft.row.id_mascota, clave)]: new Date().toISOString(),
      }));
      await marcarContactoFidelizacion({
        id_mascota: draft.row.id_mascota,
        tipo,
        clave,
      });
      notify('Se abrió WhatsApp con el mensaje de fidelización.', 'success');
      setDraft(null);
    } catch (e) {
      notify(e?.message || 'No se pudo abrir WhatsApp', 'error');
    } finally {
      setSending(false);
    }
  }

  function guardarPlantillas() {
    const next = saveFidelizacionTemplates(templates);
    setTemplates(next);
    setPlantillasOpen(false);
    notify('Plantillas de fidelización guardadas.', 'success');
  }

  function restaurarPlantillas() {
    const next = saveFidelizacionTemplates({
      cumpleanos: PLANTILLA_CUMPLE_DEFAULT,
      hito: PLANTILLA_HITO_DEFAULT,
    });
    setTemplates(next);
  }

  return (
    <>
      <div className="ui-card ui-card--filters">
        <div className="ui-card__section-title">Filtros de fidelización</div>
        <div className="ui-chips">
          {FIDELIZACION_DIAS_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              className={`ui-chip${diasVentana === d ? ' ui-chip--active' : ''}`}
              onClick={() => setDiasVentana(d)}
            >
              {DIAS_LABEL[d]}
            </button>
          ))}
        </div>
        <div className="fields-row fields-row--end">
          <Field label="Mensaje WhatsApp">
            <Select
              value={estadoMsg}
              onChange={(e) => setEstadoMsg(e.target.value)}
              aria-label="Estado del mensaje"
            >
              <option value="">Todos</option>
              <option value="pendiente">Pendientes</option>
              <option value="enviado">Enviados</option>
            </Select>
          </Field>
          <Field id="filtro-profesional-fid" label="Profesional">
            <div ref={buscadorProfRef} className="ui-combo">
              <Input
                id="filtro-profesional-fid"
                type="text"
                role="combobox"
                aria-expanded={listaProfAbierta}
                aria-controls="lista-profesionales-fidelizacion"
                aria-autocomplete="list"
                placeholder="Buscar por nombre o teléfono…"
                value={busquedaProf}
                onChange={(e) => {
                  setBusquedaProf(e.target.value);
                  setListaProfAbierta(true);
                }}
                onFocus={() => setListaProfAbierta(true)}
                aria-label="Buscar profesional"
              />
              {listaProfAbierta && (
                <ul
                  id="lista-profesionales-fidelizacion"
                  role="listbox"
                  className="ui-combo__list"
                >
                  {mostrarTodosProf && (
                    <li role="option" aria-selected={!idProfesional}>
                      <button
                        type="button"
                        className={`ui-combo__item${!idProfesional ? ' ui-combo__item--active' : ''}`}
                        onClick={() => {
                          setIdProfesional('');
                          setBusquedaProf('');
                          setListaProfAbierta(false);
                        }}
                      >
                        {TODOS_PROF_LABEL}
                      </button>
                    </li>
                  )}
                  {profesionalesFiltrados.length === 0 && !mostrarTodosProf ? (
                    <li
                      className="ui-combo__item"
                      style={{ cursor: 'default', color: 'var(--color-purple-light)' }}
                    >
                      No se encontraron profesionales
                    </li>
                  ) : (
                    profesionalesFiltrados.map((p) => (
                      <li
                        key={p.id}
                        role="option"
                        aria-selected={String(idProfesional) === String(p.id)}
                      >
                        <button
                          type="button"
                          className={`ui-combo__item${
                            String(idProfesional) === String(p.id)
                              ? ' ui-combo__item--active'
                              : ''
                          }`}
                          onClick={() => {
                            setIdProfesional(String(p.id));
                            setBusquedaProf(p.nombre || '');
                            setListaProfAbierta(false);
                          }}
                        >
                          <div>{p.nombre}</div>
                          {p.telefono ? (
                            <div
                              style={{ fontSize: '0.75rem', color: 'var(--color-purple-light)' }}
                            >
                              {p.telefono}
                            </div>
                          ) : null}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          </Field>
          <Field id="filtro-buscar-fid" label="Buscar">
            <div ref={buscadorMascotaRef} className="ui-combo">
              <Input
                id="filtro-buscar-fid"
                type="text"
                role="combobox"
                aria-expanded={listaBuscarAbierta}
                aria-controls="lista-buscar-fidelizacion"
                aria-autocomplete="list"
                placeholder="Buscar mascota, cuidador o teléfono…"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setListaBuscarAbierta(true);
                }}
                onFocus={() => setListaBuscarAbierta(true)}
                aria-label="Buscar mascota o cuidador"
              />
              {listaBuscarAbierta && (
                <ul
                  id="lista-buscar-fidelizacion"
                  role="listbox"
                  className="ui-combo__list"
                >
                  {opcionesBuscarFiltradas.length === 0 ? (
                    <li
                      className="ui-combo__item"
                      style={{ cursor: 'default', color: 'var(--color-purple-light)' }}
                    >
                      {opcionesBuscar.length === 0
                        ? 'No hay mascotas en este informe'
                        : 'No se encontraron coincidencias'}
                    </li>
                  ) : (
                    opcionesBuscarFiltradas.map((m) => (
                      <li
                        key={m.id}
                        role="option"
                        aria-selected={searchTerm.trim() === m.nombre}
                      >
                        <button
                          type="button"
                          className={`ui-combo__item${
                            searchTerm.trim() === m.nombre ? ' ui-combo__item--active' : ''
                          }`}
                          onClick={() => {
                            setSearchTerm(m.nombre);
                            setListaBuscarAbierta(false);
                          }}
                        >
                          <div>{m.nombre}</div>
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--color-purple-light)',
                              fontWeight: 400,
                            }}
                          >
                            {[m.especie, m.cuidador, m.telefono].filter(Boolean).join(' · ') ||
                              '—'}
                          </div>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          </Field>
          <div className="fields-row__action">
            <Button variant="secondary" onClick={() => setPlantillasOpen(true)}>
              <Settings2 size={16} />
              Plantillas
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setDiasVentana(30);
                setEstadoMsg('');
                setIdProfesional('');
                setBusquedaProf('');
                setSearchTerm('');
                setListaProfAbierta(false);
                setListaBuscarAbierta(false);
              }}
            >
              Limpiar filtros
            </Button>
          </div>
        </div>
      </div>

      {listLoading ? <Skeleton rows={5} /> : null}

      {loadError && !listLoading ? (
        <div className="ui-banner ui-banner--warn" style={{ marginBottom: 16 }}>
          <AlertTriangle size={16} /> {loadError}
        </div>
      ) : null}

      {!listLoading && !loadError ? <KpiCardsFidelizacion kpis={kpis} /> : null}

      {!listLoading && !loadError && cumpleanos.length === 0 && hitos.length === 0 ? (
        <div className="ui-card" style={{ padding: '32px 20px' }}>
          <EmptyState
            icon={<HeartHandshake size={28} />}
            title="Sin oportunidades de fidelización"
            description="No hay cumpleaños/mesarios en los próximos 30 días ni mascotas en un hito de 5 visitas. Completa fechas de nacimiento y marca citas como Mascota lista."
          />
        </div>
      ) : null}

      {!listLoading && (cumpleanos.length > 0 || cumpleFiltrados.length > 0 || searchTerm || estadoMsg) ? (
        <div className="ui-card ui-card--flush" style={{ marginBottom: 24 }}>
          <div className="ui-card__head">Próximos cumpleaños / mesarios</div>
          <div style={{ padding: '12px 16px 0' }}>
            <div className="ui-toolbar" style={{ marginBottom: 12 }}>
              <PageSizeSelect
                value={pagCumple.itemsPerPage}
                onChange={pagCumple.handlePageSizeChange}
                id="fid-cumple-page-size"
              />
              <span className="ui-toolbar__meta">
                {pagCumple.total} resultado{pagCumple.total !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <div className="table-scroll">
            {pagCumple.total === 0 ? (
              <div style={{ padding: '8px 16px 16px' }}>
                <EmptyState
                  icon={<Cake size={24} />}
                  title="Nada en este rango"
                  description="Prueba con 15 o 30 días, o quita el filtro de mensaje enviado."
                />
              </div>
            ) : (
              <table className={TABLE_STICKY_COLS_1}>
                <thead>
                  <tr>
                    <th>Mascota</th>
                    <th>Evento</th>
                    <th>Fecha</th>
                    <th>Edad</th>
                    <th>Cuidador</th>
                    <th>WhatsApp</th>
                    <th>Visitas</th>
                    <th>Estado</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {pagCumple.pageRows.map((r) => {
                    const enviado = rowEnviado(enviados, r.tipo_evento, r);
                    const phoneOk = Boolean(sanitizePhoneCO(r.cuidador_telefono));
                    return (
                      <tr key={`${r.id_mascota}-${r.clave_contacto}`}>
                        <td>
                          <strong>{r.mascota_nombre}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-purple-light)' }}>
                            {cellOrDash(r.especie)}
                          </div>
                        </td>
                        <td>
                          <span className="ui-badge" style={badgeDiasStyle(r.dias_restantes)}>
                            {labelTipoEvento(r.tipo_evento)} · {labelDiasRestantes(r.dias_restantes)}
                          </span>
                        </td>
                        <td>{formatFecha(r.proxima_fecha)}</td>
                        <td>{cellOrDash(r.edad_label)}</td>
                        <td>{cellOrDash(r.cuidador_nombre)}</td>
                        <td>{cellOrDash(r.cuidador_telefono)}</td>
                        <td className="ui-num">{r.servicios_atendidos}</td>
                        <td>
                          <span
                            className="ui-badge"
                            style={
                              enviado
                                ? { background: 'var(--color-entorno)', color: 'var(--color-white)' }
                                : {
                                    background: 'var(--color-white)',
                                    color: 'var(--color-entorno)',
                                    border: '1px solid var(--color-purple-light)',
                                  }
                            }
                          >
                            {enviado ? 'Enviado' : 'Pendiente'}
                          </span>
                        </td>
                        <td>
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={!phoneOk}
                            title={
                              phoneOk
                                ? 'Enviar promoción / regalo por WhatsApp'
                                : 'Teléfono de cuidador no válido'
                            }
                            onClick={() => abrirWhatsApp('cumple', r)}
                          >
                            <MessageCircle size={14} />
                            WhatsApp
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ padding: '12px 16px 16px' }}>
            <TablePagination
              page={pagCumple.page}
              pages={pagCumple.pages}
              total={pagCumple.total}
              itemsPerPage={pagCumple.itemsPerPage}
              onPageChange={pagCumple.goToPage}
            />
          </div>
        </div>
      ) : null}

      {!listLoading && (hitos.length > 0 || hitosFiltrados.length > 0 || searchTerm || estadoMsg) ? (
        <div className="ui-card ui-card--flush" style={{ marginBottom: 24 }}>
          <div className="ui-card__head">Hitos de fidelidad (múltiplos de 5 visitas)</div>
          <p style={{ margin: 0, padding: '8px 16px 0', fontSize: 13, color: 'var(--color-purple-light)' }}>
            En «Todos los profesionales» se listan hitos por el total de visitas y también
            los que se alcanzan con un profesional concreto (p. ej. 4 visitas con Federica).
          </p>
          <div style={{ padding: '12px 16px 0' }}>
            <div className="ui-toolbar" style={{ marginBottom: 12 }}>
              <PageSizeSelect
                value={pagHitos.itemsPerPage}
                onChange={pagHitos.handlePageSizeChange}
                id="fid-hitos-page-size"
              />
              <span className="ui-toolbar__meta">
                {pagHitos.total} resultado{pagHitos.total !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <div className="table-scroll">
            {pagHitos.total === 0 ? (
              <div style={{ padding: '8px 16px 16px' }}>
                <EmptyState
                  icon={<Trophy size={24} />}
                  title="Sin hitos en este filtro"
                  description="Se listan mascotas con 5, 10, 15… visitas atendidas (en total o con un profesional), o a una visita de alcanzar el siguiente hito."
                />
              </div>
            ) : (
              <table className={TABLE_STICKY_COLS_1}>
                <thead>
                  <tr>
                    <th>Mascota</th>
                    <th>Hito</th>
                    <th>Visitas</th>
                    <th>Alcance</th>
                    <th>Cuidador</th>
                    <th>WhatsApp</th>
                    <th>Estado</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {pagHitos.pageRows.map((r) => {
                    const enviado = rowEnviado(enviados, 'hito', r);
                    const phoneOk = Boolean(sanitizePhoneCO(r.cuidador_telefono));
                    return (
                      <tr key={`${r.id_mascota}-${r.clave_contacto}`}>
                        <td>
                          <strong>{r.mascota_nombre}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-purple-light)' }}>
                            {cellOrDash(r.especie)}
                          </div>
                        </td>
                        <td>
                          <span
                            className="ui-badge"
                            style={
                              r.estado_hito === 'alcanzado'
                                ? { background: 'var(--color-entorno)', color: 'var(--color-white)' }
                                : {
                                    background: 'var(--color-white)',
                                    color: 'var(--color-entorno)',
                                    border: '1px solid var(--color-purple-light)',
                                  }
                            }
                          >
                            {r.estado_hito === 'alcanzado'
                              ? `${r.hito} visitas`
                              : `A 1 de ${r.hito}`}
                          </span>
                        </td>
                        <td className="ui-num">{r.servicios_atendidos}</td>
                        <td>
                          {r.alcance === 'profesional' && r.profesional_nombre
                            ? `Con ${r.profesional_nombre}`
                            : r.alcance === 'profesional'
                              ? 'Con un profesional'
                              : r.servicios_totales && r.servicios_totales !== r.servicios_atendidos
                                ? `Total (${r.servicios_totales})`
                                : 'Todas las visitas'}
                        </td>
                        <td>{cellOrDash(r.cuidador_nombre)}</td>
                        <td>{cellOrDash(r.cuidador_telefono)}</td>
                        <td>
                          <span
                            className="ui-badge"
                            style={
                              enviado
                                ? { background: 'var(--color-entorno)', color: 'var(--color-white)' }
                                : {
                                    background: 'var(--color-white)',
                                    color: 'var(--color-entorno)',
                                    border: '1px solid var(--color-purple-light)',
                                  }
                            }
                          >
                            {enviado ? 'Enviado' : 'Pendiente'}
                          </span>
                        </td>
                        <td>
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={!phoneOk}
                            title={
                              phoneOk
                                ? 'Enviar promoción / regalo por WhatsApp'
                                : 'Teléfono de cuidador no válido'
                            }
                            onClick={() => abrirWhatsApp('hito', r)}
                          >
                            <MessageCircle size={14} />
                            WhatsApp
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ padding: '12px 16px 16px' }}>
            <TablePagination
              page={pagHitos.page}
              pages={pagHitos.pages}
              total={pagHitos.total}
              itemsPerPage={pagHitos.itemsPerPage}
              onPageChange={pagHitos.goToPage}
            />
          </div>
        </div>
      ) : null}

      <Sheet
        open={Boolean(draft)}
        onClose={() => !sending && setDraft(null)}
        title="Enviar promoción / regalo por WhatsApp"
        description={
          draft?.row
            ? `${draft.row.mascota_nombre} · ${draft.row.cuidador_nombre || 'Sin cuidador'}`
            : ''
        }
        footer={
          <>
            <Button variant="ghost" disabled={sending} onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button variant="primary" disabled={sending} onClick={confirmarEnvio}>
              <MessageCircle size={16} />
              {sending ? 'Abriendo…' : 'Enviar por WhatsApp'}
            </Button>
          </>
        }
      >
        <Field id="fid-msg" label="Mensaje">
          <Textarea
            id="fid-msg"
            rows={10}
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
          />
        </Field>
      </Sheet>

      <Sheet
        open={plantillasOpen}
        onClose={() => setPlantillasOpen(false)}
        title="Plantillas de fidelización"
        description="Usa {cuidador}, {mascota}, {negocio}, {obsequio}, {servicios}, {tipo_evento}, {fecha_evento}."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={restaurarPlantillas}>
              Restaurar textos
            </Button>
            <Button variant="primary" onClick={guardarPlantillas}>
              Guardar
            </Button>
          </>
        }
      >
        <Field id="fid-negocio" label="Nombre del negocio">
          <Input
            id="fid-negocio"
            value={templates.negocio || ''}
            onChange={(e) => setTemplates((p) => ({ ...p, negocio: e.target.value }))}
          />
        </Field>
        <Field id="fid-obsequio" label="Obsequio / descuento">
          <Input
            id="fid-obsequio"
            value={templates.obsequio || ''}
            onChange={(e) => setTemplates((p) => ({ ...p, obsequio: e.target.value }))}
          />
        </Field>
        <Field id="fid-tpl-cumple" label="Plantilla cumpleaños / mesario">
          <Textarea
            id="fid-tpl-cumple"
            rows={8}
            value={templates.cumpleanos || ''}
            onChange={(e) => setTemplates((p) => ({ ...p, cumpleanos: e.target.value }))}
          />
        </Field>
        <Field id="fid-tpl-hito" label="Plantilla hito de visitas">
          <Textarea
            id="fid-tpl-hito"
            rows={8}
            value={templates.hito || ''}
            onChange={(e) => setTemplates((p) => ({ ...p, hito: e.target.value }))}
          />
        </Field>
      </Sheet>
    </>
  );
}

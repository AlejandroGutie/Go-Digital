import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, Clock } from 'lucide-react';
import { getAgendaInforme, getHorariosLibres } from '../../api/informesApi';
import { normalizeListPayload } from '../../api/normalize';
import { useToast } from '../../hooks/useToast';
import EmptyState from '../EmptyState';
import Skeleton from '../ui/Skeleton';
import InformesFiltros from './InformesFiltros';
import { KpiCardsAgenda } from './KpiCards';
import { ChartTendenciaCitas, ChartCitasPorProfesional } from './InformesCharts';
import {
  TablaCitasPorProfesional,
  TablaDetalleAgendas,
  TablaHorariosLibres,
} from './InformesTablas';
import InformesExportBar from './InformesExportBar';
import { EMPTY_FILTROS_INFORMES, rangoDesdePreset } from '../../utils/dateRanges';
import { rangoFechasInvalido, toDateOnly } from '../../utils/format';
import {
  exportAgendaCSV,
  exportAgendaPDF,
  exportAgendaLibresCSV,
  exportAgendaLibresPDF,
} from '../../utils/exportInformes';

const MODO_OCUPADAS = 'ocupadas';
const MODO_LIBRES = 'libres';

function daysInRange(desde, hasta) {
  if (!desde || !hasta) return 1;
  const a = new Date(`${desde}T12:00:00`);
  const b = new Date(`${hasta}T12:00:00`);
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

function buildAgendaSummary(rows, filtros) {
  const list = rows || [];
  const dias = daysInRange(filtros.fecha_desde, filtros.fecha_hasta);
  const agruparDia = dias <= 45;

  const serieMap = new Map();
  const profMap = new Map();
  const mascotas = new Set();

  for (const row of list) {
    const fecha = toDateOnly(row.fecha);
    const periodo = agruparDia ? fecha : String(fecha || '').slice(0, 7);
    if (periodo) {
      const s = serieMap.get(periodo) || { periodo, citas: 0 };
      s.citas += 1;
      serieMap.set(periodo, s);
    }

    const pid = row.id_profesional;
    const nombre = row.profesional_nombre || `Profesional #${pid}`;
    const p = profMap.get(pid) || { id: pid, nombre, citas: 0 };
    p.citas += 1;
    profMap.set(pid, p);

    if (row.id_mascota != null) mascotas.add(row.id_mascota);
  }

  const total = list.length;
  const promedio =
    total === 0 ? 0 : Math.round((total / dias) * 10) / 10;

  return {
    kpis: {
      total_citas: total,
      promedio_diario: promedio,
      profesionales_activos: profMap.size,
      mascotas_unicas: mascotas.size,
    },
    serie: [...serieMap.values()].sort((a, b) =>
      String(a.periodo).localeCompare(String(b.periodo))
    ),
    agrupar_por: agruparDia ? 'dia' : 'mes',
    por_profesional: [...profMap.values()].sort((a, b) =>
      String(a.nombre).localeCompare(String(b.nombre), 'es')
    ),
  };
}

export default function InformesAgendasTab({ profesionales, addToast }) {
  const [modo, setModo] = useState(MODO_OCUPADAS);
  const [filtros, setFiltros] = useState(() => {
    const base = EMPTY_FILTROS_INFORMES();
    return { ...base, estado: '' };
  });
  const [rows, setRows] = useState([]);
  const [rowsLibres, setRowsLibres] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const fetchIdRef = useRef(0);
  const localToast = useToast();
  const notify = addToast || localToast.addToast;

  const rangoFechasError = rangoFechasInvalido(filtros.fecha_desde, filtros.fecha_hasta);
  const esModoLibres = modo === MODO_LIBRES;

  async function refreshOcupadas(f = filtros) {
    const reqId = ++fetchIdRef.current;
    setListLoading(true);
    setLoadError(null);
    try {
      const res = await getAgendaInforme({
        fecha_desde: f.fecha_desde || undefined,
        fecha_hasta: f.fecha_hasta || undefined,
        id_profesional: f.id_profesional || undefined,
      });
      if (reqId !== fetchIdRef.current) return;
      if (res?.status === 'error') throw new Error(res.message || 'Error al generar informe de agendas');
      setRows(Array.isArray(res.data) ? res.data : []);
      if (res?.warning) notify(res.warning, 'info');
    } catch (e) {
      if (reqId !== fetchIdRef.current) return;
      const msg =
        e?.message ||
        'No se pudo cargar el informe de agendas (revisa la sesión o la conexión).';
      setLoadError(msg);
      setRows([]);
      notify(msg, 'error');
    } finally {
      if (reqId === fetchIdRef.current) setListLoading(false);
    }
  }

  async function refreshLibres(f = filtros) {
    const reqId = ++fetchIdRef.current;
    setListLoading(true);
    setLoadError(null);
    try {
      const res = await getHorariosLibres({
        fecha_desde: f.fecha_desde || undefined,
        fecha_hasta: f.fecha_hasta || undefined,
        id_profesional: f.id_profesional || undefined,
      });
      if (reqId !== fetchIdRef.current) return;
      if (res?.status === 'error') throw new Error(res.message || 'Error al calcular horarios libres');
      setRowsLibres(normalizeListPayload(res));
    } catch (e) {
      if (reqId !== fetchIdRef.current) return;
      const msg =
        e?.message ||
        'No se pudo calcular la disponibilidad (revisa la sesión o la conexión).';
      setLoadError(msg);
      setRowsLibres([]);
      notify(msg, 'error');
    } finally {
      if (reqId === fetchIdRef.current) setListLoading(false);
    }
  }

  useEffect(() => {
    if (rangoFechasError) return undefined;
    const timer = setTimeout(() => {
      if (esModoLibres) refreshLibres(filtros);
      else refreshOcupadas(filtros);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filtros.fecha_desde,
    filtros.fecha_hasta,
    filtros.id_profesional,
    rangoFechasError,
    esModoLibres,
  ]);

  function onPreset(presetId) {
    const r = rangoDesdePreset(presetId);
    setFiltros((prev) => ({
      ...prev,
      preset: presetId,
      fecha_desde: r.fecha_desde,
      fecha_hasta: r.fecha_hasta,
    }));
  }

  function limpiarFiltros() {
    const base = EMPTY_FILTROS_INFORMES();
    setFiltros({ ...base, estado: '' });
  }

  async function withExport(fn) {
    setExporting(true);
    try {
      await fn();
    } catch (e) {
      notify(e?.message || 'No se pudo exportar', 'error');
    } finally {
      setExporting(false);
    }
  }

  const summary = useMemo(() => buildAgendaSummary(rows, filtros), [rows, filtros]);

  const filtroExport = {
    fecha_desde: filtros.fecha_desde,
    fecha_hasta: filtros.fecha_hasta,
    id_profesional: filtros.id_profesional || '',
    estado: '',
  };

  const datosActivos = esModoLibres ? rowsLibres : rows;
  const sinDatos = !listLoading && !loadError && datosActivos.length === 0;

  return (
    <>
      <div className="ui-tabs" role="tablist" aria-label="Modo de consulta de agendas" style={{ marginBottom: 16 }}>
        <button
          type="button"
          role="tab"
          aria-selected={!esModoLibres}
          className={`ui-tabs__btn${!esModoLibres ? ' ui-tabs__btn--active' : ''}`}
          onClick={() => setModo(MODO_OCUPADAS)}
        >
          Citas agendadas
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={esModoLibres}
          className={`ui-tabs__btn${esModoLibres ? ' ui-tabs__btn--active' : ''}`}
          onClick={() => setModo(MODO_LIBRES)}
        >
          Agendas / Horarios libres
        </button>
      </div>

      <InformesFiltros
        title={esModoLibres ? 'Filtros de disponibilidad' : 'Filtros de agendas'}
        filtros={filtros}
        profesionales={profesionales}
        onChange={setFiltros}
        onPreset={onPreset}
        onLimpiar={limpiarFiltros}
        rangoFechasError={rangoFechasError}
        showEstado={false}
      />

      {listLoading ? (
        <Skeleton rows={6} />
      ) : loadError ? (
        <EmptyState icon={<AlertTriangle size={24} />} title="No se pudo cargar la información" description={loadError} />
      ) : esModoLibres ? (
        sinDatos ? (
          <>
            <EmptyState
              icon={<Clock size={24} />}
              title="No hay horarios libres"
              description="Ajusta el rango de fechas o el profesional; puede que la jornada esté completamente ocupada"
            />
            <InformesExportBar
              variant="agenda-libres"
              disabled
              exporting={exporting}
              onExportAgendaLibresCsv={() => {}}
              onExportAgendaLibresPdf={() => {}}
            />
          </>
        ) : (
          <>
            <TablaHorariosLibres rows={rowsLibres} filtros={filtros} />

            <InformesExportBar
              variant="agenda-libres"
              disabled={rowsLibres.length === 0}
              exporting={exporting}
              onExportAgendaLibresCsv={() =>
                withExport(async () => {
                  exportAgendaLibresCSV(rowsLibres, filtroExport);
                  notify('CSV de agendas libres descargado', 'success');
                })
              }
              onExportAgendaLibresPdf={() =>
                withExport(async () => {
                  await exportAgendaLibresPDF(rowsLibres, filtroExport);
                  notify('PDF de agendas libres descargado', 'success');
                })
              }
            />
          </>
        )
      ) : sinDatos ? (
        <>
          <EmptyState
            icon={<CalendarDays size={24} />}
            title="No hay citas para mostrar"
            description="Ajusta el rango de fechas o verifica que existan agendas en el período"
          />
          <InformesExportBar
            variant="agenda"
            disabled
            exporting={exporting}
            onExportAgendaCsv={() => {}}
            onExportAgendaPdf={() => {}}
          />
        </>
      ) : (
        <>
          <KpiCardsAgenda kpis={summary.kpis} />

          <div className="ui-bento" style={{ marginBottom: 24 }}>
            <ChartTendenciaCitas serie={summary.serie} agruparPor={summary.agrupar_por} />
            <ChartCitasPorProfesional rows={summary.por_profesional} />
          </div>

          <TablaDetalleAgendas rows={rows} filtros={filtros} />

          <TablaCitasPorProfesional rows={summary.por_profesional} filtros={filtros} />

          <InformesExportBar
            variant="agenda"
            disabled={rows.length === 0}
            exporting={exporting}
            onExportAgendaCsv={() =>
              withExport(async () => {
                exportAgendaCSV(rows, filtroExport);
                notify('CSV de agendas descargado', 'success');
              })
            }
            onExportAgendaPdf={() =>
              withExport(async () => {
                await exportAgendaPDF(rows, filtroExport);
                notify('PDF de agendas descargado', 'success');
              })
            }
          />
        </>
      )}
    </>
  );
}

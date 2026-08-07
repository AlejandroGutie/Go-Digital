import { useState, useEffect } from 'react';
import { AlertTriangle, BarChart3 } from 'lucide-react';
import { getDashboardInformes, getAgendaInforme } from '../api/informesApi';
import { listProfesionales } from '../api/profesionalesApi';
import { normalizeListPayload } from '../api/normalize';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import Skeleton from '../components/ui/Skeleton';
import InformesFiltros from '../components/informes/InformesFiltros';
import KpiCards from '../components/informes/KpiCards';
import {
  ChartTendencia,
  ChartPorProfesional,
  ChartPorTarifa,
  ChartPagadoVsPendiente,
} from '../components/informes/InformesCharts';
import { TablaProfesionales, TablaMensual } from '../components/informes/InformesTablas';
import InformesExportBar from '../components/informes/InformesExportBar';
import {
  EMPTY_FILTROS_INFORMES,
  rangoDesdePreset,
} from '../utils/dateRanges';
import { rangoFechasInvalido } from '../utils/format';
import {
  exportDashboardCSV,
  exportDashboardPDF,
  exportAgendaCSV,
  exportAgendaPDF,
} from '../utils/exportInformes';
import '../index.css';

export default function InformesPage() {
  const [filtros, setFiltros] = useState(() => EMPTY_FILTROS_INFORMES());
  const [profesionales, setProfesionales] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  const rangoFechasError = rangoFechasInvalido(filtros.fecha_desde, filtros.fecha_hasta);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await listProfesionales(1, 100);
        if (cancelled) return;
        setProfesionales(normalizeListPayload(res));
      } catch {
        if (!cancelled) setProfesionales([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh(f = filtros) {
    setListLoading(true);
    setLoadError(null);
    try {
      const params = {
        fecha_desde: f.fecha_desde || undefined,
        fecha_hasta: f.fecha_hasta || undefined,
        id_profesional: f.id_profesional || undefined,
        estado: f.estado || undefined,
      };
      const res = await getDashboardInformes(params);
      if (res?.status === 'error') throw new Error(res.message || 'Error al generar informe');
      setDashboard(res.data ?? null);
    } catch (e) {
      const msg =
        e?.message ||
        'No se pudo cargar el informe (revisa la sesión o la conexión con el servidor).';
      setLoadError(msg);
      setDashboard(null);
      addToast(msg, 'error');
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    if (rangoFechasError) return undefined;
    const timer = setTimeout(() => {
      refresh(filtros);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.fecha_desde, filtros.fecha_hasta, filtros.id_profesional, filtros.estado, rangoFechasError]);

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
    setFiltros(EMPTY_FILTROS_INFORMES());
  }

  async function withExport(fn) {
    setExporting(true);
    try {
      await fn();
    } catch (e) {
      addToast(e?.message || 'No se pudo exportar', 'error');
    } finally {
      setExporting(false);
    }
  }

  const filtroExport = {
    fecha_desde: filtros.fecha_desde,
    fecha_hasta: filtros.fecha_hasta,
    id_profesional: filtros.id_profesional || '',
    estado: filtros.estado || '',
  };

  const sinDatos =
    !dashboard ||
    ((dashboard.kpis?.total_atenciones ?? 0) === 0 &&
      (dashboard.kpis?.total_citas_agenda ?? 0) === 0 &&
      !(dashboard.por_profesional || []).some(
        (p) => (p.ingresos || 0) > 0 || (p.atenciones || 0) > 0 || (p.citas_agenda || 0) > 0
      ));

  return (
    <div className="ui-page">
      <PageHeader title="Informes" subtitle="Dashboard financiero y de agendas con exportación a CSV y PDF" />

      <hr className="ui-divider" />

      <InformesFiltros
        filtros={filtros}
        profesionales={profesionales}
        onChange={setFiltros}
        onPreset={onPreset}
        onLimpiar={limpiarFiltros}
        rangoFechasError={rangoFechasError}
      />

      {listLoading ? (
        <Skeleton rows={6} />
      ) : loadError ? (
        <EmptyState icon={<AlertTriangle size={24} />} title="No se pudo cargar la información" description={loadError} />
      ) : !dashboard ? (
        <EmptyState
          icon={<BarChart3 size={24} />}
          title="No hay datos para mostrar"
          description="Ajusta el rango de fechas o verifica que existan cobros o citas en el período"
        />
      ) : (
        <>
          {sinDatos ? (
            <EmptyState
              icon={<BarChart3 size={24} />}
              title="No hay datos para mostrar"
              description="Ajusta el rango de fechas o verifica que existan cobros o citas en el período"
            />
          ) : (
            <>
              <KpiCards kpis={dashboard.kpis} />

              <div className="ui-bento" style={{ marginBottom: 24 }}>
                <ChartTendencia serie={dashboard.serie} agruparPor={dashboard.agrupar_por} />
                <ChartPorProfesional rows={dashboard.por_profesional} />
                <ChartPorTarifa rows={dashboard.por_tarifa} />
                <ChartPagadoVsPendiente kpis={dashboard.kpis} />
              </div>
            </>
          )}

          {/* La tabla siempre responde a filtros superiores + búsqueda/paginación local */}
          <TablaProfesionales rows={dashboard.por_profesional} filtros={filtros} />

          {!sinDatos && <TablaMensual rows={dashboard.por_mes} />}

          <InformesExportBar
            disabled={!dashboard}
            exporting={exporting}
            onExportFinCsv={() =>
              withExport(async () => {
                exportDashboardCSV(dashboard, filtroExport);
                addToast('CSV financiero descargado', 'success');
              })
            }
            onExportFinPdf={() =>
              withExport(async () => {
                await exportDashboardPDF(dashboard, filtroExport);
                addToast('PDF financiero descargado', 'success');
              })
            }
            onExportAgendaCsv={() =>
              withExport(async () => {
                const res = await getAgendaInforme({
                  fecha_desde: filtros.fecha_desde,
                  fecha_hasta: filtros.fecha_hasta,
                  id_profesional: filtros.id_profesional || undefined,
                });
                exportAgendaCSV(res.data, filtroExport);
                addToast('CSV de agendas descargado', 'success');
              })
            }
            onExportAgendaPdf={() =>
              withExport(async () => {
                const res = await getAgendaInforme({
                  fecha_desde: filtros.fecha_desde,
                  fecha_hasta: filtros.fecha_hasta,
                  id_profesional: filtros.id_profesional || undefined,
                });
                await exportAgendaPDF(res.data, filtroExport);
                addToast('PDF de agendas descargado', 'success');
              })
            }
          />
        </>
      )}

      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

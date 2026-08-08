import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, BarChart3 } from 'lucide-react';
import { getDashboardInformes } from '../../api/informesApi';
import { useToast } from '../../hooks/useToast';
import EmptyState from '../EmptyState';
import Skeleton from '../ui/Skeleton';
import InformesFiltros from './InformesFiltros';
import KpiCards from './KpiCards';
import {
  ChartTendencia,
  ChartPorProfesional,
  ChartPorTarifa,
  ChartPagadoVsPendiente,
} from './InformesCharts';
import { TablaProfesionales, TablaMensual } from './InformesTablas';
import InformesExportBar from './InformesExportBar';
import { EMPTY_FILTROS_INFORMES, rangoDesdePreset } from '../../utils/dateRanges';
import { rangoFechasInvalido } from '../../utils/format';
import { exportDashboardCSV, exportDashboardPDF } from '../../utils/exportInformes';

export default function InformesFinancierosTab({ profesionales, addToast }) {
  const [filtros, setFiltros] = useState(() => EMPTY_FILTROS_INFORMES());
  const [dashboard, setDashboard] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const fetchIdRef = useRef(0);
  const localToast = useToast();
  const notify = addToast || localToast.addToast;

  const rangoFechasError = rangoFechasInvalido(filtros.fecha_desde, filtros.fecha_hasta);

  async function refresh(f = filtros) {
    const reqId = ++fetchIdRef.current;
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
      if (reqId !== fetchIdRef.current) return;
      if (res?.status === 'error') throw new Error(res.message || 'Error al generar informe');
      setDashboard(res.data ?? null);
      if (res?.warning) notify(res.warning, 'info');
    } catch (e) {
      if (reqId !== fetchIdRef.current) return;
      const msg =
        e?.message ||
        'No se pudo cargar el informe (revisa la sesión o la conexión con el servidor).';
      setLoadError(msg);
      setDashboard(null);
      notify(msg, 'error');
    } finally {
      if (reqId === fetchIdRef.current) setListLoading(false);
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
      notify(e?.message || 'No se pudo exportar', 'error');
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
      !(dashboard.por_profesional || []).some(
        (p) => (p.ingresos || 0) > 0 || (p.atenciones || 0) > 0
      ));

  return (
    <>
      <InformesFiltros
        title="Filtros financieros"
        filtros={filtros}
        profesionales={profesionales}
        onChange={setFiltros}
        onPreset={onPreset}
        onLimpiar={limpiarFiltros}
        rangoFechasError={rangoFechasError}
        showEstado
      />

      {listLoading ? (
        <Skeleton rows={6} />
      ) : loadError ? (
        <EmptyState icon={<AlertTriangle size={24} />} title="No se pudo cargar la información" description={loadError} />
      ) : !dashboard || sinDatos ? (
        <>
          <EmptyState
            icon={<BarChart3 size={24} />}
            title="No hay datos para mostrar"
            description="Ajusta el rango de fechas o verifica que existan cobros en el período"
          />
          {dashboard ? (
            <>
              <TablaProfesionales rows={dashboard.por_profesional} filtros={filtros} />
              <InformesExportBar
                variant="financiero"
                disabled={!dashboard}
                exporting={exporting}
                onExportFinCsv={() =>
                  withExport(async () => {
                    exportDashboardCSV(dashboard, filtroExport);
                    notify('CSV financiero descargado', 'success');
                  })
                }
                onExportFinPdf={() =>
                  withExport(async () => {
                    await exportDashboardPDF(dashboard, filtroExport);
                    notify('PDF financiero descargado', 'success');
                  })
                }
              />
            </>
          ) : null}
        </>
      ) : (
        <>
          <KpiCards kpis={dashboard.kpis} />

          <div className="ui-bento" style={{ marginBottom: 24 }}>
            <ChartTendencia serie={dashboard.serie} agruparPor={dashboard.agrupar_por} />
            <ChartPorProfesional rows={dashboard.por_profesional} />
            <ChartPorTarifa rows={dashboard.por_tarifa} />
            <ChartPagadoVsPendiente kpis={dashboard.kpis} />
          </div>

          <TablaProfesionales rows={dashboard.por_profesional} filtros={filtros} />
          <TablaMensual rows={dashboard.por_mes} />

          <InformesExportBar
            variant="financiero"
            disabled={!dashboard}
            exporting={exporting}
            onExportFinCsv={() =>
              withExport(async () => {
                exportDashboardCSV(dashboard, filtroExport);
                notify('CSV financiero descargado', 'success');
              })
            }
            onExportFinPdf={() =>
              withExport(async () => {
                await exportDashboardPDF(dashboard, filtroExport);
                notify('PDF financiero descargado', 'success');
              })
            }
          />
        </>
      )}
    </>
  );
}

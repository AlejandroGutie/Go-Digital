import { useState, useEffect } from 'react';
import { getResumen } from '../api/cobrosApi';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import EmptyState from '../components/EmptyState';
import '../index.css';

const formatMoneda = (valor) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor || 0);

const formatMes = (mes) => {
  const [year, month] = mes.split('-');
  const date = new Date(year, month - 1);
  return date.toLocaleDateString('es-ES', { year: 'numeric', month: 'long' });
};

const EMPTY_FILTROS = {
  fecha_desde: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
  fecha_hasta: new Date().toISOString().split('T')[0],
};

export default function InformesPage() {
  const [data, setData] = useState(null);
  const [filtros, setFiltros] = useState(EMPTY_FILTROS);
  const [listLoading, setListLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const { toasts, addToast, removeToast } = useToast();

  async function refresh(f = filtros) {
    setListLoading(true);
    setLoadError(null);
    try {
      const params = {};
      if (f.fecha_desde) params.fecha_desde = f.fecha_desde;
      if (f.fecha_hasta) params.fecha_hasta = f.fecha_hasta;
      const res = await getResumen(params);
      if (res?.status === 'error') throw new Error(res.message || 'Error al generar informe');
      setData(res.data ?? null);
    } catch (e) {
      const msg = e?.message || 'No se pudo cargar el informe (revisa la sesión o la conexión con el servidor).';
      setLoadError(msg);
      setData(null);
      addToast(msg, 'error');
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      refresh(filtros);
    }, 500);
    return () => clearTimeout(timer);
  }, [filtros.fecha_desde, filtros.fecha_hasta]);

  function limpiarFiltros() {
    setFiltros(EMPTY_FILTROS);
  }

  const hayFiltrosCustom =
    filtros.fecha_desde !== EMPTY_FILTROS.fecha_desde ||
    filtros.fecha_hasta !== EMPTY_FILTROS.fecha_hasta;

  const exportarCSV = () => {
    if (!data?.por_profesional?.length) return;
    const headers = 'Profesional,Atenciones,Ingresos,Pagado,Pendiente\n';
    const rows = data.por_profesional
      .map((p) => `${p.nombre},${p.atenciones},${p.ingresos},${p.pagado},${p.pendiente}`)
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cobros_informe_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ fontFamily: 'var(--font-fallback)', color: 'var(--color-black)' }}>
      <h1 className="font-display" style={{ fontSize: 22, fontWeight: 600, color: 'var(--color-entorno)', marginBottom: 20 }}>
        Informes financieros
      </h1>

      <hr style={{ margin: '0 0 24px' }} />

      {listLoading ? (
        <p style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-purple-light)', fontSize: 14 }}>
          Generando reporte…
        </p>
      ) : loadError ? (
        <EmptyState icon="⚠️" title="No se pudo cargar la información" description={loadError} />
      ) : null}

      {!listLoading && !loadError && (
        <>
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="date"
              value={filtros.fecha_desde}
              onChange={(e) => setFiltros({ ...filtros, fecha_desde: e.target.value })}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-purple-light)', fontSize: 14 }}
            />
            <input
              type="date"
              value={filtros.fecha_hasta}
              onChange={(e) => setFiltros({ ...filtros, fecha_hasta: e.target.value })}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-purple-light)', fontSize: 14 }}
            />
            {hayFiltrosCustom && (
              <button
                type="button"
                onClick={limpiarFiltros}
                style={{ fontSize: 13, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 6, padding: '7px 12px', cursor: 'pointer' }}>
                Limpiar
              </button>
            )}
          </div>

          {!data ? (
            <EmptyState
              icon="📊"
              title="No hay datos para mostrar"
              description="Ajusta el rango de fechas o verifica que existan cobros en el período"
            />
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20, marginBottom: 40 }}>
                {[
                  { label: 'Total ingresos', val: data.total_ingresos, bg: 'var(--color-entorno)', color: 'var(--color-white)' },
                  { label: 'Total pagado', val: data.total_pagado, bg: 'var(--color-entorno)', color: 'var(--color-white)' },
                  { label: 'Total pendiente', val: data.total_pendiente, bg: 'var(--color-entorno)', color: 'var(--color-white)' },
                  { label: 'Total atenciones', val: data.total_atenciones, bg: 'var(--color-entorno)', color: 'var(--color-white)', noMoneda: true },
                ].map((card) => (
                  <div key={card.label} style={{ backgroundColor: card.bg, padding: 20, borderRadius: 12 }}>
                    <p style={{ margin: '0 0 8px', fontSize: 14, color: card.color, fontWeight: 500 }}>{card.label}</p>
                    <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: card.color }}>
                      {card.noMoneda ? card.val : formatMoneda(card.val)}
                    </p>
                  </div>
                ))}
              </div>

              {data.por_profesional?.length === 0 ? (
                <EmptyState
                  icon="👨‍⚕️"
                  title="Sin ingresos por profesional"
                  description="No hay movimientos de cobro en el rango seleccionado"
                />
              ) : (
                <div style={{ backgroundColor: 'var(--color-white)', borderRadius: 12, border: '1px solid var(--color-purple-light)', overflow: 'hidden', marginBottom: 40 }}>
                  <div style={{ padding: 16, borderBottom: '1px solid var(--color-purple-light)', fontWeight: 600 }}>Ingresos por profesional</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-fallback)' }}>
                    <thead style={{ backgroundColor: 'var(--bg-main)' }}>
                      <tr>
                        {['Profesional', 'Atenciones', 'Ingresos', 'Pagado', 'Pendiente'].map((h) => (
                          <th key={h} style={{ padding: 12, textAlign: h === 'Profesional' ? 'left' : 'right', fontWeight: 500 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.por_profesional.map((p) => (
                        <tr key={p.id} style={{ borderBottom: '1px solid var(--color-purple-light)' }}>
                          <td style={{ padding: 12 }}>{p.nombre}</td>
                          <td style={{ padding: 12, textAlign: 'center' }}>{p.atenciones}</td>
                          <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>{formatMoneda(p.ingresos)}</td>
                          <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>{formatMoneda(p.pagado)}</td>
                          <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>{formatMoneda(p.pendiente)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {data.por_mes?.length > 0 && (
                <div style={{ backgroundColor: 'var(--color-white)', borderRadius: 12, border: '1px solid var(--color-purple-light)', overflow: 'hidden', marginBottom: 40 }}>
                  <div style={{ padding: 16, borderBottom: '1px solid var(--color-purple-light)', fontWeight: 600 }}>Ingresos por mes</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-fallback)' }}>
                    <thead style={{ backgroundColor: 'var(--bg-main)' }}>
                      <tr>
                        {['Mes', 'Atenciones', 'Ingresos'].map((h) => (
                          <th key={h} style={{ padding: 12, textAlign: h === 'Mes' ? 'left' : 'right', fontWeight: 500 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.por_mes.map((m) => (
                        <tr key={m.mes} style={{ borderBottom: '1px solid var(--color-purple-light)' }}>
                          <td style={{ padding: 12 }}>{formatMes(m.mes)}</td>
                          <td style={{ padding: 12, textAlign: 'center' }}>{m.atenciones}</td>
                          <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>{formatMoneda(m.ingresos)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={exportarCSV}
                  disabled={!data.por_profesional?.length}
                  style={{ backgroundColor: 'var(--color-entorno)', color: 'var(--color-white)', border: 'none', padding: '12px 24px', borderRadius: 8, cursor: 'pointer', fontWeight: 500, opacity: data.por_profesional?.length ? 1 : 0.5 }}>
                  Exportar CSV
                </button>
              </div>
            </>
          )}
        </>
      )}

      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

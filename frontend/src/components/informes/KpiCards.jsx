import { formatMoneda } from '../../utils/exportInformes';

export default function KpiCards({ kpis }) {
  const k = kpis || {};
  const cards = [
    { label: 'Ingresos totales', value: formatMoneda(k.total_ingresos) },
    { label: 'Pagado', value: formatMoneda(k.total_pagado) },
    { label: 'Saldos pendientes', value: formatMoneda(k.total_pendiente) },
    { label: 'Atenciones', value: String(k.total_atenciones ?? 0) },
    { label: 'Ticket promedio', value: formatMoneda(k.ticket_promedio) },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 16,
        marginBottom: 24,
      }}
    >
      {cards.map((c) => (
        <div
          key={c.label}
          style={{
            background: 'var(--color-entorno)',
            color: 'var(--color-white)',
            borderRadius: 12,
            padding: 16,
          }}
        >
          <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 500, opacity: 0.95 }}>
            {c.label}
          </p>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{c.value}</p>
        </div>
      ))}
      {typeof k.total_citas_agenda === 'number' && (
        <div
          style={{
            background: 'var(--color-white)',
            color: 'var(--color-entorno)',
            borderRadius: 12,
            padding: 16,
            border: '1px solid var(--color-purple-light)',
          }}
        >
          <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 500 }}>Citas en agenda</p>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{k.total_citas_agenda}</p>
        </div>
      )}
    </div>
  );
}

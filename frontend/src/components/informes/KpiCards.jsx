import { formatMoneda } from '../../utils/exportInformes';

export default function KpiCards({ kpis, showAgendaKpi = false }) {
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
      {showAgendaKpi && typeof k.total_citas_agenda === 'number' && (
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
          <p style={{ margin: '6px 0 0', fontSize: 11, opacity: 0.85 }}>
            Sin canceladas, en el rango filtrado
          </p>
        </div>
      )}
    </div>
  );
}

/** KPIs específicos del informe de agendas. */
export function KpiCardsAgenda({ kpis }) {
  const k = kpis || {};
  const cards = [
    { label: 'Citas activas', value: String(k.total_citas ?? 0), tone: 'solid' },
    { label: 'Promedio diario', value: String(k.promedio_diario ?? 0), tone: 'outline' },
    { label: 'Profesionales con citas', value: String(k.profesionales_activos ?? 0), tone: 'outline' },
    { label: 'Mascotas con cita', value: String(k.mascotas_unicas ?? 0), tone: 'outline' },
    { label: 'Mascotas atendidas', value: String(k.mascotas_atendidas ?? 0), tone: 'outline' },
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
          style={
            c.tone === 'solid'
              ? {
                  background: 'var(--color-entorno)',
                  color: 'var(--color-white)',
                  borderRadius: 12,
                  padding: 16,
                }
              : {
                  background: 'var(--color-white)',
                  color: 'var(--color-entorno)',
                  borderRadius: 12,
                  padding: 16,
                  border: '1px solid var(--color-purple-light)',
                }
          }
        >
          <p
            style={{
              margin: '0 0 8px',
              fontSize: 13,
              fontWeight: 500,
              opacity: c.tone === 'solid' ? 0.95 : 1,
            }}
          >
            {c.label}
          </p>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

/** KPIs del informe de fidelización. */
export function KpiCardsFidelizacion({ kpis }) {
  const k = kpis || {};
  const cards = [
    { label: 'Cumpleaños / mesarios (7 días)', value: String(k.proximos_7 ?? 0), tone: 'solid' },
    { label: 'En 15 días', value: String(k.proximos_15 ?? 0), tone: 'outline' },
    { label: 'En 30 días', value: String(k.proximos_30 ?? 0), tone: 'outline' },
    { label: 'Hitos alcanzados', value: String(k.hitos_alcanzados ?? 0), tone: 'outline' },
    { label: 'A 1 visita del hito', value: String(k.hitos_por_alcanzar ?? 0), tone: 'outline' },
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
          style={
            c.tone === 'solid'
              ? {
                  background: 'var(--color-entorno)',
                  color: 'var(--color-white)',
                  borderRadius: 12,
                  padding: 16,
                }
              : {
                  background: 'var(--color-white)',
                  color: 'var(--color-entorno)',
                  borderRadius: 12,
                  padding: 16,
                  border: '1px solid var(--color-purple-light)',
                }
          }
        >
          <p
            style={{
              margin: '0 0 8px',
              fontSize: 13,
              fontWeight: 500,
              opacity: c.tone === 'solid' ? 0.95 : 1,
            }}
          >
            {c.label}
          </p>
          <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

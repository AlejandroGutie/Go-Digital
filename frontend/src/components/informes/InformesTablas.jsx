import { formatMoneda, formatMesLabel } from '../../utils/exportInformes';

function TableShell({ title, children }) {
  return (
    <div
      style={{
        background: 'var(--color-white)',
        borderRadius: 12,
        border: '1px solid var(--color-purple-light)',
        overflow: 'hidden',
        marginBottom: 24,
      }}
    >
      <div
        style={{
          padding: 16,
          borderBottom: '1px solid var(--color-purple-light)',
          fontWeight: 600,
        }}
      >
        {title}
      </div>
      <div className="table-scroll">{children}</div>
    </div>
  );
}

export function TablaProfesionales({ rows }) {
  return (
    <TableShell title="Resumen por profesional">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-fallback)' }}>
        <thead style={{ backgroundColor: 'var(--bg-main)' }}>
          <tr>
            {['Profesional', 'Atenciones', 'Citas agenda', 'Ingresos', 'Pagado', 'Pendiente'].map(
              (h) => (
                <th
                  key={h}
                  style={{
                    padding: 12,
                    textAlign: h === 'Profesional' ? 'left' : 'right',
                    fontWeight: 500,
                    fontSize: 13,
                  }}
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {(rows || []).length === 0 ? (
            <tr>
              <td colSpan={6} style={{ padding: 16, textAlign: 'center', color: 'var(--color-purple-light)' }}>
                Sin datos por profesional
              </td>
            </tr>
          ) : (
            rows.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--color-purple-light)' }}>
                <td style={{ padding: 12 }}>{p.nombre}</td>
                <td style={{ padding: 12, textAlign: 'right' }}>{p.atenciones}</td>
                <td style={{ padding: 12, textAlign: 'right' }}>{p.citas_agenda ?? 0}</td>
                <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>
                  {formatMoneda(p.ingresos)}
                </td>
                <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>
                  {formatMoneda(p.pagado)}
                </td>
                <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>
                  {formatMoneda(p.pendiente)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </TableShell>
  );
}

export function TablaMensual({ rows }) {
  return (
    <TableShell title="Histórico mensual">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-fallback)' }}>
        <thead style={{ backgroundColor: 'var(--bg-main)' }}>
          <tr>
            {['Mes', 'Atenciones', 'Ingresos', 'Pagado', 'Pendiente'].map((h) => (
              <th
                key={h}
                style={{
                  padding: 12,
                  textAlign: h === 'Mes' ? 'left' : 'right',
                  fontWeight: 500,
                  fontSize: 13,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(rows || []).length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: 16, textAlign: 'center', color: 'var(--color-purple-light)' }}>
                Sin histórico mensual
              </td>
            </tr>
          ) : (
            rows.map((m) => (
              <tr key={m.mes} style={{ borderBottom: '1px solid var(--color-purple-light)' }}>
                <td style={{ padding: 12 }}>{formatMesLabel(m.mes)}</td>
                <td style={{ padding: 12, textAlign: 'right' }}>{m.atenciones}</td>
                <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>
                  {formatMoneda(m.ingresos)}
                </td>
                <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>
                  {formatMoneda(m.pagado)}
                </td>
                <td style={{ padding: 12, textAlign: 'right', fontWeight: 600 }}>
                  {formatMoneda(m.pendiente)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </TableShell>
  );
}

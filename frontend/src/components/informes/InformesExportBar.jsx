const btn = {
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid var(--color-entorno)',
  background: 'var(--color-white)',
  color: 'var(--color-entorno)',
  fontWeight: 500,
  fontSize: 13,
  cursor: 'pointer',
};

const btnPrimary = {
  ...btn,
  background: 'var(--color-entorno)',
  color: 'var(--color-white)',
};

export default function InformesExportBar({
  disabled,
  exporting,
  onExportFinCsv,
  onExportFinPdf,
  onExportAgendaCsv,
  onExportAgendaPdf,
}) {
  return (
    <div
      style={{
        background: 'var(--color-white)',
        border: '1px solid var(--color-purple-light)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 24,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Exportar informes</div>
      <div className="fields-row">
        <button type="button" style={btnPrimary} disabled={disabled || exporting} onClick={onExportFinCsv}>
          CSV financiero
        </button>
        <button type="button" style={btn} disabled={disabled || exporting} onClick={onExportFinPdf}>
          PDF financiero
        </button>
        <button type="button" style={btn} disabled={disabled || exporting} onClick={onExportAgendaCsv}>
          CSV agendas
        </button>
        <button type="button" style={btn} disabled={disabled || exporting} onClick={onExportAgendaPdf}>
          PDF agendas
        </button>
      </div>
      {exporting && (
        <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--color-purple-light)' }}>
          Generando archivo…
        </p>
      )}
    </div>
  );
}

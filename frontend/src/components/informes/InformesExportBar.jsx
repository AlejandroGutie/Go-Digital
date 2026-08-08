import Button from '../ui/Button';

/**
 * Barra de exportación por contexto de pestaña.
 * `variant`: 'financiero' | 'agenda'
 */
export default function InformesExportBar({
  variant = 'financiero',
  disabled,
  exporting,
  onExportFinCsv,
  onExportFinPdf,
  onExportAgendaCsv,
  onExportAgendaPdf,
}) {
  const isFinanciero = variant === 'financiero';
  const isAgenda = variant === 'agenda';

  return (
    <div className="ui-card" style={{ marginBottom: 24 }}>
      <div style={{ fontWeight: 600, marginBottom: 12, fontSize: '0.9375rem', color: 'var(--color-black)' }}>
        Exportar informes
      </div>
      <div className="fields-row">
        {isFinanciero && (
          <>
            <Button variant="primary" disabled={disabled || exporting} onClick={onExportFinCsv}>
              CSV financiero
            </Button>
            <Button variant="secondary" disabled={disabled || exporting} onClick={onExportFinPdf}>
              PDF financiero
            </Button>
          </>
        )}
        {isAgenda && (
          <>
            <Button variant="primary" disabled={disabled || exporting} onClick={onExportAgendaCsv}>
              CSV agendas
            </Button>
            <Button variant="secondary" disabled={disabled || exporting} onClick={onExportAgendaPdf}>
              PDF agendas
            </Button>
          </>
        )}
      </div>
      {exporting && (
        <p style={{ margin: '10px 0 0', fontSize: '0.8125rem', color: 'var(--color-purple-light)' }}>
          Generando archivo…
        </p>
      )}
    </div>
  );
}

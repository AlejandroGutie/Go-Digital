import { PRESETS_INFORMES } from '../../utils/dateRanges';

const selectStyle = {
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid var(--color-purple-light)',
  fontSize: 14,
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  background: 'var(--color-white)',
};

const chipBase = {
  padding: '7px 12px',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  border: '1px solid var(--color-entorno)',
  background: 'none',
  color: 'var(--color-entorno)',
};

export default function InformesFiltros({
  filtros,
  profesionales,
  onChange,
  onPreset,
  onLimpiar,
}) {
  return (
    <div
      style={{
        background: 'var(--color-white)',
        border: '1px solid var(--color-purple-light)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--color-entorno)' }}>
        Filtros del informe
      </div>

      <div className="fields-row" style={{ marginBottom: 12 }}>
        {PRESETS_INFORMES.filter((p) => p.id !== 'personalizado').map((p) => {
          const active = filtros.preset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onPreset(p.id)}
              style={{
                ...chipBase,
                background: active ? 'var(--color-entorno)' : 'none',
                color: active ? 'var(--color-white)' : 'var(--color-entorno)',
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="fields-row">
        <input
          type="date"
          value={filtros.fecha_desde}
          onChange={(e) => onChange({ ...filtros, fecha_desde: e.target.value, preset: 'personalizado' })}
          style={selectStyle}
          aria-label="Fecha desde"
        />
        <input
          type="date"
          value={filtros.fecha_hasta}
          onChange={(e) => onChange({ ...filtros, fecha_hasta: e.target.value, preset: 'personalizado' })}
          style={selectStyle}
          aria-label="Fecha hasta"
        />
        <select
          value={filtros.id_profesional}
          onChange={(e) => onChange({ ...filtros, id_profesional: e.target.value })}
          style={selectStyle}
          aria-label="Profesional"
        >
          <option value="">Todos los profesionales</option>
          {profesionales.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <select
          value={filtros.estado}
          onChange={(e) => onChange({ ...filtros, estado: e.target.value })}
          style={selectStyle}
          aria-label="Estado del cobro"
        >
          <option value="">Todos los estados</option>
          <option value="pagado">Pagados</option>
          <option value="pendiente">Pendientes</option>
          <option value="anulado">Anulados</option>
        </select>
        <button
          type="button"
          onClick={onLimpiar}
          style={{ ...chipBase, width: '100%', boxSizing: 'border-box' }}
        >
          Limpiar filtros
        </button>
      </div>
    </div>
  );
}

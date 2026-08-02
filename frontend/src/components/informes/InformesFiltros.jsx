import { PRESETS_INFORMES } from '../../utils/dateRanges';
import Field, { Input, Select } from '../ui/Field';
import Button from '../ui/Button';

export default function InformesFiltros({
  filtros,
  profesionales,
  onChange,
  onPreset,
  onLimpiar,
}) {
  return (
    <div className="ui-card" style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 600, marginBottom: 12, fontSize: '0.9375rem', color: 'var(--color-black)' }}>
        Filtros del informe
      </div>

      <div className="ui-chips">
        {PRESETS_INFORMES.filter((p) => p.id !== 'personalizado').map((p) => {
          const active = filtros.preset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              className={`ui-chip${active ? ' ui-chip--active' : ''}`}
              onClick={() => onPreset(p.id)}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="fields-row">
        <Field label="Desde">
          <Input
            type="date"
            value={filtros.fecha_desde}
            onChange={(e) => onChange({ ...filtros, fecha_desde: e.target.value, preset: 'personalizado' })}
            aria-label="Fecha desde"
          />
        </Field>
        <Field label="Hasta">
          <Input
            type="date"
            value={filtros.fecha_hasta}
            onChange={(e) => onChange({ ...filtros, fecha_hasta: e.target.value, preset: 'personalizado' })}
            aria-label="Fecha hasta"
          />
        </Field>
        <Field label="Profesional">
          <Select
            value={filtros.id_profesional}
            onChange={(e) => onChange({ ...filtros, id_profesional: e.target.value })}
            aria-label="Profesional"
          >
            <option value="">Todos los profesionales</option>
            {profesionales.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estado">
          <Select
            value={filtros.estado}
            onChange={(e) => onChange({ ...filtros, estado: e.target.value })}
            aria-label="Estado del cobro"
          >
            <option value="">Todos los estados</option>
            <option value="pagado">Pagados</option>
            <option value="pendiente">Pendientes</option>
            <option value="anulado">Anulados</option>
          </Select>
        </Field>
        <Button variant="ghost" onClick={onLimpiar} block>
          Limpiar filtros
        </Button>
      </div>
    </div>
  );
}

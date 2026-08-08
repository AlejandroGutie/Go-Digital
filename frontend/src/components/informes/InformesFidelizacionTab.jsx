import { useState } from 'react';
import { HeartHandshake } from 'lucide-react';
import EmptyState from '../EmptyState';
import InformesFiltros from './InformesFiltros';
import { EMPTY_FILTROS_INFORMES, rangoDesdePreset } from '../../utils/dateRanges';
import { rangoFechasInvalido } from '../../utils/format';

/**
 * Cascarón de Fidelización: filtros consistentes + empty state.
 * Sin llamadas a API todavía.
 */
export default function InformesFidelizacionTab({ profesionales }) {
  const [filtros, setFiltros] = useState(() => EMPTY_FILTROS_INFORMES());
  const rangoFechasError = rangoFechasInvalido(filtros.fecha_desde, filtros.fecha_hasta);

  function onPreset(presetId) {
    const r = rangoDesdePreset(presetId);
    setFiltros((prev) => ({
      ...prev,
      preset: presetId,
      fecha_desde: r.fecha_desde,
      fecha_hasta: r.fecha_hasta,
    }));
  }

  return (
    <>
      <InformesFiltros
        title="Filtros de fidelización"
        filtros={filtros}
        profesionales={profesionales}
        onChange={setFiltros}
        onPreset={onPreset}
        onLimpiar={() => setFiltros(EMPTY_FILTROS_INFORMES())}
        rangoFechasError={rangoFechasError}
        showEstado={false}
      />

      <div className="ui-card" style={{ padding: '32px 20px' }}>
        <EmptyState
          icon={<HeartHandshake size={28} />}
          title="Módulo de Fidelización en desarrollo"
          description="Próximamente podrás consultar métricas de recurrencia de pacientes/mascotas, reatención de cuidadores y programas de fidelización."
        />
      </div>
    </>
  );
}

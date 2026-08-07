import { useEffect, useMemo, useRef, useState } from 'react';
import { PRESETS_INFORMES } from '../../utils/dateRanges';
import Field, { DateInput, Input, Select } from '../ui/Field';
import Button from '../ui/Button';

const TODOS_LABEL = 'Todos los profesionales';

export default function InformesFiltros({
  filtros,
  profesionales,
  onChange,
  onPreset,
  onLimpiar,
  rangoFechasError = false,
}) {
  const [busquedaProf, setBusquedaProf] = useState('');
  const [listaAbierta, setListaAbierta] = useState(false);
  const buscadorRef = useRef(null);

  // Sincronizar etiqueta cuando el filtro global apunta a un profesional concreto
  useEffect(() => {
    if (!filtros.id_profesional) return;
    const selected = (profesionales || []).find(
      (p) => String(p.id) === String(filtros.id_profesional)
    );
    if (selected) setBusquedaProf(selected.nombre || '');
  }, [filtros.id_profesional, profesionales]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (buscadorRef.current && !buscadorRef.current.contains(e.target)) {
        setListaAbierta(false);
        // Si cerró sin elegir, restaurar texto al profesional filtrado (o vacío = todos)
        if (!filtros.id_profesional) {
          setBusquedaProf('');
        } else {
          const selected = (profesionales || []).find(
            (p) => String(p.id) === String(filtros.id_profesional)
          );
          setBusquedaProf(selected?.nombre || '');
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filtros.id_profesional, profesionales]);

  const profesionalesFiltrados = useMemo(() => {
    const q = busquedaProf.trim().toLowerCase();
    const list = profesionales || [];
    if (!q) return list;
    return list.filter(
      (p) =>
        (p.nombre || '').toLowerCase().includes(q) ||
        (p.telefono || '').toLowerCase().includes(q)
    );
  }, [profesionales, busquedaProf]);

  const mostrarOpcionTodos =
    !busquedaProf.trim() || TODOS_LABEL.toLowerCase().includes(busquedaProf.trim().toLowerCase());

  function seleccionarTodos() {
    onChange({ ...filtros, id_profesional: '' });
    setBusquedaProf('');
    setListaAbierta(false);
  }

  function seleccionarProfesional(p) {
    onChange({ ...filtros, id_profesional: String(p.id) });
    setBusquedaProf(p.nombre || '');
    setListaAbierta(false);
  }

  function handleBusquedaChange(value) {
    setBusquedaProf(value);
    setListaAbierta(true);
  }

  function handleLimpiar() {
    setBusquedaProf('');
    setListaAbierta(false);
    onLimpiar();
  }

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
          <DateInput
            value={filtros.fecha_desde}
            onChange={(e) =>
              onChange({ ...filtros, fecha_desde: e.target.value, preset: 'personalizado' })
            }
            max={filtros.fecha_hasta || undefined}
            aria-label="Fecha desde"
          />
        </Field>
        <Field label="Hasta">
          <DateInput
            value={filtros.fecha_hasta}
            onChange={(e) =>
              onChange({ ...filtros, fecha_hasta: e.target.value, preset: 'personalizado' })
            }
            min={filtros.fecha_desde || undefined}
            aria-label="Fecha hasta"
          />
        </Field>

        <Field id="filtro-profesional" label="Profesional">
          <div ref={buscadorRef} className="ui-combo">
            <Input
              id="filtro-profesional"
              type="text"
              role="combobox"
              aria-expanded={listaAbierta}
              aria-controls="lista-profesionales-informe"
              aria-autocomplete="list"
              placeholder="Buscar por nombre o teléfono…"
              value={busquedaProf}
              onChange={(e) => handleBusquedaChange(e.target.value)}
              onFocus={() => setListaAbierta(true)}
              aria-label="Buscar profesional"
            />

            {listaAbierta && (
              <ul
                id="lista-profesionales-informe"
                role="listbox"
                className="ui-combo__list"
              >
                {mostrarOpcionTodos && (
                  <li role="option" aria-selected={!filtros.id_profesional}>
                    <button
                      type="button"
                      className={`ui-combo__item${!filtros.id_profesional ? ' ui-combo__item--active' : ''}`}
                      onClick={seleccionarTodos}
                    >
                      {TODOS_LABEL}
                    </button>
                  </li>
                )}

                {profesionalesFiltrados.length === 0 && !mostrarOpcionTodos ? (
                  <li
                    className="ui-combo__item"
                    style={{ cursor: 'default', color: 'var(--color-purple-light)' }}
                  >
                    No se encontraron profesionales
                  </li>
                ) : (
                  profesionalesFiltrados.map((p) => (
                    <li
                      key={p.id}
                      role="option"
                      aria-selected={String(filtros.id_profesional) === String(p.id)}
                    >
                      <button
                        type="button"
                        className={`ui-combo__item${
                          String(filtros.id_profesional) === String(p.id)
                            ? ' ui-combo__item--active'
                            : ''
                        }`}
                        onClick={() => seleccionarProfesional(p)}
                      >
                        <div>{p.nombre}</div>
                        {p.telefono ? (
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-purple-light)' }}>
                            {p.telefono}
                          </div>
                        ) : null}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
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
        <Button variant="ghost" onClick={handleLimpiar} block>
          Limpiar filtros
        </Button>
      </div>

      {rangoFechasError && (
        <div className="ui-banner ui-banner--warn" style={{ marginTop: 12 }}>
          La fecha «Desde» no puede ser posterior a «Hasta».
        </div>
      )}
    </div>
  );
}

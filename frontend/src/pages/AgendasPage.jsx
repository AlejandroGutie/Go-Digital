import { useEffect, useState, useRef } from 'react';
import { AlertTriangle, Calendar, Stethoscope, Trash2 } from 'lucide-react';
import { listProfesionales } from '../api/profesionalesApi';
import { getAgendaDeProfesional, crearCitaAgenda, eliminarCitaAgenda } from '../api/agendasApi';
import { listMascotas } from '../api/mascotasApi';
import { normalizeListPayload } from '../api/normalize';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import { formatFecha, formatHora, toDateOnly } from '../utils/format';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import Field, { Input } from '../components/ui/Field';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';
import '../index.css';

/** Convierte "HH:MM" o "HH:MM:SS" a minutos desde medianoche. */
function horaAMinutos(hora) {
  if (!hora) return null;
  const [h, m] = String(hora).split(':');
  const hh = parseInt(h, 10);
  const mm = parseInt(m, 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

/**
 * Dos franjas se solapan si comparten minutos (inicio inclusivo, fin exclusivo).
 * Ej.: 10:00–11:00 y 11:00–12:00 NO se solapan; 10:00–11:00 y 10:30–11:30 SÍ.
 */
function franjasSeSolapan(inicioA, finA, inicioB, finB) {
  const a0 = horaAMinutos(inicioA);
  const a1 = horaAMinutos(finA);
  const b0 = horaAMinutos(inicioB);
  const b1 = horaAMinutos(finB);
  if ([a0, a1, b0, b1].some((v) => v == null)) return false;
  return a0 < b1 && b0 < a1;
}

function encontrarCitaConflicto(citas, fecha, horaInicio, horaFin) {
  if (!fecha || !horaInicio || !horaFin) return null;
  const fechaNorm = toDateOnly(fecha);
  return (
    citas.find(
      (c) =>
        toDateOnly(c.fecha) === fechaNorm &&
        franjasSeSolapan(horaInicio, horaFin, c.hora_inicio, c.hora_fin)
    ) || null
  );
}

export default function AgendasPage() {
  const [profesionales, setProfesionales] = useState([]);
  const [mascotas, setMascotas] = useState([]);
  const [profSel, setProfSel] = useState(null);
  const [citas, setCitas] = useState([]);
  const [mascotaId, setMascotaId] = useState('');
  const [fecha, setFecha] = useState('');
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFin, setHoraFin] = useState('');
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError] = useState(null);
  const [busquedaProf, setBusquedaProf] = useState('');
  const [listaAbierta, setListaAbierta] = useState(false);
  const [busquedaMascota, setBusquedaMascota] = useState('');
  const [listaMascotasAbierta, setListaMascotasAbierta] = useState(false);
  const { toasts, addToast, removeToast } = useToast();
  const buscadorRef = useRef(null);
  const buscadorMascotaRef = useRef(null);

  useEffect(() => {
    async function init() {
      setInitLoading(true);
      setInitError(null);
      try {
        const [resProf, resMasc] = await Promise.all([
          listProfesionales(1, 100),
          listMascotas(1, 100),
        ]);
        setProfesionales(normalizeListPayload(resProf));
        setMascotas(normalizeListPayload(resMasc));
      } catch (e) {
        const msg =
          e?.message ||
          'No se pudieron cargar profesionales o mascotas (sesión, red o permisos de base de datos).';
        setInitError(msg);
        addToast(msg, 'error');
      } finally {
        setInitLoading(false);
      }
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handleClickOutside(e) {
      if (buscadorRef.current && !buscadorRef.current.contains(e.target)) {
        setListaAbierta(false);
      }
      if (buscadorMascotaRef.current && !buscadorMascotaRef.current.contains(e.target)) {
        setListaMascotasAbierta(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const profesionalesFiltrados = profesionales.filter((p) => {
    const q = busquedaProf.trim().toLowerCase();
    if (!q) return true;
    return (
      (p.nombre || '').toLowerCase().includes(q) ||
      (p.telefono || '').toLowerCase().includes(q)
    );
  });

  const mascotasFiltradas = mascotas.filter((m) => {
    const q = busquedaMascota.trim().toLowerCase();
    if (!q) return true;
    return (
      (m.nombre || '').toLowerCase().includes(q) ||
      (m.especie || '').toLowerCase().includes(q) ||
      (m.raza || '').toLowerCase().includes(q) ||
      (m.tamano || '').toLowerCase().includes(q)
    );
  });

  function limpiarMascotaSeleccion() {
    setMascotaId('');
    setBusquedaMascota('');
    setListaMascotasAbierta(false);
  }

  function seleccionarMascota(m) {
    setMascotaId(String(m.id));
    setBusquedaMascota(m.nombre || '');
    setListaMascotasAbierta(false);
  }

  async function seleccionarProfesional(p) {
    setProfSel(p);
    setBusquedaProf(p.nombre || '');
    setListaAbierta(false);
    limpiarMascotaSeleccion();
    setFecha('');
    setHoraInicio('');
    setHoraFin('');
    try {
      const res = await getAgendaDeProfesional(p.id);
      setCitas(normalizeListPayload(res));
    } catch (e) {
      addToast(e?.message || 'Error al cargar la agenda del profesional', 'error');
    }
  }

  function limpiarSeleccion() {
    setProfSel(null);
    setBusquedaProf('');
    setCitas([]);
    limpiarMascotaSeleccion();
    setFecha('');
    setHoraInicio('');
    setHoraFin('');
    setListaAbierta(false);
  }

  async function handleAgendar() {
    if (!mascotaId || !fecha || !horaInicio || !horaFin) return;
    const fechaGuardar = toDateOnly(fecha);
    if (!fechaGuardar) {
      addToast('Fecha inválida', 'error');
      return;
    }
    if (horaAMinutos(horaFin) <= horaAMinutos(horaInicio)) {
      addToast('La hora final debe ser posterior a la hora de inicio', 'error');
      return;
    }
    const conflicto = encontrarCitaConflicto(citas, fechaGuardar, horaInicio, horaFin);
    if (conflicto) {
      addToast(
        `Cita ocupada: ${formatFecha(conflicto.fecha)} · ${formatHora(conflicto.hora_inicio)} – ${formatHora(conflicto.hora_fin)} (${conflicto.mascota_nombre || 'otra mascota'})`,
        'error'
      );
      return;
    }
    setLoading(true);
    try {
      await crearCitaAgenda(profSel.id, {
        id_mascota: Number(mascotaId),
        fecha: fechaGuardar,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
      });
      addToast('Cita agendada correctamente', 'success');
      limpiarMascotaSeleccion();
      setFecha('');
      setHoraInicio('');
      setHoraFin('');
      const res = await getAgendaDeProfesional(profSel.id);
      setCitas(normalizeListPayload(res));
    } catch (e) {
      addToast(e?.message || 'Error al agendar', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleEliminar(idAgenda) {
    setLoading(true);
    try {
      await eliminarCitaAgenda(profSel.id, idAgenda);
      addToast('Cita eliminada correctamente', 'success');
      setCitas((prev) => prev.filter((c) => c.id !== idAgenda));
    } catch (e) {
      addToast(e?.message || 'Error al eliminar la cita', 'error');
    } finally {
      setLoading(false);
    }
  }

  const horaFinInvalida =
    !!horaInicio && !!horaFin && horaAMinutos(horaFin) <= horaAMinutos(horaInicio);

  const citaConflicto =
    !horaFinInvalida && fecha && horaInicio && horaFin
      ? encontrarCitaConflicto(citas, fecha, horaInicio, horaFin)
      : null;

  const franjaOcupada = !!citaConflicto;

  const citasDelDia = fecha
    ? citas
        .filter((c) => toDateOnly(c.fecha) === toDateOnly(fecha))
        .sort(
          (a, b) =>
            (horaAMinutos(a.hora_inicio) ?? 0) - (horaAMinutos(b.hora_inicio) ?? 0)
        )
    : [];

  const puedeAgendar =
    !!mascotaId &&
    !!fecha &&
    !!horaInicio &&
    !!horaFin &&
    !horaFinInvalida &&
    !franjaOcupada;

  const inputErrorStyle = {
    borderColor: '#dc2626',
  };

  return (
    <div className="ui-page">
      <PageHeader
        title="Agendas"
        subtitle="Busca y selecciona un profesional para ver su agenda y asignar mascotas con fecha y franja horaria."
      />

      {initLoading ? (
        <Skeleton rows={5} />
      ) : initError ? (
        <EmptyState
          icon={<AlertTriangle size={24} />}
          title="No se pudo cargar la información"
          description={initError}
        />
      ) : profesionales.length === 0 ? (
        <EmptyState
          icon={<Stethoscope size={24} />}
          title="No hay profesionales registrados"
          description="Agrega un profesional desde el módulo de Profesionales"
        />
      ) : (
        <div className="ui-split">
          <div className="ui-card">
            <Field id="buscador-profesional" label="Profesional">
              <div ref={buscadorRef} className="ui-combo">
                <div className="ui-btn-row">
                  <Input
                    id="buscador-profesional"
                    type="text"
                    role="combobox"
                    aria-expanded={listaAbierta}
                    aria-controls="lista-profesionales"
                    aria-autocomplete="list"
                    placeholder="Buscar por nombre o teléfono…"
                    value={busquedaProf}
                    disabled={loading}
                    onChange={(e) => {
                      setBusquedaProf(e.target.value);
                      setListaAbierta(true);
                      if (profSel && e.target.value !== profSel.nombre) {
                        setProfSel(null);
                        setCitas([]);
                        limpiarMascotaSeleccion();
                        setFecha('');
                        setHoraInicio('');
                        setHoraFin('');
                      }
                    }}
                    onFocus={() => setListaAbierta(true)}
                  />
                  {(profSel || busquedaProf) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={limpiarSeleccion}
                      disabled={loading}
                    >
                      Limpiar
                    </Button>
                  )}
                </div>

                {listaAbierta && (
                  <ul id="lista-profesionales" role="listbox" className="ui-combo__list">
                    {profesionalesFiltrados.length === 0 ? (
                      <li className="ui-combo__item" style={{ cursor: 'default', color: 'var(--color-purple-light)' }}>
                        Sin resultados para “{busquedaProf.trim()}”
                      </li>
                    ) : (
                      profesionalesFiltrados.map((p) => (
                        <li key={p.id} role="option" aria-selected={profSel?.id === p.id}>
                          <button
                            type="button"
                            className={`ui-combo__item${profSel?.id === p.id ? ' ui-combo__item--active' : ''}`}
                            onClick={() => seleccionarProfesional(p)}
                          >
                            <div>{p.nombre}</div>
                            {p.telefono ? (
                              <div style={{ fontSize: '0.75rem', color: 'var(--color-purple-light)', fontWeight: 400 }}>
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
          </div>

          <div className="ui-card">
            {!profSel ? (
              <EmptyState
                icon={<Stethoscope size={24} />}
                title="Selecciona un profesional"
                description="Busca y selecciona un profesional para gestionar su agenda"
              />
            ) : (
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 16,
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 600 }}>{profSel.nombre}</div>
                    {profSel.telefono ? (
                      <div style={{ fontSize: '0.8125rem', color: 'var(--color-purple-light)' }}>
                        {profSel.telefono}
                      </div>
                    ) : null}
                  </div>
                  <span className="ui-badge" style={{ background: 'var(--color-entorno)', color: 'var(--color-black)' }}>
                    {citas.length} cita{citas.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {mascotas.length > 0 ? (
                  <div style={{ marginBottom: 20 }}>
                    <div className="agenda-form">
                      <div className="agenda-form__row">
                        <Field id="buscador-mascota" label="Mascota">
                          <div ref={buscadorMascotaRef} className="ui-combo">
                            <Input
                              id="buscador-mascota"
                              type="text"
                              role="combobox"
                              aria-expanded={listaMascotasAbierta}
                              aria-controls="lista-mascotas"
                              aria-autocomplete="list"
                              placeholder="Buscar por nombre, raza o especie…"
                              value={busquedaMascota}
                              disabled={loading}
                              onChange={(e) => {
                                const value = e.target.value;
                                setBusquedaMascota(value);
                                setListaMascotasAbierta(true);
                                if (mascotaId) {
                                  const selected = mascotas.find(
                                    (m) => String(m.id) === String(mascotaId)
                                  );
                                  if (!selected || value !== (selected.nombre || '')) {
                                    setMascotaId('');
                                  }
                                }
                              }}
                              onFocus={() => setListaMascotasAbierta(true)}
                            />

                            {listaMascotasAbierta && (
                              <ul
                                id="lista-mascotas"
                                role="listbox"
                                className="ui-combo__list"
                              >
                                {mascotasFiltradas.length === 0 ? (
                                  <li
                                    className="ui-combo__item"
                                    style={{
                                      cursor: 'default',
                                      color: 'var(--color-purple-light)',
                                    }}
                                  >
                                    No se encontraron mascotas
                                  </li>
                                ) : (
                                  mascotasFiltradas.map((m) => (
                                    <li
                                      key={m.id}
                                      role="option"
                                      aria-selected={String(mascotaId) === String(m.id)}
                                    >
                                      <button
                                        type="button"
                                        className={`ui-combo__item${
                                          String(mascotaId) === String(m.id)
                                            ? ' ui-combo__item--active'
                                            : ''
                                        }`}
                                        onClick={() => seleccionarMascota(m)}
                                      >
                                        <div>{m.nombre}</div>
                                        <div
                                          style={{
                                            fontSize: '0.75rem',
                                            color: 'var(--color-purple-light)',
                                            fontWeight: 400,
                                          }}
                                        >
                                          {[m.especie, m.raza, m.tamano]
                                            .filter(Boolean)
                                            .join(' · ')}
                                        </div>
                                      </button>
                                    </li>
                                  ))
                                )}
                              </ul>
                            )}
                          </div>
                        </Field>
                        <Field label="Fecha">
                          <Input
                            type="date"
                            value={fecha}
                            onChange={(e) => setFecha(e.target.value)}
                            disabled={loading}
                            style={franjaOcupada ? inputErrorStyle : undefined}
                          />
                        </Field>
                      </div>
                      <div className="agenda-form__row agenda-form__row--times">
                        <Field label="Inicio">
                          <Input
                            type="time"
                            value={horaInicio}
                            onChange={(e) => setHoraInicio(e.target.value)}
                            disabled={loading}
                            title="Hora inicio"
                            style={franjaOcupada || horaFinInvalida ? inputErrorStyle : undefined}
                          />
                        </Field>
                        <Field label="Fin">
                          <Input
                            type="time"
                            value={horaFin}
                            onChange={(e) => setHoraFin(e.target.value)}
                            disabled={loading}
                            title="Hora final"
                            style={franjaOcupada || horaFinInvalida ? inputErrorStyle : undefined}
                          />
                        </Field>
                        <div className="agenda-form__action">
                          <Button
                            variant="primary"
                            onClick={handleAgendar}
                            disabled={loading || !puedeAgendar}
                          >
                            {loading ? '…' : franjaOcupada ? 'Cita ocupada' : 'Agendar'}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {horaFinInvalida && (
                      <div className="ui-banner ui-banner--warn" role="alert" style={{ marginTop: 10 }}>
                        La hora final debe ser posterior a la hora de inicio.
                      </div>
                    )}

                    {franjaOcupada && (
                      <div className="ui-banner ui-banner--warn" role="alert" style={{ marginTop: 10 }}>
                        <strong>Cita ocupada.</strong> Este profesional ya tiene una cita el{' '}
                        {formatFecha(citaConflicto.fecha)} de {formatHora(citaConflicto.hora_inicio)} a{' '}
                        {formatHora(citaConflicto.hora_fin)}
                        {citaConflicto.mascota_nombre ? ` con ${citaConflicto.mascota_nombre}` : ''}. Elige otra
                        fecha u otra franja horaria.
                      </div>
                    )}

                    {fecha && citasDelDia.length > 0 && (
                      <div className="ui-banner" style={{ marginTop: 10 }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>Franjas ocupadas este día</div>
                        {citasDelDia.map((c) => (
                          <div key={c.id}>
                            {formatHora(c.hora_inicio)} – {formatHora(c.hora_fin)}
                            {c.mascota_nombre ? ` · ${c.mascota_nombre}` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="ui-banner ui-banner--warn" style={{ marginBottom: 20 }}>
                    No hay mascotas registradas. Crea mascotas primero en la sección Mascotas.
                  </div>
                )}

                {citas.length === 0 ? (
                  <EmptyState
                    icon={<Calendar size={24} />}
                    title="Sin citas agendadas"
                    description="Usa el formulario de arriba para agendar la primera cita de este profesional"
                  />
                ) : (
                  <div className="ui-table-wrap table-scroll">
                    <table className="ui-table">
                      <thead>
                        <tr>
                          {['ID', 'Mascota', 'Raza', 'Fecha', 'Inicio', 'Fin', ''].map((h) => (
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {citas.map((c) => (
                          <tr key={c.id}>
                            <td className="ui-num">{c.id}</td>
                            <td>{c.mascota_nombre}</td>
                            <td>{c.raza}</td>
                            <td style={{ color: 'var(--color-purple-light)' }}>{formatFecha(c.fecha)}</td>
                            <td>{formatHora(c.hora_inicio)}</td>
                            <td>{formatHora(c.hora_fin)}</td>
                            <td>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEliminar(c.id)}
                                disabled={loading}
                              >
                                <Trash2 size={14} />
                                Quitar
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

import { useEffect, useState, useRef } from 'react';
import { listProfesionales } from '../api/profesionalesApi';
import { getAgendaDeProfesional, crearCitaAgenda, eliminarCitaAgenda } from '../api/agendasApi';
import { listMascotas } from '../api/mascotasApi';
import { normalizeListPayload } from '../api/normalize';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import { formatFecha, formatHora, toDateOnly } from '../utils/format';
import EmptyState from '../components/EmptyState';
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
  const { toasts, addToast, removeToast } = useToast();
  const buscadorRef = useRef(null);

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

  async function seleccionarProfesional(p) {
    setProfSel(p);
    setBusquedaProf(p.nombre || '');
    setListaAbierta(false);
    setMascotaId('');
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
    setMascotaId('');
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
      setMascotaId('');
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

  return (
    <div>
      <h1 className="font-display" style={{ fontSize: 22, fontWeight: 600, marginBottom: 20, color: 'var(--color-entorno)' }}>Agendas</h1>
      <p style={{ color: 'var(--color-purple-light)', fontSize: 14, marginBottom: 24 }}>
        Busca y selecciona un profesional para ver su agenda y asignar mascotas con fecha y franja horaria.
      </p>

      {initLoading ? (
        <p style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-purple-light)', fontSize: 14 }}>
          Cargando profesionales y mascotas…
        </p>
      ) : initError ? (
        <EmptyState
          icon="⚠️"
          title="No se pudo cargar la información"
          description={initError}
        />
      ) : profesionales.length === 0 ? (
        <EmptyState
          icon="🩺"
          title="No hay profesionales registrados"
          description="Agrega un profesional desde el módulo de Profesionales"
        />
      ) : (
      <div>

        {/* ── Buscador / lista desplegable de profesionales ── */}
        <div ref={buscadorRef} style={{ position: 'relative', maxWidth: 420, marginBottom: 24 }}>
          <label
            htmlFor="buscador-profesional"
            style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--color-black)' }}
          >
            Profesional
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
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
                  setMascotaId('');
                  setFecha('');
                  setHoraInicio('');
                  setHoraFin('');
                }
              }}
              onFocus={() => setListaAbierta(true)}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 6,
                border: '1px solid var(--color-purple-light)',
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
            {(profSel || busquedaProf) && (
              <button
                type="button"
                onClick={limpiarSeleccion}
                disabled={loading}
                style={{
                  fontSize: 13,
                  color: 'var(--color-entorno)',
                  background: 'none',
                  border: '1px solid var(--color-entorno)',
                  borderRadius: 6,
                  padding: '9px 12px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Limpiar
              </button>
            )}
          </div>

          {listaAbierta && (
            <ul
              id="lista-profesionales"
              role="listbox"
              style={{
                position: 'absolute',
                zIndex: 20,
                left: 0,
                right: 0,
                top: '100%',
                margin: '4px 0 0',
                padding: 0,
                listStyle: 'none',
                maxHeight: 260,
                overflowY: 'auto',
                background: 'var(--color-white)',
                border: '1px solid var(--color-purple-light)',
                borderRadius: 8,
                boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
              }}
            >
              {profesionalesFiltrados.length === 0 ? (
                <li style={{ padding: '12px 14px', fontSize: 13, color: 'var(--color-purple-light)' }}>
                  Sin resultados para “{busquedaProf.trim()}”
                </li>
              ) : (
                profesionalesFiltrados.map((p) => (
                  <li
                    key={p.id}
                    role="option"
                    aria-selected={profSel?.id === p.id}
                    onClick={() => seleccionarProfesional(p)}
                    style={{
                      padding: '10px 14px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #f1f5f9',
                      background: profSel?.id === p.id ? 'var(--bg-selected)' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (profSel?.id !== p.id) e.currentTarget.style.background = 'var(--bg-main)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background =
                        profSel?.id === p.id ? 'var(--bg-selected)' : 'transparent';
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: profSel?.id === p.id ? 500 : 400 }}>
                      {p.nombre}
                    </div>
                    {p.telefono ? (
                      <div style={{ fontSize: 12, color: 'var(--color-purple-light)' }}>{p.telefono}</div>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          )}
        </div>

        {/* ── Panel: agenda del profesional ── */}
        {!profSel ? (
          <div style={{ border: '1px dashed var(--color-purple-light)', borderRadius: 8, padding: 32, textAlign: 'center', color: 'var(--color-purple-light)', fontSize: 14 }}>
            Busca y selecciona un profesional para gestionar su agenda
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 500 }}>{profSel.nombre}</div>
                {profSel.telefono ? (
                  <div style={{ fontSize: 13, color: 'var(--color-purple-light)' }}>{profSel.telefono}</div>
                ) : null}
              </div>
              <span style={{ fontSize: 12, background: 'var(--color-entorno)', color: 'var(--color-black)', padding: '4px 10px', borderRadius: 20, fontWeight: 500 }}>
                {citas.length} cita{citas.length !== 1 ? 's' : ''}
              </span>
            </div>

            {mascotas.length > 0 ? (
              <div style={{ marginBottom: 20, width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
                <div className="fields-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <select
                    value={mascotaId}
                    onChange={(e) => setMascotaId(e.target.value)}
                    disabled={loading}
                    style={{ flex: '1 1 160px', minWidth: 0, width: '100%', maxWidth: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--color-purple-light)', fontSize: 14 }}
                  >
                    <option value="">— Mascota —</option>
                    {mascotas.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre} ({m.raza} · {m.tamano})
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    disabled={loading}
                    style={{
                      width: '100%',
                      maxWidth: '100%',
                      minWidth: 0,
                      boxSizing: 'border-box',
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: `1px solid ${franjaOcupada ? '#dc2626' : 'var(--color-purple-light)'}`,
                      fontSize: 14,
                    }}
                  />
                  <input
                    type="time"
                    value={horaInicio}
                    onChange={(e) => setHoraInicio(e.target.value)}
                    disabled={loading}
                    title="Hora inicio"
                    style={{
                      width: '100%',
                      maxWidth: '100%',
                      minWidth: 0,
                      boxSizing: 'border-box',
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: `1px solid ${franjaOcupada || horaFinInvalida ? '#dc2626' : 'var(--color-purple-light)'}`,
                      fontSize: 14,
                    }}
                  />
                  <input
                    type="time"
                    value={horaFin}
                    onChange={(e) => setHoraFin(e.target.value)}
                    disabled={loading}
                    title="Hora final"
                    style={{
                      width: '100%',
                      maxWidth: '100%',
                      minWidth: 0,
                      boxSizing: 'border-box',
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: `1px solid ${franjaOcupada || horaFinInvalida ? '#dc2626' : 'var(--color-purple-light)'}`,
                      fontSize: 14,
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAgendar}
                    disabled={loading || !puedeAgendar}
                    style={{
                      width: '100%',
                      maxWidth: '100%',
                      boxSizing: 'border-box',
                      padding: '8px 16px',
                      background: franjaOcupada ? '#94a3b8' : 'var(--color-entorno)',
                      color: 'var(--color-white)',
                      border: 'none',
                      borderRadius: 6,
                      cursor: puedeAgendar && !loading ? 'pointer' : 'not-allowed',
                      fontWeight: 500,
                      fontSize: 14,
                      opacity: (!puedeAgendar || loading) ? 0.5 : 1,
                    }}
                  >
                    {loading ? '...' : franjaOcupada ? 'Cita ocupada' : 'Agendar'}
                  </button>
                </div>

                {horaFinInvalida && (
                  <div
                    role="alert"
                    style={{
                      marginTop: 10,
                      padding: '8px 12px',
                      borderRadius: 6,
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      color: '#b91c1c',
                      fontSize: 13,
                    }}
                  >
                    La hora final debe ser posterior a la hora de inicio.
                  </div>
                )}

                {franjaOcupada && (
                  <div
                    role="alert"
                    style={{
                      marginTop: 10,
                      padding: '8px 12px',
                      borderRadius: 6,
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      color: '#b91c1c',
                      fontSize: 13,
                    }}
                  >
                    <strong>Cita ocupada.</strong> Este profesional ya tiene una cita el{' '}
                    {formatFecha(citaConflicto.fecha)} de {formatHora(citaConflicto.hora_inicio)} a{' '}
                    {formatHora(citaConflicto.hora_fin)}
                    {citaConflicto.mascota_nombre
                      ? ` con ${citaConflicto.mascota_nombre}`
                      : ''}
                    . Elige otra fecha u otra franja horaria.
                  </div>
                )}

                {fecha && citasDelDia.length > 0 && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: '8px 12px',
                      borderRadius: 6,
                      background: 'var(--bg-main)',
                      border: '1px solid var(--color-purple-light)',
                      fontSize: 13,
                      color: 'var(--color-purple-light)',
                    }}
                  >
                    <div style={{ fontWeight: 500, marginBottom: 4, color: 'var(--color-black)' }}>
                      Franjas ocupadas este día
                    </div>
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
              <div style={{ fontSize: 13, color: 'var(--color-purple-light)', marginBottom: 20, padding: '8px 12px', background: 'var(--bg-main)', borderRadius: 6 }}>
                No hay mascotas registradas. Crea mascotas primero en la sección Mascotas.
              </div>
            )}
            {citas.length === 0 ? (
              <EmptyState
                icon="📅"
                title="Sin citas agendadas"
                description="Usa el formulario de arriba para agendar la primera cita de este profesional"
              />
            ) : (
              <div className="table-scroll">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-fallback)' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-purple-light)', textAlign: 'left' }}>
                    {['ID', 'Mascota', 'Raza', 'Fecha', 'Inicio', 'Fin', ''].map((h) => (
                      <th key={h} style={{ padding: '8px 12px', fontWeight: 500, fontSize: 13 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {citas.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--color-purple-light)' }}>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>{c.id}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 500 }}>{c.mascota_nombre}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>{c.raza}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13, color: 'var(--color-purple-light)' }}>{formatFecha(c.fecha)}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>{formatHora(c.hora_inicio)}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>{formatHora(c.hora_fin)}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <button
                          type="button"
                          onClick={() => handleEliminar(c.id)}
                          disabled={loading}
                          style={{
                            fontSize: 12,
                            color: 'var(--color-entorno)',
                            background: 'none',
                            border: '1px solid var(--color-entorno)',
                            borderRadius: 4,
                            padding: '3px 10px',
                            cursor: 'pointer',
                          }}>
                          Quitar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        )}
      </div>
      )}
      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

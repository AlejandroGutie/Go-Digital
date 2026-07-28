import { useEffect, useState } from 'react';
import { listProfesionales } from '../api/profesionalesApi';
import { getAgendaDeProfesional, crearCitaAgenda, eliminarCitaAgenda } from '../api/agendasApi';
import { listMascotas } from '../api/mascotasApi';
import { normalizeListPayload } from '../api/normalize';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import { formatFecha, formatHora } from '../utils/format';
import EmptyState from '../components/EmptyState';
import '../index.css';

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
  const { toasts, addToast, removeToast } = useToast();

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

  async function seleccionarProfesional(p) {
    setProfSel(p);
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

  async function handleAgendar() {
    if (!mascotaId || !fecha || !horaInicio || !horaFin) return;
    setLoading(true);
    try {
      await crearCitaAgenda(profSel.id, {
        id_mascota: Number(mascotaId),
        fecha,
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

  const puedeAgendar = mascotaId && fecha && horaInicio && horaFin;

  return (
    <div>
      <h1 className="font-display" style={{ fontSize: 22, fontWeight: 600, marginBottom: 20, color: 'var(--color-entorno)' }}>Agendas</h1>
      <p style={{ color: 'var(--color-purple-light)', fontSize: 14, marginBottom: 24 }}>
        Selecciona un profesional para ver su agenda y asignar mascotas con fecha y franja horaria.
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
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, alignItems: 'start' }}>

        <div style={{ border: '1px solid var(--color-purple-light)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: 'var(--bg-main)', borderBottom: '1px solid var(--color-purple-light)', fontSize: 13, fontWeight: 500 }}>
            Profesionales ({profesionales.length})
          </div>
          {profesionales.length === 0 ? (
            <EmptyState
              icon="🩺"
              title="No hay profesionales registrados"
              description="Agrega un profesional desde el módulo de Profesionales"
            />
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {profesionales.map((p) => (
                <li
                  key={p.id}
                  onClick={() => seleccionarProfesional(p)}
                  style={{
                    padding: '10px 14px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--color-purple-light)',
                    background: profSel?.id === p.id ? 'var(--bg-selected)' : 'transparent',
                    borderLeft: profSel?.id === p.id ? '3px solid var(--color-magenta)' : '3px solid transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: profSel?.id === p.id ? 500 : 400 }}>{p.nombre}</div>
                  {p.telefono ? (
                    <div style={{ fontSize: 12, color: 'var(--color-purple-light)' }}>{p.telefono}</div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        {!profSel ? (
          <div style={{ border: '1px dashed var(--color-purple-light)', borderRadius: 8, padding: 32, textAlign: 'center', color: 'var(--color-purple-light)', fontSize: 14 }}>
            Selecciona un profesional para gestionar su agenda
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20, alignItems: 'center' }}>
                <select
                  value={mascotaId}
                  onChange={(e) => setMascotaId(e.target.value)}
                  disabled={loading}
                  style={{ flex: '1 1 160px', minWidth: 140, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--color-purple-light)', fontSize: 14 }}
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
                  style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--color-purple-light)', fontSize: 14 }}
                />
                <input
                  type="time"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                  disabled={loading}
                  title="Hora inicio"
                  style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--color-purple-light)', fontSize: 14 }}
                />
                <input
                  type="time"
                  value={horaFin}
                  onChange={(e) => setHoraFin(e.target.value)}
                  disabled={loading}
                  title="Hora final"
                  style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--color-purple-light)', fontSize: 14 }}
                />
                <button
                  type="button"
                  onClick={handleAgendar}
                  disabled={loading || !puedeAgendar}
                  style={{
                    padding: '8px 16px',
                    background: 'var(--color-entorno)',
                    color: 'var(--color-white)',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontWeight: 500,
                    fontSize: 14,
                    opacity: (!puedeAgendar || loading) ? 0.5 : 1,
                  }}
                >
                  {loading ? '...' : 'Agendar'}
                </button>
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
            )}
          </div>
        )}
      </div>
      )}
      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

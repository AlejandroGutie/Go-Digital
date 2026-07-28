import { useEffect, useState } from 'react';
import { listCuidadores, getMascotasDeCuidador, asignarMascota, desasignarMascota } from '../api/cuidadoresApi';
import { listMascotas } from '../api/mascotasApi';
import { normalizeListPayload } from '../api/normalize';
import { useToast }  from '../hooks/useToast';
import { Toast }     from '../components/Toast';
import { formatFecha } from '../utils/format';
import EmptyState from '../components/EmptyState';
import '../index.css';

export default function AsignacionPage() {
  const [cuidadores,       setCuidadores]       = useState([]);
  const [mascotasDisp,     setMascotasDisp]     = useState([]);
  const [cuidadorSel,      setCuidadorSel]      = useState(null);
  const [mascotasSel,      setMascotasSel]      = useState([]);
  const [mascotaIdAsignar, setMascotaIdAsignar] = useState('');
  const [loading,          setLoading]          = useState(false);
  const [initLoading,      setInitLoading]      = useState(true);
  const [initError,        setInitError]        = useState(null);
  const { toasts, addToast, removeToast } = useToast();

  // Cargar cuidadores y mascotas disponibles al montar
  useEffect(() => {
    async function init() {
      setInitLoading(true);
      setInitError(null);
      try {
        const [resCuidadores, resMascotas] = await Promise.all([
          listCuidadores(1, 100),
          listMascotas(1, 100),
        ]);
        setCuidadores(normalizeListPayload(resCuidadores));
        setMascotasDisp(normalizeListPayload(resMascotas));
      } catch (e) {
        const msg =
          e?.message ||
          'No se pudieron cargar cuidadores o mascotas (sesión, red o permisos de base de datos).';
        setInitError(msg);
        addToast(msg, 'error');
      } finally {
        setInitLoading(false);
      }
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Seleccionar un cuidador y cargar sus mascotas asignadas
  async function seleccionarCuidador(c) {
    setCuidadorSel(c);
    setMascotaIdAsignar('');
    try {
      const res = await getMascotasDeCuidador(c.id);
      setMascotasSel(normalizeListPayload(res));
    } catch (e) {
      addToast(e?.message || 'Error al cargar mascotas del cuidador', 'error');
    }
  }

  // Mascotas que aún no están asignadas al cuidador seleccionado
  const mascotasNoAsignadas = mascotasDisp.filter(
    (m) => !mascotasSel.some((ms) => ms.id === m.id)
  );

  // Asignar
  async function handleAsignar() {
    if (!mascotaIdAsignar) return;
    setLoading(true);
    try {
      await asignarMascota(cuidadorSel.id, Number(mascotaIdAsignar));
      addToast('Mascota asignada correctamente', 'success');
      setMascotaIdAsignar('');
      const res = await getMascotasDeCuidador(cuidadorSel.id);
      setMascotasSel(normalizeListPayload(res));
    } catch (e) {
      addToast(e?.message || 'Error al asignar mascota', 'error');
    } finally {
      setLoading(false);
    }
  }

  // Desasignar
  async function handleDesasignar(idMascota) {
    setLoading(true);
    try {
      await desasignarMascota(cuidadorSel.id, idMascota);
      addToast('Mascota desasignada correctamente', 'success');
      setMascotasSel(prev => prev.filter(m => m.id !== idMascota));
    } catch (e) {
      addToast(e?.message || 'Error al desasignar mascota', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="font-display" style={{ fontSize: 22, fontWeight: 600, marginBottom: 20, color: 'var(--color-entorno)' }}>Asignación de mascotas</h1>
      <p style={{ color: 'var(--color-purple-light)', fontSize: 14, marginBottom: 24 }}>
        Selecciona un cuidador para ver y gestionar sus mascotas asignadas.
      </p>

      {initLoading ? (
        <p style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-purple-light)', fontSize: 14 }}>
          Cargando cuidadores y mascotas…
        </p>
      ) : initError ? (
        <EmptyState
          icon="⚠️"
          title="No se pudo cargar la información"
          description={initError}
        />
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, alignItems: 'start' }}>

        {/* ── Panel izquierdo: lista de cuidadores ── */}
        <div style={{ border: '1px solid var(--color-purple-light)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: 'var(--bg-main)', borderBottom: '1px solid var(--color-purple-light)', fontSize: 13, fontWeight: 500 }}>
            Cuidadores ({cuidadores.length})
          </div>
          {cuidadores.length === 0 ? (
            <EmptyState
              icon="👤"
              title="No hay cuidadores registrados"
              description="Agrega un cuidador desde el módulo de Cuidadores"
            />
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {cuidadores.map(c => (
                <li key={c.id}
                  onClick={() => seleccionarCuidador(c)}
                  style={{
                    padding: '10px 14px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--color-purple-light)',
                    background: cuidadorSel?.id === c.id ? 'var(--bg-selected)' : 'transparent',
                    borderLeft: cuidadorSel?.id === c.id ? '3px solid var(--color-magenta)' : '3px solid transparent',
                    transition: 'background 0.15s',
                  }}>
                  <div style={{ fontSize: 14, fontWeight: cuidadorSel?.id === c.id ? 500 : 400 }}>{c.nombre}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-purple-light)' }}>{c.telefono}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Panel derecho: mascotas del cuidador ── */}
        {!cuidadorSel ? (
          <div style={{ border: '1px dashed var(--color-purple-light)', borderRadius: 8, padding: 32, textAlign: 'center', color: 'var(--color-purple-light)', fontSize: 14 }}>
            Selecciona un cuidador para gestionar sus mascotas
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 500 }}>{cuidadorSel.nombre}</div>
                <div style={{ fontSize: 13, color: 'var(--color-purple-light)' }}>{cuidadorSel.telefono}</div>
              </div>
              <span style={{ fontSize: 12, background: 'var(--color-entorno)', color: 'var(--color-black)', padding: '4px 10px', borderRadius: 20, fontWeight: 500 }}>
                {mascotasSel.length} mascota{mascotasSel.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Asignar nueva mascota */}
            {mascotasNoAsignadas.length > 0 ? (
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                <select
                  value={mascotaIdAsignar}
                  onChange={e => setMascotaIdAsignar(e.target.value)}
                  disabled={loading}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--color-purple-light)', fontSize: 14 }}>
                  <option value="">— Seleccionar mascota para asignar —</option>
                  {mascotasNoAsignadas.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.nombre} ({m.raza} · {m.tamano})
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAsignar}
                  disabled={loading || !mascotaIdAsignar}
                  style={{ padding: '8px 16px', background: 'var(--color-entorno)', color: 'var(--color-white)', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500, fontSize: 14, opacity: (!mascotaIdAsignar || loading) ? 0.5 : 1 }}>
                  {loading ? '...' : 'Asignar'}
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--color-purple-light)', marginBottom: 20, padding: '8px 12px', background: 'var(--bg-main)', borderRadius: 6 }}>
                Todas las mascotas registradas ya están asignadas a este cuidador.
              </div>
            )}

            {/* Lista de mascotas asignadas */}
            {mascotasSel.length === 0 ? (
              <EmptyState
                icon="🐶🐱"
                title="Sin mascotas asignadas"
                description="Usa el selector de arriba para asignar una mascota a este cuidador"
              />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-fallback)' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-purple-light)', textAlign: 'left' }}>
                    {['ID', 'Nombre', 'Raza', 'Tamaño', 'Desde', 'Activo', ''].map(h => (
                      <th key={h} style={{ padding: '8px 12px', fontWeight: 500, fontSize: 13 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mascotasSel.map(m => (
                    <tr key={m.id} style={{ borderBottom: '1px solid var(--color-purple-light)'}}>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>{m.id}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 500 }}>{m.nombre}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>{m.raza}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13 }}>{m.tamano}</td>
                      <td style={{ padding: '8px 12px', fontSize: 13, color: 'var(--color-purple-light)' }}>{formatFecha(m.fecha_inicio)}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20,
                          background: m.activo ? 'var(--color-entorno)' : 'var(--color-purple-light)',
                          color:      m.activo ? 'var(--color-white)' : 'var(--color-white)',
                        }}>
                          {m.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <button
                          onClick={() => handleDesasignar(m.id)}
                          disabled={loading}
                          style={{ fontSize: 12, color: 'var(--color-entorno)', background: 'none', border: '1px solid var(--color-entorno)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer' }}>
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
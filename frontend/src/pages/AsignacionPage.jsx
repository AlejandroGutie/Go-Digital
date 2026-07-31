import { useEffect, useState, useRef } from 'react';
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
  const [busquedaCuidador, setBusquedaCuidador] = useState('');
  const [listaAbierta,     setListaAbierta]     = useState(false);
  const { toasts, addToast, removeToast } = useToast();
  const buscadorRef = useRef(null);

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

  // Cerrar lista al hacer clic fuera del buscador
  useEffect(() => {
    function handleClickOutside(e) {
      if (buscadorRef.current && !buscadorRef.current.contains(e.target)) {
        setListaAbierta(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const cuidadoresFiltrados = cuidadores.filter((c) => {
    const q = busquedaCuidador.trim().toLowerCase();
    if (!q) return true;
    return (
      (c.nombre || '').toLowerCase().includes(q) ||
      (c.telefono || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    );
  });

  // Seleccionar un cuidador y cargar sus mascotas asignadas
  async function seleccionarCuidador(c) {
    setCuidadorSel(c);
    setBusquedaCuidador(c.nombre || '');
    setListaAbierta(false);
    setMascotaIdAsignar('');
    try {
      const res = await getMascotasDeCuidador(c.id);
      setMascotasSel(normalizeListPayload(res));
    } catch (e) {
      addToast(e?.message || 'Error al cargar mascotas del cuidador', 'error');
    }
  }

  function limpiarSeleccion() {
    setCuidadorSel(null);
    setBusquedaCuidador('');
    setMascotasSel([]);
    setMascotaIdAsignar('');
    setListaAbierta(false);
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
        Busca y selecciona un cuidador para ver y gestionar sus mascotas asignadas.
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
      ) : cuidadores.length === 0 ? (
        <EmptyState
          icon="👤"
          title="No hay cuidadores registrados"
          description="Agrega un cuidador desde el módulo de Cuidadores"
        />
      ) : (
      <div>

        {/* ── Buscador / lista desplegable de cuidadores ── */}
        <div ref={buscadorRef} style={{ position: 'relative', maxWidth: 420, marginBottom: 24 }}>
          <label
            htmlFor="buscador-cuidador"
            style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: 'var(--color-black)' }}
          >
            Cuidador
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              id="buscador-cuidador"
              type="text"
              role="combobox"
              aria-expanded={listaAbierta}
              aria-controls="lista-cuidadores"
              aria-autocomplete="list"
              placeholder="Buscar por nombre, teléfono o email…"
              value={busquedaCuidador}
              disabled={loading}
              onChange={(e) => {
                setBusquedaCuidador(e.target.value);
                setListaAbierta(true);
                if (cuidadorSel && e.target.value !== cuidadorSel.nombre) {
                  setCuidadorSel(null);
                  setMascotasSel([]);
                  setMascotaIdAsignar('');
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
            {(cuidadorSel || busquedaCuidador) && (
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
              id="lista-cuidadores"
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
              {cuidadoresFiltrados.length === 0 ? (
                <li style={{ padding: '12px 14px', fontSize: 13, color: 'var(--color-purple-light)' }}>
                  Sin resultados para “{busquedaCuidador.trim()}”
                </li>
              ) : (
                cuidadoresFiltrados.map((c) => (
                  <li
                    key={c.id}
                    role="option"
                    aria-selected={cuidadorSel?.id === c.id}
                    onClick={() => seleccionarCuidador(c)}
                    style={{
                      padding: '10px 14px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #f1f5f9',
                      background: cuidadorSel?.id === c.id ? 'var(--bg-selected)' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (cuidadorSel?.id !== c.id) e.currentTarget.style.background = 'var(--bg-main)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background =
                        cuidadorSel?.id === c.id ? 'var(--bg-selected)' : 'transparent';
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: cuidadorSel?.id === c.id ? 500 : 400 }}>
                      {c.nombre}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-purple-light)' }}>
                      {[c.telefono, c.email].filter(Boolean).join(' · ') || 'Sin contacto'}
                    </div>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>

        {/* ── Panel: mascotas del cuidador ── */}
        {!cuidadorSel ? (
          <div style={{ border: '1px dashed var(--color-purple-light)', borderRadius: 8, padding: 32, textAlign: 'center', color: 'var(--color-purple-light)', fontSize: 14 }}>
            Busca y selecciona un cuidador para gestionar sus mascotas
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

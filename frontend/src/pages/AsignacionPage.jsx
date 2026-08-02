import { useEffect, useState, useRef } from 'react';
import { AlertTriangle, PawPrint, User, UserX } from 'lucide-react';
import { listCuidadores, getMascotasDeCuidador, asignarMascota, desasignarMascota } from '../api/cuidadoresApi';
import { listMascotas } from '../api/mascotasApi';
import { normalizeListPayload } from '../api/normalize';
import { useToast } from '../hooks/useToast';
import { Toast } from '../components/Toast';
import { formatFecha } from '../utils/format';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import Field, { Input, Select } from '../components/ui/Field';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';
import '../index.css';

export default function AsignacionPage() {
  const [cuidadores, setCuidadores] = useState([]);
  const [mascotasDisp, setMascotasDisp] = useState([]);
  const [cuidadorSel, setCuidadorSel] = useState(null);
  const [mascotasSel, setMascotasSel] = useState([]);
  const [mascotaIdAsignar, setMascotaIdAsignar] = useState('');
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError] = useState(null);
  const [busquedaCuidador, setBusquedaCuidador] = useState('');
  const [listaAbierta, setListaAbierta] = useState(false);
  const { toasts, addToast, removeToast } = useToast();
  const buscadorRef = useRef(null);

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

  const mascotasNoAsignadas = mascotasDisp.filter(
    (m) => !mascotasSel.some((ms) => ms.id === m.id)
  );

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

  async function handleDesasignar(idMascota) {
    setLoading(true);
    try {
      await desasignarMascota(cuidadorSel.id, idMascota);
      addToast('Mascota desasignada correctamente', 'success');
      setMascotasSel((prev) => prev.filter((m) => m.id !== idMascota));
    } catch (e) {
      addToast(e?.message || 'Error al desasignar mascota', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ui-page">
      <PageHeader
        title="Asignación de mascotas"
        subtitle="Busca y selecciona un cuidador para ver y gestionar sus mascotas asignadas."
      />

      {initLoading ? (
        <Skeleton rows={5} />
      ) : initError ? (
        <EmptyState
          icon={<AlertTriangle size={24} />}
          title="No se pudo cargar la información"
          description={initError}
        />
      ) : cuidadores.length === 0 ? (
        <EmptyState
          icon={<User size={24} />}
          title="No hay cuidadores registrados"
          description="Agrega un cuidador desde el módulo de Cuidadores"
        />
      ) : (
        <div className="ui-split">
          <div className="ui-card">
            <Field id="buscador-cuidador" label="Cuidador">
              <div ref={buscadorRef} className="ui-combo">
                <div className="ui-btn-row">
                  <Input
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
                  />
                  {(cuidadorSel || busquedaCuidador) && (
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
                  <ul id="lista-cuidadores" role="listbox" className="ui-combo__list">
                    {cuidadoresFiltrados.length === 0 ? (
                      <li className="ui-combo__item" style={{ cursor: 'default', color: 'var(--color-purple-light)' }}>
                        Sin resultados para “{busquedaCuidador.trim()}”
                      </li>
                    ) : (
                      cuidadoresFiltrados.map((c) => (
                        <li key={c.id} role="option" aria-selected={cuidadorSel?.id === c.id}>
                          <button
                            type="button"
                            className={`ui-combo__item${cuidadorSel?.id === c.id ? ' ui-combo__item--active' : ''}`}
                            onClick={() => seleccionarCuidador(c)}
                          >
                            <div>{c.nombre}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-purple-light)', fontWeight: 400 }}>
                              {[c.telefono, c.email].filter(Boolean).join(' · ') || 'Sin contacto'}
                            </div>
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
            {!cuidadorSel ? (
              <EmptyState
                icon={<User size={24} />}
                title="Selecciona un cuidador"
                description="Busca y selecciona un cuidador para gestionar sus mascotas"
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
                    <div style={{ fontSize: '1rem', fontWeight: 600 }}>{cuidadorSel.nombre}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-purple-light)' }}>
                      {cuidadorSel.telefono}
                    </div>
                  </div>
                  <span className="ui-badge" style={{ background: 'var(--color-entorno)', color: 'var(--color-black)' }}>
                    {mascotasSel.length} mascota{mascotasSel.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {mascotasNoAsignadas.length > 0 ? (
                  <div className="fields-row" style={{ marginBottom: 20 }}>
                    <Field label="Asignar mascota">
                      <Select
                        value={mascotaIdAsignar}
                        onChange={(e) => setMascotaIdAsignar(e.target.value)}
                        disabled={loading}
                      >
                        <option value="">— Seleccionar mascota para asignar —</option>
                        {mascotasNoAsignadas.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nombre} ({m.raza} · {m.tamano})
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Button
                      variant="primary"
                      onClick={handleAsignar}
                      disabled={loading || !mascotaIdAsignar}
                    >
                      {loading ? '…' : 'Asignar'}
                    </Button>
                  </div>
                ) : (
                  <div className="ui-banner ui-banner--warn" style={{ marginBottom: 20 }}>
                    Todas las mascotas registradas ya están asignadas a este cuidador.
                  </div>
                )}

                {mascotasSel.length === 0 ? (
                  <EmptyState
                    icon={<PawPrint size={24} />}
                    title="Sin mascotas asignadas"
                    description="Usa el selector de arriba para asignar una mascota a este cuidador"
                  />
                ) : (
                  <div className="ui-table-wrap table-scroll">
                    <table className="ui-table">
                      <thead>
                        <tr>
                          {['ID', 'Nombre', 'Raza', 'Tamaño', 'Desde', 'Activo', ''].map((h) => (
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {mascotasSel.map((m) => (
                          <tr key={m.id}>
                            <td className="ui-num">{m.id}</td>
                            <td>{m.nombre}</td>
                            <td>{m.raza}</td>
                            <td>{m.tamano}</td>
                            <td style={{ color: 'var(--color-purple-light)' }}>{formatFecha(m.fecha_inicio)}</td>
                            <td>
                              <span
                                className="ui-badge"
                                style={{
                                  background: m.activo ? 'var(--color-entorno)' : 'var(--color-purple-light)',
                                  color: 'var(--color-white)',
                                }}
                              >
                                {m.activo ? 'Activo' : 'Inactivo'}
                              </span>
                            </td>
                            <td>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDesasignar(m.id)}
                                disabled={loading}
                              >
                                <UserX size={14} />
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

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  actualizarCitaAgenda,
  motivoNoReprogramarAgenda,
} from '../../api/agendasApi';
import { getCuidadoresDeMascota, getMascotaById } from '../../api/mascotasApi';
import { getMascotasDeCuidador, listCuidadores } from '../../api/cuidadoresApi';
import { normalizeListPayload } from '../../api/normalize';
import { useMutationLock } from '../../hooks/useMutationLock';
import { formatFecha, formatHora, toDateOnly } from '../../utils/format';
import { confirmarAgendaPorWhatsApp } from '../../utils/confirmarAgendaWhatsApp';
import {
  citasDelDiaParaSlots,
  encontrarCitaConflicto,
  filtrarSlotsFinLibres,
  slotOcupadoPorCitas,
} from '../../utils/agendaConflictos';
import {
  generarBloquesHorarios,
  horaAMinutos,
  jornadaDelProfesional,
  toTimeHHMM,
} from '../../utils/horarios';
import Field, { DateInput, Input, Textarea } from '../ui/Field';
import Button from '../ui/Button';
import Sheet from '../ui/Sheet';
import HorarioSlotSelect from '../ui/HorarioSlotSelect';
import TarifaMultiSelect, {
  formatTarifasLabel,
  sumTarifasValor,
} from '../ui/TarifaMultiSelect';
import {
  AGENDA_INPUT_ERROR_STYLE,
  AGENDA_LIST_LIMIT,
  emptyEditForm,
  filtrarMascotasLocal,
  idsTarifaDesdeCita,
  resolverTarifaCita,
  tarifasParaEditarDesde,
} from '../../pages/agendas/agendaPageHelpers';

/**
 * Bottom sheet de reprogramación para AgendasPage.
 * Incluye selección de cuidador/mascota (a diferencia de ReprogramarCitaSheet).
 */
export default function AgendasReprogramarSheet({
  open,
  onClose,
  cita = null,
  profesional = null,
  citas = [],
  tarifas = [],
  addToast,
  onSuccess,
}) {
  const [editForm, setEditForm] = useState(() => emptyEditForm());
  const [editCuidadorSel, setEditCuidadorSel] = useState(null);
  const [editBusquedaCuidador, setEditBusquedaCuidador] = useState('');
  const [editListaCuidadoresAbierta, setEditListaCuidadoresAbierta] = useState(false);
  const [editBusquedaMascota, setEditBusquedaMascota] = useState('');
  const [editListaMascotasAbierta, setEditListaMascotasAbierta] = useState(false);
  const [editMascotas, setEditMascotas] = useState([]);
  const [cuidadores, setCuidadores] = useState([]);
  const [saving, setSaving] = useState(false);
  const { tryLock, unlock } = useMutationLock();

  const editBuscadorCuidadorRef = useRef(null);
  const editBuscadorMascotaRef = useRef(null);
  const cuidadorSearchReq = useRef(0);
  const mascotasCuidadorReq = useRef(0);
  const whatsappCancelRef = useRef(null);
  const loadGenRef = useRef(0);

  async function cargarCuidadores(search = '') {
    const reqId = ++cuidadorSearchReq.current;
    const res = await listCuidadores(1, AGENDA_LIST_LIMIT, search);
    if (reqId !== cuidadorSearchReq.current) return;
    setCuidadores(normalizeListPayload(res));
  }

  async function cargarMascotasDeCuidador(idCuidador) {
    const reqId = ++mascotasCuidadorReq.current;
    const res = await getMascotasDeCuidador(idCuidador);
    if (reqId !== mascotasCuidadorReq.current) return [];
    const rows = normalizeListPayload(res).filter(
      (m) => m?.id != null && m.activo !== false
    );
    setEditMascotas(rows);
    return rows;
  }

  function resetLocalState() {
    setEditForm(emptyEditForm());
    setEditCuidadorSel(null);
    setEditBusquedaCuidador('');
    setEditListaCuidadoresAbierta(false);
    setEditBusquedaMascota('');
    setEditListaMascotasAbierta(false);
    setEditMascotas([]);
    setCuidadores([]);
    setSaving(false);
  }

  useEffect(() => {
    if (!open || !cita?.id) {
      resetLocalState();
      return undefined;
    }

    const motivo = motivoNoReprogramarAgenda(cita);
    if (motivo) {
      addToast?.(motivo, 'error');
      onClose?.();
      return undefined;
    }

    const gen = ++loadGenRef.current;
    setEditForm({
      id_mascota: String(cita.id_mascota || ''),
      id_tarifas: idsTarifaDesdeCita(cita),
      fecha: toDateOnly(cita.fecha) || '',
      hora_inicio: toTimeHHMM(cita.hora_inicio),
      hora_fin: toTimeHHMM(cita.hora_fin),
      observacion_ingreso: cita.observacion_ingreso || '',
    });
    setEditBusquedaMascota(cita.mascota_nombre || '');
    setEditListaMascotasAbierta(false);
    setEditListaCuidadoresAbierta(false);
    setSaving(false);

    (async () => {
      try {
        const [resCuidadores, resDetalle] = await Promise.all([
          cita.id_mascota
            ? getCuidadoresDeMascota(cita.id_mascota)
            : Promise.resolve(null),
          cita.id_mascota
            ? getMascotaById(cita.id_mascota).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (gen !== loadGenRef.current) return;
        await cargarCuidadores('').catch(() => {});
        if (gen !== loadGenRef.current) return;

        const cuidadoresMascota = normalizeListPayload(resCuidadores);
        const cuidadorPref =
          cuidadoresMascota.find((x) => x.activo !== false && x.id) ||
          cuidadoresMascota.find((x) => x.id) ||
          null;
        const mascotaDetalle =
          resDetalle?.data?.[0] || resDetalle?.data || null;

        if (cuidadorPref?.id) {
          setEditCuidadorSel(cuidadorPref);
          setEditBusquedaCuidador(cuidadorPref.nombre || '');
          const rows = await cargarMascotasDeCuidador(cuidadorPref.id);
          if (gen !== loadGenRef.current) return;
          const sigueVinculada = rows.some(
            (m) => String(m.id) === String(cita.id_mascota)
          );
          if (!sigueVinculada && cita.id_mascota) {
            setEditMascotas((prev) => [
              {
                id: cita.id_mascota,
                nombre:
                  mascotaDetalle?.nombre || cita.mascota_nombre || 'Mascota',
                especie: mascotaDetalle?.especie || cita.especie || null,
                raza: mascotaDetalle?.raza || cita.raza || null,
                tamano: mascotaDetalle?.tamano || cita.tamano || null,
                activo: true,
              },
              ...prev.filter((m) => String(m.id) !== String(cita.id_mascota)),
            ]);
          }
        } else {
          setEditCuidadorSel(null);
          setEditBusquedaCuidador('');
          setEditMascotas(
            cita.id_mascota
              ? [
                  {
                    id: cita.id_mascota,
                    nombre:
                      mascotaDetalle?.nombre || cita.mascota_nombre || 'Mascota',
                    especie: mascotaDetalle?.especie || cita.especie || null,
                    raza: mascotaDetalle?.raza || cita.raza || null,
                    tamano: mascotaDetalle?.tamano || cita.tamano || null,
                    activo: true,
                  },
                ]
              : []
          );
        }
      } catch (e) {
        if (gen !== loadGenRef.current) return;
        addToast?.(e?.message || 'No se pudo precargar cuidador/mascotas', 'error');
        setEditCuidadorSel(null);
        setEditBusquedaCuidador('');
        setEditMascotas(
          cita.id_mascota
            ? [
                {
                  id: cita.id_mascota,
                  nombre: cita.mascota_nombre || 'Mascota',
                  especie: cita.especie || null,
                  raza: cita.raza || null,
                  tamano: cita.tamano || null,
                  activo: true,
                },
              ]
            : []
        );
      }
    })();

    return () => {
      loadGenRef.current += 1;
    };
    // Solo reabrir/cargar cuando cambia la cita o se abre el sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cita?.id]);

  useEffect(() => {
    if (!open) return undefined;
    if (editCuidadorSel) return undefined;
    const q = editBusquedaCuidador.trim();
    const timer = setTimeout(() => {
      cargarCuidadores(q).catch((e) => {
        addToast?.(e?.message || 'No se pudo actualizar el listado de cuidadores', 'error');
      });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editBusquedaCuidador, editCuidadorSel, open]);

  useEffect(() => {
    if (!open) return undefined;
    function handleClickOutside(e) {
      if (
        editBuscadorCuidadorRef.current &&
        !editBuscadorCuidadorRef.current.contains(e.target)
      ) {
        setEditListaCuidadoresAbierta(false);
      }
      if (
        editBuscadorMascotaRef.current &&
        !editBuscadorMascotaRef.current.contains(e.target)
      ) {
        setEditListaMascotasAbierta(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    return () => {
      whatsappCancelRef.current?.cancel?.();
    };
  }, []);

  const cuidadoresFiltrados = cuidadores;
  const editMascotasFiltradas = useMemo(
    () =>
      filtrarMascotasLocal(
        editMascotas,
        editForm.id_mascota ? '' : editBusquedaMascota
      ),
    [editMascotas, editBusquedaMascota, editForm.id_mascota]
  );

  async function seleccionarCuidadorEdit(c) {
    setEditCuidadorSel(c);
    setEditBusquedaCuidador(c.nombre || '');
    setEditListaCuidadoresAbierta(false);
    setEditForm((prev) => ({ ...prev, id_mascota: '' }));
    setEditBusquedaMascota('');
    setEditListaMascotasAbierta(false);
    try {
      await cargarMascotasDeCuidador(c.id);
    } catch (e) {
      setEditMascotas([]);
      addToast?.(e?.message || 'No se pudieron cargar las mascotas del cuidador', 'error');
    }
  }

  function seleccionarMascotaEdit(m) {
    setEditForm((prev) => ({ ...prev, id_mascota: String(m.id) }));
    setEditBusquedaMascota(m.nombre || '');
    setEditListaMascotasAbierta(false);
  }

  async function abrirListaCuidadoresEdit() {
    setEditListaCuidadoresAbierta(true);
    if (editCuidadorSel) return;
    try {
      await cargarCuidadores(editBusquedaCuidador.trim());
    } catch (e) {
      addToast?.(e?.message || 'No se pudo actualizar el listado de cuidadores', 'error');
    }
  }

  async function abrirListaMascotasEdit() {
    if (!editCuidadorSel && editMascotas.length === 0) {
      setEditListaMascotasAbierta(false);
      return;
    }
    setEditListaMascotasAbierta(true);
  }

  const jornadaProf = useMemo(
    () => jornadaDelProfesional(profesional),
    [profesional]
  );

  const editHoraFinInvalida =
    !!editForm.hora_inicio &&
    !!editForm.hora_fin &&
    horaAMinutos(editForm.hora_fin) <= horaAMinutos(editForm.hora_inicio);

  const editCitaConflicto =
    cita &&
    !editHoraFinInvalida &&
    editForm.fecha &&
    editForm.hora_inicio &&
    editForm.hora_fin
      ? encontrarCitaConflicto(
          citas,
          editForm.fecha,
          editForm.hora_inicio,
          editForm.hora_fin,
          cita.id
        )
      : null;

  const editFranjaOcupada = !!editCitaConflicto;

  const editCitasDelDiaSlots = useMemo(() => {
    if (!editForm.fecha) return [];
    return citasDelDiaParaSlots(citas, editForm.fecha, cita?.id);
  }, [citas, editForm.fecha, cita?.id]);

  const slotsInicioEdit = useMemo(() => {
    const base = generarBloquesHorarios(jornadaProf.inicio, jornadaProf.fin, 30, {
      includeEnd: false,
    });
    if (!editForm.fecha) return base;
    return base.filter((slot) => !slotOcupadoPorCitas(slot, editCitasDelDiaSlots));
  }, [jornadaProf, editForm.fecha, editCitasDelDiaSlots]);

  const slotsFinEdit = useMemo(() => {
    const inicio = editForm.hora_inicio;
    if (!inicio) {
      const base = generarBloquesHorarios(jornadaProf.inicio, jornadaProf.fin, 30, {
        includeEnd: true,
      }).filter((s) => s > jornadaProf.inicio);
      return filtrarSlotsFinLibres(base, {
        citas,
        fecha: editForm.fecha,
        excludeId: cita?.id,
      });
    }
    const despues = generarBloquesHorarios(inicio, jornadaProf.fin, 30, {
      includeEnd: true,
    }).filter((s) => s > inicio);
    return filtrarSlotsFinLibres(despues, {
      citas,
      fecha: editForm.fecha,
      horaInicio: inicio,
      excludeId: cita?.id,
    });
  }, [jornadaProf, editForm.hora_inicio, editForm.fecha, citas, cita?.id]);

  const editCitasDelDia = editForm.fecha
    ? citas
        .filter(
          (c) =>
            String(c.id) !== String(cita?.id) &&
            toDateOnly(c.fecha) === toDateOnly(editForm.fecha)
        )
        .sort(
          (a, b) =>
            (horaAMinutos(a.hora_inicio) ?? 0) - (horaAMinutos(b.hora_inicio) ?? 0)
        )
    : [];

  const tarifasParaEditar = tarifasParaEditarDesde(tarifas, editForm.id_tarifas);

  const puedeReprogramar =
    !!editForm.id_mascota &&
    (editForm.id_tarifas?.length || 0) > 0 &&
    !!editForm.fecha &&
    !!editForm.hora_inicio &&
    !!editForm.hora_fin &&
    !editHoraFinInvalida &&
    !editFranjaOcupada;

  function onChangeHoraInicioEdit(value) {
    const inicio = toTimeHHMM(value);
    setEditForm((prev) => ({
      ...prev,
      hora_inicio: inicio,
      hora_fin: '',
    }));
  }

  async function handleReprogramar() {
    if (!cita || !profesional) return;
    const motivo = motivoNoReprogramarAgenda(cita);
    if (motivo) {
      addToast?.(motivo, 'error');
      return;
    }
    const {
      id_mascota,
      id_tarifas,
      fecha: fechaEdit,
      hora_inicio,
      hora_fin,
      observacion_ingreso,
    } = editForm;
    if (!id_mascota || !id_tarifas?.length || !fechaEdit || !hora_inicio || !hora_fin) {
      addToast?.(
        'Mascota, tarifa(s), fecha, hora de inicio y hora final son requeridas',
        'error'
      );
      return;
    }
    const fechaGuardar = toDateOnly(fechaEdit);
    if (!fechaGuardar) {
      addToast?.('Fecha inválida', 'error');
      return;
    }
    if (horaAMinutos(hora_fin) <= horaAMinutos(hora_inicio)) {
      addToast?.('La hora final debe ser posterior a la hora de inicio', 'error');
      return;
    }
    const conflicto = encontrarCitaConflicto(
      citas,
      fechaGuardar,
      hora_inicio,
      hora_fin,
      cita.id
    );
    if (conflicto) {
      addToast?.(
        `Cita ocupada: ${formatFecha(conflicto.fecha)} · ${formatHora(conflicto.hora_inicio)} – ${formatHora(conflicto.hora_fin)} (${conflicto.mascota_nombre || 'otra mascota'})`,
        'error'
      );
      return;
    }
    if (!tryLock()) return;
    setSaving(true);
    try {
      await actualizarCitaAgenda(profesional.id, cita.id, {
        id_mascota: Number(id_mascota),
        id_tarifas: id_tarifas.map(Number),
        fecha: fechaGuardar,
        hora_inicio,
        hora_fin,
        observacion_ingreso,
      });

      const mascotaSel =
        editMascotas.find((m) => String(m.id) === String(id_mascota)) || null;
      const { tarifaDescripcion, tarifaValor, tarifas: tarifasMsg } = (() => {
        const fromEdit = id_tarifas
          .map((id) =>
            (tarifasParaEditar.length ? tarifasParaEditar : tarifas).find(
              (t) => String(t.id) === String(id)
            )
          )
          .filter(Boolean);
        if (fromEdit.length) {
          return {
            tarifas: fromEdit,
            tarifaDescripcion: formatTarifasLabel(fromEdit),
            tarifaValor: sumTarifasValor(fromEdit, id_tarifas),
          };
        }
        return resolverTarifaCita(
          {
            ...cita,
            id_tarifas,
            id_tarifa: id_tarifas[0],
          },
          tarifas
        );
      })();

      addToast?.('Cita reprogramada correctamente.', 'success');

      try {
        whatsappCancelRef.current?.cancel?.();
        whatsappCancelRef.current = await confirmarAgendaPorWhatsApp({
          cita: {
            id: cita.id,
            id_mascota: Number(id_mascota),
            fecha: fechaGuardar,
            hora_inicio,
            hora_fin,
            mascota_nombre: mascotaSel?.nombre || cita.mascota_nombre,
            especie: mascotaSel?.especie || cita.especie,
            raza: mascotaSel?.raza || cita.raza,
            tamano: mascotaSel?.tamano || cita.tamano,
            tarifas: tarifasMsg,
          },
          profesionalNombre: profesional?.nombre || '',
          mascotaFallback: mascotaSel,
          tarifaDescripcion,
          tarifaValor,
          tarifas: tarifasMsg,
          tipo: 'reprogramada',
        });
        addToast?.('Se abrió WhatsApp con el aviso de reprogramación.', 'success');
      } catch (waErr) {
        addToast?.(
          `No se abrió WhatsApp: ${waErr?.message || 'sin cuidador/teléfono válido'}`,
          'error'
        );
      }

      onSuccess?.({
        ...cita,
        id_mascota: Number(id_mascota),
        id_tarifas: id_tarifas.map(Number),
        id_tarifa: Number(id_tarifas[0]),
        fecha: fechaGuardar,
        hora_inicio,
        hora_fin,
        observacion_ingreso,
        tarifas: tarifasMsg,
        tarifa_descripcion: tarifaDescripcion || cita.tarifa_descripcion,
        tarifa_valor: tarifaValor ?? cita.tarifa_valor,
        mascota_nombre: mascotaSel?.nombre || cita.mascota_nombre,
        especie: mascotaSel?.especie || cita.especie,
        raza: mascotaSel?.raza || cita.raza,
        tamano: mascotaSel?.tamano || cita.tamano,
      });
      onClose?.();
    } catch (e) {
      addToast?.(e?.message || 'Error al reprogramar la cita', 'error');
    } finally {
      setSaving(false);
      unlock();
    }
  }

  function handleClose() {
    if (saving) return;
    onClose?.();
  }

  return (
    <Sheet
      open={open && !!cita}
      onClose={handleClose}
      title={cita ? `Reprogramar cita #${cita.id}` : 'Reprogramar cita'}
      size="lg"
      dismissible={!saving}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleReprogramar}
            disabled={saving || !puedeReprogramar}
          >
            {saving ? 'Guardando…' : editFranjaOcupada ? 'Cita ocupada' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      {cita && (
        <div className="agenda-form">
          {!(editForm.id_tarifas?.length) && (
            <div className="ui-banner ui-banner--warn" style={{ marginBottom: 12 }}>
              Esta cita no tiene tarifas asignadas. Selecciona al menos una tarifa para poder
              guardar.
            </div>
          )}
          <div className="agenda-form__row">
            <Field id="edit-buscador-cuidador" label="Cuidador" required>
              <div ref={editBuscadorCuidadorRef} className="ui-combo">
                <Input
                  id="edit-buscador-cuidador"
                  type="text"
                  role="combobox"
                  aria-expanded={editListaCuidadoresAbierta}
                  aria-controls="lista-cuidadores-edit"
                  aria-autocomplete="list"
                  placeholder="Buscar por nombre, teléfono o email…"
                  value={editBusquedaCuidador}
                  disabled={saving}
                  onChange={(e) => {
                    const value = e.target.value;
                    setEditBusquedaCuidador(value);
                    setEditListaCuidadoresAbierta(true);
                    if (editCuidadorSel && value !== (editCuidadorSel.nombre || '')) {
                      setEditCuidadorSel(null);
                      setEditMascotas([]);
                      setEditForm((prev) => ({ ...prev, id_mascota: '' }));
                      setEditBusquedaMascota('');
                    }
                  }}
                  onFocus={() => {
                    void abrirListaCuidadoresEdit();
                  }}
                />

                {editListaCuidadoresAbierta && (
                  <ul id="lista-cuidadores-edit" role="listbox" className="ui-combo__list">
                    {cuidadoresFiltrados.length === 0 ? (
                      <li
                        className="ui-combo__item"
                        style={{ cursor: 'default', color: 'var(--color-purple-light)' }}
                      >
                        {editBusquedaCuidador.trim()
                          ? `Sin resultados para “${editBusquedaCuidador.trim()}”`
                          : 'No hay cuidadores registrados'}
                      </li>
                    ) : (
                      cuidadoresFiltrados.map((c) => (
                        <li
                          key={c.id}
                          role="option"
                          aria-selected={editCuidadorSel?.id === c.id}
                        >
                          <button
                            type="button"
                            className={`ui-combo__item${
                              editCuidadorSel?.id === c.id ? ' ui-combo__item--active' : ''
                            }`}
                            onClick={() => seleccionarCuidadorEdit(c)}
                          >
                            <div>{c.nombre}</div>
                            <div
                              style={{
                                fontSize: '0.75rem',
                                color: 'var(--color-purple-light)',
                                fontWeight: 400,
                              }}
                            >
                              {[c.telefono, c.email].filter(Boolean).join(' · ') ||
                                'Sin contacto'}
                            </div>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            </Field>
            <Field id="edit-buscador-mascota" label="Mascota" required>
              <div ref={editBuscadorMascotaRef} className="ui-combo">
                <Input
                  id="edit-buscador-mascota"
                  type="text"
                  role="combobox"
                  aria-expanded={editListaMascotasAbierta}
                  aria-controls="lista-mascotas-edit"
                  aria-autocomplete="list"
                  placeholder={
                    editCuidadorSel || editMascotas.length > 0
                      ? 'Buscar por nombre, raza, especie o tamaño…'
                      : 'Seleccione primero un cuidador'
                  }
                  value={editBusquedaMascota}
                  disabled={saving || (!editCuidadorSel && editMascotas.length === 0)}
                  onChange={(e) => {
                    const value = e.target.value;
                    setEditBusquedaMascota(value);
                    setEditListaMascotasAbierta(true);
                    if (editForm.id_mascota) {
                      const selected = editMascotas.find(
                        (m) => String(m.id) === String(editForm.id_mascota)
                      );
                      if (!selected || value !== (selected.nombre || '')) {
                        setEditForm((prev) => ({ ...prev, id_mascota: '' }));
                      }
                    }
                  }}
                  onFocus={() => {
                    void abrirListaMascotasEdit();
                  }}
                />

                {editListaMascotasAbierta &&
                  (editCuidadorSel || editMascotas.length > 0) && (
                    <ul id="lista-mascotas-edit" role="listbox" className="ui-combo__list">
                      {editMascotasFiltradas.length === 0 ? (
                        <li
                          className="ui-combo__item"
                          style={{ cursor: 'default', color: 'var(--color-purple-light)' }}
                        >
                          {editMascotas.length === 0
                            ? 'Este cuidador no tiene mascotas asignadas'
                            : 'No se encontraron mascotas'}
                        </li>
                      ) : (
                        editMascotasFiltradas.map((m) => (
                          <li
                            key={m.id}
                            role="option"
                            aria-selected={String(editForm.id_mascota) === String(m.id)}
                          >
                            <button
                              type="button"
                              className={`ui-combo__item${
                                String(editForm.id_mascota) === String(m.id)
                                  ? ' ui-combo__item--active'
                                  : ''
                              }`}
                              onClick={() => seleccionarMascotaEdit(m)}
                            >
                              <div>{m.nombre}</div>
                              <div
                                style={{
                                  fontSize: '0.75rem',
                                  color: 'var(--color-purple-light)',
                                  fontWeight: 400,
                                }}
                              >
                                {[m.especie, m.raza, m.tamano].filter(Boolean).join(' · ')}
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
          <div className="agenda-form__row">
            <Field label="Fecha" required>
              <DateInput
                value={editForm.fecha}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    fecha: e.target.value,
                    hora_inicio: '',
                    hora_fin: '',
                  }))
                }
                disabled={saving}
                style={editFranjaOcupada ? AGENDA_INPUT_ERROR_STYLE : undefined}
              />
            </Field>
          </div>
          <div className="agenda-form__row">
            <Field id="edit-tarifa-agenda" label="Tarifas" required>
              <TarifaMultiSelect
                id="edit-tarifa-agenda"
                tarifas={tarifasParaEditar}
                value={editForm.id_tarifas || []}
                onChange={(ids) =>
                  setEditForm((prev) => ({ ...prev, id_tarifas: ids }))
                }
                disabled={saving || tarifasParaEditar.length === 0}
                required
                emptyLabel="Sin tarifas configuradas"
              />
            </Field>
          </div>
          <div className="agenda-form__row">
            <Field
              id="edit-observacion-ingreso"
              label="Observaciones de ingreso / mascota"
            >
              <Textarea
                id="edit-observacion-ingreso"
                value={editForm.observacion_ingreso || ''}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    observacion_ingreso: e.target.value,
                  }))
                }
                placeholder="Notas al ingresar la mascota (opcional)"
                disabled={saving}
                rows={2}
              />
            </Field>
          </div>
          <div className="agenda-form__row agenda-form__row--times">
            <Field label="Inicio" required>
              <HorarioSlotSelect
                value={editForm.hora_inicio}
                slots={slotsInicioEdit}
                disabled={saving}
                required
                placeholder="Hora inicio"
                emptyLabel="Sin horarios libres"
                style={
                  editFranjaOcupada || editHoraFinInvalida
                    ? AGENDA_INPUT_ERROR_STYLE
                    : undefined
                }
                onChange={onChangeHoraInicioEdit}
              />
            </Field>
            <Field label="Fin" required>
              <HorarioSlotSelect
                value={editForm.hora_fin}
                slots={slotsFinEdit}
                disabled={saving || !editForm.hora_inicio}
                required
                placeholder="Hora fin"
                emptyLabel="Sin horarios disponibles"
                style={
                  editFranjaOcupada || editHoraFinInvalida
                    ? AGENDA_INPUT_ERROR_STYLE
                    : undefined
                }
                onChange={(v) =>
                  setEditForm((prev) => ({ ...prev, hora_fin: toTimeHHMM(v) }))
                }
              />
            </Field>
          </div>

          {editHoraFinInvalida && (
            <div className="ui-banner ui-banner--warn" role="alert" style={{ marginTop: 10 }}>
              La hora final debe ser posterior a la hora de inicio.
            </div>
          )}

          {editFranjaOcupada && (
            <div className="ui-banner ui-banner--warn" role="alert" style={{ marginTop: 10 }}>
              <strong>Cita ocupada.</strong> Este profesional ya tiene una cita el{' '}
              {formatFecha(editCitaConflicto.fecha)} de{' '}
              {formatHora(editCitaConflicto.hora_inicio)} a{' '}
              {formatHora(editCitaConflicto.hora_fin)}
              {editCitaConflicto.mascota_nombre
                ? ` con ${editCitaConflicto.mascota_nombre}`
                : ''}
              . Elige otra fecha u otra franja horaria.
            </div>
          )}

          {editForm.fecha && editCitasDelDia.length > 0 && (
            <div className="ui-banner" style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                Otras franjas ocupadas este día
              </div>
              {editCitasDelDia.map((c) => (
                <div key={c.id}>
                  {formatHora(c.hora_inicio)} – {formatHora(c.hora_fin)}
                  {c.mascota_nombre ? ` · ${c.mascota_nombre}` : ''}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

import { useEffect, useMemo, useState } from 'react';
import {
  actualizarCitaAgenda,
  getAgendaDeProfesional,
  motivoNoReprogramarAgenda,
} from '../../api/agendasApi';
import { getProfesionalById } from '../../api/profesionalesApi';
import { listTarifas } from '../../api/tarifasApi';
import { normalizeListPayload } from '../../api/normalize';
import { useMutationLock } from '../../hooks/useMutationLock';
import { formatFecha, formatHora, toDateOnly } from '../../utils/format';
import { confirmarAgendaPorWhatsApp } from '../../utils/confirmarAgendaWhatsApp';
import {
  encontrarCitaConflicto,
  filtrarSlotsFinLibres,
  slotOcupadoPorCitas,
  citasDelDiaParaSlots,
} from '../../utils/agendaConflictos';
import {
  generarBloquesHorarios,
  horaAMinutos,
  jornadaDelProfesional,
  toTimeHHMM,
  asegurarSlotEnLista,
} from '../../utils/horarios';
import Field, { DateInput, Input, Textarea } from '../ui/Field';
import Button from '../ui/Button';
import Sheet from '../ui/Sheet';
import Skeleton from '../ui/Skeleton';
import HorarioSlotSelect from '../ui/HorarioSlotSelect';
import TarifaMultiSelect, {
  formatTarifasLabel,
  sumTarifasValor,
} from '../ui/TarifaMultiSelect';

function emptyForm() {
  return {
    id_mascota: '',
    id_tarifas: [],
    fecha: '',
    hora_inicio: '',
    hora_fin: '',
    observacion_ingreso: '',
  };
}

function idsTarifaDesdeCita(cita) {
  if (Array.isArray(cita?.id_tarifas) && cita.id_tarifas.length) {
    return cita.id_tarifas.map(String);
  }
  if (cita?.id_tarifa != null) return [String(cita.id_tarifa)];
  return [];
}

/**
 * Sheet de reprogramación reutilizable (Agendas / Cuidadores).
 * Reusa `actualizarCitaAgenda` + plantilla WhatsApp de reprogramación.
 */
export default function ReprogramarCitaSheet({
  open,
  onClose,
  cita = null,
  mascota = null,
  addToast,
  onSuccess,
  stackLevel = 2,
}) {
  const [form, setForm] = useState(emptyForm());
  const [profesional, setProfesional] = useState(null);
  const [citasProf, setCitasProf] = useState([]);
  const [tarifas, setTarifas] = useState([]);
  const [loadingInit, setLoadingInit] = useState(false);
  const [saving, setSaving] = useState(false);
  const { tryLock, unlock } = useMutationLock();

  useEffect(() => {
    if (!open || !cita?.id) {
      setForm(emptyForm());
      setProfesional(null);
      setCitasProf([]);
      setTarifas([]);
      setLoadingInit(false);
      setSaving(false);
      return undefined;
    }

    const motivo = motivoNoReprogramarAgenda(cita);
    if (motivo) {
      addToast?.(motivo, 'error');
      onClose?.();
      return undefined;
    }

    let cancelled = false;
    setLoadingInit(true);
    setForm({
      id_mascota: String(cita.id_mascota || mascota?.id || ''),
      id_tarifas: idsTarifaDesdeCita(cita),
      fecha: toDateOnly(cita.fecha) || '',
      hora_inicio: toTimeHHMM(cita.hora_inicio),
      hora_fin: toTimeHHMM(cita.hora_fin),
      observacion_ingreso: cita.observacion_ingreso || '',
    });

    const idProf = Number(cita.id_profesional);
    const profesionalNombreFallback = cita.profesional_nombre;
    Promise.all([
      getProfesionalById(idProf).catch(() => null),
      getAgendaDeProfesional(idProf),
      listTarifas(idProf),
    ])
      .then(([resProf, resAgenda, resTarifas]) => {
        if (cancelled) return;
        const prof =
          resProf?.data?.[0] ||
          resProf?.data ||
          (profesionalNombreFallback
            ? {
                id: idProf,
                nombre: profesionalNombreFallback,
              }
            : { id: idProf });
        setProfesional(prof);
        setCitasProf(normalizeListPayload(resAgenda));
        setTarifas(normalizeListPayload(resTarifas));
      })
      .catch((e) => {
        if (!cancelled) {
          addToast?.(e?.message || 'No se pudo cargar la agenda del profesional', 'error');
          onClose?.();
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingInit(false);
      });

    return () => {
      cancelled = true;
    };
    // Solo reabrir/cargar cuando cambia la cita o se abre el sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cita?.id]);

  const jornadaProf = useMemo(() => jornadaDelProfesional(profesional), [profesional]);

  const citasDelDiaSlots = useMemo(() => {
    if (!form.fecha) return [];
    return citasDelDiaParaSlots(citasProf, form.fecha, cita?.id);
  }, [citasProf, form.fecha, cita?.id]);

  const slotsInicio = useMemo(() => {
    const base = generarBloquesHorarios(jornadaProf.inicio, jornadaProf.fin, 30, {
      includeEnd: false,
    });
    const libres = !form.fecha
      ? base
      : base.filter((slot) => !slotOcupadoPorCitas(slot, citasDelDiaSlots));
    return asegurarSlotEnLista(libres, form.hora_inicio);
  }, [jornadaProf, form.fecha, form.hora_inicio, citasDelDiaSlots]);

  const slotsFin = useMemo(() => {
    const inicio = form.hora_inicio;
    let despues;
    if (!inicio) {
      despues = generarBloquesHorarios(jornadaProf.inicio, jornadaProf.fin, 30, {
        includeEnd: true,
      }).filter((s) => s > jornadaProf.inicio);
    } else {
      despues = generarBloquesHorarios(inicio, jornadaProf.fin, 30, {
        includeEnd: true,
      }).filter((s) => s > inicio);
    }
    const libres = filtrarSlotsFinLibres(despues, {
      citas: citasProf,
      fecha: form.fecha,
      horaInicio: inicio || undefined,
      excludeId: cita?.id,
    });
    return asegurarSlotEnLista(libres, form.hora_fin);
  }, [
    jornadaProf,
    form.hora_inicio,
    form.hora_fin,
    form.fecha,
    citasProf,
    cita?.id,
  ]);

  const horaFinInvalida =
    !!form.hora_inicio &&
    !!form.hora_fin &&
    horaAMinutos(form.hora_fin) <= horaAMinutos(form.hora_inicio);

  const citaConflicto =
    cita &&
    !horaFinInvalida &&
    form.fecha &&
    form.hora_inicio &&
    form.hora_fin
      ? encontrarCitaConflicto(
          citasProf,
          form.fecha,
          form.hora_inicio,
          form.hora_fin,
          cita.id
        )
      : null;

  const franjaOcupada = !!citaConflicto;

  const citasDelDia = form.fecha
    ? citasProf
        .filter(
          (c) =>
            toDateOnly(c.fecha) === toDateOnly(form.fecha) &&
            String(c.id) !== String(cita?.id) &&
            c.cancelada !== true &&
            c.atendida !== true
        )
        .sort(
          (a, b) =>
            (horaAMinutos(a.hora_inicio) ?? 0) - (horaAMinutos(b.hora_inicio) ?? 0)
        )
    : [];

  const tarifasActivas = tarifas.filter((t) => t.activo !== false);
  const tarifasParaEditar = (() => {
    const base = tarifasActivas;
    const currentIds = (form.id_tarifas || []).map(String);
    if (!currentIds.length) return base;
    const extras = tarifas.filter(
      (t) =>
        currentIds.includes(String(t.id)) &&
        !base.some((b) => String(b.id) === String(t.id))
    );
    return extras.length ? [...base, ...extras] : base;
  })();

  const puedeGuardar =
    !!form.id_mascota &&
    (form.id_tarifas?.length || 0) > 0 &&
    !!form.fecha &&
    !!form.hora_inicio &&
    !!form.hora_fin &&
    !horaFinInvalida &&
    !franjaOcupada &&
    !loadingInit &&
    !saving;

  const inputErrorStyle = { borderColor: '#dc2626' };

  function onChangeHoraInicio(value) {
    const inicio = toTimeHHMM(value);
    setForm((prev) => ({
      ...prev,
      hora_inicio: inicio,
      hora_fin: '',
    }));
  }

  async function handleGuardar() {
    if (!cita || !puedeGuardar) return;
    const motivo = motivoNoReprogramarAgenda(cita);
    if (motivo) {
      addToast?.(motivo, 'error');
      return;
    }
    const { id_mascota, id_tarifas, fecha, hora_inicio, hora_fin, observacion_ingreso } =
      form;
    if (!id_mascota || !id_tarifas?.length || !fecha || !hora_inicio || !hora_fin) {
      addToast?.(
        'Mascota, tarifa(s), fecha, hora de inicio y hora final son requeridas',
        'error'
      );
      return;
    }
    const fechaGuardar = toDateOnly(fecha);
    if (!fechaGuardar) {
      addToast?.('Fecha inválida', 'error');
      return;
    }
    if (horaAMinutos(hora_fin) <= horaAMinutos(hora_inicio)) {
      addToast?.('La hora final debe ser posterior a la hora de inicio', 'error');
      return;
    }
    const conflicto = encontrarCitaConflicto(
      citasProf,
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
      const idProf = Number(cita.id_profesional);
      await actualizarCitaAgenda(idProf, cita.id, {
        id_mascota: Number(id_mascota),
        id_tarifas: id_tarifas.map(Number),
        fecha: fechaGuardar,
        hora_inicio,
        hora_fin,
        observacion_ingreso,
      });

      const tarifasMsg = id_tarifas
        .map((id) => tarifasParaEditar.find((t) => String(t.id) === String(id)))
        .filter(Boolean);
      const tarifaDescripcion = formatTarifasLabel(tarifasMsg);
      const tarifaValor = sumTarifasValor(tarifasMsg, id_tarifas);

      const updated = {
        ...cita,
        id_mascota: Number(id_mascota),
        id_tarifas: id_tarifas.map(Number),
        id_tarifa: Number(id_tarifas[0]),
        fecha: fechaGuardar,
        hora_inicio,
        hora_fin,
        observacion_ingreso,
        tarifas: tarifasMsg.length
          ? tarifasMsg
          : Array.isArray(cita.tarifas)
            ? cita.tarifas
            : [],
        tarifa_descripcion: tarifaDescripcion || cita.tarifa_descripcion,
        tarifa_valor: tarifaValor ?? cita.tarifa_valor,
        profesional_nombre: profesional?.nombre || cita.profesional_nombre,
        mascota_nombre: mascota?.nombre || cita.mascota_nombre,
        especie: mascota?.especie || cita.especie,
        raza: mascota?.raza || cita.raza,
        tamano: mascota?.tamano || cita.tamano,
      };

      addToast?.('Cita reprogramada correctamente.', 'success');

      try {
        await confirmarAgendaPorWhatsApp({
          cita: updated,
          profesionalNombre: profesional?.nombre || cita.profesional_nombre || '',
          mascotaFallback: mascota,
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

      onSuccess?.(updated);
      onClose?.();
    } catch (e) {
      addToast?.(e?.message || 'Error al reprogramar la cita', 'error');
    } finally {
      setSaving(false);
      unlock();
    }
  }

  const nombreMascota = mascota?.nombre || cita?.mascota_nombre || 'Mascota';
  const nombreProf =
    profesional?.nombre || cita?.profesional_nombre || 'Profesional';

  return (
    <Sheet
      open={open && !!cita}
      onClose={() => !saving && onClose?.()}
      title={cita ? `Reprogramar cita #${cita.id}` : 'Reprogramar cita'}
      description={`${nombreMascota} · ${nombreProf}`}
      size="lg"
      dismissible={!saving}
      stackLevel={stackLevel}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleGuardar}
            disabled={!puedeGuardar}
          >
            {saving ? 'Guardando…' : franjaOcupada ? 'Cita ocupada' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      {loadingInit ? (
        <Skeleton rows={4} />
      ) : (
        <div className="agenda-form">
          {!(form.id_tarifas?.length) && (
            <div className="ui-banner ui-banner--warn" style={{ marginBottom: 12 }}>
              Esta cita no tiene tarifas asignadas. Selecciona al menos una tarifa para
              poder guardar.
            </div>
          )}

          <div className="agenda-form__row">
            <Field label="Mascota">
              <Input type="text" value={nombreMascota} disabled readOnly />
            </Field>
            <Field label="Profesional">
              <Input type="text" value={nombreProf} disabled readOnly />
            </Field>
          </div>

          <div className="agenda-form__row">
            <Field label="Fecha" required>
              <DateInput
                value={form.fecha}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    fecha: e.target.value,
                    hora_inicio: '',
                    hora_fin: '',
                  }))
                }
                disabled={saving}
                style={franjaOcupada ? inputErrorStyle : undefined}
              />
            </Field>
          </div>

          <div className="agenda-form__row">
            <Field id="reprog-tarifas" label="Tarifas" required>
              <TarifaMultiSelect
                id="reprog-tarifas"
                tarifas={tarifasParaEditar}
                value={form.id_tarifas || []}
                onChange={(ids) =>
                  setForm((prev) => ({ ...prev, id_tarifas: ids }))
                }
                disabled={saving || tarifasParaEditar.length === 0}
                required
                emptyLabel="Sin tarifas configuradas"
              />
            </Field>
          </div>

          <div className="agenda-form__row">
            <Field id="reprog-obs" label="Observaciones de ingreso / mascota">
              <Textarea
                id="reprog-obs"
                value={form.observacion_ingreso || ''}
                onChange={(e) =>
                  setForm((prev) => ({
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
                value={form.hora_inicio}
                slots={slotsInicio}
                disabled={saving}
                required
                placeholder="Hora inicio"
                emptyLabel="Sin horarios libres"
                style={
                  franjaOcupada || horaFinInvalida ? inputErrorStyle : undefined
                }
                onChange={onChangeHoraInicio}
              />
            </Field>
            <Field label="Fin" required>
              <HorarioSlotSelect
                value={form.hora_fin}
                slots={slotsFin}
                disabled={saving || !form.hora_inicio}
                required
                placeholder="Hora fin"
                emptyLabel="Sin horarios disponibles"
                style={
                  franjaOcupada || horaFinInvalida ? inputErrorStyle : undefined
                }
                onChange={(v) =>
                  setForm((prev) => ({ ...prev, hora_fin: toTimeHHMM(v) }))
                }
              />
            </Field>
          </div>

          {horaFinInvalida && (
            <div className="ui-banner ui-banner--warn" role="alert" style={{ marginTop: 10 }}>
              La hora final debe ser posterior a la hora de inicio.
            </div>
          )}

          {franjaOcupada && (
            <div className="ui-banner ui-banner--warn" role="alert" style={{ marginTop: 10 }}>
              <strong>Cita ocupada.</strong> Este profesional ya tiene una cita el{' '}
              {formatFecha(citaConflicto.fecha)} de {formatHora(citaConflicto.hora_inicio)}{' '}
              a {formatHora(citaConflicto.hora_fin)}
              {citaConflicto.mascota_nombre
                ? ` con ${citaConflicto.mascota_nombre}`
                : ''}
              . Elige otra fecha u otra franja horaria.
            </div>
          )}

          {form.fecha && citasDelDia.length > 0 && (
            <div className="ui-banner" style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                Otras franjas ocupadas este día
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
      )}
    </Sheet>
  );
}

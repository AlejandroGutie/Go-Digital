import { useEffect, useMemo, useState } from 'react';
import { Banknote } from 'lucide-react';
import {
  crearCitaAgenda,
  crearCitaYCobrar,
  franjasSeSolapan,
  getAgendaDeProfesional,
  horaAMinutos,
} from '../../api/agendasApi';
import { listProfesionales } from '../../api/profesionalesApi';
import { listTarifas } from '../../api/tarifasApi';
import { normalizeListPayload } from '../../api/normalize';
import { useMutationLock } from '../../hooks/useMutationLock';
import { formatFecha, formatHora, formatMoneda, toDateOnly } from '../../utils/format';
import Field, { DateInput, Input, Select, Textarea } from '../ui/Field';
import Button from '../ui/Button';
import Sheet from '../ui/Sheet';

const inputErrorStyle = { borderColor: 'var(--color-entorno)' };

const EMPTY = {
  id_profesional: '',
  id_tarifa: '',
  fecha: '',
  hora_inicio: '',
  hora_fin: '',
  metodo_pago: '',
  observacion: '',
};

export default function AgendarMascotaSheet({
  open,
  onClose,
  mascota,
  addToast,
  onAgendado,
}) {
  const [form, setForm] = useState(EMPTY);
  const [profesionales, setProfesionales] = useState([]);
  const [tarifas, setTarifas] = useState([]);
  const [citasProf, setCitasProf] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingOpts, setLoadingOpts] = useState(false);
  const { tryLock, unlock } = useMutationLock();

  useEffect(() => {
    if (!open) {
      setForm(EMPTY);
      setTarifas([]);
      setCitasProf([]);
      return undefined;
    }

    let cancelled = false;
    setLoadingOpts(true);
    listProfesionales(1, 500)
      .then((res) => {
        if (!cancelled) setProfesionales(normalizeListPayload(res));
      })
      .catch((e) => {
        if (!cancelled) addToast?.(e?.message || 'No se pudieron cargar profesionales', 'error');
      })
      .finally(() => {
        if (!cancelled) setLoadingOpts(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, addToast]);

  useEffect(() => {
    if (!open || !form.id_profesional) {
      setTarifas([]);
      setCitasProf([]);
      return undefined;
    }

    let cancelled = false;
    Promise.all([
      listTarifas(Number(form.id_profesional)),
      getAgendaDeProfesional(Number(form.id_profesional)),
    ])
      .then(([resT, resA]) => {
        if (cancelled) return;
        setTarifas(normalizeListPayload(resT));
        setCitasProf(normalizeListPayload(resA));
      })
      .catch((e) => {
        if (cancelled) return;
        setTarifas([]);
        setCitasProf([]);
        addToast?.(e?.message || 'No se pudieron cargar tarifas o agenda', 'error');
      });

    return () => {
      cancelled = true;
    };
  }, [open, form.id_profesional, addToast]);

  const tarifasActivas = useMemo(
    () => tarifas.filter((t) => t.activo !== false),
    [tarifas]
  );

  const horaFinInvalida =
    !!form.hora_inicio &&
    !!form.hora_fin &&
    horaAMinutos(form.hora_fin) <= horaAMinutos(form.hora_inicio);

  const citaConflicto = useMemo(() => {
    if (horaFinInvalida || !form.fecha || !form.hora_inicio || !form.hora_fin) return null;
    const fechaNorm = toDateOnly(form.fecha);
    return (
      citasProf.find(
        (c) =>
          toDateOnly(c.fecha) === fechaNorm &&
          franjasSeSolapan(form.hora_inicio, form.hora_fin, c.hora_inicio, c.hora_fin)
      ) || null
    );
  }, [citasProf, form.fecha, form.hora_inicio, form.hora_fin, horaFinInvalida]);

  const citasDelDia = useMemo(() => {
    if (!form.fecha) return [];
    const fechaNorm = toDateOnly(form.fecha);
    return citasProf
      .filter((c) => toDateOnly(c.fecha) === fechaNorm)
      .sort(
        (a, b) => (horaAMinutos(a.hora_inicio) ?? 0) - (horaAMinutos(b.hora_inicio) ?? 0)
      );
  }, [citasProf, form.fecha]);

  const puedeAgendar =
    !!mascota?.id &&
    !!form.id_profesional &&
    !!form.id_tarifa &&
    !!form.fecha &&
    !!form.hora_inicio &&
    !!form.hora_fin &&
    !horaFinInvalida &&
    !citaConflicto &&
    !loading &&
    !loadingOpts;

  function setField(key, value) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'id_profesional') next.id_tarifa = '';
      return next;
    });
  }

  function buildPayload(fechaGuardar) {
    return {
      id_mascota: Number(mascota.id),
      id_tarifa: Number(form.id_tarifa),
      fecha: fechaGuardar,
      hora_inicio: form.hora_inicio,
      hora_fin: form.hora_fin,
    };
  }

  async function handleSubmit() {
    if (!puedeAgendar) return;
    const fechaGuardar = toDateOnly(form.fecha);
    if (!fechaGuardar) {
      addToast?.('Fecha inválida', 'error');
      return;
    }
    if (!tryLock()) return;
    setLoading(true);
    try {
      await crearCitaAgenda(Number(form.id_profesional), buildPayload(fechaGuardar));
      addToast?.('Cita agendada correctamente', 'success');
      onAgendado?.();
      onClose?.();
    } catch (e) {
      addToast?.(e?.message || 'Error al agendar', 'error');
    } finally {
      setLoading(false);
      unlock();
    }
  }

  async function handleAgendarYCobrar() {
    if (!puedeAgendar) return;
    const fechaGuardar = toDateOnly(form.fecha);
    if (!fechaGuardar) {
      addToast?.('Fecha inválida', 'error');
      return;
    }
    const tarifa = tarifasActivas.find((t) => String(t.id) === String(form.id_tarifa));
    const valor = tarifa?.valor;
    if (valor == null || valor === '' || Number.isNaN(parseFloat(valor))) {
      addToast?.('La tarifa seleccionada no tiene un valor válido', 'error');
      return;
    }
    if (!form.metodo_pago?.trim()) {
      addToast?.('Selecciona un método de pago', 'error');
      return;
    }
    if (!tryLock()) return;
    setLoading(true);
    try {
      await crearCitaYCobrar(Number(form.id_profesional), buildPayload(fechaGuardar), {
        valor,
        metodo_pago: form.metodo_pago,
        observacion: form.observacion,
        fecha_cobro: fechaGuardar,
      });
      addToast?.('Cita agendada y cobrada correctamente', 'success');
      onAgendado?.();
      onClose?.();
    } catch (e) {
      addToast?.(e?.message || 'Error al agendar y cobrar', 'error');
    } finally {
      setLoading(false);
      unlock();
    }
  }

  const mascotaLabel = mascota
    ? `${mascota.nombre || 'Mascota'}${mascota.especie || mascota.raza ? ` · ${[mascota.especie, mascota.raza].filter(Boolean).join(' · ')}` : ''}`
    : '';

  return (
    <Sheet
      open={open}
      onClose={() => !loading && onClose?.()}
      title={mascota ? `Agendar ${mascota.nombre}` : 'Agendar mascota'}
      description="La cita quedará en la agenda del profesional seleccionado."
      dismissible={!loading}
      stackLevel={1}
      footer={
        <div className="ui-btn-row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="ghost"
            onClick={handleAgendarYCobrar}
            disabled={!puedeAgendar || !form.metodo_pago?.trim()}
          >
            <Banknote size={14} />
            {loading ? '…' : 'Agendar y Cobrar'}
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!puedeAgendar}>
            {loading ? '…' : citaConflicto ? 'Cita ocupada' : 'Agendar'}
          </Button>
        </div>
      }
    >
      <div className="ui-form">
        <Field label="Mascota">
          <Input type="text" value={mascotaLabel} readOnly disabled={loading} />
        </Field>

        <Field label="Profesional" required>
          <Select
            value={form.id_profesional}
            onChange={(e) => setField('id_profesional', e.target.value)}
            disabled={loading || loadingOpts}
            required
          >
            <option value="">Seleccionar profesional</option>
            {profesionales.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Tarifa" required>
          <Select
            value={form.id_tarifa}
            onChange={(e) => setField('id_tarifa', e.target.value)}
            disabled={loading || !form.id_profesional || tarifasActivas.length === 0}
            required
          >
            <option value="">
              {!form.id_profesional
                ? 'Elige un profesional primero'
                : tarifasActivas.length === 0
                  ? 'Sin tarifas configuradas'
                  : 'Seleccionar tarifa'}
            </option>
            {tarifasActivas.map((t) => (
              <option key={t.id} value={t.id}>
                {`${t.descripcion} — ${formatMoneda(t.valor)}`}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Fecha" required>
          <DateInput
            value={form.fecha}
            onChange={(e) => setField('fecha', e.target.value)}
            disabled={loading}
            style={citaConflicto ? inputErrorStyle : undefined}
          />
        </Field>

        <div className="agenda-form__row agenda-form__row--times">
          <Field label="Inicio" required>
            <Input
              type="time"
              value={form.hora_inicio}
              onChange={(e) => setField('hora_inicio', e.target.value)}
              disabled={loading}
              style={citaConflicto || horaFinInvalida ? inputErrorStyle : undefined}
            />
          </Field>
          <Field label="Fin" required>
            <Input
              type="time"
              value={form.hora_fin}
              onChange={(e) => setField('hora_fin', e.target.value)}
              disabled={loading}
              style={citaConflicto || horaFinInvalida ? inputErrorStyle : undefined}
            />
          </Field>
        </div>

        <Field label="Método de pago" required>
          <Select
            value={form.metodo_pago}
            onChange={(e) => setField('metodo_pago', e.target.value)}
            disabled={loading}
            required
          >
            <option value="">Seleccionar método de pago</option>
            <option value="Efectivo">Efectivo</option>
            <option value="Transferencia">Transferencia</option>
            <option value="Tarjeta">Tarjeta</option>
          </Select>
        </Field>

        <Field label="Observación del cobro">
          <Textarea
            value={form.observacion}
            onChange={(e) => setField('observacion', e.target.value)}
            placeholder="Solo se usa en Agendar y Cobrar"
            disabled={loading}
            rows={2}
          />
        </Field>

        {horaFinInvalida && (
          <div className="ui-banner ui-banner--warn" role="alert">
            La hora final debe ser posterior a la hora de inicio.
          </div>
        )}

        {citaConflicto && (
          <div className="ui-banner ui-banner--warn" role="alert">
            <strong>Cita ocupada.</strong> Este profesional ya tiene una cita el{' '}
            {formatFecha(citaConflicto.fecha)} de {formatHora(citaConflicto.hora_inicio)} a{' '}
            {formatHora(citaConflicto.hora_fin)}
            {citaConflicto.mascota_nombre ? ` con ${citaConflicto.mascota_nombre}` : ''}.
          </div>
        )}

        {form.fecha && citasDelDia.length > 0 && (
          <div className="ui-banner">
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
    </Sheet>
  );
}

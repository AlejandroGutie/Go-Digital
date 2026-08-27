import { useEffect, useState } from 'react';
import { MessageCircle, PawPrint, Wallet } from 'lucide-react';
import {
  getCitasActivasDeMascota,
  marcarAgendaAtendida,
  debeMostrarEnVistaActiva,
  estadoPagoAgenda,
} from '../../api/agendasApi';
import { createCobro, updateCobro } from '../../api/cobrosApi';
import { listTarifas } from '../../api/tarifasApi';
import { getCuidadoresDeMascota, getMascotaById } from '../../api/mascotasApi';
import { normalizeListPayload } from '../../api/normalize';
import { useMutationLock } from '../../hooks/useMutationLock';
import {
  formatFecha,
  formatHora,
  formatMoneda,
  hoyLocalISO,
  toDateOnly,
} from '../../utils/format';
import {
  buildWhatsAppConfirmMessage,
  buildWhatsAppMascotaListaMessage,
  openWhatsAppChat,
  sanitizePhoneCO,
} from '../../utils/whatsapp';
import EmptyState from '../EmptyState';
import CobroFormSheet from '../cobros/CobroFormSheet';
import { formatTarifasLabel, totalTarifasSeleccionadas } from '../ui/TarifaMultiSelect';
import Button from '../ui/Button';
import Sheet from '../ui/Sheet';
import Skeleton from '../ui/Skeleton';

function emptyCobroForm() {
  return {
    id_profesional: '',
    id_agenda: '',
    id_mascota: '',
    id_tarifa: '',
    id_tarifas: [],
    valor: '',
    metodo_pago: '',
    observacion: '',
    fecha_cobro: hoyLocalISO(),
    profesional_nombre: '',
    agenda_label: '',
  };
}

function estadoPagoCita(cita) {
  return estadoPagoAgenda(cita);
}

function EstadoBadge({ cita }) {
  const estado = estadoPagoCita(cita);
  if (estado === 'pagado') {
    return (
      <span
        className="ui-badge"
        title={
          cita.atendida
            ? 'Pagada y lista'
            : 'Pago registrado; pendiente de Mascota lista'
        }
        style={{
          background: 'color-mix(in srgb, #0d9488 18%, var(--color-white))',
          color: '#0f766e',
          border: '1px solid color-mix(in srgb, #0d9488 35%, transparent)',
          fontWeight: 600,
        }}
      >
        Pagada
      </span>
    );
  }
  return (
    <span
      className="ui-badge"
      title="Cobro pendiente de pago"
      style={{
        background: 'var(--bg-selected)',
        color: 'var(--color-entorno)',
        fontWeight: 600,
      }}
    >
      Pendiente de pago
    </span>
  );
}

export default function CitasMascotaAccionesSheet({
  open,
  onClose,
  mascota,
  addToast,
  onCitasChanged,
}) {
  const [citas, setCitas] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [whatsappBusy, setWhatsappBusy] = useState(null); // { id, kind }
  const [pagarBusyId, setPagarBusyId] = useState(null);
  const [cobroOpen, setCobroOpen] = useState(false);
  const [cobroForm, setCobroForm] = useState(emptyCobroForm());
  const [cobroTarifas, setCobroTarifas] = useState([]);
  const [cobroLoading, setCobroLoading] = useState(false);
  const { tryLock, unlock } = useMutationLock();

  useEffect(() => {
    if (!open || !mascota?.id) {
      setCitas([]);
      setCobroOpen(false);
      setCobroForm(emptyCobroForm());
      setPagarBusyId(null);
      return undefined;
    }

    let cancelled = false;
    setListLoading(true);
    getCitasActivasDeMascota(mascota.id)
      .then((res) => {
        if (!cancelled) setCitas(normalizeListPayload(res));
      })
      .catch((e) => {
        if (!cancelled) {
          setCitas([]);
          addToast?.(e?.message || 'No se pudieron cargar las citas', 'error');
        }
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, mascota?.id, addToast]);

  async function resolverCuidadorYTelefono(cita) {
    const [resCuidadores, resMascota] = await Promise.all([
      getCuidadoresDeMascota(cita.id_mascota),
      getMascotaById(cita.id_mascota).catch(() => null),
    ]);
    const cuidadores = normalizeListPayload(resCuidadores);
    const mascotaData = resMascota?.data?.[0] || resMascota?.data || mascota || null;
    const cuidador =
      cuidadores.find((c) => c.activo !== false && c.telefono) ||
      cuidadores.find((c) => c.telefono) ||
      cuidadores[0] ||
      null;

    if (!cuidador) {
      throw new Error(
        'Esta mascota no tiene un cuidador asignado. Asígnalo en el módulo de Asignación.'
      );
    }

    const phone = sanitizePhoneCO(cuidador.telefono);
    if (!phone) {
      throw new Error(
        'El cuidador no tiene un celular colombiano válido. Actualízalo en Cuidadores.'
      );
    }

    return { cuidador, phone, mascotaData };
  }

  async function handleConfirmarWhatsApp(cita) {
    if (!tryLock()) return;
    setWhatsappBusy({ id: cita.id, kind: 'confirm' });
    try {
      const { cuidador, phone, mascotaData } = await resolverCuidadorYTelefono(cita);

      const message = buildWhatsAppConfirmMessage({
        cuidadorNombre: cuidador.nombre,
        mascotaNombre: mascotaData?.nombre || cita.mascota_nombre || mascota?.nombre || '',
        mascotaEspecie: mascotaData?.especie || cita.especie || mascota?.especie || '',
        mascotaRaza: mascotaData?.raza || cita.raza || mascota?.raza || '',
        mascotaTamano: mascotaData?.tamano || cita.tamano || mascota?.tamano || '',
        profesionalNombre: cita.profesional_nombre || '',
        fechaLabel: formatFecha(cita.fecha),
        horaInicioLabel: formatHora(cita.hora_inicio),
        horaFinLabel: formatHora(cita.hora_fin),
        tarifaDescripcion: cita.tarifa_descripcion || '',
        valorLabel:
          cita.tarifa_valor != null && cita.tarifa_valor !== ''
            ? formatMoneda(cita.tarifa_valor)
            : '',
      });

      openWhatsAppChat(phone, message);
      addToast?.('Se abrió WhatsApp con el mensaje de confirmación.', 'success');
    } catch (e) {
      addToast?.(e?.message || 'No se pudo confirmar la agenda por WhatsApp', 'error');
    } finally {
      setWhatsappBusy(null);
      unlock();
    }
  }

  async function handleMascotaLista(cita) {
    if (cita?.cancelada === true) return;
    if (cita?.atendida === true) {
      addToast?.('Esta cita ya está marcada como Mascota lista.', 'success');
      return;
    }
    if (!tryLock()) return;
    setWhatsappBusy({ id: cita.id, kind: 'lista' });
    try {
      await marcarAgendaAtendida(cita.id, cita.id_profesional);
      setCitas((prev) =>
        prev
          .map((c) =>
            String(c.id) === String(cita.id) ? { ...c, atendida: true } : c
          )
          .filter(debeMostrarEnVistaActiva)
      );
      onCitasChanged?.();

      let whatsappOk = false;
      try {
        const { cuidador, phone, mascotaData } = await resolverCuidadorYTelefono(cita);
        const message = buildWhatsAppMascotaListaMessage({
          cuidadorNombre: cuidador.nombre,
          mascotaNombre: mascotaData?.nombre || cita.mascota_nombre || mascota?.nombre || '',
          profesionalNombre: cita.profesional_nombre || '',
          fechaLabel: formatFecha(cita.fecha),
          horaFinLabel: formatHora(cita.hora_fin),
          tarifaDescripcion: cita.tarifa_descripcion || '',
        });
        openWhatsAppChat(phone, message);
        whatsappOk = true;
      } catch (waErr) {
        addToast?.(
          `Mascota lista registrada. No se abrió WhatsApp: ${waErr?.message || 'sin cuidador/teléfono válido'}`,
          'success'
        );
      }

      if (whatsappOk) {
        addToast?.(
          estadoPagoCita(cita) === 'pagado'
            ? 'Mascota lista y WhatsApp abierto. La cita quedó archivada.'
            : 'Mascota lista y WhatsApp abierto. La cita sigue visible hasta pagar.',
          'success'
        );
      }
    } catch (e) {
      addToast?.(e?.message || 'No se pudo marcar la mascota como lista', 'error');
    } finally {
      setWhatsappBusy(null);
      unlock();
    }
  }

  /** Legacy: cita sin cobro → abre formulario para crear cobro pagado. */
  async function abrirRegistrarPago(cita) {
    if (estadoPagoCita(cita) === 'pagado') return;
    if (!tryLock()) return;
    try {
      const resT = await listTarifas(Number(cita.id_profesional));
      const tarifasProf = normalizeListPayload(resT).filter((t) => t.activo !== false);
      const idsRaw =
        Array.isArray(cita.id_tarifas) && cita.id_tarifas.length
          ? cita.id_tarifas.map(String)
          : cita.id_tarifa != null
            ? [String(cita.id_tarifa)]
            : [];
      const { ids, total } = totalTarifasSeleccionadas(tarifasProf, idsRaw);

      setCobroTarifas(tarifasProf);
      setCobroForm({
        id_profesional: String(cita.id_profesional),
        id_agenda: String(cita.id),
        id_mascota: String(cita.id_mascota),
        id_tarifas: ids,
        id_tarifa: ids[0] || '',
        valor: String(total),
        metodo_pago: '',
        observacion: cita.tarifa_descripcion
          ? `Pago agenda #${cita.id} · ${cita.tarifa_descripcion}`
          : `Pago agenda #${cita.id}`,
        fecha_cobro: toDateOnly(cita.fecha) || hoyLocalISO(),
        profesional_nombre: cita.profesional_nombre || '',
        agenda_label: `${formatFecha(cita.fecha)} — ${cita.mascota_nombre || mascota?.nombre || 'Mascota'} · ${formatHora(cita.hora_inicio)}-${formatHora(cita.hora_fin)}`,
      });
      setCobroOpen(true);
    } catch (e) {
      addToast?.(e?.message || 'No se pudieron cargar las tarifas', 'error');
    } finally {
      unlock();
    }
  }

  async function handlePagar(cita) {
    if (estadoPagoCita(cita) === 'pagado') return;

    // Cobro pendiente existente → marcar pagado
    if (cita.cobro_id && cita.cobro_estado === 'pendiente') {
      if (!tryLock()) return;
      setPagarBusyId(cita.id);
      try {
        const res = await updateCobro(cita.cobro_id, { estado: 'pagado' });
        if (res?.status === 'ok') {
          setCitas((prev) =>
            prev
              .map((c) =>
                String(c.id) === String(cita.id)
                  ? { ...c, cobrada: true, cobro_estado: 'pagado' }
                  : c
              )
              .filter(debeMostrarEnVistaActiva)
          );
          addToast?.(
            cita.atendida === true
              ? 'Pago registrado. La cita quedó archivada (lista + pagada).'
              : 'Pago registrado. La cita quedó como pagada.',
            'success'
          );
          onCitasChanged?.();
        } else {
          addToast?.(res?.message || 'Error al registrar el pago', 'error');
        }
      } catch (e) {
        addToast?.(e?.message || 'Error al registrar el pago', 'error');
      } finally {
        setPagarBusyId(null);
        unlock();
      }
      return;
    }

    // Sin cobro (citas antiguas): abrir formulario
    await abrirRegistrarPago(cita);
  }

  function handleCobroTarifasChange(id_tarifas) {
    const { ids, total } = totalTarifasSeleccionadas(cobroTarifas, id_tarifas);
    setCobroForm((prev) => ({
      ...prev,
      id_tarifas: ids,
      id_tarifa: ids[0] || '',
      valor: String(total),
    }));
  }

  async function guardarCobro() {
    if (!cobroForm.id_tarifas?.length) {
      addToast?.('Selecciona al menos una tarifa', 'error');
      return;
    }
    if (!cobroForm.metodo_pago?.trim()) {
      addToast?.('Selecciona un método de pago', 'error');
      return;
    }
    const valorNum = parseFloat(cobroForm.valor);
    if (Number.isNaN(valorNum) || valorNum < 0) {
      addToast?.('Ingresa un valor válido (0 o mayor)', 'error');
      return;
    }
    if (!tryLock()) return;
    setCobroLoading(true);
    try {
      const res = await createCobro({
        id_profesional: Number(cobroForm.id_profesional),
        id_agenda: Number(cobroForm.id_agenda),
        id_mascota: Number(cobroForm.id_mascota),
        id_tarifas: (cobroForm.id_tarifas || []).map(Number),
        valor: cobroForm.valor,
        metodo_pago: cobroForm.metodo_pago,
        observacion: cobroForm.observacion,
        fecha_cobro: cobroForm.fecha_cobro,
        estado: 'pagado',
      });
      if (res?.status === 'ok') {
        const agendaId = String(cobroForm.id_agenda);
        const cobroCreado = res?.data;
        addToast?.('Pago registrado. La cita quedó como pagada.', 'success');
        setCitas((prev) =>
          prev
            .map((c) =>
              String(c.id) === agendaId
                ? {
                    ...c,
                    cobrada: true,
                    cobro_id: cobroCreado?.id ?? c.cobro_id,
                    cobro_estado: 'pagado',
                  }
                : c
            )
            .filter(debeMostrarEnVistaActiva)
        );
        setCobroOpen(false);
        setCobroForm(emptyCobroForm());
        onCitasChanged?.();
      } else {
        addToast?.(res?.message || 'Error al registrar el pago', 'error');
      }
    } catch (e) {
      addToast?.(e?.message || 'Error al registrar el pago', 'error');
    } finally {
      setCobroLoading(false);
      unlock();
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={() => !cobroLoading && onClose?.()}
        title={mascota ? `Citas de ${mascota.nombre}` : 'Gestionar citas'}
        description="Citas activas de la mascota. Se archivan solo cuando están pagadas y marcadas como Mascota lista."
        dismissible={!cobroLoading && !whatsappBusy && pagarBusyId == null}
        stackLevel={1}
        footer={
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={cobroLoading || pagarBusyId != null}
          >
            Cerrar
          </Button>
        }
      >
        {listLoading ? (
          <Skeleton rows={3} />
        ) : citas.length === 0 ? (
          <EmptyState
            title="Sin citas activas"
            description="Agenda una cita para esta mascota. Las citas se archivan al completar pago y Mascota lista."
          />
        ) : (
          <div className="ui-table-wrap table-scroll">
            <table className="ui-table">
              <thead>
                <tr>
                  {['Fecha', 'Horario', 'Profesional', 'Tarifa', 'Estado', ''].map((h) => (
                    <th key={h || 'acciones'}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {citas.map((c) => {
                  const pago = estadoPagoCita(c);
                  const pendientePago = pago === 'pendiente';
                  return (
                    <tr key={c.id}>
                      <td style={{ color: 'var(--color-purple-light)' }}>
                        {formatFecha(c.fecha)}
                      </td>
                      <td>
                        {formatHora(c.hora_inicio)} – {formatHora(c.hora_fin)}
                      </td>
                      <td>{c.profesional_nombre || '—'}</td>
                      <td>
                        {Array.isArray(c.tarifas) && c.tarifas.length
                          ? formatTarifasLabel(c.tarifas)
                          : c.tarifa_descripcion
                            ? `${c.tarifa_descripcion}${
                                c.tarifa_valor != null
                                  ? ` · ${formatMoneda(c.tarifa_valor)}`
                                  : ''
                              }`
                            : '—'}
                      </td>
                      <td>
                        <EstadoBadge cita={c} />
                      </td>
                      <td>
                        <div className="ui-table__actions">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleConfirmarWhatsApp(c)}
                            disabled={
                              whatsappBusy != null ||
                              cobroLoading ||
                              pagarBusyId != null
                            }
                            style={{ color: '#128C7E' }}
                          >
                            <MessageCircle size={14} />
                            {whatsappBusy?.id === c.id && whatsappBusy?.kind === 'confirm'
                              ? 'Abriendo…'
                              : 'Confirmar'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleMascotaLista(c)}
                            disabled={
                              whatsappBusy != null ||
                              cobroLoading ||
                              pagarBusyId != null ||
                              c.atendida === true
                            }
                            title={
                              c.atendida === true
                                ? 'Esta cita ya está marcada como Mascota lista'
                                : 'Marcar atención completada y notificar'
                            }
                            style={{ color: '#128C7E' }}
                          >
                            <PawPrint size={14} />
                            {whatsappBusy?.id === c.id && whatsappBusy?.kind === 'lista'
                              ? 'Procesando…'
                              : 'Mascota lista'}
                          </Button>
                          {pendientePago && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handlePagar(c)}
                              disabled={
                                whatsappBusy != null ||
                                cobroLoading ||
                                cobroOpen ||
                                pagarBusyId != null
                              }
                              title="Marcar el cobro como pagado"
                            >
                              <Wallet size={14} />
                              {pagarBusyId === c.id ? 'Pagando…' : 'Pagar'}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Sheet>

      <CobroFormSheet
        open={cobroOpen}
        onClose={() => {
          if (!cobroLoading) {
            setCobroOpen(false);
            setCobroForm(emptyCobroForm());
          }
        }}
        onSubmit={guardarCobro}
        loading={cobroLoading}
        title="Registrar pago"
        values={cobroForm}
        nombreMascotaVisible={mascota?.nombre || ''}
        tarifas={cobroTarifas}
        onTarifasChange={handleCobroTarifasChange}
        onFieldChange={setCobroForm}
        lockAgendaContext
        stackLevel={2}
      />
    </>
  );
}

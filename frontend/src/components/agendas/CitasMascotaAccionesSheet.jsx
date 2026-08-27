import { useEffect, useState } from 'react';
import { Banknote, MessageCircle, PawPrint } from 'lucide-react';
import {
  getCitasActivasDeMascota,
  marcarAgendaAtendida,
} from '../../api/agendasApi';
import { createCobro } from '../../api/cobrosApi';
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
import { formatTarifasLabel, sumTarifasValor, totalTarifasSeleccionadas } from '../ui/TarifaMultiSelect';
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

function EstadoBadge({ cobrada }) {
  if (cobrada) {
    return (
      <span
        className="ui-badge"
        title="Cobro registrado; pendiente de Mascota lista"
        style={{
          background: 'color-mix(in srgb, #0d9488 18%, var(--color-white))',
          color: '#0f766e',
          border: '1px solid color-mix(in srgb, #0d9488 35%, transparent)',
          fontWeight: 600,
        }}
      >
        Cobrada
      </span>
    );
  }
  return (
    <span
      className="ui-badge"
      style={{
        background: 'var(--bg-selected)',
        color: 'var(--color-entorno)',
        fontWeight: 600,
      }}
    >
      Pendiente cobro
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
    if (cita?.cobrada !== true) {
      addToast?.('Registra el cobro antes de marcar Mascota lista.', 'error');
      return;
    }
    if (!tryLock()) return;
    setWhatsappBusy({ id: cita.id, kind: 'lista' });
    try {
      // Archivar siempre; WhatsApp es opcional
      await marcarAgendaAtendida(cita.id, cita.id_profesional);
      setCitas((prev) => prev.filter((c) => String(c.id) !== String(cita.id)));
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
          `Cita marcada como atendida. No se abrió WhatsApp: ${waErr?.message || 'sin cuidador/teléfono válido'}`,
          'success'
        );
      }

      if (whatsappOk) {
        addToast?.('Cita marcada como atendida y WhatsApp abierto.', 'success');
      }
    } catch (e) {
      addToast?.(e?.message || 'No se pudo marcar la mascota como lista', 'error');
    } finally {
      setWhatsappBusy(null);
      unlock();
    }
  }

  async function abrirCobrar(cita) {
    if (cita.cobrada) return;
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
          ? `Cobro agenda #${cita.id} · ${cita.tarifa_descripcion}`
          : `Cobro agenda #${cita.id}`,
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
      });
      if (res?.status === 'ok') {
        const agendaId = String(cobroForm.id_agenda);
        addToast?.('Cobro registrado. La cita sigue visible hasta Mascota lista.', 'success');
        setCitas((prev) =>
          prev.map((c) => (String(c.id) === agendaId ? { ...c, cobrada: true } : c))
        );
        setCobroOpen(false);
        setCobroForm(emptyCobroForm());
        onCitasChanged?.();
      } else {
        addToast?.(res?.message || 'Error al crear cobro', 'error');
      }
    } catch (e) {
      addToast?.(e?.message || 'Error al crear cobro', 'error');
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
        description="Citas activas (pendientes de Mascota lista). Primero cobra; luego marca Mascota lista para archivar."
        dismissible={!cobroLoading && !whatsappBusy}
        stackLevel={1}
        footer={
          <Button variant="ghost" onClick={onClose} disabled={cobroLoading}>
            Cerrar
          </Button>
        }
      >
        {listLoading ? (
          <Skeleton rows={3} />
        ) : citas.length === 0 ? (
          <EmptyState
            title="Sin citas activas"
            description="Agenda una cita para esta mascota. Las finalizadas con Mascota lista no aparecen aquí."
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
                {citas.map((c) => (
                  <tr key={c.id}>
                    <td style={{ color: 'var(--color-purple-light)' }}>{formatFecha(c.fecha)}</td>
                    <td>
                      {formatHora(c.hora_inicio)} – {formatHora(c.hora_fin)}
                    </td>
                    <td>{c.profesional_nombre || '—'}</td>
                    <td>
                      {Array.isArray(c.tarifas) && c.tarifas.length
                        ? formatTarifasLabel(c.tarifas)
                        : c.tarifa_descripcion
                          ? `${c.tarifa_descripcion}${
                              c.tarifa_valor != null ? ` · ${formatMoneda(c.tarifa_valor)}` : ''
                            }`
                          : '—'}
                    </td>
                    <td>
                      <EstadoBadge cobrada={c.cobrada === true} />
                    </td>
                    <td>
                      <div className="ui-table__actions">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleConfirmarWhatsApp(c)}
                          disabled={whatsappBusy != null || cobroLoading}
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
                            c.cobrada !== true
                          }
                          title={
                            c.cobrada !== true
                              ? 'Registra el cobro antes de marcar Mascota lista'
                              : 'Marcar atención completada y notificar'
                          }
                          style={{ color: '#128C7E' }}
                        >
                          <PawPrint size={14} />
                          {whatsappBusy?.id === c.id && whatsappBusy?.kind === 'lista'
                            ? 'Procesando…'
                            : 'Mascota lista'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => abrirCobrar(c)}
                          disabled={
                            whatsappBusy != null ||
                            cobroLoading ||
                            cobroOpen ||
                            c.cobrada === true
                          }
                          title={c.cobrada ? 'Esta cita ya está cobrada' : 'Registrar cobro'}
                        >
                          <Banknote size={14} />
                          Cobrar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
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
        title="Registrar cobro"
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

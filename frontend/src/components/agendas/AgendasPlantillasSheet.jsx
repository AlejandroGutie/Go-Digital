import Field, { Input, Textarea } from '../ui/Field';
import Button from '../ui/Button';
import Sheet from '../ui/Sheet';
import {
  resetAgendaPlantillas,
  saveAgendaPlantillas,
} from '../../utils/agendaPlantillas';

export default function AgendasPlantillasSheet({
  open,
  onClose,
  templates,
  onTemplatesChange,
  addToast,
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Plantillas de WhatsApp (Agendas)"
      description="Usa {cuidador}, {mascota}, {fecha}, {hora}, {hora_inicio}, {hora_fin}, {profesional}, {desglose_tarifas}, {valor_total}, {servicios}, {tarifa}, {valor}, {servicio}, {detalle}, {negocio}."
      size="lg"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              onTemplatesChange?.(resetAgendaPlantillas());
              addToast?.('Plantillas restauradas a los textos por defecto.', 'success');
            }}
          >
            Restaurar textos
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              const next = saveAgendaPlantillas(templates);
              onTemplatesChange?.(next);
              onClose?.();
              addToast?.('Plantillas de agenda guardadas.', 'success');
            }}
          >
            Guardar
          </Button>
        </>
      }
    >
      <Field id="agenda-tpl-negocio" label="Nombre del negocio">
        <Input
          id="agenda-tpl-negocio"
          value={templates?.negocio || ''}
          onChange={(e) =>
            onTemplatesChange?.((p) => ({ ...p, negocio: e.target.value }))
          }
        />
      </Field>
      <Field id="agenda-tpl-confirmacion" label="Plantilla confirmación de cita">
        <Textarea
          id="agenda-tpl-confirmacion"
          rows={8}
          value={templates?.confirmacion || ''}
          onChange={(e) =>
            onTemplatesChange?.((p) => ({ ...p, confirmacion: e.target.value }))
          }
        />
      </Field>
      <Field id="agenda-tpl-reprogramada" label="Plantilla reprogramación de cita">
        <Textarea
          id="agenda-tpl-reprogramada"
          rows={8}
          value={templates?.reprogramada || ''}
          onChange={(e) =>
            onTemplatesChange?.((p) => ({ ...p, reprogramada: e.target.value }))
          }
        />
      </Field>
      <Field id="agenda-tpl-lista" label="Plantilla mascota lista / cita atendida">
        <Textarea
          id="agenda-tpl-lista"
          rows={8}
          value={templates?.mascota_lista || ''}
          onChange={(e) =>
            onTemplatesChange?.((p) => ({ ...p, mascota_lista: e.target.value }))
          }
        />
      </Field>
      <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-purple-light)' }}>
        Si dejas un campo vacío, al guardar se usará el texto por defecto. También puedes
        usar alias: {'{nombre_cuidador}'}, {'{nombre_mascota}'}, {'{nombre_profesional}'}.
        En confirmación/reprogramación: {'{desglose_tarifas}'} lista cada servicio con
        precio y {'{valor_total}'} muestra el total.
      </p>
    </Sheet>
  );
}

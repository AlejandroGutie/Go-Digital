-- Reprogramar agenda con cobro pendiente: permite cambiar fecha/hora/mascota/tarifa
-- si el cobro vigente está en pendiente (no pagado).

CREATE OR REPLACE FUNCTION public.agenda_proteger_integridad()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND (
      NEW.fecha IS DISTINCT FROM OLD.fecha
      OR NEW.hora_inicio IS DISTINCT FROM OLD.hora_inicio
      OR NEW.hora_fin IS DISTINCT FROM OLD.hora_fin
      OR NEW.id_profesional IS DISTINCT FROM OLD.id_profesional
      OR NEW.id_mascota IS DISTINCT FROM OLD.id_mascota
      OR NEW.id_tarifa IS DISTINCT FROM OLD.id_tarifa
    )
  THEN
    IF EXISTS (
      SELECT 1
      FROM public.cobro c
      WHERE c.id_agenda = OLD.id
        AND c.estado = 'pagado'
    ) THEN
      RAISE EXCEPTION
        'No se puede reprogramar una cita con cobro pagado. Devuelve el pago o anula el cobro en Cobros primero.';
    END IF;

    IF OLD.cobrada IS TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM public.cobro c
        WHERE c.id_agenda = OLD.id
          AND c.estado = 'pendiente'
      )
    THEN
      RAISE EXCEPTION
        'No se puede modificar una cita cobrada. Anula el cobro en Cobros si necesitas corregirla.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Cancelación de agenda (sin DELETE): flag cancelada + observación
ALTER TABLE public.agenda
  ADD COLUMN IF NOT EXISTS cancelada boolean NOT NULL DEFAULT false;

ALTER TABLE public.agenda
  ADD COLUMN IF NOT EXISTS observacion_cancelacion text;

COMMENT ON COLUMN public.agenda.cancelada IS
  'true cuando la cita fue cancelada; no ocupa cupo y permanece en historial';

COMMENT ON COLUMN public.agenda.observacion_cancelacion IS
  'Motivo/observación al cancelar la cita';

CREATE INDEX IF NOT EXISTS idx_agenda_cancelada ON public.agenda (cancelada);
CREATE INDEX IF NOT EXISTS idx_agenda_profesional_fecha_activa
  ON public.agenda (id_profesional, fecha)
  WHERE (atendida IS NOT TRUE AND cancelada IS NOT TRUE);

-- Trigger de solape: canceladas no bloquean cupo
CREATE OR REPLACE FUNCTION public.agenda_impedir_solape()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  choque agenda%ROWTYPE;
BEGIN
  IF NEW.hora_inicio IS NULL OR NEW.hora_fin IS NULL THEN
    RAISE EXCEPTION 'Horario inválido';
  END IF;
  IF NEW.hora_fin <= NEW.hora_inicio THEN
    RAISE EXCEPTION 'La hora final debe ser posterior a la hora de inicio';
  END IF;

  -- Atendidas (Mascota lista) y canceladas no ocupan cupo
  IF NEW.atendida IS TRUE OR NEW.cancelada IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT * INTO choque
  FROM agenda a
  WHERE a.id_profesional = NEW.id_profesional
    AND a.fecha = NEW.fecha
    AND a.atendida IS NOT TRUE
    AND a.cancelada IS NOT TRUE
    AND (TG_OP = 'INSERT' OR a.id IS DISTINCT FROM NEW.id)
    AND public.agenda_franjas_se_solapan(
      NEW.hora_inicio, NEW.hora_fin,
      a.hora_inicio, a.hora_fin
    )
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Ya existe una cita que se solapa en ese horario';
  END IF;

  SELECT * INTO choque
  FROM agenda a
  WHERE a.id_mascota = NEW.id_mascota
    AND a.fecha = NEW.fecha
    AND a.atendida IS NOT TRUE
    AND a.cancelada IS NOT TRUE
    AND (TG_OP = 'INSERT' OR a.id IS DISTINCT FROM NEW.id)
    AND public.agenda_franjas_se_solapan(
      NEW.hora_inicio, NEW.hora_fin,
      a.hora_inicio, a.hora_fin
    )
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'La mascota ya tiene una cita que se solapa en ese horario';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agenda_impedir_solape ON public.agenda;
CREATE TRIGGER trg_agenda_impedir_solape
  BEFORE INSERT OR UPDATE OF fecha, hora_inicio, hora_fin, id_profesional, id_mascota, atendida, cancelada
  ON public.agenda
  FOR EACH ROW
  EXECUTE PROCEDURE public.agenda_impedir_solape();

-- EXCLUDE: solo citas activas (no atendidas ni canceladas)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agenda_no_solape_profesional'
  ) THEN
    ALTER TABLE public.agenda DROP CONSTRAINT agenda_no_solape_profesional;
  END IF;

  ALTER TABLE public.agenda
    ADD CONSTRAINT agenda_no_solape_profesional
    EXCLUDE USING gist (
      id_profesional WITH =,
      fecha WITH =,
      public.agenda_franja_tsrange(hora_inicio, hora_fin) WITH &&
    )
    WHERE (atendida IS NOT TRUE AND cancelada IS NOT TRUE);
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION
      'No se pudo recrear agenda_no_solape_profesional. Detalle: %',
      SQLERRM;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agenda_no_solape_mascota'
  ) THEN
    ALTER TABLE public.agenda DROP CONSTRAINT agenda_no_solape_mascota;
  END IF;

  ALTER TABLE public.agenda
    ADD CONSTRAINT agenda_no_solape_mascota
    EXCLUDE USING gist (
      id_mascota WITH =,
      fecha WITH =,
      public.agenda_franja_tsrange(hora_inicio, hora_fin) WITH &&
    )
    WHERE (atendida IS NOT TRUE AND cancelada IS NOT TRUE);
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION
      'No se pudo recrear agenda_no_solape_mascota. Detalle: %',
      SQLERRM;
END;
$$;

-- RPC cancelar agenda (auditoría; libera cupo)
CREATE OR REPLACE FUNCTION public.cancelar_agenda_atomico(
  p_id_agenda bigint,
  p_id_profesional bigint DEFAULT NULL,
  p_observacion_cancelacion text DEFAULT NULL
)
RETURNS public.agenda
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  a agenda%ROWTYPE;
  v_obs text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT * INTO a
  FROM agenda
  WHERE id = p_id_agenda
    AND user_id = auth.uid()
    AND (p_id_profesional IS NULL OR id_profesional = p_id_profesional)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agenda no encontrada';
  END IF;

  IF a.cancelada IS TRUE THEN
    RETURN a;
  END IF;

  IF a.cobrada IS TRUE THEN
    RAISE EXCEPTION
      'No se puede cancelar una cita cobrada. Anula el cobro en Cobros primero.';
  END IF;

  IF a.atendida IS TRUE THEN
    RAISE EXCEPTION 'No se puede cancelar una cita ya marcada como Mascota lista.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM cobro
    WHERE id_agenda = a.id
      AND estado IS DISTINCT FROM 'anulado'
  ) THEN
    RAISE EXCEPTION
      'No se puede cancelar la cita: tiene un cobro vigente. Anúlalo en Cobros primero.';
  END IF;

  v_obs := NULLIF(btrim(COALESCE(p_observacion_cancelacion, '')), '');

  UPDATE agenda
  SET
    cancelada = true,
    observacion_cancelacion = v_obs
  WHERE id = a.id
    AND user_id = auth.uid()
  RETURNING * INTO a;

  RETURN a;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancelar_agenda_atomico(bigint, bigint, text) TO authenticated;

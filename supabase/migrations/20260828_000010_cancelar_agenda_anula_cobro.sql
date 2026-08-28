-- Cancelar agenda: anula automáticamente cobros vigentes (pendiente/pagado) de la cita.

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

  IF a.atendida IS TRUE THEN
    RAISE EXCEPTION 'No se puede cancelar una cita ya marcada como Mascota lista.';
  END IF;

  UPDATE cobro
  SET estado = 'anulado'::public.cobro_estado
  WHERE id_agenda = a.id
    AND user_id = auth.uid()
    AND estado IS DISTINCT FROM 'anulado';

  v_obs := NULLIF(btrim(COALESCE(p_observacion_cancelacion, '')), '');

  UPDATE agenda
  SET
    cancelada = true,
    observacion_cancelacion = v_obs,
    cobrada = false
  WHERE id = a.id
    AND user_id = auth.uid()
  RETURNING * INTO a;

  RETURN a;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancelar_agenda_atomico(bigint, bigint, text) TO authenticated;

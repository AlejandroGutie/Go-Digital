-- =============================================================================
-- 20260827_000008_mascota_lista_independiente_pago.sql
-- Mascota lista independiente del estado de pago.
-- - Quita CHECK/trigger que exigían cobrada antes de atender.
-- - RPC marcar_agenda_atendida ya no exige cobrada.
-- La vista activa archiva solo cuando atendida=true Y cobro pagado (frontend/API).
-- Idempotente.
-- =============================================================================

ALTER TABLE public.agenda
  DROP CONSTRAINT IF EXISTS agenda_atendida_requiere_cobrada;

CREATE OR REPLACE FUNCTION public.agenda_proteger_integridad()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.cobrada IS TRUE THEN
    IF NEW.fecha IS DISTINCT FROM OLD.fecha
       OR NEW.hora_inicio IS DISTINCT FROM OLD.hora_inicio
       OR NEW.hora_fin IS DISTINCT FROM OLD.hora_fin
       OR NEW.id_profesional IS DISTINCT FROM OLD.id_profesional
       OR NEW.id_mascota IS DISTINCT FROM OLD.id_mascota
       OR NEW.id_tarifa IS DISTINCT FROM OLD.id_tarifa THEN
      RAISE EXCEPTION
        'No se puede modificar una cita cobrada. Anula el cobro en Cobros si necesitas corregirla.';
    END IF;
  END IF;

  -- Mascota lista ya no exige cobrada; archivar en UI requiere también cobro pagado.

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.marcar_agenda_atendida(
  p_id_agenda bigint,
  p_id_profesional bigint DEFAULT NULL
)
RETURNS public.agenda
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  a agenda%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF p_id_agenda IS NULL THEN
    RAISE EXCEPTION 'Agenda inválida';
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
    RAISE EXCEPTION 'No se puede marcar Mascota lista en una cita cancelada';
  END IF;
  IF a.atendida IS TRUE THEN
    RETURN a;
  END IF;

  UPDATE agenda
  SET atendida = true
  WHERE id = a.id
    AND user_id = auth.uid()
  RETURNING * INTO a;

  RETURN a;
END;
$$;

GRANT EXECUTE ON FUNCTION public.marcar_agenda_atendida(bigint, bigint) TO authenticated;

COMMENT ON FUNCTION public.marcar_agenda_atendida(bigint, bigint) IS
  'Marca Mascota lista (atendida=true). Independiente del estado de pago; la vista activa archiva solo si además el cobro está pagado.';

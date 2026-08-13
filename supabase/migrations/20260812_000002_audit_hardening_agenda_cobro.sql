-- =============================================================================
-- 20260812_000002_audit_hardening_agenda_cobro.sql
-- Hardening post-auditoría: solape vs atendidas, Mascota lista exige cobro,
-- anular reabre cita, crear+cobrar atómico, validaciones RPC alineadas al cliente.
-- Idempotente (CREATE OR REPLACE / DROP IF EXISTS).
-- =============================================================================

-- 1) Solape: solo citas NO atendidas ocupan el horario (tras Mascota lista se libera)
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

  -- Las atendidas (Mascota lista) no bloquean el cupo.
  IF NEW.atendida IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT * INTO choque
  FROM agenda a
  WHERE a.id_profesional = NEW.id_profesional
    AND a.fecha = NEW.fecha
    AND a.atendida IS NOT TRUE
    AND (TG_OP = 'INSERT' OR a.id IS DISTINCT FROM NEW.id)
    AND public.agenda_franjas_se_solapan(
      NEW.hora_inicio, NEW.hora_fin,
      a.hora_inicio, a.hora_fin
    )
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Ya existe una cita que se solapa en ese horario';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agenda_impedir_solape ON public.agenda;
CREATE TRIGGER trg_agenda_impedir_solape
  BEFORE INSERT OR UPDATE OF fecha, hora_inicio, hora_fin, id_profesional, atendida
  ON public.agenda
  FOR EACH ROW
  EXECUTE PROCEDURE public.agenda_impedir_solape();

-- 2) create_cobro_atomico: exige tarifa y método de pago (alineado al frontend)
CREATE OR REPLACE FUNCTION public.create_cobro_atomico(
  p_id_agenda bigint,
  p_id_profesional bigint,
  p_id_mascota bigint,
  p_id_tarifa bigint,
  p_valor numeric,
  p_metodo_pago text,
  p_observacion text,
  p_fecha_cobro date
)
RETURNS public.cobro
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  a agenda%ROWTYPE;
  nuevo cobro%ROWTYPE;
  v_metodo text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF p_id_agenda IS NULL OR p_id_profesional IS NULL OR p_id_mascota IS NULL THEN
    RAISE EXCEPTION 'Campos requeridos inválidos';
  END IF;
  IF p_id_tarifa IS NULL THEN
    RAISE EXCEPTION 'La tarifa es requerida';
  END IF;
  IF p_valor IS NULL OR p_valor < 0 THEN
    RAISE EXCEPTION 'Valor inválido';
  END IF;

  v_metodo := NULLIF(btrim(COALESCE(p_metodo_pago, '')), '');
  IF v_metodo IS NULL THEN
    RAISE EXCEPTION 'El método de pago es requerido';
  END IF;

  SELECT * INTO a
  FROM agenda
  WHERE id = p_id_agenda
    AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agenda no encontrada';
  END IF;
  IF a.cobrada IS TRUE THEN
    RAISE EXCEPTION 'La agenda ya fue cobrada';
  END IF;
  IF a.id_profesional IS DISTINCT FROM p_id_profesional THEN
    RAISE EXCEPTION 'El profesional no coincide con la agenda';
  END IF;
  IF a.id_mascota IS DISTINCT FROM p_id_mascota THEN
    RAISE EXCEPTION 'La mascota no coincide con la agenda';
  END IF;

  IF EXISTS (
    SELECT 1 FROM cobro
    WHERE id_agenda = p_id_agenda
      AND estado IS DISTINCT FROM 'anulado'
  ) THEN
    RAISE EXCEPTION 'Ya existe un cobro vigente para esta agenda';
  END IF;

  INSERT INTO cobro (
    id_agenda, id_profesional, id_mascota, id_tarifa,
    valor, metodo_pago, observacion, fecha_cobro
  ) VALUES (
    p_id_agenda, p_id_profesional, p_id_mascota, p_id_tarifa,
    p_valor, v_metodo,
    NULLIF(btrim(COALESCE(p_observacion, '')), ''),
    COALESCE(p_fecha_cobro, CURRENT_DATE)
  )
  RETURNING * INTO nuevo;

  UPDATE agenda
  SET cobrada = true
  WHERE id = p_id_agenda
    AND user_id = auth.uid();

  RETURN nuevo;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_cobro_atomico(
  bigint, bigint, bigint, bigint, numeric, text, text, date
) TO authenticated;

-- 3) Anular cobro: libera cobrada y reabre atendida si no queda vigente
--    (permite corregir errores operativos desde la agenda activa)
CREATE OR REPLACE FUNCTION public.anular_cobro_atomico(p_id_cobro bigint)
RETURNS public.cobro
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  c cobro%ROWTYPE;
  vigentes integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT * INTO c
  FROM cobro
  WHERE id = p_id_cobro
    AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobro no encontrado';
  END IF;
  IF c.estado = 'anulado' THEN
    RETURN c;
  END IF;

  UPDATE cobro SET estado = 'anulado' WHERE id = p_id_cobro
  RETURNING * INTO c;

  SELECT COUNT(*) INTO vigentes
  FROM cobro
  WHERE id_agenda = c.id_agenda
    AND estado IS DISTINCT FROM 'anulado';

  IF vigentes = 0 AND c.id_agenda IS NOT NULL THEN
    UPDATE agenda
    SET cobrada = false,
        atendida = false
    WHERE id = c.id_agenda
      AND user_id = auth.uid();
  END IF;

  RETURN c;
END;
$$;

GRANT EXECUTE ON FUNCTION public.anular_cobro_atomico(bigint) TO authenticated;

-- 4) Crear cita + cobro en una sola transacción
CREATE OR REPLACE FUNCTION public.crear_cita_y_cobrar_atomico(
  p_id_profesional bigint,
  p_id_mascota bigint,
  p_id_tarifa bigint,
  p_fecha date,
  p_hora_inicio time,
  p_hora_fin time,
  p_valor numeric,
  p_metodo_pago text,
  p_observacion text,
  p_fecha_cobro date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_metodo text;
  nueva agenda%ROWTYPE;
  nuevo_cobro cobro%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF p_id_profesional IS NULL OR p_id_mascota IS NULL OR p_id_tarifa IS NULL
     OR p_fecha IS NULL OR p_hora_inicio IS NULL OR p_hora_fin IS NULL THEN
    RAISE EXCEPTION 'Campos requeridos inválidos';
  END IF;
  IF p_hora_fin <= p_hora_inicio THEN
    RAISE EXCEPTION 'La hora final debe ser posterior a la hora de inicio';
  END IF;
  IF p_valor IS NULL OR p_valor < 0 THEN
    RAISE EXCEPTION 'El valor del cobro es inválido';
  END IF;

  v_metodo := NULLIF(btrim(COALESCE(p_metodo_pago, '')), '');
  IF v_metodo IS NULL THEN
    RAISE EXCEPTION 'El método de pago es requerido';
  END IF;

  -- Validar que profesional y mascota pertenezcan al tenant
  IF NOT EXISTS (
    SELECT 1 FROM profesional
    WHERE id = p_id_profesional AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Profesional no encontrado';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM mascota
    WHERE id = p_id_mascota AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Mascota no encontrada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM tarifa
    WHERE id = p_id_tarifa
      AND id_profesional = p_id_profesional
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Tarifa inválida para el profesional';
  END IF;

  INSERT INTO agenda (
    id_profesional, id_mascota, id_tarifa,
    fecha, hora_inicio, hora_fin
  ) VALUES (
    p_id_profesional, p_id_mascota, p_id_tarifa,
    p_fecha, p_hora_inicio, p_hora_fin
  )
  RETURNING * INTO nueva;

  -- Reutiliza la misma lógica de cobro (marca cobrada)
  nuevo_cobro := public.create_cobro_atomico(
    nueva.id,
    p_id_profesional,
    p_id_mascota,
    p_id_tarifa,
    p_valor,
    v_metodo,
    p_observacion,
    COALESCE(p_fecha_cobro, p_fecha)
  );

  RETURN jsonb_build_object(
    'agenda', to_jsonb(nueva),
    'cobro', to_jsonb(nuevo_cobro)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_cita_y_cobrar_atomico(
  bigint, bigint, bigint, date, time, time, numeric, text, text, date
) TO authenticated;

COMMENT ON FUNCTION public.crear_cita_y_cobrar_atomico IS
  'Crea agenda + cobro en una transacción; el trigger de solape aplica sobre no-atendidas.';

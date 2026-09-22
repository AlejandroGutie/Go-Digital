-- =============================================================================
-- 20260921_000001_reprogramar_agenda_atomico.sql
-- Reprogramar cita + sync tarifas en una sola transacción (evita desalineación
-- agenda vs agenda_tarifa si falla el sync tras el UPDATE).
-- Idempotente.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reprogramar_agenda_atomico(
  p_id_agenda bigint,
  p_id_profesional bigint,
  p_id_mascota bigint,
  p_id_tarifas bigint[],
  p_fecha date,
  p_hora_inicio time,
  p_hora_fin time,
  p_observacion_ingreso text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  a agenda%ROWTYPE;
  v_ids bigint[];
  v_first bigint;
  v_cobro_estado public.cobro_estado;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF p_id_agenda IS NULL OR p_id_profesional IS NULL OR p_id_mascota IS NULL
     OR p_fecha IS NULL OR p_hora_inicio IS NULL OR p_hora_fin IS NULL THEN
    RAISE EXCEPTION 'Campos requeridos inválidos';
  END IF;

  IF p_hora_fin <= p_hora_inicio THEN
    RAISE EXCEPTION 'La hora final debe ser posterior a la hora de inicio';
  END IF;

  v_ids := public.normalize_id_tarifas(p_id_tarifas);
  IF cardinality(v_ids) IS NULL OR cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'Selecciona al menos una tarifa';
  END IF;
  v_first := v_ids[1];

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

  IF (
    SELECT COUNT(*) FROM tarifa
    WHERE id = ANY (v_ids)
      AND id_profesional = p_id_profesional
      AND user_id = auth.uid()
  ) <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'Tarifa inválida para el profesional';
  END IF;

  SELECT * INTO a
  FROM agenda
  WHERE id = p_id_agenda
    AND id_profesional = p_id_profesional
    AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cita no encontrada';
  END IF;

  IF a.cancelada IS TRUE THEN
    RAISE EXCEPTION 'No se puede modificar una cita cancelada.';
  END IF;

  IF a.atendida IS TRUE THEN
    RAISE EXCEPTION 'No se puede modificar una cita ya marcada como Mascota lista.';
  END IF;

  SELECT c.estado INTO v_cobro_estado
  FROM cobro c
  WHERE c.id_agenda = a.id
    AND c.user_id = auth.uid()
    AND c.estado IS DISTINCT FROM 'anulado'::public.cobro_estado
  ORDER BY c.id DESC
  LIMIT 1;

  IF v_cobro_estado = 'pagado'::public.cobro_estado THEN
    RAISE EXCEPTION
      'No se puede reprogramar una cita con cobro pagado. Devuelve el pago o anula el cobro en Cobros primero.';
  END IF;

  IF a.cobrada IS TRUE AND v_cobro_estado IS DISTINCT FROM 'pendiente'::public.cobro_estado THEN
    RAISE EXCEPTION
      'No se puede modificar una cita cobrada. Anula el cobro en Cobros si necesitas corregirla.';
  END IF;

  UPDATE agenda
  SET
    id_mascota = p_id_mascota,
    id_tarifa = v_first,
    fecha = p_fecha,
    hora_inicio = p_hora_inicio,
    hora_fin = p_hora_fin,
    observacion_ingreso = NULLIF(btrim(COALESCE(p_observacion_ingreso, '')), '')
  WHERE id = a.id
    AND user_id = auth.uid()
  RETURNING * INTO a;

  PERFORM public.sync_agenda_tarifas(a.id, v_ids);

  SELECT * INTO a FROM agenda WHERE id = a.id AND user_id = auth.uid();

  RETURN jsonb_build_object(
    'agenda', to_jsonb(a),
    'id_tarifas', to_jsonb(v_ids)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reprogramar_agenda_atomico(
  bigint, bigint, bigint, bigint[], date, time, time, text
) TO authenticated;

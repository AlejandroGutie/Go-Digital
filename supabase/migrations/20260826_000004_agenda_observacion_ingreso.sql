-- =============================================================================
-- 20260826_000004_agenda_observacion_ingreso.sql
-- Columna agenda.observacion_ingreso (notas al ingresar la mascota; ≠ de cobro).
-- Actualiza crear_cita_y_cobrar_atomico con p_observacion_ingreso opcional.
-- Idempotente.
-- =============================================================================

ALTER TABLE public.agenda
  ADD COLUMN IF NOT EXISTS observacion_ingreso TEXT NULL;

COMMENT ON COLUMN public.agenda.observacion_ingreso IS
  'Notas/observaciones al momento de ingresar la mascota a la cita (no es la observación del cobro).';

-- Recrear RPC multi-tarifa + wrapper legacy con p_observacion_ingreso
DROP FUNCTION IF EXISTS public.crear_cita_y_cobrar_atomico(
  bigint, bigint, bigint[], date, time, time, numeric, text, text, date
);
DROP FUNCTION IF EXISTS public.crear_cita_y_cobrar_atomico(
  bigint, bigint, bigint[], date, time, time, numeric, text, text, date, text
);
DROP FUNCTION IF EXISTS public.crear_cita_y_cobrar_atomico(
  bigint, bigint, bigint, date, time, time, numeric, text, text, date
);
DROP FUNCTION IF EXISTS public.crear_cita_y_cobrar_atomico(
  bigint, bigint, bigint, date, time, time, numeric, text, text, date, text
);

CREATE OR REPLACE FUNCTION public.crear_cita_y_cobrar_atomico(
  p_id_profesional bigint,
  p_id_mascota bigint,
  p_id_tarifas bigint[],
  p_fecha date,
  p_hora_inicio time,
  p_hora_fin time,
  p_valor numeric,
  p_metodo_pago text,
  p_observacion text,
  p_fecha_cobro date DEFAULT NULL,
  p_observacion_ingreso text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_metodo text;
  v_ids bigint[];
  v_first bigint;
  nueva agenda%ROWTYPE;
  nuevo_cobro cobro%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF p_id_profesional IS NULL OR p_id_mascota IS NULL
     OR p_fecha IS NULL OR p_hora_inicio IS NULL OR p_hora_fin IS NULL THEN
    RAISE EXCEPTION 'Campos requeridos inválidos';
  END IF;
  IF p_hora_fin <= p_hora_inicio THEN
    RAISE EXCEPTION 'La hora final debe ser posterior a la hora de inicio';
  END IF;
  IF p_valor IS NULL OR p_valor < 0 THEN
    RAISE EXCEPTION 'El valor del cobro es inválido';
  END IF;

  v_ids := public.normalize_id_tarifas(p_id_tarifas);
  IF cardinality(v_ids) IS NULL OR cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'Campos requeridos inválidos';
  END IF;
  v_first := v_ids[1];

  v_metodo := NULLIF(btrim(COALESCE(p_metodo_pago, '')), '');
  IF v_metodo IS NULL THEN
    RAISE EXCEPTION 'El método de pago es requerido';
  END IF;

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

  INSERT INTO agenda (
    id_profesional, id_mascota, id_tarifa,
    fecha, hora_inicio, hora_fin, observacion_ingreso
  ) VALUES (
    p_id_profesional, p_id_mascota, v_first,
    p_fecha, p_hora_inicio, p_hora_fin,
    NULLIF(btrim(COALESCE(p_observacion_ingreso, '')), '')
  )
  RETURNING * INTO nueva;

  PERFORM public.sync_agenda_tarifas(nueva.id, v_ids);

  nuevo_cobro := public.create_cobro_atomico(
    nueva.id,
    p_id_profesional,
    p_id_mascota,
    v_ids,
    p_valor,
    v_metodo,
    p_observacion,
    COALESCE(p_fecha_cobro, p_fecha)
  );

  SELECT * INTO nueva FROM agenda WHERE id = nueva.id;

  RETURN jsonb_build_object(
    'agenda', to_jsonb(nueva),
    'cobro', to_jsonb(nuevo_cobro)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_cita_y_cobrar_atomico(
  bigint, bigint, bigint[], date, time, time, numeric, text, text, date, text
) TO authenticated;

-- Wrapper legacy: una sola tarifa → array (sin exigir observacion_ingreso)
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
  p_fecha_cobro date DEFAULT NULL,
  p_observacion_ingreso text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN public.crear_cita_y_cobrar_atomico(
    p_id_profesional,
    p_id_mascota,
    ARRAY[p_id_tarifa]::bigint[],
    p_fecha,
    p_hora_inicio,
    p_hora_fin,
    p_valor,
    p_metodo_pago,
    p_observacion,
    p_fecha_cobro,
    p_observacion_ingreso
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_cita_y_cobrar_atomico(
  bigint, bigint, bigint, date, time, time, numeric, text, text, date, text
) TO authenticated;

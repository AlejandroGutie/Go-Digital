-- Fix: cast estado a enum cobro_estado (error "expression is of type text")
CREATE OR REPLACE FUNCTION public.create_cobro_atomico(
  p_id_agenda bigint,
  p_id_profesional bigint,
  p_id_mascota bigint,
  p_id_tarifas bigint[],
  p_valor numeric,
  p_metodo_pago text,
  p_observacion text,
  p_fecha_cobro date,
  p_estado text DEFAULT 'pagado'
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
  v_estado public.cobro_estado;
  v_ids bigint[];
  v_first bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  IF p_id_agenda IS NULL OR p_id_profesional IS NULL OR p_id_mascota IS NULL THEN
    RAISE EXCEPTION 'Campos requeridos inválidos';
  END IF;
  IF p_valor IS NULL OR p_valor < 0 THEN
    RAISE EXCEPTION 'Valor inválido';
  END IF;

  IF p_estado IS NULL OR btrim(COALESCE(p_estado, '')) = '' THEN
    v_estado := 'pagado';
  ELSIF lower(btrim(p_estado)) = 'pendiente' THEN
    v_estado := 'pendiente';
  ELSIF lower(btrim(p_estado)) = 'pagado' THEN
    v_estado := 'pagado';
  ELSE
    RAISE EXCEPTION 'Estado de cobro inválido al crear (use pagado o pendiente)';
  END IF;

  v_ids := public.normalize_id_tarifas(p_id_tarifas);
  IF cardinality(v_ids) IS NULL OR cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'La tarifa es requerida';
  END IF;
  v_first := v_ids[1];

  v_metodo := NULLIF(btrim(COALESCE(p_metodo_pago, '')), '');
  IF v_metodo IS NULL THEN
    RAISE EXCEPTION 'El método de pago es requerido';
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
    valor, metodo_pago, observacion, fecha_cobro, estado
  ) VALUES (
    p_id_agenda, p_id_profesional, p_id_mascota, v_first,
    p_valor, v_metodo,
    NULLIF(btrim(COALESCE(p_observacion, '')), ''),
    COALESCE(p_fecha_cobro, CURRENT_DATE),
    v_estado
  )
  RETURNING * INTO nuevo;

  PERFORM public.insert_cobro_detalles(nuevo.id, p_id_profesional, v_ids);
  PERFORM public.sync_agenda_tarifas(p_id_agenda, v_ids);

  UPDATE agenda
  SET cobrada = true
  WHERE id = p_id_agenda
    AND user_id = auth.uid();

  RETURN nuevo;
END;
$$;

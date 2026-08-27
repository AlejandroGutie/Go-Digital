-- Actualizar cobro en estado pendiente (valor, método, observación, fecha, tarifas)
CREATE OR REPLACE FUNCTION public.actualizar_cobro_pendiente(
  p_id_cobro bigint,
  p_valor numeric,
  p_metodo_pago text,
  p_observacion text,
  p_fecha_cobro date,
  p_id_tarifas bigint[] DEFAULT NULL
)
RETURNS public.cobro
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  c cobro%ROWTYPE;
  v_metodo text;
  v_ids bigint[];
  v_first bigint;
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

  IF c.estado IS DISTINCT FROM 'pendiente' THEN
    RAISE EXCEPTION 'Solo se pueden editar cobros pendientes';
  END IF;

  IF p_valor IS NULL OR p_valor < 0 THEN
    RAISE EXCEPTION 'Valor inválido';
  END IF;

  v_metodo := NULLIF(btrim(COALESCE(p_metodo_pago, '')), '');
  IF v_metodo IS NULL THEN
    RAISE EXCEPTION 'El método de pago es requerido';
  END IF;

  IF p_id_tarifas IS NOT NULL THEN
    v_ids := public.normalize_id_tarifas(p_id_tarifas);
    IF cardinality(v_ids) IS NULL OR cardinality(v_ids) = 0 THEN
      RAISE EXCEPTION 'Se requiere al menos una tarifa';
    END IF;
    v_first := v_ids[1];

    DELETE FROM cobro_detalle
    WHERE id_cobro = p_id_cobro
      AND user_id = auth.uid();

    PERFORM public.insert_cobro_detalles(p_id_cobro, c.id_profesional, v_ids);

    UPDATE cobro
    SET
      valor = p_valor,
      metodo_pago = v_metodo,
      observacion = NULLIF(btrim(COALESCE(p_observacion, '')), ''),
      fecha_cobro = COALESCE(p_fecha_cobro, c.fecha_cobro),
      id_tarifa = v_first
    WHERE id = p_id_cobro
    RETURNING * INTO c;
  ELSE
    UPDATE cobro
    SET
      valor = p_valor,
      metodo_pago = v_metodo,
      observacion = NULLIF(btrim(COALESCE(p_observacion, '')), ''),
      fecha_cobro = COALESCE(p_fecha_cobro, c.fecha_cobro)
    WHERE id = p_id_cobro
    RETURNING * INTO c;
  END IF;

  RETURN c;
END;
$$;

GRANT EXECUTE ON FUNCTION public.actualizar_cobro_pendiente(
  bigint, numeric, text, text, date, bigint[]
) TO authenticated;

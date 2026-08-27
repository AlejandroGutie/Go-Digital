-- Restaurar cobro anulado → pendiente (auditoría: sin DELETE físico)
CREATE OR REPLACE FUNCTION public.restaurar_cobro_atomico(p_id_cobro bigint)
RETURNS public.cobro
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  c cobro%ROWTYPE;
  a agenda%ROWTYPE;
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

  IF c.estado IS DISTINCT FROM 'anulado' THEN
    RAISE EXCEPTION 'Solo se pueden restaurar cobros anulados';
  END IF;

  IF EXISTS (
    SELECT 1 FROM cobro
    WHERE id_agenda = c.id_agenda
      AND id IS DISTINCT FROM c.id
      AND estado IS DISTINCT FROM 'anulado'
  ) THEN
    RAISE EXCEPTION 'Ya existe un cobro vigente para esta agenda; no se puede restaurar';
  END IF;

  IF c.id_agenda IS NOT NULL THEN
    SELECT * INTO a
    FROM agenda
    WHERE id = c.id_agenda
      AND user_id = auth.uid()
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Agenda asociada no encontrada';
    END IF;

    IF a.cobrada IS TRUE THEN
      RAISE EXCEPTION 'La agenda ya tiene un cobro activo; no se puede restaurar';
    END IF;
  END IF;

  UPDATE cobro
  SET estado = 'pendiente'::public.cobro_estado
  WHERE id = p_id_cobro
  RETURNING * INTO c;

  IF c.id_agenda IS NOT NULL THEN
    UPDATE agenda
    SET cobrada = true
    WHERE id = c.id_agenda
      AND user_id = auth.uid();
  END IF;

  RETURN c;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restaurar_cobro_atomico(bigint) TO authenticated;

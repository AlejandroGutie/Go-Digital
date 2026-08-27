-- Devolver pago: pagado → pendiente (y permitir restaurar anulado → pendiente)
-- Ajusta el trigger de protección que bloqueaba ambas transiciones.

CREATE OR REPLACE FUNCTION public.cobro_proteger_estado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Solo se puede reactivar un anulado hacia pendiente (RPC restaurar_cobro_atomico)
  IF OLD.estado = 'anulado' AND NEW.estado IS DISTINCT FROM 'anulado' THEN
    IF NEW.estado IS DISTINCT FROM 'pendiente' THEN
      RAISE EXCEPTION
        'Un cobro anulado solo puede restaurarse a pendiente.';
    END IF;
  END IF;

  -- Devolver pago: pagado → pendiente (solo cambio de estado)
  -- (antes se bloqueaba; ahora está permitido)

  IF OLD.estado IN ('pagado', 'anulado') THEN
    IF NEW.id_agenda IS DISTINCT FROM OLD.id_agenda
       OR NEW.id_profesional IS DISTINCT FROM OLD.id_profesional
       OR NEW.id_mascota IS DISTINCT FROM OLD.id_mascota
       OR NEW.id_tarifa IS DISTINCT FROM OLD.id_tarifa
       OR NEW.valor IS DISTINCT FROM OLD.valor
       OR NEW.fecha_cobro IS DISTINCT FROM OLD.fecha_cobro THEN
      RAISE EXCEPTION 'No se pueden modificar los datos financieros de un cobro pagado o anulado';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.devolver_pago_cobro(p_id_cobro bigint)
RETURNS public.cobro
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  c cobro%ROWTYPE;
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

  IF c.estado IS DISTINCT FROM 'pagado' THEN
    RAISE EXCEPTION 'Solo se puede devolver el pago de un cobro pagado';
  END IF;

  UPDATE cobro
  SET estado = 'pendiente'::public.cobro_estado
  WHERE id = p_id_cobro
  RETURNING * INTO c;

  -- La agenda permanece cobrada=true: el cobro sigue vigente (pendiente)
  RETURN c;
END;
$$;

GRANT EXECUTE ON FUNCTION public.devolver_pago_cobro(bigint) TO authenticated;

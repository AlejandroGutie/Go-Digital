-- =============================================================================
-- 20260813_000001_audit_remediation_ciclo_cita.sql
-- Remediation post-auditoría ciclo Agenda / Cobro / Mascota lista.
-- Cubre: CHECK atendida⇒cobrada, inmutabilidad si cobrada, EXCLUDE solape,
-- anular sin choque de cupo, cobro nace pagado + tarifa del profesional,
-- RPC marcar_agenda_atendida, congelar cobro pagado, solape por mascota.
-- Idempotente.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------
-- 1) Integridad: no atender sin cobro
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agenda_atendida_requiere_cobrada'
      AND conrelid = 'public.agenda'::regclass
  ) THEN
    -- Sanea filas inválidas antes del CHECK (no deberían existir)
    UPDATE public.agenda
    SET atendida = false
    WHERE atendida IS TRUE AND cobrada IS NOT TRUE;

    ALTER TABLE public.agenda
      ADD CONSTRAINT agenda_atendida_requiere_cobrada
      CHECK (atendida IS NOT TRUE OR cobrada IS TRUE);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Proteger cita cobrada + exigir cobrada para atender (capa trigger)
-- ---------------------------------------------------------------------------
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

  IF NEW.atendida IS TRUE AND NEW.cobrada IS NOT TRUE THEN
    RAISE EXCEPTION 'Debes registrar el cobro antes de marcar Mascota lista.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agenda_proteger_integridad ON public.agenda;
CREATE TRIGGER trg_agenda_proteger_integridad
  BEFORE INSERT OR UPDATE ON public.agenda
  FOR EACH ROW
  EXECUTE PROCEDURE public.agenda_proteger_integridad();

-- ---------------------------------------------------------------------------
-- 3) Solape concurrente: EXCLUDE gist (profesional + fecha + franja)
--    Las atendidas no ocupan cupo (WHERE parcial).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agenda_franja_tsrange(p_inicio time, p_fin time)
RETURNS tsrange
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT tsrange(
    ('2000-01-01'::date + p_inicio),
    ('2000-01-01'::date + p_fin),
    '[)'
  );
$$;

-- Sanea solapes activos: conserva la cita de mayor id.
-- Perdedora cobrada (o con cobro) → Mascota lista (atendida).
-- Perdedora sin cobro → DELETE (no hay historial financiero; FK RESTRICT si hay cobro).
CREATE OR REPLACE FUNCTION public.agenda_sanear_solapes_activos()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  i integer;
  quedan boolean;
BEGIN
  FOR i IN 1..80 LOOP
    -- Profesional: archivar perdedoras que se puedan marcar atendida
    UPDATE agenda a
    SET cobrada = true,
        atendida = true
    WHERE a.atendida IS NOT TRUE
      AND (
        a.cobrada IS TRUE
        OR EXISTS (
          SELECT 1 FROM cobro c
          WHERE c.id_agenda = a.id
        )
      )
      AND EXISTS (
        SELECT 1
        FROM agenda b
        WHERE b.id > a.id
          AND b.id_profesional = a.id_profesional
          AND b.fecha = a.fecha
          AND b.atendida IS NOT TRUE
          AND public.agenda_franjas_se_solapan(
            a.hora_inicio, a.hora_fin, b.hora_inicio, b.hora_fin
          )
      );

    DELETE FROM agenda a
    WHERE a.atendida IS NOT TRUE
      AND a.cobrada IS NOT TRUE
      AND NOT EXISTS (SELECT 1 FROM cobro c WHERE c.id_agenda = a.id)
      AND EXISTS (
        SELECT 1
        FROM agenda b
        WHERE b.id > a.id
          AND b.id_profesional = a.id_profesional
          AND b.fecha = a.fecha
          AND b.atendida IS NOT TRUE
          AND public.agenda_franjas_se_solapan(
            a.hora_inicio, a.hora_fin, b.hora_inicio, b.hora_fin
          )
      );

    -- Mascota: mismo criterio (distinto profesional, misma franja)
    UPDATE agenda a
    SET cobrada = true,
        atendida = true
    WHERE a.atendida IS NOT TRUE
      AND (
        a.cobrada IS TRUE
        OR EXISTS (
          SELECT 1 FROM cobro c
          WHERE c.id_agenda = a.id
        )
      )
      AND EXISTS (
        SELECT 1
        FROM agenda b
        WHERE b.id > a.id
          AND b.id_mascota = a.id_mascota
          AND b.fecha = a.fecha
          AND b.atendida IS NOT TRUE
          AND public.agenda_franjas_se_solapan(
            a.hora_inicio, a.hora_fin, b.hora_inicio, b.hora_fin
          )
      );

    DELETE FROM agenda a
    WHERE a.atendida IS NOT TRUE
      AND a.cobrada IS NOT TRUE
      AND NOT EXISTS (SELECT 1 FROM cobro c WHERE c.id_agenda = a.id)
      AND EXISTS (
        SELECT 1
        FROM agenda b
        WHERE b.id > a.id
          AND b.id_mascota = a.id_mascota
          AND b.fecha = a.fecha
          AND b.atendida IS NOT TRUE
          AND public.agenda_franjas_se_solapan(
            a.hora_inicio, a.hora_fin, b.hora_inicio, b.hora_fin
          )
      );

    SELECT EXISTS (
      SELECT 1
      FROM agenda a
      JOIN agenda b
        ON b.id > a.id
       AND b.fecha = a.fecha
       AND a.atendida IS NOT TRUE
       AND b.atendida IS NOT TRUE
       AND public.agenda_franjas_se_solapan(
         a.hora_inicio, a.hora_fin, b.hora_inicio, b.hora_fin
       )
       AND (
         a.id_profesional = b.id_profesional
         OR a.id_mascota = b.id_mascota
       )
    ) INTO quedan;

    EXIT WHEN NOT quedan;
  END LOOP;
END;
$$;

DO $$
BEGIN
  -- Evita que el trigger de integridad bloquee el saneo masivo
  ALTER TABLE public.agenda DISABLE TRIGGER trg_agenda_proteger_integridad;
  BEGIN
    ALTER TABLE public.agenda DISABLE TRIGGER trg_agenda_impedir_solape;
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;

  PERFORM public.agenda_sanear_solapes_activos();

  ALTER TABLE public.agenda ENABLE TRIGGER trg_agenda_proteger_integridad;
  BEGIN
    ALTER TABLE public.agenda ENABLE TRIGGER trg_agenda_impedir_solape;
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
EXCEPTION WHEN OTHERS THEN
  ALTER TABLE public.agenda ENABLE TRIGGER trg_agenda_proteger_integridad;
  BEGIN
    ALTER TABLE public.agenda ENABLE TRIGGER trg_agenda_impedir_solape;
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
  RAISE;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agenda_no_solape_profesional'
      AND conrelid = 'public.agenda'::regclass
  ) THEN
    BEGIN
      ALTER TABLE public.agenda
        ADD CONSTRAINT agenda_no_solape_profesional
        EXCLUDE USING gist (
          id_profesional WITH =,
          fecha WITH =,
          public.agenda_franja_tsrange(hora_inicio, hora_fin) WITH &&
        )
        WHERE (atendida IS NOT TRUE);
    EXCEPTION WHEN exclusion_violation OR unique_violation OR OTHERS THEN
      RAISE EXCEPTION
        'No se pudo crear agenda_no_solape_profesional tras el saneo automático. Detalle: %',
        SQLERRM;
    END;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agenda_no_solape_mascota'
      AND conrelid = 'public.agenda'::regclass
  ) THEN
    BEGIN
      ALTER TABLE public.agenda
        ADD CONSTRAINT agenda_no_solape_mascota
        EXCLUDE USING gist (
          id_mascota WITH =,
          fecha WITH =,
          public.agenda_franja_tsrange(hora_inicio, hora_fin) WITH &&
        )
        WHERE (atendida IS NOT TRUE);
    EXCEPTION WHEN exclusion_violation OR unique_violation OR OTHERS THEN
      RAISE EXCEPTION
        'No se pudo crear agenda_no_solape_mascota tras el saneo automático. Detalle: %',
        SQLERRM;
    END;
  END IF;
END $$;

-- Trigger de solape: mantiene mensajes claros + chequeo mascota
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

  SELECT * INTO choque
  FROM agenda a
  WHERE a.id_mascota = NEW.id_mascota
    AND a.fecha = NEW.fecha
    AND a.atendida IS NOT TRUE
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
  BEFORE INSERT OR UPDATE OF fecha, hora_inicio, hora_fin, id_profesional, id_mascota, atendida
  ON public.agenda
  FOR EACH ROW
  EXECUTE PROCEDURE public.agenda_impedir_solape();

-- ---------------------------------------------------------------------------
-- 4) create_cobro_atomico: tarifa del profesional + estado=pagado
-- ---------------------------------------------------------------------------
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

  IF NOT EXISTS (
    SELECT 1 FROM tarifa
    WHERE id = p_id_tarifa
      AND id_profesional = p_id_profesional
      AND user_id = auth.uid()
  ) THEN
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
    p_id_agenda, p_id_profesional, p_id_mascota, p_id_tarifa,
    p_valor, v_metodo,
    NULLIF(btrim(COALESCE(p_observacion, '')), ''),
    COALESCE(p_fecha_cobro, CURRENT_DATE),
    'pagado'
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

-- ---------------------------------------------------------------------------
-- 5) Anular: libera cobrada; solo reabre atendida si no hay choque de cupo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.anular_cobro_atomico(p_id_cobro bigint)
RETURNS public.cobro
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  c cobro%ROWTYPE;
  vigentes integer;
  a agenda%ROWTYPE;
  hay_choque boolean;
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
    SELECT * INTO a
    FROM agenda
    WHERE id = c.id_agenda
      AND user_id = auth.uid()
    FOR UPDATE;

    IF FOUND THEN
      hay_choque := FALSE;
      IF a.atendida IS TRUE THEN
        SELECT EXISTS (
          SELECT 1
          FROM agenda o
          WHERE o.id_profesional = a.id_profesional
            AND o.fecha = a.fecha
            AND o.atendida IS NOT TRUE
            AND o.id IS DISTINCT FROM a.id
            AND public.agenda_franjas_se_solapan(
              a.hora_inicio, a.hora_fin, o.hora_inicio, o.hora_fin
            )
        ) INTO hay_choque;
      END IF;

      IF hay_choque THEN
        -- Cupo ya reutilizado: libera cobro, mantiene archivada (atendida)
        UPDATE agenda
        SET cobrada = false
        WHERE id = a.id
          AND user_id = auth.uid();
      ELSE
        UPDATE agenda
        SET cobrada = false,
            atendida = false
        WHERE id = a.id
          AND user_id = auth.uid();
      END IF;
    END IF;
  END IF;

  RETURN c;
END;
$$;

GRANT EXECUTE ON FUNCTION public.anular_cobro_atomico(bigint) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Mascota lista atómica
-- ---------------------------------------------------------------------------
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
  IF a.atendida IS TRUE THEN
    RETURN a;
  END IF;
  IF a.cobrada IS NOT TRUE THEN
    RAISE EXCEPTION 'Debes registrar el cobro antes de marcar Mascota lista.';
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

-- ---------------------------------------------------------------------------
-- 7) Crear cita + cobro: re-lee agenda tras cobrar (cobrada=true en respuesta)
-- ---------------------------------------------------------------------------
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

  SELECT * INTO nueva FROM agenda WHERE id = nueva.id;

  RETURN jsonb_build_object(
    'agenda', to_jsonb(nueva),
    'cobro', to_jsonb(nuevo_cobro)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_cita_y_cobrar_atomico(
  bigint, bigint, bigint, date, time, time, numeric, text, text, date
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8) Congelar cobro pagado (FKs + valor); no reactivar anulado por UPDATE directo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cobro_proteger_estado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.estado = 'anulado' AND NEW.estado IS DISTINCT FROM 'anulado' THEN
    RAISE EXCEPTION
      'No se puede reactivar un cobro anulado. Registra un nuevo cobro si la cita está libre.';
  END IF;

  IF OLD.estado = 'pagado' AND NEW.estado = 'pendiente' THEN
    RAISE EXCEPTION 'Un cobro pagado no puede volver a pendiente';
  END IF;

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

DROP TRIGGER IF EXISTS trg_cobro_proteger_estado ON public.cobro;
CREATE TRIGGER trg_cobro_proteger_estado
  BEFORE UPDATE ON public.cobro
  FOR EACH ROW
  EXECUTE PROCEDURE public.cobro_proteger_estado();

COMMENT ON FUNCTION public.marcar_agenda_atendida IS
  'Marca Mascota lista (atendida=true) con lock; exige cobrada=true.';
COMMENT ON CONSTRAINT agenda_no_solape_profesional ON public.agenda IS
  'Impide solapes concurrentes del mismo profesional en franjas activas.';
COMMENT ON CONSTRAINT agenda_no_solape_mascota ON public.agenda IS
  'Impide que la misma mascota tenga citas activas solapadas.';

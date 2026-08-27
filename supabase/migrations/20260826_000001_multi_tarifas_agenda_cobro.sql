-- =============================================================================
-- 20260826_000001_multi_tarifas_agenda_cobro.sql
-- Multi-tarifa: agenda_tarifa (N:M) + cobro_detalle + RPCs con p_id_tarifas[].
-- Compatibilidad: agenda.id_tarifa / cobro.id_tarifa = primera tarifa (legacy).
-- Idempotente.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Tablas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agenda_tarifa (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  id_agenda  BIGINT NOT NULL REFERENCES public.agenda(id) ON DELETE CASCADE,
  id_tarifa  BIGINT NOT NULL REFERENCES public.tarifa(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id_agenda, id_tarifa)
);

CREATE INDEX IF NOT EXISTS idx_agenda_tarifa_agenda ON public.agenda_tarifa (id_agenda);
CREATE INDEX IF NOT EXISTS idx_agenda_tarifa_tarifa ON public.agenda_tarifa (id_tarifa);
CREATE INDEX IF NOT EXISTS idx_agenda_tarifa_user ON public.agenda_tarifa (user_id);

CREATE TABLE IF NOT EXISTS public.cobro_detalle (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  id_cobro    BIGINT NOT NULL REFERENCES public.cobro(id) ON DELETE CASCADE,
  id_tarifa   BIGINT NULL REFERENCES public.tarifa(id) ON DELETE SET NULL,
  descripcion TEXT NOT NULL,
  valor       NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cobro_detalle_cobro ON public.cobro_detalle (id_cobro);
CREATE INDEX IF NOT EXISTS idx_cobro_detalle_user ON public.cobro_detalle (user_id);

COMMENT ON TABLE public.agenda_tarifa IS
  'Tarifas asociadas a una cita (N tarifas por agenda).';
COMMENT ON TABLE public.cobro_detalle IS
  'Desglose de tarifas/items de un cobro; el total vive en cobro.valor.';

-- Privilegios de tabla/secuencia (nuevas tablas no heredan siempre DEFAULT PRIVILEGES)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_tarifa TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cobro_detalle TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.agenda_tarifa_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.cobro_detalle_id_seq TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) RLS (antes del backfill; el rol postgres/supabase_admin bypasea RLS)
-- ---------------------------------------------------------------------------
ALTER TABLE public.agenda_tarifa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobro_detalle ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agenda_tarifa_select ON public.agenda_tarifa;
DROP POLICY IF EXISTS agenda_tarifa_insert ON public.agenda_tarifa;
DROP POLICY IF EXISTS agenda_tarifa_update ON public.agenda_tarifa;
DROP POLICY IF EXISTS agenda_tarifa_delete ON public.agenda_tarifa;

CREATE POLICY agenda_tarifa_select ON public.agenda_tarifa
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY agenda_tarifa_insert ON public.agenda_tarifa
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.agenda a WHERE a.id = id_agenda AND a.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.tarifa t WHERE t.id = id_tarifa AND t.user_id = auth.uid())
  );
CREATE POLICY agenda_tarifa_update ON public.agenda_tarifa
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.agenda a WHERE a.id = id_agenda AND a.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.tarifa t WHERE t.id = id_tarifa AND t.user_id = auth.uid())
  );
CREATE POLICY agenda_tarifa_delete ON public.agenda_tarifa
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS cobro_detalle_select ON public.cobro_detalle;
DROP POLICY IF EXISTS cobro_detalle_insert ON public.cobro_detalle;
DROP POLICY IF EXISTS cobro_detalle_update ON public.cobro_detalle;
DROP POLICY IF EXISTS cobro_detalle_delete ON public.cobro_detalle;

CREATE POLICY cobro_detalle_select ON public.cobro_detalle
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY cobro_detalle_insert ON public.cobro_detalle
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.cobro c WHERE c.id = id_cobro AND c.user_id = auth.uid())
    AND (
      id_tarifa IS NULL
      OR EXISTS (SELECT 1 FROM public.tarifa t WHERE t.id = id_tarifa AND t.user_id = auth.uid())
    )
  );
CREATE POLICY cobro_detalle_update ON public.cobro_detalle
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY cobro_detalle_delete ON public.cobro_detalle
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3) Backfill desde columnas legacy
--    IMPORTANTE: sin trigger set_tenant_user_id — en SQL Editor auth.uid() es NULL.
--    Se copian los user_id reales de agenda/cobro.
-- ---------------------------------------------------------------------------
-- Si re-ejecutas tras un fallo parcial, desactiva triggers por si ya existen:
ALTER TABLE public.agenda_tarifa DISABLE TRIGGER USER;
ALTER TABLE public.cobro_detalle DISABLE TRIGGER USER;

INSERT INTO public.agenda_tarifa (user_id, id_agenda, id_tarifa)
SELECT a.user_id, a.id, a.id_tarifa
FROM public.agenda a
WHERE a.id_tarifa IS NOT NULL
ON CONFLICT (id_agenda, id_tarifa) DO NOTHING;

INSERT INTO public.cobro_detalle (user_id, id_cobro, id_tarifa, descripcion, valor)
SELECT
  c.user_id,
  c.id,
  c.id_tarifa,
  COALESCE(t.descripcion, 'Tarifa'),
  COALESCE(t.valor, c.valor)
FROM public.cobro c
LEFT JOIN public.tarifa t ON t.id = c.id_tarifa
WHERE NOT EXISTS (
  SELECT 1 FROM public.cobro_detalle d WHERE d.id_cobro = c.id
)
AND (c.id_tarifa IS NOT NULL OR c.valor IS NOT NULL);

ALTER TABLE public.agenda_tarifa ENABLE TRIGGER USER;
ALTER TABLE public.cobro_detalle ENABLE TRIGGER USER;

-- ---------------------------------------------------------------------------
-- 4) Triggers user_id (después del backfill; mismo patrón tenant)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_agenda_tarifa_set_user_id ON public.agenda_tarifa;
CREATE TRIGGER trg_agenda_tarifa_set_user_id
  BEFORE INSERT ON public.agenda_tarifa
  FOR EACH ROW EXECUTE PROCEDURE public.set_tenant_user_id();

DROP TRIGGER IF EXISTS trg_agenda_tarifa_keep_user_id ON public.agenda_tarifa;
CREATE TRIGGER trg_agenda_tarifa_keep_user_id
  BEFORE UPDATE ON public.agenda_tarifa
  FOR EACH ROW EXECUTE PROCEDURE public.prevent_user_id_change();

DROP TRIGGER IF EXISTS trg_cobro_detalle_set_user_id ON public.cobro_detalle;
CREATE TRIGGER trg_cobro_detalle_set_user_id
  BEFORE INSERT ON public.cobro_detalle
  FOR EACH ROW EXECUTE PROCEDURE public.set_tenant_user_id();

DROP TRIGGER IF EXISTS trg_cobro_detalle_keep_user_id ON public.cobro_detalle;
CREATE TRIGGER trg_cobro_detalle_keep_user_id
  BEFORE UPDATE ON public.cobro_detalle
  FOR EACH ROW EXECUTE PROCEDURE public.prevent_user_id_change();

-- ---------------------------------------------------------------------------
-- 5) Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_id_tarifas(p_ids bigint[])
RETURNS bigint[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT array_agg(DISTINCT x ORDER BY x)
      FROM unnest(COALESCE(p_ids, ARRAY[]::bigint[])) AS x
      WHERE x IS NOT NULL AND x > 0
    ),
    ARRAY[]::bigint[]
  );
$$;

GRANT EXECUTE ON FUNCTION public.normalize_id_tarifas(bigint[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_agenda_tarifas(
  p_id_agenda bigint,
  p_id_tarifas bigint[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_ids bigint[];
  v_first bigint;
  tid bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  v_ids := public.normalize_id_tarifas(p_id_tarifas);
  IF cardinality(v_ids) IS NULL OR cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'Se requiere al menos una tarifa';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM agenda WHERE id = p_id_agenda AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Agenda no encontrada';
  END IF;

  DELETE FROM agenda_tarifa
  WHERE id_agenda = p_id_agenda
    AND user_id = auth.uid();

  FOREACH tid IN ARRAY v_ids LOOP
    INSERT INTO agenda_tarifa (id_agenda, id_tarifa)
    VALUES (p_id_agenda, tid);
  END LOOP;

  v_first := v_ids[1];
  UPDATE agenda
  SET id_tarifa = v_first
  WHERE id = p_id_agenda
    AND user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_agenda_tarifas(bigint, bigint[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.insert_cobro_detalles(
  p_id_cobro bigint,
  p_id_profesional bigint,
  p_id_tarifas bigint[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_ids bigint[];
  tid bigint;
  t tarifa%ROWTYPE;
BEGIN
  v_ids := public.normalize_id_tarifas(p_id_tarifas);
  IF cardinality(v_ids) IS NULL OR cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'Se requiere al menos una tarifa';
  END IF;

  FOREACH tid IN ARRAY v_ids LOOP
    SELECT * INTO t
    FROM tarifa
    WHERE id = tid
      AND id_profesional = p_id_profesional
      AND user_id = auth.uid();

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tarifa inválida para el profesional';
    END IF;

    INSERT INTO cobro_detalle (id_cobro, id_tarifa, descripcion, valor)
    VALUES (p_id_cobro, t.id, t.descripcion, t.valor);
  END LOOP;
END;
$$;

-- SECURITY INVOKER: el caller necesita EXECUTE también en helpers anidados
GRANT EXECUTE ON FUNCTION public.insert_cobro_detalles(bigint, bigint, bigint[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) create_cobro_atomico (array) + wrapper legacy (una tarifa)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_cobro_atomico(bigint, bigint, bigint, bigint, numeric, text, text, date);

CREATE OR REPLACE FUNCTION public.create_cobro_atomico(
  p_id_agenda bigint,
  p_id_profesional bigint,
  p_id_mascota bigint,
  p_id_tarifas bigint[],
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

  v_ids := public.normalize_id_tarifas(p_id_tarifas);
  IF cardinality(v_ids) IS NULL OR cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'La tarifa es requerida';
  END IF;
  v_first := v_ids[1];

  v_metodo := NULLIF(btrim(COALESCE(p_metodo_pago, '')), '');
  IF v_metodo IS NULL THEN
    RAISE EXCEPTION 'El método de pago es requerido';
  END IF;

  -- Valida todas las tarifas del profesional
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
    'pagado'
  )
  RETURNING * INTO nuevo;

  PERFORM public.insert_cobro_detalles(nuevo.id, p_id_profesional, v_ids);

  -- Asegura que la agenda tenga las mismas tarifas (si cobró con override)
  PERFORM public.sync_agenda_tarifas(p_id_agenda, v_ids);

  UPDATE agenda
  SET cobrada = true
  WHERE id = p_id_agenda
    AND user_id = auth.uid();

  RETURN nuevo;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_cobro_atomico(
  bigint, bigint, bigint, bigint[], numeric, text, text, date
) TO authenticated;

-- Wrapper legacy: una sola tarifa → array
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
BEGIN
  RETURN public.create_cobro_atomico(
    p_id_agenda,
    p_id_profesional,
    p_id_mascota,
    ARRAY[p_id_tarifa]::bigint[],
    p_valor,
    p_metodo_pago,
    p_observacion,
    p_fecha_cobro
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_cobro_atomico(
  bigint, bigint, bigint, bigint, numeric, text, text, date
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) crear_cita_y_cobrar_atomico (array) + wrapper legacy
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.crear_cita_y_cobrar_atomico(
  bigint, bigint, bigint, date, time, time, numeric, text, text, date
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
  p_fecha_cobro date DEFAULT NULL
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
    fecha, hora_inicio, hora_fin
  ) VALUES (
    p_id_profesional, p_id_mascota, v_first,
    p_fecha, p_hora_inicio, p_hora_fin
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
  bigint, bigint, bigint[], date, time, time, numeric, text, text, date
) TO authenticated;

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
    p_fecha_cobro
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_cita_y_cobrar_atomico(
  bigint, bigint, bigint, date, time, time, numeric, text, text, date
) TO authenticated;

-- =============================================================================
-- 20260828_000012_informe_fidelizacion.sql
-- Informe de fidelización: RPC de oportunidades (cumpleaños/mesarios + hitos)
-- y tabla opcional para marcar contactos WhatsApp enviados.
-- No altera tablas base (mascota, agenda, cobro, cuidador).
-- Idempotente.
-- =============================================================================

-- Fecha con día recortado al último día del mes (29 feb → 28 en año no bisiesto).
CREATE OR REPLACE FUNCTION public.fidelizacion_fecha_md(
  p_year integer,
  p_month integer,
  p_day integer
)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT make_date(
    p_year,
    p_month,
    LEAST(
      p_day,
      EXTRACT(
        DAY FROM (
          date_trunc('month', make_date(p_year, p_month, 1))
          + interval '1 month - 1 day'
        )
      )::integer
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.fidelizacion_proxima_anual(p_nac date, p_hoy date)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  d date;
BEGIN
  IF p_nac IS NULL OR p_hoy IS NULL THEN
    RETURN NULL;
  END IF;
  d := public.fidelizacion_fecha_md(
    EXTRACT(YEAR FROM p_hoy)::integer,
    EXTRACT(MONTH FROM p_nac)::integer,
    EXTRACT(DAY FROM p_nac)::integer
  );
  IF d < p_hoy THEN
    d := public.fidelizacion_fecha_md(
      EXTRACT(YEAR FROM p_hoy)::integer + 1,
      EXTRACT(MONTH FROM p_nac)::integer,
      EXTRACT(DAY FROM p_nac)::integer
    );
  END IF;
  RETURN d;
END;
$$;

CREATE OR REPLACE FUNCTION public.fidelizacion_proxima_mensual(p_nac date, p_hoy date)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  d date;
  y integer;
  m integer;
BEGIN
  IF p_nac IS NULL OR p_hoy IS NULL THEN
    RETURN NULL;
  END IF;
  y := EXTRACT(YEAR FROM p_hoy)::integer;
  m := EXTRACT(MONTH FROM p_hoy)::integer;
  d := public.fidelizacion_fecha_md(y, m, EXTRACT(DAY FROM p_nac)::integer);
  IF d < p_hoy THEN
    m := m + 1;
    IF m > 12 THEN
      m := 1;
      y := y + 1;
    END IF;
    d := public.fidelizacion_fecha_md(y, m, EXTRACT(DAY FROM p_nac)::integer);
  END IF;
  RETURN d;
END;
$$;

CREATE TABLE IF NOT EXISTS public.fidelizacion_contacto (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  id_mascota   BIGINT NOT NULL REFERENCES public.mascota(id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL CHECK (tipo IN ('cumpleanos', 'mesario', 'hito')),
  clave        TEXT NOT NULL,
  enviado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, id_mascota, tipo, clave)
);

CREATE INDEX IF NOT EXISTS idx_fidelizacion_contacto_user
  ON public.fidelizacion_contacto (user_id);

ALTER TABLE public.fidelizacion_contacto
  ALTER COLUMN user_id SET DEFAULT auth.uid();

DROP TRIGGER IF EXISTS trg_fidelizacion_contacto_set_user_id ON public.fidelizacion_contacto;
CREATE TRIGGER trg_fidelizacion_contacto_set_user_id
  BEFORE INSERT ON public.fidelizacion_contacto
  FOR EACH ROW EXECUTE PROCEDURE public.set_tenant_user_id();

DROP TRIGGER IF EXISTS trg_fidelizacion_contacto_keep_user_id ON public.fidelizacion_contacto;
CREATE TRIGGER trg_fidelizacion_contacto_keep_user_id
  BEFORE UPDATE ON public.fidelizacion_contacto
  FOR EACH ROW EXECUTE PROCEDURE public.prevent_user_id_change();

ALTER TABLE public.fidelizacion_contacto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fidelizacion_contacto_select ON public.fidelizacion_contacto;
DROP POLICY IF EXISTS fidelizacion_contacto_insert ON public.fidelizacion_contacto;
DROP POLICY IF EXISTS fidelizacion_contacto_update ON public.fidelizacion_contacto;
DROP POLICY IF EXISTS fidelizacion_contacto_delete ON public.fidelizacion_contacto;

CREATE POLICY fidelizacion_contacto_select ON public.fidelizacion_contacto
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY fidelizacion_contacto_insert ON public.fidelizacion_contacto
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.mascota m WHERE m.id = id_mascota AND m.user_id = auth.uid())
  );
CREATE POLICY fidelizacion_contacto_update ON public.fidelizacion_contacto
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY fidelizacion_contacto_delete ON public.fidelizacion_contacto
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fidelizacion_contacto TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.fidelizacion_contacto_id_seq TO authenticated;

CREATE OR REPLACE FUNCTION public.get_informe_fidelizacion(
  p_dias_ventana integer DEFAULT 30,
  p_id_profesional bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hoy date := CURRENT_DATE;
  v_dias integer;
  v_cumples jsonb;
  v_hitos jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  v_dias := GREATEST(1, LEAST(COALESCE(p_dias_ventana, 30), 90));

  WITH servicios AS (
    SELECT a.id_mascota, COUNT(*)::int AS n
    FROM public.agenda a
    WHERE a.user_id = v_uid
      AND a.atendida IS TRUE
      AND COALESCE(a.cancelada, false) IS FALSE
      AND (p_id_profesional IS NULL OR a.id_profesional = p_id_profesional)
    GROUP BY a.id_mascota
  ),
  mascotas_base AS (
    SELECT
      m.id,
      m.nombre,
      m.especie,
      m.raza,
      m.fecha_nacimiento,
      COALESCE(s.n, 0) AS servicios_atendidos
    FROM public.mascota m
    LEFT JOIN servicios s ON s.id_mascota = m.id
    WHERE m.user_id = v_uid
      AND (
        p_id_profesional IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.agenda a
          WHERE a.user_id = v_uid
            AND a.id_mascota = m.id
            AND a.id_profesional = p_id_profesional
        )
      )
  ),
  cuidador_pick AS (
    SELECT DISTINCT ON (cm.id_mascota)
      cm.id_mascota,
      c.id AS id_cuidador,
      c.nombre AS cuidador_nombre,
      c.telefono AS cuidador_telefono
    FROM public.cuidador_mascota cm
    JOIN public.cuidador c ON c.id = cm.id_cuidador
    WHERE cm.user_id = v_uid
      AND cm.activo IS NOT FALSE
    ORDER BY
      cm.id_mascota,
      CASE WHEN NULLIF(btrim(c.telefono), '') IS NULL THEN 1 ELSE 0 END,
      cm.fecha_inicio
  ),
  eventos AS (
    SELECT
      mb.*,
      cp.id_cuidador,
      cp.cuidador_nombre,
      cp.cuidador_telefono,
      public.fidelizacion_proxima_anual(mb.fecha_nacimiento, v_hoy) AS proxima_anual,
      public.fidelizacion_proxima_mensual(mb.fecha_nacimiento, v_hoy) AS proxima_mensual,
      (
        EXTRACT(YEAR FROM age(v_hoy, mb.fecha_nacimiento)) * 12
        + EXTRACT(MONTH FROM age(v_hoy, mb.fecha_nacimiento))
      )::int AS edad_meses
    FROM mascotas_base mb
    LEFT JOIN cuidador_pick cp ON cp.id_mascota = mb.id
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.dias_restantes, t.mascota_nombre), '[]'::jsonb)
  INTO v_cumples
  FROM (
    SELECT
      e.id AS id_mascota,
      e.nombre AS mascota_nombre,
      e.especie,
      e.raza,
      e.fecha_nacimiento::text AS fecha_nacimiento,
      CASE
        WHEN e.edad_meses >= 12 THEN
          (e.edad_meses / 12)::text || ' año' || CASE WHEN e.edad_meses / 12 = 1 THEN '' ELSE 's' END
          || CASE
            WHEN e.edad_meses % 12 = 0 THEN ''
            ELSE ' ' || (e.edad_meses % 12)::text || ' mes' || CASE WHEN e.edad_meses % 12 = 1 THEN '' ELSE 'es' END
          END
        ELSE
          GREATEST(e.edad_meses, 0)::text || ' mes' || CASE WHEN GREATEST(e.edad_meses, 0) = 1 THEN '' ELSE 'es' END
      END AS edad_label,
      CASE
        WHEN e.fecha_nacimiento IS NOT NULL
          AND (e.proxima_anual - v_hoy) BETWEEN 0 AND v_dias
        THEN 'cumpleanos'
        ELSE 'mesario'
      END AS tipo_evento,
      CASE
        WHEN e.fecha_nacimiento IS NOT NULL
          AND (e.proxima_anual - v_hoy) BETWEEN 0 AND v_dias
        THEN e.proxima_anual
        ELSE e.proxima_mensual
      END::text AS proxima_fecha,
      CASE
        WHEN e.fecha_nacimiento IS NOT NULL
          AND (e.proxima_anual - v_hoy) BETWEEN 0 AND v_dias
        THEN (e.proxima_anual - v_hoy)
        ELSE (e.proxima_mensual - v_hoy)
      END AS dias_restantes,
      e.servicios_atendidos,
      e.id_cuidador,
      e.cuidador_nombre,
      e.cuidador_telefono
    FROM eventos e
    WHERE e.fecha_nacimiento IS NOT NULL
      AND (
        (e.proxima_anual - v_hoy) BETWEEN 0 AND v_dias
        OR (
          e.edad_meses < 12
          AND (e.proxima_mensual - v_hoy) BETWEEN 0 AND v_dias
        )
      )
  ) t;

  WITH servicios AS (
    SELECT a.id_mascota, COUNT(*)::int AS n
    FROM public.agenda a
    WHERE a.user_id = v_uid
      AND a.atendida IS TRUE
      AND COALESCE(a.cancelada, false) IS FALSE
      AND (p_id_profesional IS NULL OR a.id_profesional = p_id_profesional)
    GROUP BY a.id_mascota
  ),
  mascotas_base AS (
    SELECT
      m.id,
      m.nombre,
      m.especie,
      m.raza,
      m.fecha_nacimiento,
      COALESCE(s.n, 0) AS servicios_atendidos
    FROM public.mascota m
    JOIN servicios s ON s.id_mascota = m.id
    WHERE m.user_id = v_uid
  ),
  cuidador_pick AS (
    SELECT DISTINCT ON (cm.id_mascota)
      cm.id_mascota,
      c.id AS id_cuidador,
      c.nombre AS cuidador_nombre,
      c.telefono AS cuidador_telefono
    FROM public.cuidador_mascota cm
    JOIN public.cuidador c ON c.id = cm.id_cuidador
    WHERE cm.user_id = v_uid
      AND cm.activo IS NOT FALSE
    ORDER BY
      cm.id_mascota,
      CASE WHEN NULLIF(btrim(c.telefono), '') IS NULL THEN 1 ELSE 0 END,
      cm.fecha_inicio
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.servicios_atendidos DESC, t.mascota_nombre), '[]'::jsonb)
  INTO v_hitos
  FROM (
    SELECT
      mb.id AS id_mascota,
      mb.nombre AS mascota_nombre,
      mb.especie,
      mb.raza,
      mb.fecha_nacimiento::text AS fecha_nacimiento,
      mb.servicios_atendidos,
      CASE
        WHEN mb.servicios_atendidos >= 5 AND mb.servicios_atendidos % 5 = 0
          THEN mb.servicios_atendidos
        ELSE mb.servicios_atendidos + 1
      END AS hito,
      CASE
        WHEN mb.servicios_atendidos >= 5 AND mb.servicios_atendidos % 5 = 0
          THEN 'alcanzado'
        ELSE 'por_alcanzar'
      END AS estado_hito,
      CASE
        WHEN mb.servicios_atendidos >= 5 AND mb.servicios_atendidos % 5 = 0
          THEN 0
        ELSE 1
      END AS servicios_faltantes,
      cp.id_cuidador,
      cp.cuidador_nombre,
      cp.cuidador_telefono
    FROM mascotas_base mb
    LEFT JOIN cuidador_pick cp ON cp.id_mascota = mb.id
    WHERE
      (mb.servicios_atendidos >= 5 AND mb.servicios_atendidos % 5 = 0)
      OR (mb.servicios_atendidos >= 4 AND mb.servicios_atendidos % 5 = 4)
  ) t;

  RETURN jsonb_build_object(
    'cumpleanos', COALESCE(v_cumples, '[]'::jsonb),
    'hitos', COALESCE(v_hitos, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fidelizacion_fecha_md(integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fidelizacion_proxima_anual(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fidelizacion_proxima_mensual(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_informe_fidelizacion(integer, bigint) TO authenticated;

-- Fidelización: solo cumpleaños anuales (edad ≥ 1 año). Sin cumplemeses.

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
            AND COALESCE(a.cancelada, false) IS FALSE
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
      public.fidelizacion_proxima_anual(mb.fecha_nacimiento, v_hoy) AS proxima_anual
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
      (
        EXTRACT(YEAR FROM age(e.proxima_anual, e.fecha_nacimiento))::int
      )::text || ' año' ||
      CASE
        WHEN EXTRACT(YEAR FROM age(e.proxima_anual, e.fecha_nacimiento))::int = 1 THEN ''
        ELSE 's'
      END AS edad_label,
      'cumpleanos'::text AS tipo_evento,
      e.proxima_anual::text AS proxima_fecha,
      (e.proxima_anual - v_hoy) AS dias_restantes,
      e.servicios_atendidos,
      e.id_cuidador,
      e.cuidador_nombre,
      e.cuidador_telefono
    FROM eventos e
    WHERE e.fecha_nacimiento IS NOT NULL
      AND e.proxima_anual IS NOT NULL
      AND (e.proxima_anual - v_hoy) BETWEEN 0 AND v_dias
      AND EXTRACT(YEAR FROM age(e.proxima_anual, e.fecha_nacimiento))::int >= 1
  ) t;

  WITH servicios_total AS (
    SELECT a.id_mascota, COUNT(*)::int AS n
    FROM public.agenda a
    WHERE a.user_id = v_uid
      AND a.atendida IS TRUE
      AND COALESCE(a.cancelada, false) IS FALSE
      AND (p_id_profesional IS NULL OR a.id_profesional = p_id_profesional)
    GROUP BY a.id_mascota
  ),
  servicios_prof AS (
    SELECT a.id_mascota, a.id_profesional, COUNT(*)::int AS n
    FROM public.agenda a
    WHERE a.user_id = v_uid
      AND a.atendida IS TRUE
      AND COALESCE(a.cancelada, false) IS FALSE
    GROUP BY a.id_mascota, a.id_profesional
  ),
  mascotas_base AS (
    SELECT
      m.id,
      m.nombre,
      m.especie,
      m.raza,
      m.fecha_nacimiento,
      COALESCE(st.n, 0) AS servicios_totales
    FROM public.mascota m
    LEFT JOIN servicios_total st ON st.id_mascota = m.id
    WHERE m.user_id = v_uid
      AND (
        p_id_profesional IS NULL
        OR EXISTS (
          SELECT 1 FROM servicios_prof sp
          WHERE sp.id_mascota = m.id AND sp.id_profesional = p_id_profesional
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
  hitos_candidatos AS (
    SELECT
      mb.id AS id_mascota,
      mb.nombre AS mascota_nombre,
      mb.especie,
      mb.raza,
      mb.fecha_nacimiento,
      mb.servicios_totales,
      mb.servicios_totales AS servicios_atendidos,
      'total'::text AS alcance,
      NULL::bigint AS id_profesional,
      NULL::text AS profesional_nombre,
      CASE
        WHEN mb.servicios_totales >= 5 AND mb.servicios_totales % 5 = 0
          THEN mb.servicios_totales
        WHEN mb.servicios_totales >= 4 AND mb.servicios_totales % 5 = 4
          THEN mb.servicios_totales + 1
        ELSE NULL
      END AS hito,
      CASE
        WHEN mb.servicios_totales >= 5 AND mb.servicios_totales % 5 = 0 THEN 'alcanzado'
        WHEN mb.servicios_totales >= 4 AND mb.servicios_totales % 5 = 4 THEN 'por_alcanzar'
        ELSE NULL
      END AS estado_hito,
      CASE
        WHEN mb.servicios_totales >= 5 AND mb.servicios_totales % 5 = 0 THEN 0
        WHEN mb.servicios_totales >= 4 AND mb.servicios_totales % 5 = 4 THEN 1
        ELSE NULL
      END AS servicios_faltantes,
      cp.id_cuidador,
      cp.cuidador_nombre,
      cp.cuidador_telefono
    FROM mascotas_base mb
    LEFT JOIN cuidador_pick cp ON cp.id_mascota = mb.id
    WHERE p_id_profesional IS NULL
      AND (
        (mb.servicios_totales >= 5 AND mb.servicios_totales % 5 = 0)
        OR (mb.servicios_totales >= 4 AND mb.servicios_totales % 5 = 4)
      )

    UNION ALL

    SELECT
      mb.id,
      mb.nombre,
      mb.especie,
      mb.raza,
      mb.fecha_nacimiento,
      mb.servicios_totales,
      sp.n AS servicios_atendidos,
      'profesional'::text AS alcance,
      sp.id_profesional,
      pr.nombre AS profesional_nombre,
      CASE
        WHEN sp.n >= 5 AND sp.n % 5 = 0 THEN sp.n
        WHEN sp.n >= 4 AND sp.n % 5 = 4 THEN sp.n + 1
        ELSE NULL
      END AS hito,
      CASE
        WHEN sp.n >= 5 AND sp.n % 5 = 0 THEN 'alcanzado'
        WHEN sp.n >= 4 AND sp.n % 5 = 4 THEN 'por_alcanzar'
        ELSE NULL
      END AS estado_hito,
      CASE
        WHEN sp.n >= 5 AND sp.n % 5 = 0 THEN 0
        WHEN sp.n >= 4 AND sp.n % 5 = 4 THEN 1
        ELSE NULL
      END AS servicios_faltantes,
      cp.id_cuidador,
      cp.cuidador_nombre,
      cp.cuidador_telefono
    FROM mascotas_base mb
    JOIN servicios_prof sp ON sp.id_mascota = mb.id
    LEFT JOIN public.profesional pr ON pr.id = sp.id_profesional
    LEFT JOIN cuidador_pick cp ON cp.id_mascota = mb.id
    WHERE (
        (sp.n >= 5 AND sp.n % 5 = 0)
        OR (sp.n >= 4 AND sp.n % 5 = 4)
      )
      AND (
        p_id_profesional IS NULL
        OR sp.id_profesional = p_id_profesional
      )
  ),
  hitos_elegidos AS (
    SELECT DISTINCT ON (hc.id_mascota)
      hc.*
    FROM hitos_candidatos hc
    WHERE hc.hito IS NOT NULL
    ORDER BY
      hc.id_mascota,
      CASE WHEN hc.alcance = 'total' THEN 0 ELSE 1 END,
      hc.servicios_atendidos DESC
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.servicios_atendidos DESC, t.mascota_nombre), '[]'::jsonb)
  INTO v_hitos
  FROM (
    SELECT
      id_mascota,
      mascota_nombre,
      especie,
      raza,
      fecha_nacimiento::text AS fecha_nacimiento,
      servicios_atendidos,
      servicios_totales,
      hito,
      estado_hito,
      servicios_faltantes,
      alcance,
      id_profesional,
      profesional_nombre,
      id_cuidador,
      cuidador_nombre,
      cuidador_telefono
    FROM hitos_elegidos
  ) t;

  RETURN jsonb_build_object(
    'version', 3,
    'cumpleanos', COALESCE(v_cumples, '[]'::jsonb),
    'hitos', COALESCE(v_hitos, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_informe_fidelizacion(integer, bigint) TO authenticated;

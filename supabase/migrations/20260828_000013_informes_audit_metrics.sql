-- =============================================================================
-- 20260828_000013_informes_audit_metrics.sql
-- Auditoría métricas informes:
-- - Excluir agendas canceladas de conteos de citas.
-- - Rango de días inclusivo para agrupar por día (≤ 45).
-- - get_agenda_informe expone atendida/cancelada (filtra canceladas).
-- - get_informe_fidelizacion v2: hitos por total o por profesional en «Todos».
-- Idempotente.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_dashboard_informes(
  p_fecha_desde date DEFAULT NULL,
  p_fecha_hasta date DEFAULT NULL,
  p_id_profesional bigint DEFAULT NULL,
  p_estado text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_dias int;
  v_agrupar_dia boolean;
  v_kpis jsonb;
  v_serie jsonb;
  v_por_prof jsonb;
  v_por_mes jsonb;
  v_por_tarifa jsonb;
  v_por_estado jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  v_dias := COALESCE(p_fecha_hasta, CURRENT_DATE)
          - COALESCE(p_fecha_desde, CURRENT_DATE - 30)
          + 1;
  v_agrupar_dia := v_dias <= 45;

  SELECT jsonb_build_object(
    'total_ingresos', COALESCE(SUM(CASE WHEN c.estado <> 'anulado' THEN c.valor ELSE 0 END), 0),
    'total_pagado', COALESCE(SUM(CASE WHEN c.estado = 'pagado' THEN c.valor ELSE 0 END), 0),
    'total_pendiente', COALESCE(SUM(CASE WHEN c.estado = 'pendiente' THEN c.valor ELSE 0 END), 0),
    'total_anulado', COALESCE(SUM(CASE WHEN c.estado = 'anulado' THEN c.valor ELSE 0 END), 0),
    'total_atenciones', COUNT(*) FILTER (WHERE c.estado <> 'anulado'),
    'ticket_promedio', CASE
      WHEN COUNT(*) FILTER (WHERE c.estado <> 'anulado') = 0 THEN 0
      ELSE ROUND(
        COALESCE(SUM(CASE WHEN c.estado <> 'anulado' THEN c.valor ELSE 0 END), 0)
        / COUNT(*) FILTER (WHERE c.estado <> 'anulado'),
        2
      )
    END,
    'total_citas_agenda', (
      SELECT COUNT(*)::int
      FROM agenda a
      WHERE a.user_id = v_uid
        AND COALESCE(a.cancelada, false) IS FALSE
        AND (p_fecha_desde IS NULL OR a.fecha >= p_fecha_desde)
        AND (p_fecha_hasta IS NULL OR a.fecha <= p_fecha_hasta)
        AND (p_id_profesional IS NULL OR a.id_profesional = p_id_profesional)
    )
  )
  INTO v_kpis
  FROM cobro c
  WHERE c.user_id = v_uid
    AND (p_fecha_desde IS NULL OR c.fecha_cobro >= p_fecha_desde)
    AND (p_fecha_hasta IS NULL OR c.fecha_cobro <= p_fecha_hasta)
    AND (p_id_profesional IS NULL OR c.id_profesional = p_id_profesional)
    AND (p_estado IS NULL OR p_estado = '' OR c.estado::text = p_estado);

  IF v_agrupar_dia THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.periodo), '[]'::jsonb)
    INTO v_serie
    FROM (
      SELECT
        TO_CHAR(c.fecha_cobro, 'YYYY-MM-DD') AS periodo,
        COALESCE(SUM(CASE WHEN c.estado <> 'anulado' THEN c.valor ELSE 0 END), 0) AS ingresos,
        COUNT(*) FILTER (WHERE c.estado <> 'anulado') AS atenciones
      FROM cobro c
      WHERE c.user_id = v_uid
        AND (p_fecha_desde IS NULL OR c.fecha_cobro >= p_fecha_desde)
        AND (p_fecha_hasta IS NULL OR c.fecha_cobro <= p_fecha_hasta)
        AND (p_id_profesional IS NULL OR c.id_profesional = p_id_profesional)
        AND (p_estado IS NULL OR p_estado = '' OR c.estado::text = p_estado)
      GROUP BY TO_CHAR(c.fecha_cobro, 'YYYY-MM-DD')
    ) t;
  ELSE
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.periodo), '[]'::jsonb)
    INTO v_serie
    FROM (
      SELECT
        TO_CHAR(c.fecha_cobro, 'YYYY-MM') AS periodo,
        COALESCE(SUM(CASE WHEN c.estado <> 'anulado' THEN c.valor ELSE 0 END), 0) AS ingresos,
        COUNT(*) FILTER (WHERE c.estado <> 'anulado') AS atenciones
      FROM cobro c
      WHERE c.user_id = v_uid
        AND (p_fecha_desde IS NULL OR c.fecha_cobro >= p_fecha_desde)
        AND (p_fecha_hasta IS NULL OR c.fecha_cobro <= p_fecha_hasta)
        AND (p_id_profesional IS NULL OR c.id_profesional = p_id_profesional)
        AND (p_estado IS NULL OR p_estado = '' OR c.estado::text = p_estado)
      GROUP BY TO_CHAR(c.fecha_cobro, 'YYYY-MM')
    ) t;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.nombre), '[]'::jsonb)
  INTO v_por_prof
  FROM (
    SELECT
      p.id,
      p.nombre,
      COUNT(c.id) FILTER (WHERE c.estado <> 'anulado') AS atenciones,
      COALESCE(SUM(CASE WHEN c.estado <> 'anulado' THEN c.valor ELSE 0 END), 0) AS ingresos,
      COALESCE(SUM(CASE WHEN c.estado = 'pagado' THEN c.valor ELSE 0 END), 0) AS pagado,
      COALESCE(SUM(CASE WHEN c.estado = 'pendiente' THEN c.valor ELSE 0 END), 0) AS pendiente,
      (
        SELECT COUNT(*)::int FROM agenda a
        WHERE a.id_profesional = p.id
          AND a.user_id = v_uid
          AND COALESCE(a.cancelada, false) IS FALSE
          AND (p_fecha_desde IS NULL OR a.fecha >= p_fecha_desde)
          AND (p_fecha_hasta IS NULL OR a.fecha <= p_fecha_hasta)
      ) AS citas_agenda
    FROM profesional p
    LEFT JOIN cobro c ON c.id_profesional = p.id
      AND c.user_id = v_uid
      AND (p_fecha_desde IS NULL OR c.fecha_cobro >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR c.fecha_cobro <= p_fecha_hasta)
      AND (p_estado IS NULL OR p_estado = '' OR c.estado::text = p_estado)
    WHERE p.user_id = v_uid
      AND (p_id_profesional IS NULL OR p.id = p_id_profesional)
    GROUP BY p.id, p.nombre
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.mes), '[]'::jsonb)
  INTO v_por_mes
  FROM (
    SELECT
      TO_CHAR(c.fecha_cobro, 'YYYY-MM') AS mes,
      COUNT(*) FILTER (WHERE c.estado <> 'anulado') AS atenciones,
      COALESCE(SUM(CASE WHEN c.estado <> 'anulado' THEN c.valor ELSE 0 END), 0) AS ingresos,
      COALESCE(SUM(CASE WHEN c.estado = 'pagado' THEN c.valor ELSE 0 END), 0) AS pagado,
      COALESCE(SUM(CASE WHEN c.estado = 'pendiente' THEN c.valor ELSE 0 END), 0) AS pendiente
    FROM cobro c
    WHERE c.user_id = v_uid
      AND (p_fecha_desde IS NULL OR c.fecha_cobro >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR c.fecha_cobro <= p_fecha_hasta)
      AND (p_id_profesional IS NULL OR c.id_profesional = p_id_profesional)
      AND (p_estado IS NULL OR p_estado = '' OR c.estado::text = p_estado)
    GROUP BY TO_CHAR(c.fecha_cobro, 'YYYY-MM')
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.ingresos DESC), '[]'::jsonb)
  INTO v_por_tarifa
  FROM (
    SELECT
      COALESCE(t.id, 0) AS id,
      COALESCE(t.descripcion, 'Sin tarifa') AS descripcion,
      COUNT(c.id) FILTER (WHERE c.estado <> 'anulado') AS cantidad,
      COALESCE(SUM(CASE WHEN c.estado <> 'anulado' THEN c.valor ELSE 0 END), 0) AS ingresos
    FROM cobro c
    LEFT JOIN tarifa t ON t.id = c.id_tarifa
    WHERE c.user_id = v_uid
      AND (p_fecha_desde IS NULL OR c.fecha_cobro >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR c.fecha_cobro <= p_fecha_hasta)
      AND (p_id_profesional IS NULL OR c.id_profesional = p_id_profesional)
      AND (p_estado IS NULL OR p_estado = '' OR c.estado::text = p_estado)
    GROUP BY COALESCE(t.id, 0), COALESCE(t.descripcion, 'Sin tarifa')
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.estado), '[]'::jsonb)
  INTO v_por_estado
  FROM (
    SELECT
      c.estado::text AS estado,
      COUNT(*) AS cantidad,
      COALESCE(SUM(c.valor), 0) AS total
    FROM cobro c
    WHERE c.user_id = v_uid
      AND (p_fecha_desde IS NULL OR c.fecha_cobro >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR c.fecha_cobro <= p_fecha_hasta)
      AND (p_id_profesional IS NULL OR c.id_profesional = p_id_profesional)
      AND (p_estado IS NULL OR p_estado = '' OR c.estado::text = p_estado)
    GROUP BY c.estado
  ) t;

  RETURN jsonb_build_object(
    'kpis', COALESCE(v_kpis, '{}'::jsonb),
    'serie', COALESCE(v_serie, '[]'::jsonb),
    'agrupar_por', CASE WHEN v_agrupar_dia THEN 'dia' ELSE 'mes' END,
    'por_profesional', COALESCE(v_por_prof, '[]'::jsonb),
    'por_mes', COALESCE(v_por_mes, '[]'::jsonb),
    'por_tarifa', COALESCE(v_por_tarifa, '[]'::jsonb),
    'por_estado', COALESCE(v_por_estado, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_agenda_informe(
  p_fecha_desde date DEFAULT NULL,
  p_fecha_hasta date DEFAULT NULL,
  p_id_profesional bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rows jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.fecha, t.hora_inicio), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      a.id,
      a.fecha,
      a.hora_inicio,
      a.hora_fin,
      a.atendida,
      a.cancelada,
      p.id AS id_profesional,
      p.nombre AS profesional_nombre,
      m.id AS id_mascota,
      m.nombre AS mascota_nombre,
      m.especie,
      m.raza,
      m.tamano,
      (
        SELECT string_agg(c.nombre, ', ' ORDER BY c.nombre)
        FROM public.cuidador_mascota cm
        JOIN public.cuidador c ON c.id = cm.id_cuidador
        WHERE cm.id_mascota = m.id
          AND cm.user_id = v_uid
          AND c.user_id = v_uid
          AND COALESCE(cm.activo, true) IS TRUE
      ) AS cuidador_nombre
    FROM agenda a
    JOIN profesional p ON p.id = a.id_profesional
    JOIN mascota m ON m.id = a.id_mascota
    WHERE a.user_id = v_uid
      AND COALESCE(a.cancelada, false) IS FALSE
      AND (p_fecha_desde IS NULL OR a.fecha >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR a.fecha <= p_fecha_hasta)
      AND (p_id_profesional IS NULL OR a.id_profesional = p_id_profesional)
  ) t;

  RETURN jsonb_build_object('rows', v_rows);
END;
$$;

-- Fidelización v2: hitos en «Todos» incluyen alcance por profesional si el total no califica.
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
    'version', 2,
    'cumpleanos', COALESCE(v_cumples, '[]'::jsonb),
    'hitos', COALESCE(v_hitos, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_informes(date, date, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_agenda_informe(date, date, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_informe_fidelizacion(integer, bigint) TO authenticated;

-- =============================================================================
-- 20260808_000003_informes_rpcs.sql
-- RPCs: get_dashboard_informes, get_agenda_informe (filtrados por auth.uid()).
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
          - COALESCE(p_fecha_desde, CURRENT_DATE - 30);
  v_agrupar_dia := v_dias <= 45;

  -- KPIs
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

  -- Serie temporal
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

  -- Por profesional
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

  -- Por mes
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

  -- Por tarifa
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

  -- Por estado
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

GRANT EXECUTE ON FUNCTION public.get_dashboard_informes(date, date, bigint, text) TO authenticated;

-- Agenda para exportación
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
      p.id AS id_profesional,
      p.nombre AS profesional_nombre,
      m.id AS id_mascota,
      m.nombre AS mascota_nombre,
      m.especie,
      m.raza,
      m.tamano
    FROM agenda a
    JOIN profesional p ON p.id = a.id_profesional
    JOIN mascota m ON m.id = a.id_mascota
    WHERE a.user_id = v_uid
      AND (p_fecha_desde IS NULL OR a.fecha >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR a.fecha <= p_fecha_hasta)
      AND (p_id_profesional IS NULL OR a.id_profesional = p_id_profesional)
  ) t;

  RETURN jsonb_build_object('rows', v_rows);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_agenda_informe(date, date, bigint) TO authenticated;

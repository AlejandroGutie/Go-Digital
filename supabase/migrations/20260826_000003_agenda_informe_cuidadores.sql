-- =============================================================================
-- 20260826_000003_agenda_informe_cuidadores.sql
-- Extiende get_agenda_informe con cuidador_nombre (cuidadores activos de la mascota).
-- Idempotente.
-- =============================================================================

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
      AND (p_fecha_desde IS NULL OR a.fecha >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR a.fecha <= p_fecha_hasta)
      AND (p_id_profesional IS NULL OR a.id_profesional = p_id_profesional)
  ) t;

  RETURN jsonb_build_object('rows', v_rows);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_agenda_informe(date, date, bigint) TO authenticated;

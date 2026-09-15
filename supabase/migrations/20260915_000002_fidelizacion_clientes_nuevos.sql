-- Clientes nuevos en fidelización: tipo de contacto + RPC.

ALTER TABLE public.fidelizacion_contacto
  DROP CONSTRAINT IF EXISTS fidelizacion_contacto_tipo_check;

ALTER TABLE public.fidelizacion_contacto
  ADD CONSTRAINT fidelizacion_contacto_tipo_check
  CHECK (tipo IN ('cumpleanos', 'mesario', 'hito', 'nuevo'));

CREATE OR REPLACE FUNCTION public.get_fidelizacion_clientes_nuevos()
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

  WITH cuidador_pick AS (
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
  SELECT COALESCE(
    jsonb_agg(row_to_json(t)::jsonb ORDER BY t.fecha_registro DESC, t.mascota_nombre),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT
      m.id AS id_mascota,
      m.nombre AS mascota_nombre,
      m.especie,
      m.raza,
      (m.created_at AT TIME ZONE 'America/Bogota')::date::text AS fecha_registro,
      cp.id_cuidador,
      cp.cuidador_nombre,
      cp.cuidador_telefono
    FROM public.mascota m
    LEFT JOIN cuidador_pick cp ON cp.id_mascota = m.id
    WHERE m.user_id = v_uid
      AND NOT EXISTS (
        SELECT 1
        FROM public.agenda a
        WHERE a.id_mascota = m.id
          AND a.user_id = v_uid
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.cobro c
        WHERE c.id_mascota = m.id
          AND c.user_id = v_uid
          AND c.estado::text IS DISTINCT FROM 'anulado'
      )
  ) t;

  RETURN jsonb_build_object(
    'version', 1,
    'clientes_nuevos', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_fidelizacion_clientes_nuevos() TO authenticated;

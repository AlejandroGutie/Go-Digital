-- Validación de eliminación de mascota alineada con FKs reales (cobro RESTRICT).
-- SECURITY DEFINER: cuenta cobros aunque RLS del cliente no los devuelva en SELECT.

CREATE OR REPLACE FUNCTION public.mascota_tiene_cobros_bloqueantes(p_id_mascota bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cobro c
    WHERE c.id_mascota = p_id_mascota
       OR c.id_agenda IN (
         SELECT a.id
         FROM public.agenda a
         WHERE a.id_mascota = p_id_mascota
       )
  )
  AND EXISTS (
    SELECT 1
    FROM public.mascota m
    WHERE m.id = p_id_mascota
      AND m.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.mascota_puede_eliminarse(p_id_mascota bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mascota m
    WHERE m.id = p_id_mascota
      AND m.user_id = auth.uid()
  )
  AND NOT public.mascota_tiene_cobros_bloqueantes(p_id_mascota);
$$;

CREATE OR REPLACE FUNCTION public.get_mascotas_no_eliminables(p_ids bigint[])
RETURNS bigint[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT mas.id), ARRAY[]::bigint[])
  FROM public.mascota mas
  WHERE mas.id = ANY (p_ids)
    AND mas.user_id = auth.uid()
    AND public.mascota_tiene_cobros_bloqueantes(mas.id);
$$;

GRANT EXECUTE ON FUNCTION public.mascota_tiene_cobros_bloqueantes(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mascota_puede_eliminarse(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mascotas_no_eliminables(bigint[]) TO authenticated;

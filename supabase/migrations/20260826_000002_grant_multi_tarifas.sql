-- =============================================================================
-- 20260826_000002_grant_multi_tarifas.sql
-- Corrige 42501 (permission denied) en formularios tras crear agenda_tarifa /
-- cobro_detalle. Las funciones SECURITY INVOKER exigen EXECUTE en helpers.
-- Idempotente: seguro re-ejecutar en SQL Editor.
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_tarifa TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cobro_detalle TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.agenda_tarifa_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.cobro_detalle_id_seq TO authenticated;

GRANT EXECUTE ON FUNCTION public.normalize_id_tarifas(bigint[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_agenda_tarifas(bigint, bigint[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_cobro_detalles(bigint, bigint, bigint[]) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_cobro_atomico(
  bigint, bigint, bigint, bigint[], numeric, text, text, date
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_cobro_atomico(
  bigint, bigint, bigint, bigint, numeric, text, text, date
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.crear_cita_y_cobrar_atomico(
  bigint, bigint, bigint[], date, time, time, numeric, text, text, date
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_cita_y_cobrar_atomico(
  bigint, bigint, bigint, date, time, time, numeric, text, text, date
) TO authenticated;

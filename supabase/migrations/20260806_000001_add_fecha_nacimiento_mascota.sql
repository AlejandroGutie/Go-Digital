-- =============================================================================
-- 20260806_000001_add_fecha_nacimiento_mascota.sql
-- Historial: agrega fecha_nacimiento a mascota (ya incluida en baseline).
-- =============================================================================

ALTER TABLE public.mascota
  ADD COLUMN IF NOT EXISTS fecha_nacimiento date;

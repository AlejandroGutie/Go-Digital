-- =============================================================================
-- 20260826_000005_profesional_jornada.sql
-- Jornada laboral del profesional (slots de agenda cada 30 min).
-- Defaults: 08:00 – 18:00. Idempotente.
-- =============================================================================

ALTER TABLE public.profesional
  ADD COLUMN IF NOT EXISTS hora_inicio_jornada TIME NOT NULL DEFAULT '08:00'::time;

ALTER TABLE public.profesional
  ADD COLUMN IF NOT EXISTS hora_fin_jornada TIME NOT NULL DEFAULT '18:00'::time;

UPDATE public.profesional
SET
  hora_inicio_jornada = COALESCE(hora_inicio_jornada, '08:00'::time),
  hora_fin_jornada = COALESCE(hora_fin_jornada, '18:00'::time)
WHERE hora_inicio_jornada IS NULL
   OR hora_fin_jornada IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_profesional_jornada'
      AND conrelid = 'public.profesional'::regclass
  ) THEN
    ALTER TABLE public.profesional
      ADD CONSTRAINT chk_profesional_jornada
      CHECK (hora_fin_jornada > hora_inicio_jornada);
  END IF;
END $$;

COMMENT ON COLUMN public.profesional.hora_inicio_jornada IS
  'Inicio de la jornada de atención (slots de agenda). Default 08:00.';
COMMENT ON COLUMN public.profesional.hora_fin_jornada IS
  'Fin de la jornada de atención (slots de agenda). Default 18:00.';

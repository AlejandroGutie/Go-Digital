-- =============================================================================
-- 20260807_000001_add_id_tarifa_agenda.sql
-- Historial: asocia tarifa opcional a cada cita (ya incluida en baseline).
-- =============================================================================

ALTER TABLE public.agenda
  ADD COLUMN IF NOT EXISTS id_tarifa bigint NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agenda_id_tarifa_fkey'
  ) THEN
    ALTER TABLE public.agenda
      ADD CONSTRAINT agenda_id_tarifa_fkey
      FOREIGN KEY (id_tarifa)
      REFERENCES public.tarifa (id)
      ON DELETE SET NULL;
  END IF;
END
$migration$;

CREATE INDEX IF NOT EXISTS agenda_id_tarifa_idx ON public.agenda (id_tarifa);

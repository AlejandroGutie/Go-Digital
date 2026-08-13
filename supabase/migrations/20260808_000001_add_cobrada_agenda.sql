-- =============================================================================
-- 20260808_000001_add_cobrada_agenda.sql
-- Historial: flag cobrada para ocultar citas cobradas sin borrarlas.
-- =============================================================================

ALTER TABLE public.agenda
  ADD COLUMN IF NOT EXISTS cobrada boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.agenda.cobrada IS
  'true cuando hay cobro vigente; la cita sigue en la agenda activa hasta atendida';

CREATE INDEX IF NOT EXISTS idx_agenda_cobrada ON public.agenda (cobrada);
CREATE INDEX IF NOT EXISTS idx_agenda_profesional_fecha_cobrada
  ON public.agenda (id_profesional, fecha, cobrada);

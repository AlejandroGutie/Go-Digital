-- =============================================================================
-- 20260808_000001_add_cobrada_agenda.sql
-- Historial: flag cobrada para ocultar citas cobradas sin borrarlas.
-- =============================================================================

ALTER TABLE public.agenda
  ADD COLUMN IF NOT EXISTS cobrada boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.agenda.cobrada IS
  'true cuando ya se registró un cobro vigente; se oculta del listado activo sin borrar la fila';

CREATE INDEX IF NOT EXISTS idx_agenda_cobrada ON public.agenda (cobrada);
CREATE INDEX IF NOT EXISTS idx_agenda_profesional_fecha_cobrada
  ON public.agenda (id_profesional, fecha, cobrada);

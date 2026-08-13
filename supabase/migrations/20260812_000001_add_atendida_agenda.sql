-- =============================================================================
-- 20260812_000001_add_atendida_agenda.sql
-- Marca de atención prestada ("Mascota lista").
-- La vista activa filtra por atendida=false (no por cobrada).
-- =============================================================================

ALTER TABLE public.agenda
  ADD COLUMN IF NOT EXISTS atendida boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.agenda.atendida IS
  'true cuando se accionó Mascota lista; oculta la cita de la agenda activa del profesional';

CREATE INDEX IF NOT EXISTS idx_agenda_atendida ON public.agenda (atendida);
CREATE INDEX IF NOT EXISTS idx_agenda_profesional_fecha_atendida
  ON public.agenda (id_profesional, fecha, atendida);

-- =============================================================================
-- 20260808_000005_fix_agenda_hora_time_overload.sql
-- Hotfix: el trigger llama agenda_hora_a_minutos(time) y solo existía (text).
-- Error: function agenda_hora_a_minutos(time without time zone) does not exist
-- Ejecutar en Supabase → SQL Editor.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.agenda_hora_a_minutos(h time)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN h IS NULL THEN NULL
    ELSE (EXTRACT(HOUR FROM h)::integer * 60) + EXTRACT(MINUTE FROM h)::integer
  END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_hora_a_minutos(h text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  parts text[];
  hh integer;
  mm integer;
BEGIN
  IF h IS NULL OR btrim(h) = '' THEN
    RETURN NULL;
  END IF;
  parts := string_to_array(split_part(h, '.', 1), ':');
  hh := parts[1]::integer;
  mm := COALESCE(NULLIF(parts[2], '')::integer, 0);
  IF hh IS NULL OR mm IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN hh * 60 + mm;
END;
$$;

CREATE OR REPLACE FUNCTION public.agenda_franjas_se_solapan(
  inicio_a time, fin_a time, inicio_b time, fin_b time
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    agenda_hora_a_minutos(inicio_a) IS NOT NULL
    AND agenda_hora_a_minutos(fin_a) IS NOT NULL
    AND agenda_hora_a_minutos(inicio_b) IS NOT NULL
    AND agenda_hora_a_minutos(fin_b) IS NOT NULL
    AND agenda_hora_a_minutos(inicio_a) < agenda_hora_a_minutos(fin_b)
    AND agenda_hora_a_minutos(inicio_b) < agenda_hora_a_minutos(fin_a);
$$;

CREATE OR REPLACE FUNCTION public.agenda_franjas_se_solapan(
  inicio_a text, fin_a text, inicio_b text, fin_b text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT public.agenda_franjas_se_solapan(
    NULLIF(btrim(inicio_a), '')::time,
    NULLIF(btrim(fin_a), '')::time,
    NULLIF(btrim(inicio_b), '')::time,
    NULLIF(btrim(fin_b), '')::time
  );
$$;

CREATE OR REPLACE FUNCTION public.agenda_impedir_solape()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  choque agenda%ROWTYPE;
BEGIN
  IF NEW.hora_inicio IS NULL OR NEW.hora_fin IS NULL THEN
    RAISE EXCEPTION 'Horario inválido';
  END IF;
  IF NEW.hora_fin <= NEW.hora_inicio THEN
    RAISE EXCEPTION 'La hora final debe ser posterior a la hora de inicio';
  END IF;

  SELECT * INTO choque
  FROM agenda a
  WHERE a.id_profesional = NEW.id_profesional
    AND a.fecha = NEW.fecha
    AND (TG_OP = 'INSERT' OR a.id IS DISTINCT FROM NEW.id)
    AND public.agenda_franjas_se_solapan(
      NEW.hora_inicio, NEW.hora_fin,
      a.hora_inicio, a.hora_fin
    )
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Ya existe una cita que se solapa en ese horario';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agenda_impedir_solape ON public.agenda;
CREATE TRIGGER trg_agenda_impedir_solape
  BEFORE INSERT OR UPDATE OF fecha, hora_inicio, hora_fin, id_profesional
  ON public.agenda
  FOR EACH ROW
  EXECUTE PROCEDURE public.agenda_impedir_solape();

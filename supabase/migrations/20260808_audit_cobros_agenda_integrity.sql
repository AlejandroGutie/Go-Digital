-- Go-Digital: cobros/agenda integrity (safe with existing data)
-- Run in Supabase SQL Editor.

ALTER TABLE agenda
  ADD COLUMN IF NOT EXISTS cobrada boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_agenda_cobrada ON agenda (cobrada);
CREATE INDEX IF NOT EXISTS idx_agenda_profesional_fecha ON agenda (id_profesional, fecha);
CREATE INDEX IF NOT EXISTS idx_agenda_profesional_fecha_cobrada ON agenda (id_profesional, fecha, cobrada);
CREATE INDEX IF NOT EXISTS idx_cobro_fecha_estado ON cobro (fecha_cobro, estado);
CREATE INDEX IF NOT EXISTS idx_cobro_profesional_fecha ON cobro (id_profesional, fecha_cobro);
CREATE INDEX IF NOT EXISTS idx_cobro_id_agenda ON cobro (id_agenda);

-- Deduplicate vigentes before unique index
WITH vigentes AS (
  SELECT id, id_agenda,
    ROW_NUMBER() OVER (PARTITION BY id_agenda ORDER BY id DESC) AS rn
  FROM cobro
  WHERE estado IS DISTINCT FROM 'anulado' AND id_agenda IS NOT NULL
),
duplicados AS (SELECT id FROM vigentes WHERE rn > 1)
UPDATE cobro c SET estado = 'anulado'
FROM duplicados d WHERE c.id = d.id;

UPDATE agenda a
SET cobrada = EXISTS (
  SELECT 1 FROM cobro c
  WHERE c.id_agenda = a.id AND c.estado IS DISTINCT FROM 'anulado'
);

DROP INDEX IF EXISTS uq_cobro_agenda_vigente;
CREATE UNIQUE INDEX uq_cobro_agenda_vigente
  ON cobro (id_agenda)
  WHERE estado IS DISTINCT FROM 'anulado';

CREATE OR REPLACE FUNCTION agenda_hora_a_minutos(h text)
RETURNS integer LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE parts text[]; hh integer; mm integer;
BEGIN
  IF h IS NULL OR btrim(h) = '' THEN RETURN NULL; END IF;
  parts := string_to_array(split_part(h, '.', 1), ':');
  hh := parts[1]::integer;
  mm := COALESCE(NULLIF(parts[2], '')::integer, 0);
  IF hh IS NULL OR mm IS NULL THEN RETURN NULL; END IF;
  RETURN hh * 60 + mm;
END;
$$;

CREATE OR REPLACE FUNCTION agenda_franjas_se_solapan(
  inicio_a text, fin_a text, inicio_b text, fin_b text
) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT agenda_hora_a_minutos(inicio_a) IS NOT NULL
    AND agenda_hora_a_minutos(fin_a) IS NOT NULL
    AND agenda_hora_a_minutos(inicio_b) IS NOT NULL
    AND agenda_hora_a_minutos(fin_b) IS NOT NULL
    AND agenda_hora_a_minutos(inicio_a) < agenda_hora_a_minutos(fin_b)
    AND agenda_hora_a_minutos(inicio_b) < agenda_hora_a_minutos(fin_a);
$$;

CREATE OR REPLACE FUNCTION create_cobro_atomico(
  p_id_agenda bigint, p_id_profesional bigint, p_id_mascota bigint, p_id_tarifa bigint,
  p_valor numeric, p_metodo_pago text, p_observacion text, p_fecha_cobro date
) RETURNS cobro LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE a agenda%ROWTYPE; nuevo cobro%ROWTYPE;
BEGIN
  IF p_id_agenda IS NULL OR p_id_profesional IS NULL OR p_id_mascota IS NULL THEN
    RAISE EXCEPTION 'Campos requeridos inválidos';
  END IF;
  IF p_valor IS NULL OR p_valor < 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;

  SELECT * INTO a FROM agenda WHERE id = p_id_agenda FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agenda no encontrada'; END IF;
  IF a.cobrada IS TRUE THEN RAISE EXCEPTION 'La agenda ya fue cobrada'; END IF;
  IF a.id_profesional IS DISTINCT FROM p_id_profesional THEN
    RAISE EXCEPTION 'El profesional no coincide con la agenda';
  END IF;
  IF a.id_mascota IS DISTINCT FROM p_id_mascota THEN
    RAISE EXCEPTION 'La mascota no coincide con la agenda';
  END IF;
  IF EXISTS (
    SELECT 1 FROM cobro WHERE id_agenda = p_id_agenda AND estado IS DISTINCT FROM 'anulado'
  ) THEN RAISE EXCEPTION 'Ya existe un cobro vigente para esta agenda'; END IF;

  INSERT INTO cobro (
    id_agenda, id_profesional, id_mascota, id_tarifa,
    valor, metodo_pago, observacion, fecha_cobro
  ) VALUES (
    p_id_agenda, p_id_profesional, p_id_mascota, p_id_tarifa,
    p_valor, NULLIF(btrim(COALESCE(p_metodo_pago, '')), ''),
    NULLIF(btrim(COALESCE(p_observacion, '')), ''),
    COALESCE(p_fecha_cobro, CURRENT_DATE)
  ) RETURNING * INTO nuevo;

  UPDATE agenda SET cobrada = true WHERE id = p_id_agenda;
  RETURN nuevo;
END;
$$;

GRANT EXECUTE ON FUNCTION create_cobro_atomico(
  bigint, bigint, bigint, bigint, numeric, text, text, date
) TO authenticated;

CREATE OR REPLACE FUNCTION anular_cobro_atomico(p_id_cobro bigint)
RETURNS cobro LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE c cobro%ROWTYPE; vigentes integer;
BEGIN
  SELECT * INTO c FROM cobro WHERE id = p_id_cobro FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cobro no encontrado'; END IF;
  IF c.estado = 'anulado' THEN RETURN c; END IF;

  UPDATE cobro SET estado = 'anulado' WHERE id = p_id_cobro RETURNING * INTO c;

  SELECT COUNT(*) INTO vigentes FROM cobro
  WHERE id_agenda = c.id_agenda AND estado IS DISTINCT FROM 'anulado';

  IF vigentes = 0 AND c.id_agenda IS NOT NULL THEN
    UPDATE agenda SET cobrada = false WHERE id = c.id_agenda;
  END IF;
  RETURN c;
END;
$$;

GRANT EXECUTE ON FUNCTION anular_cobro_atomico(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION agenda_impedir_solape()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE choque agenda%ROWTYPE;
BEGIN
  IF agenda_hora_a_minutos(NEW.hora_inicio) IS NULL
     OR agenda_hora_a_minutos(NEW.hora_fin) IS NULL THEN
    RAISE EXCEPTION 'Horario inválido';
  END IF;
  IF agenda_hora_a_minutos(NEW.hora_fin) <= agenda_hora_a_minutos(NEW.hora_inicio) THEN
    RAISE EXCEPTION 'La hora final debe ser posterior a la hora de inicio';
  END IF;

  SELECT * INTO choque FROM agenda a
  WHERE a.id_profesional = NEW.id_profesional
    AND a.fecha = NEW.fecha
    AND (TG_OP = 'INSERT' OR a.id IS DISTINCT FROM NEW.id)
    AND agenda_franjas_se_solapan(NEW.hora_inicio, NEW.hora_fin, a.hora_inicio, a.hora_fin)
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Ya existe una cita que se solapa en ese horario';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agenda_impedir_solape ON agenda;
CREATE TRIGGER trg_agenda_impedir_solape
  BEFORE INSERT OR UPDATE OF fecha, hora_inicio, hora_fin, id_profesional
  ON agenda FOR EACH ROW EXECUTE PROCEDURE agenda_impedir_solape();

-- NOTE: Do NOT create open USING(true) policies here.
-- Apply tenant RLS from 20260808_rls_tenant_owner_policies.sql

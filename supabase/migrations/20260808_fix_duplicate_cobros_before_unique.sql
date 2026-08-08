-- Fix duplicate viable cobros before unique index.
-- Keeps highest id per agenda; marks other vigentes as anulado.

WITH vigentes AS (
  SELECT id, id_agenda,
    ROW_NUMBER() OVER (PARTITION BY id_agenda ORDER BY id DESC) AS rn
  FROM cobro
  WHERE estado IS DISTINCT FROM 'anulado'
    AND id_agenda IS NOT NULL
),
duplicados AS (SELECT id FROM vigentes WHERE rn > 1)
UPDATE cobro c
SET estado = 'anulado'
FROM duplicados d
WHERE c.id = d.id;

UPDATE agenda a
SET cobrada = EXISTS (
  SELECT 1 FROM cobro c
  WHERE c.id_agenda = a.id AND c.estado IS DISTINCT FROM 'anulado'
);

DROP INDEX IF EXISTS uq_cobro_agenda_vigente;
CREATE UNIQUE INDEX uq_cobro_agenda_vigente
  ON cobro (id_agenda)
  WHERE estado IS DISTINCT FROM 'anulado';

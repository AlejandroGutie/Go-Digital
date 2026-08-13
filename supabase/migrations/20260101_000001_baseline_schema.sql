-- =============================================================================
-- 20260101_000001_baseline_schema.sql
-- Esquema multi-tenant alineado al ERD actual de Go-Digital.
-- Idempotente: seguro en BD nueva o ya existente (CREATE IF NOT EXISTS).
-- No incluye políticas RLS abiertas; ver migración 20260808_000004.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE public.cobro_estado AS ENUM ('pendiente', 'pagado', 'anulado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----- mascota -----
CREATE TABLE IF NOT EXISTS public.mascota (
  id               BIGSERIAL PRIMARY KEY,
  user_id          UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre           TEXT NOT NULL,
  especie          TEXT NOT NULL,
  raza             TEXT NOT NULL,
  tamano           TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_nacimiento DATE NULL
);

-- ----- cuidador -----
CREATE TABLE IF NOT EXISTS public.cuidador (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre     TEXT NOT NULL,
  telefono   TEXT NOT NULL,
  direccion  TEXT NULL,
  email      TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----- profesional -----
CREATE TABLE IF NOT EXISTS public.profesional (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre     TEXT NOT NULL,
  telefono   TEXT NOT NULL,
  activo     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----- cuidador_mascota (PK compuesta) -----
CREATE TABLE IF NOT EXISTS public.cuidador_mascota (
  id_mascota   BIGINT NOT NULL REFERENCES public.mascota(id) ON DELETE CASCADE,
  id_cuidador  BIGINT NOT NULL REFERENCES public.cuidador(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  activo       BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (id_mascota, id_cuidador)
);

-- ----- tarifa -----
CREATE TABLE IF NOT EXISTS public.tarifa (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  id_profesional BIGINT NOT NULL REFERENCES public.profesional(id) ON DELETE CASCADE,
  descripcion    TEXT NOT NULL,
  valor          NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  activo         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----- agenda -----
CREATE TABLE IF NOT EXISTS public.agenda (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  id_profesional BIGINT NOT NULL REFERENCES public.profesional(id) ON DELETE CASCADE,
  id_mascota     BIGINT NOT NULL REFERENCES public.mascota(id) ON DELETE CASCADE,
  fecha          DATE NOT NULL,
  hora_inicio    TIME NOT NULL,
  hora_fin       TIME NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  id_tarifa      BIGINT NULL REFERENCES public.tarifa(id) ON DELETE SET NULL,
  cobrada        BOOLEAN NOT NULL DEFAULT false,
  atendida       BOOLEAN NOT NULL DEFAULT false,
  CHECK (hora_fin > hora_inicio)
);

-- ----- cobro -----
CREATE TABLE IF NOT EXISTS public.cobro (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  id_agenda      BIGINT NOT NULL REFERENCES public.agenda(id) ON DELETE RESTRICT,
  id_profesional BIGINT NOT NULL REFERENCES public.profesional(id) ON DELETE RESTRICT,
  id_mascota     BIGINT NOT NULL REFERENCES public.mascota(id) ON DELETE RESTRICT,
  id_tarifa      BIGINT NULL REFERENCES public.tarifa(id) ON DELETE SET NULL,
  valor          NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  metodo_pago    TEXT NULL,
  observacion    TEXT NULL,
  fecha_cobro    DATE NOT NULL DEFAULT CURRENT_DATE,
  estado         public.cobro_estado NOT NULL DEFAULT 'pendiente',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices base
CREATE INDEX IF NOT EXISTS idx_mascota_user ON public.mascota (user_id);
CREATE INDEX IF NOT EXISTS idx_cuidador_user ON public.cuidador (user_id);
CREATE INDEX IF NOT EXISTS idx_profesional_user ON public.profesional (user_id);
CREATE INDEX IF NOT EXISTS idx_tarifa_profesional ON public.tarifa (id_profesional);
CREATE INDEX IF NOT EXISTS idx_agenda_prof_fecha ON public.agenda (id_profesional, fecha);
CREATE INDEX IF NOT EXISTS idx_agenda_cobrada ON public.agenda (cobrada);
CREATE INDEX IF NOT EXISTS idx_agenda_atendida ON public.agenda (atendida);
CREATE INDEX IF NOT EXISTS idx_agenda_id_tarifa ON public.agenda (id_tarifa);
CREATE INDEX IF NOT EXISTS idx_cobro_estado ON public.cobro (estado);
CREATE INDEX IF NOT EXISTS idx_cobro_fecha ON public.cobro (fecha_cobro);
CREATE INDEX IF NOT EXISTS idx_cobro_id_agenda ON public.cobro (id_agenda);
CREATE INDEX IF NOT EXISTS idx_cobro_profesional_fecha ON public.cobro (id_profesional, fecha_cobro);

COMMENT ON COLUMN public.agenda.cobrada IS
  'true cuando hay cobro vigente; no oculta la cita de la agenda activa';

COMMENT ON COLUMN public.agenda.atendida IS
  'true cuando se accionó Mascota lista; oculta la cita de la agenda activa';

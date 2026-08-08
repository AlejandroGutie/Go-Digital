-- =============================================================================
-- 20260808_000004_rls_tenant_policies.sql
-- RLS final: auth.uid() = user_id. Elimina políticas abiertas/duplicadas.
-- Triggers fijan y protegen user_id (el frontend no lo envía).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_tenant_user_id()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  IF NEW.user_id IS NULL THEN NEW.user_id := auth.uid(); END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'user_id no coincide con el usuario autenticado';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_user_id_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'No se puede cambiar user_id';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agenda','cobro','cuidador','cuidador_mascota','mascota','profesional','tarifa'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN user_id SET DEFAULT auth.uid()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_set_user_id ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_set_user_id BEFORE INSERT ON public.%I
       FOR EACH ROW EXECUTE PROCEDURE public.set_tenant_user_id()', t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_keep_user_id ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_keep_user_id BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE PROCEDURE public.prevent_user_id_change()', t, t);
  END LOOP;
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'agenda','cobro','cuidador','cuidador_mascota','mascota','profesional','tarifa'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

ALTER TABLE public.agenda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuidador ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuidador_mascota ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mascota ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profesional ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarifa ENABLE ROW LEVEL SECURITY;

CREATE POLICY profesional_select ON public.profesional FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY profesional_insert ON public.profesional FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY profesional_update ON public.profesional FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY profesional_delete ON public.profesional FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY mascota_select ON public.mascota FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY mascota_insert ON public.mascota FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY mascota_update ON public.mascota FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY mascota_delete ON public.mascota FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY cuidador_select ON public.cuidador FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY cuidador_insert ON public.cuidador FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY cuidador_update ON public.cuidador FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY cuidador_delete ON public.cuidador FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY cuidador_mascota_select ON public.cuidador_mascota FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY cuidador_mascota_insert ON public.cuidador_mascota FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.mascota m WHERE m.id = id_mascota AND m.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.cuidador c WHERE c.id = id_cuidador AND c.user_id = auth.uid())
);
CREATE POLICY cuidador_mascota_update ON public.cuidador_mascota FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.mascota m WHERE m.id = id_mascota AND m.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.cuidador c WHERE c.id = id_cuidador AND c.user_id = auth.uid())
);
CREATE POLICY cuidador_mascota_delete ON public.cuidador_mascota FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY tarifa_select ON public.tarifa FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY tarifa_insert ON public.tarifa FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.profesional p WHERE p.id = id_profesional AND p.user_id = auth.uid())
);
CREATE POLICY tarifa_update ON public.tarifa FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.profesional p WHERE p.id = id_profesional AND p.user_id = auth.uid())
);
CREATE POLICY tarifa_delete ON public.tarifa FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY agenda_select ON public.agenda FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY agenda_insert ON public.agenda FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.profesional p WHERE p.id = id_profesional AND p.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.mascota m WHERE m.id = id_mascota AND m.user_id = auth.uid())
  AND (id_tarifa IS NULL OR EXISTS (SELECT 1 FROM public.tarifa t WHERE t.id = id_tarifa AND t.user_id = auth.uid()))
);
CREATE POLICY agenda_update ON public.agenda FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.profesional p WHERE p.id = id_profesional AND p.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.mascota m WHERE m.id = id_mascota AND m.user_id = auth.uid())
  AND (id_tarifa IS NULL OR EXISTS (SELECT 1 FROM public.tarifa t WHERE t.id = id_tarifa AND t.user_id = auth.uid()))
);
CREATE POLICY agenda_delete ON public.agenda FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY cobro_select ON public.cobro FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY cobro_insert ON public.cobro FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.agenda a WHERE a.id = id_agenda AND a.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.profesional p WHERE p.id = id_profesional AND p.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.mascota m WHERE m.id = id_mascota AND m.user_id = auth.uid())
  AND (id_tarifa IS NULL OR EXISTS (SELECT 1 FROM public.tarifa t WHERE t.id = id_tarifa AND t.user_id = auth.uid()))
);
CREATE POLICY cobro_update ON public.cobro FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY cobro_delete ON public.cobro FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER FUNCTION public.create_cobro_atomico(bigint,bigint,bigint,bigint,numeric,text,text,date) SECURITY INVOKER;
ALTER FUNCTION public.anular_cobro_atomico(bigint) SECURITY INVOKER;
GRANT EXECUTE ON FUNCTION public.create_cobro_atomico(bigint,bigint,bigint,bigint,numeric,text,text,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.anular_cobro_atomico(bigint) TO authenticated;

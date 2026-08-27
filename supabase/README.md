# Supabase — Go-Digital

Historial SQL alineado al esquema multi-tenant del proyecto.

## Modelo (ERD)

| Tabla | Rol |
|-------|-----|
| `mascota` | Mascotas del negocio (`fecha_nacimiento` opcional) |
| `cuidador` | Cuidadores / tutores |
| `cuidador_mascota` | Relación N:N cuidador ↔ mascota |
| `profesional` | Profesionales (`hora_inicio_jornada` / `hora_fin_jornada`, default 08:00–18:00) |
| `tarifa` | Tarifas por profesional (baja = soft-delete `activo=false`) |
| `agenda` | Citas (`cobrada` = cobro, `atendida` = Mascota lista; tarifas N vía `agenda_tarifa`; `observacion_ingreso` = notas de ingreso) |
| `agenda_tarifa` | N tarifas por cita (`id_agenda` + `id_tarifa`) |
| `cobro` | Cobros ligados a agenda (`estado` = enum; `id_tarifa` = primera / legacy) |
| `cobro_detalle` | Desglose de tarifas/items del cobro |

Todas las tablas tienen `user_id → auth.users(id)` (aislamiento por tenant).

## Orden de aplicación

Ejecutar en **Supabase → SQL Editor** en este orden (idempotente; se puede re-ejecutar con cuidado):

1. `migrations/20260101_000001_baseline_schema.sql` — tablas, enum, índices base  
2. `migrations/20260806_000001_add_fecha_nacimiento_mascota.sql`  
3. `migrations/20260807_000001_add_id_tarifa_agenda.sql`  
4. `migrations/20260808_000001_add_cobrada_agenda.sql`  
5. `migrations/20260808_000002_cobros_integrity_rpcs.sql` — dedupe, unique vigente, RPCs cobro, solape  
6. `migrations/20260808_000003_informes_rpcs.sql` — dashboard / exportación agendas  
7. `migrations/20260808_000004_rls_tenant_policies.sql` — RLS `auth.uid() = user_id` + triggers `user_id`  
8. `migrations/20260808_000005_fix_agenda_hora_time_overload.sql` — overload `agenda_hora_a_minutos(time)` (hotfix solape)  
9. `migrations/20260812_000001_add_atendida_agenda.sql` — flag `atendida` (Mascota lista)  
10. `migrations/20260812_000002_audit_hardening_agenda_cobro.sql` — solape libera atendidas, anular reabre, RPC crear+cobrar  
11. `migrations/20260813_000001_audit_remediation_ciclo_cita.sql` — CHECK atendida⇒cobrada, EXCLUDE solape, inmutabilidad cobrada, cobro pagado, RPC `marcar_agenda_atendida`, anular vs cupo reutilizado  
12. `migrations/20260826_000001_multi_tarifas_agenda_cobro.sql` — `agenda_tarifa`, `cobro_detalle`, RPCs con `p_id_tarifas bigint[]`, backfill legacy  
13. `migrations/20260826_000002_grant_multi_tarifas.sql` — GRANTs a `authenticated` (evita error 42501 en formularios)  
14. `migrations/20260826_000003_agenda_informe_cuidadores.sql` — `get_agenda_informe` incluye `cuidador_nombre`  
15. `migrations/20260826_000004_agenda_observacion_ingreso.sql` — `agenda.observacion_ingreso` + RPC crear+cobrar  
16. `migrations/20260826_000005_profesional_jornada.sql` — `hora_inicio_jornada` / `hora_fin_jornada` (default 08:00–18:00)

### BD nueva

Aplica **1 → 16** en orden.

### BD de producción (ya aplicada)

Si ya tienes hasta `20260813`, ejecuta **12 → 16**.  
Si ya corriste `20260826_000001` y ves “No tienes permiso…”, ejecuta el paso **13**.  
Para ver cuidadores en el informe de agendas vía RPC, ejecuta el paso **14**.  
Para observaciones de ingreso en citas, ejecuta el paso **15**.  
Para jornada del profesional y slots de 30 min en agendas, ejecuta el paso **16**.

## Comportamiento importante

- **Quitar cita** = `DELETE` en `agenda` (histórico se pierde). Bloqueado si hay cobro vigente o `cobrada`.
- **Cobrar / Agendar y Cobrar** = RPC atómico multi-tarifa (`p_id_tarifas`); cobro nace en `estado = pagado`, con filas en `cobro_detalle`, y `agenda.cobrada = true`.
- **Tarifas** = N por cita (`agenda_tarifa`); `agenda.id_tarifa` / `cobro.id_tarifa` conservan la primera tarifa por compatibilidad.
- **Mascota lista** = RPC `marcar_agenda_atendida` (exige `cobrada`); oculta la cita y libera el cupo. WhatsApp es opcional (no bloquea el archivo).
- **Anular cobro** = RPC `anular_cobro_atomico`: pone `cobrada = false` y reabre `atendida = false` **solo si** el cupo no fue reutilizado; si hay choque, deja la cita archivada.
- **Solape** = trigger + `EXCLUDE` GiST (profesional y mascota) sobre citas no atendidas.
- **Cita cobrada** = inmutable (fecha/hora/profesional/mascota/tarifa) hasta anular el cobro.
- Un solo cobro **vigente** por agenda (`uq_cobro_agenda_vigente`).
- El frontend es **fail-closed** si faltan los RPCs (no hay fallback parcial).
- El frontend **no envía** `user_id`; lo fijan default + triggers en la migración RLS.

## Qué no va aquí

- Scripts con `DROP TABLE` destructivos
- Políticas `USING (true)` (abiertas)
- Borradores / duplicados de trabajo local

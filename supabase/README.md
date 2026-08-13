# Supabase — Go-Digital

Historial SQL alineado al esquema multi-tenant del proyecto.

## Modelo (ERD)

| Tabla | Rol |
|-------|-----|
| `mascota` | Mascotas del negocio (`fecha_nacimiento` opcional) |
| `cuidador` | Cuidadores / tutores |
| `cuidador_mascota` | Relación N:N cuidador ↔ mascota |
| `profesional` | Profesionales que atienden |
| `tarifa` | Tarifas por profesional (baja = soft-delete `activo=false`) |
| `agenda` | Citas (`id_tarifa`, `cobrada` = cobro, `atendida` = Mascota lista → oculta de activa) |
| `cobro` | Cobros ligados a agenda (`estado` = enum `cobro_estado`; nuevos = `pagado`) |

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

### BD nueva

Aplica **1 → 11** en orden.

### BD de producción (ya aplicada)

Si ya tienes hasta `20260812_000002`, ejecuta **solo** `20260813_000001_audit_remediation_ciclo_cita.sql`.

## Comportamiento importante

- **Quitar cita** = `DELETE` en `agenda` (histórico se pierde). Bloqueado si hay cobro vigente o `cobrada`.
- **Cobrar / Agendar y Cobrar** = RPC atómico; cobro nace en `estado = pagado` y `agenda.cobrada = true` (la cita **sigue** en la agenda activa).
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

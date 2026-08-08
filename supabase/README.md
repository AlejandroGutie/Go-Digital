# Supabase — Go-Digital

Historial SQL alineado al esquema multi-tenant del proyecto.

## Modelo (ERD)

| Tabla | Rol |
|-------|-----|
| `mascota` | Mascotas del negocio (`fecha_nacimiento` opcional) |
| `cuidador` | Cuidadores / tutores |
| `cuidador_mascota` | Relación N:N cuidador ↔ mascota |
| `profesional` | Profesionales que atienden |
| `tarifa` | Tarifas por profesional |
| `agenda` | Citas (`id_tarifa` opcional, `cobrada` para ocultar cobradas) |
| `cobro` | Cobros ligados a agenda (`estado` = enum `cobro_estado`) |

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

### BD nueva

Puedes aplicar **1 → 7**. El baseline ya incluye columnas posteriores; las migraciones 2–4 son no-ops (`IF NOT EXISTS`).

### BD de producción (ya aplicada)

No hace falta reaplicar todo. Usa este historial como fuente de verdad y referencia. Si falta algo puntual, aplica solo el archivo correspondiente.

## Comportamiento importante

- **Quitar cita** = `DELETE` en `agenda` (histórico se pierde).
- **Cobrar** = inserta `cobro` y pone `agenda.cobrada = true` (RPC `create_cobro_atomico`).
- **Anular cobro** = RPC `anular_cobro_atomico` (restaura `cobrada` si no queda vigente).
- Un solo cobro **vigente** por agenda (`uq_cobro_agenda_vigente`).
- El frontend **no envía** `user_id`; lo fijan default + triggers en la migración RLS.

## Qué no va aquí

- Scripts con `DROP TABLE` destructivos
- Políticas `USING (true)` (abiertas)
- Borradores / duplicados de trabajo local

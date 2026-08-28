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
17. `migrations/20260827_000001_create_cobro_estado.sql` — `create_cobro_atomico` con `p_estado` (pagado|pendiente)  
18. `migrations/20260827_000002_fix_create_cobro_estado_cast.sql` — fix cast a enum `cobro_estado`  
19. `migrations/20260827_000003_restaurar_cobro_atomico.sql` — RPC restaurar cobro anulado → pendiente  
20. `migrations/20260827_000004_devolver_pago_cobro.sql` — RPC devolver pago + ajuste trigger protección  
21. `migrations/20260827_000005_actualizar_cobro_pendiente.sql` — RPC editar cobro pendiente  
22. `migrations/20260827_000006_agenda_cancelacion.sql` — cancelar agenda (sin DELETE) + libera cupo  
23. `migrations/20260827_000007_crear_cita_y_cobrar_estado.sql` — `crear_cita_y_cobrar_atomico` con `p_estado` (pendiente|pagado)  
24. `migrations/20260827_000008_mascota_lista_independiente_pago.sql` — Mascota lista sin exigir cobrada; archiva en UI solo si también está pagada
25. `migrations/20260827_000009_mascota_eliminacion_check.sql` — RPC validación eliminación mascota (cobros bloqueantes, alineado con FK)
26. `migrations/20260828_000010_cancelar_agenda_anula_cobro.sql` — cancelar agenda anula cobro vigente automáticamente
27. `migrations/20260828_000011_reprogramar_agenda_cobro_pendiente.sql` — reprogramar cita con cobro pendiente
28. `migrations/20260828_000012_informe_fidelizacion.sql` — RPC fidelización + tabla de contactos WhatsApp
29. `migrations/20260828_000013_informes_audit_metrics.sql` — auditoría métricas (excluir canceladas, rangos inclusivos, fidelización v2)

### BD nueva

Aplica **1 → 29** en orden.

### BD de producción (ya aplicada)

Si ya tienes hasta `20260813`, ejecuta **12 → 20**.  
Si ya corriste `20260826_000001` y ves “No tienes permiso…”, ejecuta el paso **13**.  
Para ver cuidadores en el informe de agendas vía RPC, ejecuta el paso **14**.  
Para observaciones de ingreso en citas, ejecuta el paso **15**.  
Para jornada del profesional y slots de 30 min en agendas, ejecuta el paso **16**.  
Para crear cobros como pagado/pendiente desde el modal, ejecuta **17–18**.  
Para restaurar cobros anulados (sin borrado físico), ejecuta el paso **19**.  
Para devolver pagos (pagado → pendiente), ejecuta el paso **20** (`20260827_000004_devolver_pago_cobro.sql`).  
Para editar cobros pendientes (tarifas/valor/método), ejecuta el paso **21** (`20260827_000005_actualizar_cobro_pendiente.sql`).  
Para cancelar agendas (sin borrado físico), ejecuta el paso **22** (`20260827_000006_agenda_cancelacion.sql`).  
Para Agendar (cobro pendiente) / Agendar y Pagar (cobro pagado) atómicos, ejecuta el paso **23** (`20260827_000007_crear_cita_y_cobrar_estado.sql`).  
Para Mascota lista independiente del pago, ejecuta el paso **24** (`20260827_000008_mascota_lista_independiente_pago.sql`).  
Para validación fiable de eliminación de mascotas (cobros bloqueantes), ejecuta el paso **25** (`20260827_000009_mascota_eliminacion_check.sql`).  
Para cancelar citas con anulación automática del cobro, ejecuta el paso **26** (`20260828_000010_cancelar_agenda_anula_cobro.sql`).  
Para reprogramar citas con cobro pendiente, ejecuta el paso **27** (`20260828_000011_reprogramar_agenda_cobro_pendiente.sql`).  
Para el informe de Fidelización (cumpleaños/mesarios e hitos), ejecuta el paso **28** (`20260828_000012_informe_fidelizacion.sql`).  
Para correcciones de auditoría en métricas de informes, ejecuta el paso **29** (`20260828_000013_informes_audit_metrics.sql`).

## Comportamiento importante

- **Cancelar cita** = soft-cancel (`cancelada=true`); libera cupo y anula el cobro vigente (pendiente o pagado). Bloqueado solo si ya está cancelada o marcada Mascota lista.
- **Reprogramar cita** = permitido con cobro `pendiente` (aunque `cobrada=true`); bloqueado si cobro `pagado`, cancelada o Mascota lista.
- **Fidelización** = RPC `get_informe_fidelizacion` (v2 tras migración 29): cumpleaños/mesarios; hitos por visitas `atendida` no canceladas. En «Todos» prioriza hito global y, si no aplica, hito por profesional.
- **Informes financieros** = ingresos/atenciones excluyen cobros `anulado`; `total_ingresos` incluye pendiente + pagado (facturación), no solo caja. Citas en agenda excluyen canceladas.
- **Agendar** = RPC atómico agenda + cobro en `estado = pendiente` + confirma por WhatsApp; `agenda.cobrada = true`.
- **Agendar y Pagar** = mismo RPC con `estado = pagado` + confirma por WhatsApp.
- **Cobrar / Pagar** (cita existente) = marca cobro `pagado` (o crea cobro vía RPC).
- **Tarifas** = N por cita (`agenda_tarifa`); `agenda.id_tarifa` / `cobro.id_tarifa` conservan la primera tarifa por compatibilidad.
- **Mascota lista** = RPC `marcar_agenda_atendida` (independiente del pago). La cita **permanece en vista activa** si el cobro sigue pendiente; se archiva solo con `atendida=true` **y** cobro `pagado`. WhatsApp es opcional.
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

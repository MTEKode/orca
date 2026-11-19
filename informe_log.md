# Informe — Fallos de comunicación workers ↔ orquestador

**Run:** `run_bb704f2e21c3` (Mejora del MTE Flow) · **Rama:** `mte/flow-overhaul`
**Fecha:** 2026-11-19 · **Coordinador:** OpenCode/GLM-5.3 en sesión CLI (sin terminal Orca)
**Horas:** aproximadas, hora local (CET)

## Resumen ejecutivo

Durante la ejecución paralela del run, la dirección **workers → orquestador** falló
repetidamente: los mensajes (`ask`, `worker_done`, `status`) SÍ llegaban al buzón del run,
pero el orquestador no podía recibirlos ni ser despertado, porque el modelo de
comunicación de Orca asume que el coordinador corre dentro de un terminal Orca con
identidad de panel estable. En una sesión CLI (OpenCode lanzado a mano) esa identidad no
existe: `check` falla, el "wake" nunca llega, y `reply` está vetado. Además, la identidad
ambiental de sender que funcionó al inicio de la sesión **expiró a mitad** sin aviso, y
los dispatches a worktrees hijos fallaron en la entrega del preámbulo
(`providerRejected`) dejando recursos residuales. Todo se detectó de forma reactiva
(cuando el usuario preguntó "¿cómo vamos?" o cuando un comando fallaba), nunca por
notificación.

## Incidente 1 — El `ask` de T2 quedó sin entregar y el orquestador no se enteró

El caso más grave: una worker bloqueada esperando respuesta que nunca llegaba.

| Hora         | Evento                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ~17:01       | Wave 1 dispatchada (T1, T2, T7) sin `--from`; todo funciona                                                                                            |
| ~17:05–17:10 | T2 reescribe las personas, detecta 2 contradicciones de spec y envía un `ask` (`msg_e2adfa57fb16`) al orquestador                                      |
| —            | El mensaje llega al buzón del run y queda `[unhandled]`. **Ningún wake llega al orquestador**                                                          |
| ~17:10–17:20 | T2 queda idle (`attention=input`, `activity=idle`, "14m ago"), bloqueada esperando input                                                               |
| ~17:20       | El usuario pregunta "¿cómo vamos?"; el orquestador investiga y descubre el ask manualmente con `worker-show` + `inbox --terminal run:run_bb704f2e21c3` |
| ~17:25       | `reply` imposible (ver incidente 3); se responde con `send --from run:run_bb704f2e21c3` (`msg_e5a9050a7cdc`) y T2 reanuda                              |

**Impacto:** ~15 minutos de T2 parada; el `ask` quedó formalmente `[unhandled]` para
siempre (el `send` no resuelve la pregunta pendiente).

**Causa raíz:** `orca orchestration check` (el comando que drena el buzón y dispara los
wakes) requiere un terminal Orca del llamador: desde la sesión CLI falla con
`no_active_sender_terminal`. El buzón solo se podía leer con el truco
`inbox --terminal run:<runId>`, que no consume ni despierta.

## Incidente 2 — Expiración silenciosa de la identidad de sender

- ~17:01: `run-use`, 3× `worker-start` y 3× `send` funcionan **sin** `--from` (identidad
  ambiental heredada del arranque de la sesión).
- ~17:30: los mismos comandos sin `--from` empiezan a fallar con
  `no_active_sender_terminal`. Nada avisó del cambio; se descubrió al fallar.
- Un `worker-start --from run:run_bb704f2e21c3` de rebote devolvió `consumer_fenced`
  ("needs the coordinator bound to the Run").

**Fix aplicado:** crear un terminal Orca propio (`mte-coordinator`,
`term_cdfc4565-4b6b-4a27-891e-4bb5360bce7b`, comando `sleep`, sin robar foco), re-bindear
el run con `run-use` desde él, y exportar `ORCA_TERMINAL_HANDLE` en cada shell antes de
cualquier mutación de orquestación.

## Incidente 3 — `reply` imposible desde una sesión CLI

`orca orchestration reply --from run:run_bb704f2e21c3` → `stable_pane_required`: "The
coordinator terminal has no stable pane identity". El pseudo-terminal `run:` sirve como
`--from` para `send`, pero el camino nativo de responder preguntas queda inutilizable, así
que las respuestas a workers se hacen con `send --to dispatch:<id>`, que no marca el `ask`
como resuelto.

## Incidente 4 — Dispatches a worktrees hijos: 3 intentos, 2 códigos de error y recursos residuales

Intento de lanzar T4/T5/T9 en `--worktree new-child` (3 dispatches simultáneos):

1. **Con `--model`:** `capability_unsupported` — "OpenCode model selection requires an
   existing worktree".
2. **Sin `--model`:** los tres arrancan, crean el worktree… y fallan en `dispatch_input`
   con `providerRejected`: "OpenCode didn't accept this message" (el worker **nunca
   recibió el preámbulo de la tarea**). Las tareas pasan a `status=failed` y quedan
   sesiones de worker abiertas + worktrees creados como recursos residuales
   (`attention=failure`, también `[unhandled]` en el buzón).
3. **Receta que funcionó:** `worker-release` de los 3 dispatches fallidos, luego
   `worker-start --task <id> --retry-of <dispatch fallido> --worktree <path del hijo ya
   existente> --agent opencode --model glm-5.3-flash` (el modelo ya es resoluble porque el
   worktree ahora existe).

**Impacto:** 3 rondas de error + limpieza manual. Los errores fueron síncronos (visibles
en el acto), pero no hubo notificación push: si el orquestador no hubiera estado mirando
la salida, habrían quedado en `failed` indefinidamente.

## Incidente 5 — Buzón nunca drenado: todo queda `[unhandled]`

Como `check` nunca pudo ejecutarse desde esta sesión, **todos** los mensajes del run
(`worker_done`, `status`, `question`, fallos) se acumulan marcados `[unhandled]`. El
modelo "Orca wakes you" no aplica a un coordinador CLI: la única forma de enterarse es
sondear `inbox --terminal run:<id> --full` manualmente. En la práctica, el orquestador
descubrió cada reporte cuando el usuario preguntó estado o cuando inspeccionó
`worker-list` por propia iniciativa.

### Evidencia final — workers terminados que el orquestador nunca vio reportar

Repetición del patrón hasta el cierre de la sesión (~19:15): T8 y T10 terminaron
(`state=succeeded`, `terminalState=released`) y sus `worker_done` quedaron `[unhandled]`
en el buzón; el orquestador solo los descubrió cuando el usuario preguntó "?" y listó el
inbox a mano. Mensajes observados en el buzón sin drenar:

| Mensaje            | Tipo                | De                    | Estado                   |
| ------------------ | ------------------- | --------------------- | ------------------------ |
| `msg_e2adfa57fb16` | `ask` (T2, ~17:10)  | structworker T2       | `[unhandled]` permanente |
| `msg_5c6238e81351` | `worker_done` (T9)  | structworker_81048982 | `[unhandled]`            |
| `msg_f827ce6d4259` | `worker_done` (T8)  | structworker_5586c60a | `[unhandled]`            |
| `msg_1b53c50fae77` | `worker_done` (T10) | structworker_c34cac43 | `[unhandled]`            |

Ningún wake llegó en ningún caso; leer el inbox con `--terminal run:<id>` muestra los
mensajes pero no los consume ni los marca atendidos.

## Nota menor — `send` a un worker settlado crea tareas nuevas

El mensaje a T3 tras su `worker_done` se convirtió automáticamente en una _follow-up
task_ (`task_e6a3387fa451`, dispatch `ctx_c727e7f7fb31`) que reabre el worker. Funcionó
correctamente, pero cambia los ids de tarea y despista el seguimiento si no se espera.

## Causa raíz común

El buzón y los wakes de orquestación están atados a un **terminal Orca con identidad de
panel estable**. Los workers (que corren en structworkers gestionados por Orca) nunca
tuvieron problemas para enviar (`worker_done`, `ask`) — la pata rota es siempre
**orquestador ← buzón**: sin terminal propio no hay `check`, no hay wake, no hay `reply`,
y la identidad ambiental de sender caduca sin aviso.

## Mitigaciones ya aplicadas (documentadas en `.mte/PLAN.md` y memoria)

1. Terminal dedicado `mte-coordinator` + `ORCA_TERMINAL_HANDLE` + `run-use` re-bind.
2. Lectura de buzón sin terminal: `inbox --terminal run:<runId> --full`.
3. Respuestas a workers: `send --from run:<runId> --to dispatch:<id>` (`reply` inusable).
4. Receta de dispatch en worktree hijo (release + `--retry-of` + worktree existente).

## Recomendaciones (candidatas a tarea futura)

1. Permitir `check`/wake desde una sesión CLI o estructurada sin terminal Orca (p. ej.
   aceptar el pseudo-terminal `run:` para `reply`, o un comando de long-poll/stream de
   eventos JSON del buzón).
2. Que la expiración de la identidad de sender produzca un error en el PRIMER uso con
   instrucción accionable (hoy solo falla `no_active_sender_terminal` a mitad de sesión).
3. Hacer accionable el `providerRejected` de hijos: indicar que el worktree ya quedó
   creado y que existe `--retry-of` (hoy hay que descubrirlo por ensayo y error).
4. Que `ask` sin drenar se refleje como estado llamativo en `worker-list`/`check --json`
   para que un coordinador que sondea lo detecte en la primera pasada.

---

# Anexo de cierre (escrito por la sesión sucesora, ~19:50)

Las horas de los incidentes 1–5 eran aproximadas; este anexo las reemplaza por
timestamps exactos extraídos de `orchestration.db` (tablas `messages`,
`worker_dispatches`, `tasks`, `runs`), `git log` y el registro del hand-off. Todos los
tiempos en CET (UTC+1). **Incluye además un hecho que la sesión del orquestador nunca
llegó a conocer:** la tarea final (T6) se dispatchó a las 19:19:03, completó a las
19:21:27 con los 4 gates en verde — _después_ de que el orquestador fuera detenido — y
su veredicto permaneció `[unhandled]` y sin leer hasta que esta sesión lo recuperó del
buzón al redactar este anexo (~26 minutos después).

## Línea de tiempo detallada

Fuente: `orchestration.db` (mensajes, dispatches, tareas), `git log`, transcript del
hand-off. `→ [unhandled]` = mensaje entregado al buzón del run pero nunca drenado.

### Fase 0 — Planificación (sesión previa al orquestador)

| Hora              | Evento                                                            | Estado resultante | Impacto |
| ----------------- | ----------------------------------------------------------------- | ----------------- | ------- |
| 16:16:01          | Run `run_bb704f2e21c3` creado ("Mejora del MTE Flow")             | run activo        | —       |
| 16:16:48–16:22:38 | 7 tareas creadas con specs (T1–T7) tras el lock D1–D16            | 7× `ready`        | —       |
| 16:22–16:58       | Entrevista batch 2, lock D17–D22, actualización de `.mte/PLAN.md` | lock confirmado   | —       |

### Fase 1 — Wave 1 (T1+T2+T7 en worktree compartido)

| Hora     | Evento                                                                     | Estado resultante | Impacto                                                                                      |
| -------- | -------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------- |
| ~16:58   | Primer `worker-start` sin `--agent`/`--model` → `agent_unconfigured`       | sin dispatch      | 1 intento fallido (0 filas); recover: pin explícito `--agent opencode --model glm-5.3-flash` |
| 16:59:29 | Dispatch **T7** (canario, `ctx_4b22d401bf4e`)                              | `succeeded`       | valida la receta del pin                                                                     |
| 16:59:37 | Dispatch **T1** (`ctx_f6cf9e4d8975`) + **T2** (`ctx_39589a39860e`)         | `succeeded`       | 3 workers en paralelo                                                                        |
| 17:00:18 | T7 ack del addendum (`status`)                                             | → `[unhandled]`   |                                                                                              |
| 17:01:49 | **T7 worker_done** (2m20s de ejecución)                                    | → `[unhandled]`   | sin wake; commit manual después                                                              |
| 17:05:29 | **T2 envía `ask`** (`msg_e2adfa57fb16`): 2 conflictos de spec              | **T2 bloqueada**  | inicio del bloqueo más grave                                                                 |
| 17:11:40 | **T1 worker_done** (12m03s)                                                | → `[unhandled]`   | sin wake                                                                                     |
| ~17:20   | Usuario: "¿cómo vamos?" → descubrimiento manual del `ask`                  | investigación     | **15 min de T2 parada sin saberlo nadie**                                                    |
| 17:22:46 | `reply` imposible → desbloqueo con `send --from run:` (`msg_e5a9050a7cdc`) | T2 reanuda        | el `ask` queda formalmente abierto para siempre                                              |
| 17:23:57 | T1 + T7 commiteados (`ab8633ea627`, `e85146cbec5`)                         | en rama           |                                                                                              |
| ~17:24   | Intento de dispatch T3 → `consumer_fenced` / `no_active_sender_terminal`   | sin dispatch      | **identidad de sender expirada en silencio**                                                 |
| 17:25:03 | Terminal `mte-coordinator` creado + `run-use` re-bind                      | run re-bindeado   | ~2 min de recuperación                                                                       |
| 17:25:03 | Dispatch **T3** (`ctx_15d9e0b6f70a`)                                       | `succeeded`       |                                                                                              |
| 17:25:23 | T2 se auto-commitea (`572ec2fe49f`)                                        | en rama           | patrón worker self-commit OK                                                                 |
| 17:25:41 | **T2 worker_done** (26m04s, 66% bloqueada)                                 | → `[unhandled]`   |                                                                                              |
| ~17:33   | Usuario: "pero lanza mas workers paralelos"                                | directiva         | re-planificación de olas                                                                     |
| 17:33:32 | Tareas **T8** + **T9** creadas (extracciones de T6)                        | 2× `ready`        |                                                                                              |

### Fase 2 — Worktrees hijos (T4+T5+T9) y cierre de ola

| Hora                | Evento                                                                                                                                         | Estado resultante      | Impacto                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------- |
| 17:34:03            | T3 ack del addenda (`status`)                                                                                                                  | → `[unhandled]`        |                                                                                  |
| ~17:34              | Ronda 1 hijos con `--model` → `capability_unsupported` ×3                                                                                      | 0 dispatches           | 3 intentos fallidos (0 filas)                                                    |
| 17:34:04            | Ronda 2 hijos sin `--model` → dispatches T4/T5/T9 creados                                                                                      | **`failed` a los 14s** | `providerRejected`: preámbulo no entregado; worktrees hijos SÍ creados (residuo) |
| 17:34:11            | **T3 worker_done** (9m08s)                                                                                                                     | → `[unhandled]`        |                                                                                  |
| 17:35:00–12         | `worker-release` ×3 + retry contra worktrees existentes: **T4** (`ctx_954771d78eea`), **T5** (`ctx_f0995f4be863`), **T9** (`ctx_fadfa0837c13`) | `succeeded` ×3         | receta definitiva descubierta por ensayo/error                                   |
| 17:35:38            | `send` a T3 ya settlada → follow-up no solicitada **T3-ext** (`task_e6a3387fa451`, `ctx_c727e7f7fb31`)                                         | `succeeded`            | reabre worker; ids nuevos                                                        |
| 17:36:39–17:38:09   | T5 (`9c4ee307`), T4 (`326ae469`) se auto-commitean en sus hijos                                                                                | ramas hijas            |                                                                                  |
| 17:36:48 / 17:37:29 | **T5** (1m36s) y **T3-ext** (1m51s) worker_done                                                                                                | → `[unhandled]`        |                                                                                  |
| 17:38:19            | **T4 worker_done** (3m19s)                                                                                                                     | → `[unhandled]`        |                                                                                  |
| 17:41:07 / 17:41:21 | T9 commit (`be2b3469`); **T9 worker_done** (6m09s)                                                                                             | → `[unhandled]`        |                                                                                  |
| 17:44:38            | T3 commiteada (`0f6f8dda399`)                                                                                                                  | en rama                |                                                                                  |
| 17:44:46            | Dispatch **T8** (`ctx_c344d10451a4`)                                                                                                           | `succeeded`            |                                                                                  |
| 17:45:15–32         | Merges de t4-poller, t5-review, t9-guide → `mte/flow-overhaul`                                                                                 | **0 conflictos**       | la estrategia de entregables reducidos funciona                                  |
| 17:46:02            | Bundle regenerado (regla: regenerar, nunca mergear) + commit                                                                                   | en rama                |                                                                                  |
| 17:46:30/39         | Tarea **T10** creada y dispatchada (`ctx_a1aca3c788ad`)                                                                                        | `succeeded`            |                                                                                  |
| 17:46:47 / 17:46:52 | T8 se auto-commitea (`3660a96d08c`); **T8 worker_done** (2m06s)                                                                                | → `[unhandled]`        |                                                                                  |
| 17:49:41            | **T10 worker_done** (3m02s)                                                                                                                    | → `[unhandled]`        | **todo el trabajo en vuelo ha terminado**                                        |

### Fase 3 — El parón silencioso y el cierre

| Hora           | Evento                                                                                                                        | Estado resultante    | Impacto                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------- |
| 17:49:41→19:12 | **Silencio total: 1h23m con todo terminado y nadie enterado**                                                                 | pipeline estancada   | ningún wake; el orquestador solo reacciona al usuario   |
| ~19:10         | Usuario pide el informe de incidentes (con cancelación previa)                                                                | trabajo de redacción |                                                         |
| 19:12          | `informe_log.md` v1 escrito                                                                                                   | informe 10 secciones |                                                         |
| ~19:13–19:15   | Usuario: "?" → descubrimiento manual: T8 y T10 `succeeded`, buzón sin drenar                                                  | investigación        | **1h24m–1h27m de reloj perdidos** desde los worker_done |
| 19:18:45       | T10 commiteada (`29ec4b3a2ef`)                                                                                                | en rama              |                                                         |
| 19:19:03       | Dispatch **T6 — integración** (`ctx_2850824f437e`)                                                                            | `succeeded`          | último acto de la sesión                                |
| ~19:19         | **Sesión del orquestador detenida manualmente / hand-off**                                                                    | sin coordinador      |                                                         |
| 19:21:27       | **T6 worker_done**: flujo coherente, **4/4 gates verdes** (`pnpm tc`, 188 tests, bundle verify, oxlint/oxfmt), cero ediciones | → `[unhandled]`      | **el veredicto final llegó a un buzón sin dueño**       |
| ~19:30         | Arranca la sesión sucesora (este informe)                                                                                     | hand-off             |                                                         |
| ~19:47         | Esta sesión lee por primera vez el veredicto de T6 (recuperándolo del buzón para este anexo)                                  | T6 conocida          | **26 min de resultado final invisible**                 |

## Métricas de impacto

| Métrica                                                        | Valor                                                                                                                                                                                                                        | Detalle                                                                                                                       |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Tiempo total del run                                           | **3h05m** (16:16→19:21)                                                                                                                                                                                                      | planificación incluida                                                                                                        |
| Ventana de ejecución (1er dispatch → último worker_done)       | **2h22m** (16:59:29→19:21:27)                                                                                                                                                                                                |                                                                                                                               |
| Cómputo real acumulado de los 11 workers                       | **~1h10m**                                                                                                                                                                                                                   | T7 2m20s · T1 12m03s · T2 26m04s · T3 9m08s · T4 3m19s · T5 1m36s · T9 6m09s · T3-ext 1m51s · T8 2m06s · T10 3m02s · T6 2m24s |
| Tiempo perdido: T2 bloqueada por `ask` no entregado            | **17m17s** (17:05:29→17:22:46)                                                                                                                                                                                               | 66% del tiempo de vida de T2                                                                                                  |
| Tiempo perdido: parón post-T8/T10 (todo hecho, nadie enterado) | **1h29m22s** (T10 done 17:49:41 → dispatch T6 19:19:03)                                                                                                                                                                      | el mayor; descubierto por pregunta del usuario                                                                                |
| Tiempo perdido: veredicto de T6 sin leer                       | **~26m** (19:21:27→~19:47)                                                                                                                                                                                                   | ocurrido tras la muerte del orquestador                                                                                       |
| Tiempo de recuperación activa (errores + workarounds)          | **~10m**                                                                                                                                                                                                                     | canario pin ~2m · fence+re-bind ~2m · baile hijos ~2m · sondeos de buzón varios                                               |
| Intentos fallidos de dispatch                                  | **7** (4 sin fila + 3 con fila)                                                                                                                                                                                              | 1 `agent_unconfigured` · 3 `capability_unsupported` · 3 `providerRejected`                                                    |
| Dispatches de recuperación exitosos                            | **6**                                                                                                                                                                                                                        | T1/T2 (tras canario), T3 (re-bind), T4/T5/T9 (release+retry)                                                                  |
| `worker-release` necesarios                                    | **3**                                                                                                                                                                                                                        | los 3 hijos `providerRejected`                                                                                                |
| Recursos residuales                                            | **3 worktrees hijos** (t4-poller, t5-review, t9-guide — ramas ya mergeadas, eliminables) + **1 terminal dedicado** (`mte-coordinator`) + **3 dispatch contexts `failed`** permanentes en DB + 1 dispatch `unverifiable` (T3) |                                                                                                                               |
| Mensajes `[unhandled]` acumulados                              | **14 de 14 (100%)**                                                                                                                                                                                                          | 11 `worker_done` + 2 `status` + 1 `question`; buzón jamás drenado                                                             |
| Dispatches finalmente successful                               | 11 de 14 filas (79%)                                                                                                                                                                                                         | los 3 `failed` fueron reemplazados por sus retry                                                                              |

## Análisis de lo que funcionó vs lo que falló

### Funcionó correctamente

- **La pata worker → buzón (100% fiable).** Los 14 mensajes llegaron al buzón con payload
  correcto. Los workers nunca tuvieron problema para comunicar; el fallo es unidireccional.
- **Ejecución de los workers.** 11/11 dispatches efectivos terminaron `succeeded`, cada uno
  validando con tests/oxlint/oxfmt y respetando los límites de edición de su spec. 4 se
  auto-commitearon correctamente (T2, T8, T4, T5, T9 en sus hijos).
- **Paralelización con entregables reducidos + worktrees hijos.** 4 workers simultáneos en
  pico; los 3 merges hijos fueron auto-merge `ort` con **cero conflictos**, porque cada
  entregable tocó un solo archivo/símbolo.
- **El escepticismo de las workers (D10).** T2 detectó un addendum incorrecto del
  orquestador (la guía es fuente, el bundle es proyección) y lo elevó en lugar de
  obedecer — exactamente el comportamiento que el flujo nuevo quiere fomentar.
- **Recetas de recuperación.** Canario con pin explícito, `send --from run:` y la receta
  release+`--retry-of`+worktree existente convirtieron cada error en un patrón reutilizable
  (documentado en PLAN.md y memoria).
- **Consultas de solo lectura sin terminal.** `run-show`, `worker-list`, `inbox` siempre
  funcionaron — fueron el único canal de visibilidad real del run.

### Falló o fue problemático

| Problema                                                                                                        | Severidad   | Bloqueante                                     | Nota                                                                   |
| --------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| Wake/`check` imposible desde coordinador CLI: el buzón nunca se drena y la detección depende del sondeo humano  | **Crítico** | Sí — causó los 2 mayores parones (1h29m + 17m) | causa raíz común                                                       |
| `ask` de T2 sin entregar al orquestador a tiempo                                                                | **Crítico** | Sí (para T2)                                   | y queda formalmente irresoluto para siempre (`send` no cierra el hilo) |
| Expiración silenciosa de la identidad de sender a mitad de sesión                                               | Alta        | Sí (hasta re-bind)                             | sin aviso ni error accionable                                          |
| `reply` vetado (`stable_pane_required`) desde sesión CLI                                                        | Alta        | Sí (camino nativo)                             | workaround: `send --to dispatch:`                                      |
| Dispatch a worktree hijo nuevo: `--model` rechazado y sin `--model` el preámbulo se pierde (`providerRejected`) | Media       | No (error síncrono visible)                    | pero deja worktrees/sesiones residuales                                |
| `send` a worker settlado crea follow-up task no solicitada                                                      | Media       | No                                             | confunde el seguimiento (T3-ext)                                       |
| Veredicto final (T6) invisible tras la muerte del orquestador: nada drena el buzón al cerrar                    | Media       | No (trabajo ya hecho)                          | 26m de "4/4 gates verdes" sin lectores                                 |
| `orca agent models` inexistente en el build actual                                                              | Baja        | No                                             | fricción menor durante el recovery                                     |

## Lecciones aprendidas

1. **Descubrimiento:** El modelo de wakes de Orca asume un coordinador con terminal de
   panel estable; un orquestador en sesión CLI es sordo a su propio buzón.
   **Evidencia:** 14/14 mensajes `[unhandled]`; los 3 descubrimientos relevantes del run
   (ask de T2, T8/T10 done, T6 done) los triggered preguntas del usuario, nunca
   notificaciones. **Implicación:** todo run coordinado desde CLI debe crear terminal
   propio + `run-use` en el minuto 0 y sondear el buzón por reloj; sin eso, el run avanza
   solo cuando un humano mira.
2. **Descubrimiento:** La identidad ambiental de sender expira sin aviso; la fiabilidad
   temprana de una sesión no predice su estado a mitad.
   **Evidencia:** `worker-start` sin `--from` OK a las 16:59, el mismo comando fenced a
   las ~17:24. **Implicación:** SIEMPRE `ORCA_TERMINAL_HANDLE` explícito ligado a un
   terminal dedicado; nunca confiar en la identidad implícita en runs largos.
3. **Descubrimiento:** El buzón acepta `--from run:<id>` pero `reply` exige pane estable:
   se puede escribir a los workers pero no cerrar sus preguntas por la vía nativa.
   **Evidencia:** `send` entregado (`msg_e5a9050a7cdc`) vs `reply` →
   `stable_pane_required`. **Implicación:** los `ask` quedan formalmente abiertos; hace
   falta el fix upstream (aceptar `run:` en `reply`) mientras tanto.
4. **Descubrimiento:** El dispatch a worktree hijo nuevo tiene una ventana imposible
   (`--model` rechazado / sin `--model` preámbulo perdido) cuyo subproducto —el worktree
   creado— es justamente lo que desbloquea el retry.
   **Evidencia:** 3× `capability_unsupported`, 3× `providerRejected` con worktrees
   residuales, y retry exitoso contra esos mismos worktrees a los 50s.
   **Implicación:** la receta release+`--retry-of`+`--worktree <path>` es el camino
   estable; el host debería reflejarla en el propio error.
5. **Descubrimiento:** Paralelizar recortando entregables (un símbolo por worker,
   worktrees hijos, centralización post-merge de archivos compartidos) elimina la
   serialización por solapamiento de archivos sin coste de merge.
   **Evidencia:** 4 workers concurrentes, 3 merges con 0 conflictos, T4/T5/T9/T8/T10
   completados cada uno en <7m. **Implicación:** patrón a conservar como default de
   planificación, independientemente de los fixes de comunicación.
6. **Descubrimiento:** La muerte del orquestador no detiene el run: los workers terminan
   y reportan a un buzón sin dueño.
   **Evidencia:** T6 completó a las 19:21:27 con gates verdes, 2 minutos después del
   stop del coordinador; veredicto invisible ~26m.
   **Implicación:** un cierre/hand-off responsable debe drenar el buzón antes de parar,
   y el estado del run debería poder auto-servirse desde la CLI al reanudar.
7. **Descubrimiento:** El monitoreo por sondeo manual funciona, pero su latencia es
   impredecible (15 min… 1h29m) y su coste cognitivo alto.
   **Evidencia:** misma causa (sin wake), tres latencias distintas según cuándo preguntó
   el usuario. **Implicación:** mientras no exista long-poll/eventos, meter el sondeo en
   el propio bucle del orquestador (sleep + inbox en bucle) en vez de depender del
   usuario.

## Próximos pasos concretos

| #   | Acción                                                                                                                                                              | Prioridad | Esfuerzo | Dependencias                                   | Responsable                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------- | ---------------------------------------------- | --------------------------- |
| 1   | Procesar el cierre del run con el veredicto de T6 ya conocido (4/4 gates verdes): commitear `.mte/PLAN.md`, decidir ubicación de `informe_log.md` (raíz vs `.mte/`) | P0        | S        | ninguna                                        | Orquestador (sesión actual) |
| 2   | Decidir el dogfooding pendiente (D20: QA workers + PR draft, sin poller) — todo el trabajo técnico está validado, falta ejercitar el flujo nuevo                    | P0        | M        | OK del usuario                                 | Usuario + orquestador       |
| 3   | Drenar/cerrar el buzón del run (14 mensajes `[unhandled]`) para no dejar estado fantasma                                                                            | P1        | S        | CLI (`check` desde terminal, o cierre del run) | Orquestador                 |
| 4   | Limpiar residuos: `git worktree remove` t4-poller/t5-review/t9-guide + borrar ramas hijas + terminal `mte-coordinator` al cerrar                                    | P1        | S        | ramas ya mergeadas                             | Orquestador                 |
| 5   | Fix producto: aceptar `run:` en `reply` + long-poll/stream JSON del buzón (recomendación 1)                                                                         | P1        | M        | tocar orquestación core (src/main)             | Desarrollador (tarea nueva) |
| 6   | Fix producto: error accionable en el primer uso tras expirar la identidad (recomendación 2)                                                                         | P1        | S        | —                                              | Desarrollador               |
| 7   | Fix producto: `providerRejected` sugiriendo `--retry-of` y avisando que el worktree quedó creado (recomendación 3)                                                  | P2        | S        | —                                              | Desarrollador               |
| 8   | Fix producto: `ask` sin drenar visible como estado en `worker-list`/`check --json` (recomendación 4)                                                                | P2        | S        | —                                              | Desarrollador               |
| 9   | Promover las recetas CLI (terminal dedicado, `--from run:`, retry de hijos) del nivel memoria/PLAN.md al skill de orquestación                                      | P2        | S        | merge de `mte/flow-overhaul`                   | Orquestador                 |

## Conclusión ejecutiva

**Qué se intentó hacer.** Reescribir por completo el flujo MTE nativo de Orca (brainstorming
con 3 workers que debaten, grill pregunta-a-pregunta, revisión autónoma con retroceso, QA
post-ejecución, vigilancia de review de PR — todo en castellano) ejecutando el run
`run_bb704f2e21c3` con máxima paralelización: 10 tareas (7 originales + 3 extraídas al
vuelo) dispatchadas sobre un worktree compartido y 3 worktrees hijos.

**Qué se logró.** Todo el objetivo técnico. Las 10 tareas completaron (`succeeded` 11/11
dispatches efectivos), con 13 commits/merges limpios en `mte/flow-overhaul`, cero
conflictos de merge gracias a la estrategia de entregables reducidos, y la validación
final de integración (T6) pasó **4/4 gates en verde** (`pnpm tc`, 188 tests de mte,
bundle verify, oxlint/oxfmt). El trabajo útil de cómputo fue ~1h10m repartido en pico de
4 workers concurrentes.

**Qué no se logró y por qué.** La comunicación bidireccional orquestador ↔ workers:
la pata workers → buzón funcionó al 100%, pero el orquestador CLI nunca pudo drenar el
buzón ni recibir wake alguno, así que el run avanzó a golpes de sondeo humano. Coste
medido: 17m17s de T2 bloqueada por un `ask` invisible, 1h29m de pipeline estancada con
todo terminado, y el veredicto final de T6 (verde) llegó 2 minutos después de la muerte
del coordinador y estuvo ~26m sin leer — la ironía central: el run que mejoraba el
sistema de orquestación tropezó con los defectos exactos del sistema que mejoraba.

**Qué se necesita para el próximo intento.** Poco: el trabajo está hecho y validado.
Falta solo el cierre del run (commits administrativos, drenado del buzón, limpieza de 3
worktrees hijos) y la decisión del dogfooding (D20: QA + PR draft sin poller). Para que
no se repita el patrón, los 4 fixes de producto (reply con `run:`, long-poll del buzón,
error accionable al expirar identidad, providerRejected sugestivo) quedan priorizados
arriba como P1/P2.

**Recomendación final.** **Continuar con este enfoque.** La arquitectura de ejecución
(paralelización con worktrees hijos + entregables recortados + workers críticos que
cuestionan specs) demostró ser sólida y barata en merges; el fallo fue exclusivamente de
la capa de notificación del coordinador, que es localizada y tiene fixes acotados.
Mientras esos fixes no lleguen, todo run coordinado desde CLI debe arrancar con terminal
dedicado + `run-use` y sondear el buzón por reloj en el propio bucle del orquestador.

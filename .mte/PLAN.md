# Plan de Mejora del MTE Flow

**Run ID:** `run_bb704f2e21c3`
**Objetivo:** Mejorar el flujo de MTE con brainstorming, grill pregunta-a-pregunta, revisión autónoma, notas visuales, workers críticos, QA post-ejecución, polling PR review, todo en castellano.

---

## Flujo Completo

```
1. Inicio → analiza tarea vinculada o pregunta el goal
2. Workers análisis (3) → debaten entre sí con orchestration link, modelo mediano
3. Brainstorming → orquestador sintetiza debate + conversa con humano
4. Grill → pregunta 1 a 1, máximo 10 total; si se supera → volver a brainstorming
5. Revisión autónoma → el planner revisa código/encaje; si detecta problemas → vuelve a brainstorming o grill
6. Requirements lock → resumen markdown con decisiones tomadas
7. Título dinámico → auto-generado del goal
8. Ejecución → coder/validator workers
9. QA post-ejecución → revisan plan + inspección local (estilo verify-deploy-feature)
10. PR draft → worker ligero vigila si aparece review (cada 10 min, timeout 2 h, sin comentario /request-review)
11. Procesar review → inline comments → brainstorming con usuario si necesario
```

---

## Decisiones Resueltas

| #   | Decisión                                                                                 | Rationale                                                                  |
| --- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| D1  | 3 workers de análisis con modelo mediano (Sonnet 5.5 high o equivalente)                 | Suficiente razonamiento sin quemar tokens en fase descartable              |
| D2  | Workers debaten entre sí usando `orchestration link`                                     | Infraestructura ya existe en el core                                       |
| D3  | Debate con convergencia libre, límite duro como safety net                               | El orquestador modera y decide cuándo hay suficiente                       |
| D4  | Grill de pregunta 1 a 1, máximo 10 total                                                 | Si se supera, replantear decisiones y volver a brainstorming               |
| D5  | Planner puede descartar ideas por sobreingeniería sin preguntar                          | Ser crítico con decisiones malas                                           |
| D6  | Si la revisión autónoma detecta problemas → vuelve a brainstorming o grill               | Flujo no lineal según tipo de problema                                     |
| D7  | Notas/tarjetas usando `::orca-visual{}` existente                                        | Cero cambios en renderer, solo cambiar prompt                              |
| D8  | Título dinámico auto-generado del goal                                                   | Refleja el tema del run                                                    |
| D9  | Reducción del prompt + mover detalles a references                                       | Concisar y reestructurar                                                   |
| D10 | Workers cuestionan el spec (opción B)                                                    | Si ven mejor enfoque, lo proponen                                          |
| D11 | QA post-ejecución validan acceptance checks (opción C)                                   | Revisan que lo hecho realmente satisface el spec                           |
| D12 | Worker ligero de polling para PR review                                                  | No bloquea al orquestador                                                  |
| D13 | Solo GitHub, no GitLab                                                                   | Scope acotado                                                              |
| D14 | Todo el prompt en castellano                                                             | Consistencia con el usuario                                                |
| D15 | Primero pulir flow interno, plugin después                                               | Prioridad clara                                                            |
| D16 | Eliminar pi de MTE_ORCHESTRATION_AGENTS                                                  | No soporta selección de modelo en launch-time                              |
| D17 | Reutilizar run_bb704f2e21c3 y sus 7 tareas ready                                         | Las specs ya reflejan el lock confirmado                                   |
| D18 | Rama nueva `mte/flow-overhaul` desde f444e7a → PR draft a MTEKode/orca main              | Destino de entrega definido                                                |
| D19 | Sin comentario `/request-review`: el poller solo vigila si aparece review (`gh pr view`) | No existe mecanismo en el repo y las Actions del fork están deshabilitadas |
| D20 | Dogfooding al validar: QA workers + PR draft, sin poller                                 | El poller se implementa (T4) pero no se ejercita en este run               |
| D21 | Artefactos `.mte/` (specs, run logs, PLAN.md) en castellano                              | Consistente con D14; excepción explícita a la política del repo            |
| D22 | `<200` líneas es presupuesto duro para planner-prompt.ts                                 | Si no cabe, se mueve más contenido a references                            |

---

## Tareas

### Tarea 1: Reescritura del planner prompt en castellano

**ID:** `task_cd9a07c1b7f4`
**Archivo:** `src/shared/mte/planner-prompt.ts`

**Cambios:**

- Todo el texto en castellano
- Título dinámico: `# Arquitecto — <tema>`
- Nueva fase de brainstorming con 3 workers que debaten
- Nueva fase de grill pregunta 1 a 1 (máx 10 total)
- Nueva fase de revisión autónoma con retroceso
- Instrucciones para `::orca-visual{}`
- Descripción concisa de tools
- Objetivo: <200 líneas

**Acceptance checks:**

- AC1: Todo en castellano
- AC2: Título dinámico
- AC3: <200 líneas
- AC4-AC6: Fases nuevas presentes
- AC7: Instrucciones de `::orca-visual{}`
- AC8: Firmas exportadas no cambian
- AC9: Tools resumidas

---

### Tarea 2: Reescritura de worker personas en castellano + QA persona

**ID:** `task_5c4c7737ddac`
**Archivo:** `src/shared/mte/worker-personas.ts`

**Cambios:**

- Todo en castellano
- Coder: cuestiona el spec si ve mejor enfoque
- Validator: mantiene comportamiento read-only
- Nueva QA persona: valida acceptance checks post-ejecución

**Acceptance checks:**

- AC1: Todo en castellano
- AC2: Coder cuestiona spec
- AC3: Validator read-only
- AC4: Nueva `MTE_QA_PERSONA`
- AC5: QA valida cada acceptance check
- AC6: QA no edita código
- AC7: Firmas existentes no cambian

---

### Tarea 3: Lógica de título dinámico del planner

**ID:** `task_69c0936074c3`
**Archivo:** `src/shared/mte/planner-prompt.ts`

**Cambios:**

- Nueva función `plannerTitle(goal: string): string`
- Genera título conciso del goal (≤8 palabras)

**Acceptance checks:**

- AC1: Función exportada
- AC2-AC3: Genera títulos apropiados
- AC4: No modifica goal original
- AC5: Typecheck pasa

---

### Tarea 4: Worker ligero de polling PR review (GitHub)

**ID:** `task_3f18f71dee5e`
**Archivo:** `src/shared/mte/worker-personas.ts`

**Cambios:**

- Nueva `MTE_PR_REVIEW_POLLER_PERSONA`
- Polling cada 10 min con `gh` CLI
- Timeout 2 horas
- Avisa al orquestador cuando review termina

**Acceptance checks:**

- AC1: Persona exportada
- AC2-AC4: Polling, gh CLI, aviso al orquestador
- AC5: Timeout 2h
- AC6: Read-only
- AC7: En castellano

---

### Tarea 5: Procesamiento de inline comments de PR review

**ID:** `task_00a6ecff8364`
**Archivo:** `src/shared/mte/worker-personas.ts`

**Cambios:**

- Nueva `MTE_REVIEW_PROCESSOR_PERSONA`
- Extrae inline comments con `gh api`
- Presenta todos juntos
- Guía brainstorming con usuario

**Acceptance checks:**

- AC1: Persona exportada
- AC2-AC3: Extrae y presenta comments
- AC4: Guía brainstorming
- AC5: No edita código
- AC6: En castellano

---

### Tarea 6: Integración y validación del flujo completo

**ID:** `task_0a7f46bfdbf7`
**Archivos:** `planner-prompt.ts`, `worker-personas.ts`

**Cambios:**

- Verificar que planner prompt referencia todas las personas nuevas
- Verificar coherencia del flujo completo
- Correcciones menores si hay inconsistencias

**Acceptance checks:**

- AC1-AC2: Planner menciona todas las fases y personas
- AC3: No hay referencias rotas
- AC4-AC5: Tests pasan
- AC6: Flujo coherente

---

### Tarea 7: Eliminar pi de MTE_ORCHESTRATION_AGENTS

**ID:** `task_adc8cffa081b`
**Archivos:**

- `src/shared/mte/orchestration-agents.ts`
- `src/shared/mte/orchestration-agents.test.ts`
- `src/shared/mte/adapter-for-agent.ts`
- `src/shared/mte/adapter-for-agent.test.ts`

**Cambios:**

- Quitar `'pi'` de `MTE_ORCHESTRATION_AGENTS`
- Quitar case `'pi'` de `mteAdapterForAgent`
- Actualizar tests

**Acceptance checks:**

- AC1-AC3: pi eliminado de todas las estructuras
- AC4: Tests actualizados
- AC5: Typecheck pasa

---

## Interfaces que Cambian

### Planner prompt (`planner-prompt.ts`)

- Todo en castellano
- Título dinámico
- Nuevas fases
- Instrucciones para `::orca-visual{}`
- Descripción concisa de tools

### Worker personas (`worker-personas.ts`)

- Coder: cuestiona spec
- Validator: mantiene read-only
- Nuevo: `MTE_QA_PERSONA`
- Nuevo: `MTE_PR_REVIEW_POLLER_PERSONA`
- Nuevo: `MTE_REVIEW_PROCESSOR_PERSONA`
- Todo en castellano

### Orchestration agents (`orchestration-agents.ts`)

- Eliminar `'pi'` de `MTE_ORCHESTRATION_AGENTS`

### Adapter (`adapter-for-agent.ts`)

- Eliminar case `'pi'` de `mteAdapterForAgent`

---

## Acceptance Checks Globales

| #    | Check                                    | Verificable con   |
| ---- | ---------------------------------------- | ----------------- |
| AC1  | Planner prompt completo en castellano    | Inspección visual |
| AC2  | Título dinámico del goal                 | Test o inspección |
| AC3  | Prompt <200 líneas                       | `wc -l`           |
| AC4  | Fase brainstorming con 3 workers         | Inspección        |
| AC5  | Workers debaten con `orchestration link` | Inspección        |
| AC6  | Grill pregunta 1 a 1, máx 10             | Inspección        |
| AC7  | Revisión autónoma con retroceso          | Inspección        |
| AC8  | Notas como `::orca-visual{}`             | Test o inspección |
| AC9  | Coder cuestiona spec                     | Inspección        |
| AC10 | QA valida acceptance checks              | Inspección        |
| AC11 | Worker polling PR review                 | Test o inspección |
| AC12 | Inline comments en brainstorming         | Inspección        |
| AC13 | pi eliminado de orchestration agents     | Test              |

---

## Validation Commands

```bash
# Typecheck
pnpm tc

# Tests de MTE
pnpm test src/shared/mte/ --maxWorkers=2

# Lint
pnpm exec oxlint src/shared/mte/

# Contar líneas del prompt
wc -l src/shared/mte/planner-prompt.ts
```

---

## Known Traps

1. **`orchestration link` es coordinator-only** — solo el planner puede enlazar workers
2. **`::orca-visual{}` necesita `ORCA_CHAT_SCRATCH_DIR`** — verificar que existe
3. **Límite de 10 preguntas es total** — el planner debe contar globalmente
4. **Workers de análisis son ligeros** — no análisis exhaustivo
5. **Polling PR review no bloquea** — worker dedicado
6. **pi no soporta selección de modelo** — por eso se elimina
7. **Mutaciones de buzón desde sesión CLI** (OpenCode sin terminal Orca): `send`/`reply` fallan con `no_active_sender_terminal`; usar `--from run:run_bb704f2e21c3` (el buzón del run). `reply` además rechaza el pseudo-terminal con `stable_pane_required` — usar `send --to dispatch:<id>`. `inbox --terminal run:<runId> --full` para leer

---

## Out of Scope

- Extracción a plugin (proyecto separado)
- Soporte GitLab para reviews
- Cambios en el renderer para nuevas tarjetas
- Modificación de `orchestration link` o primitives del core
- Tests exhaustivos (solo los necesarios)

---

## Grounding del pre-lock analysis (2026-11-19)

1. **Bug a corregir en T1**: el prompt actual ordena `orca skills get mte --full`, pero el topic no existe — el real es `orchestration`.
2. **Proyección generada**: `skill-guides/mte.md` embebe las personas verbatim (`mte-skill-guide-sync.test.ts`); tras editar `worker-personas.ts` regenerar con `pnpm generate:bundled-skill-guides` (T2/T4/T5).
3. **Tests en inglés**: `planner-prompt.test.ts` aserta cadenas inglesas → el rewrite en castellano actualiza las aserciones con la misma intención; `orchestration-agents.test.ts` y `adapter-for-agent.test.ts` se actualizan en T7.
4. **Guard T7**: `src/shared/mte/mcp/workspace-mcp-config.ts` también tiene wiring de `pi` — NO se toca (dejarlo inerte no da errores de tipos).
5. **Firmas estables**: `mtePlannerPrompt(worker?)`, `plannerKickoffPrompt(goal, worker?)`, `MTE_PLANNER_PROMPT`, `MTE_START_DEFAULT_GOAL`; consumidores: `src/cli/handlers/mte.ts` y `use-new-chat-launch.ts`.
6. **Workers de análisis heredan el pin del host** (hoy opencode/glm-5.3-flash/high) — sin flags explícitos, espíritu "modelo mediano" de D1.

## Addenda por tarea (enviar al dispatchar; las TaskRows no son editables vía CLI)

- **T1**: fix topic `orca skills get mte` → `orchestration`; presupuesto duro <200 líneas (comprimir/mover a references si no cabe); conservar modos pinned/unpinned en castellano; actualizar `planner-prompt.test.ts` a aserciones en castellano.
- **T2** (resuelto vía ask msg_e2adfa57fb16, 2026-11-19): (a) reescribir worker-personas.test.ts con pins equivalentes en castellano + pins de MTE_QA_PERSONA; (b) skill-guides/mte.md es FUENTE (el generador solo escribe src/cli/skills/bundled-skill-guides.ts): editar la guía a mano (personas verbatim ES + sección QA) y luego `pnpm generate:bundled-skill-guides` + `pnpm verify:bundled-skill-guides`; boundary extendida a esos 4 archivos. Tokens VALIDATION_PASSED/VALIDATION_FAILED en inglés (contrato de máquina); protocolo QA en castellano (AC<N>: SATISFECHO/NO SATISFECHO, HALLAZGOS). La sección del planner en la guía NO se toca (la cierra T6).
- **T4**: sin comentario `/request-review` — la persona solo vigila reviews con `gh pr view`; regenerar la guía.
- **T5**: regenerar la guía.
- **T6**: (nuevo, de los reports de T1/T2) 1) `src/cli/handlers/mte.test.ts` tiene ~2 asserts de pi (acepta pi / lista con pi) que quedan rojos tras T7 — actualizarlos; 2) la sección condensada del planner en `skill-guides/mte.md` queda stale en inglés — reescribirla con el flujo nuevo en castellano; 3) regenerar `src/cli/skills/bundled-skill-guides.ts` con `pnpm generate:bundled-skill-guides`.
- **T7**: no tocar `workspace-mcp-config.ts`.

## Olas de dispatch (worktree compartido → same-file secuencial)

| Wave         | Tareas                      | Condición                              |
| ------------ | --------------------------- | -------------------------------------- |
| 1 (paralelo) | T1 · T2 · T7                | archivos disjoint                      |
| 2            | T3 (tras T1) · T4 (tras T2) | planner-prompt.ts / worker-personas.ts |
| 3            | T5 (tras T4)                | worker-personas.ts                     |
| 4            | T6 (tras todas)             | integración + validación completa      |

## Estado

**Fase:** Lock confirmado por el usuario (2026-11-19, "okai si") — ejecución iniciada

**Próximo paso:** `run-use` run_bb704f2e21c3, rama `mte/flow-overhaul`, dispatch Wave 1 (T1+T2+T7)

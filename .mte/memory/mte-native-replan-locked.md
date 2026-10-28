---
name: mte-native-replan-locked
type: project
date: 2026-10-28T23:10:37Z
---

LOCK aceptado 2026-10-29 (épica T-0003..T-0007): MTE pasa a ser el cerebro NATIVO de la orquestación de orca. Decisiones: (1) sync fork-main con origin/main antes de construir (merge, no rebase); (2) M1+M2 juntos como primer hito (memoria nativa + MCP al planner + despacho por Coordinator); (3) standalone se borra AL FINAL tras validar un task real nativo de punta a punta; (4) mte.mjs muere ENTERO incluido validate (runner nativo de checks en su lugar); (5) agente CLI configurable POR SESIÓN al inicio (planner pregunta; encaja con configured-worker-agent-selector existente); (6) entrada = chat con agente mte (sesión estructurada en workspace raíz); (7) TaskRows de OrchestrationDb = fuente de verdad, .mte/tasks = export legible; (8) memoria T-0001/T-0002 es el núcleo, planner vía MCP in-process, workers preguntan por mail; (9) validación = worker_done -> gate -> worker validator -> merging. Descubrimientos clave: coordinator.ts tiene decompose() como STUB ('tasks must be pre-created') — MTE planner es exactamente la pieza que falta; plugin system es sandboxed (panels/commands/events, sin orquestación ni MCP) -> UI como plugin futuro, núcleo nativo.

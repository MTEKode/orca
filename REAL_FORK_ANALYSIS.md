# Análisis Real: MTEKode/orca vs stablyai/orca

**Fecha:** 2024-11-17  
**Total de archivos cambiados:** 1,024  
**Inserciones:** 59,215  
**Eliminaciones:** 4,104

---

## Resumen Ejecutivo

El fork MTEKode contiene **modificaciones profundas al core de Orca** que integran sistemas nativos completos. **NO son simples personalizaciones de UI** - son integraciones a nivel de sistema que requieren acceso al runtime, IPC, SQLite, process management, y otros componentes internos de Orca.

### Conclusión Crítica

**Solo ~150 archivos (15%) pueden extraerse como plugins.**  
**Los ~874 archivos restantes (85%) requieren modificaciones al core de Orca.**

---

## Desglose por Área Funcional

### 1. 🎯 MTE Orchestration (70 archivos)
**Ubicación:** `src/shared/mte/`, `src/main/mte/`, `src/main/runtime/orchestration/`

#### Componentes:
- **Memory System** (SQLite)
  - `memory-database.ts`, `memory-store.ts`, `memory-tools.ts`
  - Requiere: SQLite nativo, persistencia
  
- **Planner & Workers**
  - `planner-prompt.ts`, `orchestration-agents.ts`, `worker-personas.ts`
  - Requiere: Agent lifecycle, worktree management
  
- **MCP Integration**
  - `mcp/workspace-mcp-config.ts`, `mcp/memory-mcp-server.ts`
  - Requiere: MCP server management, process spawning
  
- **Deploy Checks**
  - `deploy-check.ts`, `checks/run-checks.ts`
  - Requiere: Git integration, shell execution

**Veredicto:** ❌ **NO puede ser plugin**  
**Razón:** Requiere acceso nativo a SQLite, agent lifecycle, MCP servers, git operations

---

### 2. 🤖 Agent Harnesses (50+ archivos)
**Ubicación:** `src/main/opencode-v2/`, `src/main/claude/`, `src/main/codex/`, `src/main/antigravity/`, `src/main/acp/`

#### Componentes:
- **OpenCode V2 Adapter** (49 archivos)
  - Session management, model configuration
  - Requiere: Process spawning, IPC
  
- **Claude Adapter** (5 archivos)
  - Custom integration, review tools
  - Requiere: Claude CLI access
  
- **ACP (Agent Communication Protocol)** (13 archivos)
  - Protocol handling, message routing
  - Requiere: IPC system, process management

**Veredicto:** ❌ **NO puede ser plugin**  
**Razón:** Requiere process spawning nativo, IPC con agentes externos, session management

---

### 3. 🧠 AI Vault (40+ archivos)
**Ubicación:** `src/main/ai-vault/`, `src/main/ai-vault-search/`

#### Componentes:
- **Session Scanners** (28 archivos)
  - OpenCode session parsing, SQLite reading
  - Requiere: SQLite access, file system
  
- **Search Index** (2 archivos)
  - Semantic search, embeddings
  - Requiere: Embedding models, vector storage

**Veredicto:** ❌ **NO puede ser plugin**  
**Razón:** Requiere SQLite nativo, file system access, embedding models

---

### 4. 🔌 LSP Integration (45+ archivos)
**Ubicación:** `src/main/lsp/`, `src/renderer/src/lib/lsp/`

#### Componentes:
- **LSP Server Management** (17 archivos)
  - Server lifecycle, protocol handling
  - Requiere: Process spawning, stdio communication
  
- **Editor Integration** (20+ archivos)
  - Navigation, semantic tokens, document sync
  - Requiere: Editor API, file watching

**Veredicto:** ❌ **NO puede ser plugin**  
**Razón:** Requiere process management nativo, protocol handling, editor integration

---

### 5. 🔧 MCP Integrations (30+ archivos)
**Ubicación:** `src/main/mcp-integrations/`

#### Componentes:
- **MCP Hub** (16 archivos)
  - Server lifecycle, tool registration
  - Requiere: Process spawning, stdio transport
  
- **OAuth & Secrets** (5 archivos)
  - Authentication, secret storage
  - Requiere: Secret store, OAuth flow

**Veredicto:** ❌ **NO puede ser plugin**  
**Razón:** Requiere process spawning nativo, tool registration, secret management

---

### 6. 📊 Graphify (15+ archivos)
**Ubicación:** `src/main/graphify/`

#### Componentes:
- **Code Graph** (11 archivos)
  - AST parsing, graph generation
  - Requiere: File system, AST tools

**Veredicto:** ❌ **NO puede ser plugin**  
**Razón:** Requiere file system access nativo, AST parsing

---

### 7. 🎯 Agent Hooks (25+ archivos)
**Ubicación:** `src/main/agent-hooks/`, `src/shared/agent-hook-listener/`

#### Componentes:
- **Hook System** (17 archivos)
  - Lifecycle hooks, event handling
  - Requiere: Agent lifecycle, IPC
  
- **WSL Relay** (8 archivos)
  - Cross-platform hook relay
  - Requiere: WSL integration, process management

**Veredicto:** ❌ **NO puede ser plugin**  
**Razón:** Requiere agent lifecycle access nativo, IPC system

---

### 8. 🎨 UI Components (231 archivos)
**Ubicación:** `src/renderer/src/components/`

#### Desglose:

##### ✅ Plugin-able (~50 archivos):
- **Flow Dashboard** (3 archivos)
  - `flow-dashboard/FlowDashboard.tsx`
  - `flow-dashboard-selector.ts`
  - **Puede ser:** Panel plugin
  
- **Agent Panels** (2 archivos)
  - `AgentCompatibilityPanel.tsx`, `AgentHealthDashboard.tsx`
  - **Puede ser:** Panel plugin
  
- **Chat Appearance** (5 archivos)
  - `native-chat/appearance/*.ts`
  - **Puede ser:** Theme plugin (requiere API enhancements)
  
- **Worktree Card Styling** (4 archivos)
  - `sidebar/workspace-card/surface/*.tsx`
  - **Puede ser:** Theme plugin (requiere API enhancements)

##### ❌ No plugin-able (~180 archivos):
- **Source Control** (17 archivos)
  - `right-sidebar/source-control/**/*.tsx`
  - Requiere: Git operations, diff engine
  
- **Native Chat** (12 archivos)
  - `native-chat/composer/*.tsx`
  - Requiere: Chat state, IPC
  
- **Settings** (20+ archivos)
  - `settings/**/*.tsx`
  - Requiere: Settings API access
  
- **MTE UI** (5 archivos)
  - `settings/orchestration/*.tsx`
  - Requiere: Orchestration state access

**Veredicto:** ⚠️ **PARCIALMENTE plugin-able**  
**Razón:** Solo UI components independientes pueden ser plugins. Integraciones con state requieren core.

---

### 9. 🌐 Git Integration (15+ archivos)
**Ubicación:** `src/main/git/`

#### Componentes:
- **Git Operations** (11 archivos)
  - Command execution, diff engine
  - Requiere: Git binary, file system

**Veredicto:** ❌ **NO puede ser plugin**  
**Razón:** Requiere git binary access nativo, file system

---

### 10. 🛠️ Skills System (10+ archivos)
**Ubicación:** `src/main/skills/`, `src/shared/skills/`

#### Componentes:
- **Skill Installation** (4 archivos)
  - Installation system, file management
  - Requiere: File system, plugin system

**Veredicto:** ❌ **NO puede ser plugin**  
**Razón:** Requiere file system access nativo, plugin system integration

---

### 11. 🎯 Agent Launch (15+ archivos)
**Ubicación:** `src/main/agent-launch/`, `src/shared/agent-launch/`

#### Componentes:
- **Launch System** (13 archivos)
  - Agent spawning, configuration
  - Requiere: Process management

**Veredicto:** ❌ **NO puede ser plugin**  
**Razón:** Requiere process spawning nativo, agent system access

---

## Tabla Resumen

| Área | Archivos | Plugin-able | Razón |
|------|----------|-------------|-------|
| MTE Orchestration | 70 | ❌ 0% | SQLite, agent lifecycle, MCP |
| Agent Harnesses | 50+ | ❌ 0% | Process spawning, IPC |
| AI Vault | 40+ | ❌ 0% | SQLite, file system |
| LSP Integration | 45+ | ❌ 0% | Process management |
| MCP Integrations | 30+ | ❌ 0% | Process spawning |
| Graphify | 15+ | ❌ 0% | File system, AST |
| Agent Hooks | 25+ | ❌ 0% | Agent lifecycle |
| UI Components | 231 | ⚠️ 22% (~50) | Solo UI independiente |
| Git Integration | 15+ | ❌ 0% | Git binary |
| Skills System | 10+ | ❌ 0% | File system |
| Agent Launch | 15+ | ❌ 0% | Process management |
| Otros | 50+ | ❌ 0% | Varios |
| **TOTAL** | **1,024** | **~150 (15%)** | |

---

## Lo que SÍ puede ser Plugin (~150 archivos)

### 1. Flow Dashboard Plugin ✅
- `src/renderer/src/components/flow-dashboard/FlowDashboard.tsx`
- `src/renderer/src/store/slices/agent-status/flow-dashboard-selector.ts`
- **Tipo:** Panel plugin
- **Estado:** Ya creado en `plugins/flow-dashboard/`

### 2. Agent Management Plugin ✅
- `src/renderer/src/components/settings/agents/AgentCompatibilityPanel.tsx`
- `src/renderer/src/components/settings/agents/AgentHealthDashboard.tsx`
- **Tipo:** Panel plugin
- **Estado:** Ya creado en `plugins/agent-management/`

### 3. Agent Filter Plugin ✅
- Configuración de agentes habilitados
- **Tipo:** Configuration plugin
- **Estado:** Ya creado en `plugins/agent-filter/`

### 4. Task Provider Filter Plugin ✅
- Configuración de task providers
- **Tipo:** Configuration plugin
- **Estado:** Ya creado en `plugins/task-provider-filter/`

### 5. Chat Appearance Plugin (Futuro)
- Compact mode, monospace font
- **Tipo:** Theme plugin
- **Requiere:** Theme plugin API enhancements

### 6. Worktree Card Styling Plugin (Futuro)
- Custom card appearance
- **Tipo:** Theme plugin
- **Requiere:** Theme plugin API enhancements

---

## Lo que NO puede ser Plugin (~874 archivos)

### Sistemas Nativos Completos:

1. **MTE Orchestration** (70 archivos)
   - Memory system (SQLite)
   - Planner & workers
   - MCP integration
   - Deploy checks

2. **Agent Harnesses** (50+ archivos)
   - OpenCode V2 adapter
   - Claude adapter
   - Codex adapter
   - Antigravity adapter
   - ACP protocol

3. **AI Vault** (40+ archivos)
   - Session scanners
   - Search index
   - SQLite storage

4. **LSP Integration** (45+ archivos)
   - Server management
   - Editor integration
   - Protocol handling

5. **MCP Integrations** (30+ archivos)
   - MCP hub
   - OAuth & secrets
   - Tool registration

6. **Graphify** (15+ archivos)
   - Code graph generation
   - AST parsing

7. **Agent Hooks** (25+ archivos)
   - Lifecycle hooks
   - WSL relay

8. **Git Integration** (15+ archivos)
   - Git operations
   - Diff engine

9. **UI Integrations** (180+ archivos)
   - Source control UI (requiere git)
   - Native chat UI (requiere chat state)
   - Settings UI (requiere settings API)
   - MTE UI (requiere orchestration state)

---

## Conclusión Final

### La Realidad

El fork MTEKode **NO es una colección de personalizaciones extraíbles**. Es una **modificación profunda del core de Orca** que integra sistemas completos a nivel de sistema:

- **SQLite databases** (AI Vault, MTE Memory)
- **Process spawning** (Agent harnesses, LSP, MCP)
- **IPC system** (ACP, Agent hooks)
- **File system access** (Graphify, Git)
- **Agent lifecycle** (Orchestration, Hooks)
- **Secret management** (MCP OAuth)

### Lo que se puede hacer

1. **Mantener el fork** para todas las integraciones nativas (MTE, LSP, AI Vault, etc.)
2. **Extraer como plugins** solo las UI enhancements independientes (Flow Dashboard, Agent panels)
3. **Contribuir al upstream** con mejoras de configuración que no requieran core changes

### Lo que NO se puede hacer

1. **NO se puede** usar el Orca original + plugins para reemplazar el fork
2. **NO se puede** extraer MTE orchestration como plugin
3. **NO se puede** extraer LSP integration como plugin
4. **NO se puede** extraer AI Vault como plugin
5. **NO se puede** extraer Agent harnesses como plugin

### Recomendación

**Mantener el fork MTEKode** como una versión modificada de Orca con integraciones nativas adicionales. Extraer solo las UI enhancements como plugins para demostrar la plugin architecture y contribuir al upstream.

---

## Archivos de Referencia

- Análisis exhaustivo: `EXHAUSTIVE_FORK_ANALYSIS.md`
- Análisis de customizaciones: `FORK_CUSTOMIZATIONS_ANALYSIS.md`
- Resumen de migración: `PLUGIN_MIGRATION_SUMMARY.md`
- Lista completa de archivos: `/tmp/all-changed-files.txt`
- Diff estadístico: `git diff --stat upstream/main...HEAD`

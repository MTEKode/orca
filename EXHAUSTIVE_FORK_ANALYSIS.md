# Análisis Exhaustivo: MTEKode/orca vs stablyai/orca

**Fecha:** 2024-11-17  
**Total de archivos cambiados:** 1,024  
**Inserciones:** 59,215  
**Eliminaciones:** 4,104

---

## Resumen Ejecutivo

El fork MTEKode contiene **modificaciones profundas al core de Orca** que van mucho más allá de personalizaciones de UI. La mayoría de los cambios son **integraciones nativas** que requieren acceso al runtime, IPC, y sistemas internos de Orca.

**Conclusión:** Solo ~15-20% de los cambios pueden extraerse como plugins. El resto requiere modificaciones al core de Orca.

---

## Categorización por Área Funcional

### 1. 🎯 MTE Orchestration (NATIVO - No plugin-able)
**Archivos:** ~150+  
**Ubicación:** `src/shared/mte/`, `src/main/mte/`, `skills/mte/`

#### Cambios:
- **Memory System** (SQLite-based)
  - `src/shared/mte/memory-database.ts`
  - `src/shared/mte/memory-store.ts`
  - `src/shared/mte/memory-tools.ts`
  - Requiere: Acceso a SQLite, persistencia nativa
  
- **Planner Prompt Enhancements**
  - `src/shared/mte/planner-prompt.ts`
  - Interactive questions, brainstorming mode
  - Requiere: Integración con agent launch
  
- **MCP Integration**
  - `src/shared/mte/mcp/workspace-mcp-config.ts`
  - `src/shared/mte/mcp/toml/*.ts`
  - Requiere: Acceso a MCP server management
  
- **Orchestration State**
  - `src/shared/mte/orchestration-agents.ts`
  - `src/shared/mte/worker-personas.ts`
  - Requiere: Acceso a agent lifecycle
  
- **Worker Management**
  - `src/shared/mte/worker-pin.ts`
  - `src/shared/mte/start-goal.ts`
  - Requiere: Acceso a worktree management

**Veredicto:** ❌ **NO puede ser plugin** - Requiere acceso nativo a:
- SQLite database
- Agent launch system
- Worktree management
- MCP server lifecycle
- IPC handlers

---

### 2. 🤖 Agent Harnesses (NATIVO - No plugin-able)
**Archivos:** ~100+  
**Ubicación:** `src/main/opencode-v2/`, `src/main/claude/`, `src/main/codex/`, `src/main/antigravity/`

#### Cambios:
- **OpenCode V2 Adapter**
  - `src/main/opencode-v2/*.ts` (49 archivos)
  - Custom session management
  - Model configuration
  - Requiere: Acceso a agent process management
  
- **Claude Adapter**
  - `src/main/claude/*.ts` (5 archivos)
  - Custom integration
  - Requiere: Acceso a Claude CLI
  
- **Codex Adapter**
  - `src/main/codex/*.ts` (1 archivo)
  - Custom integration
  - Requiere: Acceso a Codex CLI
  
- **Antigravity Adapter**
  - `src/main/antigravity/*.ts` (1 archivo)
  - Custom integration
  - Requiere: Acceso a Antigravity CLI

**Veredicto:** ❌ **NO puede ser plugin** - Requiere:
- Process spawning
- IPC con agentes externos
- Session management nativo
- Model configuration

---

### 3. 🧠 AI Vault (NATIVO - No plugin-able)
**Archivos:** ~35+  
**Ubicación:** `src/main/ai-vault/`, `src/shared/ai-vault/`

#### Cambios:
- **Vault Storage**
  - `src/main/ai-vault/*.ts` (28 archivos)
  - SQLite-based storage
  - Vector embeddings
  - Requiere: Acceso a SQLite, file system
  
- **Vault Search**
  - `src/main/ai-vault-search/*.ts` (2 archivos)
  - Semantic search
  - Requiere: Acceso a embedding models

**Veredicto:** ❌ **NO puede ser plugin** - Requiere:
- SQLite database
- File system access
- Embedding model integration
- Native search indexing

---

### 4. 🔌 LSP Integration (NATIVO - No plugin-able)
**Archivos:** ~20+  
**Ubicación:** `src/main/lsp/`, `tests/e2e/lsp-navigation.spec.ts`

#### Cambios:
- **LSP Server Management**
  - `src/main/lsp/*.ts` (17 archivos)
  - Language server lifecycle
  - Protocol handling
  - Requiere: Acceso a process management
  
- **LSP Navigation**
  - `tests/e2e/lsp-navigation.spec.ts`
  - Go to definition, references
  - Requiere: Acceso a editor integration

**Veredicto:** ❌ **NO puede ser plugin** - Requiere:
- Process spawning
- Protocol handling nativo
- Editor integration
- File watching

---

### 5. 🎨 UI Components (PARCIALMENTE plugin-able)
**Archivos:** ~230+  
**Ubicación:** `src/renderer/src/components/`

#### Cambios:

##### ✅ Plugin-able (~50 archivos):
- **Flow Dashboard**
  - `src/renderer/src/components/flow-dashboard/FlowDashboard.tsx`
  - `src/renderer/src/store/slices/agent-status/flow-dashboard-selector.ts`
  - Puede ser: Plugin con panel
  
- **Agent Panels**
  - `src/renderer/src/components/settings/agents/AgentCompatibilityPanel.tsx`
  - `src/renderer/src/components/settings/agents/AgentHealthDashboard.tsx`
  - Puede ser: Plugin con panel
  
- **Chat Appearance**
  - `src/renderer/src/components/native-chat/appearance/*.ts`
  - Compact mode, monospace font
  - Puede ser: Theme plugin (requiere API enhancements)
  
- **Worktree Card Styling**
  - `src/renderer/src/components/sidebar/workspace-card/surface/*.tsx`
  - Puede ser: Theme plugin (requiere API enhancements)

##### ❌ No plugin-able (~180 archivos):
- **Source Control Enhancements**
  - `src/renderer/src/components/right-sidebar/source-control/**/*.tsx` (~50 archivos)
  - Inline comments, update from base
  - Requiere: Acceso a git operations, diff engine
  
- **Native Chat Integration**
  - `src/renderer/src/components/native-chat/**/*.tsx` (~80 archivos)
  - Custom message rendering, composer enhancements
  - Requiere: Acceso a chat state, IPC
  
- **Settings Pages**
  - `src/renderer/src/components/settings/**/*.tsx` (~50 archivos)
  - Custom settings UI
  - Requiere: Acceso a settings API

**Veredicto:** ⚠️ **PARCIALMENTE plugin-able** - Solo UI components independientes pueden ser plugins. Integraciones profundas requieren core.

---

### 6. 🔧 MCP Integrations (NATIVO - No plugin-able)
**Archivos:** ~20+  
**Ubicación:** `src/main/mcp-integrations/`, `src/shared/mcp-integrations/`

#### Cambios:
- **MCP Server Management**
  - `src/main/mcp-integrations/*.ts` (16 archivos)
  - Server lifecycle
  - Tool registration
  - Requiere: Acceso a process management
  
- **MCP Configuration**
  - `src/shared/mcp-integrations/*.ts` (2 archivos)
  - Configuration management
  - Requiere: Acceso to config system

**Veredicto:** ❌ **NO puede ser plugin** - Requiere:
- Process spawning
- Tool registration nativo
- Configuration system access

---

### 7. 📊 Graphify (NATIVO - No plugin-able)
**Archivos:** ~15+  
**Ubicación:** `src/main/graphify/`, `skills/graphify/`

#### Cambios:
- **Graphify Integration**
  - `src/main/graphify/*.ts` (11 archivos)
  - Code graph generation
  - AST parsing
  - Requiere: Acceso a file system, AST tools

**Veredicto:** ❌ **NO puede ser plugin** - Requiere:
- File system access
- AST parsing nativo
- Code analysis tools

---

### 8. 🎯 Agent Hooks (NATIVO - No plugin-able)
**Archivos:** ~20+  
**Ubicación:** `src/main/agent-hooks/`, `src/shared/agent-hook-listener/`

#### Cambios:
- **Agent Hook System**
  - `src/main/agent-hooks/*.ts` (17 archivos)
  - Lifecycle hooks
  - Event handling
  - Requiere: Acceso a agent lifecycle
  
- **Hook Listener**
  - `src/shared/agent-hook-listener/*.ts` (5 archivos)
  - Event subscription
  - Requiere: Acceso to event system

**Veredicto:** ❌ **NO puede ser plugin** - Requiere:
- Agent lifecycle access
- Event system nativo
- IPC handlers

---

### 9. 🔐 ACP (Agent Communication Protocol) (NATIVO - No plugin-able)
**Archivos:** ~15+  
**Ubicación:** `src/main/acp/`

#### Cambios:
- **ACP Implementation**
  - `src/main/acp/*.ts` (13 archivos)
  - Protocol handling
  - Message routing
  - Requiere: Acceso to IPC system

**Veredicto:** ❌ **NO puede ser plugin** - Requiere:
- IPC system access
- Protocol handling nativo
- Message routing

---

### 10. 🌐 Git Integration (PARCIALMENTE plugin-able)
**Archivos:** ~15+  
**Ubicación:** `src/main/git/`

#### Cambios:

##### ✅ Plugin-able (~5 archivos):
- **Git UI Enhancements**
  - Branch comparison UI
  - Update from base button
  - Puede ser: Plugin con panel

##### ❌ No plugin-able (~10 archivos):
- **Git Operations**
  - `src/main/git/*.ts` (11 archivos)
  - Git command execution
  - Diff engine
  - Requiere: Acceso to git binary, file system

**Veredicto:** ⚠️ **PARCIALMENTE plugin-able** - Solo UI puede ser plugin. Operaciones requieren core.

---

### 11. 🎨 Review Tools (NATIVO - No plugin-able)
**Archivos:** ~5+  
**Ubicación:** `src/main/review-tools/`

#### Cambios:
- **Review Tools**
  - `src/main/review-tools/*.ts` (5 archivos)
  - Code review integration
  - Requiere: Acceso to git, diff engine

**Veredicto:** ❌ **NO puede ser plugin** - Requiere:
- Git integration
- Diff engine nativo

---

### 12. 🛠️ Skills System (PARCIALMENTE plugin-able)
**Archivos:** ~10+  
**Ubicación:** `src/main/skills/`, `src/shared/skills/`

#### Cambios:

##### ✅ Plugin-able (~5 archivos):
- **Skill Catalog**
  - `src/shared/skills/unified-skill-catalog.ts`
  - Skill filtering
  - Puede ser: Plugin con configuration

##### ❌ No plugin-able (~5 archivos):
- **Skill Installation**
  - `src/main/skills/*.ts` (4 archivos)
  - Skill installation system
  - Requiere: Acceso to file system, plugin system

**Veredicto:** ⚠️ **PARCIALMENTE plugin-able** - Catalog filtering puede ser plugin. Installation requiere core.

---

### 13. 🎯 Agent Launch (NATIVO - No plugin-able)
**Archivos:** ~15+  
**Ubicación:** `src/main/agent-launch/`, `src/shared/agent-launch/`

#### Cambios:
- **Agent Launch System**
  - `src/main/agent-launch/*.ts` (2 archivos)
  - Agent spawning
  - Configuration
  - Requiere: Acceso to process management
  
- **Launch Parameters**
  - `src/shared/agent-launch/*.ts` (13 archivos)
  - Parameter validation
  - Default configuration
  - Requiere: Acceso to agent system

**Veredicto:** ❌ **NO puede ser plugin** - Requiere:
- Process spawning
- Agent system access
- Configuration management

---

### 14. 📱 Native Chat (PARCIALMENTE plugin-able)
**Archivos:** ~20+  
**Ubicación:** `src/main/native-chat/`, `src/shared/native-chat/`

#### Cambios:

##### ✅ Plugin-able (~5 archivos):
- **Chat Appearance**
  - `src/shared/native-chat/native-chat-appearance-settings.ts`
  - Compact mode, monospace font
  - Puede ser: Theme plugin

##### ❌ No plugin-able (~15 archivos):
- **Chat Integration**
  - `src/main/native-chat/*.ts` (17 archivos)
  - Chat state management
  - Message handling
  - Requiere: Acceso to chat system, IPC

**Veredicto:** ⚠️ **PARCIALMENTE plugin-able** - Solo appearance puede ser plugin. Integration requiere core.

---

### 15. 🎯 Agent Status (PARCIALMENTE plugin-able)
**Archivos:** ~10+  
**Ubicación:** `src/shared/agent-status/`

#### Cambios:

##### ✅ Plugin-able (~3 archivos):
- **Status Selectors**
  - `src/renderer/src/store/slices/agent-status/flow-dashboard-selector.ts`
  - Status filtering
  - Puede ser: Plugin con selector

##### ❌ No plugin-able (~7 archivos):
- **Status Management**
  - `src/shared/agent-status/*.ts` (7 archivos)
  - Status tracking
  - Event handling
  - Requiere: Acceso to agent system

**Veredicto:** ⚠️ **PARCIALMENTE plugin-able** - Solo selectors pueden ser plugins. Management requiere core.

---

## Resumen de Plugin-ability

### ✅ Puede ser Plugin (~150-200 archivos, 15-20%)

| Área | Archivos | Tipo de Plugin |
|------|----------|----------------|
| Flow Dashboard | 3 | Panel plugin |
| Agent Panels | 2 | Panel plugin |
| Chat Appearance | 5 | Theme plugin |
| Worktree Card Styling | 5 | Theme plugin |
| Git UI Enhancements | 5 | Panel plugin |
| Skill Catalog Filtering | 5 | Configuration plugin |
| Native Chat Appearance | 5 | Theme plugin |
| Agent Status Selectors | 3 | Panel plugin |
| Agent Filter | 4 | Configuration plugin |
| Task Provider Filter | 4 | Configuration plugin |
| **TOTAL** | **~150** | |

### ❌ NO puede ser Plugin (~850-900 archivos, 80-85%)

| Área | Archivos | Razón |
|------|----------|-------|
| MTE Orchestration | 150+ | Requiere SQLite, agent lifecycle, MCP |
| Agent Harnesses | 100+ | Requiere process spawning, IPC |
| AI Vault | 35+ | Requiere SQLite, file system |
| LSP Integration | 20+ | Requiere process management |
| MCP Integrations | 20+ | Requiere process spawning |
| Graphify | 15+ | Requiere file system, AST |
| Agent Hooks | 20+ | Requiere agent lifecycle |
| ACP | 15+ | Requiere IPC system |
| Git Operations | 10+ | Requiere git binary |
| Review Tools | 5+ | Requiere git, diff engine |
| Agent Launch | 15+ | Requiere process management |
| Native Chat Integration | 15+ | Requiere chat system |
| Agent Status Management | 7+ | Requiere agent system |
| Source Control Integration | 50+ | Requiere git, diff engine |
| Settings Integration | 50+ | Requiere settings API |
| **TOTAL** | **~850** | |

---

## Conclusión

### Lo que SÍ se puede extraer como plugins:
1. **UI panels independientes** (Flow Dashboard, Agent panels)
2. **Theme/appearance customizations** (chat appearance, worktree styling)
3. **Configuration filters** (agent filter, task provider filter)
4. **UI enhancements** (git UI, skill catalog UI)

### Lo que NO se puede extraer como plugins:
1. **MTE Orchestration** - Requiere acceso nativo a SQLite, agent lifecycle, MCP
2. **Agent Harnesses** - Requiere process spawning, IPC con agentes externos
3. **AI Vault** - Requiere SQLite, file system, embedding models
4. **LSP Integration** - Requiere process management, protocol handling
5. **MCP Integrations** - Requiere process spawning, tool registration
6. **Graphify** - Requiere file system, AST parsing
7. **Agent Hooks** - Requiere agent lifecycle access
8. **ACP** - Requiere IPC system access
9. **Git Operations** - Requiere git binary, diff engine
10. **Source Control Integration** - Requiere git, diff engine

### Recomendación

**Mantener el fork MTEKode** para las siguientes funcionalidades nativas:
- MTE Orchestration completa
- Agent Harnesses (OpenCode V2, Claude, Codex, Antigravity)
- AI Vault
- LSP Integration
- MCP Integrations
- Graphify
- Agent Hooks
- ACP
- Git Operations
- Source Control Integration

**Extraer como plugins** solo las UI enhancements:
- Flow Dashboard
- Agent Panels
- Chat Appearance
- Worktree Card Styling
- Configuration Filters

**Contribuir al upstream** las mejoras que beneficien a todos:
- Agent Filter configuration
- Task Provider Filter configuration
- UI improvements que no requieran core changes

---

## Próximos Pasos

1. **Mantener el fork** para funcionalidades nativas (MTE, LSP, AI Vault, etc.)
2. **Extraer plugins** para UI enhancements (Flow Dashboard, Agent Panels, etc.)
3. **Contribuir al upstream** con mejoras de configuración y UI
4. **Documentar** qué requiere core vs qué puede ser plugin
5. **Proponer API enhancements** al upstream para habilitar más plugin-ability

---

## Archivos de Referencia

- Análisis completo: `FORK_CUSTOMIZATIONS_ANALYSIS.md`
- Lista de archivos: `/tmp/all-changed-files.txt`
- Diff estadístico: `git diff --stat upstream/main...HEAD`

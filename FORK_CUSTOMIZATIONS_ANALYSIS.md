# Fork Customizations Analysis
## MTEKode/orca vs stablyai/orca

**Generated:** 2024-11-17
**Total files changed:** 1008
**Insertions:** 57,469
**Deletions:** 4,104

---

## Summary

This document categorizes all customizations made in the MTEKode fork to identify what can be extracted into plugins vs what must remain in core.

---

## Categories

### 1. UI/UX Customizations (Plugin-able)

#### 1.1 Flow Dashboard & Orchestration UI
- `src/renderer/src/components/flow-dashboard/FlowDashboard.tsx`
- `src/renderer/src/store/slices/agent-status/flow-dashboard-selector.ts`
- `src/renderer/src/components/settings/orchestration/MteFlowPane.tsx`
- Related i18n files

**Plugin Potential:** HIGH - Can be extracted as a standalone Flow Dashboard plugin

#### 1.2 Agent Panels (Health, Compatibility)
- `src/renderer/src/components/settings/agents/AgentCompatibilityPanel.tsx`
- `src/renderer/src/components/settings/agents/AgentHealthDashboard.tsx`

**Plugin Potential:** HIGH - Can be extracted as an Agent Management plugin

#### 1.3 Chat Appearance (Compact mode, Monospace font)
- `src/renderer/src/components/native-chat/appearance/native-chat-appearance-style.ts`
- `src/shared/native-chat/native-chat-appearance-settings.ts`
- `src/renderer/src/assets/main.css` (chat-related CSS)

**Plugin Potential:** MEDIUM - Requires theme plugin API

#### 1.4 Worktree Card Styling
- `src/renderer/src/components/sidebar/workspace-card/surface/worktree-card-surface.tsx`
- Related CSS changes

**Plugin Potential:** MEDIUM - Requires theme plugin API

#### 1.5 Source Control Enhancements
- `src/renderer/src/components/right-sidebar/source-control/panel/branch-context-row.tsx` (Update from base button)
- `src/renderer/src/components/right-sidebar/source-control/sync/compare-summary.tsx`
- Inline comments UI components

**Plugin Potential:** LOW - Deep integration with source control panel

---

### 2. Agent Configuration (Plugin-able)

#### 2.1 Agent Catalog Filtering
- `src/renderer/src/lib/agent-catalog/agent-catalog-entries-primary.ts` (filtered to 5 agents)
- `src/renderer/src/lib/agent-catalog/agent-catalog-entries-secondary.ts` (emptied)
- `src/renderer/src/components/tab-bar/use-new-tab-agent-menu-rows.ts`

**Plugin Potential:** HIGH - Can be an Agent Filter plugin

#### 2.2 Default Settings
- `src/shared/default-global-settings.ts` (chat mode default, disabled features)

**Plugin Potential:** MEDIUM - Requires settings override plugin API

#### 2.3 Task Providers
- `src/shared/work-items/task-providers.ts` (restricted to GitHub & Linear)

**Plugin Potential:** HIGH - Can be a Task Provider Filter plugin

---

### 3. MTE/Orchestration Enhancements (Core - Keep in fork)

#### 3.1 MTE Memory System
- `src/shared/mte/memory-*.ts` (entire memory layer)
- `src/shared/mte/memory-database.ts`
- `src/shared/mte/memory-store.ts`
- `src/shared/mte/memory-tools.ts`

**Plugin Potential:** LOW - Deep integration with MTE orchestration

#### 3.2 MTE Planner Prompt Enhancements
- `src/shared/mte/planner-prompt.ts` (interactive questions, brainstorming mode)

**Plugin Potential:** LOW - Core MTE logic

#### 3.3 MTE MCP Integration
- `src/shared/mte/mcp/workspace-mcp-config.ts`
- `src/shared/mte/mcp/toml/*.ts`

**Plugin Potential:** LOW - Core MTE infrastructure

#### 3.4 Orchestration State Management
- `src/renderer/src/store/slices/agent-status/agent-status-orchestration-context.ts`
- Related orchestration selectors

**Plugin Potential:** LOW - Core orchestration logic

---

### 4. Skills & Integrations (Mixed)

#### 4.1 Graphify Integration
- `skills/graphify/SKILL.md`
- `skill-guides/graphify.md`
- Related CLI handlers

**Plugin Potential:** HIGH - Already a skill, can be standalone plugin

#### 4.2 MTE Skill
- `skills/mte/SKILL.md`
- `skill-guides/mte.md`

**Plugin Potential:** MEDIUM - Core to MTE workflow

#### 4.3 Orchestration Skill
- `skills/orchestration/SKILL.md`

**Plugin Potential:** MEDIUM - Core to orchestration

---

### 5. Infrastructure & Build (Core - Keep in fork)

#### 5.1 Build Configuration
- `config/electron-builder.config.cjs`
- `config/scripts/desktop-distribution/macos/build-mac-local.mjs`
- `.github/workflows/mtekode-release.yml`
- `.github/workflows/mtekode-upstream-sync.yml`

**Plugin Potential:** NONE - Build infrastructure

#### 5.2 Native Modules
- Various native module additions (windows-registry, windows-security, etc.)

**Plugin Potential:** NONE - Core infrastructure

---

### 6. Documentation (Plugin-able)

#### 6.1 Custom Documentation
- `docs/site/content/docs/cli/orchestration.mdx`
- `docs/site/content/docs/cli/skills.mdx`
- Custom guides and references

**Plugin Potential:** HIGH - Can be plugin documentation

---

### 7. Configuration Files (Core - Keep in fork)

#### 7.1 Linting & Formatting
- `.oxlintrc.json`
- `.oxfmtrc.json`

**Plugin Potential:** NONE - Project configuration

#### 7.2 Localization
- `src/renderer/src/i18n/locales/en.json`
- `src/renderer/src/i18n/locales/es.json`
- Related locale files

**Plugin Potential:** MEDIUM - Can be a localization plugin

---

## Recommended Plugin Extraction Plan

### Phase 1: High-Priority Plugins (Easy to extract)

1. **Flow Dashboard Plugin**
   - Extract FlowDashboard component
   - Extract flow-dashboard-selector
   - Create plugin manifest
   - Register sidebar tab

2. **Agent Management Plugin**
   - Extract AgentCompatibilityPanel
   - Extract AgentHealthDashboard
   - Create settings page integration

3. **Agent Filter Plugin**
   - Extract agent catalog filtering logic
   - Create configuration UI
   - Allow dynamic agent enable/disable

4. **Task Provider Filter Plugin**
   - Extract task provider filtering
   - Create configuration UI

### Phase 2: Medium-Priority Plugins (Require API enhancements)

5. **Chat Appearance Plugin**
   - Requires theme plugin API
   - Extract compact mode logic
   - Extract monospace font logic

6. **Localization Plugin**
   - Extract custom translations
   - Create translation override system

### Phase 3: Keep in Core (Deep integration)

- MTE Memory System
- MTE Planner enhancements
- Orchestration state management
- Native modules
- Build infrastructure

---

## Next Steps

1. Create plugin directory structure
2. Implement plugin manifest format
3. Extract Phase 1 plugins
4. Test plugin loading and isolation
5. Document plugin API requirements for Phase 2

---

## Files by Category (Detailed)

### UI Components (Plugin-able)
```
src/renderer/src/components/flow-dashboard/FlowDashboard.tsx
src/renderer/src/components/settings/agents/AgentCompatibilityPanel.tsx
src/renderer/src/components/settings/agents/AgentHealthDashboard.tsx
src/renderer/src/components/settings/orchestration/MteFlowPane.tsx
```

### State Management (Plugin-able)
```
src/renderer/src/store/slices/agent-status/flow-dashboard-selector.ts
```

### Agent Configuration (Plugin-able)
```
src/renderer/src/lib/agent-catalog/agent-catalog-entries-primary.ts
src/renderer/src/lib/agent-catalog/agent-catalog-entries-secondary.ts
src/renderer/src/components/tab-bar/use-new-tab-agent-menu-rows.ts
src/shared/default-global-settings.ts
src/shared/work-items/task-providers.ts
```

### MTE Core (Keep in fork)
```
src/shared/mte/memory-*.ts
src/shared/mte/planner-prompt.ts
src/shared/mte/mcp/*.ts
src/shared/mte/orchestration-*.ts
```

### Skills (Plugin-able)
```
skills/graphify/SKILL.md
skills/mte/SKILL.md
skills/orchestration/SKILL.md
skill-guides/graphify.md
skill-guides/mte.md
```

---

## Conclusion

**Total plugin-able files:** ~150-200 files (15-20% of changes)
**Core files to keep in fork:** ~800 files (80-85% of changes)

The majority of customizations are deeply integrated into MTE orchestration and core infrastructure, making them difficult to extract without significant refactoring. However, the UI enhancements (Flow Dashboard, Agent panels, filtering) can be cleanly extracted into plugins with the current plugin API.

**Recommendation:** Start with Phase 1 plugins to validate the plugin architecture, then gradually extract more features as the plugin API matures.

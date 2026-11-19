# Respuestas a tus preguntas

## 1. ¿Dónde viven las conexiones a servidores/mobile?

### Servidores remotos (Remote Orca servers)

**Archivo**: `src/renderer/src/components/settings/page/settings-remote-security-section-renderers.tsx`
**Componente**: `RuntimeEnvironmentsPane`
**Descripción**: "Run Orca on another machine and work on it from here."

### SSH hosts

**Archivo**: `src/renderer/src/components/settings/page/settings-remote-security-section-renderers.tsx`
**Componente**: `SshPane`
**Descripción**: "Use existing machines over SSH for files, terminals, Git, and workspaces."

### Mobile

**Archivo**: `src/renderer/src/components/settings/mobile/MobilePane.tsx`
**Sección**: Settings → Mobile
**Descripción**: Configuración de emulador móvil y pairing

---

## 2. ¿Cómo se instalan las herramientas para Flow (MTE)?

### Skill de MTE

**Nombre**: `mte` (MTE_SKILL_NAME)
**Archivo de instalación**: `src/renderer/src/lib/skills/installation/agent-feature-install-commands.ts`

**Comando de instalación**:

```typescript
export const MTE_SKILL_INSTALL_COMMAND = buildAgentFeatureSkillInstallCommand([MTE_SKILL_NAME])
```

**Pane de configuración**: `src/renderer/src/components/settings/orchestration/MteFlowPane.tsx`

**Qué hace**:

- Usa `AgentSkillSetupPanel` para instalar el skill
- El skill permite a los agentes iniciar y manejar MTE runs a través de Orca
- Incluye ejemplos de uso con `SkillUsageExamplesSection`
- Configuración de `nestedWorkerMaxDepth` (profundidad máxima de workers anidados)
- Configuración de `OrchestrationWorkerAutoReleaseSetting`

**Skills relacionados**:

- `orca-cli` - CLI de Orca
- `orca-linear` - Integración con Linear
- `orca-computer-use` - Computer use
- `orca-per-workspace-env` - Ephemeral VMs

---

## 3. ¿Dónde vive la configuración de permisos?

### Permisos de Chat (Agent permissions)

**Archivo**: `src/renderer/src/components/settings/chat/ChatPermissionSetting.tsx`
**Sección**: Settings → Chat → Permissions

**Configuración**:

- `nativeChatPermissionMode`: Modo de permiso por defecto
- Modos: `full-access`, `own`, etc.
- Permisos por agente: `PERMISSION_CHOICE_AGENTS`

### Permisos de Agentes (Agent launch settings)

**Archivo**: `src/renderer/src/components/settings/agents/launch/HostAgentLaunchSettings.tsx`
**Sección**: Settings → Agents

**Configuración**:

- `agentPermissionDefault`: Permiso por defecto
- `agentPermissionOverrides`: Overrides por agente
- `agentWorkspaceTrustEnabled`: Trust de workspace

### Permisos de Repositorio (Repository trust)

**Archivo**: `src/renderer/src/components/settings/repository/RepositoryAgentTrustSection.tsx`
**Sección**: Repository Settings → Agent Trust

### Permisos de Desarrollador (macOS)

**Archivo**: `src/renderer/src/components/settings/developer-permissions/DeveloperPermissionsPane.tsx`
**Sección**: Settings → macOS Permissions
**Descripción**: "macOS privacy access for terminal-launched developer tools."

---

## Decisiones confirmadas

### ✅ Repository settings: Mantener pero simplificar

- Per-repo configuration
- Simplificar UI

### ✅ Plugins: FUERA

- Eliminar sección de plugins
- No mostrar en settings

### ✅ Experimental: Mantener

- Mantener sección experimental
- Features experimentales visibles

### ✅ MTE Flow → Flow

- Renombrar "MTE flow" a solo "Flow"
- Mantener funcionalidad

### ✅ Resto: Simplificar

- Ocultar secciones no esenciales
- Simplificar UI

---

## Próximos pasos

1. Renombrar "MTE flow" → "Flow" en:
   - `MteFlowPane.tsx`
   - Traducciones (i18n)
   - Búsqueda de settings

2. Eliminar sección de Plugins:
   - `settings-advanced-section-renderers.tsx`
   - `PluginsPane.tsx`

3. Simplificar Repository settings:
   - Mantener per-repo
   - Simplificar UI

4. Mantener Experimental:
   - No cambiar

5. Simplificar resto de secciones según análisis anterior

# Análisis de Settings de Orca

## Fuentes configuradas

- **IDE/App**: Monaspace Krypton Var
- **Terminal**: Monaspace Radon Var
- **Chat**: Monaspace Radon Var (por defecto)
- **Ancho del chat**: Compact (32rem/512px)

---

## SECCIONES DE SETTINGS ACTUALES

### 1. **General**

- Language
- Theme (system/light/dark)
- App icon
- Window material
- Reduce visual effects
- Minimize to tray
- Show menu bar icon

### 2. **Appearance**

- Theme
- Zoom
- App appearance
- Terminal appearance
- Sidebars
- Status bar
- **Chat UI** (apariencia del chat)
  - Contrast
  - Font family
  - Text size
  - Code text size
  - Width (compact/comfortable/wide/full)
  - Reset

### 3. **Terminal**

- Shells
- Renderer
- Sessions
- Behavior
- Quick commands
- Floating workspace

### 4. **Browser**

- Home page
- Link routing
- Session cookies

### 5. **Mobile emulator** ⚠️

- Configure mobile emulator support

### 6. **Agents**

- Manage AI agents
- Set default
- Customize commands
- Agent default surface (chat/terminal)

### 7. **AI provider accounts** ⚠️

- Optional account management
- Provider logins

### 8. **MTE flow** ⚠️

- Orchestration runs
- Planner settings
- Workers
- Validation

### 9. **Linear** ⚠️

- Linear integration
- Setup checklist
- Agent skill

### 10. **Chat UI**

- Agent launch settings
- Appearance (ver Appearance)
- Turn activity
- Inline visuals
- Behavior
- Naming

### 11. **Input & editing**

- Selection behavior
- Editing behavior

### 12. **Notifications** ⚠️

- Desktop notifications
- Agent activity
- Terminal events

### 13. **Shortcuts**

- Keyboard shortcuts

### 14. **Stats & usage** ⚠️

- Token analytics
- Usage stats

### 15. **Artifacts** ⚠️

- Artifact sharing

### 16. **Automations** ⚠️

- Automation settings

### 17. **Setup guide** ⚠️

- Onboarding

### 18. **Share skills** ⚠️

- Skill sharing

### 19. **Integrations** ⚠️

- MCP integrations
- Graphify

### 20. **Mobile** ⚠️

- Mobile settings

### 21. **Orca account** ⚠️

- Account settings

### 22. **Session history** ⚠️

- History settings

### 23. **Git**

- Git settings

### 24. **Tasks**

- Task providers (GitHub, Linear)

### 25. **Privacy** ⚠️

- Privacy settings

### 26. **Servers** ⚠️

- Server settings

### 27. **SSH** ⚠️

- SSH settings

### 28. **Advanced** ⚠️

- Advanced settings
- Dev tools
- Experimental
- Plugins

### 29. **Repository settings** (per-repo)

- Identity
- Runtime
- MCP
- Source control
- Hooks
- Worktrees
- Hosts

---

## PROPUESTA DE SIMPLIFICACIÓN

### ✅ MANTENER (Esenciales)

1. **General**
   - Language
   - Theme
   - App icon

2. **Appearance**
   - Theme
   - Zoom
   - **Chat UI** (simplificado)
     - Font family (ya configurado: Monaspace Radon Var)
     - Width (ya configurado: Compact)
     - Text size
     - Code text size

3. **Terminal**
   - Shells
   - Font (ya configurado: Monaspace Radon Var)
   - Font size
   - Theme

4. **Agents**
   - Agent list
   - Default surface (ya configurado: chat)

5. **Chat UI**
   - Behavior
   - Turn activity

6. **Input & editing**

7. **Shortcuts**

8. **Git**

9. **Tasks**
   - Task providers (GitHub, Linear)

10. **Integrations**
    - MCP integrations
    - Graphify

---

### ❌ QUITAR (Innecesarios/Complejos)

1. **Mobile emulator** - No usado
2. **AI provider accounts** - Complejo, no esencial
3. **MTE flow** - Muy específico, no para usuarios generales
4. **Linear** - Solo si no está conectado
5. **Notifications** - Puede ser automático
6. **Stats & usage** - No esencial
7. **Artifacts** - No usado
8. **Automations** - Complejo
9. **Setup guide** - Solo onboarding
10. **Share skills** - No esencial
11. **Mobile** - No usado
12. **Orca account** - No esencial
13. **Session history** - Puede ser automático
14. **Privacy** - Configuración avanzada
15. **Servers** - Avanzado
16. **SSH** - Avanzado
17. **Advanced** - Solo power users
18. **Floating workspace** - No esencial
19. **Browser** - Puede ser automático
20. **Quick commands** - No esencial

---

### ⚠️ DUDAS (Requieren decisión)

1. **Repository settings** - ¿Mantener per-repo o global?
2. **Source control** - ¿Simplificar?
3. **Plugins** - ¿Necesarios?
4. **Experimental features** - ¿Mostrar?
5. **Dev tools** - ¿Solo dev mode?

---

## PROPUESTA DE NUEVA ESTRUCTURA SIMPLIFICADA

```
Settings
├── General
│   ├── Language
│   ├── Theme
│   └── App icon
├── Appearance
│   ├── Theme
│   ├── Zoom
│   └── Chat
│       ├── Font (Monaspace Radon Var)
│       ├── Width (Compact)
│       ├── Text size
│       └── Code size
├── Terminal
│   ├── Shell
│   ├── Font (Monaspace Radon Var)
│   ├── Size
│   └── Theme
├── Agents
│   ├── Agents list
│   └── Default surface (Chat)
├── Chat
│   ├── Behavior
│   └── Turn activity
├── Input & editing
├── Shortcuts
├── Git
├── Tasks
│   └── Providers (GitHub, Linear)
└── Integrations
    ├── MCP
    └── Graphify
```

---

## CAMBIOS REALIZADOS

1. ✅ Fuentes configuradas:
   - App/IDE: Monaspace Krypton Var
   - Terminal: Monaspace Radon Var
   - Chat: Monaspace Radon Var

2. ✅ Chat width: Compact (32rem)

3. ✅ Agent default surface: Chat

4. ✅ Task providers: GitHub, Linear only

5. ✅ Artifacts: Disabled

6. ✅ Mobile emulator: Disabled

7. ✅ Automations: Hidden

8. ✅ Skills: Hidden

9. ✅ Compact worktree cards: Enabled

---

## PRÓXIMOS PASOS

1. Revisar cada sección propuesta para quitar
2. Simplificar UI de settings
3. Ocultar secciones no esenciales
4. Crear modo "Simple" vs "Advanced"
5. Testear con usuarios

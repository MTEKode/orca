# Orca Plugins

Custom plugins extracted from the MTEKode fork customizations.

## Plugins

### 1. Flow Dashboard (`flow-dashboard`)
Real-time orchestration flow dashboard showing active runs, worker status, and timeline.

**Features:**
- Live monitoring of orchestration runs
- Planner and worker status tracking
- Event timeline with last 50 events
- Auto-refresh every 2 seconds

**Installation:**
```bash
orca plugin dev load ./plugins/flow-dashboard
```

### 2. Agent Management (`agent-management`)
Agent compatibility and health monitoring panels.

**Features:**
- Agent compatibility matrix (capabilities per agent)
- Real-time agent health monitoring
- Status indicators (healthy/warning/error)
- Last seen timestamps

**Installation:**
```bash
orca plugin dev load ./plugins/agent-management
```

### 3. Agent Filter (`agent-filter`)
Filter and manage which agents are available in the catalog.

**Features:**
- Enable/disable specific agents
- Configure default surface (chat/terminal)
- Visual configuration panel
- Persistent settings

**Default Configuration:**
- Enabled agents: claude, codex, opencode, pi, antigravity
- Default surface: chat

**Installation:**
```bash
orca plugin dev load ./plugins/agent-filter
```

### 4. Task Provider Filter (`task-provider-filter`)
Filter which task providers (GitHub, Linear, etc.) are available.

**Features:**
- Enable/disable task providers
- Visual configuration panel
- Persistent settings

**Default Configuration:**
- Enabled providers: github, linear

**Installation:**
```bash
orca plugin dev load ./plugins/task-provider-filter
```

## Development

### Prerequisites
- Orca >= 1.4.246
- Node.js >= 18

### Building Plugins

Each plugin needs to be compiled before use:

```bash
# For each plugin
cd plugins/<plugin-name>
pnpm install
pnpm build
```

### Testing Plugins

Load plugins in development mode:

```bash
# Load a plugin
orca plugin dev load ./plugins/<plugin-name>

# Watch for changes
orca plugin dev watch ./plugins/<plugin-name>

# Take a screenshot
orca plugin shot <plugin-key>
```

### Plugin Structure

```
plugin-name/
├── orca-plugin.json    # Plugin manifest
├── src/
│   ├── worker.ts       # Worker logic (if trusted-worker)
│   └── panel.tsx       # Panel UI
└── dist/               # Compiled output
```

## Migration from Core

These plugins were extracted from core customizations in the MTEKode fork:

| Plugin | Original Location | Status |
|--------|------------------|--------|
| Flow Dashboard | `src/renderer/src/components/flow-dashboard/` | ✅ Extracted |
| Agent Management | `src/renderer/src/components/settings/agents/` | ✅ Extracted |
| Agent Filter | `src/renderer/src/lib/agent-catalog/` | ✅ Extracted |
| Task Provider Filter | `src/shared/work-items/task-providers.ts` | ✅ Extracted |

## Future Plugins

Additional features that can be extracted:

- **Chat Appearance Plugin** - Compact mode, monospace font, custom themes
- **Worktree Card Styling Plugin** - Custom worktree card appearance
- **Source Control Enhancements Plugin** - Inline comments, update from base button
- **Localization Plugin** - Custom translations and language packs

## License

Same as the main Orca project.

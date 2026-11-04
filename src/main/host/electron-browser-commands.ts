import { RuntimeBrowserCommands } from '../runtime/browser/browser-commands'
import { setRuntimeBrowserCommandsFactory } from '../runtime/runtime-browser-commands-factory'
import { setBrowserHostClientProfileResolver } from '../runtime/browser-host/browser-host-client-profile-metadata'
import { browserSessionRegistry } from '../browser/browser-session-registry'
import { setManagedBrowserProfileDeleter } from '../runtime/browser-host/managed-browser-profile-removal'
import { deleteManagedBrowserProfile } from '../browser/browser-managed-session-profiles'
import { shell } from 'electron'
import { setMcpIntegrationBrowserOpener } from '../mcp-integrations/hub'

/** Importing this desktop factory loads the Chromium browser cluster. */
export function installElectronBrowserCommands(): void {
  setRuntimeBrowserCommandsFactory((host) => new RuntimeBrowserCommands(host), {
    supportsGoogleCookieClear: () => true,
    clientHosting: true
  })
  setBrowserHostClientProfileResolver((browserProfileId) => {
    const profile = browserSessionRegistry.getProfile(browserProfileId)
    return profile ? { id: profile.id, label: profile.label, scope: profile.scope } : undefined
  })
  setManagedBrowserProfileDeleter(deleteManagedBrowserProfile)
  // MCP integration OAuth opens the system browser; Node hosts have none and reject connectOAuth.
  setMcpIntegrationBrowserOpener((url) => shell.openExternal(url))
}

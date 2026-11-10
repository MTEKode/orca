import { useNativeChatContextUsageSummary } from './usage/use-native-chat-context-usage-summary'
import { useNativeChatSessionOptions } from './session/options/terminal/use-native-chat-session-options'
import { useNativeChatSessionOptionCommand } from './session/options/terminal/use-native-chat-session-option-command'
import type * as C from './composer/native-chat-composer-types'
import type { NativeChatResolvedTarget } from './composer/submit/native-chat-composer-target'

type Args = Pick<
  C.NativeChatComposerProps,
  | 'agent'
  | 'terminalTabId'
  | 'targetPtyId'
  | 'onSlashCommand'
  | 'onSubmitted'
  | 'onSwitchToTerminal'
  | 'readTerminalScreen'
  | 'structuredTransport'
> & {
  paneKey: string
  disabled: boolean
  resolveTarget: () => NativeChatResolvedTarget | null
}

/** The composer's option pickers and context ring: structured transport values win over the PTY's. */
export function useNativeChatComposerSessionOptions({
  structuredTransport,
  onSwitchToTerminal,
  ...args
}: Args) {
  const { agent, terminalTabId, targetPtyId, readTerminalScreen, paneKey } = args
  const { dispatch, isDispatching } = useNativeChatSessionOptionCommand(args)
  const { surface: ptySurface, snapshot: ptySnapshot } = useNativeChatSessionOptions({
    agent,
    terminalTabId,
    targetPtyId,
    dispatchCommand: dispatch,
    onAgentPicker: onSwitchToTerminal,
    readTerminalScreen,
    paneKey
  })
  return {
    isDispatching,
    ptySurface,
    surface: structuredTransport?.optionsSurface ?? ptySurface,
    snapshot: structuredTransport?.optionSnapshot ?? ptySnapshot,
    contextUsage: useNativeChatContextUsageSummary(structuredTransport)
  }
}

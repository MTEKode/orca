import { translate } from '@/i18n/i18n'
import { formatAgentTypeLabel } from '../../../../shared/agent-type-label'
import {
  composerAgentLabel,
  composerSideLabel,
  type ComposerAgentLabelInput,
  type ComposerAgentLabelSay
} from '../../../../shared/native-chat/composer-agent-label'

// Literal English defaults: the localization gate only reads string literals at the call site.
const sayComposerAgentLabel: ComposerAgentLabelSay = (key) =>
  key === 'orchestrator'
    ? translate('components.native-chat.composer.agentLabel.orchestrator', 'Orchestrator')
    : key === 'worker'
      ? translate('components.native-chat.composer.agentLabel.worker', 'Worker')
      : translate('components.native-chat.composer.agentLabel.agent', 'Agent')

/** The composer pill's text: "Agent: Claude · Opus · High", or Orchestrator | Worker for MTE chats. */
export function composerAgentPillLabel(input: ComposerAgentLabelInput): string {
  return composerAgentLabel(input, sayComposerAgentLabel, formatAgentTypeLabel)
}

/** One side of an MTE chat's composer: "Orchestrator: Claude · Opus" or "Worker: Codex · gpt-5". */
export function composerSidePillLabel(
  role: 'orchestrator' | 'worker',
  side: ComposerAgentLabelInput['orchestrator']
): string {
  return composerSideLabel(role, side, sayComposerAgentLabel, formatAgentTypeLabel)
}

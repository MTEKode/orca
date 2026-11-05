import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import { orchestrationSkillRecoveryData } from '../../../../../../shared/orchestration-rpc-contract'

/** The resolved recipient, or the run_required refusal when neither a recipient nor a Run could be found. */
export function requireSendRecipient(to: string | undefined): string {
  if (!to) {
    throw new OrchestrationError(
      'run_required',
      'No recipient or active Dispatch Run could be resolved. No effects were applied.',
      orchestrationSkillRecoveryData()
    )
  }
  return to
}

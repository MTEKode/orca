/** Deploy-check target saved on a project; the password lives only in the secret store. */
export type MteDeployCheckSettings = {
  url: string
  username: string
  linearDoneState?: string
}

export type MteDeployCheckConfig =
  | { configured: false }
  | {
      configured: true
      url: string
      username: string
      password: string
      linearDoneState: string
    }

export type MteDeployCheckLinearOutcome =
  | 'commented+moved'
  | 'commented'
  | 'skipped-no-issue'
  | `failed:${string}`

export type MteDeployCheckReport = { linear: MteDeployCheckLinearOutcome }

export const MTE_DEPLOY_CHECK_DEFAULT_DONE_STATE = 'Done'

/** Comment posted on the linked Linear issue when the deploy check finishes. */
export function deployCheckLinearCommentBody(summary: string, ok: boolean): string {
  const heading = ok
    ? 'Deploy validated by Orca MTE flow:'
    : 'Deploy validation FAILED in Orca MTE flow:'
  return `${heading}\n\n${summary}`
}

/** Config output without the password, safe for text-mode printing. */
export function formatDeployCheckConfigText(config: MteDeployCheckConfig): string {
  if (!config.configured) {
    return 'Deploy check is not configured. Fill Deploy check in the project settings.'
  }
  return [
    `url: ${config.url}`,
    `username: ${config.username}`,
    `linearDoneState: ${config.linearDoneState}`
  ].join('\n')
}

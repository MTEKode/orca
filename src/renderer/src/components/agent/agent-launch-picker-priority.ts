import { useEffect } from 'react'
import { agentPickerAcquisitionFor } from './agent-launch-picker-acquisition'

/** While the picker is open, its catalog and launch-support reads jump the queue; returns `source`. */
export function usePrioritizedAgentPickerAcquisition<T>(
  source: T,
  key: string,
  open: boolean,
  selected: unknown
): T {
  useEffect(() => {
    if (open) {
      agentPickerAcquisitionFor(key)?.admit('catalog')
      agentPickerAcquisitionFor(key)?.admit('support')
    }
  }, [key, open, selected])
  return source
}

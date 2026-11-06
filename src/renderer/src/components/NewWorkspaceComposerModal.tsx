import React, { useCallback, useRef } from 'react'
import { useAppStore } from '@/store'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { DirectWorkItemSetupDialog } from '@/components/new-workspace/DirectWorkItemSetupDialog'
import { getWorkspaceComposerInitialFocusTarget } from '@/lib/workspace-composer-initial-focus'
import { ComposerQuickTabBody, type ComposerModalData } from './new-workspace/ComposerQuickTabBody'

export default function NewWorkspaceComposerModal(): React.JSX.Element | null {
  const visible = useAppStore((s) => s.activeModal === 'new-workspace-composer')
  const modalData = useAppStore((s) => s.modalData as ComposerModalData | undefined)
  const closeModal = useAppStore((s) => s.closeModal)

  if (!visible) {
    return null
  }

  if (modalData?.directSetup) {
    return (
      <DirectWorkItemSetupDialog key={modalData.directSetup.id} request={modalData.directSetup} />
    )
  }

  return <ComposerModalBody modalData={modalData ?? {}} onClose={closeModal} />
}

function ComposerModalBody({
  modalData,
  onClose
}: {
  modalData: ComposerModalData
  onClose: () => void
}): React.JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null)
  const submitCancelledRef = useRef(false)
  const handleDismiss = useCallback(() => {
    submitCancelledRef.current = true
    onClose()
  }, [onClose])
  const isSubmissionCancelled = useCallback(() => submitCancelledRef.current, [])

  return (
    <Dialog open onOpenChange={(open) => !open && handleDismiss()}>
      <DialogContent
        ref={dialogRef}
        className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden sm:max-w-lg"
        onEscapeKeyDown={(event) => {
          if (dialogRef.current?.querySelector('[data-sparse-preset-editor]')) {
            event.preventDefault()
          }
        }}
        onOpenAutoFocus={(event) => {
          // Override Radix’s first-tabbable close button with the name/source field for immediate typing.
          event.preventDefault()
          const content = event.currentTarget as HTMLElement
          getWorkspaceComposerInitialFocusTarget(content)?.focus({ preventScroll: true })
        }}
      >
        <ComposerQuickTabBody
          modalData={modalData}
          onClose={onClose}
          isSubmissionCancelled={isSubmissionCancelled}
          active
        />
      </DialogContent>
    </Dialog>
  )
}

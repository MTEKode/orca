import { extname } from 'node:path'
import type { AgentJournalMessageItem } from '../../shared/agent-session-journal-types'
import type { NativeChatImageRefBlock } from '../../shared/native-chat-types'
import {
  agentSessionFailureFact,
  type AgentSessionAttachmentProblem,
  type SubmissionRejectionFact
} from '../../shared/agent-session-failure'
import {
  ClaudeDispatchContentError,
  readClaudeImage
} from '../claude/claude-structured-dispatch-content'
import type { OpenCodeV2PromptFile } from './opencode-v2-connection'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_IMAGE_COUNT = 20
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
}

export class OpenCodeV2PromptError extends Error {
  constructor(
    message: string,
    readonly failure: SubmissionRejectionFact
  ) {
    super(message)
    this.name = 'OpenCodeV2PromptError'
  }
}

function attachmentError(message: string, attachment: AgentSessionAttachmentProblem) {
  return new OpenCodeV2PromptError(
    message,
    agentSessionFailureFact('attachmentInvalid', { attachment })
  )
}

async function imageFile(block: NativeChatImageRefBlock): Promise<OpenCodeV2PromptFile> {
  if (block.url) {
    return { uri: block.url, source: { type: 'uri', uri: block.url } }
  }
  if (!block.path) {
    throw attachmentError('OpenCode image needs a source', { reason: 'noSource' })
  }
  const mimeType = MIME_BY_EXTENSION[extname(block.path).toLowerCase()]
  if (!mimeType) {
    throw attachmentError('OpenCode image file type is unsupported', {
      reason: 'unsupportedType'
    })
  }
  let bytes: Buffer
  try {
    bytes = await readClaudeImage(block.path)
  } catch (error) {
    if (error instanceof ClaudeDispatchContentError) {
      throw new OpenCodeV2PromptError('OpenCode image could not be read', error.failure)
    }
    throw new OpenCodeV2PromptError(
      'OpenCode image could not be read',
      agentSessionFailureFact('attachmentUnreadable')
    )
  }
  if (bytes.byteLength === 0) {
    throw attachmentError('OpenCode image is empty', { reason: 'empty' })
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw attachmentError('OpenCode image exceeds the size limit', {
      reason: 'tooLarge',
      limit: MAX_IMAGE_BYTES
    })
  }
  return {
    uri: `data:${mimeType};base64,${bytes.toString('base64')}`,
    source: { type: 'inline' }
  }
}

/** Journal message body → the prompt POST's text/files; images ride as data URIs. */
export async function prepareOpenCodeV2Prompt(body: AgentJournalMessageItem): Promise<{
  text: string
  files: OpenCodeV2PromptFile[]
}> {
  if (body.role !== 'user') {
    throw new Error('OpenCode v2 prompt must be a user message')
  }
  const texts: string[] = []
  const files: OpenCodeV2PromptFile[] = []
  for (const block of body.blocks) {
    if (block.type === 'text' && block.text.length > 0) {
      texts.push(block.text)
    } else if (block.type === 'image-ref') {
      if (files.length >= MAX_IMAGE_COUNT) {
        throw attachmentError('OpenCode prompt has too many images', {
          reason: 'tooMany',
          limit: MAX_IMAGE_COUNT
        })
      }
      files.push(await imageFile(block))
    }
  }
  if (texts.length === 0 && files.length === 0) {
    throw new OpenCodeV2PromptError(
      'OpenCode prompt is empty',
      agentSessionFailureFact('emptyMessage')
    )
  }
  return { text: texts.join('\n'), files }
}

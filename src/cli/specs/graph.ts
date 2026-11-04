import { LOCAL_COMMAND_FLAGS, type CommandSpec } from '../args'

const NOTES = [
  'The graph is per repo (shared by its worktrees) and stored in Orca user data, never in the checkout.',
  'Semantic extraction (docs/images) runs only when a Google AI key is stored in Orca; otherwise builds are code-only.'
]

export const GRAPH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['graph', 'build'],
    summary: 'Build the code knowledge graph for the current repo (graphify)',
    usage: 'orca graph build [--worktree <selector>] [--deep] [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'worktree', 'deep'],
    notes: [...NOTES, 'Runs in the background; follow with `orca graph status`.'],
    examples: ['orca graph build', 'orca graph build --deep --json']
  },
  {
    path: ['graph', 'update'],
    summary: 'Incrementally refresh the code graph (AST only, no LLM)',
    usage: 'orca graph update [--worktree <selector>] [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'worktree'],
    notes: NOTES,
    examples: ['orca graph update']
  },
  {
    path: ['graph', 'status'],
    summary: 'Show whether the repo graph is built, with node/edge counts',
    usage: 'orca graph status [--worktree <selector>] [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'worktree'],
    notes: NOTES,
    examples: ['orca graph status --json']
  },
  {
    path: ['graph', 'open'],
    summary: 'Open the interactive graph viewer in the Orca browser',
    usage: 'orca graph open [--worktree <selector>] [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'worktree'],
    notes: [
      ...NOTES,
      'Prints the viewer file URL; also opens it in the embedded browser when available.'
    ],
    examples: ['orca graph open']
  }
]

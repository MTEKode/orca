---
name: graphify
description: >-
  Answer questions about a codebase's architecture, file relationships, and
  dependencies from Orca's persistent knowledge graph of the repo (god nodes,
  communities, shortest paths). Use before grepping when asked how parts of the
  code connect, what depends on what, or where a concept lives. Also use to
  check, build, update, or open the graph with `orca graph`. Orca builds graphs
  headlessly; there is no install or extraction pipeline to run.
---

# Graphify in Orca

Orca keeps one knowledge graph per repo (all worktrees share it), stored in Orca's data
directory, never in the repo tree. There is no `graphify-out/` to look for.

## Fast path: graph exists, query it first

```text
orca graph status
```

If it reports a built graph, answer architecture and relationship questions from the graph
before reading files or grepping. Use the `graphify_*` tools from the `orca-tools` MCP server
(routed automatically to the graph of the repo you are working in; never pass `project_path`):

| Question                        | Tool                                                                 |
| ------------------------------- | -------------------------------------------------------------------- |
| What is X connected to? (broad) | `graphify_query_graph` (BFS); add `mode: "dfs"` to trace a chain     |
| How does X reach Y?             | `graphify_shortest_path`                                             |
| What is X?                      | `graphify_get_node`, then `graphify_get_neighbors`                   |
| What are the main areas?        | `graphify_god_nodes`, `graphify_get_community`                       |
| How big is the graph?           | `graphify_graph_stats`                                               |
| PR impact                       | `graphify_list_prs`, `graphify_get_pr_impact`, `graphify_triage_prs` |

Read `references/query.md` for how to phrase queries and cite results.

If `graphify_*` tools are missing, the graph is not built yet or the app is not running.

## No graph yet

```text
orca graph build          # code-only, no model calls
orca graph build --deep   # also extracts docs/papers/images semantically
orca graph update         # incremental refresh after changes
orca graph open           # open the interactive viewer
```

`build` starts in the background; poll `orca graph status` until it reports `built`. Ask the
user before a first build on a large repo. `--deep` only works when a Google AI key is stored
in Orca Settings; never ask for or handle the key yourself. Without it, graphs are code-only.
The Graph panel in Orca does the same as these commands.

## Rules

- Never invent an edge. Answer only from what the tools return and quote `source_location`
  when citing a fact.
- Mark inferred or ambiguous edges as such; do not present them as certain.
- A stale graph can mislead: if files changed a lot since `builtAt`, run `orca graph update`
  first or say the answer may be outdated.
- Orca updates graphs automatically in the background; do not run builds in loops.

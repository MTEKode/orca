---
name: requirements-lock-batch2
type: decision
date: 2026-11-03T12:36:24Z
---

2026-11-03 lock (goal: 7 items batch 2): flow=native MTE planner (orca mte start); item1=UI dialog on new chat/task + project pref dont-ask + toast on planner start; item2=optional final deploy check by agent w/ embedded browser, url+user in project config, password via safeStorage, comment+move linked Linear ticket to configured state (default Done), skip Linear if no ticket; item3=project option run commands in floating terminal default ON; item4=pastel tool-use blocks by action type in 4 native chats, light/dark tokens; item5=OpenCode v2 HTTP/SSE transport (opencode serve) replacing ACP; item6=agy models queried from CLI w/ fixed fallback; item7=Check tab PR comment buttons append to visible chat input, create chat only if none; delivery=branch feat/mte-flow-batch-2 from main, one commit per item, no push; order 1..7.

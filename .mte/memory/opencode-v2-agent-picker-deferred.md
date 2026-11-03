---
name: opencode-v2-agent-picker-deferred
type: decision
date: 2026-11-03T12:56:31Z
---

T-0013 (2026-11-03): OpenCode v2 chat on by default; agent/variant/forms backend done. Composer Agent (build/plan) picker deferred to follow-up T-0016 because AgentSessionOptionsResult.current has fixed keys (model, effort, fastMode, serviceTier, permissionMode) and NativeChatSessionOptionPickers only renders those — extend snapshot + descriptor builder to add a generic select.

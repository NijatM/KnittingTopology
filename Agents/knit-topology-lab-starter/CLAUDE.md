# Claude project entrypoint

Read and follow `AGENTS.md`, then the assigned task and relevant role charter in `agents/`. These are the same project rules used by Codex.

Use Claude Opus 5.5 (`claude-opus-5-5`) where available; do not silently select another model. Use `.claude/agents/` specialist profiles when helpful. Shared skills are under `.claude/skills/`; their canonical copies are `.agents/skills/`.

The coordinator owns `tasks/queue.json`. Return an explicit handoff using `templates/result.json`. A Claude subagent completion does not automatically update a Codex task or synchronize separate worktrees. Keep implementation edits inside assigned ownership/worktrees. Only one provider acts as the primary coordinator for the shared queue at a time.

# Cross-provider orchestration protocol

## Task state

Proposed states: `queued -> claimed -> running -> review -> accepted`; also `needs_input`, `failed` and `cancelled`. A status label is not scientific validation. The coordinator is the sole queue writer in the supervised phase.

A task includes identity, revision, objective, assumptions, dependencies, exact input artifacts, allowed output/owned paths, expected deliverables, checks, assigned provider/role, budget and stopping condition. A task result links artifacts and reports observations and uncertainty.

## Ownership and integration

The coordinator assigns disjoint files or isolated worktrees. Workers return a patch/commit plus a result record; separate worktrees do not synchronize edits automatically. Resolve shared interface changes before dependent implementation. Record the base revision and dependency artifact hashes when meaningful.

Keep read-only research separate from code ownership. A reviewer needs permission to run the chosen checks but should not silently rewrite the implementation under review. Codex read-only instructions alone do not enforce a separate permission mode; configure actual tool permissions at the runtime level when necessary.

## Supervised cross-provider handoff

The human/coordinator provides the task packet to Codex or Claude Code. That session uses its native agents. It returns the result to the coordinator, which records status and initiates the next dependent task. Neither system should assume it can invoke the other provider's native subagents directly.

## Optional automated phase

A local dispatcher can later own atomic task claims, provider adapters, persistence, budget tracking, retries and cancellation. It should use supported SDK/CLI interfaces, reverified when implemented. Use persistent storage rather than relying on an in-memory conversation. No dispatcher is included in this kit.

Do not write a recursive “agents debate until agreement” loop. Limit repair attempts, request a distinguishing test for disagreements, and return a concrete unresolved question if evidence is insufficient. A second opinion can reveal an issue; it cannot replace numerical or physical verification.

# Knit Topology Lab — development starter kit

This is a project blueprint and agent configuration kit for a machine-agnostic browser-based pattern/topology explorer on GitHub Pages. It is not the application, an installed extension, a running multi-provider orchestrator, a knitting compiler or a validated structural model.

## Start here

1. Read `docs/blueprint.md` and `project-brief.json`.
2. Place this folder's contents, including hidden folders, at the root of the new application repository. Open that repository in VS Code. Keep its existing instructions if merging into an established project.
3. Install the official Codex and Claude Code integrations if absent. Sign in through each client's supported flow. Select GPT-6.1 Sol and Claude Opus 5.5, subject to your account's access. Do not put credentials in this repository.
4. Check the agents and skills each client loaded. Restart the relevant session if new folders are not discovered. The native file formats were checked against official documentation on 6 November 2026; client versions and organizational settings may differ.
5. Use `prompts/start-coordinator.md` in the coordinator session. Use `prompts/cross-provider-review.md` in the other provider when an implementation is ready.
6. Start with `tasks/queue.json`. The queue is a supervised template, not an executable dispatcher. Task status and handoffs must be maintained by the coordinator/human until a dispatcher is implemented.

There is deliberately no application `package.json` yet. The first implementation task selects supported dependency versions, creates the TypeScript app, locks dependencies, and records real commands that work. The native profiles and skills are ready to copy and inspect; they have not been exercised in authenticated Codex/Claude sessions here.

## Contents

- `AGENTS.md` / `CLAUDE.md`: shared rules and Claude entrypoint.
- `agents/`: ten role charters, including the primary coordinator.
- `.codex/agents/`: nine specialist TOML definitions using `gpt-6.1-sol`.
- `.claude/agents/`: nine specialist definitions using `claude-opus-5-5`.
- `.agents/skills/`: six canonical repository-scoped skills for Codex.
- `.claude/skills/`: identical skill copies for Claude; keep copies synchronized.
- `docs/`: blueprint, data contract, validation plan and orchestration protocol.
- `research/sources.csv`: 25 sources with relevance and access limitations.
- `templates/`: task, result, claim, experiment and design-intent records.
- `benchmarks/catalog.json`: a proposed acceptance benchmark catalog, not executed scientific tests.

## Working arrangement

Use one primary coordinator, initially in Codex. Ask it to follow `agents/coordinator.md`; do not create a second autonomous coordinator for the same queue. Its provider can be changed later. Each provider's native subagents remain in its own runtime. A shared queue plus explicit result handoffs connects the two providers.

Implementation tasks need separate file ownership or isolated worktrees. The Claude implementation profiles request `isolation: worktree`; Git setup and client support are prerequisites. Codex profile instructions request an assigned worktree for parallel edits; the profiles do not create one themselves. A read-only instruction in a Codex profile is behavioral guidance, not a separate permission sandbox.

This kit does not modify personal settings, connect accounts, spend API credit, create a GitHub repository or deploy a website. Those actions belong to the implementation/release workflow when requested.

## Source documentation

- Codex profiles: https://learn.chatgpt.com/docs/agent-configuration/subagents
- Claude profiles: https://code.claude.com/docs/en/sub-agents
- Codex skills: https://learn.chatgpt.com/docs/build-skills
- Claude skills: https://code.claude.com/docs/en/skills
- Pages/Vite: https://vite.dev/guide/static-deploy

Read `docs/blueprint.md` for the scientific pipeline and annotated research sources.

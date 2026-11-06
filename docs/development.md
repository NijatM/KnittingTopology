# Coordinated development record

The user authorized continuous local development, additional workers where independent work improves accuracy/efficiency, Codex implementation, and bounded Claude Code subscription reviews. Milestone commit pauses were waived for this build. All Git operations and deployment remain prohibited for the agents; the user will initialize and publish later.

## Actual roles and interfaces

- Coordinator: shared contract, React application, project history/serialization, worker protocol, exports, integration, documentation, acceptance.
- `numerical_core`: analytic surfaces, graph primitives, patch templates, strip equivalence/density, tangent fitting, graph transformations, diagnostics, numerical tests. Requested model: GPT-6.1 Sol, high effort. Native worker runtime/client version is not exposed; do not infer a CLI invocation.
- `viewer`: Three.js rendering, analytic picking attachments, pointer drawing and navigation, selection, screenshots, cleanup; later isolated full-app browser checks. Requested model: GPT-6.1 Sol, high effort.
- Claude: independent method review, numerical/source audit, application/viewer audit, and numerical repair review using verified `claude-opus-5-5` through the user's signed-in Claude Code subscription. [Review summary](../research/reviews.md) records the findings. Actual transport/model records are retained locally in ignored `research/claude-*-audit.json` files.

The coordinator settled types before parallel edits. Numerical and viewer workers owned disjoint paths. No worktrees or branches were created. Workers returned concrete source and test results; reviews did not edit the implementation directly.

## Control levels

1. **Product:** preserve the user's scope, reference visual style, physical UI units, explicit regeneration, inspectable results, save/load, and manual publication.
2. **Software:** strict TypeScript, a DOM/renderer-independent core, immutable bounded history, shared data/load bounds, revision-tagged worker results, termination cancellation, validation before restore, isolated browser contexts, production-subpath checks.
3. **Geometry/topology:** analytic fixtures, exact incidence/orientation, canonical seam identities, compatible strip counts, Euler/valence identities, surface membership, nondegenerate cells, guide response/reversal tests, refinement where relevant.
4. **Scientific interpretation:** primary-source register, explicit implemented subsets and project extensions, units/tolerances, independent Opus review, distinguishing tests for findings, and separation from textile/structural/manufacturing validity.

Repair cycles are bounded and driven by concrete failures or reproducible findings. More agents or agreement do not count as evidence. No recursive voting/consensus or open-ended dispatcher was built.

## Claude review transport

`scripts/run-claude-review.py` reads an explicit JSON task packet, verifies a `claude.ai` login, removes API-key/provider overrides from the child environment, uses exact requested model `claude-opus-5-5`, disables tools/hooks/customizations and session persistence, blocks Git at child-process PATH, bounds input size/time, and writes the actual response. It neither launches a model fallback nor gives Claude shell/file tools.

The user explicitly approved sending the five initial source/PDF artifacts and subsequent generated files under `src/`, `tests/`, `docs/`, `tasks/` plus package/build configuration to Anthropic for these reviews. Credentials and unrelated files are excluded. CLI records contain list-price usage estimates (`costBasis: list`); these are not evidence of separate API billing. Authentication was subscription-based, and no API key was supplied.

## Findings that changed implementation

- Coarse topology needed explicit node/edge/cell and strip identities, rather than only corner coordinates.
- Direction guides needed real tangent/cross-field fitting rather than attraction toward the drawn curve.
- Radial/nested inset templates reused coarse cell IDs; independent review found the save/load failure and prompted parent-derived IDs and preset round-trip checks.
- Generation and loading bounds diverged; shared limits, compact JSON and worker-side serialization preflight prevent accepted-but-unloadable results.
- Cube creases must survive as derived graph edge chains; feature-conforming boundary rules replace cross-crease dual/ambo polygons.
- Projected guide directions across cube creases require unfolding or chart-local influence; the current bounded method uses chart-local guides with degeneracy guards.
- Strip overrides must not silently retarget after topology/geometry changes; stable coarse-edge keys and clearing rules preserve meaning.
- The (2,1,1) template needs a nondegenerate diagonal choice for triangulation.

See the verification record for executed checks and remaining coverage limits. The original starter under `Agents/` is reference material, not evidence of implemented capabilities.

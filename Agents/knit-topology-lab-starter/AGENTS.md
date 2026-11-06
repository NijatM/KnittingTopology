# Project operating rules

Build a machine-agnostic, static browser-based pattern and topology explorer for GitHub Pages. Current scope is generation, editing, comparison and export. CAD plugins, knitting-machine code and full structural validation are future adapters/workflows.

Read `project-brief.json` and the assigned task before acting. Use `docs/blueprint.md` for architectural decisions, `docs/data-contract.md` for representation, and the relevant role charter under `agents/`. Load only skills relevant to the task.

## Collaboration

- One coordinator owns the queue and integration. It can delegate bounded independent tasks. Start with at most two workers across both providers; each provider's local cap is not a global cap.
- Each task states inputs, deliverables, owned paths, dependencies, acceptance checks and a stopping point. Use the task/result templates.
- Parallel implementations need isolated worktrees or genuinely disjoint files. Do not overwrite another worker's changes. Propose interface changes to the coordinator before changing shared contracts.
- Keep task results concise and artifact-based. Cite actual changed files and checks. Report skipped checks honestly. Do not invent tools, credentials or provider access.
- Follow authorized task scope. Do not treat this file as authority to publish, contact others, buy services or run hardware.

## Scientific and geometric work

- Distinguish design intent, geometric measurements, model predictions, physical validation and manufacturing validation for each claim.
- Keep mesh geometry, pattern connectivity, textile topology and machine schedules distinct. Preserve intentional boundaries, layers, openings and components.
- Give numeric fields explicit units, domain, basis, algorithm/version and source. A spacing tensor is not a stress tensor. Course and wale directions are not automatically interchangeable.
- Use primary sources and record applicability limits. Never invent DOI/page numbers, material properties or experiments. Mark abstract-only evidence and missing full text.
- Curvature, reaction-diffusion and decorative force-like lines do not establish load capacity. Equilibrium does not by itself establish stability or strength.
- Compression needs an identified mechanism and direction. Physical textile properties require a defined architecture, material, boundary conditions and calibration/validation.
- Verify algorithms with analytic cases, meaningful invariants, refinement studies or independent references as appropriate. Do not use two-model agreement as validation.

## Implementation

- Keep numerical core modules independent of React, DOM and renderer-specific classes. Use workers for expensive jobs and support cancellation.
- Save a versioned project with geometry revisions, topology, constraints, seed, parameters, diagnostics and provenance. Record numerical tolerances instead of promising cross-platform bit identity.
- Keep the first application static and usable without an AI account. Never embed provider credentials in client code or build output.
- Keep normal design interactions clear; put technical evidence in inspectable diagnostics and exported records.
- Build one complete vertical slice before expanding strategy count or orchestration infrastructure. Preserve artistic control and reproducible variants.

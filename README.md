# Knitting Topology

A browser-based research environment for surface topology, knit-graph construction, design-level knitting patterns and symbolic operation schedules.

[Open the web app](https://nijatm.github.io/KnittingTopology/) · [Methods and citations](docs/methods.md) · [Verification](docs/verification.md) · [Data contract](docs/data-contract.md)

**Research prototype.** Computation runs locally in the browser; no backend is required. Geometric networks, stitch-parent graphs, operation bitmaps and transfer schedules are distinct representations. A validated symbolic schedule does not establish machine compatibility, knittability or achieved fabric shape.

## Current capabilities

| Area                         | Implemented scope                                                                                                                                                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surfaces and imports         | Generated plane, saddle, cube and sphere; OBJ/STL import with explicit units and mesh inspection. Generation on imported surfaces requires an eligible supplied rectangular OBJ UV chart. Other imports remain inspection-only.                                                  |
| Topology networks            | Bounded patch quadrangulation, coarse topology presets, strip subdivisions, soft direction guides, and quad, dual, ambo, kis, gyro and diagonal families. Shared seams and extraordinary vertices are explicit.                                                                  |
| Knit graphs and shaping      | Course/loop construction with project alignment or reconstructed Popescu connection rules on supported open surfaces; saved stages, editable courses, short rows, increases/decreases, parent histories and linked 3D/bitmap inspection.                                         |
| Patches and closed surfaces  | Rectangular computational patches with per-patch inputs, knitted-through joins or seams; cube/sphere cut validation and seam maps. Bitmap generation on closed surfaces supports whole-crease cube cuts and descending pole-to-pole sphere cuts.                                 |
| Structures and feature zones | One-guide, two-guide and custom colour keys; immutable structure tiles; surface feature zones. Explicit channel/pocket presets support compatible unpatched, constant-width, unshaped two-guide plane programs with panel-boundary access. Zones alone do not change operations. |
| Logical schedule analysis    | Optional shared-reference two-layer checking, bounded planning for one transfer transition, and whole-program schedule assembly with actual state propagation and fresh replay. Complete candidates and incomplete verified prefixes can be inspected and exported separately.   |
| Research workflow            | Undo/redo, project save/load, best-effort autosave, up to four Compare variants, linked selection, method provenance, Learn diagrams and qualified citation exports.                                                                                                             |

The workspace follows the dark monochrome visual language of Knitting Pixel Art Editor. Surface dimensions and spacing are displayed in millimeters; scientific geometry uses meters internally.

Sphere controls provide a shared polar-opening diameter in millimeters and an angular coverage fraction from 0.01 to 1.00. Zero opening diameter and full coverage preserve the existing full sphere. Positive openings remove both polar caps without filling the holes; fractional coverage retains an open sector starting at the +X meridian and increasing counterclockwise around +Z. Geometry, regenerated networks, knitting layouts and diagnostics use the same domain. Full coverage retains the validated meridian-seam workflow; partial sectors use their natural meridian boundaries. Opening sizes and angular coverage are geometric targets, not calibrated fabric dimensions or guarantees against long holds or machine jams. Remaining holds and discretization deviations stay inspectable.

## Typical workflow

1. **Prepare a surface.** Choose a generated surface or import a mesh with explicit units. Check import defects and mapping eligibility before generating on an OBJ. Cube/sphere knitting first requires a supported cut and validated seam preparation.
2. **Generate a topology network.** Choose a patch/network construction, spacing and family; optionally draw direction guides. Generation is explicit and cancellable, preserves the previous accepted result while computing on the same surface, and rejects superseded results.
3. **Build a knit program.** Choose Network, Shape, or Shape and network. Measured shaping uses swatch dimensions supplied by the user. Typed needle/pass counts provide an unmeasured network grid and do not predict physical shape. Choose the start edge, structures and key, then generate explicitly.
4. **Inspect geometry and operations.** Use linked courses, loops, bitmap cells, graph elements, parent histories and diagnostics. Missing requirements have persistent repair links; numerical failures are reported separately. A surface display shows computed placement on the target geometry, not simulated fabric.
5. **Analyze two-layer transfers when needed.** On a supported unpatched open-surface Shape/combined program, enable **Knit → Shared two-layer reference** and regenerate. Use **Plan one transfer transition** or **Build whole-program schedule**. The latter preserves source operations and knitting directions, inserts separate inter-pass phases, and independently replays the candidate from an empty symbolic state. It stops at the first unresolved step and retains a checked prefix.
6. **Save and compare.** Download project JSON for a durable record. Compare variants and inspect method provenance before interpreting differences. Save schedule/diagnostic artifacts separately; they are not applied to the source bitmap or restored from project JSON.

For feature recipes, see [plane channels and pockets](docs/knit-recipes.md). For computational-patch construction and its restrictions, see [shaping](docs/knit-shaping.md). For schedule controls and outcomes, see [selected-transition planning](docs/knit-transfer-planning.md) and [whole-program schedules](docs/knit-shaping-schedules.md).

## Outputs and their meaning

| Output                                                         | Purpose and limits                                                                                                                                                                                                     |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project and knit-stage JSON                                    | Preserve validated project inputs, accepted geometric graphs, saved knit-graph stages, settings and provenance. Derived programs are regenerated; the session undo stack is not exported.                              |
| OBJ, SVG, PNG and CSV                                          | Geometry, projected drawings, viewport images and diagnostics. OBJ uses meter coordinates. SVG is an XY projection, not a surface flattening or fabrication pattern.                                                   |
| BMP and Knit Grammar JSON                                      | Design-level operation patterns using exact supported key meanings. Required shaping, parent-history, sequence or recipe failures block export.                                                                        |
| Sequence, layer-graph, transfer-plan and shaping-schedule JSON | Machine-neutral operations and logical analysis, including blockers, limits and provenance. Incomplete and stale schedule results are labelled explicitly. These are not native machine files.                         |
| Seam/zone maps, marked BMP, reports and citations              | Assembly/feature guidance, inspection and method reporting. A zone-coloured BMP is not a Knit Grammar operation file. BibTeX, CSL references and method records document source relationships and implemented subsets. |

The current two-guide key cannot encode shaping transfers. A complete separately checked schedule does **not** change that key, rewrite the original bitmap or remove its export blockers. Native binding, cast-on, finishing, machine-specific scheduling and lab importer validation remain separate work.

## Scientific scope and sources

This project checks declared geometric and symbolic constructions. It does not provide a calibrated fabric/material simulation, structural analysis, or a guarantee that the knitted object will achieve the displayed shape.

- **Takayama, Panozzo and Sorkine-Hornung (2014), _Pattern-Based Quadrangulation for N-Sided Patches_.** The implementation contains a bounded, independently written template subset; it does not provide complete paper coverage or a global minimal-singularity guarantee. [Primary source](https://doi.org/10.1111/cgf.12443) · [Core contract](src/core/README.md).
- **Oval et al. (2018), _Topology Finding of Structural Patterns_.** Connectivity, density, pattern transformation and embedding remain separate stages. Current presets do not reproduce the complete grammar, medial-axis initialization, poles or structural analysis. [Primary source](https://hal.science/hal-01883505) · [Project methods](docs/methods.md).
- **Popescu (2019), _KnitCrete: Stay-in-place knitted formworks for complex concrete structures_.** Course/loop construction, computational patches, operation sequences and layer/feature workflows use documented reconstructions and project adaptations. The original software and native symbol library are not reproduced. The search, target policies and schedule builder are project constructions. [Primary thesis](https://doi.org/10.3929/ethz-b-000408640) · [Workflow audit](docs/popescu-workflow-audit.md).
- **Class keys and file conventions.** The original 4.S52 keys retain their exact colours and attribution to Computational Textiles (MIT 4.S52/6.S895, Spring 2026), Mariana Popescu. BMP and Knit Grammar JSON follow the Knitting Pixel Art Editor conventions; fidelity fixtures are documented in [tests/fixtures/knit](tests/fixtures/knit/README.md).

Target spacing and guide alignment are measured preferences. Rounding, surface discretization, chart distortion and discrete course construction affect results. Passing local checks does not certify all global intersections or convergence to a unique course graph. See the [surface-distance audit](docs/surface-distance-audit.md) for numerical evidence and remaining limits.

Gauge comes from user-entered swatches. Unmeasured structures use a flagged jersey fallback; calibration metadata never supplies invented material properties. Both logical layers currently share one reference geometry with separate IDs and parent histories. No physical thickness or independently shaped front/back geometry is inferred.

Automatic mapping of arbitrary imported surfaces, loop-stage editing, the complete topology grammar, curved/shaped channel and pocket recipes, additional feature families and calibrated fabric mechanics remain future work. Machine, software, needle, transfer and carrier specifications require confirmation with the lab. Test fixtures are not measured gauges or machine specifications.

Full source relationships are recorded in [BibTeX](research/references.bib), the [source register](research/sources.csv), and the in-app **Learn** and **KnitCrete workflow · understand and cite** guides.

## Verification snapshot

The recorded verification of **8 November 2026** includes:

- **779 passing unit tests across 45 files**, including numerical, project/persistence, import/mapping, citation and knit/schedule checks.
- **51 passing production browser tests**, with no page or console errors, plus focused development checks.
- Passing type checking, formatting and the static production build.
- An initial JavaScript bundle above the configured 750 kB warning threshold; maximum-input browser performance remains unestablished.

These results cover the declared software model. They do not establish physical fabrication accuracy, native importer compatibility or achieved shape. See the [executed verification record](docs/verification.md), [machine-readable results](docs/verification-results.json), and [source fingerprints](docs/verification-manifest.json). Remote deployment is not part of that recorded verification.

## Run locally

Use a supported Node.js release; the recorded development environment used Node **26.11.1**.

```sh
npm ci
npm run dev
```

Open the printed URL ending in **`/KnittingTopology/`**. For type checking, unit tests and a production build:

```sh
npm run check
npm run preview
```

The browser suite is separate and requires a running app:

```sh
npm run test:browser
```

Its default URL targets the development server. For a production preview or another port, set `KNITTING_BASE_URL` to the printed app URL. The configuration uses Google Chrome on macOS with isolated contexts and software WebGL; set `KNITTING_CHROME` for another Chrome/Chromium executable. `KNITTING_GPU=hardware` removes the software override. See [verification notes](docs/verification.md) for actual coverage.

## GitHub Pages

The app is static and uses the Vite base **`/KnittingTopology/`**. A repository-name change requires updating `base` in `vite.config.ts`.

Deployment is deliberate: `.github/workflows/pages.yml` runs through **workflow_dispatch** and has no push trigger. Configure **Settings → Pages → GitHub Actions**, then run **Deploy Knitting Topology** from the Actions tab. The workflow installs dependencies, runs the core verification/build, uploads `dist`, and deploys Pages. Browser tests are a separate check.

## Code and documentation

```text
src/core/       surfaces, coarse strips, templates, graph transforms and diagnostics
src/import/     mesh parsing, inspection and supplied-chart validation
src/knit/       structures, shaping, recipes, sequences and schedule analysis
src/app/        React workspace, project history and validated serialization
src/viewer/     Three.js display, drawing, picking and linked overlays
src/workers/    cancellable background generation and analysis
src/learning/   lessons, diagrams and citation registry
src/adapters/   geometry, projection and project exports
tests/         numerical, project and browser verification
research/      primary-source register and scientific references
docs/          method contracts, workflows, limitations and verification
```

## Research and development credits

Knitting Topology is a research project by Nijat Mahamaliyev and İlkyaz Sarımehmetoğlu. It was developed through supervised multi-agent orchestration using Claude Code with Claude Opus 5.5 and Codex CLI with GPT-6.1 Sol. Agents were assigned specialized roles and clearly defined tasks, assisting with implementation, method documentation and automated checks. The authors established the research direction, made methodological decisions and interpreted the results, with human review guiding the integration of agent contributions throughout development.

Tooling snapshot verified on 8 November 2026: Claude Code CLI 2.1.289; Codex CLI 0.164.0-alpha.11.1. Versions identify the environment at the verification date, rather than a fixed toolchain for the entire development history.

# Knitting Topology

A static surface pattern and topology laboratory by Nijat Mahamaliyev / Tailored Materiality Research. The workspace follows the dark monochrome visual language of Knitting Pixel Art Editor. Computation runs locally in the browser without a backend server.

## Run locally

Use a current supported Node.js release (developed with Node 26.11.1), then:

```sh
npm ci
npm run dev
```

Open the printed URL ending in **`/KnittingTopology/`**. To check the production build:

```sh
npm run check
npm run preview
```

`npm run check` runs type checking, numerical/project tests, and the static production build. The browser suite is separate:

```sh
npm run test:browser
```

The browser configuration uses installed Google Chrome on macOS, with isolated contexts and a software WebGL fallback. Set `KNITTING_CHROME` to another Chrome/Chromium executable and `KNITTING_BASE_URL` to a running preview if needed. `KNITTING_GPU=hardware` removes the software override. See [verification notes](docs/verification.md) for actual coverage and limits.

## Explore

1. Choose a **plane, cube, sphere, or saddle**. Dimensions and spacing are displayed in millimeters; scientific state uses meters.
2. Choose **Surface patch network** for regular, inset, alternating or nested control topology. Set target spacing, or edit compatible strip subdivisions in the Topology inspector.
3. Use **Draw guide** to sketch soft direction preferences on the surface. Orbiting the camera does not move attached strokes. **Field orientation** defines the background tangent cross-field.
4. Press **Generate / Regenerate** (G). Generation is explicit and cancellable; obsolete results cannot replace newer edits. The previous accepted result stays visible while computing on the same surface.
5. Inspect nodes/cells, components, seams, valence, spacing, and method provenance. Try **quad, dual, ambo, kis, gyro, and diagonal** graph families.
6. Capture up to four session variants in **Compare**. Check feature budgets as well as geometry before interpreting differences. Restore or save any captured variant.
7. Save **project JSON** to retain geometry, guides, graph identities, coarse topology/strips, settings, diagnostics, seed, and provenance. Undo/redo restores project semantics within the session; the undo stack is not exported. Local autosave is best effort; download JSON for a durable record. If a network exceeds local cache quota, the latest inputs are retained for regeneration. Invalid cached records are preserved for recovery.

The **N-sided patch laboratory** is a separate plane construction with hard subdivision counts. It contains a verified, intentionally incomplete template set. Useful examples: four sides `[10, 6, 10, 6]`; three, five or six sides with all counts `6`; the triangular-boundary single-quad case `[2,1,1]`. Unsupported combinations report an error and retain the previous accepted graph. See the exact [core method contract](src/core/README.md).

Exports: meter-coordinate OBJ polygon mesh, XY-projection SVG, viewport PNG, diagnostic CSV, and full project JSON. SVG is a projection, not a surface flattening or fabrication pattern. OBJ faces use straight chords and do not retain every project semantic.

## Scientific scope

This is a **geometric cell-network explorer**. It does not claim knit-loop topology, machine knittability, material calibration, structural capacity, or fabrication validation.

- **Takayama, Panozzo and Sorkine-Hornung (2014), _Pattern-Based Quadrangulation for N-Sided Patches_:** the implemented bounded templates are independently written and explicitly smaller than the complete paper construction. There is no general 2–6-sided coverage or global minimal-singularity guarantee.
- **Oval et al. (2018), _Topology Finding of Structural Patterns_:** coarse connectivity, strip density, pattern mapping, and embedding are distinct stages. Current presets are project-authored templates; they do not reproduce the paper's medial-axis initialization, complete A–K grammar, poles, or structural analysis.
- Closed cubical/spherical atlases, soft guide fitting, feature-preserving cube transformations, and open-boundary operator rules are documented project extensions.
- Target spacing and guide alignment are measured preferences. Integer rounding, atlas distortion and transformations change achieved edge lengths. Local validity checks do not certify the absence of all global intersections.

[Sources and evidence](research/sources.csv) · [Data contract](docs/data-contract.md) · [Algorithm details](src/core/README.md) · [Verification record](docs/verification.md)

## GitHub Pages

The Vite base is **`/KnittingTopology/`**. If the repository name changes, update `base` in `vite.config.ts`. Assets, bundled fonts, and the ES-module worker are served below that path. The application uses no server routes.

A **manual-only** Pages workflow is prepared at `.github/workflows/pages.yml`. Select **Settings → Pages → GitHub Actions**, then run **Deploy Knitting Topology** from the Actions tab. The workflow has no push trigger. Configuration follows the [official Vite Pages guidance](https://vite.dev/guide/static-deploy).

## Structure

```text
src/core/       analytic surfaces, coarse strips, templates, graph transforms, diagnostics
src/viewer/     Three.js display, picking, surface-attached drawing, camera controls
src/app/        React workspace, immutable project history, validated serialization
src/workers/    revision-tagged background generation and progress protocol
src/adapters/   explicit geometry/projection/project exports
tests/         numerical, project and isolated browser verification
research/      primary-source register and scientific references
```

Arbitrary surface import, direct graph grammar editing, pseudo-quads/poles, calibrated mechanics, textile semantics, and machine adapters are future work. The contracts preserve a boundary for them without claiming they are implemented.

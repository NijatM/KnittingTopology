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

1. Choose a **plane, cube, sphere, or saddle**. Import OBJ/STL for [surface inspection](docs/imported-surfaces.md) with an explicit unit declaration. OBJ files with a suitable [supplied rectangular UV chart](docs/mapped-surfaces.md) support network generation; other imports remain inspection-only. Dimensions and spacing are displayed in millimeters; scientific state uses meters.
2. Choose **Surface patch network** for regular, inset, alternating or nested control topology. Set target spacing, or edit compatible strip subdivisions in the Topology inspector.
3. Use **Draw guide** to sketch soft direction preferences on the surface. Orbiting the camera does not move attached strokes. **Field orientation** defines the background tangent cross-field.
4. Press **Generate / Regenerate** (G). Generation is explicit and cancellable; obsolete results cannot replace newer edits. The previous accepted result stays visible while computing on the same surface.
5. Inspect nodes/cells, components, seams, valence, spacing, and method provenance. Try **quad, dual, ambo, kis, gyro, and diagonal** graph families.
6. Capture up to four session variants in **Compare**. Check feature budgets as well as geometry before interpreting differences. Restore or save any captured variant.
7. Save **project JSON** to retain geometry, guides, graph identities, coarse topology/strips, settings, diagnostics, seed, and provenance. Undo/redo restores project semantics within the session; the undo stack is not exported. Local autosave is best effort; download JSON for a durable record. If a network exceeds local cache quota, the latest inputs are retained for regeneration. Invalid cached records are preserved for recovery.
8. Open **Learn** to explore 13 topics with actual construction diagrams, assumptions, source relationships and controlled examples. Browsing leaves your project unchanged; loading an example is undoable and requires explicit generation. Copy qualified method descriptions or download BibTeX/CSL references. See [methods and attribution](docs/methods.md).
9. On cube or sphere, use **04 Cuts and seams** to apply a preset or edit source edges, validate one disk and export paired seam JSON. See [closed-surface cut preparation](docs/closed-surface-cuts.md). On open surfaces, open **04 Knit program**. Use **Shape** on a plane, saddle or supplied rectangular OBJ chart: enter your measured swatch, choose the start edge, then Generate shape. Inspect courses and shaping marks beside the bitmap; unresolved required shaping blocks operation exports. See [shaping construction and limits](docs/knit-shaping.md). Use **Network** or **Shape and network** to translate the accepted network into a design-level bitmap in the Knit Grammar convention of Knitting Pixel Art Editor. Measured modes share one reference mapping; typed network dimensions use a rectangular chart grid. Create immutable user structures in the tile editor. See [network mapping and limits](docs/knit-network-mapping.md). Assign structures to cells (uniform, side count, alternating, coarse cell or per cell), edge lines and node marks. Automatic transfers are added where a needle changes bed. Show the program beside the surface: pointing at a loop marks it in 3D, and selecting a cell, edge or node outlines its loops. The Knit tab lists Knit Grammar's checks and exports the BMP, the Knit Grammar JSON, a report and the measurement table. Lab rules still to confirm are visible settings.

The **N-sided patch laboratory** is a separate plane construction with hard subdivision counts. It contains a verified, intentionally incomplete template set. Useful examples: four sides `[10, 6, 10, 6]`; three, five or six sides with all counts `6`; the triangular-boundary single-quad case `[2,1,1]`. Unsupported combinations report an error and retain the previous accepted graph. See the exact [core method contract](src/core/README.md).

Exports: meter-coordinate OBJ polygon mesh, XY-projection SVG, viewport PNG, diagnostic CSV, full project JSON, selected method references in BibTeX, and a method record in JSON. Saved projects include a supplementary method record describing the accepted graph separately from pending settings. SVG is a projection, not a surface flattening or fabrication pattern. OBJ faces use straight chords and do not retain every project semantic.

## Scientific scope

This is a **geometric cell-network explorer** with a **design-level knit program** export. The topology network is geometric; it is not a stitch graph. The knit program translates it into a Knit Grammar bitmap for the lab's Steiger software, where the final operations and machine code are produced. It does not claim machine-ready files, knittability, achieved shape, material calibration, structural capacity, or fabrication validation.

- **Takayama, Panozzo and Sorkine-Hornung (2014), _Pattern-Based Quadrangulation for N-Sided Patches_:** the implemented bounded templates are independently written and explicitly smaller than the complete paper construction. There is no general 2–6-sided coverage or global minimal-singularity guarantee.
- **Oval et al. (2018), _Topology Finding of Structural Patterns_:** coarse connectivity, strip density, pattern mapping, and embedding are distinct stages. Current presets are project-authored templates; they do not reproduce the paper's medial-axis initialization, complete A–K grammar, poles, or structural analysis.
- Closed cubical/spherical atlases, soft guide fitting, feature-preserving cube transformations, and open-boundary operator rules are documented project extensions.
- Target spacing and guide alignment are measured preferences. Integer rounding, atlas distortion and transformations change achieved edge lengths. Local validity checks do not certify the absence of all global intersections.
- **Knit program:** one pixel is one needle and one row is one carriage pass (bottom row = pass 1). Each colour is an operation from the 4.S52 class key (Colour key from Computational Textiles (MIT 4.S52/6.S895, Spring 2026), Mariana Popescu). Scale comes from swatch measurements you enter, and unmeasured structures use jersey values, flagged. Shaped output is a geometric prediction from those measurements and is not verified until knitted. Lab rules that are not yet confirmed (first pass direction, transfer timing) are visible settings. Checks are warnings and do not certify knittability.

Shape mode supports the plane, saddle and supplied rectangular OBJ charts, with a selectable start edge and user-measured loop dimensions. Course and loop generation is adapted from Popescu (2019), §§5.2 and 6.2; distance-field construction, monotone alignment and needle placement are project adaptations. Short rows, increases and decreases are recorded with surface provenance. Results with unresolved required shaping steps remain inspectable, but BMP and Knit Grammar JSON export is blocked. These geometric predictions are not physical simulations or machine-ready programs.

Network and combined modes support the plane, saddle and supplied rectangular OBJ charts. Measured layouts reuse one course/loop mapping across modes; network-only output fills unused bitmap cells and reports the added passes. Typed network layouts use a rectangular UV grid and do not predict physical shape. Network assignments use original-chart cell containment and a local loop-scale metric for edge and node marks; these are sampled project mappings, not geodesic or material guarantees. User structure tiles are saved as bounded, immutable copies using known key operations; new copies do not inherit measurements. Required shaping or operation conflicts in combined mode block BMP and Knit Grammar JSON export.

Cube and sphere cut planning works on the accepted closed geometric cell network. Validation checks source manifold incidence and orientation, a connected cut tree, duplicated vertex fans, and a connected disk with one boundary and Euler characteristic 1. Seam-map JSON pairs the two copies of every cut edge with source identities and boundary directions. This is a topological preparation step; it does not provide a flattened layout, sewing sequence or closed-surface knit bitmap. Paired seams may branch.

[Supplied OBJ UV mapping](docs/mapped-surfaces.md) · [Methods and citations](docs/methods.md) · [BibTeX](research/references.bib) · [Sources and evidence](research/sources.csv) · [Data contract](docs/data-contract.md) · [Algorithm details](src/core/README.md) · [Verification record](docs/verification.md)

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
src/learning/   method lessons, construction diagrams and citation registry
src/import/     bounded mesh parsing, local diagnostics and import interface
src/knit/       knit program: Knit Grammar keys, structures, checks and files; plane mapping, rasterization, transfers
tests/         numerical, project and isolated browser verification
research/      primary-source register and scientific references
```

Automatic mapping of arbitrary imported surfaces, direct graph grammar editing, pseudo-quads/poles, calibrated mechanics, yarn-level simulation, and machine code generation are future work. The contracts preserve a boundary for them without claiming they are implemented.

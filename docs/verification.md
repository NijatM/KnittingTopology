# Verification record

This record reports executed checks. The numerical implementation, project semantics, browser interactions, and production subpath are checked separately. No textile/material experiment or structural/manufacturing validation is claimed.

## Executable checks

```sh
npm run typecheck
npm test
npm run build
npm run test:browser
```

Core checks are in `tests/core/generation.test.ts`. They include analytic fixtures, oriented incidence and manifold links, closed cube/sphere seams and Euler characteristic, adjusted boundary valence, quad degree deficit, anisotropic strips, actual graph transformations, compatible patch counts/unsupported cases, real guide response/reversal, cancellation hooks, and sphere edge/refinement behavior.

Project checks in `tests/app/project.test.ts` cover scientific state and graph/strip round-trip, monotone history revisions, stale-job rejection, geometry attachment invalidation, malformed input rejection, and explicit OBJ/SVG semantics. JSON canonicalizes signed zero; stable graph identities/connectivity and numeric geometry are the relevant preservation contract.

Browser tests use isolated Playwright contexts and installed Chrome. Software WebGL is a reproducible test fallback; it does not establish performance or rendering on every GPU. PNG screenshots are QA artifacts under ignored `tmp/qa/`, not scientific validation. Safari is not included in the completed browser test coverage.

## Scientific limits

- This is a declared template subset, not a full implementation of either paper.
- Boundary and chart constraints can prevent requested guide alignment. Diagnostics state achieved error.
- Integer strip densities and transformed families do not ensure uniform spacing or equal feature/material budgets.
- Nondegeneracy, local Jacobians, incidence, orientation and vertex links are checked. No complete global self-intersection certificate is provided.
- Sphere/cube paths have their documented analytic/piecewise interpretation; saddle path lengths use sampling.
- Hardware GPU matrices, physical mobile touch devices, and manual assistive-technology testing remain outside the automated coverage.
- GitHub Pages compatibility is verified against a local production build and subpath. An actual remote deployment requires the user's later Git/publication actions.

## Earlier workspace baseline — 6 November 2026

- **135/135 unit tests passed:** 104 numerical/core tests and 31 project/history/persistence tests; final run 16.73 seconds.
- Type checking and the static production build passed. Lazy viewer loading reduced the initial JavaScript bundle to 288.33 kB (90.45 kB gzip); the separate viewer chunk is 577.24 kB (145.35 kB gzip). Fonts and the ES-module worker are bundled locally.
- **7/7 browser tests passed against development** in 56.1 seconds and **7/7 against the production build** in 55.5 seconds, with zero page or console errors.
- An additional native Metal production check recorded 17 requests, three worker-JS requests, four font requests, and seven scripts. There were no failed requests, external requests, or requests outside `/KnittingTopology/`.
- At mobile width 375, document and body width both remained 375. This is resized-browser coverage, not physical touch-device certification.
- Native WebGL2 used the Apple M2 Pro Metal renderer with no context loss. Software WebGL and native screenshots were visually inspected. Display-only radial bias fixes sphere line visibility without changing picking/export/diagnostic coordinates.
- Camera top/orbit transforms retained Z-up, unit rotation determinant within 5e-8, finite matrices, and unchanged camera distance in the targeted probe.

The [machine-readable results](verification-results.json) distinguish the latest regression checks from historical native-GPU/network probes. The [source fingerprint manifest](verification-manifest.json) identifies the current source snapshot; documentation-only changes do not imply rerunning every historical browser check. QA screenshots and browser reports remain under ignored `tmp/qa/production-*` and `tmp/qa/report/`.

Remaining numerical limitations are documented in `src/core/README.md`: declared incomplete patch-template coverage, chart-local guide fields with globally shared fitting backtracking, possible fail-closed rejection of unsupported/poor embeddings, no complete global intersection certificate, and sampled saddle path lengths. In N-sided mode, hard boundary counts determine density; any spacing deviation is a comparison to the stored reference spacing, not an enforced density target.

The recorded software checks do not establish material behavior, structural capacity, manufacturing feasibility, or correctness of a later remote deployment.

## Learn and Cite milestone — 6 November 2026

The new learning tests execute all 13 examples, verify closed-operator count identities, check guide connectivity preservation, validate generated teaching diagrams against real graph entities, and exercise citation selection. Project tests check accepted-versus-pending method records, optional supplementary metadata, unchanged graph round-trips and the minimal quota fallback. Browser tests add topic browsing without state mutation, actual diagram controls, qualified references, clipboard fallback, bibliography downloads, undoable example loading, accepted-versus-pending method descriptions and spacing consistency after cache restore and file import.

- **168/168 unit tests passed**: 104 core, 32 project/history/persistence and 32 learning/citation tests (17.27 seconds).
- Type checking, formatting and the production build passed. Initial JavaScript is 355.97 kB (112.69 kB gzip); the lazy viewer remains 577.24 kB (145.35 kB gzip).
- **11/11 browser tests passed against development** in 68.55 seconds and **11/11 against production** in 71.13 seconds, with no page or console errors. The production preview used `/KnittingTopology/`.

The teaching diagrams use bounded outputs of this implementation and are independent of the main viewport. Neither these diagrams nor a citation establishes reproduction of a paper or physical validity. Native-GPU/network probes above are historical baseline checks; this milestone uses isolated software-WebGL Chrome tests.

## Imported surface inspection milestone — 6 November 2026

- **252/252 unit tests passed** in 16.74 seconds: the preceding 168 checks plus 78 mesh-parser/diagnostic cases and six imported-project integration cases. Type checking and the production build passed.
- Import checks cover known plane/cube/tetrahedron measures, explicit unit scaling, preserved identities and offsets, large-offset centering, concave polygons and invalid boundaries, strict text ambiguity rejection, ASCII/binary STL discrimination, collapsed and collinear triangles, vertex links, orientation, duplicate/isolated/disconnected data, dimensional tolerance units, payload tampering and bounded triangulation work.
- Initial JavaScript is 377.56 kB (119.07 kB gzip), the lazy viewer 578.57 kB (145.69 kB gzip), the import worker 18.50 kB and the generation worker 60.73 kB. Assets remain below the repository base path.

The browser suite now includes five real import cases and the preceding eleven generation/learning regressions. Import fixtures are synthetic and small; they do not establish interoperability with every exporter or performance for every input at the maximum limits. Imported surfaces have no generation mapping, and source provenance in a saved project is not authenticated. See [the imported surface contract](imported-surfaces.md) for exact semantics and limits. Current browser results below are finalized from executed reports. Historical native-GPU/network probes above have not been rerun for this milestone.

- **16/16 browser tests passed against development** in 90.75 seconds and **16/16 against production** in 83.76 seconds, with no page or console errors. Production used `/KnittingTopology/`. The imported-surface 375px layout and desktop selection screenshots were visually inspected.

## Supplied rectangular OBJ UV generation — 6 November 2026

- **319/319 unit tests passed** in 18.34 seconds: the preceding 252 checks plus 67 chart-kernel, mapped-generation and mapped-project cases. Type checking and production build passed.
- New tests cover rectangle boundary/topology conditions, normalized orientation/conditioning, physical unit and texture-unit independence, source triangle interpolation, crease-crossing paths, rational non-dyadic diagonal and sliver-query sweeps, attachment tolerance consistency, coarse/patch tampering, all six families on representative patches, UV guide behavior, 90° bends, workload limits, freshness/round-trips and a documented fail-closed density/operator configuration.
- Initial JavaScript is 414.79 kB (130.80 kB gzip); the lazy viewer 580.72 kB (146.37 kB gzip); import and generation workers 27.85 kB and 91.24 kB.
- **19/19 browser tests passed against development** in 106.93 seconds and **19/19 against production** in 100.63 seconds, with no page or console errors. Production used `/KnittingTopology/`.
- A re-run of `npm run check` on the unchanged source passed: 319/319 unit tests in 16.65 seconds, type checking, and a production build with identical bundle sizes.

The current browser suite has 19 cases. Three new cases exercise real mapped generation/drawing/picking, source-triangle attachments, method citations, live barycentric learning without scientific-state edits, cache/file restore, stale results, chartless fallback and 375px layout. The sample OBJ and its declared millimeter units are supplied in `public/examples/`. Source fingerprints now include public assets, example data and the verification script. Numerical inputs remain local to the browser.

This is a floating-point supplied-chart screen, not automatic unwrapping, an exact-predicate bijection certificate or a global 3D or physical certificate. Paths follow the mapped image of straight normalized-UV segments and are not geodesics. Severe folds, fine support path budgets and some planar density/operator combinations can be rejected. Maximum-input performance, native-GPU matrices, physical touch and manual assistive-technology coverage have not been newly established. Initial restoration and render-index preparation still include bounded synchronous work. See [mapped surface semantics](mapped-surfaces.md). Earlier native/network probes remain historical.

## Knit program core and plane UI — 6 November 2026

- **360/360 unit tests passed**: the preceding 319 plus 41 knit program cases. Type checking, formatting and the production build passed.
- **Fidelity to Knit Grammar.** BMP files and `knit-grammar-pattern` JSON are byte-identical to files written by Knit Grammar's own code (KnittingPixelArtEditor commit `49b17992de32`). Check findings, structure data and structure tiling match it exactly. See `tests/fixtures/knit/README.md`.
- **Behaviour tests** cover:
  - automatic transfers: Accordion rows around a rib band, dropped transfers, two-layer structures left alone, unfixable bed changes reported, and an independent waiting-loop count of 0 when transfers are on;
  - edge lines exactly `width` loops wide;
  - node and extraordinary-node marks;
  - provenance from every loop to an existing element;
  - cell rules, including alternating conflicts exactly when an interior vertex has odd degree;
  - overrides, sizing from the jersey swatch with its limits, and unsupported inputs;
  - settings validation, the measurement-table file, project round trips and undo;
  - the scientific signature, which knit settings leave unchanged.
- **21/21 browser tests passed against development** (about 2.0 minutes) and **21/21 against production** (about 1.8 minutes), with no page or console errors. Two new cases cover:
  - the plane workflow: typed size, split view, linked provenance, exports, a jersey measurement sizing the program, undo/redo;
  - the section being offered only on the plane.
- **Real Knit Grammar check (one-off, local development servers).** A program exported here (80 × 90, seed node marks) was opened in KnittingPixelArtEditor:
  - the JSON opened as "80 × 90 · one yarn guide";
  - the BMP read as the 4.S52 basic key with 7200 exact, 0 snapped and 0 unknown pixels;
  - there were no page or console errors.
- Initial JavaScript is 464.86 kB (147.92 kB gzip); the lazy viewer 581.01 kB (146.45 kB gzip); import and generation workers 27.86 kB and 91.54 kB.

The knit program is design-level output for the lab software, which assigns the final operations and makes the machine code. Nothing has been knitted. Gauge comes only from entered swatch measurements, and unmeasured structures are flagged as assumed equal to jersey. The checks are Knit Grammar's warnings and do not certify knittability. The lab rules on first pass direction, transfer timing and yarn guide travel are still to be confirmed. Only network mode on the plane with the one-guide basic key is available. The program is built synchronously in the page, and responsiveness at the 600 × 600 maximum has not been measured.

## Open-surface knit shaping (M2) — 6 November 2026

- **409/409 unit tests passed** across 18 files, including 89 knit tests and 33 learning/citation tests. Type checking, formatting and the production build passed.
- **23/23 browser tests passed against development** (2.2 minutes) and **23/23 against production** (2.0 minutes), with no page or console errors. Both used installed Chrome with software WebGL and the `/KnittingTopology/` subpath. The final development run excludes generated trace HTML from Vite's watcher; those snapshots had previously caused live page reloads during tests.
- Shape tests cover all four plane start edges, ceiling/rounding counts, original UV positions, widening and narrowing trapezoids, an annular sector's short rows, saddle invariants, held parents, unit transfers, parent ownership, explicit unresolved placement and invalid inputs. Positive contour counts and disposable-worker cleanup have regression checks.
- Browser checks cover measured-gauge requirements, explicit generation without a geometric network, linked provenance, start-edge undo/redo, worker termination on cancel and supersession, stale export blocking, citation download and transitions to unmapped inspection surfaces. A linked saddle/bitmap screenshot was inspected locally.
- The BMP and Knit Grammar JSON writers themselves reject programs carrying export blockers. An independent symbolic replay compares actual bed/needle parent sets with declared loop parents. It is a connectivity check, not a machine simulation.
- References now distinguish the directly read Popescu thesis sections from the related chapter's metadata-only record. Downloaded BibTeX/CSL metadata and the checked-in bibliography agree.
- Separate local 600 × 600 plane probes produced 360,000 loops and placements with no moves or unresolved steps; enclosing geometry test time was 327 ms and planner time 147 ms. These are isolated kernel observations, not end-to-end browser responsiveness guarantees. Exact identity fast paths avoid redundant quadratic alignments on a plane.

The [construction and limits](knit-shaping.md) document the single-monotone-contour subset, restricted boundary trimming, asymmetric distance source, incomplete needle search and unbounded curved-surface approximation error. Curved network/combined modes and closed-surface cuts remain later work. Lab rules, the downstream Steiger importer and physical knitting remain unverified. The real Knit Grammar application-opening evidence above is historical M1 evidence; its format fixtures are still checked, but no new physical or machine validation is claimed.

## Curved network mapping and structure tiles (M3) — 6 November 2026

- **425/425 unit tests passed** across 19 files, including 105 knit tests. Type checking, formatting and the production build passed.
- **25/25 browser tests passed against development** (2.8 minutes) and **25/25 against production** (2.6 minutes), with no page or console errors. Both used installed Chrome, software WebGL and `/KnittingTopology/`.
- New numerical tests compare reference loop IDs, positions, network source classes and graph indices across network/combined modes. Analytic plane tests check exact edge widths and node squares. A mapped annular sector checks rectangular-fill counts and retained short-row registration; typed saddle and supplied-chart layouts require no invented measurements.
- A supplied chart whose distinct boundaries meet in 3D retains separate UV edge identities. The first test fixture (a full cylindrical wrap) was correctly rejected by existing coarse-cell area validation; the accepted fixture has nondegenerate coarse corners and a coincident boundary location in its interior. Assignment uses original chart identities, not nearest-3D reprojection of that location.
- Tile tests cover project round trips, undo, measurement identity, built-in preservation, duplicate IDs, bounds and unknown operations. Browser tests paint and save a tile, undo/redo creation and assignment, export it in project JSON, switch curved output modes and verify typed dimensions without a gauge.
- Existing cancellation, superseded/stale output rejection, imports, citation downloads, persistence, geometry exports and 375px workspace checks still pass. A local curved-pattern/tile screenshot was inspected.

See [network mapping and tile semantics](knit-network-mapping.md). Mark widths use a sampled local metric and are not certified geodesic distances. Other structure measurements do not deform the fill-based reference layout. Rectangular-fill counts describe nominal additional courses, not physical shape error. Combined output still blocks unresolved required shaping/operation mismatches. Closed-surface cuts, two-guide/custom keys, machine instructions and physical validation remain outside this milestone.

## Closed-surface cuts and seam maps (M4a) — 6 November 2026

- **451/451 unit tests passed** across 20 files, including 131 knit tests. Type checking, formatting and the production build passed.
- **27/27 production browser tests passed** (2.6 minutes). Development verified all 27 cases: 26 passed in the full run (3.1 minutes); a surface-selection test initially matched both the Sphere surface button and the new Sphere cut-preset button. Its corrected exact selector passed the isolated retest (6.8 seconds). No application page or console errors were recorded.
- The 26 new cut tests exercise single-edge boundaries, path endpoints and interior fan splitting, branch vertices, empty/unknown/duplicate/cyclic/disconnected drafts, source orientation and incidence failures, source freshness, exact source preservation, face-cycle/edge-incidence reconstruction, export guards, cancellation and project round trips. Presets are checked on all six graph families for cube and sphere.
- Browser checks use real 3D edge picking to edit a draft, undo/redo, reject an empty draft, terminate an actual worker on cancellation and on a source change, preserve the previous validated result, export paired seams and citations, reopen/revalidate a saved sphere draft, and fit the 375px layout. A local cube screenshot was inspected; the sphere narrow layout passed the browser width check.
- Export rechecks the actual boundary, disk topology, paired directions, endpoint coverage and current draft. Original 3D vertex copies agree exactly. Source sampled-path endpoints use the documented relative tolerance; the measured cube gyro endpoint residual was approximately 6.94e-18 m.

The [cut method and contract](closed-surface-cuts.md) state the supported source topology, graph-path and crease presets, numeric tolerances, parallel boundary-edge identities, noncryptographic freshness signature and export bounds. This checkpoint verifies a combinatorial disk and paired seam map. Planar development, sewing order, closed-surface course/bitmap generation and physical fabrication remain subsequent work.

## Cube knit programs from crease-cut flat nets (M4b) — 6 November 2026

- **461/461 unit tests passed** across 21 files, including 141 knit tests. Type checking, formatting and the production build passed.
- **28/28 browser tests passed against development** (2.8 minutes) and **28/28 against production** (2.5 minutes), with no page or console errors. Both used installed Chrome, software WebGL and `/KnittingTopology/`.
- The 10 new cube-net tests enumerate all 384 seven-crease cuts that open the cube into one disk. For every cut, hinge points coincide within 1e-12, cut creases separate, unit face edges keep unit length, no face is mirrored, cells do not overlap, and every row and column of the net is unbroken. The cuts give 11 distinct net shapes. The first 12 also pass the M4a disk checks.
- A hand-checked cross net (12 cm cube, 6 mm × 4 mm test swatch, not a measured gauge) gives 20 needles × 30 passes per face, an 80 × 90 bitmap, two reported shifts (a late start at pass 31 and an extra course at pass 61), two needle stops, zero yarn jumps, one parent per loop and 60 new edge loops. Other tests cover face-interior and partial cut refusal, seam loop counts with opposite M4a seam sides, all four start edges, network cell coverage with both copies of every cut edge, and refusal of stale cuts and typed sizes.
- The browser test generates the cross-net shape and combined programs from the cut preset, reads the flat-net report, needle stops and seams, and checks that BMP export is enabled. A local cube shape screenshot was inspected.

See [closed-surface knitting](closed-surface-knitting.md). Needle stops are reported, not drawn, because the colour key has no cast-off; Knit Grammar's held-loop check can flag them. Sewing order, face-interior cube cuts, the coarse-cell rule on a cut cube, sphere bitmaps, machine simulation and physical validation remain outside this milestone.

## Sphere knit programs from pole-to-pole cuts (M4c) — 6 November 2026

- **484/484 unit tests passed** across 22 files, including 164 knit tests. Type checking, formatting and the production build passed.
- **28/28 browser tests passed against development** (3.1 minutes) and **28/28 against production** (2.8 minutes), with no page or console errors. Both used installed Chrome, software WebGL and `/KnittingTopology/`.
- The 23 new sphere tests check the meridian preset on six network families at three spacings: each preset is one descending path. Branched, partial and level or climbing cuts are refused.
- The short-row layout is checked on five sphere and swatch sizes (test values, not measured gauges), with both first-pass directions:
  - every pass is one unbroken run that changes only at the end where it finishes, with zero yarn jumps;
  - every needle knits the first and last passes, and outer needles knit only passes their inner neighbours knit;
  - counts are within 1.5 loops of each circle over the course height;
  - loops are within 2 to 3.5 loops of their even place around the circle. On an 18 cm sphere at 6 mm × 4 mm, this gives 48 × 141, 1.32 and 2.35 loops.
- Both start sides are checked for:
  - single parent loops;
  - which pole needle 1 sits at;
  - outward orientation;
  - seam loops on all 32 needles, with opposite M4a sides for every cut edge;
  - the report.
- Network cells are checked on six networks with a pole node, a pole inside a cell and a pole on an edge. Every loop lies in a cell, and any loop placed in a different cell from the 3D cell that holds it is within `1e-5 × sphere size` of an outline (largest seen: 0.4 µm). Cut edges are drawn on both seam sides, and a pole node marks the whole pole needle. Chart round trips and refusal of typed sizes, net start sides and stale cuts are also covered.
- In a scratch run of 96 configurations (6 families × 4 spacings × 2 diameters × 2 start sides), every loop was in a cell, with zero yarn jumps and no export blockers.
- The browser test generates the sphere from the meridian preset in shape mode, on both start sides, and in combined mode. It reads the report and checks that BMP export is enabled. Local sphere screenshots were inspected.

See [closed-surface knitting](closed-surface-knitting.md). Pole openings are reported, not drawn, because the colour key has no gather operation. Long holds near the poles can be flagged by Knit Grammar's held-loop check. Short-row turns add no wrap or tuck; the lab is still to confirm this. This milestone closes M4. Sewing order, face-interior cube cuts, other sphere cuts, the coarse-cell rule on closed surfaces, machine simulation and physical validation remain outside it.

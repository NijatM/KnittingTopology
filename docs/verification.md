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

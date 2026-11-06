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

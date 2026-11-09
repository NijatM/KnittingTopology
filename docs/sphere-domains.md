# Sphere openings and angular sectors

These controls change the retained surface, not just its display. The generated surface mesh, network, analytic paths, knitting chart and reports use the same domain. This is a project construction, not a reproduction of a sphere-knitting method from Popescu's thesis. It predicts placement on an input surface, not the relaxed shape of knitted fabric.

## Controls and boundaries

- **Pole opening diameter:** one target circular diameter in millimeters for both Z poles. Zero keeps both poles; a positive value removes both polar caps. The holes have no planar filling faces.
- **Sphere fraction:** 0.01 through 1.00 of a revolution about +Z, counterclockwise from +X toward +Y. Thus 0.50 is a 180° half-shell and 0.25 a 90° sector. This does not cut the sphere at its equator.
- Full coverage with positive openings is an annulus: two open circular rims. Generate its network, choose a descending meridian cut connecting the rims, then generate a measured knit program. The cut disk pairs only the meridian's two copies; its circular rims are natural unpaired boundaries.
- Partial coverage is already a disk. Its two meridians are natural unpaired boundaries; no additional closing seam is required. With positive openings, the circular rims are arcs. With zero opening, both pole vertices remain, and long holds can still occur.

The diameter control does not silently shrink the openings. Reduce the opening first when reducing the sphere diameter below its current opening size. Changing either domain control invalidates the dependent network, cuts and knit stages. Undo/redo, project JSON, local restoration and Compare preserve the parameters.

## Geometry and numerical construction

Let sphere diameter be `D`, radius `R = D/2`, opening diameter `d` and angular fraction `f`. Source lengths are meters; angles are radians.

```
0 <= d < D; 0.01 <= f <= 1
alpha = asin(d/D)
colatitude theta in [alpha, pi - alpha]
azimuth phi in [0, 2*pi*f]
z_max = R*cos(alpha)
retained meridian length = R*(pi - 2*alpha)
retained area = 2*R*z_max*(2*pi*f)
```

The exact circular rim radius is `d/2`. Area is the curved shell area, without caps or cut-wall faces. Pole/circle positions are analytic; the display triangles are a polygonal approximation to the shell.

Absent parameters, or explicit zero opening and full fraction, retain the legacy six-chart sphere branch. Modified domains use four azimuth sectors. Positive-opening seeds include the equator; subdivision and pattern operations blend in the retained azimuth/colatitude chart to avoid creating collapsed cells at clamped rims. A partial sphere with retained poles uses triangular pole fans that are subdivided into quads before density subdivision. All six existing pattern families are supported; transformed families may contain non-quadrilateral cells as before.

Modified-domain paths interpolate azimuth and colatitude within the retained shell. Latitude rims follow small circles; paths do not take great-circle shortcuts through removed caps. Path lengths use 16-point composite midpoint integration per sample interval. This is a documented chart-path metric, **not a geodesic solver or a uniform-spacing guarantee**. Requested and achieved spacing remain distinct. Density estimation includes the equatorial extent rather than relying on short polar-rim lengths.

Invalid or numerically unresolved domains are refused. Positive `d/D < 1e-7`, a partial angular gap below `1e-7` radians, or a retained colatitude span below `1e-6` radians is unresolved under the current weld and area tolerances. These are computational limits, not fabrication recommendations.

## Knitting interpretation

The existing sphere short-row construction is restricted to the retained domain. `N = ceil(retained meridian length / stitch width)` needles have centers inside that meridian. Each needle's target loop count comes from its retained latitude arc divided by course height, rounded with the existing minimum and nested out-and-back scheduling rules. Full coverage uses circles; partial coverage uses arcs. Start side chooses bottom-to-top or top-to-bottom needle order; both first-pass directions are supported.

Reports distinguish the requested geometric opening from the **outer sampled knitting ring diameters**. The first and last needle centers lie inside the retained band, so their circles have larger diameters than the requested geometric rim. Neither number is a calibrated fabric aperture. Shape, network and combined modes retain their original symbol/key and operation-export restrictions. A sector's knitting chart is not periodic; full coverage retains its seam copies.

Opening the poles changes short-row targets and can reduce hold durations, but no safe minimum opening or hold threshold is established. Remaining longest holds, loop-count error, angular placement error and yarn jumps are reported. Native cast-on, cast-off, gathering, seam assembly and machine finishing are not inferred. Actual machine rules, yarn, calibrated swatches and a physical knit are still required before assessing machine feasibility or achieved shape. The opt-in shared two-layer shaping model retains its existing surface restrictions.

## Executable evidence

All numerical fixture loop sizes are **test values, not measured gauges or machine specifications**.

- `tests/core/sphere-domain.test.ts`: analytic rims/area, uncapped mesh, projection, admissible paths, all pattern families, guides, density, manifold boundaries and numerical limits.
- `tests/knit/sphere-domain-knit.test.ts`: exact default legacy fixtures, both start sides/directions, domain layout and chart round trips, parent/yarn/hold accounting and network cell coverage.
- `tests/knit/sphere-domain-integration.test.ts`: annulus-to-disk cuts on all families, natural boundary coverage/tampering, modes and keys, sector prerequisites, save/load/undo, fingerprints and invalid saved domains.
- `tests/browser/sphere-domain.spec.ts`: controls, real worker generation, rim/seam distinctions, no-cut sector knitting, project restoration, invalidation and narrow layout. Executed outcomes are recorded in [verification](verification.md).

# Numerical core 1.0.0

This directory contains no React, DOM or Three.js dependencies. Coordinates are meters, right-handed and Z-up. `SurfaceSpec.size` is plane/cube/saddle side length or sphere diameter. Analytic charts use UV in `[0,1]²`; cube patches are `+X,-X,+Y,-Y,+Z,-Z`, all outward. Sphere uses normalized-cube charts, not an equal-area or equi-angular map. Display mesh seams may duplicate vertices; graph seams use shared node/edge identities.

## Pipeline and scope

`generatePattern` validates input, builds an explicit coarse quad complex, extracts opposite-edge strip equivalence classes, assigns compatible integer densities, densifies each quad, fits a soft tangent cross-field, optionally smooths free nodes, applies a graph transformation, then checks graph invariants before returning. Failures throw; cancellation throws an error named `AbortError`.

Coarse patch-grid presets are project templates, not a reproduction of Oval's medial-axis or grammar construction:

- `regular`: one quad per analytic chart.
- `inset`: replace each coarse quad by an inner quad and four annular quads.
- `alternating`: start with 2×2 quads per chart and inset two checkerboard cells.
- `radial`: two inset rings per chart, without degenerate poles.

Opposite coarse edges are unioned into strips; a shared seam edge is one equivalence-class member. Default density is `max(1, round(mean embedded coarse edge length / spacing))`. `stripOverrides` specifies independent integer counts by deterministic canonical-root coarse-edge strip ID; unknown strip IDs fail. A strip count is 1–128; total base cells are capped at 40,000. Target spacing is measured, not guaranteed.

The plane-only N-sided strategy has hard boundary counts and rejects strip overrides. `preset` is ignored in this strategy. These independently authored templates constitute a deliberately incomplete subset inspired by Takayama's integer-pattern approach:

| Template                             | Preconditions                                          | Result                                                            |
| ------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------- |
| Single quad with triangular boundary | N=3, cyclic permutation of (2,1,1)                     | One quad, with a straight boundary vertex on the doubled side     |
| Rectangle                            | N=4, variant=0, opposite counts equal                  | count[0] × count[1] rectangular quads; odd side counts allowed    |
| Central fan                          | N=3–6, all counts even, count[i]=count[i+2] cyclically | N corner quads, individually integer-densified; central valence N |

Boundary counts are integers 1–64. Odd totals fail as mathematically impossible for a quad disk. Even total alone does not imply support by these templates. N=2, (4,1,1), general padding/edge-flow insertion, full paper template enumeration and minimal-singularity optimization are not implemented. For counts 1–4, counting a case as supported by either variant, coverage among even-total tuples is N3: 5/32, N4: 16/128, N5: 2/512, N6: 4/2048. These counts have an exhaustive executable test. No completeness guarantee is claimed.

## Guidance and transformations

Orientation is a soft background 4-RoSy tangent field. Guide tangents are obtained only from successive samples on the same chart, compared in the 3D surface tangent plane, and blended with `(cos 4θ,sin 4θ)`. Only guide segments on the current analytic chart influence it; cross-chart segments are dropped and counted in diagnostics, and near-zero projected tangents are ignored. Nearest-guide distance controls influence; reversing a stroke preserves its line/cross field up to floating-point roundoff. The edge correction aims at the nearer tangent or perpendicular, retaining current projected chord length in its target. Boundary, cube crease/corner and sphere atlas-seam nodes are pinned. Up to 48 fitting iterations use an eight-step bounded line search; nonpositive quad corner Jacobians are rejected. Optional Laplacian relaxation also checks positivity before installation. This is a bounded project fitting heuristic, not an optimizer with an alignment/convergence guarantee. Guides do not alter topology or choose paper kernels.

`quad` retains the dense mesh. `dual` replaces original face centers/vertex neighborhoods; `ambo` creates edge-midpoint face and vertex polygons; `kis` creates center triangles; `gyro` creates oriented pentagons with two shared thirds per old edge. Open dual cells are clipped with boundary-edge midpoints and original boundary vertices; open ambo fills each boundary vertex region with a fan of positive corner triangles from the original boundary vertex to consecutive edge midpoints; gyro retains and splits boundary edges at thirds. For the cube, dual and ambo apply these clipped rules separately to each analytic chart and weld shared seam identities; this feature-conforming project extension retains every cube crease as actual final graph edges. Cube ambo additionally splits any concave interior vertex quadrilateral along a verified positive-area diagonal, preserving that polygon’s boundary edges and recording the count in provenance. Sphere operators remain global. These are explicit project boundary rules. `diagonal` is the project's connected single-diagonal fan triangulation retaining old edges, not the crossing-diagonal two-component network. All new cells retain a source reference. Every cube pattern family retains all twelve original sharp crease lines as shared final graph-edge chains. The original coarse crease complex also remains in `coarseTopology`. Dual/ambo vertex polygons use oriented cell-adjacency walks rather than geometric angle sorting. Quad diagonal selection checks both candidate splits to avoid collinear triangles in the triangular (2,1,1) kernel.

The guide orientation field is chart-local. The bounded fitting solver uses one shared backtracking step across charts, so a restrictive chart may reduce displacement in another chart without transferring its guide direction. Independent chart geometry/convergence is not claimed.

## Diagnostics and limits

Validation checks finite surface-attached nodes, IDs, ordered simple cell boundaries, cell orientation, quad corner Jacobians, exact edge/cell incidence, edge orientation, manifold vertex links, connectivity, expected Euler characteristic, closed seams and the closed all-quad degree-deficit identity. These are local cell/complex checks, not a global geometric intersection certificate.

Statistics sum exact sphere great-circle arc lengths between successive stored path samples (or endpoints when no path is supplied), exact cube piecewise projected-line paths, sampled saddle paths, and straight plane segments. Saddle edge lengths are approximations using nine path samples; no error bound is promised. Sphere paths generated here follow the shortest endpoint great circle; imported stored path excursions contribute their full segment-wise arc lengths. `surfaceArea` is full support area: plane s², cube 6s², sphere πs²; saddle uses a 128×128 midpoint integral. `polygon-area` separately reports chord polygon area-vector magnitudes, not curved cell area. Extraordinary-vertex counts use degree inside, degree+2 at boundary corners, degree+1 on other boundary vertices. Raw degree remains recoverable from explicit edges.

The triangular (2,1,1) kernel intentionally has one straight boundary corner: its total polygon area is positive, while that corner Jacobian is zero. All its nodes are boundary-pinned; fitting cannot improve this boundary-imposed configuration.

Length membership tolerance is `1e-8 × size`; graph area-vector tolerance is `1e-14 × size²`; the fitting line search uses `1e-13 × size²` for quad corner positivity. Sizes are bounded to [1e-6,1000] m; saddle curvature is bounded to [-2,2]. Graph validation bounds are 250,000 nodes, 500,000 edges, 200,000 cells. Generation progress/cancellation hooks are synchronous; the owning worker must terminate computation to handle UI cancellation promptly.

No textile, knit-loop, manufacturing, structural or material validity is implied. The seed is recorded; these templates contain no random perturbations.

## Primary sources

- Takayama, Panozzo and Sorkine-Hornung (2014), _Pattern-Based Quadrangulation for N-Sided Patches_, Computer Graphics Forum 33(5), DOI: 10.1111/cgf.12443. The complete method's guarantees do not transfer to this subset.
- Oval et al. (2018), _Topology Finding of Structural Patterns_, Advances in Architectural Geometry, https://hal.science/hal-01883505. The coarse topology → strip density → mapping separation informs this architecture; closed atlases, guides and these presets are project extensions.
- Hart (n.d.), _Conway Notation for Polyhedra_, https://www.georgehart.com/virtual-polyhedra/conway_notation.html. Dual, ambo, kis and gyro connectivity follow the notation credited to John Conway; surface placement, boundary and crease rules are project adaptations.

The pure citation registry selects sources by their actual role: Oval for the pipeline, Takayama for N-sided mode, and Hart for the four named operators. Graph provenance records those selected references. See [methods and source attribution](../../docs/methods.md) for locators, full bibliography and qualified wording. Citation-only metadata changes do not change the numerical algorithm version.

## Imported support geometry

Imported OBJ/STL triangle meshes use the shared `SurfaceSpec` container with `kind: 'mesh'`, but remain inspection-only. `buildSurfaceMesh` preserves stored vertex/index order for display; analytic evaluation, projection, path/area functions and the pattern generator reject this kind. No atlas, cross-field or retopology is inferred from an arbitrary triangle soup. The pure parser/diagnostics module is `src/import/mesh.ts`; its implementation bounds, indexing choices, measurement definitions and limits are in [the import contract](../../docs/imported-surfaces.md).

# Surface-distance and one-guide audit

7 November 2026. The initial checkpoint `9d52214` replaced the fixed radius-two distance stencil on open curved charts and identified a course-layout failure. The course-end correction below addresses that tested failure. Neither checkpoint establishes a physically accurate knitted shape. Closed-surface cube/sphere construction is unchanged.

## Numerical method

`src/knit/surface-distance.ts` samples the chart on an alternating-diagonal triangle grid. For a triangle with target vertex C and opposite edge AB, it minimizes

```
(1-t) d(A) + t d(B) + |C - ((1-t) A + t B)|,  0 <= t <= 1.
```

The entire needle-1 boundary has zero data. The update includes both edge endpoints. Repeated sweeps in four chart directions allow updates through continuous edge interiors and revisit obtuse triangles. Updates only decrease the initial infinite interior labels. The solve rejects degenerate sampled triangles and failure to converge within 128 cycles. Cancellation is checked during construction and each sweep row.

The stopping tolerance is `1e-10 × maximum triangle-edge length × resolution`. This measures algebraic iteration change, **not geometric error**. The plane uses analytic distances; other open charts use 128 intervals per side. Tests may call the distance kernel at other resolutions, up to 256. No resolution control or synthetic measurement was added to the interface.

[Eikonal and obtuse-triangle background](https://doi.org/10.1073/pnas.090060097): Sethian and Vladimirsky (2000), _PNAS_ 97(11), 5699–5703. The project uses iterative triangle-edge Bellman relaxation rather than that paper’s fast-marching, virtual-simplex or higher-order methods. See the [shaping method and source roles](knit-shaping.md).

Sampled faces can shortcut the original curved surface. First-order wave interpolation also has finite-resolution error. Grid refinement and a converged iteration are different checks; neither is a fabric simulation.

## Independent comparisons

All analytic fixture dimensions here are **test values, not measured gauges**. Executable comparisons are in `tests/knit/surface-distance.test.ts`.

- Rectangle: exact distance from the source side, including paths meeting edge interiors.
- Skew planar parallelograms: compare every grid vertex with the analytic nearest point on the finite source segment. Both mild shear 0.2 and obtuse shear 3 improve at resolutions 16, 32, 64 and 128. At shear 3, maximum error still measures about **6.32 mm** on the 180 mm fixture at resolution 128. There is no general accuracy percentage guarantee.
- Cylinder: distance approaches the independently known developed arc length as the faceted surface is refined. Chord error decreases by approximately four per doubling in this fixture.
- Analytic saddle: compare the computed distance gradient with the inverse first fundamental form, evaluated independently from the analytic surface derivatives. Central differences cover the interior rectangle `[1/8,7/8]²`. RMS Eikonal residuals are dimensionless:

| Resolution | RMS residual |
| ---------- | ------------ |
| 32         | 0.000145319  |
| 64         | 0.000060080  |
| 128        | 0.000028460  |
| 256        | 0.000014041  |

A separate feasible curved path on the 180 mm, curvature-0.45 saddle has integrated length 150.878279 mm. The old stencil reported 151.250000 mm at its endpoint; the triangle field at resolution 128 gives 150.861467 mm. This removes that particular directional-bias counterexample. The path is an upper comparator, not an exact shortest path or material trajectory. These figures do not certify a general surface-distance error bound.

## Supplied strong saddle at the distance checkpoint

The supplied saved project has a 180 mm saddle, curvature 1.5, start edge `v1`, and a jersey entry of 5 mm by 5 mm. Its measurement provenance is unknown; these entered values were preserved. The saved geometric network is current. Two-guide structures use the existing flagged jersey fallback.

At checkpoint `9d52214`, before the course-end correction, the original combined two-guide settings produced 50 needles × 48 passes and 2,224 active loops. There are 427 blocking messages: 39 placement positions, 187 unsupported two-layer shaping transfers and 201 symbolic parent mismatches. Counts overlap failure causes; they are not independent defects. One-guide uniform jersey produces the same reference layout and retains 44 messages: 39 placement positions and 5 parent mismatches. Both BMP and Knit Grammar writers reject these programs; the project and report remain saveable.

The first unresolved one-guide pass requests 39 children from 35 contiguous live parents. Its left endpoint is on the piece boundary and its right endpoint is a turn, with no available boundary-start block. Under the current pass grammar the necessary capacity bound is `n + 2 + leftBoundary + rightBoundary`, or 38 here. Each endpoint may add one unparented child beside its host; only a piece-boundary parent may move one needle outward. This bound concerns the current graph and local operation grammar, not all possible schedules for the surface. The preview fallback remains explicitly unresolved.

## Course refinement before endpoint anchoring

An in-memory resolution probe of the same strong saddle and one-guide settings gives:

| Grid resolution       | Needles × passes | Blocking messages |
| --------------------- | ---------------- | ----------------- |
| 32                    | 50 × 49          | 45                |
| 64                    | 49 × 48          | 0                 |
| 128 (current default) | 50 × 48          | 44                |
| 256                   | 49 × 48          | 56                |

The default was **not** changed to the coarser grid that happens to pass. A converging distance field does not imply a stable discrete course graph. Resampling phases, monotone connection choices and rounding still need an independent course-construction audit. Passing symbolic checks at one resolution does not verify physical shape, and this experiment is not a resolution-selection algorithm.

This comparison motivated the course-end correction below. It remains a record of the preceding algorithm, not the corrected result. Two-guide shaping stays deferred pending a supported operation alphabet.

## Course-end correction

Directly inspecting the first few courses showed that a 2:1 or 1:2 block could connect an end sample to an interior neighbour solely because its angle cost was lower. This split the boundary-adjacent first course at different columns as contour lengths changed under refinement. Popescu’s thesis §6.2.2 (printed p. 101) connects the contour end vertices before its interior connection search. The project now preserves first-to-first and last-to-last sample links within end triangles when neither contour is trimmed and both have at least two samples. Interior triangles and trimmed-end gaps retain the declared project rules. This is endpoint anchoring within the project DP, not a reproduction of the thesis’s complete greedy algorithm.

A second conservative-search failure appeared when rejoining held loops on the last pass at grid resolution 64. The best retained plans moved adjacent loops from different source passes and were rejected, although the active count was unchanged and leaving every loop on its existing needle was legal. The planner now retains that explicit no-move candidate after the cost-minimizing candidates fail. It consumes each selected parent once, leaves held loops outside the span untouched, and still passes through the symbolic operation validator. A larger matching cost remains possible; this is not a geometric-spacing certificate.

The corrected one-guide reference case gives:

| Grid resolution         | Needles × passes | Unresolved placements | Symbolic parent mismatches | Required moves |
| ----------------------- | ---------------- | --------------------- | -------------------------- | -------------- |
| 32                      | 50 × 49          | 0                     | 0                          | 163            |
| 64                      | 49 × 48          | 0                     | 0                          | 133            |
| 128 (unchanged default) | 50 × 48          | 0                     | 0                          | 176            |
| 256                     | 49 × 48          | 0                     | 0                          | 143            |

The first and last courses each have 47 loops at all four resolutions, matching the ceiling of the analytic saddle boundary-arc length divided by the fixture stitch width. Interior short rows remain. The current default has 2,225 active loops; both operation writers accept the one-guide uniform-jersey result. The original combined two-guide case still has 360 blocking messages: 176 unsupported shaping transfers and 184 symbolic parent mismatches. No class operations, measured entries, export gates or application resolution defaults changed.

The numerical geometry API now accepts an explicit bounded comparison resolution so the 32/64/128/256 end-course and placement checks execute directly in unit tests. It is not a project setting or an interface control. Integration tests replay actual one-guide operations and detect removal of a required transfer. Browser verification checks every downloaded BMP pixel against the Knit Grammar key and confirms that switching to the unsupported two-guide case blocks both operation exports.

Counts and the distribution of interior courses still vary across grids; these comparisons do not prove convergence of a unique discrete course graph. The 600 × 600 cap, unsupported contour/trim combinations, conservative transfer scheduling, sampled metric errors, lack of a fabric/material simulation and need for measured calibration remain. Mild saddles can still quantize to no shaping. Nothing here establishes lab importer compatibility, knittability or achieved physical shape.

# Open-surface knit shaping

Shape mode takes a plane, saddle or supplied rectangular OBJ chart and measured loop dimensions. It produces a design-level loop layout and a Knit Grammar operation bitmap. The geometric cell network remains a separate representation; shape mode does not rasterize that network. Network and combined modes reuse this reference layout, as described in [network pattern mapping](knit-network-mapping.md).

## Source and attribution

Mariana Adriana Popescu, _KnitCrete: Stay-in-place knitted formworks for complex concrete structures_, doctoral thesis, ETH Zurich, 2019, DOI [10.3929/ethz-b-000408640](https://doi.org/10.3929/ethz-b-000408640), §§5.2 and 6.2.

Section 6.2 describes course generation, subdivision into loops, and translation of the dual graph into a square diagram. Triangular exceptions represent short-row endpoints or increases/decreases. Section 5.2 explains edge activation and transfers to make room for interior increases. The thesis diagram does not contain final machine instructions (§6.2.4); this app's operation mapping is an additional project method.

The related chapter _Automated Generation of Knit Patterns for Non-developable Surfaces_ (2018), DOI [10.1007/978-981-10-6611-5_24](https://doi.org/10.1007/978-981-10-6611-5_24), is registered as metadata only. Its full text has not been read and is not direct implementation evidence. [BibTeX](../research/references.bib) and the [source register](../research/sources.csv) preserve this distinction.

Suggested description: “We adapt the course/loop graph stages described in Popescu (2019, §§5.2 and 6.2) for supplied rectangular surface charts. Distance-field construction, monotone alignment, needle placement and operation verification are independent project adaptations. This is not a full reproduction or a physically validated fabrication pipeline.”

## Construction

1. Rotate the chart by multiples of 90°, without reflection, so the chosen start edge is at the bottom and needle 1 is on the left. Stored UV coordinates remain in the original surface chart.
2. Compute a distance field from the entire needle-1 side on a sampled triangle grid. At each vertex, minimize interpolated distance along the opposite edge plus straight travel through the triangle. Four-direction relaxation revisits vertices until the largest decrease is at most `1e-10 × maximum triangle-edge length × grid resolution`, with a cap of 128 cycles; failure to converge rejects the build. A plane uses its analytic distance on 16 intervals per side; other charts use triangle relaxation on 128 intervals per side. This project method replaces the fixed radius-two angular stencil. It is first order, uses sampled triangle faces, and is not an exact surface geodesic.
3. Extract one monotone contour per loop width and sample it with `max(1, round(length / courseHeight))` points. Adjacent contours use a monotone dynamic alignment with 1:1, 1:2 and 2:1 blocks. The closer triangle link continues a course; the other point defines a partial course. This replaces the thesis's greedy connection rule. Topological ordering along contours gives pass order.
4. Extend course endpoints to the piece boundary or to a physical midpoint at an interior turn. Divide the resulting sampled course length into `ceil(length / stitchWidth)` loops, with a small relative rounding tolerance to prevent numerical noise at integral ratios.
5. Align each course's children to the live parent loops. At a piece boundary narrowing consumes the outer parents; at a short-row endpoint outer parents remain held. A 1:2 block opens a needle; a 2:1 block stacks parents. Movements are limited to one needle and are encoded as knit-plus-transfer operations on a previous pass. Conservative placement search may reject a graph that another scheduling strategy could realize.
6. Tile the chosen structure by needle/pass indices, insert permitted bed changes and shaping transfers, then replay symbolic parent-loop sets. Every required parent must reach the declared child on the correct bed and needle. This checks the bitmap's agreement with the chosen loop graph; it is not a machine simulation.

Structure tiles stay on needles across shifts, rather than following material loops. The first course is treated as a cast-on boundary; a machine cast-on sequence is not generated. Pass directions alternate. Tucks/bed changes or existing transfer operations can prevent the basic key from encoding a required shaping step. The two-guide key has no transfer operation, and a custom key may lack the needed one; in both cases the step is reported as unresolved. Operations are found by meaning (see [colour keys](knit-network-mapping.md#colour-keys)). Such results remain previews and cannot be exported as BMP or Knit Grammar JSON. Reports remain downloadable. The file writers enforce this rule in addition to disabled interface controls.

## Measurements, settings and provenance

Shape mode requires a measured jersey entry. The selected fill's measured stitch width and course height set the loop dimensions; an unmeasured fill uses jersey values and is flagged **assumed = jersey**. No machine gauge or loop dimensions are supplied as defaults. The single loop size per piece follows the thesis restriction (§6.2.1, footnote 4).

Projects retain optional `knit.startEdge` (`v0`, `u1`, `v1`, `u0`; absent means `v0`) and `knit.newLoop` (`knit` or `tuck`; absent means `knit`). Old schema-v1 projects remain readable. The computed program is derived, not saved. Needle indices in the numerical API are zero-based; placement course indices are zero-based; shaping step/move pass numbers are one-based. Image row zero is the last pass. Every active pixel links to a loop ID, original UV, surface position, course, role and parent loop IDs. Held/outside pixels have no surface point.

First-pass direction, new-loop formation, short-row turns, transfer timing and yarn travel need lab confirmation. The current operation convention schedules transfers after the pass. Transfer timing/travel switches are recorded rather than executed machine instructions. Short-row turns add no wrap or tuck.

Shape generation runs in a disposable worker. Cancel terminates it; changed inputs supersede jobs. On the same surface, an older preview is retained and its operation exports are blocked until regeneration.

## Limits and evidence

- A level must form one contour monotone across chart rows. Disconnected or nonmonotone levels are rejected and need patching.
- Boundary-trimmed adjacent contours use terminal gaps without interior triangle blocks. Mixed boundary truncation and curved short rows in the same pair are outside the verified subset.
- The distance source is asymmetric. Sampled-face geometry, first-order distance and chart interpolation errors have no certified bound. An algebraic stopping tolerance is not a geometric error estimate. Highly skew charts can have substantial finite-resolution error even after relaxation converges; refinement tests are required. No universal accuracy percentage is claimed.
- Geometric lengths are sampled approximations. Contour/course rounding and maximum alignment offset are reported. Swatch dimensions do not account for tension, anisotropic mechanics or yarn interactions.
- Placement conservatively retains one minimum-cost alignment per candidate origin within a small origin band. It is not a complete search over all machine programs. If no boundary-start block is available, a contiguous set of `n` live parents can cover at most `n + 2 + leftBoundary + rightBoundary` children under this pass grammar: each endpoint may add one empty child, plus one outward unit transfer at a piece boundary. Exceeding this necessary bound gives an explicit unresolved message; it does not rule out other course layouts or operation schedules.
- A maximum of 600 needles and 600 passes is accepted. This is a format/resource cap, not a machine needle-count claim.
- Yarn jumps and Knit Grammar findings are warnings; the parent-loop agreement check is an export gate. Passing checks does not establish knittability or achieved shape.

Analytic tests cover plane dimensions and rotations, widening/narrowing trapezoids and an annular sector's excess outer courses. Further tests check held-parent conservation, unit moves, explicit unresolved placement, invalid inputs, project round trips and operation-file rejection. See [executed verification](verification.md) for actual run results. Physical knitting and the lab's BMP-to-Steiger importer remain unverified.

## Distance verification and remaining saddle restriction

Numerical background: J. A. Sethian and A. Vladimirsky (2000), “Fast methods for the Eikonal and related Hamilton–Jacobi equations on unstructured meshes,” _PNAS_ 97(11), 5699–5703, DOI [10.1073/pnas.090060097](https://doi.org/10.1073/pnas.090060097). The paper explains Eikonal updates and the loss of one-pass causality on obtuse triangles. This implementation instead repeatedly relaxes continuous triangle-edge Bellman updates; it does not reproduce the paper’s fast marching, virtual-simplex or higher-order algorithms. Source role and BibTeX are in the reference register.

Tests compare plane/segment distances, cylinder arcs and an independently evaluated saddle metric under grid refinement. A constructed curved path that exposed the old stencil’s directional bias is checked separately. These numerical checks do not establish physical fabrication accuracy.

The supplied 180 mm, curvature-1.5 saddle still has an unsupported one-guide transition: pass 3 requests 39 loops from 35 live parents with only its left endpoint on the piece boundary and no available boundary-start block. The current grammar permits at most 38 there. Its preview remains inspectable, with both operation writers blocked. Patching the piece or constructing a different operation schedule remains open; changing the distance solver does not resolve this restriction.

The earlier mild-saddle diagnostic and the subsequent audit are recorded in [verification](verification.md#open-saddle-diagnostic). Some mild saddles still quantize to constant course counts without discrete shaping; a curved target display alone does not establish encoded three-dimensional shaping.

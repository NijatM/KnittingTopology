# Methods and source attribution

Knitting Topology explores geometric cell networks on analytic surfaces. It separates the support surface, coarse connections, integer subdivision density, pattern transformation and geometric fitting. Its outputs do not define knitted loops, yarn paths, machine operations or validated structural behavior.

The learning panel explains the selected method, offers a manually loaded example and supplies citations. Loading an example changes the editable project; generation remains an explicit action. The diagrams are original illustrations generated from this implementation, not reproductions of paper figures.

## Coarse connections and density

The separation of singularities, density, pattern and geometry is informed by Oval et al. (2018), §2, pp. 345–346. Compatible strip subdivisions follow the opposite-edge grouping described in §3.2, pp. 348–349. The project’s regular, inset, alternating and radial presets are authored here; they do not reproduce the paper’s medial-axis construction (§3.1) or editing grammar (§4.2). Its cube/sphere atlases extend beyond the paper’s stated surface scope (§6, pp. 361–362).

| Project preset | Coarse quads per analytic chart | Construction                                  |
| -------------- | ------------------------------: | --------------------------------------------- |
| Regular        |                               1 | Retain the chart quad.                        |
| Inset          |                               5 | Inner quad and four surrounding quads.        |
| Alternating    |                              12 | A 2×2 grid with two checkerboard cells inset. |
| Radial         |                               9 | Two nested inset rings and a central quad.    |

Shared seams have shared graph identities. Opposite coarse edges belong to compatible subdivision strips. A requested spacing is converted into integer counts; the measured result can differ from that target. Geometry and density changes should not be described as topological optimization.

## Planar N-sided patch subset

The standalone patch construction is an independently authored incomplete subset inspired by Takayama, Panozzo and Sorkine-Hornung (2014), §2–2.3, pp. 178–181. It supports the triangular (2,1,1) single quad, rectangles with equal opposite counts, and constrained even-count central fans with 3–6 sides. Supported fans require cyclic count[i] = count[i+2]. Even total boundary count is necessary for an all-quad disk, but does not establish support by this subset.

The project does not implement N=2, general padding/edge-flow insertion, the complete template enumeration or minimum-singularity selection. Do not transfer the paper’s valid-input completeness guarantee to this implementation. The complete method’s connectivity and embedding are themselves distinct; its limitations discuss flipped cells in nonconvex embeddings (§4, pp. 183–184).

## Pattern transformations

Conway operator definitions are credited through Hart’s explanatory resource. Hart credits John Conway for the notation and himself for his presentation and algorithms. The notation describes connectivity rather than a unique geometric realization. Oval et al. (2018), §3.2, Fig. 6, p. 349, demonstrates ambo, kis and gyro on surface patterns.

| Family   | Connectivity rule                                                 | Project qualification                                                           |
| -------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Quad     | Retain the dense quad complex.                                    | Baseline rather than an additional operator.                                    |
| Dual     | Face vertices and cells around old vertices.                      | Open clipping; cube chart rules preserve creases.                               |
| Ambo     | Edge midpoint vertices; face and vertex polygons.                 | Open boundary fans; clipped cube regions may require positive-area face splits. |
| Kis      | One center per old face with triangles to its boundary.           | Centers are attached to the support surface.                                    |
| Gyro     | Oriented pentagons using edge thirds and face centers.            | Explicit surface placement and open boundary rules.                             |
| Diagonal | Positive internal diagonal/fan triangulation retaining old edges. | Project construction, not a Conway operator or crossing-diagonal network.       |

Closed global-operator count identities are useful teaching checks on the sphere. They are not promised for clipped open boundaries or the feature-preserving cube adaptation. Even on the sphere, geometric regularity, planar faces, equal spacing or material performance do not follow from a connectivity operation.

## Direction guides

Guide fitting is a project heuristic, not one of the cited paper algorithms. Successive same-chart samples supply tangents to a local cross field; quarter-turns represent equivalent directions. A bounded line search moves eligible nodes and checks local quad positivity. Boundaries, cube creases and sphere atlas seams are pinned. Cross-chart stroke segments are dropped and reported; a shared backtracking step can restrict geometry changes on other charts. Neither exact alignment nor convergence is guaranteed. Guidance changes geometry, not coarse topology or kernel selection, and carries no stress interpretation.

## Citation records and page locators

- Takayama, K., Panozzo, D., and Sorkine-Hornung, O. (2014). _Pattern-Based Quadrangulation for N-Sided Patches_. Computer Graphics Forum 33(5), 177–184. [DOI: 10.1111/cgf.12443](https://doi.org/10.1111/cgf.12443). [Public author PDF](https://igl.ethz.ch/projects/patch-quad/pattern-based-quadrangulation.pdf). The eight-page author PDF corresponds to printed pp. 177–184. Wiley verifies the DOI; the ETH IGL BibTeX record verifies the other bibliographic fields.
- Oval, R., Rippmann, M., Mesnil, R., Van Mele, T., Baverel, O., and Block, P. (2018). _Topology Finding of Structural Patterns_. Advances in Architectural Geometry 2018, 342–363. Klein Publishing GmbH. [HAL record](https://hal.science/hal-01883505), [author PDF](https://block.arch.ethz.ch/brg/files/OVAL2018__AAG_topology-finding-of-structural-patterns_1542733947.pdf), [final proceedings](https://research.chalmers.se/publication/504188/file/504188_Fulltext.pdf). Locators here use the final proceedings’ printed pagination; the author manuscript has different pagination. No chapter DOI has been verified.
- Hart, G. W. (n.d.). _Conway Notation for Polyhedra_. [Explanatory resource](https://www.georgehart.com/virtual-polyhedra/conway_notation.html), Basics and Operations entries d/a/k/g. [Modern interactive generator](https://georgehart.com/conway/). The footer’s ©1998 is not treated as a publication year. Accessed November 6, 2026.

The bibliography is available in [BibTeX](../research/references.bib). Citation downloads select sources by their actual role: Oval for the pipeline, Takayama for the N-sided construction, and Hart for dual/ambo/kis/gyro. A citation supplies context; it does not certify this implementation or transfer a paper’s guarantees.

Method records describe the accepted graph using its generating parameters. Pending controls and guides can differ. Provenance notes summarize guide stroke/sample/candidate counts for newly generated graphs; the input signature identifies the accepted inputs but does not contain the original strokes. If a result is stale after guide edits, retain the original input project or regenerate before claiming reproducibility of that embedding. Imported graphs are checked again; spacing statistics use the generating spacing rather than pending controls. Generation-only fitting diagnostics are not recreated by these static graph checks.

## Supplied OBJ rectangle chart

[Mapped generation](mapped-surfaces.md) uses an externally supplied chart, screens its topology, triangle orientation and bijective rectangle boundary, then embeds the existing chart-generated graph. The mathematical conditions are informed by Lipman, Y. (2014), _Bijective Mappings of Meshes with Boundary and the Degree in Mesh Processing_, SIAM Journal on Imaging Sciences 7(2), 1263–1283, [DOI10.1137/130939754](https://doi.org/10.1137/130939754). Theorem1 is located on pages3 and10 of the [public preprint](https://arxiv.org/pdf/1310.0955). This project does not implement its optimization or an exact-predicate certificate. The live Learn illustration explores barycentric interpolation against the active chart without editing the project.

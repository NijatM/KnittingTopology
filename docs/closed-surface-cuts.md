# Closed-surface cut preparation

Cut planning prepares an accepted cube or sphere network for later open-domain course generation. It produces a combinatorial disk and an explicit paired seam map. The 3D source geometry is retained; no flattened layout, sewing order or closed-surface knit bitmap is generated in this step.

## Sources and relationship

Jeff Erickson and Sariel Har-Peled, _Optimally Cutting a Surface into a Disk_, Discrete & Computational Geometry 31(1), 37–59 (2004). The [author publication page](https://jeffe.cs.illinois.edu/pubs/schema.html) verifies the metadata; the [author preprint](https://jeffe.cs.illinois.edu/pubs/pdf/schema.pdf), introduction and §2.1, provides the definitions used here. A cut graph opens a surface into a disk, with corresponding boundary edges that can be glued back together. This project implements its own presets and corner-fan construction. The paper's minimum-cut and approximation algorithms are not implemented.

[Popescu's thesis](https://doi.org/10.3929/ethz-b-000408640), §6.3.2, separately discusses dividing geometry into computational patches and combining their patterns. Computational patches need not correspond one-to-one with separate fabricated pieces. That is context for the next course-generation step, rather than an implemented automatic patching algorithm. The [source register](../research/sources.csv) records the sections actually read.

## Validation and construction

1. Verify the source cell network: distinct identities and simple face cycles; two oppositely directed face incidences per edge; a connected cyclic link at every vertex; one connected closed oriented component; Euler characteristic 2. These are combinatorial checks on the accepted geometric network, not a global 3D intersection certificate.
2. Require a nonempty connected acyclic set of source edges. Edges not in the source, duplicates, cycles and disconnected drafts are rejected. Arbitrary-genus surfaces and imported closed meshes are outside the supported input scope.
3. Create one corner record per face/vertex occurrence. Join records across uncut edges at their shared source vertex. The remaining connected corner fans determine vertex copies. Cut edges receive one copy per incident face. The original graph is unchanged.
4. Independently inspect the resulting incidence, orientation, vertex links and boundary traversal. Acceptance requires one component, one boundary cycle and Euler characteristic 1. A tree label alone is insufficient for acceptance.
5. Pair the two boundary copies of each cut edge by source identity, with explicit endpoints and opposite boundary traversal directions. Endpoint pairs must cover both sides exactly. Stored boundary data is checked against the actual cut complex before export.

A leaf of the cut tree can retain one vertex copy shared by both boundary sides. A branch can create several copies. A one-edge cut has a two-edge boundary; its parallel edge copies must retain distinct IDs. Do not weld copies by coincident positions or deduplicate them by endpoint pairs. Every vertex copy retains its source ID, 3D position and original attachment. Every cut-face boundary names edge copies explicitly.

3D copies of the same source vertex agree exactly. Sampled path endpoints use a floating-point tolerance of `1e-10` times the maximum absolute source coordinate. This admits the observed approximately `7e-18 m` rounding residual in generated cube gyro paths without changing their stored geometry. It is not a geometric accuracy or fabrication tolerance. Cut length is measured along stored sampled edge paths, or the endpoint chord when no path is stored.

## Presets

**Cube cross-net cut:** retain five face hinges: +Y to +X, −X, +Z and −Z, and +X to −Y. Cut the other seven cube crease chains. The preset requires all twelve crease chains to exist in the network. Crease membership uses a `1e-8 × surface size` coordinate tolerance. The hinge arrangement corresponds to a conventional cross net; its planar development is not computed here.

**Sphere meridian cut:** join the highest- and lowest-Z network nodes with a weighted shortest graph path biased towards the +X meridian. A sampled edge length is multiplied by `1 + 4 × mean((abs(y) + max(-x, 0)) / radius)`. This is a deterministic project preference, not an exact meridian or geodesic certificate. Graph vertices need not coincide exactly with the poles.

Preset selection and every manual edge toggle are undoable. The viewer tool must be armed to edit edges; orbiting is disabled while it is armed. Invalid drafts remain editable. The previous validated result remains inspectable on the same source, with seam export blocked until the current draft is validated.

## Files and freshness

Optional project settings `knit.cut` retain source revision, a noncryptographic graph freshness signature, preset label and source edge IDs. Derived complexes are not persisted or trusted from files. Reopened drafts require validation again. Changing source geometry or connectivity invalidates the draft/result association. The signature is a UI freshness guard, not a cryptographic identity certificate.

`knitting-topology-seam-map` JSON v1 declares meters and records the source surface, accepted graph provenance, cut settings, duplicated complex, oriented boundary, seam pairs and validation statistics. Save project JSON as well to retain the complete project, including coarse topology and other settings. Seam-map export rechecks disk topology, pairing and current draft identity. Export is bounded to 64 million JavaScript UTF-16 code units; oversized results require a coarser network.

Cut construction runs in a disposable worker. Cancellation or changed cut/source inputs terminates the job; superseded results cannot replace the current state. Graph entity limits match the existing project bounds. Maximum-input browser responsiveness is not certified.

## What follows

The cut disk still needs an appropriate nonrectangular computational domain, loop/course generation and boundary-to-program registration. The sphere's pole treatment and the cube net's abrupt width changes need explicit handling within the available operation key. Until those steps are verified, closed-surface knit generation remains unavailable. A valid paired seam set can branch and does not specify one unbranched sewing line or a machine sequence.

# Closed-surface knitting: cube flat nets

A cube opened by a validated cut can be knitted from its exact flat net. This works only for cuts made of whole crease lines. Sphere bitmaps and cube cuts through face interiors are not yet supported. Like every knit output here, the result is a design-level bitmap. It is not machine-ready and nothing is verified until knitted.

## Why the cube is exact

All of a cube's curvature sits at its eight corners. A cut along seven whole creases forms a tree through all eight corners and puts every corner on the boundary. The six faces then unfold without stretching, by rotating about the five remaining creases. Every such cut gives one of the eleven cube nets. The unit tests enumerate all 384 seven-crease cuts that open the cube into one disk. They find no overlapping net, and every row and every column of each net is one unbroken run. This construction is the project's own. It is not taken from Popescu's thesis, and no planar development method is cited for it. For cut graphs in general, see [closed-surface cut preparation](closed-surface-cuts.md).

## Construction

1. The knit worker rebuilds the saved `knit.cut` with the M4a disk checks against the current network. A cut that belongs to a different surface or network is refused.
2. Every cut network edge must lie on a cube crease within `1e-8 × surface size`. Every network edge on a cut crease must be cut, and the cut lengths along each crease must add up to the edge length within `1e-6` relative. Exactly seven creases must be cut. Anything else gets a clear message and no output.
3. The faces are unfolded across the remaining hinges, breadth first from the face with the most hinges (lowest index on ties). Each face keeps its outward chart orientation and is only rotated, never mirrored. Tests check that hinge points coincide, that cut creases separate, that unit edges keep unit length, and that the six cells do not overlap, for all 384 cuts.
4. The start edge setting turns the net in 90° steps without mirroring. The bottom of the turned net is knitted first.
5. Each face is `ceil(L / stitch width)` needles wide and `round(L / course height)` passes tall, using the same counting rules as open-surface shaping. The report gives the difference from the face edge in both directions. Folds between hinged faces are knitted straight through, so the knit does not form the crease.
6. Each loop knits through the loop below it on the same needle. A needle that starts after pass 1 forms a new loop with the selected new-loop operation (knit, or tuck first). There are no sideways transfers, increases or decreases.

## Width changes

- **Wider:** new needles start new loops at the edge of the run.
- **Narrower:** needles stop while other needles keep knitting. Neither the colour key nor Knit Grammar has a cast-off operation, so none is drawn. The report and the Knit panel list each stop by its last pass and needle range, to be cast off in the lab software or held to the end. Knit Grammar's held-loop check can flag these needles. Export stays allowed.
- **Yarn travel:** a pass may change its run only at the end where it finishes. A change at the end where it starts waits one pass, so the yarn never floats across new or stopping needles. Each shift is reported as a late start or an extra course on the affected needles. Those loops are one course from the exact net. Shifted loops outside the nominal net sit on the edge of their own face.

## Seams

For every cut crease, the report lists the loops on both seam sides. Each side is a start edge (first loops of its wales), an end edge (last loops), or a left or right side (course ends). Both sides are listed in the same physical order, from the crease end with the lower coordinate, so position along the seam can be compared. The counts often differ, for example passes on one side and needles on the other; no ratio or sewing order is implied. Each side also names the M4a seam side of every cut network edge on that crease, which links the knit report to the seam-map JSON.

## Network and combined modes

Every source cell, edge and node is placed on the net. Because the cut runs along network edges, no cell crosses it. A point on a cut crease or corner is placed on the side of the cell that uses it. Cut edges and their nodes therefore get one copy on each seam side, and both copies are drawn. Cell containment and mark widths use net positions and the uniform needle/pass grid. Pixel provenance keeps the source cell, edge and node IDs. The coarse-cell rule is not offered on a cut cube yet, because a coarse cell can cross the cut; such cells use the fill and an issue is reported. Typed network sizes are not used on the cube.

## Verification and limits

`tests/knit/cube-net.test.ts` covers:

- all 384 crease cuts: hinge continuity, cut separation, isometry, orientation, no overlap, unbroken rows and columns, and eleven distinct net shapes;
- rejection of face-interior and partial cuts;
- a cross-net layout with hand-checked face sizes, shifts and stops, and zero yarn jumps;
- each loop's single parent and new-loop roles;
- seam loop counts, and opposite M4a sides on the two seam sides;
- all four start edges;
- network cell coverage and both copies of every cut edge;
- refusal of stale cuts and typed sizes.

The browser test generates the cross-net shape and combined programs, reads the report and checks export.

There is no physical validation. Not checked or claimed:

- whether held loops are acceptable on the lab machine;
- what the new-loop and cast-off conventions are;
- whether a fold actually folds where it should;
- how the seams are best sewn or grafted.

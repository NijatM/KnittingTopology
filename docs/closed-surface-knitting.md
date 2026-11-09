# Closed-surface knitting: cube flat nets and spheres

A cube opened by a validated cut of whole crease lines is knitted from its exact flat net. A sphere opened by a validated cut that runs from pole to pole, descending at every point, is knitted with courses from pole to pole. Cube cuts through face interiors and other sphere cuts are not supported. Like every knit output here, the result is a design-level bitmap. It is not machine-ready and nothing is verified until knitted.

## Cube

### Why the cube is exact

All of a cube's curvature sits at its eight corners. A cut along seven whole creases forms a tree through all eight corners and puts every corner on the boundary. The six faces then unfold without stretching, by rotating about the five remaining creases. Every such cut gives one of the eleven cube nets. The unit tests enumerate all 384 seven-crease cuts that open the cube into one disk. They find no overlapping net, and every row and every column of each net is one unbroken run. This construction is the project's own. It is not taken from Popescu's thesis, and no planar development method is cited for it. For cut graphs in general, see [closed-surface cut preparation](closed-surface-cuts.md).

### Construction

1. The knit worker rebuilds the saved `knit.cut` with the M4a disk checks against the current network. A cut that belongs to a different surface or network is refused.
2. Every cut network edge must lie on a cube crease within `1e-8 × surface size`. Every network edge on a cut crease must be cut, and the cut lengths along each crease must add up to the edge length within `1e-6` relative. Exactly seven creases must be cut. Anything else gets a clear message and no output.
3. The faces are unfolded across the remaining hinges, breadth first from the face with the most hinges (lowest index on ties). Each face keeps its outward chart orientation and is only rotated, never mirrored. Tests check that hinge points coincide, that cut creases separate, that unit edges keep unit length, and that the six cells do not overlap, for all 384 cuts.
4. The start edge setting turns the net in 90° steps without mirroring. The bottom of the turned net is knitted first.
5. Each face is `ceil(L / stitch width)` needles wide and `round(L / course height)` passes tall, using the same counting rules as open-surface shaping. The report gives the difference from the face edge in both directions. Folds between hinged faces are knitted straight through, so the knit does not form the crease.
6. Each loop knits through the loop below it on the same needle. A needle that starts after pass 1 forms a new loop with the selected new-loop operation (knit, or tuck first). There are no sideways transfers, increases or decreases.

### Width changes

- **Wider:** new needles start new loops at the edge of the run.
- **Narrower:** needles stop while other needles keep knitting. Neither the colour key nor Knit Grammar has a cast-off operation, so none is drawn. The report and the Knit panel list each stop by its last pass and needle range, to be cast off in the lab software or held to the end. Knit Grammar's held-loop check can flag these needles. Export stays allowed.
- **Yarn travel:** a pass may change its run only at the end where it finishes. A change at the end where it starts waits one pass, so the yarn never floats across new or stopping needles. Each shift is reported as a late start or an extra course on the affected needles. Those loops are one course from the exact net. Shifted loops outside the nominal net sit on the edge of their own face.

### Seams

For every cut crease, the report lists the loops on both seam sides. Each side is a start edge (first loops of its wales), an end edge (last loops), or a left or right side (course ends). Both sides are listed in the same physical order, from the crease end with the lower coordinate, so position along the seam can be compared. The counts often differ, for example passes on one side and needles on the other; no ratio or sewing order is implied. Each side also names the M4a seam side of every cut network edge on that crease, which links the knit report to the seam-map JSON.

### Network and combined modes

Every source cell, edge and node is placed on the net. Because the cut runs along network edges, no cell crosses it. A point on a cut crease or corner is placed on the side of the cell that uses it. Cut edges and their nodes therefore get one copy on each seam side, and both copies are drawn. Cell containment and mark widths use net positions and the uniform needle/pass grid. Pixel provenance keeps the source cell, edge and node IDs. The coarse-cell rule is not offered on a cut cube yet, because a coarse cell can cross the cut; such cells use the fill and an issue is reported. Typed network sizes are not used on the cube.

## Sphere

This section describes the default full sphere. [Sphere openings and angular sectors](sphere-domains.md) documents the retained-domain controls, natural rim boundaries, fractional charts and their additional checks.

### Why pole-to-pole courses

A sphere cannot be flattened without stretching, so it has no exact net. Instead the needles run from pole to pole, and each needle knits one closed circle of latitude. The circles shrink towards the poles, so needles near a pole knit fewer loops. They skip short-row passes that the middle needles knit. This construction is the project's own. It is not taken from Popescu's thesis, and no published sphere knitting method is cited for it.

### Supported cut

1. The knit worker rebuilds the saved `knit.cut` with the M4a disk checks against the current network. A cut that belongs to a different surface or network is refused.
2. The cut must be one unbranched path of network edges. It runs from a highest network node to a lowest one, each within `1e-9 × surface size` of the top or bottom. Every edge sample must lie lower than the one before it, by more than `1e-12 × surface size`. Anything else gets a clear message and no output. The meridian preset prefers such a path.
3. The cut's longitude is interpolated linearly in latitude between its samples. If the cut ends short of a pole, its longitude is held constant from that end to the pole.

### Construction

1. The sphere is `N = ceil(half meridian / stitch width)` needles wide. Needle centres sit at `(j + ½) / N` of the meridian from the starting pole. With start side `v0`, needle 1 is at the bottom pole. With `v1`, it is at the top pole. The report gives the half meridian minus `N` stitch widths.
2. Each needle's loop target is its circle of latitude divided by the course height, rounded, and at least 2. The number of passes is the largest target.
3. **Short rows.** Passes alternate direction. Each half of the bed splits the passes into groups. One half is the needles up to the middle, the other the needles after it. A group begins with a pass that ends on that half, so it is one out-and-back pair. Every needle knits the first and last groups, which contain pass 1 and the last pass. Working outwards from the middle, each needle keeps some of the groups its inner neighbour knits, enough to match its target. A min-max dynamic program chooses them, keeping each loop as close as possible to its even place around the circle. Outer needles knit only passes their inner neighbours knit. So every pass is one unbroken run, and a run changes only at the end where its pass finishes. The yarn never floats across needles.
4. A needle that does not knit in a pass holds its loop, shown as a float in the bitmap. Each loop knits through the previous loop on the same needle. There are no sideways transfers, increases or decreases. Short-row turns add no wrap or tuck. This follows the open-surface convention and is still to be confirmed with the lab. Knit Grammar's held-loop check flags long holds, and export stays allowed.
5. Loop `m` of a needle sits on its circle at the fraction `(m + ½) / loops` of the way around from the cut. It runs westward from the cut with `v0` and eastward with `v1`. Neither start side mirrors the knit.

Computed on a straight meridian cut, with both first-pass directions (test values, not measured gauges):

| Diameter | Stitch width × course height | Needles × passes | Largest count error | Largest distance from even place | Longest hold |
| -------- | ---------------------------- | ---------------- | ------------------- | -------------------------------- | ------------ |
| 5 cm     | 6 × 4 mm                     | 14 × 39          | 1.23 loops          | 1.41 loops                       | 18 passes    |
| 10 cm    | 3.5 × 2.5 mm                 | 45 × 126         | 1.43 loops          | 2.43 loops                       | 122 passes   |
| 12 cm    | 6 × 4 mm                     | 32 × 94          | 1.38 loops          | 2.00 loops                       | 48 passes    |
| 18 cm    | 6 × 4 mm                     | 48 × 141         | 1.32 loops          | 2.35 loops                       | 80 passes    |
| 30 cm    | 5 × 3.5 mm                   | 95 × 269         | 1.39 loops          | 3.21 loops                       | 144 passes   |

The count error is the needle's loops minus its circle over the course height. The distance from the even place compares a loop's pass with its position around its own circle, in loops of that needle.

### Poles

Needle 1 and needle `N` are the pole edges. Their loops are left open, to be gathered closed. The colour key has no gather operation, so none is drawn. The report and the Knit panel list each pole needle with its loop count.

### Seam

The start side (pass 1, one loop per needle) meets the end side (the last pass, one loop per needle) along the cut. Both sides are listed in needle order. For every cut edge, the report names the needles whose circles start there. It also gives the M4a seam side on the start side and on the end side, which links the knit report to the seam-map JSON. No sewing order is implied.

Each circle starts at the cut. Where the cut strays from one meridian, the circle starts move with it, and so does the network placed on the knit. The report gives the cut's largest distance from a single meridian, measured along the circle of latitude.

### Network and combined modes

Every source cell, edge and node is placed in a chart of latitude and longitude measured from the cut. The chart repeats around the circle, so every shape is also tested one full turn either side. Cut edges and their nodes are drawn on both seam sides.

- **Pole cells.** A cell around a pole becomes a band, closed along the pole line. A pole on a cell outline becomes a segment of the pole line. A node on a pole marks every loop of the pole needle.
- **Edge arcs.** Network edges are great-circle arcs between their samples, and the chart bends them, most near a pole. Their chart outlines therefore get four points per sample interval. Cut edges keep their samples, which lie exactly on the seam line.
- **Marks.** Mark widths use each needle's own loop spacing: loops around its circle, and needles along the meridian.
- **Loops on an outline.** Rounding can make both neighbouring cells miss a loop that lies exactly on their shared outline. It then takes the cell with the nearest outline, and the report counts these loops.

The coarse-cell rule is not offered, and typed sizes are not used.

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

`tests/knit/sphere-knit.test.ts` covers:

- the meridian preset, accepted as one descending path on six network families at three spacings;
- rejection of branched, partial and level or climbing cuts;
- the short-row layout on the five sizes in the table, with both first-pass directions:
  - unbroken runs that change only at the finishing end, and zero yarn jumps;
  - every needle in the first and last passes, and nested passes;
  - counts within 1.5 loops, and loops within 2 to 3.5 loops of their even place;
- both start sides: single parents, pole sides, outward orientation, seam loops with opposite M4a sides, and the report;
- cell placement on six networks, checked against the 3D cell that holds each loop:
  - the networks include a node on a pole, a pole inside a cell and a pole on an edge;
  - every loop is in a cell, and any disagreement is within `1e-5 × sphere size` of an outline (largest seen: 0.4 µm);
- cut edges drawn on both seam sides, and a pole node marking its whole pole needle;
- chart round trips;
- refusal of typed sizes, net start sides and stale cuts.

The browser tests generate the cross-net cube and the sphere, in shape and combined modes, read the report and check export. The sphere test covers both start sides.

There is no physical validation. Not checked or claimed:

- whether held loops are acceptable on the lab machine, including the long holds near a sphere's poles;
- what the new-loop, short-row turn and cast-off conventions are;
- how a sphere's pole openings are best gathered;
- whether a fold actually folds where it should;
- how the seams are best sewn or grafted;
- the physical shape of any knit.

# Network patterns on open surface charts

Network and combined modes assign structures to a generated network on a plane, saddle or supplied rectangular OBJ chart. This mapping is a project method. The measured reference courses and loops adapt the stages in [Popescu (2019), §§5.2 and 6.2](https://doi.org/10.3929/ethz-b-000408640), with the [M2 construction and limits](knit-shaping.md).

## Modes and registration

With measured sizing, all three modes construct the same reference geometry from the fill structure's stitch width and course height (jersey measurement required; unmeasured fills are flagged as assumed). Reference loop IDs, original UV coordinates, needle/pass positions and network assignments remain the same when switching between network-only and combined modes. Other structure measurements are reported, but do not deform or recalibrate this shared layout.

- **Shape:** uniform fill on the reference loops, short-row holds outside them, shaping transfers and symbolic parent checks.
- **Shape and network:** network cell/edge/node assignments on those same loops, with the shaping operations and checks. Tucks, floats, bed changes or existing transfers can prevent the chosen structures from realizing the reference graph. Such results remain inspectable and block BMP/Knit Grammar JSON export.
- **Network:** unused reference bitmap positions receive the fill tile; reference shaping transfers are omitted. Reports give added cell count, maximum added passes per needle and that count times the reference course height. This arithmetic describes nominal added course-height accumulation, not physical shape error. Tile operations may themselves contain floats. There is no target-shape prediction.

Without measurements, network mode accepts explicit needles × passes on a normalized rectangular chart. These values describe pixels. Chart sampling does not imply equal surface distances, calibrated dimensions or a physical shape prediction. The existing typed plane layout is preserved. Shape and combined modes require measurements.

## Assignment method

Cell boundaries and coarse-cell rules operate in original chart UV coordinates, with node/edge identities retained. Supplied-chart edges use their canonical UV-straight paths rather than projecting 3D samples back to a potentially ambiguous chart location. Coincident 3D points do not merge chart identities. 3D-to-chart inspection queries can still be ambiguous on self-intersecting surfaces; no global 3D bijection is claimed.

For measured layouts, each reference loop uses a local frame: a sampled course tangent and a perpendicular tangent obtained from the chart's forward direction. Central/one-sided finite differences use a `1e-5` UV step for the surface Jacobian. Project UV offsets into that frame and divide the components by the fill stitch width and course height to obtain local loop coordinates. For typed layouts, use needle/pass-scaled rotated UV offsets directly.

Cell fill has lowest priority, followed by edge lines and then node marks. Edge distance and node squares use the local loop metric. Half-open bands use a `1e-9` loop-unit tie tolerance. The planar axis tests verify exact line widths and node square counts; curved-chart widths remain sampled local approximations, not geodesic guarantees. Discontinuous piecewise-affine derivatives and curvature limit their accuracy. These fields do not model textile mechanics.

A UV bucket index bounds candidate searches. Fifty million candidate visits is the work cap; exceeding it reports a failure and retains the prior result. Worker cancellation terminates computation. Input changes supersede jobs, and stale previews cannot export operation files.

## User structure tiles

The tile editor copies a built-in or saved structure, paints operations from the selected key and saves a **new** structure ID. Built-ins and saved tiles are not overwritten. This keeps measurements attached to the design they were entered for. New tiles have no inherited measurement; the normal jersey fallback remains explicit.

Each project can store at most 24 user tiles with sides of 1–16 cells. Rows use image order (last pass first), while the editor labels the bottom row pass 1. Resizing preserves needle-1/pass-1 anchoring. Project loading validates IDs, dimensions, row lengths and every operation against the key. An in-use or measured tile cannot be deleted through the editor; remove its references first. Save, assignment, deletion and measurement changes participate in project undo/redo. No Knit Grammar project import or custom colour-key editing is introduced.

The report records tile IDs and operation rows, assignment rules, measurement/fallback status, reference geometry, automatic transfers, conflicts and rectification counts. The exported BMP/JSON retain the exact Knit Grammar key RGB and file conventions. Files remain design-level inputs to lab software; machine instructions and physical knitting are unverified.

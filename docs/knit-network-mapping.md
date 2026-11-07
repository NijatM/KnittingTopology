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

Each project can store at most 24 user tiles with sides of 1–16 cells. Rows use image order (last pass first), while the editor labels the bottom row pass 1. Resizing preserves needle-1/pass-1 anchoring. Project loading validates IDs, dimensions, row lengths and every operation against the key. An in-use or measured tile cannot be deleted through the editor; remove its references first. Save, assignment, deletion and measurement changes participate in project undo/redo. Tiles made with a class key are also offered in custom copies of it (see colour keys below).

## Colour keys

The **Key** select offers the two 4.S52 class keys (one yarn guide; two yarn guides) and the project's custom keys. Switching keys keeps every assignment whose structure exists under the new key. Cell assignments that do not exist move to the new key's fill (the current fill if available, otherwise its first structure); edge lines and node marks that do not exist are switched off. The sidebar reports how many assignments changed, and project undo restores them.

The two-guide key works in network, shape and combined modes. A cell holds what both yarn guides do at that needle in the same pass. Short rows hold both yarns (both float), which is a lab rule still to confirm. The key has no transfer operation, so shaping that needs a transfer (decreases, interior shifts) stays unresolved and blocks BMP and Knit Grammar JSON export. With the "tuck" new-loop rule, a new loop uses the tuck pair with the same bed order. The symbolic parent check follows every bed on which a yarn guide knits or tucks, so double knit carries the loop chain on both beds. Automatic bed-change transfers stay one-guide only.

In the Knit tab, **Colour key** shows the operations of the selected key. Class keys are read-only. **Make a custom copy** creates an editable copy (id `custom-…`, name "my key (from …)"), as in Knit Grammar's key editor. **Read key from Knit Grammar JSON** reads the key of a `knit-grammar-pattern` file. A class key is refused as already available, an identical custom key is selected rather than duplicated, and a taken id gets a new one. In a custom key you can rename operations, change their colours and add operations built from knit/tuck/float, front/back and (one guide) a transfer to the other bed, left or right. With two guides, yarn guide 2 works the other bed. Each exact RGB must stay unique. Operations that a tile of the key or a current assignment uses cannot be removed, nor can the float that empty needles need; the editor names the users. A key that tiles were made with cannot be removed. Edits take part in project undo/redo. A project keeps at most 8 custom keys of at most 32 operations.

Program code finds operations by **meaning** (steps per yarn guide and transfer; a float has no bed), never by colour or class-key id. Built-in structures and tiles of another key of the same mode are rewritten to the key's operations. A structure whose meaning is missing is unavailable. An automatic transfer the key cannot express is skipped and listed. A shaping transfer or new-loop tuck it cannot express blocks export. Nothing is silently substituted. The BMP uses the key's RGB, the Knit Grammar JSON carries the key, and the report marks custom keys and gives each operation's meaning. Custom colours are the user's; the lab's script and importer remain to be confirmed.

## Comparing knit variants

**Compare** captures up to four variants for the session. A capture keeps the current knit program with the project: mode, key, needles × passes, loops per structure (measured, assumed = jersey, or not measured), transfers and skipped transfers, check findings, export blockers and unresolved shaping steps, and a bitmap in the key's exact RGB. A program that is out of date with the settings or network is not captured; the card says so. A shape program can be captured without a network. Each card is compared with variant 1. When needles × passes match, it counts the cells whose operations differ in meaning (steps per yarn guide and transfer), so a recoloured custom key counts as no difference. Different sizes are not compared cell by cell. A note says whether the captured programs share surface, network and measurements; when they do not, differences do not isolate the knit settings. Restore brings back the whole project, including knit settings, custom keys and measurements; the program is then regenerated. Captured programs are derived and are not saved in project files.

The report records tile IDs and operation rows, assignment rules, measurement/fallback status, reference geometry, automatic transfers, conflicts and rectification counts. The exported BMP/JSON retain the exact Knit Grammar key RGB and file conventions. Files remain design-level inputs to lab software; machine instructions and physical knitting are unverified.

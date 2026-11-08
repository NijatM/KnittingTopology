# Plane channel and pocket recipes

These optional presets follow the layer-connection principles in Popescu (2019), §5.5, printed pp. 90–91, Figs. 5.26–5.27. [Primary thesis record](https://doi.org/10.3929/ethz-b-000408640). The finite schedules, geometry rules and symbolic checks here are **project constructions**, not the thesis's native fonts. See the [full workflow comparison](popescu-workflow-audit.md).

## Set up and inspect

1. Choose a plane without computational patches. Use a two-guide key and a base program that knits once on each bed at every position: for example, the existing double-knit structures. Tucks, floats and transfers in the base are incompatible with this first increment. In Network mode, generate the topology first. Typed sizes are an unmeasured design grid; measured Shape mode uses only the swatches you supply.
2. Open **Knit → Channel and pocket recipes**. Choose **New rectangle**, or an existing channel/pocket region. Saving this form explicitly writes the shown axis-aligned rectangle and its assignment as one undoable change. Strokes are unsupported.
3. For a channel, choose the needle/course or pass/wale direction. Its two access ends must reach the opposite panel boundaries in that direction. For a pocket, choose one mouth: left, right, first-pass or last-pass side. It must reach that panel boundary; the other three sides are joined.
4. Set the rectangle's needle/pass bounds as percentages of the current program frame. **Set access edges to panel boundary** adjusts the indicated bounds visibly. The bounds are not measured channel dimensions. Set the join-band thickness from 1 to 16 grid positions (project limit). Bands lie inside the rectangle and must leave a clear body at least 2 needles × 2 passes (project limit).
5. Save, then **Generate knit program**. The previous program remains inspectable during generation. Changing an assignment or its zone makes the knit program stale. The topology and saved course/loop graph fingerprints are unchanged.
6. Choose **Recipe regions** in the bitmap's **Colour by** menu: blue body, amber joins, green boundary access, grey unchanged. The recipe panel lists checked counts and has separate **Show body**, **Show joins** and **Show access** controls. Selecting the zone also locates its outline on the surface. This is symbolic placement on the input surface; fabric shape is not simulated.

Assignments are opt-in: zones without them retain their intent-only behaviour. Deleting a zone removes its assignment in the same undoable change. Removing only the recipe leaves the zone intact. Different applied recipe footprints cannot overlap; other intent-only zones may overlap.

## Finite schedule

Call the two-guide assignments A = guide 1 on front / guide 2 on back, and B = guide 1 on back / guide 2 on front. Every position knits one stitch on each bed; no transfer, drop, added pass, cast-on or finishing operation is introduced.

- The clear body uses A, so each guide remains on one bed inside it.
- Each closed left/right side has a vertical band using B. Each guide therefore crosses beds between that band and the neighbouring A body on every body pass.
- Each closed first/last-pass side has a horizontal band alternating A and B along needles. This creates cross-bed yarn links throughout those linking courses, after the double-jersey connection principle in Fig. 5.26.
- Vertical bands take precedence at corners. Open access edges are the clear-body parts of the selected physical panel boundaries, excluding join-band corners.

The bands are inside the assigned rectangle. The rest of the bitmap is byte-identical to the base. All assignments are validated before applying changes; incompatible geometry or overlapping footprints do not produce a partly applied program. New symbol identities cannot inherit stale key-cell metadata or overwrite an existing symbol with a different meaning.

A pocket is accessible between the two layers at a panel boundary. There is no opening cut through either face. A region entirely inside joined fabric is not advertised as an accessible pocket. Physical cast-on/bind-off and finishing can affect that access and must be resolved in the lab.

## What is checked

The implementation first verifies an unpatched constant-width plane layout, a complete rectangular membership of loop centres, a compatible two-bed base, and real chart-boundary access. The rectangle/boundary comparison uses normalized-chart tolerance 1e-10, a project choice. A zone that merely includes the first grid cell while stopping short of the chart boundary is rejected.

The independent sequence check reads actual steps, not bitmap colours or cached success flags. It streams the live state per bed and needle and follows successive stitches of each guide, including pass turns. It checks:

- one live parent chain per needle and bed after the initial boundary;
- no cross-bed yarn links wholly inside the clear body;
- cross-bed links at every declared vertical band/body interface and throughout every horizontal linking course across the clear span;
- declared access cells on the physical grid boundary, with separate guide layers and no cross-bed closure across that access.

The executor and existing Shape parent checks remain in force. Synthetic tests remove joins, corrupt the body, reverse carriage direction and rotate the start edge. They are distinguishing symbolic checks, not knitting trials. A synthetic 600 × 600 panel is an isolated kernel/resource check and does not certify browser responsiveness at that size.

## Output and failure behaviour

The actual expanded `KnitSequence` is retained separately from its execution summary. Its JSON contains recipe clusters, fills, body/join/access provenance, the method identifier `guide-swap-bands-v1`, symbolic findings and blockers. Report TXT includes the same method qualification and counts. Structure assignments in the report are labelled as the base assignments before recipe overrides; hover text identifies recipe roles separately.

BMP and Knit Grammar JSON export require exact conversion of every symbol to the selected key, as well as the existing checks. The original class keys and RGB values remain unchanged. A custom two-guide key may lack the exchanged assignment: in that case conversion is refused, operation export is blocked, and sequence JSON remains available. Its expanded symbols are retained. The operation-colour preview is then explicitly labelled as the base bitmap; **Recipe regions** shows the intended recipe layout.

Missing zones, wrong zone kinds, nonrectangular regions, unsupported surfaces/patches/shaping, incompatible base actions, overlaps, too-small bodies or failed checks produce persistent repair messages. Invalid recipe assignments block operation exports, including individual pieces of an unsupported patched layout. Fix the controls and regenerate; export gates are not bypassed.

These checks establish properties of the stated symbolic construction. They do **not** establish an impermeable seam, usable channel/pocket dimensions, knittability, machine compatibility or achieved shape. No target-machine specifications, tensions or measured dimensions are inferred. Curved/shaped recipes, interior face openings, transfer/drop joins, arbitrary strokes and other feature families remain future work.

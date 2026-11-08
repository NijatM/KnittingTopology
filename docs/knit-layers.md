# Shared-reference two-layer checking

The optional `shared-reference-v1` model checks two logical fabric layers against the same geometric course/loop reference. It is available for two-guide Shape or combined programs on an unpatched plane, saddle or eligible rectangular OBJ chart. It does not add curved channel/pocket recipes or a transfer planner.

This is a project model. Popescu's thesis supplies the related course/loop and machine-translation workflow (§§6.2 and 6.4, [primary thesis record](https://doi.org/10.3929/ethz-b-000408640)); distinct sheet-qualified replay and the explicit phase checker below are independent project constructions. No native machine library is reproduced.

## Inspect a reference

1. Choose a supported surface, a two-guide key and Shape or Shape-and-network. Enter your own swatch measurements through the existing measurement controls.
2. In the Knit inspector, expand **Shared two-layer reference** and enable **Check shared two-layer reference**. The option is an undoable project setting. Generate explicitly to compute the check.
3. Read the counts of reference loops, logical layer loops and local parent matches. Filter **Inspect logical layer** to front, back or both. Point at a bitmap cell to inspect its target IDs, expected parents and actual incoming parents. Without a hovered reference cell, the first failed target or first target is shown.
4. Use **Show layer finding** to highlight reported cells. Both layers share the reference coordinates: these marks do not depict physical layer thickness or an offset surface.
5. Download **Layer graph JSON** for complete histories, findings, held loop locations and current program blockers. Report TXT includes the model and its limits. The graph remains downloadable when operation export is blocked.

Retain the project JSON alongside the diagnostic graph for the complete surface, measurements, settings and generation provenance. The layer-graph file is not a complete project snapshot.

The setting is saved as `knit.layerModel: 'shared-reference-v1'`; the derived graph is not saved inside the project. Enabling or disabling it changes knit-program freshness without changing the accepted topology or saved course/loop input fingerprints. Older projects without the option retain their prior behaviour and bitmap bytes.

Enabled unsupported inputs or failed histories block BMP and Knit Grammar JSON export. Turning this model off does not remove the other shaping, recipe or sequence blockers. In particular, the class two-guide key still has no shaping-transfer operation.

## Logical layer is not physical bed

Each reference loop has two target IDs, prefixed `front-layer:` and `back-layer:`. Their expected parents use the same prefix. They share reference coordinates, with positions in meters and chart coordinates in normalized UV. Artifact needle/pass indices are one-based; internal core indices are zero-based.

When a loop transfers from one bed to another, its ID and logical layer remain unchanged. The checker must not strip those prefixes before comparing parents. Two loops with the same geometric reference ID but different logical layers are distinct histories. A stack containing both retains both identities.

Replay reads the actual retained canonical sequence. It uses the existing program convention: all yarn-fed actions in a pass precede yarn-free departures, and arrivals become available after those departures. This does not interpret an arbitrary multi-step symbol as a fully scheduled native process. The graph records:

- expected and actual parent IDs for each target stitch;
- missing stitches, mismatched or wrong-layer arrivals, unsupported repeated bed actions and repeated parent consumption;
- reference ancestry defects and the final inventory of unconsumed loops;
- layer-qualified sideways transfer requests from the reference, without inventing a realization.

Local matches do not erase an earlier failed ancestor or a global finding. A source ID reused on the opposite sheet cannot pass merely because its unqualified geometric ID matches. The graph download preserves both expected and actual links so that ancestry can be traced.

## Explicit transfer-phase checker

`src/knit/transfer-phases.ts` provides `checkTransferPhases` for explicitly supplied analytic candidates. It has no authoring/import UI, does not search for schedules and does not change the application program. Its input declares a logical grid width, initial bed/needle occupancy, ordered phases, and optionally a final target occupancy. No spare positions beyond that grid are inferred.

Each phase has one racking and transfers whole stacks to the opposite bed. A front-bed offset `o` needs racking `o`; a back-bed offset `o` needs racking `−o`. These are project grid conventions, not machine calibration values. Sources must be distinct and nonempty, transfers must stay inside the grid, and no destination can be a source in the same phase. That last rule excludes a fictitious simultaneous exchange. A later phase sees the arrivals from earlier phases.

All operations in a phase are checked before it changes occupancy. A failed phase leaves the state reached by the preceding completed phases. An occupied destination can collect a stack; every loop ID and layer tag remains present. Moving that stack again moves all of it. The model supplies no selective unstacking operation.

For example, the following are **test values, not measured gauges or machine settings**. A declared three-position grid has one front-layer loop on front needle 1 and one back-layer loop on back needle 1, using the core API's zero-based indices. Needle0 is explicitly vacant in this test state. Both layers can reach needle 0 in their respective beds under the model:

| Phase | Whole stack moved | Project racking |
| ----- | ----------------- | --------------- |
| 1     | Front 1 → back 0  | −1              |
| 2     | Back 0 → front 0  | 0               |
| 3     | Back 1 → front 1  | 0               |
| 4     | Front 1 → back 0  | −1              |

This proves the stated symbolic occupancy transition under the declared rules. It does not prove that a particular knitting machine can execute it. No carrier motion, mechanical transfer collision envelope, take-down, finishing or safe native rack range is established by the example.

`structurallyValid` reports whether the declared phases satisfy the model. `targetMatches` separately compares the final loop identities, layers and locations with an optional explicit target. A well-formed phase sequence can preserve a mixed stack and still fail the intended target. `mixedStacks` exposes those cases; a mixed stack is not silently split or relabelled.

## Evidence and limits

Analytic tests distinguish a same-reference-ID bed swap from correct independent histories, missing and tucked stitches, invalid ancestry, held/turn references, unsupported enabled contexts, save/load/undo, worker transport and unchanged default bytes. Phase tests cover the two-sheet move, ordered arrivals, atomic failures, occupied destinations, held loops, wrong racking, boundary violations, duplicate sources/IDs, immutable inputs, targets and cancellation. Large synthetic stacks test identity retention without an argument-spreading limit; they are not a machine or maximum-input browser benchmark.

The [bounded selected-transition planner](knit-transfer-planning.md) now uses this checker to independently replay found candidates. It requires a valid actual prefix, targets the next pass's expected parent stacks, and restores unused held loops to their current final positions. Its phases stay separate from the program; a found analysis does not remove existing export blockers. Computational cutoffs are distinct from no-plan results under the declared model.

These checks do not certify knittability, native feasibility, achieved fabric shape or physical layer thickness. Independent front/back geometry, complete schedule planning/application, phase authoring/import, new workspace allocation and native bindings remain later work. Current plane-only feature recipes and their restrictions remain unchanged.

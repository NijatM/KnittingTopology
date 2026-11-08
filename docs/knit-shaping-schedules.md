# Whole-program shaping schedule analysis

The whole-program builder assembles a separate candidate schedule for a fresh, supported shared-reference two-layer Shape or combined program. It works on the unpatched plane, saddle or eligible rectangular OBJ chart. It preserves the source operations and their guide assignments and directions. It can add whole-stack transfer phases **between** source passes; it does not rewrite a source stitch, remove a drop, insert native machine symbols or change the current bitmap.

In **Knit → Shared two-layer reference**, enable the layer check and generate the current settings. Open **Build whole-program schedule** and choose **Build shaping schedule**. The computational limits are local analysis controls. They do not change project settings or generation freshness. Cancel terminates the worker. Changes to the source or limits cancel a running request, preserve an earlier result visibly marked as previous inputs, and prevent superseded results from replacing it.

## State carried through the schedule

The symbolic initial occupancy is empty. Source pass 1 creates the declared reference loops under the existing project model; this is not an executable cast-on. For each later pass:

1. Read the actual held-loop state produced by the preceding accepted operations.
2. Construct the next target from the retained source stitch actions and sheet-qualified reference parents. A knit must consume exactly its declared parent stack. A tuck consumes no parents, so its reference parent list must be empty; it can retain held loops at its slot while creating a new loop.
3. Keep every unused held loop at its current final bed and needle. It can move temporarily only if restored. A fixed-held conflict with a required knit slot is unsupported target preparation, not a no-plan proof.
4. Search for inter-pass phases on the existing logical width. Independently check any found phases and exact target, then carry their checked final occupancy into the unchanged source pass.
5. Replay the source pass. Accept it only if its stitches match the expected parents, its source operations are supported and its held-loop inventory is conserved according to the reference. Continue from that checked result.

Failed histories are never replaced with desired IDs. In particular, a builder cannot call the old source's failed prefix a valid new initial state. Original parent-history/export blockers are preserved as provenance: they do not themselves prevent analyzing a corrected, separate candidate, and a completed candidate does not remove them from the original program.

Logical layer belongs to the loop identity, independently of physical bed. Both sheets share the existing reference geometry; no thickness or independently shaped layer geometry is inferred. A whole stack cannot later be selectively split. The [selected-transition planner and phase model](knit-transfer-planning.md) document the search invariants and logical racking convention.

## Source convention and fresh replay

Source passes retain the current project convention: all yarn-fed actions run in original knitting direction, followed by yarn-free departures and simultaneous arrivals. This is not arbitrary native within-symbol chronology. Added phases use the stricter explicit phase checker: whole nonempty stacks, in-grid opposite-bed destinations, one project racking per phase, disjoint source/destination slots and ordered arrivals. Source yarn-free operations remain source operations; they are not silently removed or reinterpreted as added phases.

Added phases do not renumber source passes or flip their knitting directions. Event number, source knitting-pass number and added-phase count are separate quantities. No native carriage movement, carrier allocation, transfer collision envelope or rack range follows from them.

After assembly, the validator starts again from empty occupancy and reads only the source/reference and explicit events. It does not use the planner, target constructor, builder snapshots or claimed statistics. Assembly and validation share the declared source-pass semantic primitive and use the existing independent phase checker; analytic and tampered-event tests check those semantics. Completion requires every source pass in its original order, correct parent sets and the exact final inventory of unconsumed reference leaves. Retained final loops are not a cast-off or finishing procedure.

The builder stops at the first unresolved transition or incompatible source pass. Valid phases immediately before a refused source pass may remain in the retained prefix; the refused source pass is not counted as completed. The independent validator checks that prefix as incomplete. Preflight errors can leave no accepted events. A computational cutoff is distinct from a model-based unreachable target, unsupported preparation or invalid data. None establishes that a more expressive knitting process is physically impossible.

## Computational bounds

| Resource                                     |   Default | Maximum control value |
| -------------------------------------------- | --------: | --------------------: |
| Retained search records per transition       |     5,000 |                50,000 |
| Tested move probes per transition            |   100,000 |             1,000,000 |
| Added phase depth per transition             |        64 |                   256 |
| Tested move probes over the complete request | 1,000,000 |            10,000,000 |
| Added phases over the complete candidate     |     4,096 |                16,384 |

These positive-integer bounds limit project computation, not machine capacity. Aggregate remaining budgets constrain each search. A transition that already meets its target can still need zero phases and zero probes after a previous transition has used an aggregate budget. Resource cutoffs remain `limit`, with an incomplete candidate; no no-plan certificate is invented. The builder makes no shortest-plan or minimum native-pass claim. Maximum-input performance is not established by the small analytic/browser fixtures.

## Inspector and artifact

The inspector distinguishes complete validation from an incomplete prefix, reports the stop pass/needle and search reason, and can mark a current stop location in the linked bitmap. Stale results cannot use that repair action. The timeline pages through source-pass and transfer-phase events, keeping original pass directions visible. Existing operation exports remain governed by the original program's blockers.

**Shaping schedule JSON** writes `knit-shaping-schedule` version 1. It records source provenance/blockers, canonical operation tables and rows, original pass directions, sheet-qualified reference parents, ordered events, computational limits, transition outcomes and statistics, completion/stop information, independent replay findings and final occupancy. Empty slots are implicit. Needle/pass/event indices are one-based; relative offsets and project racking signs are unchanged. Symbol-table lookup indices remain zero-based. `complete: false` is explicit for incomplete files; `stale: true` identifies previous inputs.

This file is a separate analysis artifact. Keep the full project JSON for geometry, guide, material and calibration provenance. The candidate is not applied to the project, is not restored from project JSON and does not change the actual program's loop histories, bitmap or export permissions. The current two-guide key still cannot encode shaping transfers. Full native binding, cast-on/finishing, physical calibration and curved channel/pocket recipes remain later work.

## Provenance and evidence limits

Schedule assembly, target policy, independent replay, search heuristic and computational bounds are project constructions. Popescu's _KnitCrete_ thesis motivates the graph-to-operation workflow (§6.3, pp. 105–112; §6.4.1, pp. 113–115) and layer/feature constructions (§5.5, pp. 90–91). It does not supply this builder or establish the user's native machine profile. See [Popescu (2019)](https://doi.org/10.3929/ethz-b-000408640), the [workflow audit](popescu-workflow-audit.md) and the [verification record](verification.md) for executed checks.

Analytic geometry, grids and loops in tests are **test values, not measured gauges or machine specifications**. Fresh replay and parent conservation validate the declared symbolic model. They do not certify machine feasibility, knittability or achieved fabric shape; those require confirmed lab settings and physical specimens under defined support/loading conditions.

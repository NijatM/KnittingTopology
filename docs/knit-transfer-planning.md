# Bounded transfer planning for one transition

The selected-transition planner is an analysis tool for the current shared-reference two-layer model. It works on one transition before knitting pass 2 or later of a freshly generated, supported two-guide Shape or combined program. It searches a declared logical grid and independently checks any found candidate. It does not insert phases into the program or relax existing BMP/Knit Grammar export restrictions.

In **Knit → Shared two-layer reference**, enable the check and generate the current settings. Open **Plan one transfer transition**, select the knitting pass and choose **Plan selected transition**. Computational limits can be adjusted before another explicit run. Cancel stops the worker. The previous result stays visible, marked as previous inputs when the source or request changes. Planner controls do not change the project, knit settings, measurements or generation freshness. Analysis is local to the inspector and is not restored from project files.

## Initial state and complete target

The initial state is a deep copy of the actual retained sequence's held-loop occupancy just before the selected pass. It is not copied from the desired reference graph. All preceding stitches must have valid sheet-qualified parent histories, and the incoming inventory must match the reference loops not consumed before that pass. Missing preceding stitches, dropped prior leaves, invalid reference ancestry and other prefix defects prevent preparation. A later failed pass does not invalidate an otherwise valid earlier prefix; it remains a blocker on the source program.

Each next-pass target stitch requires its exact expected parent IDs on the corresponding target bed and needle. A target without parents requires that slot to be empty. Every other live loop must finish at its current bed and needle. Such held loops may move temporarily during the search if they are restored. No extra workspace is allocated beyond the program's declared width.

If a required next-pass slot contains an unused held loop that must remain there, these target rules conflict. This is an **unsupported target-construction request**, not proof that the geometry or a more general knitting process is impossible. Missing required live parents also prevent preparation. A different parking policy, different reference graph or more expressive operation model would be a separate design decision.

## Transfer model and search

The existing [explicit transfer-phase checker](knit-layers.md) defines the model: move a whole nonempty stack to an opposite-bed needle inside the grid, retain every loop identity and logical-layer tag, use one project racking per phase, and keep phase sources disjoint from destinations. Arrivals become available to the next phase. No operation selectively splits a stack.

The search uses one transfer per phase. Any valid phase containing several transfers can be serialized without changing reachability because none of its sources is a destination. This does not establish an optimal number of native carriage passes. Native transfer collisions, rack limits, yarn travel, take-down and loop-forming mechanics are outside this model.

Initial stacks are indivisible atoms. A canonical state records each atom's current bed/needle slot. When atoms share a slot, they move together thereafter. Two reachability invariants reduce the search:

- Different loop inventories or layer tags cannot be reconciled by transfers alone.
- An initial stack cannot reach different final slots for its members. Merging stacks with different final slots can never help a successful path because no later operation can separate them. Such merges are excluded; stacks with a common final slot can merge.

Every occupied stack is otherwise eligible to move, including a correctly placed held stack. All opposite-bed destination needles are considered. A deterministic priority queue orders states using path depth and a lower-bound distance estimate: zero moves if correct, at least one if on the opposite bed, and at least two if on the correct bed at a wrong needle. Within a common final-slot group, the maximum atom estimate is used; estimates are summed across final slots. The queue retains improved-depth versions for the same state. The planner makes no shortest-plan claim. Every accepted candidate is replayed separately by `checkTransferPhases`, which must report valid execution and an exact target match.

| Resource                                                                                       | Default | Maximum control value |
| ---------------------------------------------------------------------------------------------- | ------: | --------------------: |
| Retained state records, including earlier versions needed for reconstruction                   |   5,000 |                50,000 |
| Tested occupied-source/opposite-bed-destination probes, including rejected merges and revisits | 100,000 |             1,000,000 |
| Ordered single-transfer phase depth                                                            |      64 |                   256 |

These are project computational limits, not machine specifications. Values are positive integers. The declared grid retains the existing project width cap of 600; neither this cap nor a search result establishes the usable width of a physical machine.

## Outcomes and files

| Outcome       | Meaning                                                                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `found`       | A candidate passed independent phase replay and exact target comparison. Zero phases means the incoming state already meets this transition's target.            |
| `unreachable` | A stated invariant proves no transfer-only path, or the reachable finite state space was exhausted without resource/depth cutoffs, under this declared model.    |
| `limit`       | State, move or depth bounds cut off the search. This is not proof that no plan exists.                                                                           |
| `invalid`     | The supplied grid, pass, occupancy or other input is invalid, or a candidate failed independent replay. Malformed control values are highlighted before running. |
| `unsupported` | The enabled reference, valid incoming prefix or fixed-held target cannot be prepared under this scope.                                                           |

**Transfer plan JSON** writes a `knit-transfer-plan` version 1 analysis artifact, including source signature/revision/method, program blockers, selected pass and logical grid, complete occupied initial/target slots with loop IDs and layers, limits, outcome, phases, independent validation and search statistics. Omitted slots are empty. All artifact needle/pass indices and phase labels are one-based; relative offsets and project racking signs are unchanged. Internal APIs use zero-based needles. `stale: true` identifies an exported result for previous inputs. The source signature is a noncryptographic reproducibility hint; in-memory request/job identity guards reject superseded worker results.

The artifact is not a full project snapshot or native machine file. Keep the project JSON with it for full provenance. Candidate files do not replace the canonical sequence, update its parent histories or certify the source program. In particular, the existing two-guide key cannot express shaping transfers; a found analysis does not remove that restriction. Applying a verified plan, planning a complete sequence, native binding, independently shaped layers and curved channel/pocket recipes remain later work.

## Evidence and provenance

Analytic fixtures use **test values, not measured gauges or machine specifications**. They cover paired sheet relocation, temporary held-loop movement and restoration, stack merges and invariant failures, prefix errors, fixed-held conflicts, limits, cancellation, deterministic transformations, input immutability and one-based artifact replay. An independent breadth-first oracle exhaustively compares all 4,160 initial/target assignments of three distinct tokens across width-1 and width-2 two-bed grids, including initial stacks. Reachable targets are also tested at the oracle's minimum-depth bound. All found candidates pass the separate phase checker. This is tiny-grid evidence, not a maximum-size benchmark or a physical knitting trial.

The search, target policy, queue heuristic and computational bounds are project constructions. Popescu's thesis motivates separate reference graphs, two-layer features and machine-neutral operations, particularly §5.5 (pp. 90–91), §6.3.2 (pp. 111–112), and §6.4.1 (pp. 113–115). It does not supply this planner or a confirmed native library for the user's setup. See [Popescu (2019), _KnitCrete_](https://doi.org/10.3929/ethz-b-000408640) and the [workflow audit](popescu-workflow-audit.md). No new gauges, machine settings or material properties are inferred. Knittability and achieved shape require lab confirmation and physical validation.

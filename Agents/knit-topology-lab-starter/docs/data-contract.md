# Proposed data contract

This is a design specification to settle in the first implementation task. It is not an implemented API or a claim that all strategies already exist.

## Units and identity

Use meters for geometric lengths inside the core; convert at import/UI boundaries. Record input units, coordinate convention and geometry revision. Use stable IDs for graph entities; a raw array position is not a stable external identifier after an edit.

Surface: indexed positions and faces, revision, component/patch IDs, orientation and tagged boundaries. Algorithms state whether they require triangles, manifoldness or orientability. Invalid regions return explicit diagnostics.

Surface attachments: mesh revision, face ID and barycentric coordinates. A mesh change requires attachment transfer or invalidation. Rendering coordinates alone are insufficient.

## Fields

Every field stores `id`, `kind`, `domain`, `units`, `basis`, `surface_revision`, `values`, `parameters`, `algorithm_version`, `seed_if_used`, `origin` and uncertainty/confidence where meaningful.

Kinds include scalar, tangent-vector, tangent-line, cross-field, spacing-metric and mechanical-tensor. Distinguish density from spacing. State whether density is cells per area, curves per length or a normalized artistic weight. Mechanical tensors retain load case and constitutive-model identity.

Line fields identify opposite signs; course/wale labels must remain distinct when the topology needs them. Compare directions after transport into compatible tangent frames. A field may be undefined near singularities; do not replace that with arbitrary zero directions without a policy.

## Pattern graph

Nodes: stable identity, location/attachment and semantic labels. Edges: endpoints, surface path/embedding and edge meaning. Faces/cells: ordered boundary edges where applicable. Constraints: hard/soft type, region, weight, priority, origin and protected features. A geometric crossing does not automatically imply graph adjacency.

Layer/patch relations: separate layer identity, joins, opening loops, orientation and any intended enclosed regions. Pocket topology must identify the opening and the joined boundaries. Boundary manifoldness rules depend on whether inspecting each sheet or the assembled object.

Textile semantics are an optional additional representation: course/wale labels, loop relations, construction direction and unsupported topology. Do not call arbitrary mesh edges yarn paths. Machine operations and carrier schedules belong to a later IR/adapter.

## Strategy contract

Input: immutable surface, compatible fields, constraints, parameters, seed and optional source graph. Output: graph/topology changes, diagnostics, provenance and optional derived fields. Surface changes return a new revision. Strategies declare preconditions and output semantics.

Workers use `job_id`, `input_revision` and cancellation. Discard results from superseded revisions. Numerical tasks should not mutate the live UI's project in place.

## Project record

Store a schema version, source/derived geometry, graph, fields, constraints, edit history or replayable operations, seeds, algorithm versions, diagnostic definitions/results, claim references and import/export metadata. A migration must either preserve semantics or state what cannot be recovered.

Separate view state (camera, selected overlay) from scientific state (fields, geometry and parameters). Include essential scientific data in exported project JSON even if the UI currently hides the overlay.

# Verification and validation plan

These are proposed checks for the implementation. None has been executed against an application by this kit.

## First milestone

- Plane/saddle fixture has known units, connectivity and tagged boundaries.
- Strokes remain attached to the correct surface revision; edited geometry invalidates or transfers attachments.
- Direction and spacing change the generated graph in the specified manner.
- Undo restores graph identity/semantics, not just a visually similar render.
- Save/load preserves the graph, constraints, seed and units. A fresh session reproduces deterministic results within stated tolerance.
- A superseded worker result cannot overwrite newer edits; long calculations can be cancelled.
- Repository-subpath build loads assets and worker modules correctly.

## Numerical examples

Plane: curvature approaches zero; direction remains controllable when curvature directions are undefined.
Sphere: mean/Gaussian curvature checks use the chosen sign convention; principal directions are nonunique at equal curvatures.
Cylinder: one principal curvature approaches zero, the other's magnitude approaches inverse radius.
Saddle: chosen analytic parametrization provides a reference for sign and local behavior.
Refinement: compare at least two refinements when a numerical method's mesh dependence matters. Specify norms and tolerance from method behavior, not arbitrary cosmetic thresholds.
Coordinate invariance: rigid rotations/translations should not change intrinsic results; scaling changes dimensional quantities consistently.
Diffusion: test constant-field behavior for pure diffusion, specified boundary conditions, discretization/time-step stability and seed reproducibility for the implemented scheme.

## Graph and pocket cases

Check each intentional layer/patch and assembled relation, valid adjacency, expected connected components, ordered boundary loops, orientation, intended openings, and forbidden self-intersections. Include an invalid graph and confirm it is diagnosed. Euler characteristic is useful only with the applicable surface assumptions; it is not a universal knit-validity test.

## Mechanical work later

Start with a narrow analytic equilibrium benchmark. Record loads/supports, constitutive assumptions, strain regime, units and residual normalization. Assess mesh convergence and physical mechanisms. Strength, stability, buckling, creep and contact require relevant models and evidence; equilibrium alone is insufficient.

For material validation, use independent test cases held out from calibration. Keep material batch, construction, conditioning, boundary conditions, repeat count, uncertainty and loading history. Do not prescribe one universal repeat count or constitutive law for every knit.

## Agent evaluation

Compare providers on the same bounded tasks with the same evidence and artifacts: source accuracy, limitation detection, analytic geometry result, topology bug detection, implementation correctness, useful critique, time and cost. Include a task where “insufficient evidence” is the correct outcome. Independent evaluation should avoid giving the reviewer the desired conclusion.

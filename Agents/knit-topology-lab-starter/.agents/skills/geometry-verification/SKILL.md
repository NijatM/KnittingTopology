---
name: geometry-verification
description: Verify implemented surface geometry and topology algorithms using analytic cases, invariants, refinement and independent reference results.
---

Choose checks from the algorithm's mathematical claims. Use planes, spheres, cylinders and a specified saddle parametrization as appropriate; account for sign conventions and nonunique principal directions. Check units, coordinate transformations, degenerate input and intentional boundaries.

Use refinement/time-step studies when discretization error matters. State the error norm, tolerance and reference; do not choose a tolerance solely to pass the current implementation. Test graph connectivity and opening/layer semantics directly, not only screenshots. Check save/load and worker-revision behavior when the task touches them.

Report which checks actually ran, their results and unresolved limits. Separate numerical verification from physical material validation. Two agents agreeing or a smooth render is not a reference result.

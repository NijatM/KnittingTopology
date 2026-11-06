# Data contract v1

`src/core/types.ts` is the single shared compile-time interface. The core must not import browser/UI/Three.js code.

Lengths are meters; display and editable values are millimeters. Angles in parameters are degrees. Surface size is side length for plane/cube/saddle and diameter for sphere. Coordinates are right-handed, Z-up. A plane occupies XY with +Z normal. Surfaces are centered at the origin.

`SurfaceSpec.revision` changes when scientific geometry changes. Guide samples retain surface revision, analytic patch UV, and (when picked) triangle ID/barycentric coordinates. Existing guides/results are invalidated when the geometry changes; camera changes do not change scientific state.

Graph nodes/edges/cells have stable string IDs. Cell node order is oriented; edges retain adjacent cell IDs. Render-only crossings are not adjacency. Shared cube patch edges are canonical shared graph entities, not duplicate coincident nodes. Sphere uses a cubical atlas, sharing seams and reporting extraordinary vertices; this is our engineering extension, not a result of Oval et al.

The representation separates base surface, coarse patches/template choice, subdivision density, resulting graph, pattern transformation, and embedding. Keep source cell references in transformed cells. Pattern families are geometric networks, not yarns, loops, machine instructions, or mechanical tensors.

Core public modules (owned by numerical worker):

- `surfaces.ts`: `evaluateSurface(surface, patch, u, v): Vec3`, `projectToSurface(surface, position, patch?): { position: Vec3; attachment: SurfaceAttachment }`, `buildSurfaceMesh(surface, resolution?): SurfaceMesh`, plus documented analytic helpers.
- `generate.ts`: `generatePattern(input: GenerationInput, context?: GenerationContext): GenerationResult`. Preconditions and unsupported cases throw descriptive errors. Report progress; cancellation may throw a named `AbortError`. Root worker wrapper also terminates jobs to ensure cancellation.
- `diagnostics.ts`: graph validation/statistics callable independently for loaded or imported graphs.
- The core worker may add other modules and meaningful tests but does not edit `types.ts` without coordinator agreement.

Viewer public component (owned by viewer worker): `src/viewer/SurfaceViewer.tsx` default export. Props are defined in `src/viewer/types.ts`; all shared interface changes need coordinator approval. Controls for rotate/draw/select; surface display, graph, guides, overlays, node/cell selection, camera fit/presets, screenshot. No project history or app controls in the viewer.

Project JSON saves schema version, explicit surface/graph/guide state, parameters, units by schema, seeds, provenance, and numerical diagnostic definitions/results. Restore from validated bounded data; reject nonfinite/unsupported data. UI history snapshots preserve IDs and semantics. Camera/overlays stay outside scientific project state.

Workers carry request ID and input revision. The app accepts a result only if both match the current job/state. Old results remain visible during generation on unchanged geometry; stale result status is clearly visible. Failed/cancelled jobs preserve the previous accepted graph.

Scientific claims: topology validity, geometric quality, design intent, and physical validation remain distinct. Target spacing is a request; edge arc lengths and relative RMS error measure achieved geometric spacing. Quad strip consistency may require integer rounding. Record that deviation instead of promising uniformity.

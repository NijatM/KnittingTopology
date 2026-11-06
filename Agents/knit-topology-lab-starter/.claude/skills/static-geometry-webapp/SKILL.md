---
name: static-geometry-webapp
description: Build browser-based geometry editing features for a static GitHub Pages application with an independent numerical core.
---

Keep geometry algorithms independent of DOM, React and renderer-specific objects. Use explicit units, geometry revisions and versioned project serialization. Treat rendered geometry as a view, not the complete scientific state.

Run heavy calculations in cancellable workers; tag results with input revisions and reject stale results. Preserve undo and project round-trips across topology edits. Use surface-attached strokes rather than screen coordinates alone. Profile before adding WASM or GPU complexity.

Validate the production build under its repository subpath, including workers and imported assets, using current Vite/Pages documentation. Do not require a server or AI account for local pattern generation. Never put provider secrets in browser code; propose separate service architecture only if live AI becomes an explicit product requirement.

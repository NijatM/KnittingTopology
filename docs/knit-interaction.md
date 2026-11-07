# Knit generation requirements and recovery

The Knit controls show missing requirements in a persistent amber panel beside Generate. Selecting Generate while requirements are missing focuses the panel and does not start a knit worker. All known missing prerequisites are listed together, with a repair action for each. Text, an exclamation mark, borders and keyboard focus supplement the colour.

- **Jersey measurement:** Add jersey measurement opens the Knit inspector and the measurement form, then focuses the first missing dimension. Both dimensions have inline hints and invalid-field associations. Partial entries are retained while correcting the form. Only stitch width and course height are required; the other measurement fields are optional. Saving a required jersey measurement returns focus to any remaining requirements or the generation button.
- **Network:** Go to network generation focuses the network button. Open-surface Shape mode does not require a network; network and combined modes do, as do all closed-surface modes.
- **Cut:** Review cuts and seams focuses that section for a closed surface. Presence and source freshness are inexpensive prerequisite checks; they do not certify a cut. The numerical worker still checks disk topology and supported cube/sphere cut geometry.

Size appears before Generate. Network mode on an open surface offers an explicit typed-size alternative when measurements are missing. It creates an unmeasured network bitmap. Shape and combined modes retain their measurement requirement; the repair action does not change modes or enter assumed measurements.

After prerequisites are complete, the controls show Ready to generate. Generation stays explicit. A failed computation or worker reports a separate red Generation failed panel. It remains visible until retry or a change to the inputs that produced it. The prior accepted preview remains available on unchanged support; stale previews retain their export restrictions. Successful retry clears the failure. Cancellation and superseded results follow the existing worker lifecycle.

The interaction follows the linked-summary and inline-error approach described by the [GOV.UK error summary guidance](https://design-system.service.gov.uk/components/error-summary/) and [W3C error-identification guidance](https://www.w3.org/WAI/WCAG22/Understanding/error-identification). Automated keyboard-focus and field-association checks do not establish manual screen-reader coverage.

No project schema, measurement semantics or shaping algorithm changes are introduced by this interaction. Uncalibrated shaping remains separate future work.

## Course-first inspection

When a program is displayed, the target-surface inspection bar controls courses, topology and surface mesh independently. Computed courses are cyan; topology is dimmed when a course layout is available. Surface mesh starts hidden. Amber identifies the pointed course, selected geometry or start edge, and white identifies the pointed loop. The legend names each layer. Shaping marks initially show only selected or pointed operations; all marks or no marks can be selected explicitly. Turns are blue, increases/new edge loops green, and decreases gold. Hiding marks removes them from shape-marker picking as well as rendering. Layer choices are session display state and do not alter the project or downloaded operation colours.

Measured Network mode can contain a reference course layout even though it does not apply shaping. Its layer control and legend say **Reference courses**, and unapplied shaping markers are not drawn. A typed network bitmap has no computed courses. The base view is the input surface with assigned loop positions, not a simulation of the fabric's relaxed shape.

The **Knit interpretation** panel distinguishes pattern-only output, unresolved shaping, encoded shaping operations, and layouts with no shaping changes. It reports passes containing short-row turns, interior increases, new edge loops, decreases and required sideways moves separately from automatic bed-change transfers. Zero bed transfers does not imply that short rows are absent. Operation warning counts, method notes/limits and export blockers are separate; none certifies physical shape. The detailed method notes remain expandable below the summary.

Entered fill measurements, typed sizes and jersey fallback are labelled separately. An unmeasured structure using jersey dimensions is identified by name. Edge coverage reports the fraction of assigned positions coming from edge markings, excluding background and, for shaping output, held/outside positions. The majority-edge notice is an informational display cue at greater than 50%, not a geometric error bound or a fabrication criterion. Changing yarn-facing structures does not itself establish a target three-dimensional shape.

The inspection layer and interpretation panel introduce no numerical, operation-encoding, measurement or project-schema changes. Verifying that layer switches preserve BMP bytes establishes display independence, not physical accuracy. An exact project audit still requires the saved input project; physical validation requires the user's measured material and knit tests.

Canvas resize observers coalesce redraws into the next animation frame and cancel queued work on unmount. A direct window-error check covers repeated desktop/mobile transitions; ordinary console/page-error listeners alone did not expose the resize-observer delivery warning in development.

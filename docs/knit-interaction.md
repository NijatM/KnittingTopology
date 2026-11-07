# Knit generation requirements and recovery

The Knit controls show missing requirements in a persistent amber panel beside Generate. Selecting Generate while requirements are missing focuses the panel and does not start a knit worker. All known missing prerequisites are listed together, with a repair action for each. Text, an exclamation mark, borders and keyboard focus supplement the colour.

- **Jersey measurement:** Add jersey measurement opens the Knit inspector and the measurement form, then focuses the first missing dimension. Both dimensions have inline hints and invalid-field associations. Partial entries are retained while correcting the form. Only stitch width and course height are required; the other measurement fields are optional. Saving a required jersey measurement returns focus to any remaining requirements or the generation button.
- **Network:** Go to network generation focuses the network button. Open-surface Shape mode does not require a network; network and combined modes do, as do all closed-surface modes.
- **Cut:** Review cuts and seams focuses that section for a closed surface. Presence and source freshness are inexpensive prerequisite checks; they do not certify a cut. The numerical worker still checks disk topology and supported cube/sphere cut geometry.

Size appears before Generate. Network mode on an open surface offers an explicit typed-size alternative when measurements are missing. It creates an unmeasured network bitmap. Shape and combined modes retain their measurement requirement; the repair action does not change modes or enter assumed measurements.

After prerequisites are complete, the controls show Ready to generate. Generation stays explicit. A failed computation or worker reports a separate red Generation failed panel. It remains visible until retry or a change to the inputs that produced it. The prior accepted preview remains available on unchanged support; stale previews retain their export restrictions. Successful retry clears the failure. Cancellation and superseded results follow the existing worker lifecycle.

The interaction follows the linked-summary and inline-error approach described by the [GOV.UK error summary guidance](https://design-system.service.gov.uk/components/error-summary/) and [W3C error-identification guidance](https://www.w3.org/WAI/WCAG22/Understanding/error-identification). Automated keyboard-focus and field-association checks do not establish manual screen-reader coverage.

No project schema, measurement semantics or shaping algorithm changes are introduced by this interaction. Uncalibrated shaping remains separate future work.

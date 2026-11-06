// Plain-text report that travels with the bitmap: conventions, key, assignment, gauge status, transfers, checks
// and the lab rules still to confirm.
import type { KnitProgram } from './program';
import { rgbText } from './keys';

const pad = (s: string, n: number) => (s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length));
const mm = (m: number) => `${+(m * 1000).toFixed(3)} mm`;
const LIST_LIMIT = 200;

export function knitReport(p: KnitProgram, projectName: string, surfaceSize: number): string {
  const s = p.settings,
    k = p.key;
  const usage = new Map<number, number>();
  for (const v of p.cells) usage.set(v, (usage.get(v) ?? 0) + 1);
  const rule = s.cells.rule;
  const ruleText =
    rule.kind === 'uniform'
      ? 'uniform'
      : rule.kind === 'sides'
        ? `by side count (${Object.entries(rule.bySides)
            .map(([n, id]) => `${n}: ${id}`)
            .join(', ')})`
        : `${rule.kind} (${rule.palette.join(', ')})`;
  const jersey = p.sizeGauge;
  const lines = [
    `Knit program: ${projectName}`,
    'Design-level knit program in the Knit Grammar convention, made with Knitting Topology. Final operations and machine code are assigned in the lab software. Not machine-ready; not verified until knitted.',
    '',
    `${p.w} needles x ${p.h} passes, ${k.mode === 2 ? 'two yarn guides' : 'one yarn guide'}, pass 1 knits ${p.firstDir === 1 ? 'left to right' : 'right to left'}; passes alternate.`,
    'One pixel = one needle in one pass. The bottom row of the BMP is pass 1; needle 1 is the left column.',
    p.shape && jersey
      ? `Shape size from ${jersey.assumed ? 'assumed = jersey' : `the ${jersey.measuredOn} measurement`} (${mm(jersey.stitchWidth)} stitch width, ${mm(jersey.courseHeight)} course height). Surface maximum extent/size: ${mm(surfaceSize)}.`
      : p.sizeSource === 'gauge' && jersey
        ? `Size from the jersey measurement (${mm(jersey.stitchWidth)} per needle, ${mm(jersey.courseHeight)} per pass) over the ${mm(surfaceSize)} plane.`
        : 'Size typed by the user; it is not derived from a measurement.',
    `Mapping: ${p.mapping.method}.`,
    ...(p.rectification
      ? [
          `Network-only reference layout: ${p.rectification.addedCells} filled cells; maximum ${p.rectification.maxAddedPasses} added passes per needle, ${mm(p.rectification.maxAddedCourseLengthM)} nominal course-height accumulation. Shaping transfers are not applied. This is not physical shape error or a shape prediction.`,
        ]
      : []),
    ...(p.shape
      ? [
          'Source: Mariana Adriana Popescu (2019), KnitCrete, sections 5.2 and 6.2. https://doi.org/10.3929/ethz-b-000408640',
          'Course and loop stages adapted from the thesis. Distance source, monotone alignment, needle placement and operation checks are independent project methods; not a full reproduction.',
          'Symbolic parent-loop checks are not a machine simulation or physical validation.',
          `Start edge: ${s.startEdge ?? 'v0'}; chart grid: ${p.shape.geometry.resolution} intervals per side.`,
          `Courses: ${p.shape.geometry.courses.length}; contour rounding max abs: ${mm(Math.max(0, ...p.shape.geometry.contourRounding.map(Math.abs)))}; course rounding max abs: ${mm(Math.max(0, ...p.shape.geometry.courseRounding.map(Math.abs)))}.`,
          `Maximum alignment offset: ${p.shape.geometry.maxLinkOffset.toFixed(6)} measured course heights. No certified distance-field error bound.`,
          `${p.rectification ? 'Reference shaping (not applied)' : 'Shaping'}: ${p.shape.needles.steps.filter((x) => x.role === 'turn').length} turn endpoints, ${p.shape.needles.steps.filter((x) => x.role === 'increase').length} interior increases, ${p.shape.needles.steps.filter((x) => x.role === 'edge increase').length} edge increases, ${p.shape.needles.steps.filter((x) => x.role === 'decrease').length} decreases.`,
          `${p.rectification ? 'Reference sideways transfers (not applied)' : 'Required sideways transfers'}: ${p.shape.needles.moves.length}; unresolved shaping steps: ${p.shape.needles.unresolved.length}; yarn jumps: ${p.shape.needles.yarnJumps}.`,
          ...p.shape.needles.steps
            .slice(0, LIST_LIMIT)
            .map(
              (x) =>
                `  pass ${x.pass}, needle ${x.needle + 1}: ${x.role}${x.reason ? ` (${x.reason})` : ''}`
            ),
          ...p.shape.needles.moves
            .slice(0, LIST_LIMIT)
            .map(
              (x) =>
                `  transfer after pass ${x.pass}, needle ${x.needle + 1} -> ${x.to + 1}, for pass ${x.forPass}`
            ),
        ]
      : []),
    p.exportBlockers.length
      ? `Operation-file export BLOCKED: ${p.exportBlockers.length} unresolved issues.`
      : 'No operation-file export blockers detected; this does not certify knittability.',
    ...p.exportBlockers.slice(0, LIST_LIMIT).map((x) => `  ${x}`),
    ...(p.staleNetwork
      ? ['The network was generated from earlier inputs; regenerate to match the current settings.']
      : []),
    '',
    'Assignment',
    ...(s.mode === 'shape'
      ? [
          `  shape fill: ${s.cells.fill}; network cell rules, overrides, edges and node marks are not applied.`,
        ]
      : [
          `  cells: ${s.cells.fill} fill, rule ${ruleText}, ${Object.keys(s.cells.overrides).length} manual overrides`,
          `  edge lines: ${s.edges.structure ? `${s.edges.structure}, ${s.edges.width} loops wide, boundary ${s.edges.boundary ? 'included' : 'excluded'}` : 'none'}`,
          `  node marks: ${s.nodes.structure ? `${s.nodes.structure}, ${s.nodes.size} x ${s.nodes.size} loops` : 'none'}; extraordinary nodes: ${s.nodes.extraordinary ?? 'as other nodes'}`,
        ]),
    ...(s.tiles?.length
      ? [
          'User structure tiles',
          ...s.tiles.map(
            (t) =>
              `  ${t.id}: ${t.name}, ${t.w} x ${t.h}, ${t.keyId}; rows top (last pass) first: ${t.rows.map((r) => r.join(' ')).join(' / ')}`
          ),
        ]
      : []),
    '',
    'Structures',
    pad('  id', 14) + pad('loops', 9) + 'gauge',
    ...p.structures.map(
      (x) =>
        pad(`  ${x.id}`, 14) +
        pad(String(x.loops), 9) +
        (!x.gauge
          ? 'no measurement'
          : x.gauge.assumed
            ? 'assumed = jersey (not measured)'
            : `measured: ${mm(x.gauge.stitchWidth)} x ${mm(x.gauge.courseHeight)}`)
    ),
    '',
    `Automatic transfers: ${s.autoTransfers ? `on, ${p.transfers.length} inserted or dropped` : 'off'}`,
    ...p.transfers
      .slice(0, LIST_LIMIT)
      .map(
        (t) =>
          `  needle ${t.needle + 1}, pass ${t.pass + 1}: ${t.from} -> ${t.to} (knits the other bed at pass ${t.forPass + 1})`
      ),
    ...(p.transfers.length > LIST_LIMIT ? [`  ... ${p.transfers.length - LIST_LIMIT} more`] : []),
    ...(p.skippedTransfers.length
      ? [
          `Bed changes left as they are: ${p.skippedTransfers.length}`,
          ...p.skippedTransfers
            .slice(0, LIST_LIMIT)
            .map((t) => `  needle ${t.needle + 1}, pass ${t.pass + 1}: ${t.reason}`),
        ]
      : []),
    '',
    `Checks (warnings; limits float ${s.limits.float}, held ${s.limits.held}, tucks ${s.limits.tucks}). They do not certify knittability.`,
    ...(p.findings.length ? p.findings.map((f) => `  - ${f.title}: ${f.text}`) : ['  none']),
    ...(p.issues.length ? ['', 'Notes', ...p.issues.map((t) => `  - ${t}`)] : []),
    '',
    'Lab rules to confirm',
    `  first pass: ${s.lab.firstPass}`,
    `  transfer timing: ${s.lab.transferTiming}`,
    `  yarn guide travel: ${s.lab.travel}`,
    ...(p.shape
      ? [`  new loop: ${s.newLoop ?? 'knit'} first`, '  short-row turns: no wrap or tuck added']
      : []),
    '',
    `Key: ${k.name}`,
    ...(k.credit ? [k.credit] : []),
    ...(k.notes ?? []).map((t) => `- ${t}`),
    '',
    pad('colour', 16) + pad('RGB', 18) + pad('cells', 8) + 'operation',
    ...k.ops.map(
      (o, i) =>
        pad(o.colour, 16) +
        pad(rgbText(o.rgb), 18) +
        pad(String(usage.get(i) ?? 0), 8) +
        o.name +
        (o.provisional ? ' (provisional)' : '')
    ),
  ];
  return lines.join('\n') + '\n';
}

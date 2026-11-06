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
    p.sizeSource === 'gauge' && jersey
      ? `Size from the jersey measurement (${mm(jersey.stitchWidth)} per needle, ${mm(jersey.courseHeight)} per pass) over the ${mm(surfaceSize)} plane.`
      : 'Size typed by the user; it is not derived from a measurement.',
    `Mapping: ${p.mapping.method}.`,
    ...(p.staleNetwork
      ? ['The network was generated from earlier inputs; regenerate to match the current settings.']
      : []),
    '',
    'Assignment',
    `  cells: ${s.cells.fill} fill, rule ${ruleText}, ${Object.keys(s.cells.overrides).length} manual overrides`,
    `  edge lines: ${s.edges.structure ? `${s.edges.structure}, ${s.edges.width} loops wide, boundary ${s.edges.boundary ? 'included' : 'excluded'}` : 'none'}`,
    `  node marks: ${s.nodes.structure ? `${s.nodes.structure}, ${s.nodes.size} x ${s.nodes.size} loops` : 'none'}; extraordinary nodes: ${s.nodes.extraordinary ?? 'as other nodes'}`,
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

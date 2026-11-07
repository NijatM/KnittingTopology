// Plain-text report that travels with the bitmap: conventions, key, assignment, gauge status, transfers, checks
// and the lab rules still to confirm.
import type { KnitProgram } from './program';
import { keyById, meaningName, rgbText } from './keys';
import { creaseLabel, faceLabel, type CubeNetLayout } from './cube-net';
import type { SphereKnitLayout } from './sphere-knit';

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
    ...(p.shape?.closed ? closedLines(p.shape.closed, p) : []),
    ...(p.shape?.sphere ? sphereLines(p.shape.sphere, p) : []),
    ...(p.shape && !p.shape.closed && !p.shape.sphere
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
      ? [
          `  new loop: ${s.newLoop ?? 'knit'} first`,
          '  short-row turns: no wrap or tuck added',
          ...(k.mode === 2 ? ['  two yarn guides: both yarns held on short rows'] : []),
        ]
      : []),
    '',
    `Key: ${k.name}${keyById(k.id) ? '' : ' (custom; operations matched by meaning)'}`,
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
        (keyById(k.id) ? '' : ` [${meaningName(o.steps, o.move)}]`) +
        (o.provisional ? ' (provisional)' : '')
    ),
  ];
  return lines.join('\n') + '\n';
}

function closedLines(c: CubeNetLayout, p: KnitProgram): string[] {
  const n = p.shape!.needles,
    fresh = n.placements.filter((x) => x.course > 0 && !x.parents.length).length;
  const ends = (loops: CubeNetLayout['seams'][0]['sides'][0]['loops']) =>
    loops.length
      ? `needle ${loops[0]!.needle + 1}, pass ${loops[0]!.course + 1} -> needle ${loops.at(-1)!.needle + 1}, pass ${loops.at(-1)!.course + 1}`
      : 'no loops';
  return [
    'Flat cube net (closed surface): the validated cut of seven whole creases is unfolded exactly into a planar net. Folds between the remaining hinged faces are knitted straight through; the knit does not form the crease. Project construction, not taken from the thesis; no physical shape prediction.',
    `Cut creases: ${c.net.cutCreases.map(creaseLabel).join(', ')}. Kept folds: ${c.net.hinges.map(creaseLabel).join(', ')}.`,
    `Net: ${c.net.cols} x ${c.net.rows} faces, start side ${p.settings.startEdge ?? 'v0'}. Each face is ${c.needlesPerFace} needles x ${c.passesPerFace} passes; face edge minus knitted size: ${mm(c.widthRounding)} across, ${mm(c.heightRounding)} along the wales.`,
    `New loops where a needle starts after pass 1: ${fresh} (${p.settings.newLoop === 'tuck' ? 'tuck first' : 'knit'}). Sideways transfers: ${n.moves.length}. Yarn jumps: ${n.yarnJumps}.`,
    c.stops.length
      ? 'Needles that stop while other needles keep knitting. The colour key has no cast-off: cast off here in the lab software, or hold the loops to the end.'
      : 'No needles stop before the last pass.',
    ...c.stops.map((x) => `  last loops in pass ${x.pass}, needles ${x.from + 1}-${x.to + 1}`),
    ...(c.shifts.length
      ? ['Run changes moved by one pass so the yarn does not float across needles:']
      : []),
    ...c.shifts.map(
      (x) =>
        `  pass ${x.pass}, needles ${x.from + 1}-${x.to + 1}: ${x.kind === 'late start' ? 'start one pass late' : 'one extra course'}`
    ),
    'Seams: loops on both sides of every cut crease, each listed from the crease end with the lower coordinate. The two counts can differ; no sewing order is implied.',
    ...c.seams.flatMap((seam) => [
      `  ${creaseLabel(seam.crease)} (${seam.sourceEdgeIds.length} cut network edges)`,
      ...seam.sides.map(
        (side) =>
          `    ${faceLabel(side.face)} ${side.kind}: ${side.loops.length} loops, ${ends(side.loops)}${side.shifted ? `; ${side.shifted} ${side.kind === 'start' || side.kind === 'end' ? 'one pass from the net edge' : 'missing after a one-pass shift'}` : ''}`
      ),
    ]),
  ];
}

function sphereLines(c: SphereKnitLayout, p: KnitProgram): string[] {
  const n = p.shape!.needles,
    courses = p.shape!.geometry.courses,
    early = courses.filter((x) => x.turnStart || x.turnEnd),
    side = (i: 0 | 1) => {
      const x = c.seam.sides[i],
        pass = x.loops[0] ? x.loops[0].course + 1 : 0;
      return `  ${x.kind} side: pass ${pass}, ${x.loops.length} loops, needles 1-${c.needles}`;
    };
  return [
    'Sphere opened from pole to pole (closed surface): courses run from pole to pole along the validated cut, so each needle knits one circle of latitude starting at the cut. Shorter circles skip out-and-back short rows, spread evenly around the circle. Project construction, not taken from the thesis; no physical shape prediction.',
    `Needle 1 is at the ${c.poles[0]!.pole} pole (start side ${c.start}). ${c.needles} needles x ${c.passes} passes; half meridian minus knitted width: ${mm(c.widthRounding)}.`,
    `Loops per needle (needle 1 first): ${c.counts.join(', ')}.`,
    `Largest difference from circle / course height: ${c.maxCountError.toFixed(2)} loops. Largest distance of a loop from its even place around its circle: ${c.maxCourseDeviation.toFixed(2)} loops.`,
    `Short rows: ${c.turns} passes turn before the end of the bed; turns add no wrap or tuck (confirm with the lab). A needle holds its loop for up to ${c.maxHeld} passes. Sideways transfers: ${n.moves.length}. Yarn jumps: ${n.yarnJumps}.`,
    'Pole openings, to be gathered closed. The colour key has no gather operation, so none is drawn.',
    ...c.poles.map((x) => `  needle ${x.needle + 1} at the ${x.pole} pole: ${x.loops} loops`),
    `Each circle starts at the cut, which strays up to ${mm(c.cutWander)} from a single meridian.`,
    'Seam: pass 1 loops (start side) meet the last-pass loops (end side) along the cut, needle by needle. No sewing order is implied.',
    side(0),
    side(1),
    `  cut network edges, top to bottom, with the needles whose circles start there and the M4a seam side on the start/end side:`,
    ...c.seam.edges
      .slice(0, LIST_LIMIT)
      .map(
        (x) =>
          `    ${x.id}: ${x.needles ? `needles ${x.needles[0] + 1}-${x.needles[1] + 1}` : 'no needle'}; sides ${c.seam.sides[0].cutSides[x.id] ?? '-'}/${c.seam.sides[1].cutSides[x.id] ?? '-'}`
      ),
    'Passes that turn before the end of the bed, with the needles they knit:',
    ...early.slice(0, LIST_LIMIT).map((x) => {
      const l = x.loops.length ? Math.round(x.extent[0] / p.shape!.geometry.stitchWidth) : 0;
      return `  pass ${x.index + 1}: needles ${l + 1}-${l + x.loops.length}`;
    }),
    ...(early.length > LIST_LIMIT ? [`  … ${early.length - LIST_LIMIT} more`] : []),
  ];
}

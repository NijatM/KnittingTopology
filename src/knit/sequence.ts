// Operation sequences (Popescu 2019, §6.4.1, pp. 113–114; Fig. 6.18; Fig. 7.34g–k): the carriage passes in knitting
// order, machine-neutral. Each needle in a pass has a symbol, an ordered list of steps: yarn-fed (knit or tuck by a
// yarn guide on a bed) and yarn-free (transfers straight across or diagonal, the class key's same-bed moves, drops).
// Clusters of symbols can be repeated over cells. The class-key bitmap converts to a sequence without loss; a sequence
// converts back only when the key has an operation for every symbol. The executor follows a sequence symbolically:
// it is not a machine simulation.
import { findOp, otherBed, type Bed, type Key, type Move, type Step } from './keys';
import { UNKNOWN, imageIndex, type KnitCells } from './grid';

export const SEQUENCE_FORMAT = 'knit-sequence';

export type SeqStep =
  | { kind: 'knit' | 'tuck'; guide: number; bed: Bed }
  /** To the other bed, `offset` needles along it (0 = straight across). */
  | { kind: 'transfer'; bed: Bed; offset: number }
  /** The class key's simplified same-bed move, one needle left (−1) or right (1). */
  | { kind: 'move'; bed: Bed; offset: -1 | 1 }
  | { kind: 'drop'; bed: Bed };

export interface SeqSymbol {
  id: string;
  steps: SeqStep[];
  /** Id of the key operation the symbol was converted from. */
  op?: string;
  /** The program cell value it was converted from (keeps the exact operation, even among same-meaning colours). */
  cell?: number;
}
/** A block of symbols, row 0 = its first pass; `symbols` are indices into the sequence's symbols, row-major. */
export interface SeqCluster {
  id: string;
  w: number;
  h: number;
  symbols: number[];
}
export interface SeqFill {
  cluster: string;
  /** 0-based needle and pass where the cluster's first symbol sits. */
  anchor: [number, number];
  cells: number;
}
export interface KnitSequence {
  w: number;
  h: number;
  guides: number;
  /** Pass 1 runs left to right (1) or right to left (−1); passes alternate. */
  firstDir: 1 | -1;
  /** The key the symbols were converted from. */
  keyId?: string;
  symbols: SeqSymbol[];
  /** Symbol index per needle and pass: rows[k * w + j] (0-based pass k, needle j). */
  rows: Uint16Array;
  clusters: SeqCluster[];
  fills: SeqFill[];
}

const yarnFed = (s: SeqStep): s is Extract<SeqStep, { guide: number }> =>
  s.kind === 'knit' || s.kind === 'tuck';
export const passDir = (firstDir: 1 | -1, k: number): 1 | -1 =>
  (k % 2 ? -firstDir : firstDir) as 1 | -1;

// ---------------------------------------------------------------- symbols

const side = (o: number) => (o < 0 ? 'left' : 'right');
function stepText(s: SeqStep): string {
  switch (s.kind) {
    case 'knit':
    case 'tuck':
      return `yarn guide ${s.guide} ${s.kind} ${s.bed}`;
    case 'transfer':
      return `transfer ${s.bed} to ${otherBed(s.bed)}${
        s.offset
          ? `, ${Math.abs(s.offset)} needle${Math.abs(s.offset) === 1 ? '' : 's'} ${side(s.offset)}`
          : ''
      }`;
    case 'move':
      return `move ${s.bed} ${side(s.offset)}`;
    case 'drop':
      return `drop ${s.bed}`;
  }
}
/** "yarn guide 1 knit front, then transfer front to back"; "miss" when nothing happens. */
export const symbolText = (s: Pick<SeqSymbol, 'steps'>) =>
  s.steps.length ? s.steps.map(stepText).join(', then ') : 'miss';

/** Why a symbol is not valid for `guides` yarn guides (project rules), or null. */
export function symbolProblem(s: Pick<SeqSymbol, 'steps'>, guides: number): string | null {
  let free = false;
  const beds = new Set<Bed>();
  for (const step of s.steps) {
    if (yarnFed(step)) {
      if (free) return 'yarn-fed steps must come before yarn-free steps.';
      if (!Number.isInteger(step.guide) || step.guide < 1 || step.guide > guides)
        return `the yarn guide must be 1 to ${guides}.`;
      if (beds.has(step.bed)) return 'a symbol has at most one yarn-fed step per bed.';
      beds.add(step.bed);
    } else {
      free = true;
      if (step.kind === 'transfer' && !Number.isInteger(step.offset))
        return 'a transfer offset must be a whole number of needles.';
      if (step.kind === 'move' && step.offset !== -1 && step.offset !== 1)
        return 'a move goes one needle left or right.';
    }
  }
  return null;
}

/** One symbol per key operation, same order: the operation's steps, then its transfer. */
export function keySymbols(key: Key): SeqSymbol[] {
  return key.ops.map((op, i) => {
    const steps: SeqStep[] = [];
    op.steps.forEach((s, g) => {
      if (s.action !== 'float') steps.push({ kind: s.action, guide: g + 1, bed: s.bed });
    });
    // The transfer starts on the bed of the stitch; a transfer-only operation keeps the bed its float records.
    const bed = op.steps.find((s) => s.action !== 'float')?.bed ?? op.steps[0]!.bed;
    if (op.move === 'across') steps.push({ kind: 'transfer', bed, offset: 0 });
    else if (op.move !== 'none')
      steps.push({ kind: 'move', bed, offset: op.move === 'left' ? -1 : 1 });
    return { id: op.id, steps, op: op.id, cell: i };
  });
}

// ---------------------------------------------------------------- conversion

/** The program's cells as a sequence; each cell keeps its key operation. */
export function programSequence(p: KnitCells & { firstDir: 1 | -1 }): KnitSequence {
  const { w, h, cells, key } = p,
    symbols = keySymbols(key),
    unknown = new Map<number, number>(),
    rows = new Uint16Array(w * h);
  for (let k = 0; k < h; k++)
    for (let j = 0; j < w; j++) {
      const v = cells[imageIndex(w, h, j, k)]!;
      let s = v;
      if (v >= key.ops.length) {
        // Colours outside the key (never produced here) keep their value and do nothing.
        if (!unknown.has(v)) {
          unknown.set(v, symbols.length);
          symbols.push({ id: `colour-${v}`, steps: [], cell: v });
        }
        s = unknown.get(v)!;
      }
      rows[k * w + j] = s;
    }
  return {
    w,
    h,
    guides: key.mode,
    firstDir: p.firstDir,
    keyId: key.id,
    symbols,
    rows,
    clusters: [],
    fills: [],
  };
}

/** The key operation with a symbol's meaning, or -1 when the class key cannot say it. */
function opFor(s: SeqSymbol, key: Key): number {
  const steps: Step[] = Array.from({ length: key.mode }, () => ({ action: 'float', bed: 'front' }));
  let move: Move = 'none',
    stitchBed: Bed | undefined;
  const fed = s.steps.filter(yarnFed),
    free = s.steps.filter((x) => !yarnFed(x));
  for (const x of fed) {
    if (x.guide > key.mode || steps[x.guide - 1]!.action !== 'float') return -1;
    steps[x.guide - 1] = { action: x.kind as 'knit' | 'tuck', bed: x.bed };
  }
  if (fed.length) stitchBed = fed[0]!.bed;
  if (free.length > 1) return -1;
  const x = free[0];
  if (x) {
    if (x.kind === 'drop' || (x.kind === 'transfer' && x.offset !== 0)) return -1;
    if (stitchBed ? x.bed !== stitchBed || fed.length > 1 : key.mode !== 1) return -1;
    if (!stitchBed) steps[0] = { action: 'float', bed: x.bed };
    move = x.kind === 'transfer' ? 'across' : x.offset < 0 ? 'left' : 'right';
  }
  return findOp(key, steps, move);
}

export type Lowering = { ok: true; cells: Uint8Array } | { ok: false; problems: string[] };

/** The sequence as `key`'s bitmap (image order), or the cells the key has no operation for. */
export function lowerSequence(seq: KnitSequence, key: Key): Lowering {
  const same = seq.keyId === key.id;
  const value = seq.symbols.map((s) =>
    same && s.cell !== undefined && (s.cell >= UNKNOWN || s.cell < key.ops.length)
      ? s.cell
      : opFor(s, key)
  );
  const { w, h } = seq,
    cells = new Uint8Array(w * h),
    problems: string[] = [];
  for (let k = 0; k < h; k++)
    for (let j = 0; j < w; j++) {
      const s = seq.rows[k * w + j]!,
        v = value[s]!;
      if (v < 0)
        problems.push(
          `Pass ${k + 1}, needle ${j + 1}: the key "${key.name}" has no operation for ${symbolText(seq.symbols[s]!)}; the sequence cannot be written as this key's bitmap.`
        );
      else cells[imageIndex(w, h, j, k)] = v;
    }
  return problems.length ? { ok: false, problems } : { ok: true, cells };
}

/** Repeat a cluster over cells ([needle, pass], 0-based), anchored at `anchor`. Returns a new sequence. */
export function fillCluster(
  seq: KnitSequence,
  cluster: { id: string; w: number; h: number; symbols: SeqSymbol[] },
  cells: readonly [number, number][],
  anchor: [number, number] = [0, 0]
): KnitSequence {
  if (
    !Number.isInteger(cluster.w) ||
    !Number.isInteger(cluster.h) ||
    cluster.w < 1 ||
    cluster.h < 1 ||
    cluster.symbols.length !== cluster.w * cluster.h
  )
    throw new Error(`cluster ${cluster.id} must have w × h symbols.`);
  if (seq.clusters.some((c) => c.id === cluster.id))
    throw new Error(`cluster ${cluster.id} is already in the sequence.`);
  const symbols = [...seq.symbols],
    indexOf = new Map(symbols.map((s, i) => [s.id, i]));
  const index = cluster.symbols.map((s) => {
    const problem = symbolProblem(s, seq.guides);
    if (problem) throw new Error(`symbol ${s.id}: ${problem}`);
    if (!indexOf.has(s.id)) {
      indexOf.set(s.id, symbols.length);
      symbols.push({ id: s.id, steps: s.steps });
    }
    return indexOf.get(s.id)!;
  });
  const rows = seq.rows.slice(),
    mod = (a: number, n: number) => ((a % n) + n) % n;
  for (const [j, k] of cells) {
    if (j < 0 || j >= seq.w || k < 0 || k >= seq.h)
      throw new Error('fill cell outside the sequence.');
    rows[k * seq.w + j] =
      index[mod(k - anchor[1], cluster.h) * cluster.w + mod(j - anchor[0], cluster.w)]!;
  }
  return {
    ...seq,
    symbols,
    rows,
    clusters: [...seq.clusters, { id: cluster.id, w: cluster.w, h: cluster.h, symbols: index }],
    fills: [...seq.fills, { cluster: cluster.id, anchor, cells: cells.length }],
  };
}

// ---------------------------------------------------------------- executor

/** `cells` are image indices (row 0 = last pass), as in the operation checks. */
export interface SeqFinding {
  id: string;
  title: string;
  text: string;
  /** A step the sequence cannot perform: export is blocked (project rule). */
  blocking: boolean;
  cells: number[];
}
export interface SeqLoop {
  pass: number;
  needle: number;
  bed: Bed;
  kind: 'knit' | 'tuck';
  /** Loops the stitch was knitted through (none for a tuck). */
  parents: number[];
}
export interface SequenceRun {
  counts: {
    symbols: number;
    knits: number;
    tucks: number;
    transfers: number;
    moves: number;
    drops: number;
    /** Passes whose transfers need a racking other than 0. */
    racked: number;
  };
  /** Racking per pass (0-based), from its transfers. */
  racking: number[];
  findings: SeqFinding[];
  /** One message per blocking step. */
  blockers: string[];
  loops?: SeqLoop[];
}

const BEDS: readonly Bed[] = ['front', 'back'];
const bedIndex = (b: Bed) => (b === 'front' ? 0 : 1);

/**
 * Follow the sequence symbolically (project convention): in each pass, every yarn-fed step in carriage order, then
 * every yarn-free step; loops moved by transfers and moves land together after the pass's departures. Tracks the live
 * loops on each needle of both beds and where each yarn guide stopped (where its last stitch was).
 */
export function executeSequence(seq: KnitSequence, options: { loops?: boolean } = {}): SequenceRun {
  const { w, h, rows, symbols, firstDir } = seq,
    cell = (j: number, k: number) => imageIndex(w, h, j, k);
  const held: number[][] = Array.from({ length: 2 * w }, () => []);
  const loops: SeqLoop[] = [];
  let made = 0;
  const counts = { symbols: 0, knits: 0, tucks: 0, transfers: 0, moves: 0, drops: 0, racked: 0 };
  const used = new Set<number>();
  const empty: number[] = [],
    stacked: number[] = [],
    emptyMove: number[] = [],
    dropped: number[] = [],
    emptyDrop: number[] = [],
    jumps: number[] = [],
    wrong: number[] = [],
    off: number[] = [],
    conflicts: number[] = [],
    blockers: string[] = [];
  const racking: number[] = [];
  const guidePos = new Map<number, number>(),
    guideDir = new Map<number, number>();
  const newLoop = (k: number, j: number, bed: Bed, kind: 'knit' | 'tuck', parents: number[]) => {
    if (options.loops) loops.push({ pass: k, needle: j, bed, kind, parents });
    return made++;
  };
  for (let k = 0; k < h; k++) {
    const dir = passDir(firstDir, k),
      order = Array.from({ length: w }, (_, i) => (dir === 1 ? i : w - 1 - i));
    const start = new Map<number, number>(),
      end = new Map<number, number>();
    for (const j of order) {
      const s = rows[k * w + j]!;
      used.add(s);
      // Two yarn-fed steps on one bed (a converted key operation with both guides on one bed) make one stitch.
      const knitted = new Set<Bed>();
      for (const step of symbols[s]!.steps) {
        if (!yarnFed(step)) continue;
        if (!start.has(step.guide)) {
          start.set(step.guide, j);
          const pos = guidePos.get(step.guide);
          if (pos !== undefined && Math.abs(j - pos) > 1) jumps.push(cell(j, k));
          if (guideDir.get(step.guide) === dir) wrong.push(cell(j, k));
        }
        end.set(step.guide, j);
        if (knitted.has(step.bed)) continue;
        knitted.add(step.bed);
        const slot = held[bedIndex(step.bed) * w + j]!;
        if (!slot.length) empty.push(cell(j, k));
        if (step.kind === 'knit') {
          counts.knits++;
          held[bedIndex(step.bed) * w + j] = [newLoop(k, j, step.bed, 'knit', slot)];
        } else {
          counts.tucks++;
          slot.push(newLoop(k, j, step.bed, 'tuck', []));
        }
      }
    }
    for (const [g, j] of end) {
      guidePos.set(g, j);
      guideDir.set(g, dir);
    }
    const arrivals: { slot: number; loops: number[]; from: number }[] = [];
    let need: { r: number; j: number } | null = null,
      conflict = false;
    for (const j of order) {
      for (const step of symbols[rows[k * w + j]!]!.steps) {
        if (yarnFed(step)) continue;
        const from = bedIndex(step.bed) * w + j,
          here = cell(j, k),
          moving = held[from]!;
        if (step.kind === 'drop') {
          counts.drops++;
          (moving.length ? dropped : emptyDrop).push(here);
          held[from] = [];
          continue;
        }
        const across = step.kind === 'transfer',
          to = j + step.offset,
          toBed = across ? otherBed(step.bed) : step.bed;
        if (across) {
          counts.transfers++;
          const r = step.bed === 'front' ? step.offset : -step.offset;
          if (!need) need = { r, j };
          else if (r !== need.r && !conflict) {
            conflict = true;
            conflicts.push(here);
            blockers.push(
              `Pass ${k + 1}: transfers in this pass need different rackings (${need.r} at needle ${need.j + 1}, ${r} at needle ${j + 1}); one racking per pass (project rule).`
            );
          }
        } else counts.moves++;
        if (to < 0 || to >= w) {
          off.push(here);
          blockers.push(
            `Pass ${k + 1}, needle ${j + 1}: a transfer moves the loop to needle ${to + 1}, outside the program's needles.`
          );
          held[from] = [];
          continue;
        }
        if (!moving.length) {
          emptyMove.push(here);
          continue;
        }
        arrivals.push({ slot: bedIndex(toBed) * w + to, loops: moving, from: here });
        held[from] = [];
      }
    }
    for (const a of arrivals) {
      if (held[a.slot]!.length) stacked.push(a.from);
      held[a.slot]!.push(...a.loops);
    }
    racking.push(need?.r ?? 0);
    if (need && need.r !== 0) counts.racked++;
  }
  const left = new Set<number>();
  for (const b of BEDS)
    for (let j = 0; j < w; j++) if (held[bedIndex(b) * w + j]!.length) left.add(cell(j, h - 1));
  counts.symbols = used.size;

  const findings: SeqFinding[] = [];
  const add = (id: string, title: string, list: number[], text: string, blocking = false) => {
    if (list.length) findings.push({ id, title, text, blocking, cells: [...new Set(list)] });
  };
  add(
    'off-needles',
    "transfers off the program's needles",
    off,
    `${off.length} transfers or moves take a loop off the program's needles; export is blocked (project rule).`,
    true
  );
  add(
    'racking',
    'rackings in conflict',
    conflicts,
    `${conflicts.length} passes have transfers that need different rackings; one racking per pass (project rule), so export is blocked.`,
    true
  );
  add(
    'empty-stitch',
    'stitches on empty needles',
    empty,
    `${empty.length} stitches or tucks are made on a needle that holds no loop: cast-on, increases and new wales start this way.`
  );
  add(
    'stacked',
    'loops stacked by transfers',
    stacked,
    `${stacked.length} transfers or moves land on a needle that already holds a loop; the loops stack, as in a decrease.`
  );
  add(
    'empty-transfer',
    'transfers from empty needles',
    emptyMove,
    `${emptyMove.length} transfers or moves start from a needle that holds no loop; nothing moves.`
  );
  add(
    'drop',
    'drops of live loops',
    dropped,
    `${dropped.length} drops release a live loop; it can ladder unless it is secured.`
  );
  add(
    'empty-drop',
    'drops on empty needles',
    emptyDrop,
    `${emptyDrop.length} drops find no loop; nothing happens.`
  );
  add(
    'left',
    'loops left on the needles',
    [...left],
    `${left.size} needles still hold loops after the last pass; casting off is not in the sequence.`
  );
  add(
    'guide-jump',
    'yarn-guide jumps',
    jumps,
    `In ${jumps.length} passes a yarn guide starts more than one needle from where it stopped; the yarn is carried across.`
  );
  add(
    'guide-side',
    'yarn guides on the wrong side',
    wrong,
    `In ${wrong.length} passes a yarn guide works in the same direction as its previous pass with stitches; it would have to travel back without knitting. The lab software may add that move.`
  );
  return {
    counts,
    racking,
    findings,
    blockers,
    ...(options.loops ? { loops } : {}),
  };
}

/** The program's sequence, executed. */
export const runProgramSequence = (p: KnitCells & { firstDir: 1 | -1 }): SequenceRun =>
  executeSequence(programSequence(p));

// ---------------------------------------------------------------- file and report

export function sequenceJson(
  seq: KnitSequence,
  run: SequenceRun,
  meta: { key: Key; piece: string | null; blockers: readonly string[] }
): string {
  const dirText = (d: number) => (d === 1 ? 'left-to-right' : 'right-to-left');
  return JSON.stringify(
    {
      format: SEQUENCE_FORMAT,
      version: 1,
      note: 'Machine-neutral operation sequence for inspection (Popescu 2019, §6.4.1, pp. 113–114). Not a machine file and not a Knit Grammar program.',
      method:
        "Symbolic execution (project convention): in each pass, every yarn-fed step in carriage order, then every yarn-free step; loops moved by transfers and moves land together after the pass's departures. A yarn guide sits where its last stitch was. Not a machine simulation.",
      racking:
        'A transfer from front needle n with offset o lands on back needle n + o and needs racking o; one from back needle n lands on front needle n + o and needs racking −o (project sign convention, not a machine value).',
      key: { id: meta.key.id, name: meta.key.name },
      piece: meta.piece,
      needles: seq.w,
      passCount: seq.h,
      guides: seq.guides,
      symbols: seq.symbols.map((s) => ({
        id: s.id,
        ...(s.op ? { op: s.op } : {}),
        steps: s.steps,
      })),
      clusters: seq.clusters,
      fills: seq.fills.map((f) => ({ ...f, anchor: [f.anchor[0] + 1, f.anchor[1] + 1] })),
      passes: Array.from({ length: seq.h }, (_, k) => ({
        pass: k + 1,
        direction: dirText(passDir(seq.firstDir, k)),
        racking: run.racking[k] ?? 0,
        symbols: Array.from(seq.rows.subarray(k * seq.w, (k + 1) * seq.w)),
      })),
      findings: run.findings.map((f) => ({
        id: f.id,
        title: f.title,
        text: f.text,
        blocking: f.blocking,
        cells: f.cells.map((i) => [(i % seq.w) + 1, seq.h - Math.floor(i / seq.w)]),
      })),
      blockers: meta.blockers,
    },
    null,
    2
  )
    .replace(/\[\s+(-?\d+),\s+(-?\d+)\s+\]/g, '[$1, $2]')
    .replace(
      /"symbols": \[([\d,\s]+)\]/g,
      (_, list: string) => `"symbols": [${list.replace(/\s+/g, ' ').trim()}]`
    );
}

/** Report lines for the program's sequence. */
export function sequenceLines(run: SequenceRun, passes: number): string[] {
  const c = run.counts;
  return [
    'Operation sequence (machine-neutral; Popescu 2019, §6.4.1, pp. 113–114; symbolic execution, not a machine simulation):',
    `  ${passes} passes, ${c.symbols} symbols in use: ${c.knits} knits, ${c.tucks} tucks, ${c.transfers} transfers, ${c.moves} same-bed moves, ${c.drops} drops; ${c.racked ? `${c.racked} passes need a racking other than 0` : 'racking 0 in every pass'}.`,
    '  Converted from the class-key bitmap; converting back gives the same cells.',
    ...(run.findings.length
      ? run.findings.map((f) => `  ${f.blocking ? 'BLOCKS EXPORT: ' : ''}${f.title}: ${f.text}`)
      : ['  No findings.']),
  ];
}

import type {
  ShapeGeometry,
  ShapeNeedles,
  ShapePlacement,
  ShapeMove,
  ShapeRole,
} from './shape-types';

type Block = { i: number; j: number; a: number; b: number; host: number };
type Plan = { blocks: Block[]; cost: number; moves: ShapeMove[]; placements: ShapePlacement[] };

/** Bounded monotone alignment planner; this is a design-level layout, not a machine simulation.
 * Conservative search: one minimum-cost alignment per candidate origin is retained.
 * A rejected alignment remains inspectable and explicitly blocks export.
 * `fixedParents` (saved knit graph stages) restricts every candidate to the saved parent links: the planner
 * places them or reports them unresolved, and never re-matches them.
 */
export function placeShapeNeedles(
  geometry: ShapeGeometry,
  firstDir: 1 | -1 = 1,
  fixedParents?: ReadonlyMap<string, readonly string[]>
): ShapeNeedles {
  const courses = geometry.courses;
  const fits = (id: string, parents: readonly ShapePlacement[]) => {
    const saved = fixedParents?.get(id);
    if (!saved) return true;
    if (saved.length !== parents.length) return false;
    const ids = parents.map((p) => p.loop.id).sort();
    return [...saved].sort().every((x, k) => x === ids[k]);
  };
  if (firstDir !== 1 && firstDir !== -1) throw new Error('Invalid first pass direction');
  if (
    !Number.isFinite(geometry.stitchWidth) ||
    geometry.stitchWidth <= 0 ||
    !courses.length ||
    courses.length > 600
  )
    throw new Error('Invalid shaping dimensions');
  const ids = new Set<string>();
  courses.forEach((c, index) => {
    if (
      c.index !== index ||
      !c.loops.length ||
      c.loops.length > 600 ||
      !Number.isFinite(c.length) ||
      c.length < 0 ||
      !c.extent.every(Number.isFinite) ||
      c.extent[0] > c.extent[1]
    )
      throw new Error('Invalid ordered shape course');
    for (const list of [c.points, c.loops]) {
      let last = -Infinity;
      for (const p of list) {
        if (
          ![p.across, ...p.uv, ...p.position].every(Number.isFinite) ||
          p.across < last ||
          p.across < c.extent[0] - 1e-9 ||
          p.across > c.extent[1] + 1e-9
        )
          throw new Error('Invalid shape point order or extent');
        last = p.across;
      }
    }
    for (const p of c.loops) {
      if (!p.id || ids.has(p.id)) throw new Error('Duplicate shape loop ID');
      ids.add(p.id);
    }
  });
  const result: ShapeNeedles = {
    w: 0,
    h: courses.length,
    placements: [],
    moves: [],
    steps: [],
    unresolved: [],
    yarnJumps: 0,
  };
  const bed = new Map<number, ShapePlacement>();
  let previousEnd: number | undefined;
  for (const c of courses) {
    const parents = [...bed.values()]
      .filter(
        (p) =>
          (c.leftBoundary || p.loop.across >= c.extent[0] - 1e-9) &&
          (c.rightBoundary || p.loop.across <= c.extent[1] + 1e-9)
      )
      .sort((a, b) => a.needle - b.needle);
    const contiguous = parents.every((p, i) => !i || p.needle === parents[i - 1].needle + 1);
    const n = parents.length,
      m = c.loops.length;
    // New loops may start beyond the parents at a boundary or a free side; only a boundary takes parents
    // beyond the course's extent.
    const leftOpen = c.leftBoundary || !!c.leftFree,
      rightOpen = c.rightBoundary || !!c.rightFree;
    // Alignment cost in loops of the child's own width (joined pieces may mix loop sizes).
    const width = (j: number) => c.loops[j]!.stitchWidth ?? geometry.stitchWidth;
    const boundaryStarts =
      n > 0 &&
      c.loops.some(
        (p) =>
          (leftOpen && p.across < parents[0].loop.across) ||
          (rightOpen && p.across > parents[n - 1].loop.across)
      );
    // With no 0:1 boundary-start block, the first/last parent must each reach
    // one of the first/last two children. Each end can add one unparented child
    // and, at a piece boundary only, one outward unit move. This is a necessary
    // bound for this pass grammar, not an impossibility proof for other schedules.
    const capacity = n + 2 + Number(c.leftBoundary) + Number(c.rightBoundary);
    const capacityFailure = contiguous && n > 0 && !boundaryStarts && m > capacity;
    const base = n ? parents[0].needle : Math.round(c.loops[0].across / width(0));
    const align = (
      start: number,
      constrained: boolean,
      filtered = !!fixedParents
    ): Plan | undefined => {
      const cols = m + 1,
        size = (n + 1) * cols;
      const costs = new Float64Array(size).fill(Infinity),
        trace = new Int8Array(size);
      const moveCounts = new Int32Array(size).fill(2147483647);
      costs[0] = 0;
      moveCounts[0] = 0;
      for (let i = 0; i <= n; i++)
        for (let j = 0; j <= m; j++) {
          const at = i * cols + j;
          if (!Number.isFinite(costs[at])) continue;
          const offer = (a: number, b: number, host: number, code: number) => {
            if (i + a > n || j + b > m) return;
            if (
              !a &&
              n &&
              !(
                (j === 0 || j < m) &&
                ((leftOpen && c.loops[j].across < parents[0].loop.across) ||
                  (rightOpen && c.loops[j].across > parents[n - 1].loop.across))
              )
            )
              return;
            let cost = 0,
              moved = 0;
            for (let k = 0; k < a; k++) {
              const p = parents[i + k],
                target = start + j + (b === 2 ? host : 0),
                delta = target - p.needle;
              if (
                constrained &&
                (Math.abs(delta) > 1 ||
                  (delta < 0 && !c.leftBoundary && i + k === 0) ||
                  (delta > 0 && !c.rightBoundary && i + k === n - 1))
              )
                return;
              cost +=
                ((p.loop.across - c.loops[j + (b === 2 ? host : 0)].across) /
                  width(j + (b === 2 ? host : 0))) **
                2;
              if (delta) moved++;
            }
            if (a === 1 && b === 2)
              cost +=
                ((parents[i].loop.across - c.loops[j + 1 - host].across) / width(j + 1 - host)) **
                2;
            if (a === 2 && constrained) {
              const target = start + j,
                hostParent =
                  parents[i].needle === target
                    ? parents[i]
                    : parents[i + 1].needle === target
                      ? parents[i + 1]
                      : undefined;
              if (
                !hostParent ||
                parents
                  .slice(i, i + 2)
                  .some((p) => p !== hostParent && hostParent.course > p.course)
              )
                return;
            }
            if (filtered)
              for (let k = 0; k < b; k++)
                if (!fits(c.loops[j + k]!.id, b === 2 && k !== host ? [] : parents.slice(i, i + a)))
                  return;
            const next = (i + a) * cols + j + b,
              value = costs[at] + cost;
            if (
              value < costs[next] ||
              (value === costs[next] && moveCounts[at] + moved < moveCounts[next])
            ) {
              costs[next] = value;
              moveCounts[next] = moveCounts[at] + moved;
              trace[next] = code;
            }
          };
          if (i < n && j < m) offer(1, 1, 0, 1);
          if (i < n && j + 1 < m) {
            offer(1, 2, 0, 2);
            offer(1, 2, 1, 3);
          }
          if (i + 1 < n && j < m) offer(2, 1, 0, 4);
          if (j < m) offer(0, 1, 0, 5);
        }
      if (!Number.isFinite(costs[size - 1])) return;
      const blocks: Block[] = [];
      let i = n,
        j = m;
      while (i || j) {
        const code = trace[i * cols + j];
        if (!code) return;
        const a = code === 4 ? 2 : code === 5 ? 0 : 1,
          b = code === 2 || code === 3 ? 2 : 1;
        i -= a;
        j -= b;
        blocks.push({ i, j, a, b, host: code === 3 ? 1 : 0 });
      }
      blocks.reverse();
      const moves: ShapeMove[] = [],
        placements: ShapePlacement[] = [];
      for (const block of blocks) {
        const { i, j, a, b, host } = block;
        const role: ShapeRole =
          a === 0
            ? c.index === 0
              ? 'loop'
              : 'edge increase'
            : a === 2
              ? 'decrease'
              : b === 2
                ? 'increase'
                : 'loop';
        for (let k = 0; k < a; k++) {
          const p = parents[i + k],
            to = start + j + (b === 2 ? host : 0);
          if (to !== p.needle)
            moves.push({
              pass: p.course + 1,
              needle: p.needle,
              to,
              forPass: c.index + 1,
              role: b === 2 || m > n ? 'increase' : 'decrease',
            });
        }
        for (let k = 0; k < b; k++)
          placements.push({
            loop: c.loops[j + k],
            course: c.index,
            needle: start + j + k,
            role: b === 2 && k === host ? 'loop' : role,
            parents: b === 2 && k !== host ? [] : parents.slice(i, i + a).map((p) => p.loop.id),
          });
      }
      if (constrained) {
        const moving = new Map(moves.map((x) => [x.needle, x]));
        for (const move of moves) {
          const held = bed.get(move.to);
          if (held && !parents.includes(held)) return;
          for (const d of [-1, 1]) {
            const other = moving.get(move.needle + d);
            if (other && other.pass !== move.pass) return;
          }
        }
        for (const p of placements) {
          const old = bed.get(p.needle);
          if (old && !parents.includes(old)) return;
        }
      }
      return { blocks, cost: costs[size - 1], moves, placements };
    };
    let chosen: Plan | undefined;
    const identityPlan = (): Plan => ({
      blocks: [],
      cost: parents.reduce(
        (sum, p, i) => sum + ((p.loop.across - c.loops[i].across) / width(i)) ** 2,
        0
      ),
      moves: [],
      placements: c.loops.map((loop, i) => ({
        loop,
        course: c.index,
        needle: parents[i].needle,
        role: 'loop',
        parents: [parents[i].loop.id],
      })),
    });
    const identityFits = c.loops.every((loop, i) => i >= n || fits(loop.id, [parents[i]!]));
    // Exact identity is a global optimum: geometric cost zero and no moves.
    // Do not use a tolerance here; nearby coordinates still require alignment.
    if (
      contiguous &&
      n === m &&
      identityFits &&
      parents.every((p, i) => p.loop.across === c.loops[i].across)
    ) {
      chosen = identityPlan();
    }
    const search = (filtered: boolean) => {
      let best: Plan | undefined;
      for (let offset = -2; offset <= 2; offset++) {
        const p = align(base + offset, true, filtered);
        if (
          p &&
          (!best ||
            p.cost < best.cost ||
            (p.cost === best.cost && p.moves.length < best.moves.length))
        )
          best = p;
      }
      return best;
    };
    if (!chosen && !capacityFailure && contiguous && (n || c.index === 0))
      chosen = search(!!fixedParents);
    // The minimum geometric-cost DP plan can fail the subsequent transfer-age
    // checks even though keeping contiguous parents on their needles is legal.
    // Retain this explicit no-move candidate when the active count is unchanged.
    // Every selected parent is consumed once; held parents outside the span are untouched.
    if (!chosen && contiguous && n === m && identityFits) chosen = identityPlan();
    // Saved links block a pass that the unrestricted search could place: say so instead of re-matching.
    const savedLinks =
      !chosen &&
      !!fixedParents &&
      ((contiguous && n === m) ||
        (!capacityFailure && contiguous && (n > 0 || c.index === 0) && !!search(false)));
    if (!chosen) {
      chosen = align(base, false);
      if (!chosen) {
        // Ratios outside the 1–2 grammar have no legal alignment. Preserve all
        // geometry loops in a preview, recording the unsupported step below.
        chosen = {
          blocks: [],
          cost: Infinity,
          moves: [],
          placements: c.loops.map((loop, j) => ({
            loop,
            course: c.index,
            needle: base + j,
            role: m >= n ? 'increase' : 'decrease',
            parents:
              fixedParents?.get(loop.id)?.slice() ??
              (n <= m
                ? n
                  ? parents.filter((_, k) => Math.floor((k * m) / n) === j).map((p) => p.loop.id)
                  : []
                : parents
                    .slice(Math.floor((j * n) / m), Math.floor(((j + 1) * n) / m))
                    .map((p) => p.loop.id)),
          })),
        };
      }
      for (const p of chosen.placements)
        result.unresolved.push({
          pass: c.index + 1,
          needle: p.needle,
          role: p.role,
          reason: savedLinks
            ? 'Saved parent links cannot be placed with one-needle transfers and held-loop constraints; geometric preview only.'
            : capacityFailure
              ? `This pass requests ${m} loops from ${n} live parents; the current one-needle grammar permits at most ${capacity} here. Split the piece into patches or use a different operation schedule; geometric preview only.`
              : 'No certified placement with one-needle transfers and held-loop constraints; geometric preview only.',
        });
      chosen.moves = [];
    }
    for (const p of parents) bed.delete(p.needle);
    for (const p of chosen.placements) {
      bed.set(p.needle, p);
      result.placements.push(p);
      if (p.role !== 'loop')
        result.steps.push({ pass: c.index + 1, needle: p.needle, role: p.role });
    }
    result.moves.push(...chosen.moves);
    const direction = firstDir * (c.index % 2 ? -1 : 1),
      left = chosen.placements[0].needle,
      right = chosen.placements[m - 1].needle;
    const start = direction === 1 ? left : right,
      end = direction === 1 ? right : left;
    if (previousEnd !== undefined && Math.abs(start - previousEnd) > 1) result.yarnJumps++;
    previousEnd = end;
    if (c.turnStart) result.steps.push({ pass: c.index + 1, needle: left, role: 'turn' });
    if (c.turnEnd) result.steps.push({ pass: c.index + 1, needle: right, role: 'turn' });
    for (const r of geometry.release ?? [])
      if (r.after === c.index)
        for (const [needle, p] of bed) if (p.loop.id.startsWith(r.prefix)) bed.delete(needle);
  }
  const all = result.placements
    .map((p) => p.needle)
    .concat(result.moves.flatMap((m) => [m.needle, m.to]));
  let min = Infinity,
    max = -Infinity;
  for (const needle of all) {
    min = Math.min(min, needle);
    max = Math.max(max, needle);
  }
  result.w = max - min + 1;
  if (result.w > 600) throw new Error('Shape needle span exceeds 600');
  for (const p of result.placements) p.needle -= min;
  for (const p of [...result.steps, ...result.unresolved]) p.needle -= min;
  for (const p of result.moves) {
    p.needle -= min;
    p.to -= min;
  }
  return result;
}

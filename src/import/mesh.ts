import type {
  Diagnostic,
  GenerationContext,
  ImportedMeshData,
  ImportedMeshReport,
  MeshUnit,
  Vec3,
} from '../core/types';

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export const MAX_IMPORTED_VERTICES = 200_000;
export const MAX_IMPORTED_TRIANGLES = 200_000;
/** Cumulative polygon geometric-predicate and loop work, independent of wall time. */
export const MAX_TRIANGULATION_WORK = 5_000_000;
export const MESH_UNIT_SCALE: Readonly<Record<MeshUnit, number>> = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  in: 0.0254,
};
const MAX_POLYGON_VERTICES = 256;
const AREA_RELATIVE_TOLERANCE = 1e-14;
const POLYGON_TOLERANCE = 1e-10;
const MAX_SOURCE_COORDINATE_METERS = 1e9;
const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const OBJ_NOTES = [
  'OBJ position indices are preserved; coincident declared vertices are not welded. Normals, UVs and materials are ignored.',
  'Planar simple polygons use ear clipping; relative planarity/intersection tolerance 1e-10; maximum 256 sides.',
];
const STL_NOTES = [
  'STL vertices are welded only when all three parsed coordinates are exactly equal; signed zero is canonicalized.',
  'Facet normals and binary attribute bytes are ignored; triangle orientation follows the vertex order.',
];
const HIGH_OFFSET_NOTE =
  'Large source offset relative to mesh extent limits positional precision in the parsed coordinates; centering cannot recover lost source precision.';
const IGNORED_OBJ_STATEMENTS = ['vt', 'vn', 'o', 'g', 's', 'usemtl', 'mtllib'];
function allowedSourceNote(note: string, format: ImportedMeshData['source']['format']): boolean {
  if (note === HIGH_OFFSET_NOTE || (format === 'obj' ? OBJ_NOTES : STL_NOTES).includes(note))
    return true;
  if (
    format !== 'obj' ||
    !note.startsWith('Ignored appearance/group statements: ') ||
    !note.endsWith('.')
  )
    return false;
  const statements = note.slice('Ignored appearance/group statements: '.length, -1).split(', ');
  return (
    statements.length > 0 &&
    statements.every((command) => IGNORED_OBJ_STATEMENTS.includes(command)) &&
    [...new Set(statements)].sort().join(', ') === statements.join(', ')
  );
}

function fail(message: string): never {
  throw new Error(`Mesh import: ${message}`);
}
function checkpoint(context?: GenerationContext, fraction?: number, stage = 'Reading mesh'): void {
  if (context?.cancelled?.()) {
    const error = new Error('Mesh import cancelled');
    error.name = 'AbortError';
    throw error;
  }
  if (fraction !== undefined) context?.progress?.(fraction, stage);
}
function numberToken(token: string | undefined): number {
  if (token === undefined || !DECIMAL.test(token)) return fail('expected a finite decimal number');
  const value = Number(token);
  if (!Number.isFinite(value)) return fail('coordinates and normals must be finite');
  return value === 0 ? 0 : value;
}
function bounds(positions: readonly number[]): {
  min: Vec3;
  max: Vec3;
  extent: Vec3;
  size: number;
} {
  const min: Vec3 = [Infinity, Infinity, Infinity],
    max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    const axis = i % 3;
    min[axis] = Math.min(min[axis], positions[i]);
    max[axis] = Math.max(max[axis], positions[i]);
  }
  const extent = max.map((value, axis) => value - min[axis]) as Vec3;
  return { min, max, extent, size: Math.max(...extent) };
}
/** Maximum bounding-box extent in meters; this does not rescale geometry. */
export function importedMeshSize(mesh: ImportedMeshData): number {
  return bounds(mesh.positions).size;
}
function triangleArea(p: readonly number[], a: number, b: number, c: number): number {
  const x = p[b * 3] - p[a * 3],
    y = p[b * 3 + 1] - p[a * 3 + 1],
    z = p[b * 3 + 2] - p[a * 3 + 2];
  const u = p[c * 3] - p[a * 3],
    v = p[c * 3 + 1] - p[a * 3 + 1],
    w = p[c * 3 + 2] - p[a * 3 + 2];
  return Math.hypot(y * w - z * v, z * u - x * w, x * v - y * u) / 2;
}

/** Validate saved scientific data without repairing, welding, recentering, or trusting metadata. */
export function validateImportedMesh(value: unknown): ImportedMeshData {
  if (!value || typeof value !== 'object') return fail('missing mesh payload');
  const input = value as Record<string, unknown>;
  if (
    !Array.isArray(input.positions) ||
    input.positions.length < 9 ||
    input.positions.length % 3 ||
    input.positions.length > MAX_IMPORTED_VERTICES * 3
  )
    return fail('invalid or excessive vertex array');
  if (
    !Array.isArray(input.indices) ||
    input.indices.length < 3 ||
    input.indices.length % 3 ||
    input.indices.length > MAX_IMPORTED_TRIANGLES * 3
  )
    return fail('invalid or excessive triangle array');
  const positions: number[] = [],
    indices: number[] = [];
  for (const value of input.positions) {
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1000)
      return fail('positions must be finite centered meter coordinates');
    positions.push(value);
  }
  for (const value of input.indices) {
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value >= positions.length / 3
    )
      return fail('triangle index is out of range');
    indices.push(value);
  }
  const box = bounds(positions);
  if (box.size < 1e-6 || box.size > 1000)
    return fail('maximum extent must be between 0.000001 and 1000 meters');
  if (box.min.some((v, axis) => Math.abs(v + box.max[axis]) > Math.max(1e-12, box.size * 1e-10)))
    return fail('saved mesh positions must be centered at their bounding-box midpoint');
  if (!input.source || typeof input.source !== 'object') return fail('missing source metadata');
  const source = input.source as Record<string, unknown>;
  if (
    typeof source.name !== 'string' ||
    !source.name.trim() ||
    source.name.length > 255 ||
    /[\u0000-\u001f\u007f]/.test(source.name)
  )
    return fail('source name must be 1–255 printable characters');
  if (source.format !== 'obj' && source.format !== 'stl-ascii' && source.format !== 'stl-binary')
    return fail('unsupported source format');
  if (source.unit !== 'mm' && source.unit !== 'cm' && source.unit !== 'm' && source.unit !== 'in')
    return fail('unsupported source unit');
  if (source.scaleToMeters !== MESH_UNIT_SCALE[source.unit])
    return fail('source unit and meter scale disagree');
  if (source.indexing !== (source.format === 'obj' ? 'obj-indices' : 'stl-exact-weld'))
    return fail('source format and indexing metadata disagree');
  if (
    !Array.isArray(source.centerMeters) ||
    source.centerMeters.length !== 3 ||
    [...source.centerMeters].some(
      (v) =>
        typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > MAX_SOURCE_COORDINATE_METERS
    )
  )
    return fail('invalid source center in meters');
  if (
    !Array.isArray(source.notes) ||
    source.notes.length > 32 ||
    [...source.notes].some(
      (note) => typeof note !== 'string' || note.length > 512 || /[\u0000-\u001f\u007f]/.test(note)
    )
  )
    return fail('invalid source notes');
  if (
    source.notes.some(
      (note) => !allowedSourceNote(note, source.format as ImportedMeshData['source']['format'])
    )
  )
    return fail('source notes must use recognized importer wording');
  if (source.format !== 'obj' && new Set(indices).size !== positions.length / 3)
    return fail('STL metadata cannot contain unused declared vertices');
  let hasArea = false;
  const areaTolerance = box.size ** 2 * AREA_RELATIVE_TOLERANCE;
  for (let i = 0; i < indices.length; i += 3)
    if (triangleArea(positions, indices[i], indices[i + 1], indices[i + 2]) > areaTolerance) {
      hasArea = true;
      break;
    }
  if (!hasArea) return fail('all triangles are degenerate at the documented area tolerance');
  return {
    positions,
    indices,
    source: {
      name: source.name,
      format: source.format,
      unit: source.unit,
      scaleToMeters: source.scaleToMeters as number,
      centerMeters: [...source.centerMeters] as Vec3,
      indexing: source.indexing as ImportedMeshData['source']['indexing'],
      notes: [...source.notes] as string[],
    },
  };
}

function decodeText(data: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    return fail('text file must contain valid UTF-8 without binary data');
  }
  if (text.includes('\0')) return fail('text file contains NUL bytes');
  return text;
}

/** Iterate bounded lines instead of expanding a hostile text file into millions of tokens. */
function* textLines(text: string): Generator<{ text: string; offset: number; line: number }> {
  let offset = 0,
    line = 0;
  while (offset < text.length) {
    const end = text.indexOf('\n', offset),
      next = end < 0 ? text.length : end;
    if (next - offset > 65536) return fail('text lines may contain at most 65536 characters');
    let content = text.slice(offset, next);
    if (end >= 0 && content.endsWith('\r')) content = content.slice(0, -1);
    if (/[\r\u0085\u2028\u2029]/.test(content) || /[^\S \t]/u.test(content))
      return fail('text requires LF or CRLF lines and ASCII space/tab separators');
    yield { text: content.replace(/^[ \t]+|[ \t]+$/g, ''), offset, line: ++line };
    offset = next + 1;
  }
}

type Point2 = [number, number];
function cross2(a: Point2, b: Point2, c: Point2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
function triangulate(
  face: number[],
  positions: number[],
  budget: { work: number },
  context?: GenerationContext
): number[] {
  if (face.length === 3) return face;
  function spend(): void {
    if (++budget.work > MAX_TRIANGULATION_WORK)
      return fail(
        `cumulative polygon triangulation work exceeds ${MAX_TRIANGULATION_WORK} operations`
      );
  }
  function orient(a: Point2, b: Point2, c: Point2): number {
    spend();
    return cross2(a, b, c);
  }
  if (new Set(face).size !== face.length)
    return fail('polygon repeats a vertex; ambiguous polygon boundary');
  const points = face.map((index) => positions.slice(index * 3, index * 3 + 3) as Vec3);
  const box = bounds(points.flat());
  if (!(box.size > 0)) return fail('polygon has no extent');
  const p = points.map((point) => point.map((v, axis) => (v - points[0][axis]) / box.size) as Vec3);
  // Newell normal, normalized after translating and scaling to the polygon extent.
  const normal: Vec3 = [0, 0, 0];
  for (let i = 0; i < p.length; i++) {
    spend();
    const a = p[i],
      b = p[(i + 1) % p.length];
    normal[0] += (a[1] - b[1]) * (a[2] + b[2]);
    normal[1] += (a[2] - b[2]) * (a[0] + b[0]);
    normal[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const norm = Math.hypot(...normal);
  if (norm <= POLYGON_TOLERANCE)
    return fail('polygon is self-crossing or has ambiguous zero projected area');
  const n = normal.map((value) => value / norm) as Vec3;
  if (
    p.some((point) => {
      spend();
      return Math.abs(point[0] * n[0] + point[1] * n[1] + point[2] * n[2]) > POLYGON_TOLERANCE;
    })
  )
    return fail('nonplanar polygon exceeds relative planarity tolerance 1e-10');
  const drop =
    Math.abs(n[0]) > Math.abs(n[1])
      ? Math.abs(n[0]) > Math.abs(n[2])
        ? 0
        : 2
      : Math.abs(n[1]) > Math.abs(n[2])
        ? 1
        : 2;
  const q = p.map((point) => point.filter((_, axis) => axis !== drop) as Point2);
  function onSegment(a: Point2, b: Point2, c: Point2): boolean {
    return (
      Math.abs(orient(a, b, c)) <= POLYGON_TOLERANCE &&
      c[0] >= Math.min(a[0], b[0]) - POLYGON_TOLERANCE &&
      c[0] <= Math.max(a[0], b[0]) + POLYGON_TOLERANCE &&
      c[1] >= Math.min(a[1], b[1]) - POLYGON_TOLERANCE &&
      c[1] <= Math.max(a[1], b[1]) + POLYGON_TOLERANCE
    );
  }
  for (let i = 0; i < q.length; i++) {
    spend();
    const a = q[i],
      b = q[(i + 1) % q.length];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= POLYGON_TOLERANCE)
      return fail('polygon contains coincident adjacent vertices');
    for (let j = i + 1; j < q.length; j++) {
      if (j === i + 1 || (i === 0 && j === q.length - 1)) continue;
      const c = q[j],
        d = q[(j + 1) % q.length];
      const abC = orient(a, b, c),
        abD = orient(a, b, d),
        cdA = orient(c, d, a),
        cdB = orient(c, d, b);
      if (
        (abC * abD < 0 && cdA * cdB < 0) ||
        onSegment(a, b, c) ||
        onSegment(a, b, d) ||
        onSegment(c, d, a) ||
        onSegment(c, d, b)
      )
        return fail('self-crossing or touching polygon boundary');
    }
  }
  let signedArea = 0;
  for (let i = 0; i < q.length; i++) {
    spend();
    signedArea += q[i][0] * q[(i + 1) % q.length][1] - q[(i + 1) % q.length][0] * q[i][1];
  }
  const sign = Math.sign(signedArea),
    remaining = face.map((_, index) => index),
    result: number[] = [];
  while (remaining.length > 3) {
    checkpoint(context);
    let found = false;
    for (let i = 0; i < remaining.length; i++) {
      spend();
      const prev = remaining[(i + remaining.length - 1) % remaining.length],
        at = remaining[i],
        next = remaining[(i + 1) % remaining.length];
      if (sign * orient(q[prev], q[at], q[next]) <= POLYGON_TOLERANCE) continue;
      const contains = remaining.some(
        (k) =>
          k !== prev &&
          k !== at &&
          k !== next &&
          sign * orient(q[prev], q[at], q[k]) >= -POLYGON_TOLERANCE &&
          sign * orient(q[at], q[next], q[k]) >= -POLYGON_TOLERANCE &&
          sign * orient(q[next], q[prev], q[k]) >= -POLYGON_TOLERANCE
      );
      if (contains) continue;
      result.push(face[prev], face[at], face[next]);
      remaining.splice(i, 1);
      found = true;
      break;
    }
    if (!found)
      return fail('polygon cannot be triangulated unambiguously at relative tolerance 1e-10');
  }
  result.push(...remaining.map((i) => face[i]));
  return result;
}

function parseObj(
  text: string,
  context?: GenerationContext
): { positions: number[]; indices: number[]; notes: string[] } {
  const positions: number[] = [],
    indices: number[] = [],
    ignored = new Set<string>(),
    budget = { work: 0 };
  for (const entry of textLines(text)) {
    if (entry.line % 256 === 1) checkpoint(context, (entry.offset / text.length) * 0.75);
    const comment = entry.text.indexOf('#');
    const line = (comment >= 0 ? entry.text.slice(0, comment) : entry.text).replace(/[ \t]+$/g, '');
    if (!line) continue;
    const tokens = line.split(/[ \t]+/),
      command = tokens.shift()!;
    if (line.endsWith('\\'))
      return fail('OBJ line continuations are unsupported, including ignored statements');
    if (command === 'v') {
      if (tokens.length !== 3 && tokens.length !== 4)
        return fail(
          `OBJ line ${entry.line}: vertices require x y z and optional w=1; vertex colors are unsupported`
        );
      if (tokens.length === 4 && numberToken(tokens[3]) !== 1)
        return fail('OBJ homogeneous vertex weights other than 1 are unsupported');
      if (positions.length / 3 >= MAX_IMPORTED_VERTICES) return fail('vertex limit exceeded');
      positions.push(...tokens.slice(0, 3).map(numberToken));
    } else if (command === 'f') {
      if (tokens.length < 3 || tokens.length > MAX_POLYGON_VERTICES)
        return fail('OBJ faces require 3–256 vertices');
      if (indices.length / 3 + tokens.length - 2 > MAX_IMPORTED_TRIANGLES)
        return fail('triangle limit exceeded');
      const face = tokens.map((token) => {
        const fields = token.split('/');
        if (
          fields.length > 3 ||
          !fields[0] ||
          fields.some((field, i) =>
            field
              ? !/^[+-]?\d+$/.test(field) ||
                Number(field) === 0 ||
                !Number.isSafeInteger(Number(field))
              : i !== 1 || fields.length !== 3
          )
        )
          return fail('invalid OBJ face index syntax');
        const index = Number(fields[0]);
        const resolved = index > 0 ? index - 1 : positions.length / 3 + index;
        if (resolved < 0 || resolved >= positions.length / 3)
          return fail('OBJ position index is out of range at its face declaration');
        return resolved;
      });
      indices.push(...triangulate(face, positions, budget, context));
    } else if (IGNORED_OBJ_STATEMENTS.includes(command)) {
      ignored.add(command);
    } else return fail(`unsupported OBJ statement '${command}'; only polygonal faces are imported`);
  }
  return {
    positions,
    indices,
    notes: [
      ...OBJ_NOTES,
      ...(ignored.size
        ? [`Ignored appearance/group statements: ${[...ignored].sort().join(', ')}.`]
        : []),
    ],
  };
}

function stlCollector() {
  const positions: number[] = [],
    indices: number[] = [],
    vertices = new Map<string, number>();
  return {
    positions,
    indices,
    add(point: number[]) {
      const p = point.map((value) => (value === 0 ? 0 : value));
      if (p.some((value) => !Number.isFinite(value))) return fail('STL coordinates must be finite');
      const key = p.join(','),
        existing = vertices.get(key);
      if (existing !== undefined) indices.push(existing);
      else {
        if (positions.length / 3 >= MAX_IMPORTED_VERTICES) return fail('vertex limit exceeded');
        const index = positions.length / 3;
        vertices.set(key, index);
        positions.push(...p);
        indices.push(index);
      }
    },
  };
}
function parseStl(
  data: ArrayBuffer,
  context?: GenerationContext
): { positions: number[]; indices: number[]; format: 'stl-ascii' | 'stl-binary'; notes: string[] } {
  const view = new DataView(data),
    out = stlCollector();
  const count = data.byteLength >= 84 ? view.getUint32(80, true) : 0;
  const notes = [...STL_NOTES];
  if (data.byteLength >= 84 && data.byteLength === 84 + count * 50) {
    if (!count || count > MAX_IMPORTED_TRIANGLES)
      return fail('invalid or excessive binary STL facet count');
    for (let triangle = 0; triangle < count; triangle++) {
      if (triangle % 256 === 0) checkpoint(context, (triangle / count) * 0.75);
      const offset = 84 + triangle * 50;
      for (let i = 0; i < 3; i++)
        if (!Number.isFinite(view.getFloat32(offset + i * 4, true)))
          return fail('STL facet normals must be finite');
      for (let vertex = 0; vertex < 3; vertex++)
        out.add(
          [0, 1, 2].map((axis) => view.getFloat32(offset + 12 + vertex * 12 + axis * 4, true))
        );
    }
    return { positions: out.positions, indices: out.indices, format: 'stl-binary', notes };
  }
  // Binary counts and exact byte length take precedence over a misleading "solid" header.
  const text = decodeText(data),
    lines = textLines(text);
  function nextLine(): IteratorResult<{ text: string; offset: number; line: number }> {
    let next = lines.next();
    while (!next.done && !next.value.text) next = lines.next();
    return next;
  }
  let current = nextLine(),
    facets = 0;
  if (current.done || !/^solid(?:\s.*)?$/.test(current.value.text))
    return fail('binary STL count/byte length mismatch, or ASCII STL must begin with solid');
  current = nextLine();
  function expect(pattern: RegExp, label: string): RegExpMatchArray {
    const match = !current.done && current.value.text.match(pattern);
    if (!match) return fail(`ASCII STL expected ${label}`);
    current = nextLine();
    return match;
  }
  while (!current.done && !/^endsolid(?:\s.*)?$/.test(current.value.text)) {
    if (facets % 256 === 0) checkpoint(context, (current.value.offset / text.length) * 0.75);
    if (++facets > MAX_IMPORTED_TRIANGLES) return fail('triangle limit exceeded');
    const normal = expect(/^facet\s+normal\s+(\S+)\s+(\S+)\s+(\S+)$/, 'facet normal');
    normal.slice(1).forEach(numberToken);
    expect(/^outer\s+loop$/, 'outer loop');
    for (let vertex = 0; vertex < 3; vertex++) {
      const match = expect(/^vertex\s+(\S+)\s+(\S+)\s+(\S+)$/, 'vertex');
      out.add(match.slice(1).map(numberToken));
    }
    expect(/^endloop$/, 'endloop');
    expect(/^endfacet$/, 'endfacet');
  }
  expect(/^endsolid(?:\s.*)?$/, 'endsolid');
  if (!current.done || !facets) return fail('ASCII STL has trailing data or no facets');
  return { positions: out.positions, indices: out.indices, format: 'stl-ascii', notes };
}

/** OBJ/STL inspection import v1: preserve axes and scale, then translate the bounding-box midpoint to zero. */
export function parseMeshFile(
  data: ArrayBuffer,
  options: { name: string; format: 'obj' | 'stl'; unit: MeshUnit },
  context?: GenerationContext
): { mesh: ImportedMeshData; size: number } {
  checkpoint(context);
  if (!(data instanceof ArrayBuffer) || data.byteLength === 0 || data.byteLength > MAX_IMPORT_BYTES)
    return fail('file must contain 1–20971520 bytes');
  if (
    !options ||
    (options.format !== 'obj' && options.format !== 'stl') ||
    !Object.hasOwn(MESH_UNIT_SCALE, options.unit)
  )
    return fail('unsupported file format or declared unit');
  const parsed =
    options.format === 'obj'
      ? { ...parseObj(decodeText(data), context), format: 'obj' as const }
      : parseStl(data, context);
  const scale = MESH_UNIT_SCALE[options.unit];
  for (let i = 0; i < parsed.positions.length; i++) {
    parsed.positions[i] *= scale;
    if (
      !Number.isFinite(parsed.positions[i]) ||
      Math.abs(parsed.positions[i]) > MAX_SOURCE_COORDINATE_METERS
    )
      return fail('source coordinates must be finite and within ±1e9 meters');
  }
  const box = bounds(parsed.positions),
    center = box.min.map((v, axis) => v / 2 + box.max[axis] / 2) as Vec3;
  for (let i = 0; i < parsed.positions.length; i++) parsed.positions[i] -= center[i % 3];
  // A first subtraction can retain a midpoint residual of one source-offset ULP.
  // Recenter the small coordinates again, without changing axes or scale.
  const centeredBox = bounds(parsed.positions),
    correction = centeredBox.min.map((v, axis) => v / 2 + centeredBox.max[axis] / 2) as Vec3;
  for (let i = 0; i < parsed.positions.length; i++) parsed.positions[i] -= correction[i % 3];
  for (let axis = 0; axis < 3; axis++) center[axis] += correction[axis];
  if (Math.max(...center.map(Math.abs)) / box.size > 1e7) parsed.notes.push(HIGH_OFFSET_NOTE);
  checkpoint(context, 0.9, 'Validating imported geometry');
  const mesh = validateImportedMesh({
    positions: parsed.positions,
    indices: parsed.indices,
    source: {
      name: options.name,
      format: parsed.format,
      unit: options.unit,
      scaleToMeters: scale,
      centerMeters: center,
      indexing: parsed.format === 'obj' ? 'obj-indices' : 'stl-exact-weld',
      notes: parsed.notes,
    },
  });
  checkpoint(context, 1, 'Mesh ready for inspection');
  return { mesh, size: box.size };
}

/** Local incidence/link and geometric measurements; no global intersection or physical certificate. */
export function analyzeImportedMesh(input: ImportedMeshData): ImportedMeshReport {
  const mesh = validateImportedMesh(input),
    p = mesh.positions,
    indices = mesh.indices,
    vertexCount = p.length / 3;
  const box = bounds(p),
    areaTolerance = box.size ** 2 * AREA_RELATIVE_TOLERANCE;
  const parent = Array.from({ length: vertexCount }, (_, i) => i),
    used = new Set<number>();
  function find(a: number): number {
    let root = a;
    while (parent[root] !== root) root = parent[root];
    while (parent[a] !== a) {
      const next = parent[a];
      parent[a] = root;
      a = next;
    }
    return root;
  }
  function union(a: number, b: number): void {
    const x = find(a),
      y = find(b);
    if (x !== y) parent[x] = y;
  }
  const edges = new Map<string, { count: number; orientation: number }>();
  const links = new Map<number, [number, number][]>(),
    faces = new Set<string>();
  let area = 0,
    areaCompensation = 0,
    volume = 0,
    volumeCompensation = 0,
    degenerates = 0,
    duplicates = 0,
    collapsed = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i],
      b = indices[i + 1],
      c = indices[i + 2],
      triangle = [a, b, c];
    const triangleKey = [...triangle].sort((x, y) => x - y).join(',');
    if (faces.has(triangleKey)) duplicates++;
    else faces.add(triangleKey);
    const triangleAreaValue = triangleArea(p, a, b, c);
    if (triangleAreaValue <= areaTolerance) degenerates++;
    const correctedArea = triangleAreaValue - areaCompensation,
      nextArea = area + correctedArea;
    areaCompensation = nextArea - area - correctedArea;
    area = nextArea;
    const determinant =
      (p[a * 3] * (p[b * 3 + 1] * p[c * 3 + 2] - p[b * 3 + 2] * p[c * 3 + 1]) +
        p[a * 3 + 1] * (p[b * 3 + 2] * p[c * 3] - p[b * 3] * p[c * 3 + 2]) +
        p[a * 3 + 2] * (p[b * 3] * p[c * 3 + 1] - p[b * 3 + 1] * p[c * 3])) /
      6;
    const correctedVolume = determinant - volumeCompensation,
      nextVolume = volume + correctedVolume;
    volumeCompensation = nextVolume - volume - correctedVolume;
    volume = nextVolume;
    for (const vertex of triangle) used.add(vertex);
    if (a === b || b === c || c === a) {
      collapsed++;
      continue;
    }
    for (let corner = 0; corner < 3; corner++) {
      const v = triangle[corner],
        next = triangle[(corner + 1) % 3],
        other = triangle[(corner + 2) % 3];
      union(v, next);
      const link = links.get(v) ?? [];
      link.push([next, other]);
      links.set(v, link);
      const key = v < next ? `${v},${next}` : `${next},${v}`;
      const edge = edges.get(key) ?? { count: 0, orientation: 0 };
      edge.count++;
      edge.orientation += v < next ? 1 : v > next ? -1 : 0;
      edges.set(key, edge);
    }
  }
  let boundaryEdges = 0,
    nonManifoldEdges = 0,
    inconsistentEdges = 0;
  for (const edge of edges.values()) {
    if (edge.count === 1) boundaryEdges++;
    if (edge.count > 2) nonManifoldEdges++;
    if (edge.count === 2 && edge.orientation !== 0) inconsistentEdges++;
  }
  let nonManifoldVertices = 0;
  for (const [vertex, linkEdges] of links) {
    const adjacency = new Map<number, number[]>();
    let invalid = false;
    for (const [a, b] of linkEdges) {
      if (a === b || a === vertex || b === vertex) invalid = true;
      const aa = adjacency.get(a) ?? [];
      aa.push(b);
      adjacency.set(a, aa);
      const bb = adjacency.get(b) ?? [];
      bb.push(a);
      adjacency.set(b, bb);
    }
    let ends = 0;
    for (const neighbors of adjacency.values()) {
      if (neighbors.length === 1) ends++;
      else if (neighbors.length !== 2) invalid = true;
    }
    if (ends !== 0 && ends !== 2) invalid = true;
    const visited = new Set<number>(),
      pending = adjacency.size ? [adjacency.keys().next().value!] : [];
    while (pending.length) {
      const current = pending.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const n of adjacency.get(current) ?? []) if (!visited.has(n)) pending.push(n);
    }
    if (visited.size !== adjacency.size) invalid = true;
    if (invalid) nonManifoldVertices++;
  }
  const components = new Set([...used].map(find)).size,
    isolatedVertices = vertexCount - used.size;
  const volumeEligible =
    boundaryEdges === 0 &&
    nonManifoldEdges === 0 &&
    nonManifoldVertices === 0 &&
    inconsistentEdges === 0 &&
    collapsed === 0 &&
    degenerates === 0 &&
    duplicates === 0;
  const diagnostics: Diagnostic[] = [];
  function diagnostic(
    id: string,
    label: string,
    value: number,
    message: string,
    method: string,
    severity: Diagnostic['severity'] = value ? 'warning' : 'info'
  ): void {
    diagnostics.push({ id: `mesh-${id}`, severity, label, value, message, method });
  }
  diagnostic(
    'boundary',
    'Boundary edges',
    boundaryEdges,
    'Edges incident to exactly one index-distinct triangle; collapsed triangles are excluded. An open surface is accepted for inspection.',
    'Undirected nonloop indexed-edge incidence count = 1; repeated-index triangles excluded.'
  );
  diagnostic(
    'nonmanifold-edges',
    'Non-manifold edge incidence',
    nonManifoldEdges,
    'Edges incident to more than two index-distinct triangles; no geometry is repaired.',
    'Undirected nonloop indexed-edge incidence count > 2; repeated-index triangles excluded.'
  );
  diagnostic(
    'nonmanifold-vertices',
    'Non-manifold vertex links',
    nonManifoldVertices,
    'Vertices with incidence triangles whose link is not one connected cycle or path. Vertices used only by collapsed triangles have no tested link.',
    'Link multigraph of index-distinct triangles: connectivity, no loops, every degree 2 (cycle), or exactly two degree-1 ends (path).'
  );
  diagnostic(
    'orientation',
    'Inconsistent shared-edge orientation',
    inconsistentEdges,
    'Two incident triangles traverse their common edge in the same direction.',
    'Directed edge signs on edges with incidence exactly 2; repeated-index triangles excluded.'
  );
  diagnostic(
    'degenerate',
    'Degenerate triangles',
    degenerates,
    'All triangles at or below the area threshold, including collapsed triangles. Collinear index-distinct triangles remain in incidence; collapsed triangles do not.',
    'Cross-product area <= maximum bounding-box extent² × 1e-14. Extent includes every declared vertex, including unused vertices.'
  );
  diagnostics[diagnostics.length - 1].tolerance = areaTolerance;
  diagnostics[diagnostics.length - 1].units = 'triangles';
  diagnostics[diagnostics.length - 1].toleranceUnits = 'm²';
  diagnostic(
    'collapsed',
    'Collapsed repeated-index triangles',
    collapsed,
    'Triangles with fewer than three distinct vertex indices are preserved in raw counts but excluded from edge/link/orientation incidence and connectivity edges.',
    'Count raw triangles with fewer than three distinct vertex indices; used raw vertices remain in the used-vertex component count.'
  );
  diagnostics[diagnostics.length - 1].units = 'triangles';
  diagnostic(
    'duplicates',
    'Duplicate indexed triangles',
    duplicates,
    'Repeated unordered vertex triples after the first occurrence, irrespective of winding.',
    'Canonical sorted index triple; geometric coincidence across distinct indices is not detected.'
  );
  diagnostic(
    'isolated',
    'Isolated declared vertices',
    isolatedVertices,
    'Declared vertices unused by any triangle; retained without welding or removal.',
    'Declared vertex count minus number of indices used.'
  );
  diagnostic(
    'components',
    'Connected used-vertex components',
    components,
    'Raw used vertices connected by index-distinct triangle edges; vertices used only by collapsed triangles may form singleton components. Unused vertices are counted separately.',
    'Union-find on noncollapsed triangle edges; components among all raw used vertex identities.',
    components > 1 ? 'warning' : 'info'
  );
  diagnostics.push({
    id: 'mesh-scope',
    severity: 'info',
    label: 'Local mesh inspection scope',
    message:
      'No global self-intersection, geometric overlap, orientability repair, enclosed-solid, material, or structural validity certificate is provided. Source notes are informational metadata.',
    method:
      'Mesh inspection v1; index incidence and vertex-link checks exclude repeated-index collapsed triangles. Area sums all raw triangles. Euler = all declared V − unique nonloop incidence E + index-distinct incidence F; includes unused vertices and collinear index-distinct triangles.',
  });
  diagnostics.push({
    id: 'mesh-volume',
    severity: 'info',
    label: 'Signed oriented volume',
    ...(volumeEligible ? { value: volume, units: 'm³' } : {}),
    message: volumeEligible
      ? 'Algebraic signed volume passes the listed local eligibility checks; intersections/overlap are not tested and disconnected shells may cancel.'
      : 'Unavailable: requires no boundary, incidence/link defects, orientation inconsistencies, duplicates, collapsed triangles, or degenerate triangles.',
    method:
      'Compensated sum of centered origin-tetrahedron determinants / 6. This is not a global intersection or enclosed-solid certificate.',
  });
  return {
    statistics: {
      vertices: vertexCount,
      usedVertices: used.size,
      triangles: indices.length / 3,
      incidenceTriangles: indices.length / 3 - collapsed,
      collapsedTriangles: collapsed,
      edges: edges.size,
      components,
      boundaryEdges,
      nonManifoldEdges,
      nonManifoldVertices,
      inconsistentEdges,
      degenerateTriangles: degenerates,
      duplicateTriangles: duplicates,
      isolatedVertices,
      euler: vertexCount - edges.size + indices.length / 3 - collapsed,
      areaM2: area,
      boundsMin: box.min,
      boundsMax: box.max,
      extent: box.extent,
      signedVolumeM3: volumeEligible ? volume : null,
    },
    diagnostics,
  };
}

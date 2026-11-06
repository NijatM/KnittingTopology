import { describe, expect, it } from 'vitest';
import type { ImportedMeshData, MeshUnit } from '../../src/core/types';
import {
  analyzeImportedMesh,
  importedMeshSize,
  MAX_IMPORTED_TRIANGLES,
  MAX_IMPORTED_VERTICES,
  MAX_IMPORT_BYTES,
  MAX_TRIANGULATION_WORK,
  MESH_UNIT_SCALE,
  parseMeshFile,
  validateImportedMesh,
} from '../../src/import/mesh';

const buffer = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer as ArrayBuffer;
function obj(text: string, unit: MeshUnit = 'm') {
  return parseMeshFile(buffer(text), { name: 'fixture.obj', format: 'obj', unit });
}
const plane = 'v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4';
const cube = [
  'v -1 -1 -1',
  'v 1 -1 -1',
  'v 1 1 -1',
  'v -1 1 -1',
  'v -1 -1 1',
  'v 1 -1 1',
  'v 1 1 1',
  'v -1 1 1',
  'f 1 4 3 2',
  'f 5 6 7 8',
  'f 1 2 6 5',
  'f 2 3 7 6',
  'f 3 4 8 7',
  'f 4 1 5 8',
].join('\n');
type Triangle = [number[], number[], number[]];
const facetA: Triangle = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
];
const facetB: Triangle = [
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
];
function ascii(triangles: Triangle[]): ArrayBuffer {
  return buffer(
    `solid sample\n${triangles.map((t) => `facet normal 0 0 1\nouter loop\n${t.map((v) => `vertex ${v.join(' ')}`).join('\n')}\nendloop\nendfacet`).join('\n')}\nendsolid sample`
  );
}
function binary(triangles: Triangle[], header = 'binary sample'): ArrayBuffer {
  const result = new ArrayBuffer(84 + triangles.length * 50),
    bytes = new Uint8Array(result),
    view = new DataView(result);
  bytes.set(new TextEncoder().encode(header).subarray(0, 80));
  view.setUint32(80, triangles.length, true);
  triangles.forEach((triangle, index) => {
    view.setFloat32(84 + index * 50 + 8, 1, true);
    triangle.flat().forEach((v, j) => view.setFloat32(84 + index * 50 + 12 + j * 4, v, true));
  });
  return result;
}
function stl(data: ArrayBuffer) {
  return parseMeshFile(data, { name: 'fixture.stl', format: 'stl', unit: 'm' });
}
const copy = (mesh: ImportedMeshData): ImportedMeshData => JSON.parse(JSON.stringify(mesh));

describe('bounded OBJ geometry import', () => {
  it('measures an oriented analytic cube without splitting shared graph identities', () => {
    const { mesh, size } = obj(cube),
      { statistics: s, diagnostics } = analyzeImportedMesh(mesh);
    expect(size).toBe(2);
    expect(s).toMatchObject({
      vertices: 8,
      usedVertices: 8,
      edges: 18,
      triangles: 12,
      euler: 2,
      components: 1,
      boundaryEdges: 0,
      nonManifoldEdges: 0,
      nonManifoldVertices: 0,
      inconsistentEdges: 0,
      degenerateTriangles: 0,
      duplicateTriangles: 0,
      isolatedVertices: 0,
    });
    expect(s.areaM2).toBeCloseTo(24, 12);
    expect(s.signedVolumeM3).toBeCloseTo(8, 12);
    expect(diagnostics.find((d) => d.id === 'mesh-volume')?.message).toMatch(/not tested/);
  });
  it('measures the open analytic plane and does not report volume', () => {
    const { statistics: s } = analyzeImportedMesh(obj(plane).mesh);
    expect(s).toMatchObject({
      vertices: 4,
      triangles: 2,
      edges: 5,
      boundaryEdges: 4,
      euler: 1,
      nonManifoldVertices: 0,
      signedVolumeM3: null,
    });
    expect(s.areaM2).toBeCloseTo(1, 14);
  });
  it.each(['mm', 'cm', 'm', 'in'] as const)(
    'uses declared %s units without axis changes or normalization',
    (unit) => {
      const { mesh, size } = obj('v 10 20 30\nv 12 20 30\nv 10 23 30\nf 1 2 3', unit),
        scale = MESH_UNIT_SCALE[unit];
      expect(size).toBeCloseTo(3 * scale, 12);
      [11, 21.5, 30].forEach((value, axis) =>
        expect(mesh.source.centerMeters[axis]).toBeCloseTo(value * scale, 12)
      );
      expect(mesh.positions[0]).toBeCloseTo(-scale, 12);
      expect(mesh.positions[1]).toBeCloseTo(-1.5 * scale, 12);
      expect(mesh.positions[2]).toBe(0);
      expect(importedMeshSize(mesh)).toBeCloseTo(size, 12);
      expect(analyzeImportedMesh(mesh).statistics.areaM2).toBeCloseTo(3 * scale * scale, 12);
    }
  );
  it('preserves OBJ declared indices, coincident vertices, and isolated vertices', () => {
    const { mesh } = obj('v 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 0 0\nv 0 0 0\nf 1 2 3\nf 4 3 2');
    expect(mesh.indices).toEqual([0, 1, 2, 3, 2, 1]);
    expect(mesh.positions).toHaveLength(15);
    expect(analyzeImportedMesh(mesh).statistics).toMatchObject({
      isolatedVertices: 1,
      duplicateTriangles: 0,
      euler: 2,
    });
  });
  it('centers source-offset sweeps at meter and millimeter extents without promising recovered precision', () => {
    for (const [extent, offsets] of [
      [1, [1e5, 1e6, 1e7, 1e8, 999999990]],
      [1e-3, [1e2, 1e3, 1e4, 1e5, 1e6]],
    ] as const) {
      for (const offsetBase of offsets) {
        const offset = offsetBase + 0.1234567;
        const original = [
          offset,
          -offset,
          offset,
          offset + extent,
          -offset,
          offset,
          offset,
          -offset + extent,
          offset,
        ];
        const { mesh, size } = obj(
          `${[0, 3, 6].map((i) => `v ${original.slice(i, i + 3).join(' ')}`).join('\n')}\nf 1 2 3`
        );
        const report = analyzeImportedMesh(mesh),
          tolerance = Math.max(1e-12, size * 1e-10);
        report.statistics.boundsMin.forEach((value, axis) =>
          expect(Math.abs(value + report.statistics.boundsMax[axis])).toBeLessThanOrEqual(tolerance)
        );
        expect(Math.abs(size / extent - 1)).toBeLessThan(1e-6);
        mesh.positions.forEach((value, i) =>
          expect(
            Math.abs(value + mesh.source.centerMeters[i % 3] - original[i])
          ).toBeLessThanOrEqual(Math.max(1e-12, Math.abs(original[i]) * Number.EPSILON * 2))
        );
        expect(mesh.source.notes.some((note) => note.startsWith('Large source offset'))).toBe(
          Math.max(...mesh.source.centerMeters.map(Math.abs)) / size > 1e7
        );
        expect(validateImportedMesh(copy(mesh))).toEqual(mesh);
      }
    }
  });
  it('accepts CRLF and ASCII tabs while slicing a comment as one semantic remainder', () => {
    const { mesh } = obj(
      'v\t0 0 0\r\nv 1 0 0\r\nv 0 1 0\r\n# ignored f 99 99 99\r\nf 1\t2 3 # f 99 99 99\r\n'
    );
    expect(mesh.indices).toEqual([0, 1, 2]);
  });
  it.each([
    '# comment\rf 1 2 3',
    '# comment\u0085f 1 2 3',
    'f 1 2\u00a03',
    'f 1 2 3\u20284',
    'f 1 2 3\u20294',
    'f 1 2 3\r',
    'g group \\\nf 1 2 3',
    'mtllib material \\\nf 1 2 3',
  ])('rejects ambiguous OBJ whitespace or continuation: %j', (statement) => {
    expect(() => obj(`v 0 0 0\nv 1 0 0\nv 0 1 0\n${statement}`)).toThrow(/ASCII|continuations/);
  });
  it('triangulates a concave polygon with negative indices and ignored UV/normal/material data', () => {
    const text =
      'v 0 0 0\nv 2 0 0\nv 2 1 0\nv 1 1 0\nv 1 2 0\nv 0 2 0\nvt 0 0\nvn 0 0 1\nmtllib example.mtl\nusemtl red\nf -6/1/1 -5/1/1 -4/1/1 -3/1/1 -2/1/1 -1/1/1';
    const { mesh } = obj(text),
      s = analyzeImportedMesh(mesh).statistics;
    expect(s).toMatchObject({ triangles: 4, boundaryEdges: 6, nonManifoldVertices: 0 });
    expect(s.areaM2).toBeCloseTo(3, 12);
    expect(mesh.source.notes.join(' ')).toMatch(/Normals and materials are ignored/);
  });
  it('preserves reversed polygon orientation', () => {
    const { mesh } = obj('v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 4//1 3//1 2//1 1//1');
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const [a, b, c] = mesh.indices
        .slice(i, i + 3)
        .map((v) => mesh.positions.slice(v * 3, v * 3 + 3));
      expect((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])).toBeLessThan(0);
    }
  });
  it.each([
    ['zero index', 'f 0 2 3'],
    ['out-of-range index', 'f 1 2 9'],
    ['negative range', 'f -4 -2 -1'],
    ['fractional index', 'f 1.5 2 3'],
    ['bad slash syntax', 'f 1/ 2 3'],
    ['unsupported lines', 'l 1 2'],
    ['unsupported points', 'p 1'],
    ['unsupported freeform', 'surf 0 1 0 1 1 2 3'],
    ['unsupported call', 'call other.obj'],
  ])('rejects %s explicitly', (_, face) => {
    expect(() => obj(`v 0 0 0\nv 1 0 0\nv 0 1 0\n${face}`)).toThrow(/Mesh import/);
  });
  it('rejects self-crossing, self-touching and nonplanar polygons', () => {
    expect(() => obj('v 0 0 0\nv 1 1 0\nv 0 1 0\nv 1 0 0\nf 1 2 3 4')).toThrow(
      /self-crossing|ambiguous/
    );
    expect(() => obj('v 0 0 0\nv 2 0 0\nv 2 2 0\nv 1 0 0\nv 0 2 0\nf 1 2 3 4 5')).toThrow(
      /crossing|touching/
    );
    expect(() => obj('v 0 0 0\nv 1 0 0\nv 1 1 0.1\nv 0 1 0\nf 1 2 3 4')).toThrow(/nonplanar/);
    expect(() => obj('v 0 0 0\nv 1 0 0\nv 1 1 0\nf 1 2 3 1')).toThrow(/repeats/);
  });
  it('rejects unsupported homogeneous weights and vertex colors', () => {
    expect(() => obj('v 0 0 0 2')).toThrow(/weights/);
    expect(() => obj('v 0 0 0 1 0 0')).toThrow(/colors/);
  });
  it.each(['NaN', 'Infinity', '1e999', '0xff'])(
    'rejects invalid decimal coordinate %s',
    (value) => {
      expect(() => obj(`v ${value} 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3`)).toThrow(/finite/);
    }
  );
  it('rejects geometry with no nondegenerate triangle and enforces physical extent limits', () => {
    expect(() => obj('v 0 0 0\nv 1 0 0\nv 2 0 0\nf 1 2 3')).toThrow(/all triangles are degenerate/);
    expect(() => obj('v 0 0 0\nv 1e-7 0 0\nv 0 1e-7 0\nf 1 2 3')).toThrow(/extent/);
    expect(() => obj('v 0 0 0\nv 1001 0 0\nv 0 1 0\nf 1 2 3')).toThrow(/extent/);
    expect(() => obj('v 1e10 0 0\nv 1e10 1 0\nv 1e10 0 1\nf 1 2 3')).toThrow(/source coordinates/);
  });
  it('caps polygon count before triangulation', () => {
    expect(() => obj(`v 0 0 0\nf ${Array(257).fill('1').join(' ')}`)).toThrow(/3–256/);
  });
  it('enforces cumulative actual triangulation work across polygons deterministically', () => {
    const vertices = Array.from(
      { length: 256 },
      (_, i) => `v ${Math.cos((i / 256) * Math.PI * 2)} ${Math.sin((i / 256) * Math.PI * 2)} 0`
    ).join('\n');
    const face = `f ${Array.from({ length: 256 }, (_, i) => i + 1).join(' ')}\n`;
    expect(obj(`${vertices}\n${face}`).mesh.indices).toHaveLength(254 * 3);
    expect(() => obj(`${vertices}\n${face.repeat(50)}`)).toThrow(
      `cumulative polygon triangulation work exceeds ${MAX_TRIANGULATION_WORK} operations`
    );
  });
  it('enforces OBJ vertex and triangle limits during parsing', () => {
    expect(() => obj('v 0 0 0\n'.repeat(MAX_IMPORTED_VERTICES + 1))).toThrow(/vertex limit/);
    expect(() =>
      obj(`v 0 0 0\nv 1 0 0\nv 0 1 0\n${'f 1 2 3\n'.repeat(MAX_IMPORTED_TRIANGLES + 1)}`)
    ).toThrow(/triangle limit/);
  });
  it('rejects excessive bytes, oversized text lines, invalid encoding and empty input', () => {
    expect(() => obj('')).toThrow(/bytes/);
    expect(() => obj('#'.repeat(65537))).toThrow(/65536/);
    expect(() =>
      parseMeshFile(new ArrayBuffer(MAX_IMPORT_BYTES + 1), {
        name: 'big.obj',
        format: 'obj',
        unit: 'm',
      })
    ).toThrow(/bytes/);
    expect(() =>
      parseMeshFile(new Uint8Array([255]).buffer, { name: 'bad.obj', format: 'obj', unit: 'm' })
    ).toThrow(/UTF-8/);
  });
  it('cooperates with cancellation and reports completion', () => {
    const progress: number[] = [];
    parseMeshFile(
      buffer(plane),
      { name: 'a.obj', format: 'obj', unit: 'm' },
      { progress: (fraction) => progress.push(fraction) }
    );
    expect(progress.at(-1)).toBe(1);
    expect(progress.every((v, i) => !i || v >= progress[i - 1])).toBe(true);
    expect(() =>
      parseMeshFile(
        buffer(plane),
        { name: 'a.obj', format: 'obj', unit: 'm' },
        { cancelled: () => true }
      )
    ).toThrowError(expect.objectContaining({ name: 'AbortError' }));
  });
});

describe('bounded STL import', () => {
  it.each(['ascii', 'binary'] as const)(
    'imports %s STL and exactly welds shared positions',
    (format) => {
      const { mesh } = stl(format === 'ascii' ? ascii([facetA, facetB]) : binary([facetA, facetB]));
      expect(mesh.source.format).toBe(`stl-${format}`);
      expect(mesh.source.indexing).toBe('stl-exact-weld');
      expect(mesh.positions).toHaveLength(12);
      expect(mesh.indices).toEqual([0, 1, 2, 1, 3, 2]);
      expect(analyzeImportedMesh(mesh).statistics.areaM2).toBe(1);
    }
  );
  it('treats an exact-sized binary STL beginning with solid as binary', () => {
    expect(stl(binary([facetA], 'solid misleading header')).mesh.source.format).toBe('stl-binary');
  });
  it('does not tolerance-weld nearby ASCII coordinates', () => {
    const near: Triangle = [
      [1 + 1e-10, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ];
    expect(stl(ascii([facetA, near])).mesh.positions).toHaveLength(15);
  });
  it('canonicalizes signed zero for exact welding', () => {
    const text = new TextDecoder()
      .decode(ascii([facetA, facetA]))
      .replace('vertex 0 0 0', 'vertex -0 0 -0');
    const mesh = stl(buffer(text)).mesh;
    expect(mesh.positions).toHaveLength(9);
    expect(mesh.indices).toEqual([0, 1, 2, 0, 1, 2]);
  });
  it.each(['ascii', 'binary'] as const)(
    'retains collapsed %s STL facets without adding incidence loops or edges',
    (format) => {
      const collapsed: Triangle = [
        [0, 0, 0],
        [0, 0, 0],
        [1, 0, 0],
      ];
      const { mesh } = stl(
        format === 'ascii' ? ascii([facetA, collapsed]) : binary([facetA, collapsed])
      );
      expect(mesh.indices).toEqual([0, 1, 2, 0, 0, 1]);
      expect(analyzeImportedMesh(mesh).statistics).toMatchObject({
        vertices: 3,
        usedVertices: 3,
        triangles: 2,
        incidenceTriangles: 1,
        collapsedTriangles: 1,
        degenerateTriangles: 1,
        edges: 3,
        euler: 1,
        boundaryEdges: 3,
        nonManifoldEdges: 0,
        nonManifoldVertices: 0,
        components: 1,
        signedVolumeM3: null,
      });
    }
  );
  it('rejects count mismatch, truncation and trailing binary bytes', () => {
    const original = binary([facetA], 'solid header');
    expect(() => stl(original.slice(0, -1))).toThrow(/Mesh import/);
    const badCount = original.slice(0);
    new DataView(badCount).setUint32(80, 10, true);
    expect(() => stl(badCount)).toThrow(/Mesh import/);
    const trailing = new Uint8Array(original.byteLength + 1);
    trailing.set(new Uint8Array(original));
    expect(() => stl(trailing.buffer)).toThrow(/Mesh import/);
    const hostile = new ArrayBuffer(84);
    new DataView(hostile).setUint32(80, 0xffffffff, true);
    expect(() => stl(hostile)).toThrow(/Mesh import/);
  });
  it('rejects nonfinite binary coordinates and normals', () => {
    for (const offset of [84, 96]) {
      const data = binary([facetA]);
      new DataView(data).setFloat32(offset, NaN, true);
      expect(() => stl(data)).toThrow(/finite/);
    }
  });
  it('checks the binary triangle cap before reading facet payloads', () => {
    const data = new ArrayBuffer(84 + (MAX_IMPORTED_TRIANGLES + 1) * 50);
    new DataView(data).setUint32(80, MAX_IMPORTED_TRIANGLES + 1, true);
    expect(() => stl(data)).toThrow(/excessive binary STL facet count/);
  });
  it.each([
    ['missing endfacet', (text: string) => text.replace('endfacet', '')],
    ['missing endsolid', (text: string) => text.replace('endsolid sample', '')],
    ['extra vertex', (text: string) => text.replace('endloop', 'vertex 1 1 0\nendloop')],
    ['trailing data', (text: string) => `${text}\nfacet normal 0 0 1`],
    ['missing outer loop', (text: string) => text.replace('outer loop', '')],
  ])('rejects malformed ASCII STL: %s', (_, edit) => {
    expect(() => stl(buffer(edit(new TextDecoder().decode(ascii([facetA])))))).toThrow(/ASCII STL/);
  });
});

describe('local topology inspection and safe saved payloads', () => {
  it('distinguishes a non-manifold edge from an open boundary', () => {
    const { mesh } = obj('v 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 -1 0\nv 0 0 1\nf 1 2 3\nf 2 1 4\nf 1 2 5');
    expect(analyzeImportedMesh(mesh).statistics).toMatchObject({
      nonManifoldEdges: 1,
      nonManifoldVertices: 2,
      boundaryEdges: 6,
      signedVolumeM3: null,
    });
  });
  it('detects a bow-tie vertex even though all edge incidences are at most two', () => {
    const { mesh } = obj('v 0 0 0\nv 1 0 0\nv 0 1 0\nv -1 0 0\nv 0 -1 0\nf 1 2 3\nf 1 4 5');
    expect(analyzeImportedMesh(mesh).statistics).toMatchObject({
      nonManifoldEdges: 0,
      nonManifoldVertices: 1,
      components: 1,
      signedVolumeM3: null,
    });
  });
  it('detects duplicate faces independent of winding and prevents a volume claim', () => {
    const { mesh } = obj('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\nf 3 2 1');
    expect(analyzeImportedMesh(mesh).statistics).toMatchObject({
      duplicateTriangles: 1,
      boundaryEdges: 0,
      signedVolumeM3: null,
    });
  });
  it('detects winding inconsistency and preserves the signed volume of a reversed closed cube', () => {
    expect(
      analyzeImportedMesh(obj(cube.replace('f 1 4 3 2', 'f 2 3 4 1')).mesh).statistics
        .inconsistentEdges
    ).toBe(4);
    const reversed = cube
      .split('\n')
      .map((line) =>
        line.startsWith('f ') ? `f ${line.slice(2).split(' ').reverse().join(' ')}` : line
      )
      .join('\n');
    expect(analyzeImportedMesh(obj(reversed).mesh).statistics.signedVolumeM3).toBeCloseTo(-8, 12);
  });
  it('excludes collapsed cube facets from incidence and volume eligibility while preserving raw data', () => {
    const baseline = analyzeImportedMesh(obj(cube).mesh).statistics;
    const { mesh } = obj(`${cube}\nf 1 1 2`),
      s = analyzeImportedMesh(mesh).statistics;
    expect(mesh.indices).toHaveLength(39);
    expect(s).toMatchObject({
      triangles: 13,
      incidenceTriangles: 12,
      collapsedTriangles: 1,
      degenerateTriangles: 1,
      edges: baseline.edges,
      euler: baseline.euler,
      boundaryEdges: 0,
      nonManifoldEdges: 0,
      nonManifoldVertices: 0,
      inconsistentEdges: 0,
      signedVolumeM3: null,
    });
  });
  it('keeps raw vertices used only in collapsed triangles as separate used components', () => {
    const { mesh } = obj(`${plane}\nv 0.2 0.2 0\nv 0.3 0.2 0\nf 5 5 6`);
    expect(analyzeImportedMesh(mesh).statistics).toMatchObject({
      vertices: 6,
      usedVertices: 6,
      isolatedVertices: 0,
      triangles: 3,
      incidenceTriangles: 2,
      collapsedTriangles: 1,
      edges: 5,
      components: 3,
      euler: 3,
    });
  });
  it('reports disconnected used components separately from isolated declared vertices', () => {
    const { mesh } = obj(
      'v 0 0 0\nv 1 0 0\nv 0 1 0\nv 2 0 0\nv 3 0 0\nv 2 1 0\nv 0 0 0\nf 1 2 3\nf 4 5 6'
    );
    expect(analyzeImportedMesh(mesh).statistics).toMatchObject({
      components: 2,
      isolatedVertices: 1,
      euler: 3,
    });
  });
  it('retains mixed degenerate geometry and publishes the actual area tolerance', () => {
    const { mesh } = obj('v 0 0 0\nv 1 0 0\nv 0 1 0\nv 0.5 0 0\nf 1 2 3\nf 1 4 2\nf 1 1 2');
    const report = analyzeImportedMesh(mesh);
    expect(report.statistics).toMatchObject({
      degenerateTriangles: 2,
      collapsedTriangles: 1,
      incidenceTriangles: 2,
      edges: 5,
      euler: 1,
      areaM2: 0.5,
      signedVolumeM3: null,
    });
    expect(report.diagnostics.find((d) => d.id === 'mesh-degenerate')).toMatchObject({
      tolerance: 1e-14,
      units: 'triangles',
      toleranceUnits: 'm²',
    });
  });
  it('documents how unused declared vertices affect the global extent-based area tolerance', () => {
    const text =
      'v 0 0 0\nv 1 0 0\nv 0 1 0\nv 0.001 0 0\nv 0.00101 0 0\nv 0.001 0.0001 0\nf 1 2 3\nf 4 5 6';
    const baseline = analyzeImportedMesh(obj(text).mesh),
      extended = analyzeImportedMesh(obj(`${text}\nv 999 0 0`).mesh);
    expect(baseline.statistics.degenerateTriangles).toBe(0);
    expect(extended.statistics).toMatchObject({
      degenerateTriangles: 1,
      isolatedVertices: 1,
      incidenceTriangles: 2,
      collapsedTriangles: 0,
    });
    expect(extended.diagnostics.find((d) => d.id === 'mesh-degenerate')?.method).toMatch(
      /including unused vertices/
    );
  });
  it('round-trips numeric payloads without mutation, removes unknown properties and clones all arrays', () => {
    const mesh = obj(cube).mesh,
      before = JSON.stringify(mesh);
    const validated = validateImportedMesh({
      ...mesh,
      untrustedReport: { volume: 999 },
      source: { ...mesh.source, unknown: 'ignored' },
    });
    expect(validated).toEqual(mesh);
    expect(JSON.stringify(mesh)).toBe(before);
    expect(validated.positions).not.toBe(mesh.positions);
    expect(validated.indices).not.toBe(mesh.indices);
    expect(validated.source.notes).not.toBe(mesh.source.notes);
    expect(validated.source.centerMeters).not.toBe(mesh.source.centerMeters);
    expect(analyzeImportedMesh(validateImportedMesh(JSON.parse(before)))).toEqual(
      analyzeImportedMesh(mesh)
    );
  });
  it('rejects forged saved notes and STL metadata with unused vertices', () => {
    const mesh = obj(plane).mesh;
    expect(() =>
      validateImportedMesh({
        ...mesh,
        source: { ...mesh.source, notes: ['Validated for manufacture'] },
      })
    ).toThrow(/recognized importer wording/);
    expect(() =>
      validateImportedMesh({
        ...mesh,
        source: { ...mesh.source, notes: ['Ignored appearance/group statements: vn, bad.'] },
      })
    ).toThrow(/recognized importer wording/);
    expect(() =>
      validateImportedMesh({
        ...mesh,
        source: { ...mesh.source, notes: ['Ignored appearance/group statements: vn, g.'] },
      })
    ).toThrow(/recognized importer wording/);
    const stlMesh = stl(binary([facetA])).mesh;
    expect(() =>
      validateImportedMesh({ ...stlMesh, positions: [...stlMesh.positions, 0, 0, 0] })
    ).toThrow(/STL metadata cannot contain unused/);
    // Identical saved positions can result from precision loss during conversion;
    // raw STL index usage, rather than coordinate uniqueness, is the invariant.
    const coincident = copy(stlMesh);
    coincident.positions.push(...coincident.positions.slice(0, 3));
    coincident.indices.push(3, 1, 2);
    expect(validateImportedMesh(coincident)).toEqual(coincident);
  });
  it.each([
    [
      'out of range index',
      (m: ImportedMeshData) => {
        m.indices[0] = 999;
      },
    ],
    [
      'fractional index',
      (m: ImportedMeshData) => {
        m.indices[0] = 0.5;
      },
    ],
    [
      'nonfinite position',
      (m: ImportedMeshData) => {
        m.positions[0] = Infinity;
      },
    ],
    [
      'noncentered positions',
      (m: ImportedMeshData) => {
        m.positions = m.positions.map((v, i) => (i % 3 === 0 ? v + 1 : v));
      },
    ],
    [
      'scale mismatch',
      (m: ImportedMeshData) => {
        m.source.scaleToMeters = 1000;
      },
    ],
    [
      'indexing mismatch',
      (m: ImportedMeshData) => {
        m.source.indexing = 'stl-exact-weld';
      },
    ],
    [
      'nonfinite source center',
      (m: ImportedMeshData) => {
        m.source.centerMeters[0] = NaN;
      },
    ],
    [
      'oversized name',
      (m: ImportedMeshData) => {
        m.source.name = 'a'.repeat(256);
      },
    ],
    [
      'control character name',
      (m: ImportedMeshData) => {
        m.source.name = 'bad\n.obj';
      },
    ],
    [
      'oversized notes',
      (m: ImportedMeshData) => {
        m.source.notes = ['a'.repeat(513)];
      },
    ],
  ])('rejects unsafe saved payload: %s', (_, edit) => {
    const mesh = copy(obj(cube).mesh);
    edit(mesh);
    expect(() => validateImportedMesh(mesh)).toThrow(/Mesh import/);
  });
  it('rejects array bounds before traversing the contents and rejects missing metadata', () => {
    const mesh = obj(plane).mesh;
    expect(() =>
      validateImportedMesh({ ...mesh, positions: new Array((MAX_IMPORTED_VERTICES + 1) * 3) })
    ).toThrow(/vertex array/);
    expect(() =>
      validateImportedMesh({ ...mesh, indices: new Array((MAX_IMPORTED_TRIANGLES + 1) * 3) })
    ).toThrow(/triangle array/);
    expect(() => validateImportedMesh({ ...mesh, source: null })).toThrow(/metadata/);
    expect(() => validateImportedMesh(null)).toThrow(/payload/);
  });
  it('rejects sparse arrays even when they occur only in metadata', () => {
    const mesh = obj(plane).mesh;
    expect(() => validateImportedMesh({ ...mesh, positions: new Array(12) })).toThrow(/finite/);
    expect(() =>
      validateImportedMesh({ ...mesh, source: { ...mesh.source, centerMeters: new Array(3) } })
    ).toThrow(/source center/);
    expect(() =>
      validateImportedMesh({ ...mesh, source: { ...mesh.source, notes: new Array(1) } })
    ).toThrow(/source notes/);
  });
});

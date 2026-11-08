import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildSurfaceMesh, evaluateSurface, projectToSurface } from '../core/surfaces';
import {
  hasRectangularMapping,
  mappedUVAtTriangle,
  mappedUVPath,
  evaluateMappedSurface,
} from '../import/uv-mapping';
import type {
  GraphEdge,
  GuideSample,
  PatternGraph,
  SurfaceMesh,
  SurfaceSpec,
  Vec2,
  Vec3,
} from '../core/types';
import type { GraphEditTarget, SurfaceViewerProps, ViewerHandle } from './types';

/** The viewer never writes scientific state: picked samples are returned to the app. */
type Runtime = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  surfaceGroup: THREE.Group;
  graphGroup: THREE.Group;
  guideGroup: THREE.Group;
  selectionGroup: THREE.Group;
  draftGroup: THREE.Group;
  surfaceMesh: THREE.Mesh | null;
  meshData: SurfaceMesh | null;
  cellMesh: THREE.Mesh | null;
  cellIds: string[];
  edgePickPaths: { id: string; path: Vec3[] }[];
  draw: () => void;
  fit: () => void;
  resize: () => void;
};
const v3 = (p: Vec3) => new THREE.Vector3(...p);
const tuple = (p: THREE.Vector3): Vec3 => [p.x, p.y, p.z];
// Render-only radial lift: 0.15% of sphere radius (0.135 mm at Ø180 mm).
// Straight display segments approximate embedded curves and can otherwise sink
// slightly behind the independently tessellated surface on native Metal GPUs.
// On a sphere this scale is exactly an outward analytic-normal displacement.
// Scientific coordinates, surface picking, attachments and exports stay intact.
const SPHERE_DISPLAY_SCALE = 1.0015;

function clear(group: THREE.Group) {
  group.traverse((object) => {
    const drawable = object as THREE.Mesh;
    drawable.geometry?.dispose();
    const materials = Array.isArray(drawable.material) ? drawable.material : [drawable.material];
    materials.forEach((material) => material?.dispose());
  });
  group.clear();
}
function geometry(points: number[]) {
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return result;
}
function lineSegments(
  group: THREE.Group,
  points: number[],
  color: THREE.ColorRepresentation,
  opacity = 1,
  colors?: number[]
) {
  if (!points.length) return;
  const geo = geometry(points);
  if (colors) geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    vertexColors: !!colors,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(geo, material);
  lines.renderOrder = 2;
  group.add(lines);
  return lines;
}
function pointsObject(
  group: THREE.Group,
  positions: number[],
  color: THREE.ColorRepresentation,
  size = 4,
  colors?: number[]
) {
  if (!positions.length) return;
  const geo = geometry(positions);
  if (colors) geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color,
      size,
      sizeAttenuation: false,
      vertexColors: !!colors,
      depthWrite: false,
    })
  );
  points.renderOrder = 3;
  group.add(points);
}
function appendPath(segments: number[], path: Vec3[]) {
  for (let i = 1; i < path.length; i++) segments.push(...path[i - 1], ...path[i]);
}
function embeddedPath(surface: SurfaceSpec, path: Vec3[], samples = 6): Vec3[] {
  // Mapped paths already include source-triangle crossings. Never reproject or
  // resample their world chords: a folded support can have ambiguous projections.
  if (hasRectangularMapping(surface)) return path;
  const result: Vec3[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = v3(path[i - 1]);
    const b = v3(path[i]);
    // Analytic projection is core-owned. Densification makes spherical edges visible
    // without replacing the graph's scientific embedded paths or measurements.
    for (let j = 0; j < samples; j++) {
      result.push(projectToSurface(surface, tuple(a.clone().lerp(b, j / samples))).position);
    }
  }
  if (path.length) result.push(path[path.length - 1]);
  return result;
}
function edgePath(surface: SurfaceSpec, edge: GraphEdge, nodes: Map<string, Vec3>) {
  if (hasRectangularMapping(surface)) return edge.path || [];
  if (edge.path && edge.path.length > 1)
    return embeddedPath(
      surface,
      edge.path,
      surface.kind === 'sphere' || surface.kind === 'saddle' ? 3 : 1
    );
  const a = nodes.get(edge.a),
    b = nodes.get(edge.b);
  return a && b ? embeddedPath(surface, [a, b], 12) : [];
}
function supportsGuides(surface: SurfaceSpec) {
  return surface.kind !== 'mesh' || hasRectangularMapping(surface);
}
function guidePath(surface: SurfaceSpec, samples: GuideSample[]): Vec3[] {
  if (!hasRectangularMapping(surface))
    return embeddedPath(
      surface,
      samples.map((sample) => sample.position),
      4
    );
  const path: Vec3[] = [];
  for (let i = 1; i < samples.length; i++) {
    const segment = mappedUVPath(surface, samples[i - 1].attachment.uv, samples[i].attachment.uv);
    path.push(...(path.length ? segment.slice(1) : segment));
  }
  return path;
}
// A boundary hit belongs to the first stored cell for deterministic shared-edge
// ties. Selection uses chart polygons, never a chord triangulation in world space.
function containsUV(point: Vec2, polygon: Vec2[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j],
      b = polygon[i];
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const cross = (point[0] - a[0]) * dy - (point[1] - a[1]) * dx;
    if (
      Math.abs(cross) <= 1e-10 * Math.max(1, Math.hypot(dx, dy)) &&
      point[0] >= Math.min(a[0], b[0]) - 1e-10 &&
      point[0] <= Math.max(a[0], b[0]) + 1e-10 &&
      point[1] >= Math.min(a[1], b[1]) - 1e-10 &&
      point[1] <= Math.max(a[1], b[1]) + 1e-10
    )
      return true;
    if (a[1] > point[1] !== b[1] > point[1] && point[0] < a[0] + ((point[1] - a[1]) * dx) / dy)
      inside = !inside;
  }
  return inside;
}
function pathLength(path: Vec3[]) {
  let length = 0;
  for (let i = 1; i < path.length; i++) length += v3(path[i]).distanceTo(v3(path[i - 1]));
  return length;
}
function surfaceBoundarySegments(mesh: SurfaceMesh, deduplicateAtlasBoundaries = true) {
  const counts = new Map<string, { a: number; b: number; count: number }>();
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const triangle = mesh.indices.slice(i, i + 3);
    for (let j = 0; j < 3; j++) {
      const a = triangle[j],
        b = triangle[(j + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const entry = counts.get(key);
      if (entry) entry.count++;
      else counts.set(key, { a, b, count: 1 });
    }
  }
  const positions: number[] = [];
  const drawn = new Set<string>();
  for (const edge of counts.values()) {
    if (edge.count !== 1) continue;
    const a = mesh.positions.slice(edge.a * 3, edge.a * 3 + 3);
    const b = mesh.positions.slice(edge.b * 3, edge.b * 3 + 3);
    if (!deduplicateAtlasBoundaries) {
      positions.push(...a, ...b);
      continue;
    }
    // Deduplication affects display only: the atlas mesh intentionally duplicates
    // vertices at chart seams. Scientific graph identities remain core-owned.
    const aKey = a.map((value) => value.toPrecision(12)).join(',');
    const bKey = b.map((value) => value.toPrecision(12)).join(',');
    const key = aKey < bKey ? `${aKey}:${bKey}` : `${bKey}:${aKey}`;
    if (!drawn.has(key)) {
      positions.push(...a, ...b);
      drawn.add(key);
    }
  }
  return positions;
}
function scalarColor(value: number, light: boolean) {
  return new THREE.Color(light ? '#343434' : '#e6e6e6').lerp(
    new THREE.Color('#d09a4e'),
    Math.min(1, Math.max(0, value))
  );
}
function makeCellMesh(graph: PatternGraph, surface: SurfaceSpec, light: boolean, patches: boolean) {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node.position]));
  const positions: number[] = [],
    colors: number[] = [],
    ids: string[] = [];
  for (const cell of graph.cells) {
    const p = cell.nodes.map((id) => nodeMap.get(id));
    if (p.length < 3 || p.some((position) => !position)) continue;
    const shade = patches ? (light ? 0.52 : 0.18) + ((cell.patch * 37) % 7) * 0.045 : 0.2;
    const color = new THREE.Color().setRGB(shade, shade, shade);
    const contour = p.map(
      (position) =>
        new THREE.Vector2(...projectToSurface(surface, position!, cell.patch).attachment.uv)
    );
    for (const triangle of THREE.ShapeUtils.triangulateShape(contour, [])) {
      positions.push(...p[triangle[0]]!, ...p[triangle[1]]!, ...p[triangle[2]]!);
      colors.push(...color.toArray(), ...color.toArray(), ...color.toArray());
      ids.push(cell.id);
    }
  }
  const geo = geometry(positions);
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      depthWrite: false,
    })
  );
  mesh.visible = patches;
  return { mesh, ids };
}

export default function SurfaceViewer(props: SurfaceViewerProps) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef(props);
  current.current = props;
  const runtime = useRef<Runtime | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
        alpha: false,
      });
    } catch (cause) {
      const message = `WebGL viewer unavailable: ${cause instanceof Error ? cause.message : 'Could not create a rendering context.'}`;
      setError(message);
      current.current.onError?.(message);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = renderer.domElement;
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;';
    canvas.setAttribute(
      'aria-label',
      'Interactive surface. Use orbit mode to rotate, pan and zoom; draw mode to draw a surface guide.'
    );
    canvas.setAttribute('role', 'img');
    container.appendChild(canvas);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.00001, 100);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false;
    controls.screenSpacePanning = true;
    const surfaceGroup = new THREE.Group(),
      graphGroup = new THREE.Group(),
      guideGroup = new THREE.Group(),
      selectionGroup = new THREE.Group(),
      draftGroup = new THREE.Group();
    scene.add(surfaceGroup, graphGroup, guideGroup, selectionGroup, draftGroup);
    scene.add(new THREE.AmbientLight(0xffffff, 1.65));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(2, -3, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.7);
    fill.position.set(-2, 1, 0);
    scene.add(fill);
    const draw = () => renderer.render(scene, camera);
    const fit = () => {
      const size = current.current.surface.size;
      // Imported coordinates are centered; size is their maximum bounding-box
      // extent. The cube bound also contains an arbitrary imported bounding box.
      const radius = size * (['cube', 'mesh'].includes(current.current.surface.kind) ? 0.92 : 0.8);
      const distance =
        radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.min(1, camera.aspect);
      const direction = camera.position.clone().sub(controls.target);
      if (direction.lengthSq() < 1e-10) direction.set(1.4, -1.8, 1.4);
      camera.position.copy(direction.normalize().multiplyScalar(distance));
      controls.target.set(0, 0, 0);
      camera.near = Math.max(size / 10000, 1e-8);
      camera.far = size * 1000;
      controls.minDistance = size * 0.12;
      controls.maxDistance = size * 100;
      camera.updateProjectionMatrix();
      controls.update();
      draw();
    };
    const resize = () => {
      const width = Math.max(1, container.clientWidth),
        height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      draw();
    };
    const state: Runtime = {
      renderer,
      scene,
      camera,
      controls,
      surfaceGroup,
      graphGroup,
      guideGroup,
      selectionGroup,
      draftGroup,
      surfaceMesh: null,
      meshData: null,
      cellMesh: null,
      cellIds: [],
      edgePickPaths: [],
      draw,
      fit,
      resize,
    };
    runtime.current = state;
    controls.addEventListener('change', draw);
    let resizeFrame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(resize);
    });
    observer.observe(container);
    camera.position.set(1.4, -1.8, 1.4);
    resize();
    fit();
    const handle: ViewerHandle = {
      fit,
      view(preset) {
        const directions = {
          perspective: [1.4, -1.8, 1.4],
          top: [0, -1e-3, 1],
          front: [0, -1, 0],
          right: [1, 0, 0],
        };
        camera.position.fromArray(directions[preset]);
        // OrbitControls caches the up-axis transform during construction. Keep
        // Z-up fixed; a tiny top-view tilt avoids the polar singularity.
        camera.up.set(0, 0, 1);
        controls.target.set(0, 0, 0);
        fit();
      },
      screenshot() {
        draw();
        return canvas.toDataURL('image/png');
      },
    };
    current.current.onReady?.(handle);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pick = (event: PointerEvent): GuideSample | null => {
      if (!state.surfaceMesh || !state.meshData) return null;
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(pointer, camera);
      const surface = current.current.surface;
      const hit = raycaster
        .intersectObject(state.surfaceMesh, false)
        .find(
          (intersection) =>
            surface.kind === 'mesh' ||
            !intersection.face ||
            intersection.face.normal.dot(raycaster.ray.direction) < 0
        );
      if (!hit || hit.faceIndex == null || !hit.face) return null;
      const patch = state.meshData.trianglePatches[hit.faceIndex];
      const attr = state.surfaceMesh.geometry.getAttribute('position');
      const a = new THREE.Vector3().fromBufferAttribute(attr, hit.face.a);
      const b = new THREE.Vector3().fromBufferAttribute(attr, hit.face.b);
      const c = new THREE.Vector3().fromBufferAttribute(attr, hit.face.c);
      const bary = THREE.Triangle.getBarycoord(hit.point, a, b, c, new THREE.Vector3());
      let projected: GuideSample;
      if (hasRectangularMapping(surface)) {
        if (!bary) return null;
        const uv = mappedUVAtTriangle(surface, hit.faceIndex, tuple(bary));
        projected = {
          position: evaluateSurface(surface, 0, ...uv),
          attachment: { surfaceRevision: surface.revision, patch: 0, uv },
        };
      } else if (surface.kind === 'mesh') {
        // Inspection-only placeholders never reach guide drawing or generation.
        projected = {
          position: tuple(hit.point),
          attachment: { surfaceRevision: surface.revision, patch: 0, uv: [0, 0] },
        };
      } else projected = projectToSurface(surface, tuple(hit.point), patch);
      // Source triangle ordering survives non-indexed render conversion.
      projected.attachment.faceId = hit.faceIndex;
      if (bary) projected.attachment.barycentric = tuple(bary);
      return projected;
    };
    // Courses-stage editing: the nearest visible handle by ray distance, else the nearest segment.
    const editTarget = (event: PointerEvent): GraphEditTarget => {
      const sample = pick(event),
        handles = current.current.graphEdit,
        size = current.current.surface.size,
        ray = raycaster.ray;
      const depth = sample ? ray.origin.distanceTo(v3(sample.position)) + size * 0.02 : Infinity,
        visible = (p: THREE.Vector3) => p.clone().sub(ray.origin).dot(ray.direction) <= depth;
      let point: string | undefined,
        segment: string | undefined,
        best = size * 0.025;
      for (const h of handles?.points ?? []) {
        const p = v3(h.position),
          d = ray.distanceToPoint(p);
        if (d < best && visible(p)) [best, point] = [d, h.id];
      }
      best = (size * 0.015) ** 2;
      const a = new THREE.Vector3(),
        b = new THREE.Vector3(),
        on = new THREE.Vector3();
      for (const s of handles?.segments ?? []) {
        a.set(...s.a);
        b.set(...s.b);
        const d = ray.distanceSqToSegment(a, b, undefined, on);
        if (d < best && visible(on)) [best, segment] = [d, s.id];
      }
      return {
        ...(point ? { point } : {}),
        ...(segment ? { segment } : {}),
        uv: sample ? sample.attachment.uv : null,
        position: sample ? sample.position : null,
      };
    };
    let editPress: {
      pointer: number;
      x: number;
      y: number;
      target: GraphEditTarget;
      dragging: boolean;
    } | null = null;
    let activePointer: number | null = null;
    let stroke: GuideSample[] = [];
    let lastScreen: [number, number] | null = null;
    let drawingBlocked = false;
    const renderDraft = () => {
      clear(draftGroup);
      const segments: number[] = [];
      appendPath(segments, guidePath(current.current.surface, stroke));
      lineSegments(draftGroup, segments, '#d09a4e');
      draw();
    };
    const addSample = (event: PointerEvent) => {
      if (drawingBlocked || !supportsGuides(current.current.surface)) return;
      const sample = pick(event);
      if (!sample) {
        if (stroke.length) drawingBlocked = true;
        lastScreen = null;
        return;
      }
      if (
        lastScreen &&
        Math.hypot(event.clientX - lastScreen[0], event.clientY - lastScreen[1]) < 2
      )
        return;
      const previous = stroke[stroke.length - 1];
      // A missed surface or a large occlusion jump ends the connected stroke.
      // Never bridge a silhouette or the rear of a closed surface.
      if (
        previous &&
        (!lastScreen ||
          previous.attachment.surfaceRevision !== current.current.surface.revision ||
          (hasRectangularMapping(current.current.surface) &&
            Math.hypot(
              previous.attachment.uv[0] - sample.attachment.uv[0],
              previous.attachment.uv[1] - sample.attachment.uv[1]
            ) > 0.18) ||
          v3(previous.position).distanceTo(v3(sample.position)) >
            current.current.surface.size * 0.18)
      ) {
        drawingBlocked = true;
        return;
      }
      if (previous && previous.attachment.patch === sample.attachment.patch) {
        const count = Math.min(
          12,
          Math.ceil(
            v3(previous.position).distanceTo(v3(sample.position)) /
              (current.current.surface.size * 0.015)
          )
        );
        for (let j = 1; j < count; j++) {
          const t = j / count;
          const uv: [number, number] = [
            THREE.MathUtils.lerp(previous.attachment.uv[0], sample.attachment.uv[0], t),
            THREE.MathUtils.lerp(previous.attachment.uv[1], sample.attachment.uv[1], t),
          ];
          stroke.push(
            hasRectangularMapping(current.current.surface)
              ? evaluateMappedSurface(current.current.surface, ...uv)
              : {
                  position: evaluateSurface(
                    current.current.surface,
                    sample.attachment.patch,
                    ...uv
                  ),
                  attachment: {
                    surfaceRevision: current.current.surface.revision,
                    patch: sample.attachment.patch,
                    uv,
                  },
                }
          );
        }
      }
      stroke.push(sample);
      lastScreen = [event.clientX, event.clientY];
      renderDraft();
    };
    const finishStroke = () => {
      const samples = stroke;
      stroke = [];
      activePointer = null;
      lastScreen = null;
      clear(draftGroup);
      draw();
      if (
        current.current.options.mode === 'draw' &&
        supportsGuides(current.current.surface) &&
        samples.length >= 2 &&
        samples.every(
          (sample) => sample.attachment.surfaceRevision === current.current.surface.revision
        )
      )
        current.current.onStroke(samples);
    };
    const select = (event: PointerEvent) => {
      const sample = pick(event),
        graph = current.current.graph;
      if (!supportsGuides(current.current.surface)) {
        current.current.onSelect(
          sample?.attachment.faceId != null
            ? { kind: 'triangle', id: String(sample.attachment.faceId) }
            : null
        );
        return;
      }
      if (!sample || !graph) {
        current.current.onSelect(null);
        return;
      }
      const rect = canvas.getBoundingClientRect();
      let nearest: { id: string; distance: number } | null = null;
      for (const node of graph.nodes) {
        const position = v3(node.position);
        if (position.distanceTo(v3(sample.position)) > current.current.surface.size * 0.08)
          continue;
        const projected = position.project(camera);
        const distance = Math.hypot(
          ((projected.x + 1) * rect.width) / 2 + rect.left - event.clientX,
          ((-projected.y + 1) * rect.height) / 2 + rect.top - event.clientY
        );
        if (distance < 12 && (!nearest || distance < nearest.distance)) {
          if (hasRectangularMapping(current.current.surface) && state.surfaceMesh) {
            const visibilityRay = new THREE.Raycaster();
            visibilityRay.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera);
            const front = visibilityRay.intersectObject(state.surfaceMesh, false)[0];
            if (
              front &&
              front.point.distanceTo(v3(node.position)) > current.current.surface.size * 1e-5
            )
              continue;
          }
          nearest = { id: node.id, distance };
        }
      }
      if (nearest) {
        current.current.onSelect({ kind: 'node', id: nearest.id });
        return;
      }
      if (hasRectangularMapping(current.current.surface)) {
        const nodes = new Map(graph.nodes.map((node) => [node.id, node.attachment.uv]));
        const cell = graph.cells.find((candidate) => {
          const polygon = candidate.nodes.map((id) => nodes.get(id));
          return (
            polygon.length >= 3 &&
            polygon.every((uv): uv is Vec2 => !!uv) &&
            containsUV(sample.attachment.uv, polygon as Vec2[])
          );
        });
        current.current.onSelect(cell ? { kind: 'cell', id: cell.id } : null);
        return;
      }
      if (state.cellMesh) {
        const hits = raycaster.intersectObject(state.cellMesh, false);
        const hit = hits.find(
          (candidate) =>
            candidate.point.distanceTo(v3(sample.position)) < current.current.surface.size * 0.2
        );
        if (hit?.faceIndex != null) {
          current.current.onSelect({ kind: 'cell', id: state.cellIds[hit.faceIndex] });
          return;
        }
      }
      current.current.onSelect(null);
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (current.current.graphEdit) {
        if (editPress) return;
        event.preventDefault();
        editPress = {
          pointer: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          target: editTarget(event),
          dragging: false,
        };
        canvas.setPointerCapture(event.pointerId);
        return;
      }
      if (current.current.pickCutEdge) {
        const sample = pick(event);
        if (!sample) return;
        let nearest: string | null = null,
          best = (current.current.surface.size * 0.035) ** 2;
        const p = sample.position;
        for (const edge of state.edgePickPaths)
          for (let i = 1; i < edge.path.length; i++) {
            const a = edge.path[i - 1]!,
              b = edge.path[i]!,
              dx = b[0] - a[0],
              dy = b[1] - a[1],
              dz = b[2] - a[2],
              length = dx * dx + dy * dy + dz * dz;
            const t = length
              ? Math.max(
                  0,
                  Math.min(
                    1,
                    ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy + (p[2] - a[2]) * dz) / length
                  )
                )
              : 0;
            const d =
              (p[0] - a[0] - t * dx) ** 2 +
              (p[1] - a[1] - t * dy) ** 2 +
              (p[2] - a[2] - t * dz) ** 2;
            if (d < best) {
              best = d;
              nearest = edge.id;
            }
          }
        if (nearest) current.current.onCutEdgePick?.(nearest);
        return;
      }
      if (current.current.pickStartEdge) {
        const sample = pick(event);
        if (sample) {
          // Distances to the sides of the selected patch's rectangle (the whole chart without patches).
          const w = current.current.startEdgeWindow ?? { u: [0, 1], v: [0, 1] },
            u = (sample.attachment.uv[0] - w.u[0]) / (w.u[1] - w.u[0]),
            v = (sample.attachment.uv[1] - w.v[0]) / (w.v[1] - w.v[0]);
          const distances = [v, 1 - u, 1 - v, u].map((d) => (d < -0.15 ? Infinity : Math.abs(d)));
          const nearest = distances.indexOf(Math.min(...distances));
          if (distances[nearest]! <= 0.15)
            current.current.onStartEdge?.((['v0', 'u1', 'v1', 'u0'] as const)[nearest]!);
        }
        return;
      }
      if (current.current.options.mode === 'select' && current.current.shapeOverlay) {
        pick(event);
        let nearest: { index: number; distance: number } | null = null;
        for (const mark of current.current.shapeOverlay.marks) {
          const distance = raycaster.ray.distanceToPoint(v3(mark.position));
          if (
            distance < current.current.surface.size * 0.025 &&
            (!nearest || distance < nearest.distance)
          )
            nearest = { index: mark.index, distance };
        }
        if (nearest) {
          current.current.onShapePick?.(nearest.index);
          return;
        }
      }
      if (current.current.options.mode === 'draw') {
        if (!supportsGuides(current.current.surface)) return;
        if (activePointer !== null) return;
        event.preventDefault();
        activePointer = event.pointerId;
        stroke = [];
        lastScreen = null;
        drawingBlocked = false;
        canvas.setPointerCapture(event.pointerId);
        addSample(event);
      } else if (current.current.options.mode === 'select') select(event);
    };
    const move = (event: PointerEvent) => {
      if (editPress?.pointer === event.pointerId) {
        if (Math.hypot(event.clientX - editPress.x, event.clientY - editPress.y) > 4)
          editPress.dragging = true;
        if (editPress.dragging) {
          const sample = pick(event),
            from = editPress.target.position;
          clear(draftGroup);
          if (sample && from) {
            lineSegments(draftGroup, [...from, ...sample.position], '#d09a4e');
            pointsObject(draftGroup, [...sample.position], '#d09a4e', 9);
          }
          draw();
        }
        return;
      }
      if (activePointer === event.pointerId) {
        addSample(event);
        return;
      }
      const sample = pick(event);
      current.current.onHover?.(
        sample
          ? `${current.current.surface.kind === 'mesh' ? `Triangle ${sample.attachment.faceId}${hasRectangularMapping(current.current.surface) ? ` · u ${sample.attachment.uv[0].toFixed(3)} · v ${sample.attachment.uv[1].toFixed(3)}` : ''}` : `Patch ${sample.attachment.patch} · u ${sample.attachment.uv[0].toFixed(3)} · v ${sample.attachment.uv[1].toFixed(3)}`} · ${sample.position.map((value) => (value * 1000).toFixed(1)).join(', ')} mm`
          : ''
      );
    };
    const up = (event: PointerEvent) => {
      if (editPress?.pointer === event.pointerId) {
        const press = editPress;
        editPress = null;
        clear(draftGroup);
        draw();
        current.current.onGraphEdit?.(
          press.dragging ? { ...press.target, drop: editTarget(event) } : press.target
        );
      }
      if (activePointer === event.pointerId) finishStroke();
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    const cancel = (event: PointerEvent) => {
      if (editPress?.pointer === event.pointerId) {
        editPress = null;
        clear(draftGroup);
        draw();
      }
      if (activePointer === event.pointerId) {
        stroke = [];
        activePointer = null;
        lastScreen = null;
        clear(draftGroup);
        draw();
      }
    };
    const leave = () => current.current.onHover?.('');
    const contextLost = (event: Event) => {
      event.preventDefault();
      const message = 'The WebGL context was lost. Reload the page to restore the viewer.';
      setError(message);
      current.current.onError?.(message);
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', cancel);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('webglcontextlost', contextLost);
    setReady(true);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(resizeFrame);
      controls.dispose();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('webglcontextlost', contextLost);
      [surfaceGroup, graphGroup, guideGroup, selectionGroup, draftGroup].forEach(clear);
      renderer.dispose();
      canvas.remove();
      runtime.current = null;
    };
  }, []);

  useEffect(() => {
    const state = runtime.current;
    if (!state || !ready) return;
    try {
      clear(state.surfaceGroup);
      state.surfaceMesh = null;
      state.meshData = null;
      const mesh = buildSurfaceMesh(props.surface, 32);
      const indexed = geometry(mesh.positions);
      indexed.setIndex(mesh.indices);
      indexed.computeVertexNormals();
      const geo = indexed.toNonIndexed();
      indexed.dispose();
      const patchColors: number[] = [];
      mesh.trianglePatches.forEach((patch) => {
        const shade = 0.32 + ((patch * 37) % 7) * 0.085;
        for (let vertex = 0; vertex < 3; vertex++) patchColors.push(shade, shade, shade);
      });
      geo.setAttribute('color', new THREE.Float32BufferAttribute(patchColors, 3));
      const material = new THREE.MeshStandardMaterial({
        color: props.options.background === 'light' ? '#c8c8c8' : '#252525',
        roughness: 0.92,
        metalness: 0.05,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 2,
        polygonOffsetUnits: 2,
      });
      const object = new THREE.Mesh(geo, material);
      state.surfaceMesh = object;
      state.meshData = mesh;
      state.surfaceGroup.add(object);
      const wire = new THREE.LineSegments(
        new THREE.WireframeGeometry(geo),
        new THREE.LineBasicMaterial({
          color: '#686868',
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
        })
      );
      wire.name = 'surface-wire';
      wire.visible = props.options.wireframe;
      state.surfaceGroup.add(wire);
      const seams = new THREE.Group();
      seams.name = 'surface-seams';
      lineSegments(
        seams,
        surfaceBoundarySegments(mesh, props.surface.kind !== 'mesh'),
        '#909090',
        0.8
      );
      seams.visible = props.options.showSeams;
      state.surfaceGroup.add(seams);
      const displayScale = props.surface.kind === 'sphere' ? SPHERE_DISPLAY_SCALE : 1;
      for (const group of [
        state.graphGroup,
        state.guideGroup,
        state.selectionGroup,
        state.draftGroup,
        seams,
      ])
        group.scale.setScalar(displayScale);
      setError('');
      state.fit();
    } catch (cause) {
      const message = `Surface display failed: ${cause instanceof Error ? cause.message : String(cause)}`;
      setError(message);
      current.current.onError?.(message);
    }
    // Camera fit follows scientific geometry, not graph or display changes.
  }, [
    ready,
    props.surface.kind,
    props.surface.size,
    props.surface.curvature,
    props.surface.revision,
  ]);

  useEffect(() => {
    const state = runtime.current;
    if (!state || !ready) return;
    clear(state.graphGroup);
    state.cellMesh = null;
    state.cellIds = [];
    state.edgePickPaths = [];
    const graph = props.graph;
    const light = props.options.background === 'light';
    if (graph && supportsGuides(props.surface)) {
      const nodeMap = new Map(graph.nodes.map((node) => [node.id, node.position]));
      const degrees = new Map<string, number>();
      for (const edge of graph.edges) {
        degrees.set(edge.a, (degrees.get(edge.a) || 0) + 1);
        degrees.set(edge.b, (degrees.get(edge.b) || 0) + 1);
      }
      const segments: number[] = [],
        colors: number[] = [],
        features: number[] = [];
      const target = graph.provenance.parameters.spacing;
      for (const edge of graph.edges) {
        const path = edgePath(props.surface, edge, nodeMap);
        state.edgePickPaths.push({ id: edge.id, path });
        let color = new THREE.Color(
          props.knitInspection ? (light ? '#747d82' : '#858d93') : light ? '#303030' : '#e1e1e1'
        );
        if (props.options.overlay === 'spacing') {
          const measured = edge.path?.length ? pathLength(edge.path) : pathLength(path);
          color = scalarColor(target > 0 ? (Math.abs(measured - target) / target) * 2 : 0, light);
        } else if (props.options.overlay === 'valence') {
          color = scalarColor(
            degrees.get(edge.a) === 4 && degrees.get(edge.b) === 4 ? 0 : 1,
            light
          );
        }
        const start = segments.length;
        appendPath(segments, path);
        for (let j = start; j < segments.length; j += 3) colors.push(...color.toArray());
        if (edge.feature && props.options.showSeams) appendPath(features, path);
      }
      if (props.options.showGraph)
        lineSegments(
          state.graphGroup,
          segments,
          '#ffffff',
          props.knitInspection ? 0.38 : 0.96,
          colors
        );
      if (props.options.showSeams) lineSegments(state.graphGroup, features, '#d09a4e', 0.95);
      if (props.options.showNodes) {
        const positions: number[] = [],
          nodeColors: number[] = [];
        graph.nodes.forEach((node) => {
          positions.push(...node.position);
          const color =
            props.options.overlay === 'valence'
              ? scalarColor(degrees.get(node.id) === 4 ? 0 : 1, light)
              : new THREE.Color(light ? '#1b1b1b' : '#ffffff');
          nodeColors.push(...color.toArray());
        });
        pointsObject(state.graphGroup, positions, '#ffffff', 4, nodeColors);
      }
      if (props.options.showCoarse) {
        const coarse: number[] = [];
        if (hasRectangularMapping(props.surface)) {
          const topology = graph.coarseTopology;
          if (topology) {
            const nodes = new Map(topology.nodes.map((node) => [node.id, node]));
            for (const edge of topology.edges) {
              const a = nodes.get(edge.a),
                b = nodes.get(edge.b);
              if (edge.path?.length) appendPath(coarse, edge.path);
              else if (a && b)
                appendPath(coarse, mappedUVPath(props.surface, a.attachment.uv, b.attachment.uv));
            }
          }
        } else
          graph.coarsePatches.forEach((patch) => {
            if (patch.corners.length)
              appendPath(
                coarse,
                embeddedPath(props.surface, [...patch.corners, patch.corners[0]], 32)
              );
          });
        lineSegments(state.graphGroup, coarse, light ? '#696969' : '#a0a0a0', 0.85);
      }
      // Mapped cells are selected in UV. World chord fills could leave a folded
      // source surface, so only analytic surfaces use display cell triangles.
      if (!hasRectangularMapping(props.surface)) {
        const cells = makeCellMesh(
          graph,
          props.surface,
          light,
          props.options.overlay === 'patches' && !props.options.showSurface
        );
        state.cellMesh = cells.mesh;
        state.cellIds = cells.ids;
        state.graphGroup.add(cells.mesh);
      }
    }
    state.draw();
  }, [
    ready,
    props.graph,
    props.surface,
    props.options.showGraph,
    props.knitInspection,
    props.options.showSeams,
    props.options.showNodes,
    props.options.showCoarse,
    props.options.overlay,
    props.options.background,
    props.options.showSurface,
  ]);

  useEffect(() => {
    const state = runtime.current;
    if (!state || !ready) return;
    clear(state.guideGroup);
    if (props.options.showGuides && supportsGuides(props.surface)) {
      const segments: number[] = [];
      props.guides
        .filter((guide) =>
          guide.samples.every(
            (sample) => sample.attachment.surfaceRevision === props.surface.revision
          )
        )
        .forEach((guide) => appendPath(segments, guidePath(props.surface, guide.samples)));
      lineSegments(state.guideGroup, segments, '#d09a4e');
    }
    state.draw();
  }, [ready, props.guides, props.surface, props.options.showGuides]);

  useEffect(() => {
    const state = runtime.current;
    if (!state || !ready) return;
    clear(state.selectionGroup);
    const { graph, selection, surface } = props;
    if (graph && props.cutEdgeIds?.length) {
      const ids = new Set(props.cutEdgeIds),
        segments: number[] = [],
        nodes = new Map(graph.nodes.map((n) => [n.id, n.position]));
      for (const e of graph.edges)
        if (ids.has(e.id)) appendPath(segments, edgePath(surface, e, nodes));
      lineSegments(state.selectionGroup, segments, '#e98b4b');
    }
    if (surface.kind === 'mesh' && selection?.kind === 'triangle' && state.meshData) {
      const face = Number(selection.id);
      const mesh = state.meshData;
      if (
        /^\d+$/.test(selection.id) &&
        Number.isSafeInteger(face) &&
        face < mesh.indices.length / 3
      ) {
        const path: Vec3[] = mesh.indices
          .slice(face * 3, face * 3 + 3)
          .map((index) => [
            mesh.positions[index * 3],
            mesh.positions[index * 3 + 1],
            mesh.positions[index * 3 + 2],
          ]);
        const segments: number[] = [];
        appendPath(segments, [...path, path[0]]);
        lineSegments(state.selectionGroup, segments, '#d09a4e');
      }
    } else if (supportsGuides(surface) && graph && selection) {
      if (selection.kind === 'node') {
        const node = graph.nodes.find((candidate) => candidate.id === selection.id);
        if (node) pointsObject(state.selectionGroup, node.position, '#d09a4e', 10);
      } else if (selection.kind === 'cell') {
        const cell = graph.cells.find((candidate) => candidate.id === selection.id);
        if (cell) {
          const nodes = new Map(graph.nodes.map((node) => [node.id, node.position]));
          const path = cell.nodes.map((id) => nodes.get(id)).filter((p): p is Vec3 => !!p);
          const segments: number[] = [];
          if (hasRectangularMapping(surface)) {
            const edges = new Map(
              graph.edges.map((edge) => [[edge.a, edge.b].sort().join('\0'), edge])
            );
            for (let i = 0; i < cell.nodes.length; i++) {
              const edge = edges.get(
                [cell.nodes[i], cell.nodes[(i + 1) % cell.nodes.length]].sort().join('\0')
              );
              if (edge) appendPath(segments, edgePath(surface, edge, nodes));
            }
          } else if (path.length)
            appendPath(segments, embeddedPath(surface, [...path, path[0]], 12));
          lineSegments(state.selectionGroup, segments, '#d09a4e');
        }
      } else if (selection.kind === 'edge') {
        const edge = graph.edges.find((candidate) => candidate.id === selection.id);
        const nodes = new Map(graph.nodes.map((node) => [node.id, node.position]));
        const a = edge && nodes.get(edge.a),
          b = edge && nodes.get(edge.b);
        if (edge && a && b) {
          const segments: number[] = [];
          appendPath(
            segments,
            hasRectangularMapping(surface)
              ? edgePath(surface, edge, nodes)
              : embeddedPath(surface, [a, b], 12)
          );
          lineSegments(state.selectionGroup, segments, '#d09a4e');
        }
      }
    }
    if (props.shapeOverlay) {
      const segments: number[] = [];
      for (const course of props.shapeOverlay.courses) appendPath(segments, course);
      const courses = lineSegments(
        state.selectionGroup,
        segments,
        props.options.background === 'light' ? '#21677c' : '#79bbcf',
        0.88
      );
      if (courses) {
        courses.userData.courseLayer = true;
        courses.renderOrder = 3;
      }
      const highlighted: number[] = [];
      for (const course of props.shapeOverlay.highlightedCourses ?? [])
        appendPath(highlighted, course);
      lineSegments(state.selectionGroup, highlighted, '#d09a4e');
      const graph = props.shapeOverlay.graph;
      if (graph) {
        for (const [lines, color] of [
          [graph.weft, '#a678d6'],
          [graph.warp, '#4fae9c'],
        ] as const) {
          const segments: number[] = [];
          for (const line of lines) appendPath(segments, line);
          const object = lineSegments(state.selectionGroup, segments, color, 0.9);
          if (object) object.renderOrder = 3;
        }
        const roles = new Map<string, number[]>();
        for (const loop of graph.loops) {
          const points = roles.get(loop.role) ?? [];
          points.push(...loop.position);
          roles.set(loop.role, points);
        }
        for (const [role, points] of roles)
          pointsObject(
            state.selectionGroup,
            points,
            role === 'short-row'
              ? '#58a6ff'
              : role === 'increase'
                ? '#61c789'
                : role === 'decrease'
                  ? '#e2bf62'
                  : '#a678d6',
            role === 'loop' ? 4 : 7
          );
      }
      const batches = new Map<string, number[]>();
      for (const mark of props.shapeOverlay.marks) {
        const color =
          mark.role === 'turn' ? '#58a6ff' : mark.role.includes('increase') ? '#61c789' : '#e2bf62';
        const key = `${color}:${mark.selected ? 9 : 6}`;
        const points = batches.get(key) ?? [];
        points.push(...mark.position);
        batches.set(key, points);
      }
      for (const [key, points] of batches) {
        const [color, size] = key.split(':');
        pointsObject(state.selectionGroup, points, color, Number(size));
      }
    }
    if (props.startEdge) {
      const path: Vec3[] = [],
        w = props.startEdgeWindow ?? { u: [0, 1], v: [0, 1] },
        su = (t: number) => w.u[0] + t * (w.u[1] - w.u[0]),
        sv = (t: number) => w.v[0] + t * (w.v[1] - w.v[0]);
      for (let i = 0; i <= 64; i++) {
        const t = i / 64;
        const uv: Vec2 =
          props.startEdge === 'v0'
            ? [su(t), sv(0)]
            : props.startEdge === 'v1'
              ? [su(t), sv(1)]
              : props.startEdge === 'u0'
                ? [su(0), sv(t)]
                : [su(1), sv(t)];
        path.push(evaluateSurface(props.surface, 0, ...uv));
      }
      const segments: number[] = [];
      appendPath(segments, path);
      lineSegments(state.selectionGroup, segments, '#d09a4e');
    }
    if (props.patchLines) {
      const seams: number[] = [],
        selected: number[] = [];
      for (const line of props.patchLines.seams) appendPath(seams, line);
      for (const line of props.patchLines.selected) appendPath(selected, line);
      lineSegments(
        state.selectionGroup,
        seams,
        props.options.background === 'light' ? '#3a3a3a' : '#e0e0e0'
      );
      lineSegments(state.selectionGroup, selected, '#d09a4e');
    }
    if (props.graphEdit) {
      pointsObject(
        state.selectionGroup,
        props.graphEdit.points.flatMap((p) => p.position),
        props.options.background === 'light' ? '#3a3a3a' : '#f2f2f2',
        6
      );
      const draft = props.graphEdit.draft ?? [];
      if (draft.length) {
        const segments: number[] = [];
        appendPath(segments, draft);
        lineSegments(state.selectionGroup, segments, '#d09a4e');
        pointsObject(state.selectionGroup, draft.flat(), '#d09a4e', 8);
      }
    }
    if (props.marker) pointsObject(state.selectionGroup, props.marker, '#f2f2f2', 8);
    // Draw selected entities after the translucent network lines, retaining
    // depth testing against the support geometry and unchanged coordinates.
    state.selectionGroup.traverse((object) => {
      const drawable = object as THREE.Mesh;
      if (!drawable.material) return;
      if (drawable.userData.courseLayer) return;
      const materials = Array.isArray(drawable.material) ? drawable.material : [drawable.material];
      for (const material of materials) material.transparent = true;
      object.renderOrder = 5;
    });
    state.draw();
  }, [
    ready,
    props.graph,
    props.selection,
    props.marker,
    props.surface,
    props.shapeOverlay,
    props.options.background,
    props.startEdge,
    props.startEdgeWindow,
    props.cutEdgeIds,
    props.graphEdit,
    props.patchLines,
  ]);

  const editing = !!props.graphEdit;
  useEffect(() => {
    const state = runtime.current;
    if (!state || !ready) return;
    state.scene.background = new THREE.Color(
      props.options.background === 'light' ? '#e4e4e4' : '#0b0b0b'
    );
    if (state.surfaceMesh) {
      state.surfaceMesh.visible = props.options.showSurface;
      // Raycasting remains available even when the render surface is hidden.
      const material = state.surfaceMesh.material as THREE.MeshStandardMaterial;
      const patches = props.surface.kind !== 'mesh' && props.options.overlay === 'patches';
      material.color.set(
        patches ? '#ffffff' : props.options.background === 'light' ? '#c8c8c8' : '#252525'
      );
      if (material.vertexColors !== patches) {
        material.vertexColors = patches;
        material.needsUpdate = true;
      }
    }
    const wire = state.surfaceGroup.getObjectByName('surface-wire');
    if (wire) wire.visible = props.options.wireframe;
    const seams = state.surfaceGroup.getObjectByName('surface-seams');
    if (seams) seams.visible = props.options.showSeams;
    const meshDraw = !supportsGuides(props.surface) && props.options.mode === 'draw';
    state.controls.enabled =
      (props.options.mode === 'orbit' || meshDraw) && !props.pickCutEdge && !editing;
    state.renderer.domElement.setAttribute(
      'aria-label',
      editing
        ? (props.graphEditLabel ??
            'Knit graph editor. Click or drag the courses-stage handles on the surface; turn editing off to rotate.')
        : props.pickCutEdge
          ? 'Interactive cut editor. Click near a visible network edge to toggle it in the cut draft.'
          : !supportsGuides(props.surface)
            ? 'Interactive imported mesh. Orbit to rotate, pan and zoom; select mode to inspect triangles.'
            : 'Interactive surface. Use orbit mode to rotate, pan and zoom; draw mode to draw a surface guide.'
    );
    state.renderer.domElement.style.cursor =
      props.pickCutEdge || editing
        ? 'crosshair'
        : props.options.mode === 'draw' && !meshDraw
          ? 'crosshair'
          : props.options.mode === 'select'
            ? 'pointer'
            : 'grab';
    state.draw();
  }, [ready, props.options, props.surface, props.pickCutEdge, editing, props.graphEditLabel]);

  return (
    <div
      ref={host}
      data-testid="surface-viewer"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 240,
        overflow: 'hidden',
      }}
    >
      {error && (
        <div
          role="alert"
          style={{
            position: 'absolute',
            inset: 20,
            padding: 16,
            border: '1px solid #555',
            color: '#d09a4e',
            background: '#141414',
            zIndex: 2,
          }}
        >
          {error}
        </div>
      )}
      {!ready && !error && (
        <div role="status" style={{ position: 'absolute', inset: 20, color: '#8a8a8a' }}>
          Preparing surface viewer…
        </div>
      )}
    </div>
  );
}

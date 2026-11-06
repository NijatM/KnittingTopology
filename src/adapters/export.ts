import type { PatternGraph, ProjectState } from '../core/types';
import { serializeProject } from '../app/project';

export function download(contents: BlobPart, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function projectFilename(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'knitting-topology'
  );
}
export function saveProject(project: ProjectState): void {
  download(
    serializeProject(project),
    `${projectFilename(project.name)}.kt.json`,
    'application/json'
  );
}
export function graphToOBJ(graph: PatternGraph, stale = false): string {
  const indices = new Map(graph.nodes.map((node, i) => [node.id, i + 1]));
  return [
    '# Knitting Topology — explicit geometric pattern mesh',
    '# Coordinates in meters; right-handed Z-up. Polygon faces use straight chords.',
    '# No yarn, material, machine or structural semantics.',
    `# Algorithm ${graph.provenance.algorithm.replace(/[\r\n]/g, ' ')} ${graph.provenance.version.replace(/[\r\n]/g, ' ')}`,
    `# Accepted result is ${stale ? 'STALE relative to current controls' : 'current'}.`,
    `# Generating parameters ${JSON.stringify(graph.provenance.parameters)}`,
    `# Input signature ${graph.provenance.inputSignature ?? 'not recorded'}`,
    ...graph.nodes.map((node) => `v ${node.position.map((v) => v.toPrecision(12)).join(' ')}`),
    ...graph.cells.map((cell) => `f ${cell.nodes.map((id) => indices.get(id)).join(' ')}`),
    '',
  ].join('\n');
}
export function graphToSVG(graph: PatternGraph, stale = false): string {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node.position]));
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const node of graph.nodes) {
    minX = Math.min(minX, node.position[0] * 1000);
    maxX = Math.max(maxX, node.position[0] * 1000);
    minY = Math.min(minY, -node.position[1] * 1000);
    maxY = Math.max(maxY, -node.position[1] * 1000);
  }
  if (!graph.nodes.length) throw new Error('An empty graph cannot be exported as SVG.');
  const margin = Math.max(maxX - minX, maxY - minY) * 0.04 || 1;
  const paths = graph.edges.map((edge) => {
    const points = edge.path?.length ? edge.path : [nodes.get(edge.a)!, nodes.get(edge.b)!];
    return `<polyline points="${points.map((p) => `${(p[0] * 1000).toFixed(5)},${(-p[1] * 1000).toFixed(5)}`).join(' ')}"/>`;
  });
  const escapeXML = (value: string) =>
    value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const metadata = escapeXML(
    JSON.stringify({
      units: 'mm',
      projection: 'XY',
      staleRelativeToControls: stale,
      algorithm: graph.provenance.algorithm,
      version: graph.provenance.version,
      parameters: graph.provenance.parameters,
      inputSignature: graph.provenance.inputSignature,
    })
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX - margin} ${minY - margin} ${maxX - minX + 2 * margin} ${maxY - minY + 2 * margin}">
<title>Knitting Topology — XY projection</title>
<desc>Orthographic XY projection in millimeters. Overlapping projected lines do not imply graph adjacency. Not a flattened surface pattern or fabrication drawing.</desc>
<metadata>${metadata}</metadata>
<g fill="none" stroke="#111" stroke-width="0.2" stroke-linecap="round">${paths.join('\n')}</g>
</svg>`;
}
export function diagnosticsToCSV(project: ProjectState): string {
  const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [
    ['id', 'severity', 'label', 'message', 'value', 'units', 'tolerance', 'method'],
    ...project.diagnostics.map((d) => [
      d.id,
      d.severity,
      d.label,
      d.message,
      d.value,
      d.units,
      d.tolerance,
      d.method,
    ]),
  ]
    .map((row) => row.map(quote).join(','))
    .join('\r\n');
}

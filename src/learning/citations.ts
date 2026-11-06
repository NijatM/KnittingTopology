import type { PatternParameters, SurfaceKind } from '../core/types';
import { REFERENCES } from './references';
import type { ReferenceId, ScientificReference } from './types';

export function formatCitation(ref: ScientificReference): string {
  const authors = ref.authors.map((a) => `${a.family}, ${a.given}`).join('; ');
  const venue = ref.containerTitle
    ? ` ${ref.containerTitle}${ref.volume ? ` ${ref.volume}${ref.issue ? `(${ref.issue})` : ''}` : ''}${ref.pages ? `, ${ref.pages}` : ''}.`
    : '';
  return `${authors} (${ref.year ?? 'n.d.'}). ${ref.title}.${venue}${ref.doi ? ` https://doi.org/${ref.doi}` : ` ${ref.url}`}`;
}

const bibEscape = (s: string) =>
  s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[&%#$]/g, (x) => `\\${x}`)
    .replace(/[\r\n]+/g, ' ');

export function referenceBibtex(ref: ScientificReference): string {
  const kind =
    ref.type === 'article-journal'
      ? 'article'
      : ref.type === 'paper-conference'
        ? 'inproceedings'
        : 'misc';
  const fields: [string, string | undefined][] = [
    ['author', ref.authors.map((a) => `${a.family}, ${a.given}`).join(' and ')],
    ['title', ref.title.replace('N-Sided', '{N}-Sided')],
    ['year', ref.year === undefined ? undefined : String(ref.year)],
    [ref.type === 'paper-conference' ? 'booktitle' : 'journal', ref.containerTitle],
    ['volume', ref.volume],
    ['number', ref.issue],
    ['pages', ref.pages?.replace(/[–—]/g, '--')],
    ['publisher', ref.publisher],
    ['doi', ref.doi],
    ['url', ref.url],
    ['urldate', ref.accessed],
    [
      'note',
      ref.type === 'webpage'
        ? 'Undated web resource; footer copyright 1998 is not a publication date'
        : undefined,
    ],
  ];
  return `@${kind}{${ref.id},\n${fields
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `  ${name} = {${bibEscape(value!)}},`)
    .join('\n')}\n}`;
}

function selected(ids: ReferenceId[]): ScientificReference[] {
  return [...new Set(ids)].map((id) => {
    const ref = REFERENCES[id];
    if (!ref) throw new Error(`Unknown scientific reference: ${id}`);
    return ref;
  });
}

export function referencesBibtex(ids: ReferenceId[]): string {
  return selected(ids).map(referenceBibtex).join('\n\n') + (ids.length ? '\n' : '');
}

/** Plain CSL-JSON values, suitable for JSON.stringify or a bibliography manager. */
export function referencesCSL(ids: ReferenceId[]): Record<string, unknown>[] {
  return selected(ids).map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    author: r.authors.map((a) => ({ ...a })),
    ...(r.year === undefined ? {} : { issued: { 'date-parts': [[r.year]] } }),
    ...(r.containerTitle ? { 'container-title': r.containerTitle } : {}),
    ...(r.volume ? { volume: r.volume } : {}),
    ...(r.issue ? { issue: r.issue } : {}),
    ...(r.pages ? { page: r.pages.replace(/[–—]/g, '-') } : {}),
    ...(r.publisher ? { publisher: r.publisher } : {}),
    ...(r.doi ? { DOI: r.doi } : {}),
    URL: r.url,
    accessed: { 'date-parts': [r.accessed.split('-').map(Number)] },
    ...(r.type === 'webpage'
      ? { note: 'Undated resource; page footer copyright 1998 is not a publication date.' }
      : {}),
  }));
}

export function relevantReferenceIds(parameters: PatternParameters): ReferenceId[] {
  const ids: ReferenceId[] = ['oval2018'];
  if (parameters.strategy === 'n-sided-patch') ids.push('takayama2014');
  if (['dual', 'ambo', 'kis', 'gyro'].includes(parameters.family)) ids.push('hart');
  return ids;
}

const numeric = (n: number) =>
  Number.isFinite(n) ? String(Number(n.toPrecision(8))) : 'unspecified';

export function describeMethod(p: PatternParameters, surfaceKind: SurfaceKind): string {
  if (surfaceKind === 'mesh')
    return 'An imported triangle mesh is retained for geometric and connectivity inspection. Source units are converted explicitly to meters, and the bounding-box center translation is recorded. No generated cell network, verified surface parameterization or retopology method has been applied.';
  const surfaces: Record<SurfaceKind, string> = {
    plane: 'a plane',
    cube: 'a cube with shared crease identities',
    sphere: 'a sphere with a shared cubical atlas',
    saddle: 'an analytic saddle',
    mesh: 'an imported triangle mesh',
  };
  const families = {
    quad: 'the untransformed quad network',
    dual: 'a dual transformation',
    ambo: 'an ambo transformation',
    kis: 'a kis transformation',
    gyro: 'a gyro transformation',
    diagonal: 'the project’s edge-preserving diagonal triangulation',
  };
  const presets = {
    regular: 'regular',
    inset: 'inset',
    alternating: 'alternating',
    radial: 'radial',
  };
  const construction =
    p.strategy === 'n-sided-patch'
      ? `an independently authored, incomplete ${numeric(p.patchSides)}-sided patch template with boundary counts (${p.boundaryCounts.map(numeric).join(', ')}) and variant ${numeric(p.variant)}, inspired by Takayama et al. (2014). It does not implement the complete paper’s template enumeration or minimum-singularity selection. Spacing is set by the hard boundary counts`
      : `the project-authored ${presets[p.preset] ?? 'unsupported'} coarse topology preset and compatible integer strip subdivisions, with target spacing ${numeric(p.spacing)} m. The separation of coarse topology, strip density, pattern transformation and geometry is informed by Oval et al. (2018); the preset does not reproduce their medial-axis construction or grammar`;
  let description = `Knitting Topology constructs a geometric cell network on ${surfaces[surfaceKind] ?? 'an unsupported surface'} using ${construction}.`;
  if (p.strategy === 'n-sided-patch')
    description += ' The broader pipeline separation is informed by Oval et al. (2018).';
  description += ` The output uses ${families[p.family] ?? 'an unsupported transformation'}.`;
  if (['dual', 'ambo', 'kis', 'gyro'].includes(p.family))
    description +=
      ' Operator connectivity follows Conway notation as described by Hart (n.d.); geometric placement is a project implementation.';
  if ((p.family === 'dual' || p.family === 'ambo') && surfaceKind === 'cube')
    description +=
      ' Chart-wise clipping, crease welding and any positive-area face splits are feature-preserving project adaptations.';
  else if (surfaceKind === 'plane' || surfaceKind === 'saddle') {
    if (['dual', 'ambo', 'gyro'].includes(p.family))
      description += ' Open-boundary closures are explicit project adaptations.';
  }
  description += ` Orientation ${numeric(p.orientation)}° and guide influence setting ${numeric(p.guideStrength)} configure a bounded chart-local cross-field fitting heuristic; guide influence applies only where eligible stroke segments exist, and guides do not choose topology. Relaxation is ${numeric(p.relaxation)}. Achieved spacing and cell quality require diagnostics. These geometric networks do not imply knit-loop, manufacturing or structural validity.`;
  return description;
}

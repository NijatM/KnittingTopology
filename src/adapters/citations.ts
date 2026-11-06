import type { ProjectState } from '../core/types';
import {
  describeMethod,
  referencesBibtex,
  referencesCSL,
  relevantReferenceIds,
} from '../learning/citations';
import { REFERENCES } from '../learning/references';
import packageInfo from '../../package.json';

export const SOFTWARE_CITATION = {
  author: 'Nijat Mahamaliyev',
  title: 'Knitting Topology',
  version: packageInfo.version,
  url: 'https://github.com/NijatM/KnittingTopology',
  status: 'development version',
  note: 'For publication, identify an immutable release or source commit in addition to this repository URL. No software DOI is assigned here.',
};

/** A citation record describes the accepted graph, even when pending controls differ. */
export function createCitationRecord(project: ProjectState, resultIsStale = false) {
  const graph = project.graph;
  const parameters = graph?.provenance.parameters ?? project.parameters;
  const ids = relevantReferenceIds(parameters);
  return {
    format: 'knitting-topology-method-record',
    schemaVersion: '1.0.0',
    recordedAt: new Date().toISOString(),
    basis: graph ? 'accepted graph' : 'requested inputs; no generated result',
    resultIsStale,
    software: SOFTWARE_CITATION,
    implementation: {
      algorithm: graph?.provenance.algorithm ?? null,
      algorithmVersion: graph?.provenance.version ?? null,
      inputSignature: graph?.provenance.inputSignature ?? null,
      surface: project.surface,
      units: { geometry: 'm', displayedLength: 'mm', orientation: 'degrees' },
      parameters,
      requestedParameters: project.parameters,
      scope: graph?.provenance.scope ?? 'No generated graph has been accepted.',
      notes: graph?.provenance.notes ?? [],
      guideInputsNote: graph
        ? 'The accepted guide inputs are identified by inputSignature and summarized in provenance notes when available. Saved project guides are editable inputs and may differ when the result is stale; exact regeneration of that accepted embedding then requires the original guide inputs.'
        : 'Saved project guides are requested inputs; no generated embedding has been accepted.',
    },
    suggestedDescription: describeMethod(parameters, project.surface.kind),
    descriptionNote:
      'Adapt this wording to the work actually performed. Cite the referenced method and disclose the implemented subset and project extensions. A citation is not evidence of validation.',
    references: ids.map((id) => REFERENCES[id]),
    csl: referencesCSL(ids),
    bibtex: referencesBibtex(ids),
  };
}

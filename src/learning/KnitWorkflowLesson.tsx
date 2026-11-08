import { useId, useState } from 'react';
import { download } from '../adapters/export';
import { referencesBibtex, referencesCSL, formatCitation } from './citations';
import { REFERENCES } from './references';
import {
  KNIT_METHOD_WORDING,
  KNIT_WORKFLOW,
  THESIS_FEATURES,
  THESIS_SETTINGS,
} from './knit-workflow';
import './learning.css';

/** Reference explorer only: choosing a stage never changes the user's project. */
export default function KnitWorkflowLesson() {
  const [stageIndex, setStageIndex] = useState(0);
  const id = useId();
  const stage = KNIT_WORKFLOW[stageIndex]!;
  const reference = REFERENCES.popescu2019knitcrete!;
  return (
    <details className="knit-workflow" aria-label="KnitCrete workflow guide">
      <summary>KnitCrete workflow · understand and cite</summary>
      <p>
        Read the source workflow beside what this app implements. The target surface shows computed
        placement; the fabric shape is not simulated.
      </p>
      <div className="knit-workflow-stages" role="group" aria-label="Thesis workflow stages">
        {KNIT_WORKFLOW.map((item, index) => (
          <button
            type="button"
            key={item.title}
            aria-pressed={index === stageIndex}
            aria-controls={`${id}-stage`}
            onClick={() => setStageIndex(index)}
          >
            <span>{String(index + 1).padStart(2, '0')}</span> {item.title}
          </button>
        ))}
      </div>
      <article id={`${id}-stage`} className="knit-workflow-stage" aria-live="polite">
        <h4>{stage.title}</h4>
        <dl>
          <dt>In the thesis</dt>
          <dd>{stage.source}</dd>
          <dt>In this app</dt>
          <dd>{stage.here}</dd>
          <dt className="knit-workflow-gap">Still needed</dt>
          <dd>{stage.gap}</dd>
        </dl>
        <p className="knit-workflow-locator">Locate: {stage.locator}</p>
      </article>
      <details>
        <summary>Generation settings in the thesis</summary>
        <p>
          §6.3.1, pp. 105–107. These are source definitions; missing controls are not enabled here.
        </p>
        <dl>
          {THESIS_SETTINGS.map(([name, text]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
        <p>
          Source example, not a measured gauge for your machine: KnitCandela used a 7 mm × 12 mm
          computational unit containing 2 loops × 6 courses, corresponding to 3.5 mm × 2 mm per loop
          (§7.3.4, p. 153). Repeating pixels alone would not preserve shaping operations.
        </p>
      </details>
      <details>
        <summary>Operations and feature gaps</summary>
        {THESIS_FEATURES.map((item) => (
          <article className="knit-workflow-feature" key={item.name}>
            <span className="knit-workflow-gap">{item.status}</span>
            <h4>{item.name}</h4>
            <p>{item.text}</p>
            <p className="knit-workflow-locator">Locate: {item.locator}</p>
          </article>
        ))}
      </details>
      <details>
        <summary>Citation and method wording</summary>
        <p>{formatCitation(reference)}</p>
        <a href={reference.url} target="_blank" rel="noreferrer">
          Primary thesis record / DOI ↗
        </a>
        <p>Printed page numbers are used above; add 10 for pages in the repository PDF.</p>
        <blockquote>{KNIT_METHOD_WORDING}</blockquote>
        <p>
          Adapt this wording to the methods actually used. A citation does not validate a result.
        </p>
        <div className="learning-downloads">
          <button
            type="button"
            onClick={() =>
              download(referencesBibtex([reference.id]), 'knitcrete.bib', 'application/x-bibtex')
            }
          >
            Download thesis BibTeX
          </button>
          <button
            type="button"
            onClick={() =>
              download(
                JSON.stringify(referencesCSL([reference.id]), null, 2),
                'knitcrete.csl.json',
                'application/json'
              )
            }
          >
            Download thesis CSL JSON
          </button>
          <button
            type="button"
            onClick={() =>
              download(`${KNIT_METHOD_WORDING}\n`, 'knit-method-note.txt', 'text/plain')
            }
          >
            Download method note
          </button>
        </div>
      </details>
    </details>
  );
}

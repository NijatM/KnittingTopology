import { useEffect, useRef, useState } from 'react';
import type { PatternParameters, SurfaceSpec } from '../core/types';
import { download } from '../adapters/export';
import { LESSONS, getLesson, suggestedLesson } from './catalog';
import { REFERENCES } from './references';
import {
  describeMethod,
  formatCitation,
  referenceBibtex,
  referencesBibtex,
  referencesCSL,
} from './citations';
import type { LearningExample, LessonId, MethodLesson } from './types';
import MethodDiagram from './MethodDiagram';
import KnitWorkflowLesson from './KnitWorkflowLesson';
import './learning.css';

interface LearningPanelProps {
  parameters: PatternParameters;
  surface: SurfaceSpec;
  stale: boolean;
  hasGraph: boolean;
  onLoadExample: (example: LearningExample) => void;
}
const GROUPS: { id: MethodLesson['group']; label: string }[] = [
  { id: 'construction', label: 'Construction' },
  { id: 'presets', label: 'Coarse presets' },
  { id: 'patterns', label: 'Pattern operators' },
  { id: 'guidance', label: 'Direction guidance' },
];

export default function LearningPanel({
  parameters,
  surface,
  stale,
  hasGraph,
  onLoadExample,
}: LearningPanelProps) {
  const [reading, setReading] = useState<LessonId | null>(null);
  const [notice, setNotice] = useState('');
  const [fallback, setFallback] = useState<{ label: string; text: string } | null>(null);
  const fallbackField = useRef<HTMLTextAreaElement>(null);
  const lesson = getLesson(reading ?? suggestedLesson(parameters));
  const currentDescription = `${hasGraph ? 'Accepted graph' : 'Requested inputs (no generated result)'}: ${describeMethod(parameters, surface)}`;
  const referenceIds = [...new Set(lesson.references.map((source) => source.id))];
  useEffect(() => {
    setFallback(null);
    setNotice('');
  }, [lesson.id]);
  useEffect(() => {
    if (fallback) {
      fallbackField.current?.focus();
      fallbackField.current?.select();
    }
  }, [fallback]);
  const copy = async (text: string, label: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setFallback(null);
      setNotice(`${label} copied.`);
    } catch {
      setFallback({ label, text });
      setNotice('Clipboard unavailable. Select the text below and copy it manually.');
    }
  };
  const load = () => {
    onLoadExample(lesson.experiment.example);
    setNotice(
      'Example inputs loaded. Use Undo to restore your work. Generate explicitly to compute the example.'
    );
  };
  return (
    <section
      className="learning-panel"
      data-testid="learning-panel"
      aria-label="Learn and cite methods"
    >
      <div className="learning-intro">
        <span className="learning-kicker">UNDERSTAND / EXPERIMENT / CITE</span>
        <h2>Learn the method</h2>
        <p>
          Read how each stage changes the network, try a bounded example, and inspect the source
          relationship.
        </p>
      </div>
      <KnitWorkflowLesson />
      <label className="learning-topic">
        Reading topic
        <select
          aria-label="Learning topic"
          value={lesson.id}
          onChange={(event) => setReading(event.target.value as LessonId)}
        >
          {GROUPS.map((group) => (
            <optgroup key={group.id} label={group.label}>
              {LESSONS.filter((item) => item.group === group.id).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="learning-follow">
        <p>
          {reading
            ? 'Reading another topic changes only these notes and the teaching diagram.'
            : 'Following the current method automatically.'}
        </p>
        <button type="button" disabled={!reading} onClick={() => setReading(null)}>
          Follow current method
        </button>
      </div>
      {stale && (
        <p className="learning-stale" role="note">
          These notes follow the accepted graph. Current controls have changes awaiting
          regeneration.
        </p>
      )}
      <details className="learning-context">
        <summary>
          {hasGraph ? 'Current viewport method' : 'Requested method (not generated)'}
        </summary>
        <p className="learning-current-method">{currentDescription}</p>
        <button
          type="button"
          onClick={() => void copy(currentDescription, 'Current method description')}
        >
          Copy current method description
        </button>
      </details>
      <article className="learning-lesson" key={lesson.id}>
        <div className="learning-lesson-title">
          <span className="learning-status">{lesson.status}</span>
          <h3>{lesson.title}</h3>
          <p>{lesson.summary}</p>
        </div>
        <MethodDiagram key={lesson.id} lesson={lesson} />
        <h4>What changes</h4>
        <ul>
          {lesson.changes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h4>Construction steps</h4>
        <ol>
          {lesson.steps.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
        <details className="learning-details">
          <summary>Assumptions and limits</summary>
          <h5>Assumptions</h5>
          <ul>
            {lesson.assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h5>Limits of this implementation</h5>
          <ul>
            {lesson.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
        <section className="learning-experiment" aria-label="Try the method">
          <span className="learning-kicker">CONTROLLED EXPERIMENT</span>
          <h4>{lesson.experiment.title}</h4>
          <ol>
            {lesson.experiment.instructions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
          <p>
            <strong>Look for:</strong> {lesson.experiment.expected}
          </p>
          <button type="button" className="learning-load" onClick={load}>
            Load example (undoable)
          </button>
          <small>
            Replaces project inputs with this example. Undo restores existing work. Generation
            remains an explicit action.
          </small>
        </section>
        <h4>Suggested wording</h4>
        <p className="learning-current-method">
          Template wording: adapt it to the surface, implementation and experiments actually used; a
          citation does not validate the result.
        </p>
        <blockquote className="learning-wording">{lesson.wording}</blockquote>
        <button type="button" onClick={() => void copy(lesson.wording, 'Suggested wording')}>
          Copy suggested wording
        </button>
        <h4>Sources and contribution</h4>
        {!lesson.references.length && (
          <p className="learning-current-method">
            This project-authored step has no external source attributed here. Its assumptions and
            limits remain part of the method description.
          </p>
        )}
        <div className="learning-references">
          {lesson.references.map((source) => {
            const reference = REFERENCES[source.id];
            return (
              <article className="learning-reference" key={`${source.id}:${source.locator}`}>
                <h5>{reference.title}</h5>
                <p className="learning-source-relationship">{source.relationship}</p>
                <p className="learning-locator">
                  <strong>Locate:</strong> {source.locator}
                </p>
                <p className="learning-full-reference">{formatCitation(reference)}</p>
                <div className="learning-reference-links">
                  <a href={reference.url} target="_blank" rel="noreferrer">
                    Primary source ↗
                  </a>
                  {reference.pdfUrl && (
                    <a href={reference.pdfUrl} target="_blank" rel="noreferrer">
                      Public PDF ↗
                    </a>
                  )}
                  {reference.proceedingsUrl && (
                    <a href={reference.proceedingsUrl} target="_blank" rel="noreferrer">
                      Final proceedings ↗
                    </a>
                  )}
                  {reference.interactiveUrl && (
                    <a href={reference.interactiveUrl} target="_blank" rel="noreferrer">
                      Interactive source ↗
                    </a>
                  )}
                  {reference.doi && (
                    <a href={`https://doi.org/${reference.doi}`} target="_blank" rel="noreferrer">
                      DOI: {reference.doi} ↗
                    </a>
                  )}
                </div>
                <div className="learning-copy-actions">
                  <button
                    type="button"
                    onClick={() => void copy(formatCitation(reference), 'Reference')}
                  >
                    Copy reference
                  </button>
                  <button
                    type="button"
                    onClick={() => void copy(referenceBibtex(reference), 'BibTeX')}
                  >
                    Copy BibTeX
                  </button>
                </div>
                <small className="learning-verification">
                  {reference.verificationNote} Accessed {reference.accessed}.
                </small>
              </article>
            );
          })}
        </div>
        <div className="learning-downloads">
          <button
            type="button"
            disabled={!referenceIds.length}
            onClick={() => {
              download(referencesBibtex(referenceIds), 'references.bib', 'application/x-bibtex');
              setNotice('Topic references downloaded as BibTeX.');
            }}
          >
            Download references.bib
          </button>
          <button
            type="button"
            disabled={!referenceIds.length}
            onClick={() => {
              download(
                JSON.stringify(referencesCSL(referenceIds), null, 2),
                'references.csl.json',
                'application/json'
              );
              setNotice('Topic references downloaded as CSL JSON.');
            }}
          >
            Download CSL JSON
          </button>
        </div>
      </article>
      <p className="learning-notice" role="status" aria-live="polite">
        {notice}
      </p>
      {fallback && (
        <div className="learning-clipboard-fallback">
          <label>
            {fallback.label}
            <textarea
              ref={fallbackField}
              readOnly
              value={fallback.text}
              aria-label={`${fallback.label} text to copy`}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              fallbackField.current?.focus();
              fallbackField.current?.select();
            }}
          >
            Select text
          </button>
        </div>
      )}
    </section>
  );
}

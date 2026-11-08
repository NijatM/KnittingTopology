// Knit graph stages (Popescu 2019, §6.3): saved state, counts, rule checks and stage files.
import { useState } from 'react';
import type { KnitSettings, SurfaceSpec, SwatchEntry } from '../../core/types';
import type { KnitProgram } from '../../knit/program';
import {
  COURSE_METHODS,
  knitGraphFreshness,
  loadStage,
  parseStageFile,
  stageFileText,
  type StageState,
} from '../../knit/knit-graph';
import { download } from '../../adapters/export';

interface Props {
  surface: SurfaceSpec;
  settings: KnitSettings;
  swatches: SwatchEntry[];
  program: KnitProgram | null;
  file: string;
  onSettings: (next: KnitSettings) => void;
}

const STATE_TEXT: Record<StageState, string> = {
  fresh: 'saved, matches the current inputs',
  stale: 'saved, stale: its inputs changed; Generate replaces it',
  missing: 'not saved; Generate builds it',
};

export default function KnitGraphStages({
  surface,
  settings,
  swatches,
  program,
  file,
  onSettings,
}: Props) {
  const [error, setError] = useState('');
  const state = knitGraphFreshness({ surface, knit: settings, swatches });
  if (!state) return null;
  const graph = settings.graph;
  const courses = graph?.courses,
    loops = graph?.loops;
  const faceKinds = loops?.primal
    ? Object.entries(
        loops.primal.faces.reduce<Record<string, number>>(
          (n, f) => ({ ...n, [f.kind]: (n[f.kind] ?? 0) + 1 }),
          {}
        )
      )
        .map(([k, n]) => `${n} ${k}`)
        .join(', ')
    : '';
  const roles = loops
    ? (['short-row', 'increase', 'decrease'] as const)
        .map((r) => `${loops.loops.filter((x) => x.role === r).length} ${r}`)
        .join(', ')
    : '';
  const checks = program?.shape?.knitGraph?.checks ?? [];
  const save = (stage: 'courses' | 'loops') => {
    const data = stage === 'courses' ? courses : loops;
    if (!graph || !data) return;
    download(
      stageFileText(graph.courseMethod, data),
      `${file}-knit-graph-${stage}.json`,
      'application/json'
    );
  };

  return (
    <section aria-label="Knit graph stages">
      <h3 className="knit-heading">Knit graph stages</h3>
      <p className="hint">
        {COURSE_METHODS[state.method].label}. Courses stage, then loops stage (Popescu 2019, §6.3).
        Saved stages are reused by Generate while they match their inputs; they are never replaced
        silently.
      </p>
      <ul className="hint" aria-label="Stage status">
        <li>
          Courses: {STATE_TEXT[state.courses]}
          {courses &&
            ` · ${courses.vertices.length} vertices, ${courses.links.length} weft links${
              courses.warp ? `, ${courses.warp.length} warp links` : ''
            }, ${courses.courses.length} courses`}
        </li>
        <li>
          Loops: {STATE_TEXT[state.loops]}
          {loops &&
            ` · ${loops.loops.length} loops (${roles})${
              loops.rows ? `, ${loops.rows.length} rows` : ''
            }${faceKinds ? `; faces: ${faceKinds}` : ''}`}
        </li>
      </ul>
      {checks.length > 0 && (
        <ul className="hint" aria-label="Knit graph checks">
          {checks.map((c) => (
            <li key={c.id} className={c.violations ? 'warn' : undefined}>
              {c.label} ({c.source}):{' '}
              {c.violations
                ? `${c.violations} violation${c.violations === 1 ? '' : 's'}, e.g. ${c.examples[0]}`
                : 'pass'}
            </li>
          ))}
        </ul>
      )}
      <div className="inline-actions">
        <button type="button" disabled={state.courses !== 'fresh'} onClick={() => save('courses')}>
          Courses JSON
        </button>
        <button type="button" disabled={state.loops !== 'fresh'} onClick={() => save('loops')}>
          Loops JSON
        </button>
        <label className="file-button">
          Load stage
          <input
            type="file"
            accept=".json,application/json"
            aria-label="Load knit graph stage file"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const next = loadStage(
                  { surface, knit: settings, swatches },
                  parseStageFile(await f.text())
                );
                onSettings({ ...settings, graph: next });
                setError('');
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          />
        </label>
        <button
          type="button"
          disabled={!graph}
          onClick={() => {
            onSettings({ ...settings, graph: undefined });
            setError('');
          }}
        >
          Discard stages
        </button>
      </div>
      {error && (
        <p className="knit-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

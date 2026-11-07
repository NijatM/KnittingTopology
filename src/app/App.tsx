import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type {
  InteractionMode,
  OverlayMode,
  ViewerHandle,
  ViewerOptions,
  ViewerSelection,
} from '../viewer/types';
import type {
  AnalyticSurfaceKind,
  ImportedMeshReport,
  SurfaceSpec,
  Diagnostic,
  GuideSample,
  PatternFamily,
  PatternParameters,
  ProjectState,
  KnitCutSettings,
  TopologyPreset,
} from '../core/types';
import { analyzeGraph } from '../core/diagnostics';
import { evaluateSurface } from '../core/surfaces';
import {
  MAX_PROJECT_CHARACTERS,
  MAX_GUIDE_SAMPLES,
  MAX_TOTAL_GUIDE_SAMPLES,
  MAX_UI_GUIDES,
} from '../core/limits';
import {
  createProject,
  freezeImportedMesh,
  geometryChange,
  historyReducer,
  parametersMatchGraph,
  parseProject,
  scientificSignature,
} from './project';
import { restoreFromStorage, writeAutosave } from './persistence';
import { acceptsResult } from '../workers/protocol';
import type { GenerateRequest, WorkerResponse } from '../workers/protocol';
import {
  diagnosticsToCSV,
  download,
  graphToOBJ,
  graphToSVG,
  projectFilename,
  saveProject,
} from '../adapters/export';
import LearningPanel from '../learning/LearningPanel';
import MappedChartLesson from '../learning/MappedChartLesson';
import type { LearningExample } from '../learning/types';
import { createCitationRecord } from '../adapters/citations';
import { referencesBibtex, relevantReferenceIds } from '../learning/citations';
import ImportControls from '../import/ImportControls';
import MeshInspector from '../import/MeshInspector';
import { seedMeshReport, useMeshReport } from '../import/useMeshReport';
import KnitControls from './knit/KnitControls';
import { useKnitBuild } from './knit/useKnitBuild';
import KnitBitmap from './knit/KnitBitmap';
import KnitPanel from './knit/KnitPanel';
import { loopSelection, marksOf, selectionLoops, shapeOverlay } from './knit/provenance';
import { knitSettingsOf, swatchesOf } from '../knit/program';
import { knitAvailable, knitSupported } from '../knit/mapping';
import { useCutPlan } from './knit/useCutPlan';
import CutControls from './knit/CutControls';
import CutPanel from './knit/CutPanel';
import { KnitVariant, knitCompareNote } from './knit/KnitVariant';
import { knitSnapshot, type KnitSnapshot } from '../knit/compare';

const SurfaceViewer = lazy(() => import('../viewer/SurfaceViewer'));
const SURFACES: { key: AnalyticSurfaceKind; name: string; caption: string }[] = [
  { key: 'plane', name: 'Plane', caption: 'Open / flat' },
  { key: 'cube', name: 'Cube', caption: 'Closed / creased' },
  { key: 'sphere', name: 'Sphere', caption: 'Closed / curved' },
  { key: 'saddle', name: 'Saddle', caption: 'Open / curved' },
];
const FAMILIES: { key: PatternFamily; name: string; caption: string }[] = [
  { key: 'quad', name: 'Quad', caption: 'Base network' },
  { key: 'dual', name: 'Dual', caption: 'Cell ↔ vertex' },
  { key: 'ambo', name: 'Ambo', caption: 'Edge midpoints' },
  { key: 'kis', name: 'Kis', caption: 'Face fans' },
  { key: 'gyro', name: 'Gyro', caption: 'Directed thirds' },
  { key: 'diagonal', name: 'Diagonal', caption: 'Split faces' },
];
const PRESETS: { key: TopologyPreset; name: string }[] = [
  { key: 'regular', name: 'Regular' },
  { key: 'inset', name: 'Inset' },
  { key: 'alternating', name: 'Alternating' },
  { key: 'radial', name: 'Nested' },
];
const DEFAULT_VIEW: ViewerOptions = {
  mode: 'orbit',
  overlay: 'plain',
  showSurface: true,
  showGraph: true,
  showGuides: true,
  showSeams: false,
  showNodes: false,
  showCoarse: false,
  wireframe: false,
  background: 'dark',
};

function Icon({ name, size = 15 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    orbit: 'M12 8a4 4 0 1 1-4 4M3 3l4 1-3 4M21 21l-4-1 3-4M3 12C3 5 19 4 21 12S5 21 3 12Z',
    draw: 'm4 16-1 5 5-1L20 8l-4-4L4 16Zm11-11 4 4',
    select: 'M5 3v17l5-5 4 7 3-2-4-7h7L5 3Z',
    undo: 'M8 4 3 9l5 5M3 9h11a6 6 0 0 1 0 12',
    redo: 'm16 4 5 5-5 5m5-5H10a6 6 0 0 0 0 12',
    fit: 'M3 8V3h5m8 0h5v5M3 16v5h5m13-5v5h-5M8 8h8v8H8Z',
    save: 'M4 3h14l3 3v15H3V3h1Zm3 0v6h10V3M7 21v-8h10v8',
    load: 'M3 7h7l2 3h9l-3 10H3V7Zm9 0V2m-3 3 3-3 3 3',
    camera: 'M3 7h5l2-3h4l2 3h5v14H3V7Zm9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
    arrow: 'M4 12h16m-6-6 6 6-6 6',
    close: 'm5 5 14 14M19 5 5 19',
    help: 'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4m0 3v1M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z',
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.arrow} />
    </svg>
  );
}
function SurfaceGlyph({ kind }: { kind: AnalyticSurfaceKind }) {
  return (
    <svg
      viewBox="0 0 80 52"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.85"
      aria-hidden="true"
    >
      {kind === 'sphere' ? (
        <>
          <circle cx="40" cy="26" r="21" />
          <ellipse cx="40" cy="26" rx="10" ry="21" />
          <ellipse cx="40" cy="26" rx="18" ry="21" />
          <ellipse cx="40" cy="26" rx="21" ry="8" />
          <path d="M20 17q20-12 40 0M20 35q20 12 40 0" />
        </>
      ) : kind === 'cube' ? (
        <>
          <path d="m40 3 25 13v24L40 51 15 38V14L40 3Zm0 24 25-11M40 27 15 14m25 13v24M15 38l25-13 25 15" />
          <path d="m27 9 25 13v24M52 9 27 21v24M15 26l25 13 25-12" opacity=".4" />
        </>
      ) : kind === 'saddle' ? (
        <>
          <path d="M10 13q30 25 60 0L58 43q-18-22-36 0Z" />
          {[0, 1, 2, 3, 4].map((i) => (
            <path
              key={i}
              d={`M${10 + i * 15} ${13 + Math.sin((i * Math.PI) / 4) * 12}Q40 ${48 - i * 8} ${22 + i * 9} ${43 - Math.sin((i * Math.PI) / 4) * 11}`}
              opacity=".65"
            />
          ))}
        </>
      ) : (
        <>
          <path d="m9 31 40-23 24 13-40 24Z" />
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <path d={`m${17 + i * 8} ${26 - i * 4.5} 24 14`} />
              <path d={`m${15 + i * 6} ${34 + i * 3.5} 40-23`} opacity=".65" />
            </g>
          ))}
        </>
      )}
    </svg>
  );
}
function FamilyGlyph({ family }: { family: PatternFamily }) {
  const grid = [10, 30, 50].flatMap((x) => [10, 30, 50].map((y) => ({ x, y })));
  return (
    <svg viewBox="0 0 80 64" fill="none" stroke="currentColor" strokeWidth=".8" aria-hidden="true">
      {family === 'quad' &&
        grid.map(({ x, y }) => <path key={`${x}-${y}`} d={`M${x} ${y}h20v20H${x}Z`} />)}
      {family === 'dual' &&
        grid.map(({ x, y }) => (
          <path key={`${x}-${y}`} d={`m${x + 10} ${y - 5} 15 15-15 15-15-15Z`} />
        ))}
      {family === 'ambo' &&
        grid.map(({ x, y }) => (
          <path key={`${x}-${y}`} d={`m${x + 10} ${y} 10 10-10 10-10-10Z M${x} ${y}h20v20H${x}Z`} />
        ))}
      {family === 'kis' &&
        grid.map(({ x, y }) => (
          <path key={`${x}-${y}`} d={`M${x} ${y}h20v20H${x}Z m0 0 20 20m0-20-20 20`} />
        ))}
      {family === 'gyro' &&
        grid.map(({ x, y }) => (
          <path
            key={`${x}-${y}`}
            d={`m${x + 6} ${y} 14 7-3 13-14-3-3-11Z M${x + 6} ${y}l4 10 10-3m-10 3 7 10m-7-10L${x + 3} ${y + 17}`}
          />
        ))}
      {family === 'diagonal' &&
        grid.map(({ x, y }) => <path key={`${x}-${y}`} d={`M${x} ${y}h20v20H${x}Z m0 0 20 20`} />)}
    </svg>
  );
}
function RangeControl({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number | 'any';
  suffix?: string;
  onChange: (n: number) => void;
}) {
  return (
    <label className="range-control">
      <span className="control-caption">
        {label}
        <span>
          {Number.isInteger(value) ? value : Number(value.toPrecision(6))}
          <small>{suffix}</small>
        </span>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
function Check({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      className={`check ${value ? 'checked' : ''}`}
      aria-pressed={value}
      onClick={onChange}
    >
      <span aria-hidden="true">[{value ? '×' : ' '}]</span>
      {label}
    </button>
  );
}
function Metric({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>
        {value}
        <small>{unit}</small>
      </strong>
    </div>
  );
}
function formatLength(value: number): string {
  return (value * 1000).toFixed(value < 0.01 ? 2 : 1);
}

export default function App() {
  const [initialRestore] = useState(() =>
    restoreFromStorage({
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
      removeItem: (key) => localStorage.removeItem(key),
    })
  );
  const [history, dispatch] = useReducer(historyReducer, initialRestore.project, (initial) => ({
    past: [],
    present: initial,
    future: [],
  }));
  const project = history.present;
  const imported = project.surface.kind === 'mesh';
  const mapped = imported && project.surface.mapping === 'rectangular-obj-uv-v1';
  const inspectionOnly = imported && !mapped;
  const meshInspection = useMeshReport(project.surface);
  const [nameDraft, setNameDraft] = useState(project.name);
  useEffect(() => setNameDraft(project.name), [project.name]);
  const [cacheNotice, setCacheNotice] = useState(
    initialRestore.recoveryText ||
      !initialRestore.allowAutosave ||
      initialRestore.notice.includes('latest inputs')
      ? initialRestore.notice
      : ''
  );
  const projectRef = useRef(project);
  projectRef.current = project;
  const [view, setView] = useState<ViewerOptions>(DEFAULT_VIEW);
  useEffect(() => {
    if (inspectionOnly) setView((v) => (v.mode === 'draw' ? { ...v, mode: 'orbit' } : v));
  }, [inspectionOnly]);
  const [selection, setSelection] = useState<ViewerSelection | null>(null);
  const [tab, setTab] = useState<
    'measures' | 'topology' | 'compare' | 'methods' | 'surface' | 'knit'
  >('measures');
  const [pickingKnitEdge, setPickingKnitEdge] = useState(false);
  const [pickingCutEdge, setPickingCutEdge] = useState(false);
  useEffect(() => setPickingCutEdge(false), [project.graph, project.surface.revision]);
  const [knitOpen, setKnitOpen] = useState(false);
  const [knitHover, setKnitHover] = useState<number | null>(null);
  const [knitMarks, setKnitMarks] = useState<number[] | null>(null);
  const [split, setSplit] = useState(0.5);
  const [variants, setVariants] = useState<
    {
      id: number;
      name: string;
      project: ProjectState;
      /** False when captured for its knit program without a current network. */
      networkCurrent: boolean;
      /** The knit program at capture, why none was captured, or null when knit settings were never used. */
      knit: KnitSnapshot | string | null;
    }[]
  >([]);
  const [status, setStatus] = useState('Preparing your surface…');
  const [busy, setBusy] = useState<{ fraction: number; stage: string } | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState('');
  const [help, setHelp] = useState(false);
  const [autosave, setAutosave] = useState<'saved' | 'saving' | 'inputs-only' | 'unavailable'>(
    'saved'
  );
  const viewer = useRef<ViewerHandle | null>(null);
  const loadInput = useRef<HTMLInputElement>(null);
  const activeJob = useRef<{
    id: number;
    revision: number;
    signature: string;
    worker: Worker;
  } | null>(null);
  const sequence = useRef(0);
  const initialGeneration = useRef(false);
  const stale = !!project.graph && !parametersMatchGraph(project);
  const patchMode = project.parameters.strategy === 'n-sided-patch';
  const stats = project.statistics;
  const errors = project.diagnostics.filter((d) => d.severity === 'error');
  const warnings = project.diagnostics.filter((d) => d.severity === 'warning');

  const commit = useCallback((next: ProjectState, coalesceKey?: string) => {
    dispatch({ type: 'commit', next, coalesceKey });
    setError(null);
  }, []);
  const endEditing = useCallback(() => dispatch({ type: 'end-coalesce' }), []);
  const cancel = useCallback((announce = true) => {
    if (activeJob.current) {
      activeJob.current.worker.terminate();
      activeJob.current = null;
    }
    setBusy(null);
    if (announce) setStatus('Generation cancelled. Previous result retained.');
  }, []);
  const generate = useCallback(() => {
    cancel(false);
    setError(null);
    const snapshot = projectRef.current;
    if (snapshot.surface.kind === 'mesh' && !snapshot.surface.mapping) {
      setStatus(
        'Imported surface inspection. Pattern generation requires a verified surface mapping.'
      );
      return;
    }
    const signature = scientificSignature(snapshot);
    const id = ++sequence.current;
    let worker: Worker;
    try {
      worker = new Worker(new URL('../workers/generation.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      setError('This browser could not start the generation worker.');
      return;
    }
    activeJob.current = { id, revision: snapshot.revision, signature, worker };
    setBusy({ fraction: 0, stage: 'Starting geometry worker' });
    setStatus('Generating a new network…');
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      if (activeJob.current?.id !== data.jobId) return;
      if (
        !acceptsResult(activeJob.current.id, activeJob.current.revision, data) ||
        scientificSignature(projectRef.current) !== signature
      ) {
        cancel(false);
        setStatus('Inputs changed. Outdated worker result discarded. Generate again.');
        return;
      }
      if (data.type === 'progress') {
        setBusy({ fraction: Math.max(0, Math.min(1, data.fraction)), stage: data.stage });
        return;
      }
      worker.terminate();
      activeJob.current = null;
      setBusy(null);
      if (data.type === 'error') {
        setError(data.message);
        setStatus('Generation stopped. Previous result retained.');
        return;
      }
      const resultErrors = data.result.diagnostics.filter((d) => d.severity === 'error');
      if (resultErrors.length) {
        setError(resultErrors.map((d) => d.message).join(' '));
        return;
      }
      dispatch({ type: 'accept-result', signature, result: data.result });
      setElapsed(data.elapsedMs);
      setSelection(null);
      setStatus(
        `Network generated · ${data.result.statistics.cells.toLocaleString()} cells · ${(data.elapsedMs / 1000).toFixed(2)} s`
      );
    };
    worker.onerror = (event) => {
      event.preventDefault();
      if (activeJob.current?.id !== id) return;
      cancel(false);
      setError('Geometry worker failed. Try a lower density or check the console for details.');
    };
    const message: GenerateRequest = {
      type: 'generate',
      jobId: id,
      inputRevision: snapshot.revision,
      input: {
        surface: snapshot.surface,
        parameters: snapshot.parameters,
        guides: snapshot.guides,
      },
    };
    worker.postMessage(message);
  }, [cancel]);

  useEffect(() => {
    if (!initialGeneration.current) {
      initialGeneration.current = true;
      if (
        !projectRef.current.graph &&
        (projectRef.current.surface.kind !== 'mesh' || projectRef.current.surface.mapping)
      )
        generate();
      else setStatus(initialRestore.notice || 'Restored your locally saved project.');
    }
    return () => {
      cancel(false);
      initialGeneration.current = false;
    };
  }, [generate]);
  useEffect(() => {
    if (!initialRestore.allowAutosave) {
      setAutosave('unavailable');
      return;
    }
    setAutosave('saving');
    const timer = setTimeout(() => {
      const result = writeAutosave(localStorage, project);
      setAutosave(result === 'full' ? 'saved' : result);
      if (result === 'inputs-only')
        setCacheNotice(
          'Only inputs fit in the local cache. Download project JSON to retain the accepted network; a reload will regenerate it.'
        );
      else if (result === 'unavailable')
        setCacheNotice('Local autosave is unavailable. Download project JSON to keep your work.');
      else
        setCacheNotice((old) =>
          old.startsWith('Only inputs') || old.startsWith('Local autosave') ? '' : old
        );
    }, 800);
    return () => clearTimeout(timer);
  }, [project]);
  const undo = useCallback(() => {
    cancel(false);
    dispatch({ type: 'undo' });
    setSelection(null);
    setElapsed(null);
    setStatus('Undid the last project change.');
    setError(null);
  }, [cancel]);
  const redo = useCallback(() => {
    cancel(false);
    dispatch({ type: 'redo' });
    setSelection(null);
    setElapsed(null);
    setStatus('Redid the project change.');
    setError(null);
  }, [cancel]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveProject(projectRef.current);
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      } else if (event.metaKey || event.ctrlKey || event.altKey) return;
      else if (event.key.toLowerCase() === 'g' && !event.metaKey && !event.ctrlKey) generate();
      else if (
        event.key.toLowerCase() === 'd' &&
        (projectRef.current.surface.kind !== 'mesh' || !!projectRef.current.surface.mapping)
      )
        setView((v) => ({ ...v, mode: 'draw' }));
      else if (event.key.toLowerCase() === 'v') setView((v) => ({ ...v, mode: 'orbit' }));
      else if (event.key.toLowerCase() === 'f') viewer.current?.fit();
      else if (event.key === 'Escape') {
        if (activeJob.current) cancel();
        else {
          setHelp(false);
          setView((v) => ({ ...v, mode: 'orbit' }));
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [generate, undo, redo, cancel]);
  const changeParameter = (change: Partial<PatternParameters>) => {
    const current = projectRef.current;
    commit(
      { ...current, parameters: { ...current.parameters, ...change } },
      `parameters:${Object.keys(change).sort().join(',')}`
    );
  };
  const changeSurface = (kind: AnalyticSurfaceKind) => {
    cancel(false);
    const current = projectRef.current;
    const next = geometryChange(current, {
      kind,
      ...(current.surface.kind === 'mesh' ? { size: 0.18 } : {}),
    });
    if (kind !== 'plane')
      next.parameters = { ...next.parameters, strategy: 'patch-grid', stripOverrides: undefined };
    else next.parameters = { ...next.parameters, stripOverrides: undefined };
    commit(next);
    setSelection(null);
    setElapsed(null);
    setStatus('Surface changed. Generate a network when ready.');
  };
  const addStroke = useCallback(
    (samples: GuideSample[]) => {
      if (samples.length < 2) return;
      const current = projectRef.current;
      if (samples.some((s) => s.attachment.surfaceRevision !== current.surface.revision)) return;
      if (current.guides.length >= MAX_UI_GUIDES) {
        setError('The 64-guide limit is reached. Remove a guide before adding another.');
        return;
      }
      const available =
        MAX_TOTAL_GUIDE_SAMPLES - current.guides.reduce((sum, g) => sum + g.samples.length, 0);
      const count = Math.min(samples.length, MAX_GUIDE_SAMPLES, available);
      if (count < 2) {
        setError('The guide sample budget is reached. Remove or simplify earlier guides.');
        return;
      }
      const retained =
        count === samples.length
          ? samples
          : Array.from(
              { length: count },
              (_, i) => samples[Math.round((i * (samples.length - 1)) / (count - 1))]!
            );
      const sampling =
        count < samples.length
          ? {
              originalCount: samples.length,
              retainedCount: count,
              method: 'uniform-index-subsample-v1' as const,
            }
          : undefined;
      commit({
        ...current,
        guides: [
          ...current.guides,
          {
            id: `guide-${crypto.randomUUID()}`,
            samples: retained,
            strength: 1,
            ...(sampling ? { sampling } : {}),
          },
        ],
      });
      setStatus(
        sampling
          ? `Direction guide retained ${count} of ${samples.length} samples. Regenerate to apply it.`
          : 'Direction guide added. Regenerate to apply it.'
      );
    },
    [commit]
  );
  const loadFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > MAX_PROJECT_CHARACTERS)
        throw new Error('Project files must be smaller than 64 MB.');
      const next = parseProject(await file.text());
      if (next.graph) {
        const checked = analyzeGraph(
          next.graph,
          next.surface,
          next.graph.provenance.parameters.spacing
        );
        if (checked.diagnostics.some((d) => d.severity === 'error'))
          throw new Error('The saved graph failed topology or geometry validation.');
        Object.assign(next, checked);
      }
      cancel(false);
      commit(next);
      setSelection(null);
      setElapsed(null);
      setStatus(`Loaded ${next.name}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this project.');
    }
    if (loadInput.current) loadInput.current.value = '';
  };
  const setOverlay = (overlay: OverlayMode) => setView((v) => ({ ...v, overlay }));
  const toggle = (
    key: keyof Pick<
      ViewerOptions,
      | 'showSurface'
      | 'showGraph'
      | 'showGuides'
      | 'showSeams'
      | 'showNodes'
      | 'showCoarse'
      | 'wireframe'
    >
  ) => setView((v) => ({ ...v, [key]: !v[key] }));
  const selectedNode =
    selection?.kind === 'node'
      ? project.graph?.nodes.find((n) => n.id === selection.id)
      : undefined;
  const selectedCell =
    selection?.kind === 'cell'
      ? project.graph?.cells.find((c) => c.id === selection.id)
      : undefined;
  const knitSettings = knitSettingsOf(project);
  const swatches = swatchesOf(project);
  const changeCut = (cut: KnitCutSettings) =>
    commit({ ...projectRef.current, knit: { ...knitSettingsOf(projectRef.current), cut } });
  const cutJob = useCutPlan(project.surface, project.graph, knitSettings.cut, changeCut);
  const showProgram = knitOpen && knitAvailable(project.surface);
  const cutEdgeIds = cutJob.matches ? knitSettings.cut?.edgeIds : undefined;
  const knitJob = useKnitBuild(
    {
      surface: project.surface,
      graph: project.graph,
      knit: project.knit,
      swatches: project.swatches,
    },
    stale
  );
  const knitBuild = knitJob.build;
  const knitProgram = knitBuild.ok ? knitBuild.program : null;
  // A program that matches the current settings and network, so a capture can keep it.
  const knitCurrent = !!knitProgram && !knitJob.outdated && !knitProgram.staleNetwork;
  const knitShapeOverlay = useMemo(
    () => (knitOpen && knitProgram ? shapeOverlay(knitProgram) : null),
    [knitOpen, knitProgram]
  );
  const knitHoverSelection =
    knitProgram && project.graph && knitHover !== null
      ? loopSelection(knitProgram, project.graph, knitHover)
      : null;
  const knitMarker =
    knitProgram && knitHover !== null
      ? knitProgram.shape
        ? (knitProgram.shape.needles.placements[knitProgram.shape.placementAt[knitHover]!]?.loop
            .position ?? null)
        : knitProgram.mapping.toSurface([
            (knitHover % knitProgram.w) + 0.5,
            knitProgram.h - Math.floor(knitHover / knitProgram.w) - 0.5,
          ])
      : null;
  const knitMarkCells = useMemo(
    () =>
      knitProgram
        ? knitMarks
          ? marksOf(knitProgram, knitMarks)
          : project.graph
            ? selectionLoops(knitProgram, project.graph, selection)
            : null
        : null,
    [knitProgram, project.graph, knitMarks, selection]
  );
  const knitStatus = knitProgram
    ? `${knitProgram.w} × ${knitProgram.h} · ${knitProgram.findings.length} check findings · ${knitProgram.transfers.length} transfers`
    : !knitBuild.ok
      ? knitBuild.reason
      : '';
  const changeKnit = (next: import('../core/types').KnitSettings, coalesceKey?: string) => {
    setKnitMarks(null);
    commit({ ...projectRef.current, knit: next }, coalesceKey);
  };
  const displayParameters = project.graph?.provenance.parameters ?? project.parameters;
  const activeFamily = FAMILIES.find((f) => f.key === displayParameters.family)!;
  const graphDiagnosticList = project.diagnostics.filter(
    (d) => !['support-area', 'polygon-area', 'paper-scope'].includes(d.id)
  );
  const viewerReady = useCallback((handle: ViewerHandle) => {
    viewer.current = handle;
  }, []);
  const viewerError = useCallback((message: string) => setError(message), []);
  const acceptImportedSurface = useCallback(
    (surface: SurfaceSpec, report: ImportedMeshReport, inputRevision: number) => {
      const current = projectRef.current;
      if (current.revision !== inputRevision || surface.kind !== 'mesh' || !surface.mesh)
        return false;
      cancel(false);
      freezeImportedMesh(surface.mesh);
      seedMeshReport(surface.mesh, report);
      commit({
        ...current,
        surface,
        parameters: {
          ...current.parameters,
          ...(surface.mapping
            ? {
                strategy: 'patch-grid' as const,
                spacing: Math.min(current.parameters.spacing, surface.size / 8),
              }
            : {}),
          stripOverrides: undefined,
        },
        guides: [],
        graph: null,
        diagnostics: [],
        statistics: null,
      });
      setSelection(null);
      setElapsed(null);
      setView((v) => ({
        ...v,
        mode: 'orbit',
        overlay: 'plain',
        showSurface: true,
        wireframe: true,
        showSeams: true,
        showGraph: true,
        showGuides: !!surface.mapping,
        showCoarse: false,
      }));
      setStatus(
        `${surface.mesh.source.name} imported${surface.mapping ? ' with a supplied rectangular UV chart. Generate to create a network' : ' for inspection'}. Undo restores your previous surface.`
      );
      setTab('measures');
      return true;
    },
    [cancel, commit]
  );
  const loadLearningExample = useCallback(
    (example: LearningExample) => {
      cancel(false);
      const base = geometryChange(createProject(), { kind: example.surface, size: example.size });
      const next: ProjectState = {
        ...base,
        name: example.name,
        parameters: { ...base.parameters, ...example.parameters, stripOverrides: undefined },
      };
      if (example.addDirectionGuide) {
        next.guides = [
          {
            id: `guide-${crypto.randomUUID()}`,
            strength: 1,
            samples: [
              [-0.7, -0.7 * Math.tan(Math.PI / 6)],
              [0.7, 0.7 * Math.tan(Math.PI / 6)],
            ].map(([x, y]) => ({
              position: evaluateSurface(next.surface, 0, (x! + 1) / 2, (y! + 1) / 2),
              attachment: {
                surfaceRevision: next.surface.revision,
                patch: 0,
                uv: [(x! + 1) / 2, (y! + 1) / 2],
              },
            })),
          },
        ];
      }
      commit(next);
      setSelection(null);
      setElapsed(null);
      setView((v) => ({
        ...v,
        mode: 'orbit',
        overlay: 'plain',
        showSurface: true,
        showGraph: true,
        showGuides: true,
        showCoarse: false,
      }));
      setStatus(`${example.name} loaded. Generate to run it; Undo restores your previous project.`);
    },
    [cancel, commit]
  );

  return (
    <div
      className="workspace"
      onPointerUpCapture={endEditing}
      onKeyUpCapture={endEditing}
      onBlurCapture={endEditing}
    >
      <aside className="sidebar" aria-label="Generation controls">
        <a
          className="identity"
          href="https://nijatmahamaliyev.com"
          target="_blank"
          rel="noreferrer"
        >
          <strong>Nijat Mahamaliyev</strong>
          <span>Tailored Materiality Research</span>
        </a>
        <div className="sidebar-scroll">
          <div className="project-heading">
            <span className="eyebrow">SURFACE / PATTERN / TOPOLOGY</span>
            <h1>
              Knitting
              <br />
              Topology<span className="title-dot">.</span>
            </h1>
            <p>
              A laboratory for connected
              <br />
              patterns on surfaces.
            </p>
          </div>
          <section className="control-section">
            <h2>
              <span>01</span> Surface <i />
            </h2>
            <div className="surface-grid">
              {SURFACES.map((s) => (
                <button
                  key={s.key}
                  className={`surface-card ${project.surface.kind === s.key ? 'active' : ''}`}
                  aria-pressed={project.surface.kind === s.key}
                  onClick={() => changeSurface(s.key)}
                >
                  <SurfaceGlyph kind={s.key} />
                  <strong>{s.name}</strong>
                  <small>{s.caption}</small>
                </button>
              ))}
            </div>
            {!imported && (
              <RangeControl
                label={project.surface.kind === 'sphere' ? 'Diameter' : 'Side length'}
                value={Math.round(project.surface.size * 1000)}
                min={40}
                max={400}
                step={5}
                suffix="mm"
                onChange={(n) => {
                  cancel(false);
                  commit(geometryChange(projectRef.current, { size: n / 1000 }), 'surface:size');
                  setSelection(null);
                  setElapsed(null);
                }}
              />
            )}
            {project.surface.kind === 'saddle' && (
              <RangeControl
                label="Saddle rise"
                value={project.surface.curvature}
                min={0.1}
                max={1.5}
                step={0.05}
                onChange={(n) => {
                  cancel(false);
                  commit(geometryChange(projectRef.current, { curvature: n }), 'surface:curvature');
                  setSelection(null);
                  setElapsed(null);
                }}
              />
            )}
            <details className="surface-import">
              <summary>Import OBJ / STL</summary>
              <ImportControls revision={project.revision} onImported={acceptImportedSurface} />
            </details>
          </section>
          {!inspectionOnly && (
            <>
              <section className="control-section">
                <h2>
                  <span>02</span> Topology <i />
                </h2>
                <label className="select-label">
                  Construction
                  <select
                    aria-label="Construction"
                    value={project.parameters.strategy}
                    onChange={(e) => {
                      cancel(false);
                      const current = projectRef.current;
                      const next =
                        e.target.value === 'n-sided-patch' && current.surface.kind !== 'plane'
                          ? geometryChange(current, { kind: 'plane' })
                          : current;
                      commit({
                        ...next,
                        parameters: {
                          ...next.parameters,
                          strategy: e.target.value as PatternParameters['strategy'],
                          stripOverrides: undefined,
                        },
                      });
                      setSelection(null);
                      setElapsed(null);
                    }}
                  >
                    <option value="patch-grid">Surface patch network</option>
                    <option value="n-sided-patch" disabled={mapped}>
                      N-sided patch laboratory
                    </option>
                  </select>
                </label>
                {!patchMode ? (
                  <>
                    <div className="preset-grid">
                      {PRESETS.map((p) => (
                        <button
                          key={p.key}
                          aria-pressed={project.parameters.preset === p.key}
                          className={project.parameters.preset === p.key ? 'active' : ''}
                          onClick={() =>
                            changeParameter({ preset: p.key, stripOverrides: undefined })
                          }
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                    <RangeControl
                      label="Target spacing"
                      value={Number((project.parameters.spacing * 1000).toPrecision(6))}
                      min={mapped ? Math.max(1e-9, (project.surface.size * 1000) / 1024) : 3}
                      max={mapped ? Math.max(40, (project.surface.size * 1000) / 2) : 40}
                      step={mapped ? 'any' : 0.5}
                      suffix="mm"
                      onChange={(n) =>
                        changeParameter({ spacing: n / 1000, stripOverrides: undefined })
                      }
                    />
                  </>
                ) : (
                  <>
                    <label className="select-label">
                      Patch sides
                      <select
                        aria-label="Patch sides"
                        value={project.parameters.patchSides}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          changeParameter({
                            patchSides: n,
                            boundaryCounts: Array(n).fill(6),
                            variant: 0,
                          });
                        }}
                      >
                        {[3, 4, 5, 6].map((n) => (
                          <option key={n} value={n}>
                            {n}-sided patch
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="boundary-counts">
                      {project.parameters.boundaryCounts.map((count, i) => (
                        <label key={i}>
                          Side {i + 1}
                          <input
                            aria-label={`Side ${i + 1} subdivisions`}
                            type="number"
                            min="1"
                            max="64"
                            value={count}
                            onChange={(e) => {
                              const counts = [...project.parameters.boundaryCounts];
                              counts[i] = Math.max(
                                1,
                                Math.min(64, Math.round(Number(e.target.value) || 1))
                              );
                              changeParameter({ boundaryCounts: counts });
                            }}
                          />
                        </label>
                      ))}
                    </div>
                    <div className="inline-actions">
                      <button
                        onClick={() =>
                          changeParameter({
                            boundaryCounts: Array(project.parameters.patchSides).fill(6),
                          })
                        }
                      >
                        Equal counts
                      </button>
                      <button
                        aria-pressed={project.parameters.variant === 1}
                        onClick={() =>
                          changeParameter({ variant: project.parameters.variant ? 0 : 1 })
                        }
                      >
                        Variant {project.parameters.variant + 1}
                      </button>
                    </div>
                    <p className="hint">
                      A bounded template subset. Unsupported subdivision combinations are reported
                      explicitly.
                    </p>
                  </>
                )}
                <RangeControl
                  label={mapped ? 'UV field orientation' : 'Field orientation'}
                  value={project.parameters.orientation}
                  min={-90}
                  max={90}
                  step={5}
                  suffix="°"
                  onChange={(n) => changeParameter({ orientation: n })}
                />
                <RangeControl
                  label={mapped ? 'UV guide influence' : 'Guide influence'}
                  value={Math.round(project.parameters.guideStrength * 100)}
                  min={0}
                  max={100}
                  suffix="%"
                  onChange={(n) => changeParameter({ guideStrength: n / 100 })}
                />
                <RangeControl
                  label={mapped ? 'UV relaxation' : 'Relaxation'}
                  value={Math.round(project.parameters.relaxation * 100)}
                  min={0}
                  max={100}
                  suffix="%"
                  onChange={(n) => changeParameter({ relaxation: n / 100 })}
                />
              </section>
              <section className="control-section">
                <h2>
                  <span>03</span> Pattern <i />
                </h2>
                <div className="family-grid">
                  {FAMILIES.map((f) => (
                    <button
                      key={f.key}
                      className={`family-card ${project.parameters.family === f.key ? 'active' : ''}`}
                      aria-pressed={project.parameters.family === f.key}
                      onClick={() => changeParameter({ family: f.key })}
                    >
                      <FamilyGlyph family={f.key} />
                      <span>{f.name}</span>
                    </button>
                  ))}
                </div>
              </section>
              {cutJob.closed && (
                <CutControls
                  surface={project.surface}
                  cut={knitSettings.cut}
                  job={cutJob}
                  picking={pickingCutEdge}
                  hasGraph={!!project.graph}
                  onChange={changeCut}
                  onInspect={() => setTab('knit')}
                  onTogglePicking={() => {
                    setPickingCutEdge((v) => !v);
                    setPickingKnitEdge(false);
                    setView((v) => ({ ...v, mode: 'orbit', showGraph: true }));
                    setTab('knit');
                  }}
                />
              )}
              {knitAvailable(project.surface) ? (
                <KnitControls
                  closed={
                    project.surface.kind === 'cube' || project.surface.kind === 'sphere'
                      ? project.surface.kind
                      : undefined
                  }
                  pickingEdge={pickingKnitEdge}
                  onToggleEdgePicking={() => setPickingKnitEdge((v) => !v)}
                  settings={knitSettings}
                  open={knitOpen}
                  status={`${knitStatus}${knitJob.outdated ? ' · Program settings pending generation' : ''}`}
                  shapeJob={knitJob.usesWorker ? knitJob : undefined}
                  onChange={changeKnit}
                  onToggleOpen={() => setKnitOpen((v) => !v)}
                />
              ) : (
                <section className="control-section knit-controls">
                  <h2>
                    <span>04</span> Knit program <i />
                  </h2>
                  <p className="hint">
                    Knit programs support plane, saddle and supplied rectangular OBJ charts, cubes
                    opened by a crease cut and spheres opened from pole to pole.
                  </p>
                </section>
              )}
            </>
          )}
        </div>
        <div className="generate-area">
          <button
            className="generate-button"
            onClick={generate}
            disabled={!!busy || inspectionOnly}
          >
            <span>
              {inspectionOnly
                ? 'Inspection only'
                : project.graph
                  ? 'Regenerate network'
                  : 'Generate network'}
            </span>
            <Icon name="arrow" size={18} />
          </button>
          <div className="generate-caption">
            <span>
              {inspectionOnly
                ? 'Surface mapping required to generate'
                : stale
                  ? 'Settings changed · regenerate'
                  : busy
                    ? 'Computation in worker'
                    : 'Deterministic / local computation'}
            </span>
            <kbd>G</kbd>
          </div>
        </div>
        <footer className="sidebar-footer">
          <span>
            KNITTING TOPOLOGY <b>v0.1</b>
          </span>
          <span>Geometry first. Evidence always.</span>
          <a href="https://github.com/nijatmahamaliyev" target="_blank" rel="noreferrer">
            ↗ Research & projects
          </a>
        </footer>
      </aside>

      <main className="stage" aria-label="Surface workspace">
        <header className="stage-header">
          <div className="project-name">
            <span className="prompt-mark">~/</span>
            <input
              aria-label="Project name"
              value={nameDraft}
              maxLength={100}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => {
                const name = nameDraft.trim() || 'Untitled surface';
                if (name !== projectRef.current.name) commit({ ...projectRef.current, name });
                else setNameDraft(name);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
            <span
              className={`save-dot ${autosave}`}
              title={
                autosave === 'saved'
                  ? 'Saved locally'
                  : autosave === 'saving'
                    ? 'Saving locally'
                    : autosave === 'inputs-only'
                      ? 'Only inputs cached; download JSON to retain the network'
                      : 'Local storage unavailable; download project JSON'
              }
            />
          </div>
          <div className="file-actions">
            <button onClick={() => loadInput.current?.click()} title="Open project JSON">
              <Icon name="load" />
              <span>Open</span>
            </button>
            <button
              onClick={() => {
                saveProject(projectRef.current);
                setStatus('Project JSON downloaded.');
              }}
              title="Save project JSON (⌘/Ctrl S)"
            >
              <Icon name="save" />
              <span>Save</span>
            </button>
            <button
              className="icon-button"
              aria-label="Keyboard shortcuts and help"
              onClick={() => setHelp(true)}
            >
              <Icon name="help" />
            </button>
          </div>
        </header>
        <div className="viewer-toolbar">
          <div className="mode-switch" role="group" aria-label="Interaction mode">
            {(['orbit', 'draw', 'select'] as InteractionMode[]).map((mode) => (
              <button
                key={mode}
                aria-label={`${mode[0].toUpperCase() + mode.slice(1)} mode`}
                disabled={inspectionOnly && mode === 'draw'}
                aria-pressed={view.mode === mode}
                className={view.mode === mode ? 'active' : ''}
                onClick={() => setView((v) => ({ ...v, mode }))}
              >
                <Icon name={mode} />
                <span>
                  {mode === 'draw' ? 'Draw guide' : mode[0].toUpperCase() + mode.slice(1)}
                </span>
              </button>
            ))}
          </div>
          <div className="history-tools">
            <button
              aria-label="Undo"
              title="Undo (⌘/Ctrl Z)"
              disabled={!history.past.length}
              onClick={undo}
            >
              <Icon name="undo" />
            </button>
            <button
              aria-label="Redo"
              title="Redo (⌘/Ctrl Shift Z)"
              disabled={!history.future.length}
              onClick={redo}
            >
              <Icon name="redo" />
            </button>
            <span className="toolbar-separator" />
            <button
              aria-label="Fit surface"
              title="Fit surface (F)"
              onClick={() => viewer.current?.fit()}
            >
              <Icon name="fit" />
            </button>
          </div>
        </div>
        <div
          className={`stage-split ${showProgram ? 'split' : ''}`}
          style={{ '--split': `${split * 100}%` } as React.CSSProperties}
        >
          <div className="canvas-wrap">
            <Suspense
              fallback={
                <div className="viewer-loading" role="status">
                  Preparing surface viewer…
                </div>
              }
            >
              <SurfaceViewer
                surface={project.surface}
                graph={project.graph}
                guides={project.guides}
                options={view}
                selection={knitHoverSelection ?? selection}
                marker={knitMarker}
                cutEdgeIds={cutEdgeIds}
                pickCutEdge={cutJob.closed && pickingCutEdge}
                onCutEdgePick={(id) => {
                  const current =
                    cutJob.matches && knitSettings.cut ? knitSettings.cut : cutJob.empty();
                  const ids = new Set(current.edgeIds);
                  if (ids.has(id)) ids.delete(id);
                  else ids.add(id);
                  changeCut({ ...current, preset: 'manual', edgeIds: [...ids].sort() });
                  setSelection({ kind: 'edge', id });
                }}
                startEdge={
                  knitSupported(project.surface) ? (knitSettings.startEdge ?? 'v0') : undefined
                }
                pickStartEdge={knitSupported(project.surface) && pickingKnitEdge}
                onStartEdge={(edge) => {
                  changeKnit({ ...knitSettings, startEdge: edge });
                  setPickingKnitEdge(false);
                }}
                shapeOverlay={knitShapeOverlay}
                onShapePick={(index) => {
                  setKnitHover(index);
                  setKnitMarks([index]);
                  setTab('knit');
                }}
                onStroke={addStroke}
                onSelect={setSelection}
                onHover={setHover}
                onReady={viewerReady}
                onError={viewerError}
              />
            </Suspense>
            <div className="canvas-heading">
              <span className="eyebrow">
                {imported
                  ? mapped
                    ? 'SUPPLIED OBJ UV CHART'
                    : 'IMPORTED TRIANGLE MESH'
                  : displayParameters.strategy === 'n-sided-patch'
                    ? `${displayParameters.patchSides}-SIDED PATCH`
                    : project.surface.kind.toUpperCase()}{' '}
                / {inspectionOnly ? 'INSPECT' : activeFamily.name.toUpperCase()}
              </span>
              <div>
                <span className={`state-indicator ${stale ? 'stale' : ''}`} />
                {inspectionOnly
                  ? 'Imported surface · inspection only'
                  : !project.graph
                    ? 'Surface ready'
                    : stale
                      ? 'Result needs regeneration'
                      : 'Connected geometric network'}
              </div>
            </div>
            <div className="view-presets" role="group" aria-label="Camera views">
              {(['perspective', 'top', 'front', 'right'] as const).map((p) => (
                <button key={p} title={`${p} view`} onClick={() => viewer.current?.view(p)}>
                  {p === 'perspective' ? '3D' : p}
                </button>
              ))}
            </div>
            <div className="canvas-scale">
              <span>↗ Z UP</span>
              <span>
                {imported
                  ? (project.surface.size * 1000).toLocaleString('en-US', {
                      maximumSignificantDigits: 5,
                    })
                  : Math.round(project.surface.size * 1000)}{' '}
                mm {project.surface.kind === 'sphere' ? 'diameter' : 'extent'}
              </span>
            </div>
            {view.mode === 'draw' && (
              <div className="mode-hint">
                Draw a direction guide on the surface
                <span>Release to finish · G to regenerate</span>
              </div>
            )}
            {view.mode === 'select' && (
              <div className="mode-hint">
                {inspectionOnly ? 'Select a source triangle' : 'Select a cell or vertex'}
                <span>Connectivity and coordinates appear in the inspector</span>
              </div>
            )}
            {busy && (
              <div className="progress-panel" role="status">
                <div>
                  <span>{busy.stage}</span>
                  <button onClick={() => cancel()} aria-label="Cancel generation">
                    Cancel <Icon name="close" size={12} />
                  </button>
                </div>
                <progress value={busy.fraction} max="1" />
                <small>
                  {Math.round(busy.fraction * 100)}% · previous accepted result retained
                </small>
              </div>
            )}
            {error && (
              <div className="error-panel" role="alert">
                <div>
                  <strong>Check your inputs</strong>
                  <button aria-label="Dismiss error" onClick={() => setError(null)}>
                    <Icon name="close" size={12} />
                  </button>
                </div>
                <p>{error}</p>
              </div>
            )}
            {cacheNotice && (
              <div className="storage-notice" role="status">
                <p>{cacheNotice}</p>
                <div>
                  {initialRestore.recoveryText && (
                    <button
                      onClick={() =>
                        download(
                          initialRestore.recoveryText!,
                          'knitting-topology-recovery.txt',
                          'text/plain'
                        )
                      }
                    >
                      Download recovery JSON
                    </button>
                  )}
                  <button onClick={() => setCacheNotice('')}>Dismiss</button>
                </div>
              </div>
            )}
          </div>
          {showProgram && (
            <>
              <div
                className="split-handle"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize the surface and program views"
                aria-valuemin={20}
                aria-valuemax={80}
                aria-valuenow={Math.round(split * 100)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') setSplit((v) => Math.max(0.2, v - 0.05));
                  if (e.key === 'ArrowRight') setSplit((v) => Math.min(0.8, v + 0.05));
                }}
                onPointerDown={(e) => {
                  const box = e.currentTarget.parentElement!.getBoundingClientRect();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const move = (ev: PointerEvent) =>
                    setSplit(Math.min(0.8, Math.max(0.2, (ev.clientX - box.left) / box.width)));
                  const target = e.currentTarget;
                  const up = () => {
                    target.removeEventListener('pointermove', move);
                    target.removeEventListener('pointerup', up);
                  };
                  target.addEventListener('pointermove', move);
                  target.addEventListener('pointerup', up);
                }}
              />
              <section className="knit-pane" aria-label="Knit program">
                <KnitBitmap
                  program={knitProgram}
                  reason={knitBuild.ok ? '' : knitBuild.reason}
                  marks={knitMarkCells}
                  hover={knitHover}
                  onHover={setKnitHover}
                  onPick={(i) => {
                    if (!knitProgram) return;
                    if (knitProgram.shape && knitSettings.mode === 'shape') {
                      setKnitMarks([i]);
                      setTab('knit');
                      return;
                    }
                    if (!project.graph) return;
                    setKnitMarks(null);
                    setSelection(loopSelection(knitProgram, project.graph, i));
                    setTab('knit');
                  }}
                />
              </section>
            </>
          )}
        </div>
        <div className="canvas-footer">
          <span>
            {hover ||
              (view.mode === 'orbit'
                ? 'Drag to orbit · right-drag to pan · scroll to zoom'
                : 'Surface attachments are stored with geometry revision')}
          </span>
          <button
            aria-label="Download viewport PNG"
            title="Download viewport PNG"
            onClick={() => {
              const data = viewer.current?.screenshot();
              if (data) {
                const a = document.createElement('a');
                a.href = data;
                a.download = `${projectFilename(project.name)}.png`;
                a.click();
                setStatus('Viewport image downloaded.');
              }
            }}
          >
            <Icon name="camera" />
          </button>
        </div>
        <footer className="status-bar">
          <span className="status-message" role="status">
            {status}
          </span>
          <div>
            {stats && (
              <>
                <span>
                  {stats.vertices.toLocaleString()} <small>V</small>
                </span>
                <span>
                  {stats.edges.toLocaleString()} <small>E</small>
                </span>
                <span>
                  {stats.cells.toLocaleString()} <small>F</small>
                </span>
              </>
            )}
            <span className="local-tag">LOCAL</span>
          </div>
        </footer>
      </main>

      <aside className="inspector" aria-label="Network inspector">
        <div className="inspector-top">
          <span className="eyebrow">{imported ? 'SURFACE INSPECTOR' : 'NETWORK INSPECTOR'}</span>
          <span
            className={`quality-badge ${errors.length ? 'bad' : warnings.length || stale ? 'warn' : ''}`}
          >
            {inspectionOnly
              ? 'IMPORTED'
              : !project.graph
                ? 'NO RESULT'
                : stale
                  ? 'STALE'
                  : errors.length
                    ? `${errors.length} ERRORS`
                    : warnings.length
                      ? `${warnings.length} NOTES`
                      : 'CHECKED'}
          </span>
        </div>
        {!inspectionOnly && (
          <div className="inspector-tabs" role="tablist" aria-label="Inspector sections">
            {(mapped
              ? (['measures', 'topology', 'compare', 'methods', 'surface', 'knit'] as const)
              : (['measures', 'topology', 'compare', 'methods', 'knit'] as const)
            ).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={tab === t ? 'active' : ''}
              >
                {t === 'methods'
                  ? 'Learn'
                  : t === 'surface'
                    ? 'Source'
                    : t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        )}
        <div
          className="inspector-content"
          role={inspectionOnly ? undefined : 'tabpanel'}
          aria-label={inspectionOnly ? 'Imported surface inspection' : tab}
        >
          {(inspectionOnly ||
            (mapped && (tab === 'surface' || (!project.graph && tab === 'measures')))) && (
            <>
              <div className="display-toggles">
                <Check
                  label="Surface"
                  value={view.showSurface}
                  onChange={() => toggle('showSurface')}
                />
                <Check
                  label="Triangle edges"
                  value={view.wireframe}
                  onChange={() => toggle('wireframe')}
                />
                <Check
                  label="Boundary edges"
                  value={view.showSeams}
                  onChange={() => toggle('showSeams')}
                />
              </div>
              {meshInspection.report ? (
                <MeshInspector
                  surface={project.surface}
                  report={meshInspection.report}
                  selection={selection}
                />
              ) : (
                <p role="status">{meshInspection.error || 'Analyzing imported surface…'}</p>
              )}
              <div className="inline-actions">
                <button onClick={() => saveProject(project)}>Save imported project JSON</button>
              </div>
            </>
          )}
          {!inspectionOnly && (!mapped || !!project.graph) && tab === 'measures' && (
            <>
              <div className="inspector-title">
                <span className="eyebrow">{activeFamily.caption}</span>
                <h2>{activeFamily.name} network</h2>
                <p>Explicit connectivity on an embedded surface.</p>
              </div>
              {stats ? (
                <>
                  <div className="big-metrics">
                    <div>
                      <strong>{stats.cells.toLocaleString()}</strong>
                      <span>CELLS</span>
                    </div>
                    <div>
                      <strong>
                        {(stats.quadFraction * 100).toFixed(0)}
                        <small>%</small>
                      </strong>
                      <span>QUADRILATERALS</span>
                    </div>
                  </div>
                  <h3 className="subheading">
                    Geometry <i />
                  </h3>
                  <Metric
                    label="Mean edge length"
                    value={formatLength(stats.meanEdgeLength)}
                    unit="mm"
                  />
                  <Metric
                    label="Minimum edge"
                    value={formatLength(stats.minEdgeLength)}
                    unit="mm"
                  />
                  <Metric
                    label="Maximum edge"
                    value={formatLength(stats.maxEdgeLength)}
                    unit="mm"
                  />
                  <Metric
                    label="Spacing RMS error"
                    value={(stats.spacingRmsRelative * 100).toFixed(1)}
                    unit="%"
                  />
                  <Metric
                    label="Total edge length"
                    value={stats.totalEdgeLength.toFixed(3)}
                    unit="m"
                  />
                  <Metric
                    label="Support surface area"
                    value={(stats.surfaceArea * 1e6).toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}
                    unit="mm²"
                  />
                  <p className="hint">
                    Spacing is a target. Integer subdivision, surface curvature, and pattern
                    transformations affect the achieved lengths.
                  </p>
                </>
              ) : (
                <div className="empty-card">
                  Choose a surface and generate its first network.
                  <span>Nodes, edges, cells, and measured quality will appear here.</span>
                </div>
              )}
              <h3 className="subheading">
                Display <i />
              </h3>
              <label className="select-label">
                Overlay
                <select
                  aria-label="Diagnostic overlay"
                  value={view.overlay}
                  onChange={(e) => setOverlay(e.target.value as OverlayMode)}
                >
                  <option value="plain">Monochrome</option>
                  <option value="valence">Vertex degree</option>
                  <option value="spacing">Edge spacing deviation</option>
                  <option value="patches">Surface patches</option>
                </select>
              </label>
              {view.overlay !== 'plain' && (
                <p className="overlay-legend">
                  <span />{' '}
                  {view.overlay === 'valence'
                    ? 'Amber = degree differs from 4 (raw graph degree).'
                    : view.overlay === 'spacing'
                      ? 'White → amber = larger target spacing deviation.'
                      : 'Neutral shading identifies analytic surface patches.'}
                </p>
              )}
              <div className="display-checks">
                <Check
                  label="Surface"
                  value={view.showSurface}
                  onChange={() => toggle('showSurface')}
                />
                <Check
                  label="Network"
                  value={view.showGraph}
                  onChange={() => toggle('showGraph')}
                />
                <Check
                  label="Guides"
                  value={view.showGuides}
                  onChange={() => toggle('showGuides')}
                />
                <Check
                  label="Seams / features"
                  value={view.showSeams}
                  onChange={() => toggle('showSeams')}
                />
                <Check
                  label="Vertices"
                  value={view.showNodes}
                  onChange={() => toggle('showNodes')}
                />
                <Check
                  label="Coarse layout"
                  value={view.showCoarse}
                  onChange={() => toggle('showCoarse')}
                />
                <Check
                  label="Surface mesh"
                  value={view.wireframe}
                  onChange={() => toggle('wireframe')}
                />
              </div>
              <h3 className="subheading">
                Direction guides <span>{project.guides.length}</span>
                <i />
              </h3>
              {project.guides.length ? (
                <>
                  <div className="guide-list">
                    {project.guides.map((guide, i) => (
                      <div key={guide.id}>
                        <span>
                          <b>{String(i + 1).padStart(2, '0')}</b>Guide · {guide.samples.length}{' '}
                          samples
                        </span>
                        <button
                          aria-label={`Remove guide ${i + 1}`}
                          onClick={() =>
                            commit({
                              ...projectRef.current,
                              guides: projectRef.current.guides.filter((g) => g.id !== guide.id),
                            })
                          }
                        >
                          <Icon name="close" size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    className="text-button"
                    onClick={() => commit({ ...projectRef.current, guides: [] })}
                  >
                    Clear all guides
                  </button>
                </>
              ) : (
                <p className="hint">
                  Use Draw guide to steer the network. Guides are soft direction preferences, with
                  deviations measured after generation.
                </p>
              )}
              <h3 className="subheading">
                Export <i />
              </h3>
              <div className="export-grid">
                <button onClick={() => saveProject(project)}>Project JSON</button>
                <button
                  disabled={!project.graph}
                  onClick={() =>
                    project.graph &&
                    download(
                      graphToOBJ(project.graph, stale),
                      `${projectFilename(project.name)}.obj`,
                      'text/plain'
                    )
                  }
                >
                  Mesh OBJ
                </button>
                <button
                  disabled={!project.graph}
                  onClick={() =>
                    project.graph &&
                    download(
                      graphToSVG(project.graph, stale),
                      `${projectFilename(project.name)}-xy.svg`,
                      'image/svg+xml'
                    )
                  }
                >
                  XY projection SVG
                </button>
                <button
                  disabled={!project.graph}
                  onClick={() =>
                    download(
                      diagnosticsToCSV(project),
                      `${projectFilename(project.name)}-diagnostics.csv`,
                      'text/csv'
                    )
                  }
                >
                  Diagnostics CSV
                </button>
                <button
                  disabled={!project.graph}
                  onClick={() =>
                    download(
                      referencesBibtex(relevantReferenceIds(displayParameters, project.surface)),
                      `${projectFilename(project.name)}-references.bib`,
                      'text/plain'
                    )
                  }
                >
                  References BibTeX
                </button>
                <button
                  disabled={!project.graph}
                  onClick={() =>
                    download(
                      JSON.stringify(createCitationRecord(project, stale), null, 2),
                      `${projectFilename(project.name)}-method.json`,
                      'application/json'
                    )
                  }
                >
                  Method record JSON
                </button>
              </div>
              <p className="hint">
                Exports describe the displayed accepted graph
                {stale ? ', which is stale relative to the current controls' : ''}. OBJ uses meters.
                SVG is an XY projection, not surface flattening. JSON retains topology and
                provenance.
              </p>
            </>
          )}
          {!inspectionOnly && tab === 'topology' && (
            <>
              <div className="inspector-title">
                <span className="eyebrow">CONNECTIONS / FEATURES</span>
                <h2>Graph structure</h2>
                <p>A rendered crossing does not imply adjacency.</p>
              </div>
              {stats && (
                <>
                  <Metric label="Connected components" value={stats.components} />
                  <Metric label="Boundary edges" value={stats.boundaryEdges} />
                  <Metric label="Euler characteristic" value={stats.euler} />
                  <Metric label="Extraordinary vertices" value={stats.extraordinaryVertices} />
                  <Metric label="Vertices" value={stats.vertices.toLocaleString()} />
                  <Metric label="Edges" value={stats.edges.toLocaleString()} />
                  <Metric label="Cells" value={stats.cells.toLocaleString()} />
                </>
              )}
              <h3 className="subheading">
                Selection <i />
              </h3>
              {selectedNode ? (
                <div className="selection-card">
                  <span className="eyebrow">VERTEX</span>
                  <code>{selectedNode.id}</code>
                  <Metric label="Patch" value={selectedNode.attachment.patch} />
                  <Metric label="Feature" value={selectedNode.feature ?? 'interior'} />
                  {selectedNode.position.map((n, i) => (
                    <Metric
                      key={i}
                      label={['X', 'Y', 'Z'][i]}
                      value={(n * 1000).toFixed(3)}
                      unit="mm"
                    />
                  ))}
                </div>
              ) : selectedCell ? (
                <div className="selection-card">
                  <span className="eyebrow">CELL</span>
                  <code>{selectedCell.id}</code>
                  <Metric label="Boundary vertices" value={selectedCell.nodes.length} />
                  <Metric label="Surface patch" value={selectedCell.patch} />
                  <div className="id-list">
                    {selectedCell.nodes.map((id) => (
                      <code key={id}>{id}</code>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="empty-card compact">
                  Select a vertex or cell in the viewport.
                  <span>Use Select mode, then click the network.</span>
                </div>
              )}
              {project.graph?.coarseTopology?.strips.length ? (
                <>
                  <h3 className="subheading">
                    Quad strips <i />
                  </h3>
                  <p className="hint">
                    Opposite-edge equivalence groups in the coarse quad topology. Shared edges use
                    compatible integer counts.
                  </p>
                  <div className="strip-list">
                    {project.graph.coarseTopology.strips.slice(0, 24).map((strip, i) => (
                      <label key={strip.id}>
                        <span>
                          Strip {String(i + 1).padStart(2, '0')}
                          <small>
                            {strip.closed ? 'loop' : 'boundary-to-boundary'} ·{' '}
                            {strip.edgeIds.length} edges
                          </small>
                        </span>
                        <input
                          type="number"
                          aria-label={`Strip ${i + 1} subdivisions`}
                          min="1"
                          max="64"
                          value={
                            project.parameters.stripOverrides?.[strip.id] ?? strip.subdivisions
                          }
                          onChange={(e) =>
                            changeParameter({
                              stripOverrides: {
                                ...project.parameters.stripOverrides,
                                [strip.id]: Math.max(
                                  1,
                                  Math.min(64, Math.round(Number(e.target.value) || 1))
                                ),
                              },
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  {Object.keys(project.parameters.stripOverrides ?? {}).length > 0 && (
                    <button
                      className="text-button"
                      onClick={() => changeParameter({ stripOverrides: undefined })}
                    >
                      Reset strip overrides
                    </button>
                  )}
                </>
              ) : null}
              <h3 className="subheading">
                Diagnostics <i />
              </h3>
              <div className="diagnostics-list">
                {graphDiagnosticList.length ? (
                  graphDiagnosticList.map((d) => <DiagnosticCard key={d.id} diagnostic={d} />)
                ) : (
                  <p className="hint">
                    Generate a network to run the geometric and topology checks.
                  </p>
                )}
              </div>
            </>
          )}
          {!inspectionOnly && tab === 'compare' && (
            <>
              <div className="inspector-title">
                <span className="eyebrow">CONTROLLED EXPLORATION</span>
                <h2>Compare variants</h2>
                <p>
                  Capture accepted results, inspect their measured differences, and return to any
                  captured design.
                </p>
              </div>
              <button
                className="generate-button"
                disabled={(!(project.graph && !stale) && !knitCurrent) || !!busy}
                onClick={() => {
                  const networkCurrent = !!project.graph && !stale;
                  const knit: KnitSnapshot | string | null = knitCurrent
                    ? knitSnapshot(knitProgram!, project)
                    : !project.knit
                      ? null
                      : knitProgram
                        ? 'Knit program not captured: generate it first.'
                        : `Knit program not captured: ${knitBuild.ok ? '' : knitBuild.reason}`;
                  setVariants((current) =>
                    [
                      ...current,
                      {
                        id: Date.now(),
                        name: networkCurrent
                          ? `${activeFamily.name} / ${PRESETS.find((p) => p.key === project.parameters.preset)?.name}`
                          : `${project.surface.kind} / knit ${project.knit?.mode ?? ''}`,
                        project,
                        networkCurrent,
                        knit,
                      },
                    ].slice(-4)
                  );
                  setStatus('Variant captured in this session. Download its JSON to keep it.');
                }}
              >
                Capture current variant <span>+</span>
              </button>
              <p className="hint">
                Up to four variants are kept in this session. Save each project JSON for a
                persistent record.
              </p>
              {!variants.length && (
                <div className="empty-card compact">
                  Start with a baseline.
                  <span>Generate, capture, change one setting, and generate again.</span>
                </div>
              )}
              <div className="variant-list">
                {variants.map((variant, index) => (
                  <article key={variant.id} className="variant-card">
                    <div className="variant-head">
                      <span className="eyebrow">VARIANT {String(index + 1).padStart(2, '0')}</span>
                      <button
                        aria-label={`Remove variant ${index + 1}`}
                        onClick={() =>
                          setVariants((items) => items.filter((v) => v.id !== variant.id))
                        }
                      >
                        <Icon name="close" size={11} />
                      </button>
                    </div>
                    <h3>{variant.name}</h3>
                    <p>
                      {variant.project.surface.kind} ·{' '}
                      {Math.round(variant.project.surface.size * 1000)} mm · target{' '}
                      {formatLength(variant.project.parameters.spacing)} mm
                    </p>
                    {!variant.networkCurrent && <p>No network</p>}
                    {variant.networkCurrent && variant.project.statistics && (
                      <>
                        <Metric
                          label="Cells"
                          value={variant.project.statistics.cells.toLocaleString()}
                        />
                        <Metric
                          label="Mean edge"
                          value={formatLength(variant.project.statistics.meanEdgeLength)}
                          unit="mm"
                        />
                        <Metric
                          label="Spacing RMS"
                          value={(variant.project.statistics.spacingRmsRelative * 100).toFixed(1)}
                          unit="%"
                        />
                        <Metric
                          label="Total edge length"
                          value={variant.project.statistics.totalEdgeLength.toFixed(3)}
                          unit="m"
                        />
                      </>
                    )}
                    {variant.knit && (
                      <KnitVariant knit={variant.knit} index={index} base={variants[0]?.knit} />
                    )}
                    <div className="inline-actions">
                      <button
                        onClick={() => {
                          cancel(false);
                          commit(variant.project);
                          setSelection(null);
                          setElapsed(null);
                          setStatus(`Restored variant ${index + 1}.`);
                        }}
                      >
                        Restore
                      </button>
                      <button onClick={() => saveProject(variant.project)}>Save JSON</button>
                    </div>
                  </article>
                ))}
              </div>
              {variants.length > 1 && (
                <div className="method-boundary">
                  {variants.some(
                    (v) =>
                      v.project.surface.kind !== variants[0].project.surface.kind ||
                      v.project.surface.size !== variants[0].project.surface.size ||
                      v.project.surface.curvature !== variants[0].project.surface.curvature ||
                      (v.project.surface.kind === 'mesh' &&
                        scientificSignature({
                          surface: v.project.surface,
                          parameters: project.parameters,
                          guides: [],
                        }) !==
                          scientificSignature({
                            surface: variants[0].project.surface,
                            parameters: project.parameters,
                            guides: [],
                          }))
                  )
                    ? 'These variants use different support geometry or mapping records. Their metrics do not isolate the effect of topology.'
                    : 'These variants share support geometry. Check total edge length and cell counts: equal target spacing does not imply equal material or feature budgets.'}
                </div>
              )}
              {knitCompareNote(variants.map((v) => v.knit)) && (
                <div className="method-boundary">
                  {knitCompareNote(variants.map((v) => v.knit))}
                </div>
              )}
            </>
          )}
          {!inspectionOnly &&
            tab === 'knit' &&
            (cutJob.closed && !knitAvailable(project.surface) ? (
              <CutPanel
                job={cutJob}
                cut={knitSettings.cut}
                name={project.name}
                selection={selection}
                onSelect={setSelection}
              />
            ) : (
              <>
                {cutJob.closed && (
                  <CutPanel
                    job={cutJob}
                    cut={knitSettings.cut}
                    name={project.name}
                    selection={selection}
                    onSelect={setSelection}
                  />
                )}
                <KnitPanel
                  build={knitBuild}
                  settings={knitSettings}
                  swatches={swatches}
                  graph={project.graph}
                  projectName={project.name}
                  surfaceSize={project.surface.size}
                  hover={knitHover}
                  selection={selection}
                  onSettings={changeKnit}
                  onSwatches={(next) => {
                    setKnitMarks(null);
                    commit({ ...projectRef.current, swatches: next });
                  }}
                  onMark={(cells) => {
                    setKnitMarks(cells);
                    if (cells) setKnitOpen(true);
                  }}
                />
              </>
            ))}
          {!inspectionOnly && tab === 'methods' && (
            <>
              {mapped && (
                <MappedChartLesson surface={project.surface} parameters={displayParameters} />
              )}
              <LearningPanel
                parameters={displayParameters}
                surface={project.surface}
                stale={stale}
                hasGraph={!!project.graph}
                onLoadExample={loadLearningExample}
              />
              <h3 className="subheading">
                Current method <i />
              </h3>
              {project.graph ? (
                <>
                  <code className="algorithm-label">
                    {project.graph.provenance.algorithm}
                    <br />v{project.graph.provenance.version}
                  </code>
                  <p className="method-scope">{project.graph.provenance.scope}</p>
                  <div className="method-notes">
                    {project.graph.provenance.notes.map((note, i) => (
                      <p key={i}>{note}</p>
                    ))}
                  </div>
                </>
              ) : (
                <p className="hint">Generate a network to inspect its complete algorithm record.</p>
              )}
              <h3 className="subheading">
                Reproducibility <i />
              </h3>
              <Metric label="Core units" value="meters" />
              <Metric label="UI units" value="millimeters" />
              <Metric
                label="Seed"
                value={project.graph?.provenance.seed ?? project.parameters.seed}
              />
              <Metric
                label="Generation time"
                value={elapsed !== null ? (elapsed / 1000).toFixed(3) : '—'}
                unit={elapsed !== null ? 's' : undefined}
              />
              <p className="hint">
                Templates are deterministic. Recorded seed reserves reproducible variation; it does
                not imply random behavior in every strategy.
              </p>
              <p className="hint">
                Cube/sphere atlases, closed-surface assembly, soft guides, and open-boundary pattern
                rules are project extensions. Geometric checks do not establish physical
                performance.
              </p>
            </>
          )}
        </div>
        <div className="inspector-footer">
          <span>COMPUTED GEOMETRY</span>
          <span>≠ physical validation</span>
        </div>
      </aside>
      <input
        ref={loadInput}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Load project file"
        onChange={(e) => void loadFile(e.target.files?.[0])}
      />
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Workspace guide"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" aria-label="Close help" onClick={() => setHelp(false)}>
              <Icon name="close" />
            </button>
            <span className="eyebrow">WORKSPACE GUIDE</span>
            <h2>From surface to network.</h2>
            <p>
              Choose a surface and topology preset. Draw soft direction guides, set a target
              spacing, then generate. Inspect the measured result and save the complete project.
            </p>
            <dl>
              {[
                ['G', 'Generate / regenerate'],
                ['V', 'Orbit mode'],
                ['D', 'Draw direction guide'],
                ['F', 'Fit surface'],
                ['Esc', 'Cancel generation / leave drawing'],
                ['⌘ / Ctrl Z', 'Undo'],
                ['⌘ / Ctrl Shift Z', 'Redo'],
                ['⌘ / Ctrl S', 'Save project JSON'],
              ].map(([key, value]) => (
                <div key={key}>
                  <dt>
                    <kbd>{key}</kbd>
                  </dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p className="hint">
              On a cube, sharp edges are protected and shared. On a sphere, automatic patch seams
              and extraordinary vertices are explicit. Guide alignment and spacing are measured
              preferences, not guarantees.
            </p>
            <button className="generate-button" onClick={() => setHelp(false)}>
              Back to the surface <Icon name="arrow" />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

function DiagnosticCard({ diagnostic: d }: { diagnostic: Diagnostic }) {
  return (
    <details className={`diagnostic ${d.severity}`}>
      <summary>
        <span className="diagnostic-mark">
          {d.severity === 'error' ? '×' : d.severity === 'warning' ? '!' : '·'}
        </span>
        {d.label}
      </summary>
      <p>{d.message}</p>
      <small>{d.method}</small>
      {d.value !== undefined && (
        <code>
          {Number.isFinite(d.value) ? Number(d.value.toPrecision(6)) : String(d.value)} {d.units}
        </code>
      )}
    </details>
  );
}

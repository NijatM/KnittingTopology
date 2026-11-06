import { useEffect, useId, useRef, useState } from 'react';
import { MAX_IMPORT_BYTES } from './mesh';
import type { ImportedMeshReport, MeshUnit, SurfaceSpec } from '../core/types';
import { acceptsImportResult } from '../workers/import-protocol';
import type { ImportRequest, ImportResponse } from '../workers/import-protocol';
import './import.css';

interface ImportControlsProps {
  revision: number;
  onImported: (surface: SurfaceSpec, report: ImportedMeshReport, inputRevision: number) => boolean;
}
interface ActiveImport {
  id: number;
  revision: number;
  worker: Worker | null;
}

export default function ImportControls({ revision, onImported }: ImportControlsProps) {
  const [file, setFile] = useState<File | null>(null);
  const [unit, setUnit] = useState<MeshUnit>('mm');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [fraction, setFraction] = useState(0);
  const active = useRef<ActiveImport | null>(null);
  const nextId = useRef(0);
  const revisionRef = useRef(revision);
  revisionRef.current = revision;
  const importedCallback = useRef(onImported);
  importedCallback.current = onImported;
  const descriptionId = useId();

  useEffect(() => {
    setBusy(false);
    setStatus((previous) =>
      previous.startsWith('Importing') ? 'Import cancelled: project changed.' : previous
    );
    return () => {
      active.current?.worker?.terminate();
      active.current = null;
    };
  }, [revision]);

  const cancel = () => {
    active.current?.worker?.terminate();
    active.current = null;
    setBusy(false);
    setStatus('Surface import cancelled. The current surface is unchanged.');
  };
  const start = async () => {
    if (!file || busy) return;
    setError('');
    if (!file.name.trim() || file.name.length > 255 || /[\u0000-\u001f\u007f]/.test(file.name)) {
      setError(
        'File names must contain 1–255 printable characters. Rename the file before importing.'
      );
      return;
    }
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'obj' && extension !== 'stl') {
      setError('Choose an OBJ or STL file.');
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setError(`The file exceeds the ${MAX_IMPORT_BYTES / 1024 / 1024} MiB import limit.`);
      return;
    }
    const job: ActiveImport = { id: ++nextId.current, revision, worker: null };
    active.current = job;
    setBusy(true);
    setFraction(0);
    setStatus('Importing: reading local file');
    try {
      const buffer = await file.arrayBuffer();
      if (active.current !== job || revisionRef.current !== job.revision) return;
      const worker = new Worker(new URL('../workers/import.worker.ts', import.meta.url), {
        type: 'module',
      });
      job.worker = worker;
      const finishError = (message: string) => {
        if (active.current !== job || revisionRef.current !== job.revision) return;
        worker.terminate();
        active.current = null;
        setBusy(false);
        setStatus('');
        setError(message);
      };
      worker.onerror = () =>
        finishError('Surface import failed in the worker. Try a smaller or simpler file.');
      worker.onmessageerror = () =>
        finishError('The imported surface could not be read from the worker.');
      worker.onmessage = ({ data }: MessageEvent<ImportResponse>) => {
        if (
          active.current !== job ||
          !acceptsImportResult(active.current.id, revisionRef.current, data)
        )
          return;
        if (data.type === 'progress') {
          setFraction(Math.min(1, Math.max(0, Number.isFinite(data.fraction) ? data.fraction : 0)));
          setStatus(`Importing: ${data.stage}`);
        } else if (data.type === 'error') {
          finishError(data.message);
        } else if (data.type === 'result') {
          worker.terminate();
          active.current = null;
          setBusy(false);
          const accepted = importedCallback.current(data.surface, data.report, data.inputRevision);
          setStatus(
            accepted
              ? data.surface.mapping
                ? 'Supplied UV chart imported. Generate to create a network.'
                : 'Surface imported for inspection.'
              : 'Import discarded: project changed. The current surface is unchanged.'
          );
        }
      };
      const request: ImportRequest = {
        type: 'import',
        jobId: job.id,
        inputRevision: job.revision,
        data: buffer,
        name: file.name,
        format: extension,
        unit,
      };
      worker.postMessage(request, [buffer]);
    } catch (failure) {
      if (active.current !== job || revisionRef.current !== job.revision) return;
      job.worker?.terminate();
      active.current = null;
      setBusy(false);
      setStatus('');
      setError(failure instanceof Error ? failure.message : 'The local file could not be read.');
    }
  };

  return (
    <div className="import-controls" data-testid="import-controls">
      <div className="import-heading">
        Import surface <span>OBJ / STL</span>
      </div>
      <p>
        <a href={`${import.meta.env.BASE_URL}examples/bent-rectangle-uv.obj`} download>
          Download a bent rectangular UV example (mm)
        </a>
      </p>
      <label className="import-file-label">
        Local surface file
        <input
          type="file"
          accept=".obj,.stl"
          aria-label="Import surface file"
          data-testid="import-file"
          aria-describedby={descriptionId}
          disabled={busy}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError('');
            setStatus('');
          }}
        />
      </label>
      {file && (
        <p className="import-filename" title={file.name}>
          {file.name}{' '}
          <span>
            ({(file.size / 1024).toLocaleString('en-US', { maximumFractionDigits: 1 })} KiB)
          </span>
        </p>
      )}
      <label className="import-unit-label">
        Source units
        <select
          aria-label="Source units"
          value={unit}
          disabled={busy}
          onChange={(event) => setUnit(event.target.value as MeshUnit)}
        >
          <option value="mm">Millimeters (mm)</option>
          <option value="cm">Centimeters (cm)</option>
          <option value="m">Meters (m)</option>
          <option value="in">Inches (in)</option>
        </select>
      </label>
      <p id={descriptionId}>
        Default: mm. Choose the file’s intended units explicitly. Coordinates are converted to
        meters and centered at the bounding-box midpoint; the original offset is stored. No scale
        normalization.
      </p>
      <p>
        Files stay in this browser. Up to {MAX_IMPORT_BYTES / 1024 / 1024} MiB; 200,000 vertices and
        200,000 triangles. Suitable OBJ rectangle charts also support mapped generation; other
        imports remain inspection-only.
      </p>
      <div className="import-actions">
        <button type="button" disabled={!file || busy} onClick={() => void start()}>
          Import as {unit}
        </button>
        {busy && (
          <button type="button" aria-label="Cancel surface import" onClick={cancel}>
            Cancel
          </button>
        )}
      </div>
      {busy && <progress max={1} value={fraction} aria-label="Surface import progress" />}
      <p className="import-status" role="status" aria-live="polite">
        {status}
      </p>
      {error && (
        <p className="import-error" role="alert">
          {error} The current surface is unchanged.
        </p>
      )}
    </div>
  );
}

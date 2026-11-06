import type { ProjectState } from '../core/types';
import { analyzeGraph } from '../core/diagnostics';
import { createProject, parseProject, serializeProject } from './project';

export const STORAGE_KEY = 'knitting-topology.project.v1';
interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface RestoreResult {
  project: ProjectState;
  notice: string;
  recoveryText: string | null;
  allowAutosave: boolean;
}
export function restoreFromStorage(storage: StorageLike): RestoreResult {
  const fresh = (): RestoreResult => ({
    project: createProject(),
    notice: '',
    recoveryText: null,
    allowAutosave: true,
  });
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return {
      ...fresh(),
      notice: 'Local storage is unavailable. Download project JSON to keep your work.',
      allowAutosave: false,
    };
  }
  if (!raw) return fresh();
  const preserve = (): boolean => {
    try {
      const base = `${STORAGE_KEY}.recovery`;
      const old = storage.getItem(base);
      storage.setItem(!old || old === raw ? base : `${base}.${Date.now()}`, raw!);
      return true;
    } catch {
      return false;
    }
  };
  try {
    const project = parseProject(raw);
    if (project.graph) {
      const checked = analyzeGraph(
        project.graph,
        project.surface,
        project.graph.provenance.parameters.spacing
      );
      if (checked.diagnostics.some((d) => d.severity === 'error')) {
        const backedUp = preserve();
        return {
          project: { ...project, graph: null, diagnostics: [], statistics: null },
          notice:
            'Saved inputs were recovered, but the old graph failed validation. Its original JSON is available for recovery; generate a new network.',
          recoveryText: raw,
          allowAutosave: backedUp,
        };
      }
      Object.assign(project, checked);
    }
    const metadata = JSON.parse(raw);
    const inputsOnly = metadata.cacheKind === 'inputs-only';
    const stamp = new Date(metadata.savedAt);
    const savedAt = Number.isFinite(stamp.getTime())
      ? ` saved ${stamp.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
      : '';
    return {
      project,
      notice: inputsOnly
        ? 'Restored the latest inputs. The network exceeded local cache capacity and will be regenerated.'
        : `Restored the local project${savedAt}.`,
      recoveryText: null,
      allowAutosave: true,
    };
  } catch {
    const backedUp = preserve();
    try {
      const inputFile = JSON.parse(raw);
      inputFile.project.graph = null;
      inputFile.project.statistics = null;
      inputFile.project.diagnostics = [];
      const inputs = parseProject(JSON.stringify(inputFile));
      return {
        project: inputs,
        notice:
          'Saved inputs were recovered, but the graph record was invalid. Download its original recovery JSON if needed; regenerate the network.',
        recoveryText: raw,
        allowAutosave: backedUp,
      };
    } catch {
      /* A malformed schema/input record cannot be safely migrated. */
    }
    return {
      ...fresh(),
      notice: backedUp
        ? 'The local cache could not be restored. Its original contents were preserved as recovery JSON.'
        : 'The local cache could not be restored. Autosave is disabled to preserve it; download the recovery JSON.',
      recoveryText: raw,
      allowAutosave: backedUp,
    };
  }
}
export function writeAutosave(
  storage: StorageLike,
  project: ProjectState
): 'full' | 'inputs-only' | 'unavailable' {
  try {
    storage.setItem(STORAGE_KEY, serializeProject(project));
    return 'full';
  } catch {
    try {
      const file = JSON.parse(
        serializeProject({ ...project, graph: null, diagnostics: [], statistics: null })
      );
      // Rebuild citation metadata from the preserved inputs after reload. It is
      // deliberately omitted from this minimal quota-recovery cache, not exports.
      delete file.methodRecord;
      file.cacheKind = 'inputs-only';
      storage.setItem(STORAGE_KEY, JSON.stringify(file));
      return 'inputs-only';
    } catch {
      // Preserve the previous cache if no write is possible. The visible notice
      // directs a download, and restoration reports the actual saved timestamp.
      return 'unavailable';
    }
  }
}

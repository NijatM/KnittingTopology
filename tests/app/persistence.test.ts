import { describe, expect, it } from 'vitest';
import { restoreFromStorage, STORAGE_KEY, writeAutosave } from '../../src/app/persistence';
import {
  createProject,
  historyReducer,
  parseProject,
  scientificSignature,
  serializeProject,
} from '../../src/app/project';
import { generatePattern } from '../../src/core/generate';
import type { HistoryState } from '../../src/app/project';

class MemoryStorage {
  values = new Map<string, string>();
  limit = Infinity;
  blockWrites = false;
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.blockWrites || value.length > this.limit) throw new Error('quota');
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}
function saved() {
  const state = createProject();
  state.surface.kind = 'plane';
  state.surface.size = 0.08;
  state.parameters.spacing = 0.02;
  return { ...state, ...generatePattern(state) };
}
describe('autosave safety', () => {
  it('restores accepted spacing statistics independently of pending spacing controls', () => {
    const storage = new MemoryStorage();
    const state = saved();
    const expected = state.statistics.spacingRmsRelative;
    state.parameters = { ...state.parameters, spacing: 0.01 };
    storage.setItem(STORAGE_KEY, serializeProject(state));
    const restored = restoreFromStorage(storage).project;
    expect(restored.parameters.spacing).toBe(0.01);
    expect(restored.graph?.provenance.parameters.spacing).toBe(0.02);
    expect(restored.statistics?.spacingRmsRelative).toBeCloseTo(expected, 12);
  });
  it('preserves corrupt cache as recovery before allowing a fresh autosave', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, '{corrupt original');
    const restored = restoreFromStorage(storage);
    expect(restored.recoveryText).toBe('{corrupt original');
    expect(storage.getItem(`${STORAGE_KEY}.recovery`)).toBe('{corrupt original');
    expect(restored.allowAutosave).toBe(true);
  });
  it('never overwrites an unreadable cache if recovery backup cannot be written', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, '{original');
    storage.blockWrites = true;
    const restored = restoreFromStorage(storage);
    expect(restored.allowAutosave).toBe(false);
    expect(storage.getItem(STORAGE_KEY)).toBe('{original');
  });
  it('recovers valid inputs when only saved graph identities are malformed', () => {
    const storage = new MemoryStorage();
    const state = saved();
    const record = JSON.parse(serializeProject(state));
    record.project.graph.nodes[1].id = record.project.graph.nodes[0].id;
    storage.setItem(STORAGE_KEY, JSON.stringify(record));
    const restored = restoreFromStorage(storage);
    expect(restored.project.surface).toEqual(state.surface);
    expect(restored.project.parameters).toEqual(state.parameters);
    expect(restored.project.graph).toBeNull();
    expect(restored.recoveryText).toContain('nodes');
  });
  it('quota fallback stores latest inputs instead of silently restoring an older graph', () => {
    const storage = new MemoryStorage();
    const old = saved();
    storage.setItem(STORAGE_KEY, serializeProject(old));
    const current = {
      ...old,
      name: 'Latest inputs',
      parameters: { ...old.parameters, spacing: 0.012 },
    };
    storage.limit = 3000;
    expect(writeAutosave(storage, current)).toBe('inputs-only');
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).methodRecord).toBeUndefined();
    const restored = restoreFromStorage(storage);
    expect(restored.project.name).toBe('Latest inputs');
    expect(restored.project.parameters.spacing).toBe(0.012);
    expect(restored.project.graph).toBeNull();
    expect(restored.notice).toContain('regenerated');
  });
  it('unwritable storage preserves the previous cache and reports failure', () => {
    const storage = new MemoryStorage();
    const text = serializeProject(saved());
    storage.setItem(STORAGE_KEY, text);
    storage.blockWrites = true;
    expect(writeAutosave(storage, createProject())).toBe('unavailable');
    expect(storage.getItem(STORAGE_KEY)).toBe(text);
  });
});
describe('history transactions and asynchronous generation', () => {
  it('one slider gesture preserves the pre-drag graph and guides as one undo step', () => {
    const original = saved();
    let history: HistoryState = { past: [], present: original, future: [] };
    for (let i = 0; i < 72; i++)
      history = historyReducer(history, {
        type: 'commit',
        coalesceKey: 'surface:size',
        next: {
          ...history.present,
          surface: { ...history.present.surface, size: 0.08 + i * 0.005 },
          graph: null,
          guides: [],
        },
      });
    expect(history.past.length).toBe(1);
    history = historyReducer(history, { type: 'end-coalesce' });
    history = historyReducer(history, { type: 'undo' });
    expect(history.present.graph).toBe(original.graph);
    expect(history.present.surface.size).toBe(0.08);
  });
  it('a late result merges onto a renamed project without overwriting the name', () => {
    const original = createProject(),
      signature = scientificSignature(original),
      result = generatePattern(original);
    let history: HistoryState = { past: [], present: original, future: [] };
    history = historyReducer(history, {
      type: 'commit',
      next: { ...original, name: 'Renamed during generation' },
    });
    history = historyReducer(history, { type: 'accept-result', signature, result });
    expect(history.present.name).toBe('Renamed during generation');
    expect(history.present.graph).toBe(result.graph);
  });
  it('a result is rejected inside the reducer after a queued scientific edit', () => {
    const original = createProject(),
      signature = scientificSignature(original),
      result = generatePattern(original);
    let history: HistoryState = { past: [], present: original, future: [] };
    history = historyReducer(history, {
      type: 'commit',
      next: { ...original, parameters: { ...original.parameters, spacing: 0.025 } },
    });
    const changed = history;
    history = historyReducer(history, { type: 'accept-result', signature, result });
    expect(history).toBe(changed);
    expect(history.present.graph).toBeNull();
  });
  it('unsupported requested patch settings round-trip without destroying the last accepted graph', () => {
    const state = saved();
    state.parameters = {
      ...state.parameters,
      strategy: 'n-sided-patch',
      patchSides: 3,
      boundaryCounts: [3, 3, 3],
    };
    const restored = parseProject(serializeProject(state));
    expect(restored.parameters.boundaryCounts).toEqual([3, 3, 3]);
    expect(restored.graph?.cells.length).toBe(state.graph!.cells.length);
    expect(() => generatePattern(restored)).toThrow(/even/);
  });
});

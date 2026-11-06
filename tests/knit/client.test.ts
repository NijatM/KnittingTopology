import { afterEach, describe, it, expect, vi } from 'vitest';
import { generateKnitInWorker } from '../../src/knit/client';
import { createProject } from '../../src/app/project';

let workers: FakeWorker[] = [];
class FakeWorker {
  static throwing = false;
  terminated = 0;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  constructor() {
    workers.push(this);
  }
  terminate() {
    this.terminated++;
  }
  postMessage() {
    if (FakeWorker.throwing) throw new DOMException('not cloneable', 'DataCloneError');
  }
  emit(data: unknown) {
    this.onmessage?.({ data });
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  workers = [];
  FakeWorker.throwing = false;
});
function setup() {
  vi.stubGlobal('Worker', FakeWorker);
  return { ...createProject(), graph: null };
}
describe('disposable shaping worker lifecycle', () => {
  it('cleans up a synchronous message-clone failure', async () => {
    const input = setup(),
      controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    FakeWorker.throwing = true;
    await expect(generateKnitInWorker(input, controller.signal)).rejects.toMatchObject({
      name: 'DataCloneError',
    });
    expect(workers[0]!.terminated).toBe(1);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
  it('rejects a malformed mapping instead of leaving a pending promise', async () => {
    const pending = generateKnitInWorker(setup());
    workers[0]!.emit({
      type: 'result',
      build: { ok: true, program: { shape: { needles: null } } },
    });
    await expect(pending).rejects.toBeInstanceOf(TypeError);
    expect(workers[0]!.terminated).toBe(1);
  });
  it('does not allocate a worker for an already cancelled request', async () => {
    const input = setup(),
      controller = new AbortController();
    controller.abort();
    await expect(generateKnitInWorker(input, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(workers).toHaveLength(0);
  });
  it('terminates on abort and ignores a subsequently delivered result', async () => {
    const input = setup(),
      controller = new AbortController();
    const pending = generateKnitInWorker(input, controller.signal);
    controller.abort();
    workers[0]!.emit({ type: 'result', build: { ok: false, reason: 'obsolete' } });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers[0]!.terminated).toBe(1);
  });
  it('cleans up successful and failed deliveries', async () => {
    const pending = generateKnitInWorker(setup());
    workers[0]!.emit({ type: 'result', build: { ok: false, reason: 'measurement missing' } });
    await expect(pending).resolves.toEqual({ ok: false, reason: 'measurement missing' });
    expect(workers[0]!.terminated).toBe(1);
    const bad = generateKnitInWorker(setup());
    workers[1]!.onmessageerror?.();
    await expect(bad).rejects.toThrow(/could not be read/);
    expect(workers[1]!.terminated).toBe(1);
  });
});

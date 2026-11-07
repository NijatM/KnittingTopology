// Knit Grammar keys: a program cell is one needle in one carriage pass; its colour names an operation.
// Ported as data from KnittingPixelArtEditor `src/grammar/ops.ts` (MIT License, (c) 2026 Nijat Mahamaliyev):
// operation ids, colour names, exact RGB, steps and notes are unchanged so that files round-trip.

export type Bed = 'front' | 'back';
export type Action = 'knit' | 'tuck' | 'float';
/** A transfer after the stitch: to the opposite bed, or one needle left / right. */
export type Move = 'none' | 'across' | 'left' | 'right';
export type RGB = [number, number, number];

/** What one yarn guide does at one needle in one pass. A float has no bed. */
export interface Step {
  action: Action;
  bed: Bed;
}

export interface Op {
  id: string;
  name: string;
  /** The colour's name in the key it came from ("dark_blue"). */
  colour: string;
  rgb: RGB;
  /** One step per yarn guide: [step] in a one-guide key, [yg1, yg2] in a two-guide key. */
  steps: Step[];
  move: Move;
  /** Value not yet confirmed by the lab. */
  provisional?: boolean;
  note?: string;
  letter?: string;
}

export interface Key {
  id: string;
  name: string;
  mode: 1 | 2;
  ops: Op[];
  preset?: boolean;
  credit?: string;
  notes?: string[];
}

export const CREDIT =
  'Colour key from Computational Textiles (MIT 4.S52/6.S895, Spring 2026), Mariana Popescu.';

const K = (bed: Bed): Step => ({ action: 'knit', bed });
const T = (bed: Bed): Step => ({ action: 'tuck', bed });
const F: Step = { action: 'float', bed: 'front' };
export const otherBed = (b: Bed): Bed => (b === 'front' ? 'back' : 'front');

/** One-guide class key: the basic convention and basic transfers. */
export const BASIC: Key = {
  id: '4s52-basic',
  name: '4.S52 basic key',
  mode: 1,
  preset: true,
  credit: CREDIT,
  notes: [
    'Dark = front bed, light = back bed, white = float.',
    'light_green is read as knit back + transfer left: the source lists it as front, which would repeat dark_green and break the light = back rule.',
  ],
  ops: [
    {
      id: 'fl',
      name: 'float',
      colour: 'white',
      rgb: [255, 255, 255],
      steps: [F],
      move: 'none',
      note: 'back or front',
    },
    {
      id: 'kf',
      name: 'knit front',
      colour: 'dark_blue',
      rgb: [0, 0, 255],
      steps: [K('front')],
      move: 'none',
    },
    {
      id: 'kb',
      name: 'knit back',
      colour: 'light_blue',
      rgb: [35, 160, 240],
      steps: [K('back')],
      move: 'none',
    },
    {
      id: 'tf',
      name: 'tuck front',
      colour: 'dark_purple',
      rgb: [170, 80, 245],
      steps: [T('front')],
      move: 'none',
    },
    {
      id: 'tb',
      name: 'tuck back',
      colour: 'light_purple',
      rgb: [210, 150, 250],
      steps: [T('back')],
      move: 'none',
    },
    {
      id: 'kfxb',
      name: 'knit front, transfer to back',
      colour: 'dark_yellow',
      rgb: [250, 200, 0],
      steps: [K('front')],
      move: 'across',
    },
    {
      id: 'kbxf',
      name: 'knit back, transfer to front',
      colour: 'light_yellow',
      rgb: [250, 225, 125],
      steps: [K('back')],
      move: 'across',
    },
    {
      id: 'kfxr',
      name: 'knit front, transfer right',
      colour: 'dark_orange',
      rgb: [245, 115, 5],
      steps: [K('front')],
      move: 'right',
    },
    {
      id: 'kfxl',
      name: 'knit front, transfer left',
      colour: 'dark_green',
      rgb: [0, 115, 45],
      steps: [K('front')],
      move: 'left',
    },
    {
      id: 'kbxr',
      name: 'knit back, transfer right',
      colour: 'light_orange',
      rgb: [250, 180, 115],
      steps: [K('back')],
      move: 'right',
    },
    {
      id: 'kbxl',
      name: 'knit back, transfer left',
      colour: 'light_green',
      rgb: [115, 230, 130],
      steps: [K('back')],
      move: 'left',
      note: 'source says front; read as back',
    },
  ],
};

/** Two-guide class key: each cell holds what both yarn guides do at that needle in the same pass. */
export const TWO: Key = {
  id: '4s52-two',
  name: '4.S52 two yarn guides',
  mode: 2,
  preset: true,
  credit: CREDIT,
  notes: [
    'The shade says which bed yarn guide 1 is on; yarn guide 2 works the other bed.',
    "Brown and gold are provisional until the lab's script confirms them (recovered from a screenshot as #996600 and #CC9900).",
  ],
  ops: [
    {
      id: 'fl2',
      name: 'both float',
      colour: 'white',
      rgb: [255, 255, 255],
      steps: [F, F],
      move: 'none',
    },
    {
      id: 'k2f',
      name: 'YG1 knit front · YG2 knit back',
      colour: 'dark_blue',
      rgb: [0, 0, 255],
      steps: [K('front'), K('back')],
      move: 'none',
    },
    {
      id: 'k2b',
      name: 'YG1 knit back · YG2 knit front',
      colour: 'light_blue',
      rgb: [35, 160, 240],
      steps: [K('back'), K('front')],
      move: 'none',
    },
    {
      id: 't2f',
      name: 'YG1 tuck front · YG2 tuck back',
      colour: 'dark_purple',
      rgb: [170, 80, 245],
      steps: [T('front'), T('back')],
      move: 'none',
    },
    {
      id: 't2b',
      name: 'YG1 tuck back · YG2 tuck front',
      colour: 'light_purple',
      rgb: [210, 150, 250],
      steps: [T('back'), T('front')],
      move: 'none',
    },
    {
      id: 'g2',
      name: 'YG1 knit front · YG2 float',
      colour: 'gold',
      rgb: [204, 153, 0],
      steps: [K('front'), F],
      move: 'none',
      provisional: true,
    },
    {
      id: 'b2',
      name: 'YG1 float · YG2 knit back',
      colour: 'brown',
      rgb: [153, 102, 0],
      steps: [F, K('back')],
      move: 'none',
      provisional: true,
    },
  ],
};

export const PRESET_KEYS: readonly Key[] = [BASIC, TWO];
export const keyById = (id: string): Key | undefined => PRESET_KEYS.find((k) => k.id === id);

export const hex = (c: RGB) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
export const rgbText = (c: RGB) => `(${c.join(', ')})`;

/** The index of the key's "nothing happens here" operation (float / both float), or 0. */
export function floatIndex(key: Key): number {
  const i = key.ops.findIndex(
    (o) => o.move === 'none' && o.steps.every((s) => s.action === 'float')
  );
  return i < 0 ? 0 : i;
}

/** Plain jersey on the front bed when the key has it, otherwise float (Knit Grammar's default fill). */
export function defaultFill(key: Key): number {
  const i = key.ops.findIndex(
    (o) =>
      o.move === 'none' &&
      o.steps.length === 1 &&
      o.steps[0]!.action === 'knit' &&
      o.steps[0]!.bed === 'front'
  );
  return i >= 0 ? i : floatIndex(key);
}

// ---------------------------------------------------------------- custom keys
// A custom key is a copy of a class key, edited here or read from a Knit Grammar pattern JSON, as in Knit
// Grammar's key editor. Program code finds operations by meaning, never by colour or by a class-key id.

export const MAX_CUSTOM_KEYS = 8,
  MAX_KEY_OPS = 32,
  MAX_KEY_NAME = 60;

type Meaning = Pick<Op, 'steps' | 'move'>;

/** Two operations mean the same thing on the machine (Knit Grammar's `sameMeaning`); a float has no bed. */
export function sameMeaning(a: Meaning, b: Meaning): boolean {
  return (
    a.steps.length === b.steps.length &&
    a.move === b.move &&
    a.steps.every(
      (s, i) =>
        s.action === b.steps[i]!.action && (s.action === 'float' || s.bed === b.steps[i]!.bed)
    )
  );
}

/** Index of the first operation with this meaning, or -1. */
export const findOp = (key: Key, steps: readonly Step[], move: Move = 'none'): number =>
  key.ops.findIndex((o) => sameMeaning(o, { steps: steps as Step[], move }));

/** The id in `to` of the operation that means what `id` means in `from`. Within one key ids are kept. */
export function translateOp(from: Key, id: string, to: Key): string | undefined {
  if (from === to || from.id === to.id) return to.ops.some((o) => o.id === id) ? id : undefined;
  const op = from.ops.find((o) => o.id === id);
  const i = op ? findOp(to, op.steps, op.move) : -1;
  return i < 0 ? undefined : to.ops[i]!.id;
}

/** A class key or one of the project's custom keys. */
export const resolveKey = (id: string, custom: readonly Key[] = []): Key | undefined =>
  keyById(id) ?? custom.find((k) => k.id === id);

/** The key the settings name, or the basic class key. */
export const settingsKey = (s: { keyId: string; keys?: readonly Key[] }): Key =>
  resolveKey(s.keyId, s.keys) ?? BASIC;

const stepText = (s: Step) => (s.action === 'float' ? 'float' : `${s.action} ${s.bed}`);
/** A name built from the meaning, for new operations (Knit Grammar's `autoName`). */
export function meaningName(steps: readonly Step[], move: Move): string {
  if (steps.length === 2)
    return (
      (steps.every((s) => s.action === 'float')
        ? 'both float'
        : `YG1 ${stepText(steps[0]!)} · YG2 ${stepText(steps[1]!)}`) +
      (move === 'none' ? '' : `, transfer ${move === 'across' ? 'to the other bed' : move}`)
    );
  const s = steps[0]!;
  if (s.action === 'float')
    return move === 'none'
      ? 'float'
      : `transfer only, ${move === 'across' ? 'to the other bed' : move}`;
  if (move === 'none') return stepText(s);
  return `${stepText(s)}, ${move === 'across' ? `transfer to ${otherBed(s.bed)}` : `transfer ${move}`}`;
}

const ACTIONS: readonly Action[] = ['knit', 'tuck', 'float'],
  BEDS: readonly Bed[] = ['front', 'back'],
  MOVES: readonly Move[] = ['none', 'across', 'left', 'right'],
  ID = /^[A-Za-z0-9._:-]{1,64}$/;

function text(v: unknown, name: string, max: number, required = true): string | undefined {
  if (v === undefined && !required) return undefined;
  if (typeof v !== 'string' || (required && !v.trim()) || v.length > max)
    throw new Error(`${name} must contain ${required ? 1 : 0} to ${max} characters.`);
  return v;
}

/** Validated copy of one operation of a key with `mode` yarn guides; throws a descriptive Error. */
function validateOp(v: unknown, mode: 1 | 2, n: number): Op {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new Error(`operation ${n} must be an object.`);
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || !ID.test(o.id))
    throw new Error(`operation ${n} has an invalid id.`);
  const name = text(o.name, `operation ${o.id} name`, MAX_KEY_NAME)!;
  const colour = text(o.colour, `operation ${o.id} colour name`, 32)!;
  if (
    !Array.isArray(o.rgb) ||
    o.rgb.length !== 3 ||
    o.rgb.some((c) => !Number.isInteger(c) || c < 0 || c > 255)
  )
    throw new Error(`operation ${o.id} colour must be three integers from 0 to 255.`);
  if (!Array.isArray(o.steps) || o.steps.length !== mode)
    throw new Error(`operation ${o.id} must have one step per yarn guide (${mode}).`);
  const steps = o.steps.map((s): Step => {
    const r = (s ?? {}) as Record<string, unknown>;
    if (!ACTIONS.includes(r.action as Action) || !BEDS.includes(r.bed as Bed))
      throw new Error(`operation ${o.id} has an unknown step.`);
    return { action: r.action as Action, bed: r.bed as Bed };
  });
  if (!MOVES.includes(o.move as Move))
    throw new Error(`operation ${o.id} has an unknown transfer.`);
  if (mode === 2 && o.move !== 'none')
    throw new Error(`operation ${o.id}: two-guide operations have no transfer.`);
  if (o.provisional !== undefined && typeof o.provisional !== 'boolean')
    throw new Error(`operation ${o.id} provisional must be true or false.`);
  const note = text(o.note, `operation ${o.id} note`, 200, false),
    letter = text(o.letter, `operation ${o.id} letter`, 2, false);
  return {
    id: o.id,
    name,
    colour,
    rgb: [...(o.rgb as number[])] as RGB,
    steps,
    move: o.move as Move,
    ...(o.provisional ? { provisional: true } : {}),
    ...(note === undefined ? {} : { note }),
    ...(letter === undefined ? {} : { letter }),
  };
}

/** Validated copy of a custom key (never a preset); throws a descriptive Error. */
export function validateKey(value: unknown): Key {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('key must be an object.');
  const k = value as Record<string, unknown>;
  if (typeof k.id !== 'string' || !/^custom-[A-Za-z0-9._:-]{1,57}$/.test(k.id))
    throw new Error('custom key IDs must start with custom-.');
  const name = text(k.name, 'key name', MAX_KEY_NAME)!;
  if (k.mode !== 1 && k.mode !== 2) throw new Error('key must have one or two yarn guides.');
  const mode = k.mode;
  if (!Array.isArray(k.ops) || k.ops.length < 1 || k.ops.length > MAX_KEY_OPS)
    throw new Error(`key must have 1 to ${MAX_KEY_OPS} operations.`);
  const ops = k.ops.map((o, i) => validateOp(o, mode, i + 1));
  if (new Set(ops.map((o) => o.id)).size !== ops.length)
    throw new Error('operation ids must be unique within a key.');
  if (new Set(ops.map((o) => hex(o.rgb))).size !== ops.length)
    throw new Error('each operation needs its own exact colour.');
  if (!ops.some((o) => o.move === 'none' && o.steps.every((s) => s.action === 'float')))
    throw new Error('a key needs a float operation for needles that knit nothing.');
  const credit = text(k.credit, 'key credit', 300, false);
  if (
    k.notes !== undefined &&
    (!Array.isArray(k.notes) ||
      k.notes.length > 8 ||
      k.notes.some((n) => typeof n !== 'string' || n.length > 300))
  )
    throw new Error('key notes must be at most 8 texts of at most 300 characters.');
  return {
    id: k.id,
    name,
    mode,
    ops,
    ...(credit === undefined ? {} : { credit }),
    ...(k.notes === undefined ? {} : { notes: [...(k.notes as string[])] }),
  };
}

/** Validated custom key list; ids are unique and never a class key's. */
export function validateKeys(value: unknown): Key[] {
  if (!Array.isArray(value) || value.length > MAX_CUSTOM_KEYS)
    throw new Error(`keys must list at most ${MAX_CUSTOM_KEYS} custom keys.`);
  const keys = value.map(validateKey);
  if (new Set(keys.map((k) => k.id)).size !== keys.length)
    throw new Error('custom key IDs must be unique.');
  return keys;
}

/** A new custom copy of `from` (Knit Grammar's "make a custom copy"). */
export function customCopy(from: Key, id: string): Key {
  const { preset: _preset, ...rest } = structuredClone(from);
  void _preset;
  return validateKey({ ...rest, id, name: `my key (from ${from.name})`.slice(0, MAX_KEY_NAME) });
}

/** Same operations in the same order, by id, name, colour and meaning. */
export function sameKeyContent(a: Key, b: Key): boolean {
  return (
    a.mode === b.mode &&
    a.ops.length === b.ops.length &&
    a.ops.every((o, i) => {
      const p = b.ops[i]!;
      return o.id === p.id && o.name === p.name && hex(o.rgb) === hex(p.rgb) && sameMeaning(o, p);
    })
  );
}

/**
 * Reads the key of a Knit Grammar pattern JSON as a custom key for this project. An identical key already
 * present is returned instead of a copy (`existing: true`); a taken id gets `newId`.
 */
export function importGrammarKey(
  text: string,
  custom: readonly Key[],
  newId: () => string
): { key: Key; existing: boolean } {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('The file is not JSON.');
  }
  if (j?.format !== 'knit-grammar-pattern' || !j.key || typeof j.key !== 'object')
    throw new Error('The file is not a Knit Grammar pattern with a key.');
  const raw = j.key as Record<string, unknown>;
  const probe = validateKey({ ...raw, id: 'custom-probe' });
  const known = [...PRESET_KEYS, ...custom].find((k) => sameKeyContent(k, probe));
  if (known?.preset)
    throw new Error(`The file uses the class key ${known.name}; it is already available.`);
  if (known) return { key: known, existing: true };
  if (custom.length >= MAX_CUSTOM_KEYS)
    throw new Error(`A project keeps at most ${MAX_CUSTOM_KEYS} custom keys.`);
  const id =
    typeof raw.id === 'string' &&
    /^custom-[A-Za-z0-9._:-]{1,57}$/.test(raw.id) &&
    !custom.some((k) => k.id === raw.id)
      ? raw.id
      : newId();
  return { key: { ...probe, id }, existing: false };
}

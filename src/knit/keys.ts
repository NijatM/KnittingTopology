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

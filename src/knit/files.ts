// Knit program files in Knit Grammar's formats. The BMP writer and the project JSON fields follow
// KnittingPixelArtEditor `src/export.ts` (encodeBmp), `src/grammar/io.ts` (palette, bmpOf) and
// `src/grammar/pattern.ts` (toJSON) (MIT License, (c) 2026 Nijat Mahamaliyev), so the files open there unchanged.
import { hex, type RGB } from './keys';
import { UNKNOWN, type KnitCells } from './grid';

/** The palette a file is written with: the key's operations, then any unknown colours, compacted to what is used. */
function palette(p: KnitCells, unknown: readonly RGB[]) {
  const used = new Map<number, number>(),
    pal: string[] = [];
  const cells = new Uint8Array(p.cells.length);
  p.cells.forEach((v, i) => {
    if (!used.has(v)) {
      used.set(v, pal.length);
      pal.push(hex(v >= UNKNOWN ? unknown[v - UNKNOWN]! : p.key.ops[v]!.rgb));
    }
    cells[i] = used.get(v)!;
  });
  return { pal, cells };
}

const rgbOf = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Windows BMP (BITMAPINFOHEADER), 24-bit, bottom-up rows padded to 4 bytes, 2835 px/m. */
function encodeBmp24(cells: Uint8Array, W: number, H: number, pal: string[]): Uint8Array {
  const depth = 24;
  const rowBytes = Math.ceil((W * depth) / 32) * 4,
    pixelOffset = 14 + 40,
    size = pixelOffset + rowBytes * H;
  const buf = new ArrayBuffer(size),
    v = new DataView(buf),
    u = new Uint8Array(buf);
  u[0] = 0x42;
  u[1] = 0x4d;
  v.setUint32(2, size, true);
  v.setUint32(10, pixelOffset, true);
  v.setUint32(14, 40, true);
  v.setInt32(18, W, true);
  v.setInt32(22, H, true);
  v.setUint16(26, 1, true);
  v.setUint16(28, depth, true);
  v.setUint32(30, 0, true);
  v.setUint32(34, rowBytes * H, true);
  v.setInt32(38, 2835, true);
  v.setInt32(42, 2835, true);
  v.setUint32(46, 0, true);
  v.setUint32(50, 0, true);
  const cols = pal.map(rgbOf);
  for (let y = 0; y < H; y++) {
    const row = pixelOffset + (H - 1 - y) * rowBytes;
    for (let x = 0; x < W; x++) {
      const [r, g, b] = cols[cells[y * W + x]!]!;
      u.set([b!, g!, r!], row + x * 3);
    }
  }
  return u;
}

/** 24-bit BMP: one pixel per needle and pass, bottom row = pass 1, the key's exact RGB. */
export function bmpBytes(p: KnitCells, unknown: readonly RGB[] = []): Uint8Array {
  const { pal, cells } = palette(p, unknown);
  return encodeBmp24(cells, p.w, p.h, pal);
}

export const b64 = (u: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};

export interface GrammarFile extends KnitCells {
  name: string;
  firstDir: 1 | -1;
  /** Shown next to the key in Knit Grammar ("intention"). */
  note: string;
}

/** Knit Grammar project file (format knit-grammar-pattern, version 1), without a design layer. */
export function grammarJson(p: GrammarFile, unknown: readonly RGB[] = []): string {
  return JSON.stringify(
    {
      format: 'knit-grammar-pattern',
      version: 1,
      name: p.name,
      needles: p.w,
      passes: p.h,
      firstPass: p.firstDir === 1 ? 'left-to-right' : 'right-to-left',
      yarnGuides: p.key.mode,
      key: {
        name: p.key.name,
        id: p.key.id,
        mode: p.key.mode,
        credit: p.key.credit,
        notes: p.key.notes,
        ops: p.key.ops,
      },
      unknownColours: unknown,
      note: p.note,
      rowsTopToBottom: 'cells are op indices, row 0 = last pass (as in the image)',
      cells: b64(p.cells),
      design: undefined,
    },
    null,
    1
  );
}

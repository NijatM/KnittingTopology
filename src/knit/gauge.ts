// Swatch measurement table: per structure, the measured needle (wale) spacing and pass (course) spacing. Values
// come only from the user's swatches. A structure without its own entry uses the jersey entry and is flagged.
import type { SwatchEntry } from '../core/types';

export const SWATCH_FORMAT = 'knitting-topology-swatches';
export const MAX_SWATCHES = 200;
/** Accepted range for a measured spacing, meters (0.01 mm to 100 mm). */
export const SPACING_RANGE: readonly [number, number] = [1e-5, 0.1];
export const GAUGE_REFERENCE = 'jersey';

export interface Gauge {
  /** Structure the values were measured on. */
  measuredOn: string;
  stitchWidth: number;
  courseHeight: number;
  /** True when the structure has no entry and jersey values stand in. */
  assumed: boolean;
}

/** Measured gauge of a structure, the jersey fallback (flagged), or null without a jersey entry. */
export function gaugeOf(structure: string, swatches: readonly SwatchEntry[]): Gauge | null {
  const own = swatches.find((s) => s.structure === structure);
  if (own)
    return {
      measuredOn: structure,
      stitchWidth: own.stitchWidth,
      courseHeight: own.courseHeight,
      assumed: false,
    };
  const ref = swatches.find((s) => s.structure === GAUGE_REFERENCE);
  return ref
    ? {
        measuredOn: GAUGE_REFERENCE,
        stitchWidth: ref.stitchWidth,
        courseHeight: ref.courseHeight,
        assumed: true,
      }
    : null;
}

const TEXT_FIELDS = ['date', 'gauge', 'yarn', 'stitchLength', 'note'] as const;

/** Validated copy of a measurement table; throws a descriptive Error. */
export function validateSwatches(value: unknown): SwatchEntry[] {
  if (!Array.isArray(value) || value.length > MAX_SWATCHES)
    throw new Error(`the measurement table must be a list of at most ${MAX_SWATCHES} entries.`);
  const seen = new Set<string>();
  return value.map((item, i) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new Error(`measurement ${i + 1} must be an object.`);
    const e = item as Record<string, unknown>;
    if (typeof e.structure !== 'string' || !e.structure.length || e.structure.length > 64)
      throw new Error(`measurement ${i + 1} needs a structure id.`);
    if (seen.has(e.structure))
      throw new Error(`structure "${e.structure}" is measured more than once.`);
    seen.add(e.structure);
    const out: SwatchEntry = {
      structure: e.structure,
      stitchWidth: spacing(e.stitchWidth, `${e.structure} stitch width`),
      courseHeight: spacing(e.courseHeight, `${e.structure} course height`),
    };
    for (const f of TEXT_FIELDS) {
      const v = e[f];
      if (v === undefined || v === '') continue;
      if (typeof v !== 'string' || v.length > 500)
        throw new Error(`${e.structure} ${f} must be text of at most 500 characters.`);
      out[f] = v;
    }
    return out;
  });
}

function spacing(value: unknown, name: string): number {
  const [low, high] = SPACING_RANGE;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high)
    throw new Error(`${name} must be between ${low * 1000} and ${high * 1000} mm.`);
  return value;
}

/** The measurement table as its own file, units declared. */
export function swatchFileText(swatches: readonly SwatchEntry[]): string {
  return (
    JSON.stringify(
      {
        format: SWATCH_FORMAT,
        version: 1,
        units: { stitchWidth: 'm', courseHeight: 'm' },
        definitions: {
          stitchWidth: 'measured needle (wale) spacing of the structure',
          courseHeight: 'measured pass (course) spacing of the structure',
          fallback: 'structures without an entry use the jersey entry and are flagged as assumed',
        },
        swatches,
      },
      null,
      2
    ) + '\n'
  );
}

export function parseSwatchFile(text: string): SwatchEntry[] {
  if (text.length > 1_000_000) throw new Error('the measurement file is larger than 1 MB.');
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error('the measurement file is not valid JSON.');
  }
  const f = file as Record<string, unknown> | null;
  if (!f || f.format !== SWATCH_FORMAT || f.version !== 1)
    throw new Error('not a Knitting Topology measurement table (version 1).');
  const units = f.units as Record<string, unknown> | undefined;
  if (units?.stitchWidth !== 'm' || units?.courseHeight !== 'm')
    throw new Error('the measurement table must declare meters.');
  return validateSwatches(f.swatches);
}

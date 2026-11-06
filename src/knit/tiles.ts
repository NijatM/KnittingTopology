import type { KnitSettings, KnitTile } from '../core/types';
import { keyById } from './keys';

export const MAX_TILES = 24,
  MAX_TILE_SIDE = 16;
/** User structures use known operations; they cannot replace built-ins. */
export function validateTiles(value: unknown): KnitTile[] {
  if (!Array.isArray(value) || value.length > MAX_TILES)
    throw new Error(`tiles must list at most ${MAX_TILES} structures.`);
  const ids = new Set<string>();
  return value.map((v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('tile must be an object.');
    const s = v as Record<string, unknown>;
    if (
      typeof s.id !== 'string' ||
      s.id.length > 64 ||
      !/^custom:[A-Za-z0-9._:-]+$/.test(s.id) ||
      ids.has(s.id)
    )
      throw new Error('tile IDs must be unique custom: IDs.');
    ids.add(s.id);
    if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 64)
      throw new Error('tile name must contain 1 to 64 characters.');
    const key = typeof s.keyId === 'string' ? keyById(s.keyId) : undefined;
    if (!key) throw new Error('tile key is unsupported.');
    const w = s.w as number,
      h = s.h as number;
    if (![w, h].every((x) => Number.isInteger(x) && x >= 1 && x <= MAX_TILE_SIDE))
      throw new Error(`tile sides must be 1 to ${MAX_TILE_SIDE}.`);
    const ops = new Set(key.ops.map((o) => o.id));
    if (!Array.isArray(s.rows) || s.rows.length !== h)
      throw new Error('tile row count must match its height.');
    const rows = s.rows.map((r) => {
      if (
        !Array.isArray(r) ||
        r.length !== w ||
        r.some((op) => typeof op !== 'string' || !ops.has(op))
      )
        throw new Error('tile rows must match their width and use known key operations.');
      return [...r] as string[];
    });
    if (s.note !== undefined && (typeof s.note !== 'string' || s.note.length > 1000))
      throw new Error('tile note must contain at most 1000 characters.');
    return {
      id: s.id,
      name: s.name,
      keyId: key.id,
      w,
      h,
      rows,
      ...(s.note === undefined ? {} : { note: s.note as string }),
    };
  });
}
export function tileInUse(settings: KnitSettings, id: string): boolean {
  const r = settings.cells.rule;
  return [
    settings.cells.fill,
    settings.edges.structure,
    settings.nodes.structure,
    settings.nodes.extraordinary,
    ...Object.values(settings.cells.overrides),
    ...(r.kind === 'sides'
      ? Object.values(r.bySides)
      : r.kind === 'coarse' || r.kind === 'alternating'
        ? r.palette
        : []),
  ].includes(id);
}

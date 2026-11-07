// Editing the project's custom keys: pure settings updates with the guards of the key editor.
import type { KnitSettings } from '../core/types';
import {
  BASIC,
  TWO,
  MAX_CUSTOM_KEYS,
  floatIndex,
  validateKey,
  validateKeys,
  type Key,
} from './keys';
import { structuresForKey } from './structures';
import { withKey } from './settings';

/** Structure ids the settings assign anywhere (fill, rule, overrides, edge lines, node marks). */
export function assignedStructures(s: KnitSettings): Set<string> {
  const r = s.cells.rule;
  return new Set(
    [
      s.cells.fill,
      ...(r.kind === 'sides' ? Object.values(r.bySides) : r.kind === 'uniform' ? [] : r.palette),
      ...Object.values(s.cells.overrides),
      s.edges.structure,
      s.nodes.structure,
      s.nodes.extraordinary,
    ].filter((id): id is string => id !== null)
  );
}

/** What uses an operation of a custom key: saved tiles, assigned structures, or empty needles (the float). */
export function opUsers(s: KnitSettings, key: Key, opId: string): string[] {
  const users = (s.tiles ?? [])
    .filter((t) => t.keyId === key.id && t.rows.some((r) => r.includes(opId)))
    .map((t) => `tile ${t.name}`);
  if (s.keyId === key.id) {
    const assigned = assignedStructures(s);
    for (const x of structuresForKey(key, s.tiles, s.keys))
      if (
        assigned.has(x.id) &&
        x.rows.some((r) => r.includes(opId)) &&
        !users.includes(`tile ${x.name}`)
      )
        users.push(`assigned structure ${x.name}`);
  }
  if (key.ops[floatIndex(key)]?.id === opId) users.push('needles that knit nothing');
  return users;
}

/** Settings with one custom key replaced by a validated edit. */
export function replaceKey(s: KnitSettings, key: Key): KnitSettings {
  const keys = (s.keys ?? []).map((k) => (k.id === key.id ? validateKey(key) : k));
  return { ...s, keys: validateKeys(keys) };
}

/** Settings with a new custom key added and selected. */
export function addKey(s: KnitSettings, key: Key): { settings: KnitSettings; reset: number } {
  if ((s.keys ?? []).length >= MAX_CUSTOM_KEYS)
    throw new Error(`A project keeps at most ${MAX_CUSTOM_KEYS} custom keys.`);
  return withKey({ ...s, keys: validateKeys([...(s.keys ?? []), key]) }, key.id);
}

/** Settings without a custom key. Refused while tiles use it; the selection falls back to the class key. */
export function removeKey(s: KnitSettings, id: string): { settings: KnitSettings; reset: number } {
  const key = (s.keys ?? []).find((k) => k.id === id);
  if (!key) throw new Error('The key is not a custom key of this project.');
  const tiles = (s.tiles ?? []).filter((t) => t.keyId === id);
  if (tiles.length)
    throw new Error(
      `Tiles made with this key use it: ${tiles.map((t) => t.name).join(', ')}. Remove them first.`
    );
  const rest = { ...s, keys: (s.keys ?? []).filter((k) => k.id !== id) };
  return s.keyId === id
    ? withKey(rest, (key.mode === 2 ? TWO : BASIC).id)
    : { settings: rest, reset: 0 };
}

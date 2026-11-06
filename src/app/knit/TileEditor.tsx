import { useState } from 'react';
import type { KnitSettings, KnitTile, SwatchEntry } from '../../core/types';
import { BASIC, keyById, hex } from '../../knit/keys';
import { structuresForKey, type Structure } from '../../knit/structures';
import { MAX_TILE_SIDE, MAX_TILES, tileInUse, validateTiles } from '../../knit/tiles';

export default function TileEditor({
  settings: s,
  swatches,
  onChange,
}: {
  settings: KnitSettings;
  swatches: SwatchEntry[];
  onChange: (s: KnitSettings) => void;
}) {
  const key = keyById(s.keyId) ?? BASIC,
    library = structuresForKey(key, s.tiles);
  const [source, setSource] = useState(library[0]!.id),
    [name, setName] = useState('My structure');
  const [draft, setDraft] = useState<Structure>(() => ({
    ...library[0]!,
    rows: library[0]!.rows.map((r) => [...r]),
  }));
  const [brush, setBrush] = useState(key.ops.find((o) => o.id === 'kf')?.id ?? key.ops[0]!.id),
    [message, setMessage] = useState('');
  const load = (id: string) => {
    const t = library.find((x) => x.id === id)!;
    setSource(id);
    setDraft({ ...t, rows: t.rows.map((r) => [...r]) });
    setName(`${t.name} copy`.slice(0, 64));
    setMessage('');
  };
  const resize = (w: number, h: number) => {
    if (![w, h].every((x) => Number.isInteger(x) && x >= 1 && x <= MAX_TILE_SIDE)) return;
    // Preserve needle/pass anchoring when resizing the last-pass-first image array.
    const rows = Array.from({ length: h }, (_, r) =>
      Array.from(
        { length: w },
        (_, j) =>
          draft.rows[draft.h - h + r]?.[j] ??
          key.ops.find((o) => o.id === 'kf')?.id ??
          key.ops[0]!.id
      )
    );
    setDraft({ ...draft, w, h, rows });
  };
  const save = () => {
    try {
      const tile: KnitTile = {
        id: `custom:${crypto.randomUUID()}`,
        name: name.trim(),
        keyId: key.id,
        w: draft.w,
        h: draft.h,
        rows: draft.rows.map((r) => [...r]),
      };
      const tiles = validateTiles([...(s.tiles ?? []), tile]);
      onChange({ ...s, tiles });
      setMessage(`Saved ${tile.name}. Select it in a structure assignment or measurement table.`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  return (
    <details className="knit-tile-editor">
      <summary>Structure tile editor</summary>
      <p className="hint">
        Copy a structure, paint known operations, then save a new tile. Saved tiles are immutable;
        new copies have no inherited measurement. Bottom row is pass 1.
      </p>
      <label className="select-label">
        Copy from
        <select aria-label="Copy tile from" value={source} onChange={(e) => load(e.target.value)}>
          {library.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="select-label">
        Tile name
        <input
          aria-label="Tile name"
          maxLength={64}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="boundary-counts knit-pair">
        {(['w', 'h'] as const).map((k) => (
          <label key={k}>
            {k === 'w' ? 'Tile needles' : 'Tile passes'}
            <input
              type="number"
              aria-label={k === 'w' ? 'Tile needles' : 'Tile passes'}
              min={1}
              max={MAX_TILE_SIDE}
              value={draft[k]}
              onChange={(e) =>
                resize(
                  k === 'w' ? Number(e.target.value) : draft.w,
                  k === 'h' ? Number(e.target.value) : draft.h
                )
              }
            />
          </label>
        ))}
      </div>
      <label className="select-label">
        Paint operation
        <select
          aria-label="Tile paint operation"
          value={brush}
          onChange={(e) => setBrush(e.target.value)}
        >
          {key.ops.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} ({o.id})
            </option>
          ))}
        </select>
      </label>
      <div className="knit-tile-scroll">
        <div className="knit-tile-grid" style={{ gridTemplateColumns: `repeat(${draft.w}, 32px)` }}>
          {draft.rows.flatMap((row, r) =>
            row.map((id, j) => {
              const op = key.ops.find((o) => o.id === id)!;
              return (
                <button
                  key={`${r}:${j}`}
                  type="button"
                  title={op.name}
                  aria-label={`Tile needle ${j + 1}, pass ${draft.h - r}: ${op.name}`}
                  style={{
                    background: hex(op.rgb),
                    color: op.rgb.reduce((a, b) => a + b, 0) < 420 ? 'white' : 'black',
                  }}
                  onClick={() => {
                    const rows = draft.rows.map((row) => [...row]);
                    rows[r]![j] = brush;
                    setDraft({ ...draft, rows });
                  }}
                >
                  {id}
                </button>
              );
            })
          )}
        </div>
      </div>
      <button type="button" disabled={(s.tiles?.length ?? 0) >= MAX_TILES} onClick={save}>
        Save new tile
      </button>
      <p className="hint" role="status">
        {message || `${s.tiles?.length ?? 0}/${MAX_TILES} user tiles saved.`}
      </p>
      {(s.tiles ?? []).map((t) => {
        const used = tileInUse(s, t.id) || swatches.some((x) => x.structure === t.id);
        return (
          <div className="inline-actions" key={t.id}>
            <span>{t.name}</span>
            <button
              type="button"
              disabled={used}
              title={
                used
                  ? 'Remove assignments and measurements before deleting this tile.'
                  : 'Delete this unused tile'
              }
              aria-label={`Delete tile ${t.name}`}
              onClick={() => {
                onChange({ ...s, tiles: s.tiles!.filter((x) => x.id !== t.id) });
                if (source === t.id) load(library[0]!.id);
              }}
            >
              Delete
            </button>
          </div>
        );
      })}
    </details>
  );
}

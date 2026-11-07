// Colour key editor (Knit tab): class keys are read-only; a custom copy, or a key read from a Knit Grammar pattern
// JSON, can be renamed, recoloured and extended with operations from the vocabulary, as in Knit Grammar.
import { useState } from 'react';
import type { KnitSettings } from '../../core/types';
import {
  MAX_CUSTOM_KEYS,
  MAX_KEY_OPS,
  customCopy,
  hex,
  importGrammarKey,
  keyById,
  meaningName,
  rgbText,
  settingsKey,
  type Action,
  type Bed,
  type Key,
  type Move,
  type RGB,
  type Step,
} from '../../knit/keys';
import { addKey, opUsers, removeKey, replaceKey } from '../../knit/custom-keys';
import { withKey } from '../../knit/settings';

const fromHex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const newKeyId = () => `custom-${crypto.randomUUID()}`;
const other = (b: Bed): Bed => (b === 'front' ? 'back' : 'front');

export default function KeyEditor({
  settings: s,
  onChange,
}: {
  settings: KnitSettings;
  onChange: (s: KnitSettings, coalesceKey?: string) => void;
}) {
  const key = settingsKey(s),
    custom = !keyById(key.id),
    count = (s.keys ?? []).length;
  const [message, setMessage] = useState(''),
    [action, setAction] = useState<Action>('knit'),
    [bed, setBed] = useState<Bed>('front'),
    [move, setMove] = useState<Move>('none'),
    [action2, setAction2] = useState<Action>('tuck'),
    [colour, setColour] = useState('#7a5cff');
  const steps: Step[] =
    key.mode === 2
      ? [
          { action, bed },
          { action: action2, bed: other(bed) },
        ]
      : [{ action, bed }];
  const newMove: Move = key.mode === 2 ? 'none' : move;

  const run = (f: () => string) => {
    try {
      setMessage(f());
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  const edit = (next: Key, coalesce?: string) =>
    run(() => {
      onChange(replaceKey(s, next), coalesce);
      return '';
    });
  const reset = (n: number) =>
    n
      ? ` ${n} assignment${n === 1 ? '' : 's'} not available with it moved to the fill or were switched off.`
      : '';

  return (
    <details className="knit-tile-editor knit-key-editor">
      <summary>Colour key</summary>
      <p className="hint">
        {key.name} · {key.mode === 2 ? 'two yarn guides' : 'one yarn guide'} ·{' '}
        {custom ? 'custom key' : 'class key, read-only'}. Operations are matched by what they do,
        not by colour.
      </p>
      <div className="inline-actions">
        <button
          type="button"
          disabled={count >= MAX_CUSTOM_KEYS}
          onClick={() =>
            run(() => {
              const r = addKey(s, customCopy(key, newKeyId()));
              onChange(r.settings);
              return `Made a custom copy of ${key.name}.${reset(r.reset)}`;
            })
          }
        >
          Make a custom copy
        </button>
        <label className="file-button">
          Read key from Knit Grammar JSON
          <input
            type="file"
            accept=".json,application/json"
            aria-label="Read key from Knit Grammar JSON"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const text = await file.text();
              run(() => {
                const read = importGrammarKey(text, s.keys ?? [], newKeyId);
                const r = read.existing ? withKey(s, read.key.id) : addKey(s, read.key);
                // Reading the key already in use changes nothing (and adds no undo step).
                if (!read.existing || read.key.id !== s.keyId) onChange(r.settings);
                return `${read.existing ? 'The project already has this key; selected' : 'Read'} ${read.key.name}.${reset(r.reset)}`;
              });
            }}
          />
        </label>
      </div>
      {custom && (
        <>
          <label className="select-label">
            Key name
            <input
              aria-label="Key name"
              value={key.name}
              maxLength={60}
              onChange={(e) => edit({ ...key, name: e.target.value }, `key-name-${key.id}`)}
            />
          </label>
        </>
      )}
      <ul className="knit-key-ops">
        {key.ops.map((o) => (
          <li key={o.id}>
            {custom ? (
              <input
                type="color"
                aria-label={`Colour of ${o.name}`}
                value={hex(o.rgb)}
                onChange={(e) =>
                  edit({
                    ...key,
                    ops: key.ops.map((p) =>
                      p.id === o.id
                        ? { ...p, rgb: fromHex(e.target.value), colour: e.target.value }
                        : p
                    ),
                  })
                }
              />
            ) : (
              <span className="knit-key-swatch" style={{ background: hex(o.rgb) }} />
            )}
            <span>
              {custom ? (
                <input
                  aria-label={`Name of ${o.id}`}
                  value={o.name}
                  maxLength={60}
                  onChange={(e) =>
                    edit(
                      {
                        ...key,
                        ops: key.ops.map((p) =>
                          p.id === o.id ? { ...p, name: e.target.value } : p
                        ),
                      },
                      `key-op-${key.id}-${o.id}`
                    )
                  }
                />
              ) : (
                <b>{o.name}</b>
              )}
              <small>
                {meaningName(o.steps, o.move)} · {rgbText(o.rgb)}
                {o.provisional ? ' · provisional' : ''}
              </small>
            </span>
            {custom && (
              <button
                type="button"
                aria-label={`Remove operation ${o.name}`}
                onClick={() =>
                  run(() => {
                    const users = opUsers(s, key, o.id);
                    if (users.length) return `${o.name} is used by ${users.join(', ')}.`;
                    onChange(replaceKey(s, { ...key, ops: key.ops.filter((p) => p.id !== o.id) }));
                    return `Removed ${o.name}.`;
                  })
                }
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {custom && (
        <>
          <h4 className="knit-heading">Add an operation</h4>
          <div className="knit-key-builder">
            <label className="select-label">
              {key.mode === 2 ? 'YG1' : 'Action'}
              <select
                aria-label="New operation action"
                value={action}
                onChange={(e) => setAction(e.target.value as Action)}
              >
                <option value="knit">knit</option>
                <option value="tuck">tuck</option>
                <option value="float">float</option>
              </select>
            </label>
            <label className="select-label">
              {key.mode === 2 ? 'YG1 bed' : 'Bed'}
              <select
                aria-label="New operation bed"
                value={bed}
                onChange={(e) => setBed(e.target.value as Bed)}
              >
                <option value="front">front</option>
                <option value="back">back</option>
              </select>
            </label>
            {key.mode === 2 ? (
              <label className="select-label">
                YG2 (other bed)
                <select
                  aria-label="New operation second guide"
                  value={action2}
                  onChange={(e) => setAction2(e.target.value as Action)}
                >
                  <option value="knit">knit</option>
                  <option value="tuck">tuck</option>
                  <option value="float">float</option>
                </select>
              </label>
            ) : (
              <label className="select-label">
                Then
                <select
                  aria-label="New operation transfer"
                  value={move}
                  onChange={(e) => setMove(e.target.value as Move)}
                >
                  <option value="none">nothing</option>
                  <option value="across">to the other bed</option>
                  <option value="left">left</option>
                  <option value="right">right</option>
                </select>
              </label>
            )}
            <label className="select-label">
              Colour
              <input
                type="color"
                aria-label="New operation colour"
                value={colour}
                onChange={(e) => setColour(e.target.value)}
              />
            </label>
          </div>
          <div className="inline-actions">
            <button
              type="button"
              disabled={key.ops.length >= MAX_KEY_OPS}
              onClick={() =>
                run(() => {
                  const name = meaningName(steps, newMove);
                  onChange(
                    replaceKey(s, {
                      ...key,
                      ops: [
                        ...key.ops,
                        {
                          id: `op-${crypto.randomUUID().slice(0, 8)}`,
                          name,
                          colour,
                          rgb: fromHex(colour),
                          steps,
                          move: newMove,
                        },
                      ],
                    })
                  );
                  return `Added ${name}.`;
                })
              }
            >
              Add {meaningName(steps, newMove)}
            </button>
            <button
              type="button"
              onClick={() =>
                run(() => {
                  const r = removeKey(s, key.id);
                  onChange(r.settings);
                  return `Removed the key ${key.name}.${reset(r.reset)}`;
                })
              }
            >
              Remove this key
            </button>
          </div>
        </>
      )}
      {message && (
        <p className="hint" role="status">
          {message}
        </p>
      )}
      <p className="hint">
        {count} of {MAX_CUSTOM_KEYS} custom keys; at most {MAX_KEY_OPS} operations per key.
      </p>
    </details>
  );
}

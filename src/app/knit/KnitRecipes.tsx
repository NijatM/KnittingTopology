import { useState } from 'react';
import type { KnitRecipe, KnitSettings, KnitZone, SurfaceSpec, Vec2 } from '../../core/types';
import type { KnitProgram } from '../../knit/program';
import { originalShapeUV, rotatedShapeUV } from '../../knit/shape-geometry';
import { nextZoneColour, nextZoneId, MAX_ZONES } from '../../knit/zones';
import { settingsKey } from '../../knit/keys';

interface Props {
  settings: KnitSettings;
  surface: SurfaceSpec;
  program: KnitProgram | null;
  outdated: boolean;
  onSettings: (settings: KnitSettings) => void;
  onMark: (cells: number[] | null) => void;
  onSelectZone?: (id: string | null) => void;
}
type Opening = Extract<KnitRecipe, { kind: 'pocket' }>['opening'];
const SIDES: { id: Opening; label: string }[] = [
  { id: 'left', label: 'Left / needle 1' },
  { id: 'right', label: 'Right / last needle' },
  { id: 'first-pass', label: 'First-pass side' },
  { id: 'last-pass', label: 'Last-pass side' },
];
const initial = {
  target: '',
  kind: 'channel' as 'channel' | 'pocket',
  axis: 'needles' as 'needles' | 'passes',
  opening: 'last-pass' as Opening,
  band: '1',
  x0: '0',
  x1: '100',
  y0: '30',
  y1: '70',
};

export default function KnitRecipes({
  settings: s,
  surface,
  program,
  outdated,
  onSettings,
  onMark,
  onSelectZone,
}: Props) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const zones = s.zones ?? [];
  const assignments = s.recipes ?? [];
  const supported = surface.kind === 'plane' && !s.patches;
  const result = program?.recipeResult;
  const choose = (id: string) => {
    const zone = zones.find((z) => z.id === id);
    const recipe = assignments.find((r) => r.zone === id);
    if (!zone) setDraft(initial);
    else {
      const pts = zone.shape.points.map((uv) => rotatedShapeUV(uv, s.startEdge ?? 'v0'));
      setDraft({
        ...initial,
        target: id,
        kind: zone.kind === 'pocket' ? 'pocket' : 'channel',
        axis: recipe?.kind === 'channel' ? recipe.axis : 'needles',
        opening: recipe?.kind === 'pocket' ? recipe.opening : 'last-pass',
        band: String(recipe?.joinBand ?? 1),
        x0: String(+(Math.min(...pts.map((p) => p[0])) * 100).toFixed(5)),
        x1: String(+(Math.max(...pts.map((p) => p[0])) * 100).toFixed(5)),
        y0: String(+(Math.min(...pts.map((p) => p[1])) * 100).toFixed(5)),
        y1: String(+(Math.max(...pts.map((p) => p[1])) * 100).toFixed(5)),
      });
    }
    setError('');
    setSaved('');
  };
  const save = () => {
    const bounds = [draft.x0, draft.y0, draft.x1, draft.y1];
    if (
      bounds.some((v) => v.trim() === '' || !Number.isFinite(Number(v)) || +v < 0 || +v > 100) ||
      +draft.x0 >= +draft.x1 ||
      +draft.y0 >= +draft.y1
    ) {
      setError('Enter increasing rectangle bounds from 0 to 100 percent.');
      return;
    }
    const band = Number(draft.band);
    if (!Number.isInteger(band) || band < 1 || band > 16) {
      setError('Join band must be 1 to 16 grid positions.');
      return;
    }
    if (!draft.target && zones.length >= MAX_ZONES) {
      setError(`At most ${MAX_ZONES} zones.`);
      return;
    }
    const old = zones.find((z) => z.id === draft.target);
    if (old?.shape.kind === 'stroke') {
      setError('A stroke cannot use this recipe. Create a rectangular region.');
      return;
    }
    const id = old?.id ?? nextZoneId(zones);
    const pts: Vec2[] = [
      [+draft.x0 / 100, +draft.y0 / 100],
      [+draft.x1 / 100, +draft.y0 / 100],
      [+draft.x1 / 100, +draft.y1 / 100],
      [+draft.x0 / 100, +draft.y1 / 100],
    ];
    const zone: KnitZone = {
      id,
      kind: draft.kind,
      name: old?.name || `${draft.kind} ${id}`,
      rgb: old?.rgb ?? nextZoneColour(zones, settingsKey(s)),
      shape: {
        kind: 'region',
        points: pts.map(([u, v]) => originalShapeUV(u, v, s.startEdge ?? 'v0')),
      },
    };
    const recipe: KnitRecipe =
      draft.kind === 'channel'
        ? { zone: id, kind: 'channel', axis: draft.axis, joinBand: band }
        : { zone: id, kind: 'pocket', opening: draft.opening, joinBand: band };
    onSettings({
      ...s,
      zones: old ? zones.map((z) => (z.id === id ? zone : z)) : [...zones, zone],
      recipes: [...assignments.filter((r) => r.zone !== id), recipe],
    });
    setDraft({ ...draft, target: id });
    onSelectZone?.(id);
    setError('');
    setSaved(`${id} saved. Generate the knit program to apply and check the recipe.`);
  };
  const setBoundary = () => {
    const next = { ...draft };
    if (draft.kind === 'channel') {
      if (draft.axis === 'needles') {
        next.x0 = '0';
        next.x1 = '100';
      } else {
        next.y0 = '0';
        next.y1 = '100';
      }
    } else {
      if (draft.opening === 'left') next.x0 = '0';
      if (draft.opening === 'right') next.x1 = '100';
      if (draft.opening === 'first-pass') next.y0 = '0';
      if (draft.opening === 'last-pass') next.y1 = '100';
    }
    setDraft(next);
    setSaved('');
  };
  return (
    <details className="knit-recipe-panel" aria-label="Channel and pocket recipes">
      <summary>Channel and pocket recipes</summary>
      <p className="hint">
        Optional guide-swap presets after Popescu (2019), §5.5, pp. 90–91, Figs. 5.26–5.27.
        Separate-layer body, join bands inside the zone, and access between layers at a panel
        boundary. These finite presets and checks are project constructions; they do not establish
        physical closure or usable channel dimensions.
      </p>
      {!supported && (
        <p className="knit-required-hint">
          Requires an unpatched plane. Curved, shaped and patched recipes are not supported in this
          increment.
        </p>
      )}
      {settingsKey(s).mode !== 2 && (
        <p className="knit-required-hint">
          Select a two-guide key. Both guides must knit on different beds at every base-program
          position.
        </p>
      )}
      <p className="hint">
        Saving writes the shown rectangle and recipe as one Undo step. Percentages refer to the
        current needle/pass frame, not measured dimensions.
      </p>
      <label className="select-label">
        Rectangle to edit
        <select
          aria-label="Recipe zone"
          value={zones.some((z) => z.id === draft.target) ? draft.target : ''}
          onChange={(e) => choose(e.target.value)}
        >
          <option value="">New rectangle</option>
          {zones
            .filter((z) => z.kind === 'channel' || z.kind === 'pocket')
            .map((z) => (
              <option key={z.id} value={z.id} disabled={z.shape.kind === 'stroke'}>
                {z.id} · {z.name || z.kind}
                {z.shape.kind === 'stroke' ? ' (stroke; unsupported)' : ''}
              </option>
            ))}
        </select>
      </label>
      <label className="select-label">
        Recipe
        <select
          aria-label="Feature recipe kind"
          value={draft.kind}
          onChange={(e) => setDraft({ ...draft, kind: e.target.value as typeof draft.kind })}
        >
          <option value="channel">Boundary-access channel</option>
          <option value="pocket">Boundary-mouth pocket</option>
        </select>
      </label>
      {draft.kind === 'channel' ? (
        <label className="select-label">
          Channel direction
          <select
            aria-label="Channel direction"
            value={draft.axis}
            onChange={(e) => setDraft({ ...draft, axis: e.target.value as typeof draft.axis })}
          >
            <option value="needles">Along needles / course direction</option>
            <option value="passes">Along passes / wale direction</option>
          </select>
        </label>
      ) : (
        <label className="select-label">
          Pocket mouth
          <select
            aria-label="Pocket mouth"
            value={draft.opening}
            onChange={(e) => setDraft({ ...draft, opening: e.target.value as Opening })}
          >
            {SIDES.map((side) => (
              <option key={side.id} value={side.id}>
                {side.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <button type="button" onClick={setBoundary}>
        Set access edges to panel boundary
      </button>
      <div className="boundary-counts knit-pair">
        {(
          [
            ['x0', 'Needle start (%)'],
            ['x1', 'Needle end (%)'],
            ['y0', 'Pass start (%)'],
            ['y1', 'Pass end (%)'],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              aria-label={label}
              inputMode="decimal"
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <label className="select-label">
        Join band (grid positions)
        <input
          aria-label="Recipe join band"
          type="number"
          min={1}
          max={16}
          step={1}
          value={draft.band}
          onChange={(e) => setDraft({ ...draft, band: e.target.value })}
        />
      </label>
      <p className="hint">
        The clear body needs at least two needles and two passes. Applied rectangles cannot overlap.
        No passes, cast-on or finishing operations are added.
      </p>
      <button type="button" disabled={!supported} onClick={save}>
        Save rectangle and recipe
      </button>
      {error && (
        <p className="knit-error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="knit-required-hint" role="status">
          {saved}
        </p>
      )}
      {assignments.map((r) => (
        <div key={r.zone} className="knit-recipe-assignment">
          <p>
            {r.zone} · {r.kind} · {r.kind === 'channel' ? r.axis : r.opening} · join band{' '}
            {r.joinBand}
          </p>
          <div className="inline-actions">
            <button
              type="button"
              onClick={() => {
                choose(r.zone);
                onSelectZone?.(r.zone);
              }}
            >
              Edit {r.zone} recipe
            </button>
            <button
              type="button"
              onClick={() => {
                const next = assignments.filter((x) => x.zone !== r.zone);
                const { recipes: _old, ...rest } = s;
                onSettings(next.length ? { ...rest, recipes: next } : rest);
                setSaved(
                  'Recipe removed; the feature zone is retained as intent. Regenerate the knit program.'
                );
              }}
            >
              Remove {r.zone} recipe
            </button>
          </div>
        </div>
      ))}
      {outdated && assignments.length > 0 && (
        <p className="knit-required-hint">
          Recipe settings changed. Generate the knit program to replace the previous preview and
          checks.
        </p>
      )}
      {!outdated && result && (
        <div aria-label="Recipe results">
          <p className={result.applied && !result.blockers.length ? 'hint' : 'knit-required-hint'}>
            {result.applied
              ? result.blockers.length
                ? 'Recipe sequence expanded; export is blocked by the findings below.'
                : 'Recipes applied; symbolic checks completed.'
              : 'Recipes not applied. Repair the requirements below and regenerate.'}
          </p>
          {result.blockers.length > 0 && (
            <ul className="knit-recipe-errors">
              {[...new Set(result.blockers)].slice(0, 24).map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          {result.patches.map((p) => (
            <div key={p.zone}>
              <h4>
                {p.zone} · {p.kind}
              </h4>
              <p className="hint">
                {p.body.length} body cells · {p.joins.length} join cells ·{' '}
                {p.access.map((a) => `${a.side}: ${a.cells.length} access cells`).join(' · ')}
              </p>
              <div className="inline-actions">
                <button type="button" onClick={() => onMark(p.body)}>
                  Show {p.zone} body
                </button>
                <button type="button" onClick={() => onMark(p.joins)}>
                  Show {p.zone} joins
                </button>
                <button type="button" onClick={() => onMark(p.access.flatMap((a) => a.cells))}>
                  Show {p.zone} access
                </button>
              </div>
              <p className="hint">
                Layer parents: {p.checks.parents ? 'consistent' : 'failed'} · body separation:{' '}
                {p.checks.separateBody ? 'checked' : 'failed'} · joins:{' '}
                {p.checks.joinedSides ? 'checked' : 'failed'} · access:{' '}
                {p.checks.openAccess ? 'checked' : 'failed'}
              </p>
            </div>
          ))}
        </div>
      )}
      <p className="hint">
        Use “Recipe regions” in the bitmap’s Colour by menu to inspect the body, joins and access.
        Operation exports still use the exact key colours.
      </p>
    </details>
  );
}

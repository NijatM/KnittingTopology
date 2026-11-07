// Knit part of a Compare card: the program captured with the variant, and its cell difference from variant 1.
import { cellDifference, inputsDiffer, type KnitSnapshot } from '../../knit/compare';
import KnitThumb from './KnitThumb';

const MODES = { shape: 'Shape only', network: 'Network only', both: 'Shape and network' } as const;

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function KnitVariant({
  knit,
  index,
  base,
}: {
  /** The captured program, or why none was captured. */
  knit: KnitSnapshot | string;
  index: number;
  /** Variant 1's knit capture. */
  base: KnitSnapshot | string | null | undefined;
}) {
  if (typeof knit === 'string')
    return (
      <div className="variant-knit">
        <span className="eyebrow">KNIT PROGRAM</span>
        <p>{knit}</p>
      </div>
    );
  const diff = index > 0 && base && typeof base !== 'string' ? cellDifference(base, knit) : null;
  return (
    <div className="variant-knit">
      <span className="eyebrow">KNIT PROGRAM</span>
      <p>
        {MODES[knit.mode]} · {knit.key.name}
        {knit.custom ? ' (custom)' : ''}
      </p>
      <KnitThumb
        snapshot={knit}
        label={`Variant ${index + 1} knit program, ${knit.w} needles by ${knit.h} passes`}
      />
      <Row label="Needles × passes" value={`${knit.w} × ${knit.h}`} />
      <Row
        label="Transfers"
        value={`${knit.transfers}${knit.skippedTransfers ? ` (+${knit.skippedTransfers} skipped)` : ''}`}
      />
      <Row label="Check findings" value={knit.findings} />
      <Row label="Export blockers" value={knit.blockers} />
      <Row label="Unresolved shaping" value={knit.unresolved} />
      <ul className="variant-structures">
        {knit.structures.map((s) => (
          <li key={s.name}>
            {s.name}: {s.loops.toLocaleString()} loops · {s.gauge}
          </li>
        ))}
      </ul>
      {index > 0 && (
        <p className="variant-diff">
          {!base || typeof base === 'string'
            ? 'Variant 1 has no knit program to compare with.'
            : diff
              ? `${diff.differ.toLocaleString()} of ${diff.total.toLocaleString()} cells differ in operation meaning from variant 1 (${((100 * diff.differ) / diff.total).toFixed(1)} %).`
              : 'Different needles × passes from variant 1, not compared cell by cell.'}
        </p>
      )}
    </div>
  );
}

/** Note under the cards when at least two knit programs were captured. */
export function knitCompareNote(knits: (KnitSnapshot | string | null | undefined)[]): string {
  const programs = knits.filter((k): k is KnitSnapshot => !!k && typeof k !== 'string');
  if (programs.length < 2) return '';
  return programs.some((k) => inputsDiffer(programs[0]!, k))
    ? 'These knit programs use different surfaces, networks or measurements. Their differences do not isolate the knit settings.'
    : 'These knit programs share surface, network and measurements. Operation meanings are compared, not key colours.';
}

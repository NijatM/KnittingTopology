// Operation sequence (Popescu 2019, §6.4.1, pp. 113–114): the counts, the executor's findings and the sequence JSON.
import { download } from '../../adapters/export';
import type { KnitProgram } from '../../knit/program';
import { programSequence, sequenceJson } from '../../knit/sequence';

interface Props {
  program: KnitProgram;
  file: string;
  /** Label of the piece shown, with patches. */
  piece: string | null;
  onMark: (cells: number[] | null) => void;
}

export default function KnitSequence({ program, file, piece, onMark }: Props) {
  const run = program.sequence;
  if (!run) return null;
  const c = run.counts;
  return (
    <section aria-label="Operation sequence">
      <h3 className="knit-heading">Operation sequence</h3>
      <p className="hint">
        The program as carriage passes of symbols, machine-neutral (Popescu 2019, §6.4.1, pp.
        113–114), followed symbolically with each pass&apos;s yarn-fed steps before its yarn-free
        steps (project convention). Not a machine simulation. Converted from the class-key bitmap;
        converting back gives the same cells.
      </p>
      <p className="hint" aria-label="Sequence counts">
        {program.h} passes · {c.symbols} symbols in use · {c.knits} knits · {c.tucks} tucks ·{' '}
        {c.transfers} transfers · {c.moves} same-bed moves · {c.drops} drops ·{' '}
        {c.racked ? `${c.racked} passes need a racking other than 0` : 'racking 0 in every pass'}
      </p>
      {run.findings.length === 0 && <p className="hint">No findings.</p>}
      {run.findings.map((f) => (
        <details className={`diagnostic ${f.blocking ? 'error' : 'warning'}`} key={f.id}>
          <summary>
            {f.blocking ? 'Blocks export: ' : ''}
            {f.title} <small>{f.cells.length} cells</small>
          </summary>
          <p>{f.text}</p>
          <button type="button" onClick={() => onMark(f.cells)}>
            Show in the program
          </button>
        </details>
      ))}
      <div className="inline-actions">
        <button
          type="button"
          onClick={() =>
            download(
              sequenceJson(programSequence(program), run, {
                key: program.key,
                piece,
                blockers: program.exportBlockers,
              }),
              `${file}-sequence.json`,
              'application/json'
            )
          }
        >
          Operation sequence JSON
        </button>
      </div>
      <p className="hint">
        The sequence JSON lists the symbols, the passes, the findings and the blockers. It can be
        downloaded while export is blocked; it is not a machine file.
        {piece ? ` It shows the piece ${piece}.` : ''}
      </p>
    </section>
  );
}

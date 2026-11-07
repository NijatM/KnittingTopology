import { useEffect, useId, useRef } from 'react';
import type { KnitRequirement, KnitRequirementId } from '../../knit/requirements';

export default function KnitFeedback({
  requirements,
  error,
  attempts,
  allowTyped,
  onRepair,
  onTyped,
}: {
  requirements: KnitRequirement[];
  error: string;
  attempts: number;
  allowTyped: boolean;
  onRepair: (id: KnitRequirementId | 'settings') => void;
  onTyped: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef('');
  const id = useId();
  const blocked = requirements.length > 0;
  useEffect(() => {
    const key = `${attempts}:${error}`;
    if (!attempts || seen.current === key) return;
    seen.current = key;
    if (!blocked && !error) return;
    ref.current?.focus();
    ref.current?.scrollIntoView({ block: 'nearest' });
  }, [attempts, error, blocked]);
  if (!blocked && !error) return null;
  return (
    <div
      ref={ref}
      id="knit-generation-feedback"
      role="region"
      aria-label={blocked ? 'Knit generation requirements' : 'Knit generation failure'}
      aria-describedby={`${id}-description`}
      tabIndex={-1}
      className={`knit-feedback ${blocked ? 'missing' : 'failure'}`}
    >
      <h3>
        <span aria-hidden="true">!</span>{' '}
        {blocked
          ? attempts
            ? 'Cannot generate yet'
            : 'Requirements missing'
          : 'Generation failed'}
      </h3>
      {blocked ? (
        <>
          <ul id={`${id}-description`}>
            {requirements.map((r) => (
              <li key={r.id}>
                <p>{r.message}</p>
                <button type="button" onClick={() => onRepair(r.id)}>
                  {r.action}
                </button>
              </li>
            ))}
          </ul>
          {allowTyped && requirements.some((r) => r.id === 'measurement') && (
            <div className="knit-repair-alternative">
              <p>For an unmeasured network bitmap, you can choose a pixel size instead.</p>
              <button type="button" onClick={onTyped}>
                Use typed needles × passes
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <p id={`${id}-description`}>{error}</p>
          <button type="button" onClick={() => onRepair('settings')}>
            Review knit settings →
          </button>
        </>
      )}
    </div>
  );
}

// Small bitmap of a captured knit program: one canvas pixel per cell in the key's exact RGB, scaled without smoothing.
import { useEffect, useRef } from 'react';
import type { KnitSnapshot } from '../../knit/compare';

export default function KnitThumb({ snapshot, label }: { snapshot: KnitSnapshot; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const data = ctx.createImageData(snapshot.w, snapshot.h);
    snapshot.cells.forEach((v, i) => {
      const rgb = snapshot.key.ops[v]?.rgb ?? [255, 0, 255];
      data.data.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
    });
    ctx.putImageData(data, 0, 0);
  }, [snapshot]);
  return (
    <canvas
      ref={canvas}
      className="knit-thumb"
      width={snapshot.w}
      height={snapshot.h}
      role="img"
      aria-label={label}
      style={{ aspectRatio: `${snapshot.w} / ${snapshot.h}` }}
    />
  );
}

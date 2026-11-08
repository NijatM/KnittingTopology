// The knit program as a bitmap: one square per needle and pass, exact key colours, pass 1 at the bottom.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KnitProgram } from '../../knit/program';

interface Props {
  program: KnitProgram | null;
  reason: string;
  /** Loops to outline (the selected network element). */
  marks: Uint8Array | null;
  hover: number | null;
  onHover: (index: number | null) => void;
  onPick: (index: number) => void;
  /** Feature zones: per cell the zone on top (or -1) and each zone's colour, as in the marked BMP. */
  zones?: { top: Int16Array; rgb: readonly (readonly number[])[] } | null;
}

const LEFT = 38,
  BOTTOM = 20,
  PAD = 10;

function layout(p: KnitProgram, width: number, height: number) {
  const c = Math.max(
    0.05,
    Math.min((width - LEFT - PAD) / p.w, (height - BOTTOM - PAD - 18) / p.h)
  );
  const x0 = LEFT + Math.max(0, (width - LEFT - PAD - c * p.w) / 2),
    y0 = 18 + Math.max(0, (height - BOTTOM - PAD - 18 - c * p.h) / 2);
  return { c, x0, y0 };
}

const labelStep = (c: number) => [1, 5, 10, 20, 50, 100].find((s) => s * c >= 26) ?? 100;
/** Display only: loop roles from the saved loop stage; held or unused needles stay dark. */
const ROLE_RGB: Record<string, [number, number, number]> = {
  loop: [128, 128, 128],
  'short-row': [88, 166, 255],
  increase: [97, 199, 137],
  decrease: [226, 191, 98],
};

function roleColours(p: KnitProgram): Uint8Array | null {
  const loops = p.shape?.knitGraph?.stages.loops?.loops;
  if (!p.shape || !loops) return null;
  const role = new Map(loops.map((l) => [l.id, l.role]));
  const out = new Uint8Array(p.w * p.h * 3).fill(28);
  p.shape.placementAt.forEach((k, i) => {
    if (k < 0) return;
    const rgb = ROLE_RGB[role.get(p.shape!.needles.placements[k]!.loop.id) ?? 'loop']!;
    out.set(rgb, i * 3);
  });
  return out;
}

export default function KnitBitmap({
  program,
  reason,
  marks,
  hover,
  onHover,
  onPick,
  zones,
}: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useRef({ width: 0, height: 0 });
  const image = useRef<HTMLCanvasElement | null>(null);
  const markImage = useRef<HTMLCanvasElement | null>(null);
  const redraw = useRef<() => void>(() => {});
  const [colourBy, setColourBy] = useState<'operation' | 'role' | 'zones'>('operation');
  const roles = useMemo(() => (program ? roleColours(program) : null), [program]);
  const byRole = colourBy === 'role' && !!roles;
  const byZone =
    colourBy === 'zones' && !!zones && zones.top.length === (program?.cells.length ?? -1);

  // one pixel per loop, rebuilt when the program or the colouring changes
  useEffect(() => {
    if (!program) {
      image.current = null;
      return;
    }
    const off = document.createElement('canvas');
    off.width = program.w;
    off.height = program.h;
    const ctx = off.getContext('2d')!;
    const data = ctx.createImageData(program.w, program.h);
    program.cells.forEach((v, i) => {
      const rgb = byRole
        ? roles!.subarray(i * 3, i * 3 + 3)
        : byZone && zones!.top[i]! >= 0
          ? zones!.rgb[zones!.top[i]!]!
          : (program.key.ops[v]?.rgb ?? [255, 0, 255]);
      data.data.set([rgb[0]!, rgb[1]!, rgb[2]!, 255], i * 4);
    });
    ctx.putImageData(data, 0, 0);
    image.current = off;
    redraw.current();
  }, [program, byRole, roles, byZone, zones]);

  useEffect(() => {
    if (!program || !marks) {
      markImage.current = null;
      redraw.current();
      return;
    }
    const off = document.createElement('canvas');
    off.width = program.w;
    off.height = program.h;
    const ctx = off.getContext('2d')!;
    const data = ctx.createImageData(program.w, program.h);
    marks.forEach((m, i) => {
      if (m) data.data.set([255, 255, 255, 150], i * 4);
    });
    ctx.putImageData(data, 0, 0);
    markImage.current = off;
    redraw.current();
  }, [program, marks]);

  redraw.current = () => {
    const el = canvas.current;
    if (!el) return;
    const { width, height } = size.current;
    const dpr = window.devicePixelRatio || 1;
    const ctx = el.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!program || !image.current) return;
    const { c, x0, y0 } = layout(program, width, height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image.current, x0, y0, c * program.w, c * program.h);
    if (markImage.current) ctx.drawImage(markImage.current, x0, y0, c * program.w, c * program.h);
    if (c >= 6) {
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let j = 0; j <= program.w; j++) {
        ctx.moveTo(Math.round(x0 + j * c) + 0.5, y0);
        ctx.lineTo(Math.round(x0 + j * c) + 0.5, y0 + c * program.h);
      }
      for (let k = 0; k <= program.h; k++) {
        ctx.moveTo(x0, Math.round(y0 + k * c) + 0.5);
        ctx.lineTo(x0 + c * program.w, Math.round(y0 + k * c) + 0.5);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = '#3a3a3a';
    ctx.strokeRect(x0 - 0.5, y0 - 0.5, c * program.w + 1, c * program.h + 1);
    // pass numbers (pass 1 at the bottom) and needle numbers (needle 1 on the left)
    ctx.fillStyle = '#858585';
    ctx.font = '9px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    const step = labelStep(c);
    for (let pass = 1; pass <= program.h; pass++)
      if (pass === 1 || pass % step === 0)
        ctx.fillText(String(pass), x0 - 6, y0 + (program.h - pass + 0.5) * c);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let needle = 1; needle <= program.w; needle++)
      if (needle === 1 || needle % step === 0)
        ctx.fillText(String(needle), x0 + (needle - 0.5) * c, y0 + program.h * c + 5);
    ctx.textAlign = 'left';
    ctx.fillText(
      `${program.w} needles × ${program.h} passes · pass 1 ${program.firstDir === 1 ? '→' : '←'}`,
      x0,
      2
    );
    if (hover !== null && hover >= 0 && hover < program.w * program.h) {
      const j = hover % program.w,
        y = Math.floor(hover / program.w);
      ctx.strokeStyle = '#f4f4f4';
      ctx.lineWidth = Math.max(1, Math.min(2, c / 4));
      ctx.strokeRect(x0 + j * c, y0 + y * c, c, c);
    }
  };

  useEffect(() => {
    const el = wrap.current,
      cv = canvas.current;
    if (!el || !cv) return;
    const resize = () => {
      const r = el.getBoundingClientRect(),
        dpr = window.devicePixelRatio || 1;
      size.current = { width: r.width, height: r.height };
      cv.width = Math.max(1, Math.round(r.width * dpr));
      cv.height = Math.max(1, Math.round(r.height * dpr));
      cv.style.width = `${r.width}px`;
      cv.style.height = `${r.height}px`;
      redraw.current();
    };
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(resize);
    });
    observer.observe(el);
    resize();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => redraw.current(), [hover, program]);

  const indexAt = (e: React.PointerEvent | React.MouseEvent): number | null => {
    if (!program || !canvas.current) return null;
    const r = canvas.current.getBoundingClientRect();
    const { c, x0, y0 } = layout(program, size.current.width, size.current.height);
    const j = Math.floor((e.clientX - r.left - x0) / c),
      y = Math.floor((e.clientY - r.top - y0) / c);
    return j >= 0 && j < program.w && y >= 0 && y < program.h ? y * program.w + j : null;
  };

  return (
    <div className="knit-bitmap" ref={wrap}>
      <canvas
        ref={canvas}
        role="img"
        aria-label={
          program
            ? `Knit program bitmap, ${program.w} needles by ${program.h} passes`
            : 'Knit program unavailable'
        }
        onPointerMove={(e) => onHover(indexAt(e))}
        onPointerLeave={() => onHover(null)}
        onClick={(e) => {
          const i = indexAt(e);
          if (i !== null) onPick(i);
        }}
      />
      {(roles || zones) && (
        <label className="knit-bitmap-colour">
          Colour by
          <select
            aria-label="Bitmap colour by"
            value={colourBy}
            onChange={(e) => setColourBy(e.target.value as 'operation' | 'role' | 'zones')}
          >
            <option value="operation">Operation</option>
            {roles && <option value="role">Loop role</option>}
            {zones && <option value="zones">Feature zones</option>}
          </select>
          {byZone && (
            <span className="knit-bitmap-legend">
              zone cells in zone colours, as in the marked BMP; other cells by operation
            </span>
          )}
          {byRole && (
            <span className="knit-bitmap-legend">
              grey loop · blue short-row end · green increase · gold decrease · dark held/unused
            </span>
          )}
        </label>
      )}
      {!program && (
        <p className="knit-bitmap-empty" role="status">
          {reason}
        </p>
      )}
    </div>
  );
}

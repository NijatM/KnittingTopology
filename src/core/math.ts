import type { Vec3 } from './types';
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: Vec3) => Math.hypot(...a);
export const unit = (a: Vec3): Vec3 => mul(a, 1 / (norm(a) || 1));
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(mul(a, 1 - t), mul(b, t));
export const mean = (a: Vec3[]): Vec3 => mul(a.reduce(add, [0, 0, 0]), 1 / a.length);
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const finite3 = (a: unknown): a is Vec3 =>
  Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
export function areaVector(points: Vec3[]): Vec3 {
  let s: Vec3 = [0, 0, 0];
  for (let i = 0; i < points.length; i++)
    s = add(s, cross(points[i]!, points[(i + 1) % points.length]!));
  return mul(s, 0.5);
}

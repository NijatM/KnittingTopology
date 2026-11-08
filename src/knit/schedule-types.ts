// Complete logical schedule analysis; source passes and inserted phases have distinct identities.
import type { GenerationContext } from '../core/types';
import type { Bed } from './keys';
import type { KnitSequence } from './sequence';
import type { TransitionSource } from './transition-plan';
import type { PlanLimits, TransferSearchResult } from './transfer-planner';
import type { LogicalLayer, TransferPhase, TransferSlot } from './transfer-phases';

/** All pass/needle/event indices in core APIs are zero-based. Artifact conversion owns one-based indices. */
export interface ScheduleReference {
  id: string;
  source: string;
  layer: LogicalLayer;
  bed: Bed;
  pass: number;
  needle: number;
  parents: string[];
}
export interface ScheduleIssue {
  message: string;
  pass: number | null;
  needle?: number;
  bed?: Bed;
  event?: number;
  expected?: string[];
  actual?: string[];
}
export interface PreparedSchedule {
  status: 'ready' | 'invalid' | 'unsupported';
  issues: ScheduleIssue[];
  width: number;
  height: number;
  sequence: KnitSequence | null;
  reference: ScheduleReference[];
  byPass: ScheduleReference[][];
  /** Key `${pass}:${bed}:${needle}`. Derived indices; never serialized as a Map. */
  byCell: Map<string, ScheduleReference>;
}
export type ScheduleEvent =
  | { kind: 'source-pass'; pass: number }
  | { kind: 'transfer-phase'; beforePass: number; phase: TransferPhase };
export interface SchedulePassRun {
  ok: boolean;
  final: TransferSlot[];
  issues: ScheduleIssue[];
  matchedParents: number;
}
export interface ScheduleValidation {
  ok: boolean;
  complete: boolean;
  checkedEvents: number;
  completedPasses: number;
  matchedParents: number;
  final: TransferSlot[];
  issues: ScheduleIssue[];
}
export interface ScheduleLimits {
  perTransition: PlanLimits;
  maxTotalMoves: number;
  maxAddedPhases: number;
}
export type ScheduleLimitInput = Partial<Omit<ScheduleLimits, 'perTransition'>> & {
  perTransition?: Partial<PlanLimits>;
};
export interface ScheduleTransition {
  beforePass: number;
  status: TransferSearchResult['status'] | 'unsupported';
  reason: string;
  proof?: string;
  phases: number;
  heldLoops: number;
  effectiveLimits: PlanLimits;
  stats: TransferSearchResult['stats'];
}
export interface ShapingSchedule {
  status: 'complete' | 'unreachable' | 'limit' | 'invalid' | 'unsupported';
  complete: boolean;
  source: {
    signature: string;
    surfaceRevision: string;
    referenceMethod: string;
    programBlockers: string[];
  };
  width: number;
  height: number;
  canonical: KnitSequence | null;
  reference: ScheduleReference[];
  events: ScheduleEvent[];
  transitions: ScheduleTransition[];
  limits: ScheduleLimits;
  stop: ScheduleIssue | null;
  validation: ScheduleValidation;
  stats: {
    testedMoves: number;
    retainedStates: number;
    expandedStates: number;
    addedPhases: number;
  };
}
export type ScheduleContext = GenerationContext;
export type ScheduleSource = TransitionSource;

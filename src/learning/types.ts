import type { PatternFamily, PatternParameters, AnalyticSurfaceKind } from '../core/types';

export type ReferenceId =
  | 'takayama2014'
  | 'oval2018'
  | 'hart'
  | 'lipman2014'
  | 'popescu2019knitcrete'
  | 'popescu2018automated';
export interface ScientificReference {
  id: ReferenceId;
  type: 'article-journal' | 'paper-conference' | 'webpage' | 'thesis' | 'chapter';
  title: string;
  authors: { given: string; family: string }[];
  year?: number;
  containerTitle?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  school?: string;
  thesisNumber?: string;
  note?: string;
  doi?: string;
  url: string;
  pdfUrl?: string;
  proceedingsUrl?: string;
  interactiveUrl?: string;
  accessed: string;
  verificationNote: string;
}
export type LessonId =
  | PatternFamily
  | 'patch-quadrangulation'
  | 'coarse-topology'
  | 'guides'
  | 'preset-regular'
  | 'preset-inset'
  | 'preset-alternating'
  | 'preset-radial';
export interface SourceUse {
  id: ReferenceId;
  locator: string;
  relationship: string;
}
export interface LearningExample {
  name: string;
  surface: AnalyticSurfaceKind;
  size: number;
  parameters: Partial<PatternParameters>;
  addDirectionGuide?: boolean;
}
export interface MethodLesson {
  id: LessonId;
  title: string;
  group: 'construction' | 'presets' | 'patterns' | 'guidance';
  status: 'paper-inspired subset' | 'adapted operator' | 'project template' | 'project heuristic';
  summary: string;
  changes: string[];
  steps: string[];
  assumptions: string[];
  limitations: string[];
  experiment: {
    title: string;
    example: LearningExample;
    instructions: string[];
    expected: string;
  };
  references: SourceUse[];
  /** Suggested wording is deliberately qualified by implementation status. */
  wording: string;
}

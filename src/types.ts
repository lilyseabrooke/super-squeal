import type { SqlValue } from 'sql.js';

export interface ResultSet {
  columns: string[];
  rows: SqlValue[][];
}

export interface SystemEvent {
  sql: string;
  params: SqlValue[];
}

export interface Stats {
  queries: number;
  harvested: number;
  sold: number;
  fed: number;
  /** Coins earned from selling. */
  earned: number;
  harvestedBy: Record<string, number>;
  soldBy: Record<string, number>;
}

export interface Progress {
  version: 1;
  questIndex: number;
  /** Id of the quest whose onStart has already run. */
  questStarted: string | null;
  /** Day and stats when the current quest began, for "since this quest started" goals. */
  questStart: { day: number; stats: Stats };
  xp: number;
  discovered: string[];
  met: string[];
  badges: string[];
  hintLevel: Record<string, number>;
  stats: Stats;
  streak: { count: number; last: string };
  quill: boolean;
  /** System changes made today, replayed after a rewind. */
  replayToday: SystemEvent[];
}

export interface NightReport {
  day: number;
  lines: string[];
}

/** What quests can see and do. Implemented by Game. */
export interface QuestApi {
  readonly day: number;
  readonly progress: Progress;
  scalar(sql: string, params?: SqlValue[]): SqlValue;
  system(sql: string, params?: SqlValue[]): void;
  meet(name: string): void;
}

interface QuestBase {
  id: string;
  chapter: number;
  title: string;
  /** What Keystone says. Supports `code` and **bold**. */
  story: string;
  task: string;
  concept?: { title: string; body: string; example?: string };
  hints: { nudge: string; blank: string; answer?: string };
  reward: { coins: number; xp: number };
  discovers?: string[];
  /** Runs once when the quest becomes current. Returns an announcement, if any. */
  onStart?: (api: QuestApi) => string | void;
}

export interface QueryQuest extends QuestBase {
  kind: 'query';
  expected: string;
  ordered?: boolean;
  mustInclude?: { pattern: RegExp; message: string }[];
}

export interface ActionQuest extends QuestBase {
  kind: 'action';
  check: (api: QuestApi) => boolean;
}

export interface AnswerQuest extends QuestBase {
  kind: 'answer';
  choices: string[];
  correct: number;
}

export interface Goal {
  label: string;
  progress: (api: QuestApi) => { have: number; need: number };
}

/** Free play: a broad objective, reached however the player likes. */
export interface GoalQuest extends QuestBase {
  kind: 'goal';
  goals: Goal[];
}

/** A question answered by typing a value the player found with their own query. */
export interface ReportQuest extends QuestBase {
  kind: 'report';
  question: string;
  /** Internal SQL. Any value in its first column is an accepted answer. */
  expected: string;
}

export type Quest = QueryQuest | ActionQuest | AnswerQuest | GoalQuest | ReportQuest;

export interface Chapter {
  /** Lesson chapters are whole numbers; free-play interludes sit between them (4.5, 5.5…). */
  n: number;
  title: string;
  concept: string;
  free?: boolean;
}

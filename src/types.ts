import type { SqlValue } from 'sql.js';

export interface ResultSet {
  columns: string[];
  rows: SqlValue[][];
}

export interface SystemEvent {
  sql: string;
  params: SqlValue[];
}

export interface Progress {
  version: 1;
  questIndex: number;
  /** Id of the quest whose onStart has already run. */
  questStarted: string | null;
  questStart: { day: number; sold: number; harvested: number };
  xp: number;
  discovered: string[];
  met: string[];
  badges: string[];
  hintLevel: Record<string, number>;
  stats: { queries: number; harvested: number; sold: number; fed: number };
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

export type Quest = QueryQuest | ActionQuest | AnswerQuest;

export interface Chapter {
  n: number;
  title: string;
  concept: string;
}

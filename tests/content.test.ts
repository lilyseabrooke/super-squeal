import { describe, expect, it } from 'vitest';
import { QUESTS } from '../src/data/quests';
import { BLANKS_MESSAGE, isSqlTemplate, sameQuery, tablesIn } from '../src/sqlHelp';
import type { Quest } from '../src/types';
import { newGame, solveCurrent } from './helpers';

/**
 * These tests play the game the way a beginner does: at every quest they run the
 * SQL the game itself shows (spell-card examples, fill-in-the-blank templates,
 * hint queries) and check that the game's response actually helps.
 */

/** Complete queries quoted in hint text (a fragment like `SELECT *`, or a sketch with "…" in it, isn't one). */
const codeSpans = (text: string) =>
  [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]).filter((c) => /^(SELECT|WITH)\s.+\bFROM\b/i.test(c) && !c.includes('…'));

/** Turns "SELECT ___ FROM ___;" into a regex that matches any way of filling the blanks. */
function templateRegex(template: string): RegExp {
  const norm = template.replace(/;\s*$/, '').trim();
  const parts = norm.split('___').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
  return new RegExp('^' + parts.join('(.+?)') + '$', 'i');
}

async function walk(visit: (q: Quest, g: Awaited<ReturnType<typeof newGame>>) => void) {
  const g = await newGame();
  while (g.currentQuest()) {
    const q = g.currentQuest()!;
    visit(q, g);
    expect(g.currentQuest()?.id, `probing ${q.id} must not complete it`).toBe(q.id);
    solveCurrent(g);
  }
}

describe('what a beginner sees', () => {
  it('every spell-card example runs, and is rejected with a message saying it is only an example', async () => {
    const problems: string[] = [];
    await walk((q, g) => {
      if (q.kind !== 'query' || !q.concept?.example) return;
      const out = g.runPlayerQuery(q.concept.example);
      if (out.error) problems.push(`${q.id}: example errors: ${out.error}`);
      else if (out.feedback?.ok) problems.push(`${q.id}: example is accepted as the answer`);
      else if (!/example from the spell card/.test(out.feedback?.message ?? '')) problems.push(`${q.id}: unhelpful feedback: ${out.feedback?.message}`);
    });
    expect(problems).toEqual([]);
  });

  it('running a fill-in-the-blank template unchanged explains the blanks', async () => {
    const problems: string[] = [];
    await walk((q, g) => {
      if (!isSqlTemplate(q.hints.blank)) return;
      const out = g.runPlayerQuery(q.hints.blank);
      if (out.error !== BLANKS_MESSAGE) problems.push(`${q.id}: got ${out.error ?? out.feedback?.message}`);
    });
    expect(problems).toEqual([]);
  });

  it('every query template can be filled in to give exactly the expected answer', () => {
    const problems: string[] = [];
    for (const q of QUESTS) {
      if (q.kind !== 'query') continue;
      if (!isSqlTemplate(q.hints.blank)) problems.push(`${q.id}: blank hint is not a SQL template`);
      else if (!templateRegex(q.hints.blank).test(q.expected.trim())) problems.push(`${q.id}: "${q.hints.blank}" can't become "${q.expected}"`);
    }
    expect(problems).toEqual([]);
  });

  it('only real SQL is treated as a template', () => {
    for (const q of QUESTS) {
      // Action quests are done with buttons, except Quill quests, whose templates are writes.
      if (q.kind === 'action' && isSqlTemplate(q.hints.blank)) expect(q.hints.blank, q.id).toMatch(/^(INSERT|UPDATE|DELETE)\s/);
    }
    expect(isSqlTemplate('With a plot selected, press Plant')).toBe(false);
    expect(isSqlTemplate('SELECT * FROM ___;')).toBe(true);
    expect(isSqlTemplate('UPDATE creatures SET hunger = ___;')).toBe(true);
    expect(isSqlTemplate('Update the plots please')).toBe(false);
  });

  it('every SQL snippet shown in hints and answer explanations runs without errors', async () => {
    const problems: string[] = [];
    await walk((q, g) => {
      const texts = [q.hints.nudge, q.hints.answer ?? '', q.story, q.task].filter((t) => !t.includes('___'));
      for (const sql of texts.flatMap(codeSpans)) {
        const out = g.runPlayerQuery(sql);
        if (out.error) problems.push(`${q.id}: \`${sql}\` → ${out.error}`);
      }
    });
    expect(problems).toEqual([]);
  });

  it("a quest's column used on the wrong table names the table it belongs to", async () => {
    const g = await newGame();
    const msg = g.runPlayerQuery('SELECT * FROM plots WHERE hunger > 5').error ?? '';
    expect(msg).toMatch(/lives in the `creatures` table/);
  });

  it('spell-card examples use a different table from the answer, so they never give it away', () => {
    for (const q of QUESTS) {
      if (q.kind !== 'query' || !q.concept?.example) continue;
      const answerTables = tablesIn(q.expected);
      for (const t of tablesIn(q.concept.example)) expect(answerTables, `${q.id} example uses ${t}`).not.toContain(t);
    }
  });

  it('= NULL gets an explanation of IS NULL', async () => {
    const g = await newGame();
    while (g.currentQuest()?.id !== 'c6-isnull') solveCurrent(g);
    expect(g.runPlayerQuery('SELECT * FROM farm_log WHERE source = NULL').feedback?.message).toMatch(/IS NULL/);
  });

  it('the right idea on the wrong table says which table the quest wants', async () => {
    const problems: string[] = [];
    await walk((q, g) => {
      if (q.kind !== 'query') return;
      const m = /\bFROM\s+(\w+)/i.exec(q.expected)!;
      const wrong = m[1] === 'plots' ? 'creatures' : 'plots';
      const sql = `SELECT * FROM ${wrong}`;
      if (q.concept?.example && sameQuery(sql, q.concept.example)) return;
      const msg = g.runPlayerQuery(sql).feedback?.message ?? '';
      if (!msg.includes(`\`${m[1]}\` table`)) problems.push(`${q.id}: ${msg}`);
    });
    expect(problems).toEqual([]);
  });
});

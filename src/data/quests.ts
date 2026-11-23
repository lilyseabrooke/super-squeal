import type { Chapter, Quest, QuestApi, Stats } from '../types';
import { SPECIES } from './creatures';
import { fieldName } from './schema';

export const CHAPTERS: Chapter[] = [
  { n: 1, title: 'Welcome to Bramblewick Hollow', concept: 'SELECT' },
  { n: 2, title: 'Finding What You Need', concept: 'WHERE' },
  { n: 3, title: 'Everything In Its Place', concept: 'ORDER BY & LIMIT' },
  { n: 4, title: 'The Cold Snap', concept: 'COUNT, SUM, AVG & MAX' },
  { n: 4.5, title: 'The Autumn Fair', concept: 'Free play', free: true },
  { n: 5, title: 'Puddles and Patterns', concept: 'GROUP BY & HAVING' },
  { n: 5.5, title: 'The Dry Spell', concept: 'Free play', free: true },
  { n: 6, title: 'Things That Go Missing', concept: 'NULL & DISTINCT' },
  { n: 6.5, title: 'The Ledger Audit', concept: 'Free play', free: true },
  { n: 7, title: 'The Ledger Quill', concept: 'UPDATE, INSERT & DELETE' },
  { n: 7.5, title: 'The Big Farm', concept: 'Free play', free: true },
  { n: 8, title: 'Making Connections', concept: 'JOIN' },
  { n: 8.5, title: 'Lantern Night', concept: 'Free play', free: true },
  { n: 9, title: 'Land and Plenty', concept: 'Subqueries & CTEs' },
  { n: 9.5, title: 'The Land Rush', concept: 'Free play', free: true },
  { n: 10, title: 'The Long View', concept: 'Window functions' },
  { n: 10.5, title: 'Record Season', concept: 'Free play', free: true },
];

function arrive(api: QuestApi, name: string, plot: number, hunger: number, mood: number): string {
  const s = SPECIES[name];
  api.system('INSERT INTO creatures (name, kind, emoji, plot_id, hunger, mood) VALUES (?, ?, ?, ?, ?, ?)', [
    name,
    s.kind,
    s.emoji,
    plot,
    hunger,
    mood,
  ]);
  api.meet(name);
  return `${s.emoji} ${name} has arrived on plot ${plot}!`;
}

const endedDay = (api: QuestApi) => api.day > api.progress.questStart.day;
const hungerOf = (api: QuestApi, name: string) => Number(api.scalar('SELECT hunger FROM creatures WHERE name = ?', [name]) ?? 99);

const where = { pattern: /\bwhere\b/i, message: 'Use `WHERE` to filter the rows for this one.' };
const join = { pattern: /\bjoin\b/i, message: 'Use `JOIN … ON` to connect the two tables.' };
const subquery = { pattern: /\(\s*select\b/i, message: 'Put a whole `SELECT` inside brackets: that’s a subquery.' };
const over = { pattern: /\bover\s*\(/i, message: 'Use a window function, with `OVER ( … )`, for this one.' };
/** Daily coins from selling, the history most of chapter 10 looks across. */
const DAILY = "WITH daily AS (SELECT day, SUM(total) AS earned FROM orders WHERE action = 'sell' GROUP BY day)";

/** Coins from sell orders on each day in [from, to]; days with no sales count as 0. */
function dailySales(api: QuestApi, from: number, to: number): number[] {
  const out: number[] = [];
  for (let d = from; d <= to; d++) out.push(Number(api.scalar("SELECT COALESCE(SUM(total), 0) FROM orders WHERE action = 'sell' AND day = ?", [d])));
  return out;
}

/** Longest run of days (since the quest began) on which sales beat the day before. */
function longestRise(api: QuestApi): number {
  const start = api.progress.questStart.day;
  const sales = dailySales(api, start - 1, api.day);
  let best = 0;
  let run = 0;
  for (let i = 1; i < sales.length; i++) {
    run = sales[i] > sales[i - 1] ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}
const bloomDaysSince = (api: QuestApi, day: number) =>
  Number(api.scalar("SELECT COUNT(DISTINCT day) FROM farm_log WHERE event = 'bloomed' AND day >= ?", [day]));

const groupBy = { pattern: /\bgroup\s+by\b/i, message: 'Use `GROUP BY` to make one row per group.' };
const isNull = { pattern: /\bis\s+(not\s+)?null\b/i, message: 'Use `IS NULL` (or `IS NOT NULL`) to test for missing values.' };
const distinct = { pattern: /\bdistinct\b/i, message: 'Use `DISTINCT` to remove the repeats.' };

/** How much a stat has grown since the current quest started. */
function since(api: QuestApi, pick: (s: Stats) => number): number {
  return pick(api.progress.stats) - pick(api.progress.questStart.stats);
}
const lowestMood = (api: QuestApi) => Number(api.scalar('SELECT MIN(mood) FROM creatures') ?? 0);
const plantedNow = (api: QuestApi) => Number(api.scalar('SELECT COUNT(*) FROM plots WHERE crop IS NOT NULL'));
const quillUses = (api: QuestApi, kind: string) => since(api, (s) => s.quill?.[kind] ?? 0);
const ordersSince = (api: QuestApi, action: string, item: string | null, minQty: number) =>
  Number(
    api.scalar(
      `SELECT COUNT(*) FROM orders WHERE action = ? AND quantity >= ? AND day >= ? ${item ? 'AND item = ?' : ''}`,
      item ? [action, minQty, api.progress.questStart.day, item] : [action, minQty, api.progress.questStart.day],
    ),
  );

/** The new land and creatures Mayor Thimble grants at the start of chapter 7. */
function expandFarm(api: QuestApi): string {
  let id = 13;
  const add = (row: number, col: number) =>
    api.system(
      'INSERT INTO plots (id, row, col, crop, growth, moisture, warmth, tilled, field) VALUES (?, ?, ?, NULL, 0, 2, (SELECT temperature FROM weather WHERE day = ?), 0, ?)',
      [id++, row, col, api.day, fieldName({ row, col })],
    );
  for (let row = 1; row <= 3; row++) for (let col = 5; col <= 8; col++) add(row, col); // East field: 13-24
  for (let row = 4; row <= 6; row++) for (let col = 1; col <= 8; col++) add(row, col); // South field: 25-48
  const newcomers: [string, string, number][] = [
    ['Clang', 'Henbell', 14],
    ['Dingle', 'Henbell', 20],
    ['Peal', 'Henbell', 43],
    ['Truffles', 'Squeal', 29],
    ['Snorkel', 'Squeal', 38],
    ['Splash', 'Puddlewump', 35],
    ['Tidy', 'Sortoise', 47],
  ];
  for (const [name, species, plot] of newcomers) {
    const sp = SPECIES[species];
    api.system('INSERT INTO creatures (name, kind, emoji, plot_id, hunger, mood) VALUES (?, ?, ?, ?, 7, 6)', [name, sp.kind, sp.emoji, plot]);
  }
  return '🗺️ Mayor Thimble granted you the East field and the South field (plots 13–48), and 7 new creatures moved in!';
}

const freePlay =
  "This is **free play**: there's no set query to write. Use anything you've learned, in any order, at your own pace. The goals tick off by themselves as you reach them.";

export const QUESTS: Quest[] = [
  // ───────────────────────── Chapter 1: SELECT ─────────────────────────
  {
    id: 'c1-meet',
    chapter: 1,
    kind: 'query',
    title: 'Who lives here?',
    story:
      "Oh! A visitor! I'm **Keystone**, the scarecrow. This farm's yours now. Everything that happens here gets written in the **Ledger**, a magic book of tables. You read it by asking questions in a language called SQL.\n\nLet's start simple. Who lives on this farm?",
    task: 'Show every column of every row in the `creatures` table.',
    concept: {
      title: 'SELECT … FROM …',
      body: '`SELECT` says *what* you want to see. `FROM` says *which table* to look in. The star `*` means "every column".',
      example: 'SELECT * FROM plots;',
    },
    hints: {
      nudge: 'You want everything (`*`) from the table called `creatures`.',
      blank: 'SELECT ___ FROM ___;',
    },
    expected: 'SELECT * FROM creatures',
    reward: { coins: 5, xp: 10 },
  },
  {
    id: 'c1-columns',
    chapter: 1,
    kind: 'query',
    title: 'Just the names, please',
    story: "That's a lot of columns. Squeal doesn't care about its own `id` number. Sometimes you only want a couple of columns.",
    task: 'Show only the `name` and `kind` columns from `creatures`.',
    concept: {
      title: 'Choosing columns',
      body: 'Instead of `*`, list the columns you want, separated by commas.',
      example: 'SELECT id, crop FROM plots;',
    },
    hints: {
      nudge: 'Replace the `*` with the two column names, with a comma between them.',
      blank: 'SELECT name, ___ FROM creatures;',
    },
    expected: 'SELECT name, kind FROM creatures',
    reward: { coins: 5, xp: 10 },
  },
  {
    id: 'c1-plots',
    chapter: 1,
    kind: 'query',
    title: 'Survey the land',
    story: "You've got twelve plots of soil. They look empty, but let's check what the Ledger says.",
    task: 'Show the `id`, `crop` and `growth` of every row in the `plots` table.',
    hints: {
      nudge: 'Same pattern as before, but with three columns and a different table.',
      blank: 'SELECT id, ___, ___ FROM plots;',
    },
    expected: 'SELECT id, crop, growth FROM plots',
    reward: { coins: 5, xp: 10 },
  },
  {
    id: 'c1-feed',
    chapter: 1,
    kind: 'action',
    title: 'A hungry snout',
    story:
      "Did you see Squeal's `hunger`? It's 7 out of 10! Hungry creatures get grumpy and stop working.\n\nYou can't change the Ledger by writing SQL yet. Use the farm buttons instead, and watch: every button shows you the SQL spell it casts.",
    task: 'Feed Squeal using the **Feed** button in the Creatures panel.',
    hints: {
      nudge: "Look for Squeal's card in the Creatures panel on the left.",
      blank: 'Press the 🍽️ Feed button on the card.',
      answer: 'Creatures panel → Squeal → 🍽️ Feed. Then read the SQL that pops up.',
    },
    check: (api) => hungerOf(api, 'Squeal') < 3,
    reward: { coins: 5, xp: 10 },
  },
  {
    id: 'c1-plant',
    chapter: 1,
    kind: 'action',
    title: 'Plant something',
    story: 'You have three **Snoutroot** seeds in the barn. Snoutroot is a cheerful little root that grows almost anywhere.',
    task: 'Click any empty plot, then plant a Snoutroot.',
    hints: {
      nudge: 'Click a plot in the Farm grid to select it.',
      blank: 'With a plot selected, press "Plant 🥕 Snoutroot".',
      answer: "Farm → click any plot → Plant 🥕 Snoutroot. Tip: Squeal's plot (6) might be a lucky spot…",
    },
    check: (api) => Number(api.scalar("SELECT COUNT(*) FROM plots WHERE crop = 'snoutroot'")) > 0,
    reward: { coins: 5, xp: 10 },
  },
  {
    id: 'c1-night',
    chapter: 1,
    kind: 'action',
    title: 'Your first night',
    story: 'The sun is setting over the Hollow. Strange things happen here at night. The Ledger will record all of it.',
    task: 'Press **End day** to sleep until morning.',
    hints: { nudge: 'The 🌙 End day button is at the top.', blank: 'Press 🌙 End day.', answer: 'Press 🌙 End day at the top of the screen.' },
    check: endedDay,
    reward: { coins: 5, xp: 10 },
  },
  {
    id: 'c1-squeal',
    chapter: 1,
    kind: 'answer',
    title: 'What did Squeal do?',
    story:
      "Good morning! The Ledger has a table called `farm_log`. Every creature's night-time doings get written there. Let's find out what Squeal got up to.",
    task: 'Read the whole `farm_log` table, then answer: **what did Squeal do last night?**',
    hints: {
      nudge: 'Use the same query shape as your very first quest, but on `farm_log`.',
      blank: 'SELECT * FROM ___;',
      answer: 'Run `SELECT * FROM farm_log;` and look at the `event` column for Squeal.',
    },
    choices: ['It laid an egg', 'It tilled the soil on its plot', 'It ate all the snoutroot'],
    correct: 1,
    discovers: ['squeal_work'],
    reward: { coins: 10, xp: 20 },
  },

  // ───────────────────────── Chapter 2: WHERE ─────────────────────────
  {
    id: 'c2-hungry',
    chapter: 2,
    kind: 'query',
    title: 'Somebody’s hungry',
    onStart: (api) => arrive(api, 'Henbell', 3, 8, 6),
    story:
      "*Jingle jingle.* Oh, a newcomer! A **Henbell** wandered in at dawn. Once your farm has lots of creatures, you'll want to find just the ones that need you.",
    task: 'Show every column, but only for creatures whose `hunger` is greater than 5.',
    concept: {
      title: 'WHERE',
      body: '`WHERE` keeps only the rows that match a condition. You can compare with `=`, `>`, `<`, `>=`, `<=` and `!=`.',
      example: 'SELECT * FROM plots WHERE growth > 50;',
    },
    hints: {
      nudge: 'Add a `WHERE` after the table name, followed by a condition on `hunger`.',
      blank: 'SELECT * FROM creatures WHERE hunger ___ 5;',
    },
    expected: 'SELECT * FROM creatures WHERE hunger > 5',
    mustInclude: [where],
    reward: { coins: 5, xp: 15 },
  },
  {
    id: 'c2-text',
    chapter: 2,
    kind: 'query',
    title: 'Words need quotes',
    story: "Numbers are easy to compare. Text is a little fussier: it has to wear single quotes, like `'Squeal'`. Otherwise the Ledger thinks you're naming a column.",
    task: "Show every column of the plots where `crop` is `'snoutroot'`.",
    concept: {
      title: 'Text values',
      body: "Wrap text in single quotes. `WHERE name = 'Squeal'` works. `WHERE name = Squeal` makes the Ledger look for a column called Squeal.",
      example: "SELECT * FROM creatures WHERE name = 'Henbell';",
    },
    hints: {
      nudge: "Filter `plots` with `WHERE crop = …` and remember the quotes.",
      blank: "SELECT * FROM plots WHERE crop = '___';",
    },
    expected: "SELECT * FROM plots WHERE crop = 'snoutroot'",
    mustInclude: [where, { pattern: /'snoutroot'/i, message: "Compare `crop` to the text `'snoutroot'` (in quotes)." }],
    reward: { coins: 5, xp: 15 },
  },
  {
    id: 'c2-feed',
    chapter: 2,
    kind: 'action',
    title: 'Breakfast for Henbell',
    story: "Henbell's hunger is 8. That's grumpy territory. Hungry creatures don't do their night work.",
    task: 'Feed Henbell.',
    hints: { nudge: "Find Henbell's card in the Creatures panel.", blank: 'Press 🍽️ Feed on Henbell.', answer: 'Creatures → Henbell → 🍽️ Feed.' },
    check: (api) => hungerOf(api, 'Henbell') < 3,
    reward: { coins: 5, xp: 10 },
  },
  {
    id: 'c2-night',
    chapter: 2,
    kind: 'action',
    title: 'Sleep on it',
    story: "Let's see what a Henbell does when nobody's watching.",
    task: 'End the day.',
    hints: { nudge: 'Top of the screen.', blank: 'Press 🌙 End day.', answer: 'Press 🌙 End day.' },
    check: endedDay,
    reward: { coins: 5, xp: 10 },
  },
  {
    id: 'c2-henbell',
    chapter: 2,
    kind: 'answer',
    title: 'What is a Henbell?',
    story: "The log is getting long. Use `WHERE` to show only Henbell's entries, and we'll work out what it does.",
    task: "Filter `farm_log` to rows where `source` is `'Henbell'`. **What does Henbell do?**",
    hints: {
      nudge: "Filter `farm_log` on the `source` column. Remember quotes around 'Henbell'.",
      blank: "SELECT * FROM farm_log WHERE source = '___';",
      answer: "Run `SELECT * FROM farm_log WHERE source = 'Henbell';` and look at the events.",
    },
    choices: ['It tills the soil', 'It lays an egg at night and rings its bell at dawn', 'It eats snoutroot seedlings'],
    correct: 1,
    discovers: ['henbell_eggs', 'henbell_bell'],
    reward: { coins: 10, xp: 20 },
  },
  {
    id: 'c2-and',
    chapter: 2,
    kind: 'query',
    title: 'Two conditions at once',
    story: "That bell rings every morning no matter what, but you mostly care about the eggs. You can stack conditions together.",
    task: "Show `farm_log` rows where `source` is `'Henbell'` **and** `event` is `'laid_egg'`.",
    concept: {
      title: 'AND / OR',
      body: '`AND` keeps rows where *both* conditions are true. `OR` keeps rows where *either* is true.',
      example: "SELECT * FROM creatures WHERE hunger > 5 AND mood < 5;",
    },
    hints: {
      nudge: 'Write two conditions after `WHERE`, joined with `AND`.',
      blank: "SELECT * FROM farm_log WHERE source = 'Henbell' AND event = '___';",
    },
    expected: "SELECT * FROM farm_log WHERE source = 'Henbell' AND event = 'laid_egg'",
    mustInclude: [where, { pattern: /\band\b/i, message: 'Combine both conditions with `AND`.' }],
    reward: { coins: 10, xp: 20 },
  },

  // ───────────────────── Chapter 3: ORDER BY & LIMIT ─────────────────────
  {
    id: 'c3-market',
    chapter: 3,
    kind: 'query',
    title: 'What sells best?',
    onStart: (api) => arrive(api, 'Sortoise', 12, 3, 7),
    story:
      "A **Sortoise** has shuffled up from the riverbank. It says (very slowly) that the market is a mess, and things should be *in order*. Let's look at the `market` table, priciest first.",
    task: 'Show everything in `market`, sorted by `sell_price` from highest to lowest.',
    concept: {
      title: 'ORDER BY',
      body: '`ORDER BY column` sorts the result. It sorts smallest-first (`ASC`) by default. Add `DESC` for biggest-first.',
      example: 'SELECT * FROM creatures ORDER BY hunger DESC;',
    },
    hints: {
      nudge: 'Add `ORDER BY sell_price` at the end, plus the word that means "biggest first".',
      blank: 'SELECT * FROM market ORDER BY sell_price ___;',
    },
    expected: 'SELECT * FROM market ORDER BY sell_price DESC',
    ordered: true,
    reward: { coins: 5, xp: 15 },
  },
  {
    id: 'c3-top3',
    chapter: 3,
    kind: 'query',
    title: 'The top three',
    story: 'The Sortoise is pleased. Very pleased. It would like you to know that you rarely need *every* row. Usually you just want the top few.',
    task: 'Show the 3 most valuable items in `market`.',
    concept: {
      title: 'LIMIT',
      body: '`LIMIT n` keeps only the first `n` rows. It goes at the very end, after `ORDER BY`.',
      example: 'SELECT * FROM plots ORDER BY growth DESC LIMIT 1;',
    },
    hints: {
      nudge: 'Take your last query and add `LIMIT` at the end.',
      blank: 'SELECT * FROM market ORDER BY sell_price DESC LIMIT ___;',
    },
    expected: 'SELECT * FROM market ORDER BY sell_price DESC LIMIT 3',
    ordered: true,
    reward: { coins: 5, xp: 15 },
  },
  {
    id: 'c3-sell',
    chapter: 3,
    kind: 'action',
    title: 'Market day',
    story: "Now you know what's worth what. Time to make some coin! Eggs, roots, anything in the barn will do.",
    task: 'Sell at least one item from the Barn.',
    hints: {
      nudge: 'The Barn panel lists what you own.',
      blank: 'Press "Sell 1" next to anything you have.',
      answer: "Barn → Sell 1 next to an egg. If you have nothing, end a day or two and Henbell will lay some.",
    },
    check: (api) => api.progress.stats.sold > api.progress.questStart.stats.sold,
    reward: { coins: 5, xp: 10 },
  },
  {
    id: 'c3-night',
    chapter: 3,
    kind: 'action',
    title: 'A slow night',
    story: "Let's see what a Sortoise gets up to. Very, very slowly.",
    task: 'End the day.',
    hints: { nudge: 'Top of the screen.', blank: 'Press 🌙 End day.', answer: 'Press 🌙 End day.' },
    check: endedDay,
    reward: { coins: 5, xp: 10 },
  },
  {
    id: 'c3-sortoise',
    chapter: 3,
    kind: 'answer',
    title: 'Sortoise’s secret',
    story: 'Find what Sortoise did. Newest entries first would be handy, since the log only grows.',
    task: "Look at `farm_log` rows for `'Sortoise'`. **What does Sortoise do at night?** (Check the Barn too!)",
    hints: {
      nudge: "Filter `farm_log` by `source`, and sort by `day` with `DESC` to see the newest first.",
      blank: "SELECT * FROM farm_log WHERE source = 'Sortoise' ORDER BY day ___;",
      answer: "Run `SELECT * FROM farm_log WHERE source = 'Sortoise' ORDER BY day DESC;`. Then check what new item appeared in the Barn.",
    },
    choices: ['It warms the soil', 'It lays eggs', 'It digs up shiny pebbles'],
    correct: 2,
    discovers: ['sortoise_dig'],
    reward: { coins: 10, xp: 20 },
  },
  {
    id: 'c3-latest',
    chapter: 3,
    kind: 'query',
    title: 'Latest news',
    story: 'Every row in `farm_log` has an `id` that counts up. The biggest `id` is the newest entry. Here’s a handy trick for the morning.',
    task: 'Show the 5 newest rows of `farm_log` (highest `id` first).',
    hints: {
      nudge: 'Sort by `id`, biggest first, then keep 5.',
      blank: 'SELECT * FROM farm_log ORDER BY id ___ LIMIT ___;',
    },
    expected: 'SELECT * FROM farm_log ORDER BY id DESC LIMIT 5',
    ordered: true,
    reward: { coins: 10, xp: 20 },
  },

  // ───────────────────── Chapter 4: aggregates ─────────────────────
  {
    id: 'c4-count',
    chapter: 4,
    kind: 'query',
    title: 'A strange visitor',
    onStart: (api) => {
      const msg = arrive(api, 'Chimnius', 2, 2, 8);
      api.system("UPDATE weather SET temperature = -4, sky = 'frost' WHERE day IN (?, ?)", [api.day, api.day + 1]);
      return `${msg} ❄️ The Almanac warns: a cold snap is coming tonight!`;
    },
    story:
      "*Clomp. Clomp. Hummmm.* A brick smokestack on legs just walked into the farm and sat down on plot 2. It's warm. It's humming. I have no idea what it is. The townsfolk call it a **Chimnius**.\n\nWorse news: the Almanac says a **cold snap** is coming. Let's take stock. How big is your farm family now?",
    task: 'Count the rows in `creatures`.',
    concept: {
      title: 'COUNT',
      body: "`COUNT(*)` doesn't show rows. It counts them and gives back a single number.",
      example: 'SELECT COUNT(*) FROM plots;',
    },
    hints: {
      nudge: 'Put `COUNT(*)` where you would normally put `*`.',
      blank: 'SELECT ___(*) FROM creatures;',
    },
    expected: 'SELECT COUNT(*) FROM creatures',
    mustInclude: [{ pattern: /\bcount\s*\(/i, message: 'Use `COUNT(*)` to count the rows.' }],
    reward: { coins: 5, xp: 15 },
  },
  {
    id: 'c4-sum',
    chapter: 4,
    kind: 'query',
    title: 'Stocktake',
    story: 'Before the cold comes, how many things are stored in your barn, all added together?',
    task: 'Add up the `quantity` column of `inventory`.',
    concept: {
      title: 'SUM, AVG, MAX, MIN',
      body: 'These **aggregate** a column into one number: `SUM` adds, `AVG` averages, `MAX` finds the biggest and `MIN` the smallest.',
      example: 'SELECT MAX(growth) FROM plots;',
    },
    hints: { nudge: 'Use `SUM(quantity)`.', blank: 'SELECT ___(quantity) FROM inventory;' },
    expected: 'SELECT SUM(quantity) FROM inventory',
    mustInclude: [{ pattern: /\bsum\s*\(/i, message: 'Use `SUM(quantity)` to add them up.' }],
    reward: { coins: 5, xp: 15 },
  },
  {
    id: 'c4-frost',
    chapter: 4,
    kind: 'action',
    title: 'Brace for frost',
    story: "Nothing for it. The cold is coming whether we like it or not. If you have crops planted, some may not survive. Let's see what happens.",
    task: 'End the day and let the frost come.',
    hints: { nudge: 'Top of the screen.', blank: 'Press 🌙 End day.', answer: 'Press 🌙 End day.' },
    check: (api) => Number(api.scalar("SELECT COUNT(*) FROM farm_log WHERE event = 'frost'")) > 0,
    reward: { coins: 5, xp: 10 },
  },
  {
    id: 'c4-frostcount',
    chapter: 4,
    kind: 'query',
    title: 'Counting the damage',
    story: "Brrr. The `Frost` wrote itself into the log, one row per frozen plot. You can combine `COUNT` with `WHERE` to count only certain rows.",
    task: "Count the rows in `farm_log` where `event` is `'frost'`.",
    hints: {
      nudge: 'Use `COUNT(*)`, plus a `WHERE` that keeps only frost events.',
      blank: "SELECT COUNT(*) FROM farm_log WHERE event = '___';",
    },
    expected: "SELECT COUNT(*) FROM farm_log WHERE event = 'frost'",
    mustInclude: [{ pattern: /\bcount\s*\(/i, message: 'Use `COUNT(*)`.' }, where],
    reward: { coins: 10, xp: 20 },
  },
  {
    id: 'c4-warm',
    chapter: 4,
    kind: 'answer',
    title: 'The plots that didn’t freeze',
    story:
      "Here's a mystery. Not every plot froze. Some stayed toasty warm. Compare the plots' `warmth` with where your creatures are standing (`creatures.plot_id`).",
    task: '**Why did some plots escape the frost?**',
    hints: {
      nudge: 'Sort plots by warmth, warmest first. Then check which creature stands nearby.',
      blank: 'SELECT id, warmth FROM plots ORDER BY warmth ___;',
      answer:
        'Run `SELECT id, row, col, warmth FROM plots ORDER BY warmth DESC;` and `SELECT name, plot_id FROM creatures;`. The warmest plot is the one Chimnius stands on, and its neighbours come next.',
    },
    choices: ["Squeal's tilling keeps the frost out", 'Chimnius warms its own plot and the plots next to it', 'Those plots were just lucky'],
    correct: 1,
    discovers: ['chimnius_warm'],
    reward: { coins: 15, xp: 30 },
  },
  {
    id: 'c4-mood',
    chapter: 4,
    kind: 'query',
    title: 'Something’s off',
    story: "Chimnius is a hero! But I've heard grumbling around the farm. Let's check how everyone's feeling on average.",
    task: 'Find the average `mood` of all creatures.',
    hints: { nudge: 'Use `AVG(mood)`.', blank: 'SELECT ___(mood) FROM creatures;' },
    expected: 'SELECT AVG(mood) FROM creatures',
    mustInclude: [{ pattern: /\bavg\s*\(/i, message: 'Use `AVG(mood)`.' }],
    reward: { coins: 5, xp: 15 },
  },
  {
    id: 'c4-cough',
    chapter: 4,
    kind: 'answer',
    title: 'A cough in the night',
    story: 'Listen… *hack, hack, jingle*. Someone has been coughing. Search the log for it.',
    task: "Find `farm_log` rows where `event` is `'coughed'`. **Who is coughing, and why?**",
    hints: {
      nudge: "Filter `farm_log` by `event = 'coughed'`, then look at where everyone stands.",
      blank: "SELECT * FROM farm_log WHERE event = '___';",
      answer:
        "Run `SELECT * FROM farm_log WHERE event = 'coughed';`. It's Henbell, on plot 3, right next to Chimnius on plot 2.",
    },
    choices: [
      'Squeal: it ate too many scraps',
      "Henbell: Chimnius's smoke drifts onto its plot",
      "Sortoise: it's allergic to pebbles",
    ],
    correct: 1,
    discovers: ['chimnius_smoke', 'henbell_smoke'],
    reward: { coins: 15, xp: 30 },
  },
  {
    id: 'c4-move',
    chapter: 4,
    kind: 'action',
    title: 'Fresh air',
    story: "Poor Henbell. A grumpy Henbell won't lay eggs. Let's find it a spot away from the smoke. (Chimnius warms the plots *next* to it, so the smoke reaches those too.)",
    task: 'Move Henbell (or Chimnius!) so they are not on the same plot or on neighbouring plots.',
    hints: {
      nudge: 'Each creature card has a "Move to plot" picker.',
      blank: 'Pick a plot for Henbell that is not next to Chimnius.',
      answer: 'Creatures → Henbell → Move to plot 12 (far corner).',
    },
    check: (api) => {
      const h = Number(api.scalar("SELECT plot_id FROM creatures WHERE name = 'Henbell'"));
      const c = Number(api.scalar("SELECT plot_id FROM creatures WHERE name = 'Chimnius'"));
      return api.plotDistance(h, c) > 1;
    },
    reward: { coins: 20, xp: 40 },
  },
  // ─────────────────── Free play: The Autumn Fair ───────────────────
  {
    id: 'f1-fair',
    chapter: 4.5,
    kind: 'goal',
    title: 'The Autumn Fair',
    onStart: (api) => {
      api.system("UPDATE inventory SET quantity = quantity + 2 WHERE item = 'sunpuff_seed'");
      return '🎪 Mayor Thimble left 2 Sunpuff seeds on your doorstep, with a flyer for the Autumn Fair.';
    },
    story:
      "Big news! **Mayor Thimble** (a very important badger) is holding the Autumn Fair, and every farm in the Hollow is expected to show off. Thimble left you two Sunpuff seeds as a welcome.\n\n" +
      freePlay +
      "\n\nTip: the Ledger is your best friend here. `seeds` tells you how long each crop takes, `market` what it sells for, and `creatures` who needs feeding.",
    task: 'Get your farm fair-ready.',
    goals: [
      { label: 'Earn 80 coins from selling', progress: (api) => ({ have: since(api, (s) => s.earned), need: 80 }) },
      { label: 'Harvest 2 Sunpuffs', progress: (api) => ({ have: since(api, (s) => s.harvestedBy.sunpuff ?? 0), need: 2 }) },
      { label: 'Harvest a Glassberry', progress: (api) => ({ have: since(api, (s) => s.harvestedBy.glassberry ?? 0), need: 1 }) },
      { label: 'Every creature in a good mood (6+) at the same time', progress: (api) => ({ have: lowestMood(api), need: 6 }) },
    ],
    hints: {
      nudge: 'Glassberries take the longest to grow, so plant one early. Squeal’s tilled plot grows crops faster.',
      blank: "Grumpy creatures are usually hungry ones, or a Henbell near Chimnius's smoke. Find the grumpy ones with `SELECT name, hunger, mood FROM creatures ORDER BY mood;`",
      answer:
        'A plan that works: buy a Glassberry seed, plant it and a Sunpuff on tilled plots, feed everyone every morning, sell eggs and pebbles as they come in, and end days until it all ripens.',
    },
    reward: { coins: 25, xp: 40 },
  },
  {
    id: 'f1-eggs',
    chapter: 4.5,
    kind: 'report',
    title: 'The judges’ first question',
    story:
      "The fair judges have questions, and they only trust numbers that come straight from the Ledger. You can find the answer however you like. Then type it in.",
    task: 'Answer the judges.',
    question: 'How many eggs has Henbell laid since you arrived?',
    expected: "SELECT COALESCE(SUM(amount), 0) FROM farm_log WHERE source = 'Henbell' AND event = 'laid_egg'",
    hints: {
      nudge: "Every egg Henbell lays gets its own row in `farm_log`. You could count those rows, or add up their `amount`.",
      blank: "SELECT SUM(amount) FROM farm_log WHERE source = 'Henbell' AND event = '___';",
      answer: "Run `SELECT SUM(amount) FROM farm_log WHERE source = 'Henbell' AND event = 'laid_egg';` and type in the number.",
    },
    reward: { coins: 10, xp: 20 },
  },
  {
    id: 'f1-cold',
    chapter: 4.5,
    kind: 'report',
    title: 'The judges’ second question',
    story: "The judges are swapping cold-snap stories. Each one swears theirs was the worst. Settle it with data.",
    task: 'Answer the judges.',
    question: 'What is the coldest temperature the Hollow has had since you arrived?',
    expected: 'SELECT MIN(temperature) FROM weather WHERE day < (SELECT day FROM farm)',
    hints: {
      nudge: 'The `weather` table has a `temperature` for every day, including days still to come.',
      blank: 'SELECT ___(temperature) FROM weather WHERE day < ___;',
      answer: 'Run `SELECT MIN(temperature) FROM weather WHERE day < (SELECT day FROM farm);` (or just use today’s day number from the top bar).',
    },
    reward: { coins: 10, xp: 20 },
  },

  // ───────────────── Chapter 5: GROUP BY & HAVING ─────────────────
  {
    id: 'c5-group',
    chapter: 5,
    kind: 'query',
    title: 'A puddle with feet',
    onStart: (api) => arrive(api, 'Puddlewump', 8, 3, 7),
    story:
      "Did you hear that *splish… splosh*? A **Puddlewump** squelched in after the fair and settled on plot 8.\n\nThe log is getting long now. Instead of reading every row, let's *summarise* it: how many entries has each source written?",
    task: 'Show each `source` in `farm_log` once, next to how many rows it has written.',
    concept: {
      title: 'GROUP BY',
      body: '`GROUP BY column` squashes rows that share a value into one row per group. Aggregates like `COUNT(*)` or `SUM(…)` then work *per group* instead of over the whole table.',
      example: 'SELECT crop, COUNT(*) FROM plots GROUP BY crop;',
    },
    hints: {
      nudge: 'Select `source` and `COUNT(*)`, then group by `source`.',
      blank: 'SELECT source, COUNT(*) FROM farm_log GROUP BY ___;',
    },
    expected: 'SELECT source, COUNT(*) FROM farm_log GROUP BY source',
    mustInclude: [groupBy],
    reward: { coins: 10, xp: 20 },
  },
  {
    id: 'c5-sum',
    chapter: 5,
    kind: 'query',
    title: 'Totting up',
    story: 'Counting rows is handy, but some events have an `amount`. Harvests can bring in several crops at once, for example. Let’s total those up instead.',
    task: 'Show each `event` in `farm_log` next to the total of its `amount`.',
    hints: {
      nudge: 'Same shape as last time, but group by `event` and use `SUM(amount)`.',
      blank: 'SELECT event, ___(amount) FROM farm_log GROUP BY ___;',
    },
    expected: 'SELECT event, SUM(amount) FROM farm_log GROUP BY event',
    mustInclude: [groupBy, { pattern: /\bsum\s*\(/i, message: 'Use `SUM(amount)` to add up each group.' }],
    reward: { coins: 10, xp: 20 },
  },
  {
    id: 'c5-night',
    chapter: 5,
    kind: 'action',
    title: 'Watch the puddle',
    story: "Let's see what a Puddlewump does after dark. Keep an eye on the plots' `moisture` too.",
    task: 'End the day.',
    hints: { nudge: 'Top of the screen.', blank: 'Press 🌙 End day.', answer: 'Press 🌙 End day.' },
    check: endedDay,
    reward: { coins: 5, xp: 10 },
  },
  {
    id: 'c5-puddle',
    chapter: 5,
    kind: 'answer',
    title: 'What is a Puddlewump?',
    story: 'Use your new `GROUP BY` skill to summarise everything Puddlewump did, then check the plots around it.',
    task: '**What does Puddlewump do at night?**',
    hints: {
      nudge: "Filter `farm_log` to Puddlewump, then group by `event` (or by `plot_id`!).",
      blank: "SELECT plot_id, COUNT(*) FROM farm_log WHERE source = 'Puddlewump' GROUP BY ___;",
      answer:
        "Run `SELECT plot_id, COUNT(*) FROM farm_log WHERE source = 'Puddlewump' GROUP BY plot_id;`. It wrote `watered` for its own plot and every plot next to it. Then `SELECT id, moisture FROM plots;` shows those plots are all wet.",
    },
    choices: ['It drinks the water out of nearby plots', 'It waters its own plot and the plots next to it', 'It only waters plots with crops on them'],
    correct: 1,
    discovers: ['puddle_water'],
    reward: { coins: 15, xp: 25 },
  },
  {
    id: 'c5-rot',
    chapter: 5,
    kind: 'action',
    title: 'Too much of a good thing?',
    story:
      "A creature that waters for free sounds perfect. But the old farmers have a saying: *never plant a root where a puddle sleeps.* Let's test it, like a proper scientist.",
    task: "Plant a **Snoutroot** on the plot Puddlewump is sitting on, then end the day.",
    hints: {
      nudge: "Check Puddlewump's card (or `SELECT plot_id FROM creatures WHERE name = 'Puddlewump';`) to find its plot.",
      blank: "Select that plot, plant a Snoutroot (buy a seed in the Barn if you're out), then press 🌙 End day.",
      answer: 'Puddlewump starts on plot 8: click plot 8 → Plant 🥕 Snoutroot → 🌙 End day.',
    },
    check: (api) => Number(api.scalar("SELECT COUNT(*) FROM farm_log WHERE event = 'rotted'")) > 0,
    reward: { coins: 10, xp: 15 },
  },
  {
    id: 'c5-rot-why',
    chapter: 5,
    kind: 'answer',
    title: 'Soggy roots',
    story: "Hmm. That Snoutroot doesn't look well. Find out what happened on that plot.",
    task: '**Why isn’t the Snoutroot growing?**',
    hints: {
      nudge: "Group that plot's log entries by `event` to see everything that happened there.",
      blank: "SELECT event, COUNT(*) FROM farm_log WHERE plot_id = ___ GROUP BY event;",
      answer: "Run `SELECT * FROM farm_log WHERE event = 'rotted';`. Puddlewump's own plot is so soggy that root crops rot there.",
    },
    choices: [
      'Puddlewump ate it',
      "Puddlewump's own plot is so soggy that root crops rot there",
      'Snoutroot only grows in the rain',
    ],
    correct: 1,
    discovers: ['puddle_rot'],
    reward: { coins: 15, xp: 25 },
  },
  {
    id: 'c5-having',
    chapter: 5,
    kind: 'query',
    title: 'Frost-prone plots',
    story:
      "That cold snap lasted more than one night. Some plots froze *again and again*. Those are the ones that really need Chimnius nearby next winter.\n\n`WHERE` filters rows *before* grouping. To filter the *groups* themselves (like \"more than one frost\"), you need its partner, `HAVING`.",
    task: "Show each `plot_id` that froze more than once, with its number of `'frost'` events.",
    concept: {
      title: 'HAVING',
      body: '`HAVING` is like `WHERE`, but for groups. It goes after `GROUP BY` and can use aggregates, like `HAVING COUNT(*) > 1`.',
      example: 'SELECT crop, COUNT(*) FROM plots GROUP BY crop HAVING COUNT(*) > 1;',
    },
    hints: {
      nudge: "Filter to frost events with `WHERE`, group by `plot_id`, then keep groups with `HAVING COUNT(*) > 1`.",
      blank: "SELECT plot_id, COUNT(*) FROM farm_log WHERE event = 'frost' GROUP BY plot_id HAVING ___ > 1;",
    },
    expected: "SELECT plot_id, COUNT(*) FROM farm_log WHERE event = 'frost' GROUP BY plot_id HAVING COUNT(*) > 1",
    mustInclude: [groupBy, { pattern: /\bhaving\b/i, message: 'Use `HAVING` to keep only the groups with more than one frost.' }],
    reward: { coins: 20, xp: 30 },
  },

  // ─────────────────── Free play: The Dry Spell ───────────────────
  {
    id: 'f2-dry',
    chapter: 5.5,
    kind: 'goal',
    title: 'The Dry Spell',
    onStart: (api) => {
      api.system("UPDATE weather SET sky = 'sunny', temperature = 15 WHERE day BETWEEN ? AND ?", [api.day, api.day + 7]);
      return '☀️ The Almanac predicts a long dry spell. No rain for a week!';
    },
    story:
      "The Almanac says no rain for a week. Dry soil halves how fast crops grow, so the farmers who come out ahead will be the ones who use their water wisely. A certain puddle might help…\n\n" +
      freePlay,
    task: 'Keep the farm thriving through the dry spell.',
    goals: [
      { label: 'See the dry spell through (7 days)', progress: (api) => ({ have: api.day - api.progress.questStart.day, need: 7 }) },
      { label: 'Have 7 plots growing crops at once', progress: (api) => ({ have: plantedNow(api), need: 7 }) },
      { label: 'Harvest 3 Glassberries', progress: (api) => ({ have: since(api, (s) => s.harvestedBy.glassberry ?? 0), need: 3 }) },
      { label: 'Earn 150 coins from selling', progress: (api) => ({ have: since(api, (s) => s.earned), need: 150 }) },
    ],
    hints: {
      nudge: "Glassberries take 5 nights, or twice that in dry soil. Plots with `moisture = 0` grow at half speed. Plots next to Puddlewump stay wet for free. Just don't put Snoutroot on its own plot!",
      blank: 'Find the thirsty plots with `SELECT id, crop, moisture FROM plots WHERE moisture = 0;` and water them, or move Puddlewump closer.',
      answer:
        "Plant Sunpuffs or Glassberries around Puddlewump (not on its own plot), water any dry plots each morning, and sell everything you harvest. Eggs and pebbles add up too.",
    },
    reward: { coins: 30, xp: 50 },
  },
  {
    id: 'f2-water',
    chapter: 5.5,
    kind: 'report',
    title: 'The Water Board',
    story: "The Hollow's Water Board heard you have a walking puddle. They'd like it registered, along with a record of its work.",
    task: 'Answer the Water Board.',
    question: 'How many times, in total, has Puddlewump watered a plot?',
    expected: "SELECT COUNT(*) FROM farm_log WHERE source = 'Puddlewump' AND event = 'watered'",
    hints: {
      nudge: "Each plot Puddlewump waters gets its own `'watered'` row in the log.",
      blank: "SELECT COUNT(*) FROM farm_log WHERE source = 'Puddlewump' AND event = '___';",
      answer: "Run `SELECT COUNT(*) FROM farm_log WHERE source = 'Puddlewump' AND event = 'watered';`",
    },
    reward: { coins: 10, xp: 20 },
  },
  {
    id: 'f2-busiest',
    chapter: 5.5,
    kind: 'report',
    title: 'The busiest event',
    story: 'One last form. The Water Board wants to know what happens most on your farm, and it only accepts one word.',
    task: 'Answer the Water Board.',
    question: 'Which `event` appears most often in your log? (Type the event name.)',
    expected:
      'SELECT event FROM farm_log GROUP BY event HAVING COUNT(*) = (SELECT MAX(n) FROM (SELECT COUNT(*) AS n FROM farm_log GROUP BY event))',
    hints: {
      nudge: 'Group by `event`, count each group, then sort so the biggest count comes first.',
      blank: 'SELECT event, COUNT(*) FROM farm_log GROUP BY event ORDER BY COUNT(*) ___ LIMIT 1;',
      answer: 'Run `SELECT event, COUNT(*) FROM farm_log GROUP BY event ORDER BY COUNT(*) DESC LIMIT 1;` and type in the event.',
    },
    reward: { coins: 15, xp: 25 },
  },

  // ───────────────── Chapter 6: NULL & DISTINCT ─────────────────
  {
    id: 'c6-shimmer',
    chapter: 6,
    kind: 'action',
    title: 'A shimmer on plot 1',
    onStart: (api) => arrive(api, 'Nullkin', 1, 0, 7),
    story:
      "Did you see that? Something flickered over plot 1. When I look straight at it, it's gone… The townsfolk whisper about a **Nullkin**, but nobody has ever *caught* one.\n\nLet's sleep on it and check the Ledger in the morning.",
    task: 'End the day.',
    hints: { nudge: 'Top of the screen.', blank: 'Press 🌙 End day.', answer: 'Press 🌙 End day.' },
    check: endedDay,
    reward: { coins: 5, xp: 10 },
  },
  {
    id: 'c6-isnull',
    chapter: 6,
    kind: 'query',
    title: 'Who wrote this?',
    story:
      "Look at last night's log… some rows have **no source at all**. That blank is called `NULL`. It means *unknown*, and it's sneakier than it looks. Try `WHERE source = NULL` first if you like. You'll see what I mean.",
    task: 'Show every row of `farm_log` whose `source` is missing.',
    concept: {
      title: 'NULL and IS NULL',
      body: "`NULL` means a value is missing or unknown. Nothing is ever *equal* to unknown, not even another unknown, so `= NULL` never matches. Use `IS NULL` or `IS NOT NULL` instead.",
      example: 'SELECT * FROM plots WHERE crop IS NULL;',
    },
    hints: {
      nudge: 'Filter on `source`, using `IS NULL` rather than `= NULL`.',
      blank: 'SELECT * FROM farm_log WHERE source IS ___;',
    },
    expected: 'SELECT * FROM farm_log WHERE source IS NULL',
    mustInclude: [isNull],
    reward: { coins: 15, xp: 25 },
  },
  {
    id: 'c6-amount',
    chapter: 6,
    kind: 'query',
    title: 'Nibbled numbers',
    story: "It's not just sources. Some rows have lost their `amount` too, as if something *nibbled* the numbers right off the page.",
    task: 'Count the rows in `farm_log` whose `amount` is missing.',
    hints: {
      nudge: 'Combine `COUNT(*)` with a `WHERE … IS NULL` filter.',
      blank: 'SELECT COUNT(*) FROM farm_log WHERE amount IS ___;',
    },
    expected: 'SELECT COUNT(*) FROM farm_log WHERE amount IS NULL',
    mustInclude: [isNull],
    reward: { coins: 10, xp: 20 },
  },
  {
    id: 'c6-notnull',
    chapter: 6,
    kind: 'query',
    title: 'What’s really growing?',
    story: "Here's the other side of the coin. Empty plots have a `NULL` crop. To see only the plots with something in them, flip it around.",
    task: 'Show every column of the plots that have a crop (where `crop` is not NULL).',
    hints: {
      nudge: 'Use `IS NOT NULL`.',
      blank: 'SELECT * FROM plots WHERE crop IS ___ NULL;',
    },
    expected: 'SELECT * FROM plots WHERE crop IS NOT NULL',
    mustInclude: [{ pattern: /\bis\s+not\s+null\b/i, message: 'Use `IS NOT NULL` to keep only the plots with a crop.' }],
    reward: { coins: 10, xp: 20 },
  },
  {
    id: 'c6-nullkin',
    chapter: 6,
    kind: 'answer',
    title: 'Catching a ghost',
    story: "You can't see a Nullkin, but you *can* see what it leaves behind. Look at the rows with no source: where were they, and what do they say?",
    task: '**What is the Nullkin doing?**',
    hints: {
      nudge: "Look at the `event` column of the rows where `source IS NULL`, and at the `amount`s that went missing.",
      blank: 'SELECT * FROM farm_log WHERE source IS NULL OR amount IS ___;',
      answer:
        "Run `SELECT * FROM farm_log WHERE source IS NULL OR amount IS NULL;`. The source-less rows say `nibbled`, on the Nullkin's plot, and each night one other row's amount goes missing.",
    },
    choices: [
      "It nibbles the Ledger: its own notes have no source, and it erases other entries' amounts",
      'It deletes whole rows from the log',
      'It steals crops from plot 1',
    ],
    correct: 0,
    discovers: ['nullkin_nibble', 'nullkin_hunger'],
    reward: { coins: 20, xp: 30 },
  },
  {
    id: 'c6-echo',
    chapter: 6,
    kind: 'action',
    title: 'Baa… baa… baa…',
    onStart: (api) => arrive(api, 'Echolamb', 9, 3, 7),
    story: "A fluffy **Echolamb** wandered in. Its bleat comes back a second later. Then again. Then again. Let's see what a night with an Echolamb looks like.",
    task: 'End the day.',
    hints: { nudge: 'Top of the screen.', blank: 'Press 🌙 End day.', answer: 'Press 🌙 End day.' },
    check: endedDay,
    reward: { coins: 5, xp: 10 },
  },
  {
    id: 'c6-distinct',
    chapter: 6,
    kind: 'query',
    title: 'Saying it once',
    story: "The log is full of repeats now. Sometimes you just want to know *which* values exist, each one listed once.",
    task: 'List each different `source` in `farm_log`, once each.',
    concept: {
      title: 'DISTINCT',
      body: '`SELECT DISTINCT` removes duplicate rows from the result, so each different value (or combination of values) appears once.',
      example: 'SELECT DISTINCT crop FROM plots;',
    },
    hints: {
      nudge: 'Put `DISTINCT` straight after `SELECT`.',
      blank: 'SELECT ___ source FROM farm_log;',
    },
    expected: 'SELECT DISTINCT source FROM farm_log',
    mustInclude: [distinct],
    reward: { coins: 10, xp: 20 },
  },
  {
    id: 'c6-echolamb',
    chapter: 6,
    kind: 'answer',
    title: 'Déjà vu',
    story: "Look closely at the log rows for the day *before* yesterday. Some of them look awfully familiar…",
    task: '**What does Echolamb do (besides growing wool)?**',
    hints: {
      nudge: 'Sort the log so identical rows sit next to each other, and compare their `id`s.',
      blank: 'SELECT * FROM farm_log ORDER BY day, source, ___;',
      answer:
        'Run `SELECT * FROM farm_log ORDER BY day, source, event;`. Rows from the night before Echolamb arrived appear twice: same day, source, event and amount, but different `id`s.',
    },
    choices: [
      'It eats rows out of the log',
      "It repeats yesterday: it copies the previous night's log entries as exact duplicates",
      'It changes the day numbers on old entries',
    ],
    correct: 1,
    discovers: ['echolamb_wool', 'echolamb_echo'],
    reward: { coins: 20, xp: 30 },
  },
  {
    id: 'c6-count-distinct',
    chapter: 6,
    kind: 'query',
    title: 'The honest egg count',
    story:
      "Those echoes make the egg numbers look bigger than they are. Henbell lays at most one egg a night, so the honest count is the number of *different days* it laid on. `DISTINCT` works inside `COUNT` too!",
    task: "Count the different `day`s on which Henbell has a `'laid_egg'` row.",
    hints: {
      nudge: 'Use `COUNT(DISTINCT day)` with a `WHERE` for Henbell’s eggs.',
      blank: "SELECT COUNT(DISTINCT ___) FROM farm_log WHERE source = 'Henbell' AND event = 'laid_egg';",
    },
    expected: "SELECT COUNT(DISTINCT day) FROM farm_log WHERE source = 'Henbell' AND event = 'laid_egg'",
    mustInclude: [distinct, where],
    reward: { coins: 20, xp: 30 },
  },

  // ─────────────────── Free play: The Ledger Audit ───────────────────
  {
    id: 'f3-audit',
    chapter: 6.5,
    kind: 'goal',
    title: 'The Ledger Audit',
    story:
      "Uh oh. Word got out about ghosts and echoes in your Ledger, and Mayor Thimble has sent an **auditor**. A stern heron in spectacles. Show the Hollow your farm is in good shape, ghosts and all.\n\n" +
      freePlay,
    task: 'Impress the auditor.',
    goals: [
      { label: 'Sell 3 Echo wool', progress: (api) => ({ have: since(api, (s) => s.soldBy.echo_wool ?? 0), need: 3 }) },
      { label: 'Harvest 2 Glassberries', progress: (api) => ({ have: since(api, (s) => s.harvestedBy.glassberry ?? 0), need: 2 }) },
      { label: 'Earn 150 coins from selling', progress: (api) => ({ have: since(api, (s) => s.earned), need: 150 }) },
      { label: 'Every creature in a good mood (6+) at the same time', progress: (api) => ({ have: lowestMood(api), need: 6 }) },
    ],
    hints: {
      nudge: 'Echolamb only grows wool when it is fed and cheerful. Glassberries take 5 nights, so plant them early.',
      blank: 'Keep an eye on everyone with `SELECT name, hunger, mood FROM creatures ORDER BY mood;` each morning.',
      answer: 'Feed everyone daily, plant two Glassberries (on wet plots near Puddlewump), sell wool as it grows, and end days until the goals tick off.',
    },
    reward: { coins: 40, xp: 60 },
  },
  {
    id: 'f3-events',
    chapter: 6.5,
    kind: 'report',
    title: 'The auditor’s first question',
    story: 'The heron peers over its spectacles. "I like a tidy Ledger," it says. "So tell me…"',
    task: 'Answer the auditor.',
    question: 'How many *different* kinds of event are in your log?',
    expected: 'SELECT COUNT(DISTINCT event) FROM farm_log',
    hints: {
      nudge: '`COUNT(DISTINCT …)` counts each different value once.',
      blank: 'SELECT COUNT(DISTINCT ___) FROM farm_log;',
      answer: 'Run `SELECT COUNT(DISTINCT event) FROM farm_log;`',
    },
    reward: { coins: 15, xp: 25 },
  },
  {
    id: 'f3-sources',
    chapter: 6.5,
    kind: 'report',
    title: 'The auditor’s second question',
    story: '"And how many different *named* sources have written in it?" The heron taps the blank rows. "The unsigned ones don\'t count."',
    task: 'Answer the auditor.',
    question: 'How many different sources (not counting the missing ones) appear in your log?',
    expected: 'SELECT COUNT(DISTINCT source) FROM farm_log',
    hints: {
      nudge: '`COUNT(DISTINCT source)` already skips NULLs. Aggregates ignore missing values!',
      blank: 'SELECT COUNT(DISTINCT ___) FROM farm_log;',
      answer: 'Run `SELECT COUNT(DISTINCT source) FROM farm_log;`. NULLs are left out automatically.',
    },
    reward: { coins: 15, xp: 25 },
  },
  {
    id: 'f3-nibbled',
    chapter: 6.5,
    kind: 'report',
    title: 'The auditor’s last question',
    story: '"Finally," says the heron, pen poised. "How much damage has your ghost done?"',
    task: 'Answer the auditor.',
    question: 'How many rows in your log are missing their `amount` right now?',
    expected: 'SELECT COUNT(*) FROM farm_log WHERE amount IS NULL',
    hints: {
      nudge: "Missing values are `NULL`, and you test for them with `IS NULL`.",
      blank: 'SELECT COUNT(*) FROM farm_log WHERE amount IS ___;',
      answer: 'Run `SELECT COUNT(*) FROM farm_log WHERE amount IS NULL;` (today: the Nullkin nibbles more every night!)',
    },
    reward: { coins: 25, xp: 40 },
  },
  // ───────────────── Chapter 7: The Ledger Quill ─────────────────
  {
    id: 'c7-land',
    chapter: 7,
    kind: 'action',
    title: 'A farm four times the size',
    onStart: expandFarm,
    story:
      "The audit went *so* well that Mayor Thimble has granted you two more fields. The **East field** and the **South field** take you from 12 plots to **48**! Seven new creatures came with the land: three Henbells (Clang, Dingle and Peal), two Squeals (Truffles and Snorkel), a second Puddlewump (Splash) and another Sortoise (Tidy).\n\nThey're all hungry after the move.",
    task: 'Feed **every** creature on the farm (all of them at hunger 2 or less).',
    hints: {
      nudge: 'Every creature card has a Feed button. All fourteen of them…',
      blank: "Check who's still hungry with `SELECT name, hunger FROM creatures WHERE hunger > 2;`",
      answer: 'Press 🍽️ Feed on every creature card. Yes, it’s a lot of clicking. Hold that thought.',
    },
    check: (api) => Number(api.scalar('SELECT MAX(hunger) FROM creatures')) <= 2,
    reward: { coins: 10, xp: 15 },
  },
  {
    id: 'c7-morning',
    chapter: 7,
    kind: 'action',
    title: 'And again tomorrow',
    story: "Phew. That took a while. Let's get some sleep… though I have a feeling they'll be hungry again by morning.",
    task: 'End the day.',
    hints: { nudge: 'Top of the screen.', blank: 'Press 🌙 End day.', answer: 'Press 🌙 End day.' },
    check: endedDay,
    reward: { coins: 5, xp: 10 },
  },
  {
    id: 'c7-quill',
    chapter: 7,
    kind: 'action',
    title: 'The Ledger Quill',
    onStart: (api) => {
      api.progress.quill = true;
      return '🪶 You received the Ledger Quill! The Ledger now accepts INSERT, UPDATE and DELETE.';
    },
    story:
      "Hungry again, every one of them. There has to be a better way… and there is!\n\nYou've earned the **Ledger Quill**. Until now the Ledger was read-only. With the Quill, the SQL you *write* changes the farm itself, within the Ledger's laws. Remember all those `UPDATE` spells the buttons whispered? Now you can cast them yourself, on as many rows as you like at once.",
    task: 'Feed every creature with a **single** `UPDATE`.',
    concept: {
      title: 'UPDATE … SET … WHERE',
      body: "`UPDATE table SET column = value` changes rows. Add `WHERE` to change only some of them. With **no** `WHERE`, it changes *every* row, which is exactly what you want here.",
      example: "UPDATE plots SET moisture = 3 WHERE id = 1;",
    },
    hints: {
      nudge: 'Set `hunger` to 0 in the `creatures` table. No `WHERE` needed: you want everyone.',
      blank: 'UPDATE creatures SET hunger = ___;',
      answer: 'Write `UPDATE creatures SET hunger = 0;` and run it.',
    },
    check: (api) => quillUses(api, 'fed') >= 10,
    reward: { coins: 20, xp: 30 },
  },
  {
    id: 'c7-buy',
    chapter: 7,
    kind: 'action',
    title: 'Shopping by letter',
    story:
      "The South field needs seeds. The Quill can't *conjure* seeds into your barn. The Ledger has laws, and the barn only changes when you trade. But there's a new table, `orders`, where the Hollow's market reads its mail. Add a row to it, and the market fills it straight away.",
    task: "Buy **8 Snoutroot seeds** with one `INSERT INTO orders`.",
    concept: {
      title: 'INSERT INTO … VALUES',
      body: '`INSERT INTO table (columns) VALUES (values)` adds a new row. List the columns you are filling in, then the values, in the same order. Text goes in single quotes.',
      example: "INSERT INTO orders (action, item, quantity) VALUES ('sell', 'egg', 2);",
    },
    hints: {
      nudge: "The `action` is `'buy'`, the `item` is `'snoutroot_seed'`, and the `quantity` is 8.",
      blank: "INSERT INTO orders (action, item, quantity) VALUES ('buy', '___', ___);",
      answer: "Write `INSERT INTO orders (action, item, quantity) VALUES ('buy', 'snoutroot_seed', 8);`",
    },
    check: (api) => quillUses(api, 'bought') > 0 && ordersSince(api, 'buy', 'snoutroot_seed', 8) > 0,
    reward: { coins: 15, xp: 25 },
  },
  {
    id: 'c7-plant',
    chapter: 7,
    kind: 'action',
    title: 'Planting a whole row',
    story:
      "Now for the fun part. Row 4 is the first row of the South field: eight empty plots. Planting is just an `UPDATE` too. Set the `crop` (and `growth = 0`), and the Ledger takes a seed from your barn for each plot.\n\nThis time you only want *some* rows changed, so `WHERE` matters.",
    task: 'Plant **Snoutroot** on every empty plot in **row 4**, with one `UPDATE`.',
    hints: {
      nudge: "Set `crop = 'snoutroot', growth = 0`, but only `WHERE row = 4 AND crop IS NULL`.",
      blank: "UPDATE plots SET crop = 'snoutroot', growth = 0 WHERE row = ___ AND crop IS NULL;",
      answer: "Write `UPDATE plots SET crop = 'snoutroot', growth = 0 WHERE row = 4 AND crop IS NULL;`",
    },
    check: (api) => quillUses(api, 'planted') > 0 && Number(api.scalar('SELECT COUNT(*) FROM plots WHERE row = 4 AND crop IS NULL')) === 0,
    reward: { coins: 20, xp: 30 },
  },
  {
    id: 'c7-laws',
    chapter: 7,
    kind: 'answer',
    title: 'The Ledger’s laws',
    story:
      "With great Quill comes great temptation. I *know* you're wondering what happens if you just… write yourself some coins. Go on, I won't tell. Try `UPDATE farm SET coins = 9999;`",
    task: '**What happens when you try to write your own coins?**',
    hints: {
      nudge: 'Just run it and read what the Ledger says. Then check your coins at the top.',
      blank: 'Run `UPDATE farm SET coins = 9999;` and look at the message.',
      answer: 'The Ledger refuses, and nothing changes. Coins only come from trading (the `orders` table).',
    },
    choices: ['You get 9999 coins', 'The Ledger refuses and nothing changes. Coins only come from trading', 'The Nullkin eats your coins'],
    correct: 1,
    reward: { coins: 10, xp: 20 },
  },
  {
    id: 'c7-dry',
    chapter: 7,
    kind: 'action',
    title: 'A hot wind',
    onStart: (api) => {
      api.system('UPDATE plots SET moisture = 0 WHERE crop IS NOT NULL');
      return '🌬️ A hot wind blew across the Hollow and dried out every planted plot!';
    },
    story:
      "Oh no, a hot wind dried out every plot with a crop in it. Dry crops grow at half speed. That's a lot of 💧 buttons to press… or one `UPDATE` with the right `WHERE`.",
    task: 'Water every plot that has a crop and is drying out, with one `UPDATE`.',
    hints: {
      nudge: 'Set `moisture = 3` on plots `WHERE crop IS NOT NULL AND moisture < 3`.',
      blank: 'UPDATE plots SET moisture = 3 WHERE crop IS NOT NULL AND moisture < ___;',
      answer: 'Write `UPDATE plots SET moisture = 3 WHERE crop IS NOT NULL AND moisture < 3;`',
    },
    check: (api) =>
      quillUses(api, 'watered') > 0 && Number(api.scalar('SELECT COUNT(*) FROM plots WHERE crop IS NOT NULL AND moisture < 3')) === 0,
    reward: { coins: 15, xp: 25 },
  },
  {
    id: 'c7-delete',
    chapter: 7,
    kind: 'action',
    title: 'Sweeping up after a ghost',
    story:
      "The Nullkin's unsigned `nibbled` notes are cluttering the log. The Ledger won't let you *forge* history, but you're allowed to tidy it.\n\n`DELETE` is the most dangerous spell in the Quill: forget the `WHERE`, and it removes **every** row. (If that ever happens, ⏪ Rewind puts the day back.)",
    task: 'Delete every row from `farm_log` whose `source` is missing.',
    concept: {
      title: 'DELETE FROM … WHERE',
      body: '`DELETE FROM table WHERE condition` removes the matching rows. **Always** write the `WHERE` first and check it with a `SELECT` before you run the `DELETE`.',
      example: "DELETE FROM farm_log WHERE event = 'rang_bell';",
    },
    hints: {
      nudge: 'First, check which rows will go: `SELECT * FROM farm_log WHERE source IS NULL;`. Then swap `SELECT *` for `DELETE`.',
      blank: 'DELETE FROM farm_log WHERE source IS ___;',
      answer: 'Write `DELETE FROM farm_log WHERE source IS NULL;`',
    },
    check: (api) => quillUses(api, 'deleted') > 0 && Number(api.scalar('SELECT COUNT(*) FROM farm_log WHERE source IS NULL')) === 0,
    reward: { coins: 15, xp: 25 },
  },
  {
    id: 'c7-sell',
    chapter: 7,
    kind: 'action',
    title: 'Selling in bulk',
    story:
      "Four Henbells means a *lot* of eggs. Selling works just like buying: one row in `orders`.\n\nHere's a trick: a `VALUES` list can contain a little `SELECT` in brackets, so you don't even need to know how many you have.",
    task: 'Sell **at least 3** of something with a single `INSERT INTO orders`.',
    hints: {
      nudge: "Check what you have with `SELECT * FROM inventory WHERE quantity >= 3;`, then insert a `'sell'` order.",
      blank: "INSERT INTO orders (action, item, quantity) VALUES ('sell', 'egg', (SELECT quantity FROM inventory WHERE item = '___'));",
      answer:
        "Write `INSERT INTO orders (action, item, quantity) VALUES ('sell', 'egg', (SELECT quantity FROM inventory WHERE item = 'egg'));`. If you have fewer than 3 eggs, end a day first, or sell something else.",
    },
    check: (api) => quillUses(api, 'sold') > 0 && ordersSince(api, 'sell', null, 3) > 0,
    reward: { coins: 15, xp: 25 },
  },
  {
    id: 'c7-harvest',
    chapter: 7,
    kind: 'action',
    title: 'Harvest by the row',
    story:
      "Last spell of the chapter. Harvesting is an `UPDATE` too: set a ripe plot's `crop` to `NULL` and the Ledger puts the crop in your barn. (Careful! Clearing an *unripe* crop uproots it, and it's lost.)",
    task: 'When crops are ripe (✨), harvest **every** ripe plot with one `UPDATE`.',
    hints: {
      nudge: 'Ripe crops have `growth >= 100`. End a day or two if nothing is ripe yet.',
      blank: 'UPDATE plots SET crop = NULL WHERE growth >= ___;',
      answer: 'End days until some plots show ✨, then write `UPDATE plots SET crop = NULL WHERE growth >= 100;`',
    },
    check: (api) => quillUses(api, 'harvested') > 0,
    reward: { coins: 25, xp: 40 },
  },

  // ─────────────────── Free play: The Big Farm ───────────────────
  {
    id: 'f4-big',
    chapter: 7.5,
    kind: 'goal',
    title: 'The Big Farm',
    story:
      "Forty-eight plots, fourteen mouths to feed, and a Quill in your hand. Time to see what this farm can *really* do.\n\n" +
      freePlay +
      "\n\nWith this many plots, the buttons will wear your fingers out. A handful of good `UPDATE`s each morning can run the whole farm.",
    task: 'Run the Big Farm.',
    goals: [
      { label: 'Have 30 plots growing crops at once', progress: (api) => ({ have: plantedNow(api), need: 30 }) },
      { label: 'Harvest 40 crops', progress: (api) => ({ have: since(api, (s) => s.harvested), need: 40 }) },
      { label: 'Earn 300 coins from selling', progress: (api) => ({ have: since(api, (s) => s.earned), need: 300 }) },
      { label: 'Every creature in a good mood (6+) at the same time', progress: (api) => ({ have: lowestMood(api), need: 6 }) },
    ],
    hints: {
      nudge: 'A morning routine of a few writes does it: feed everyone, water the dry plots, harvest the ripe ones, sell, buy seeds, and plant the empty plots.',
      blank: "Planting needs seeds first. One write can do both: `INSERT INTO orders (action, item, quantity) VALUES ('buy', 'sunpuff_seed', 10);` followed by an `UPDATE plots …` in the same run.",
      answer:
        "Each morning: `UPDATE creatures SET hunger = 0;` `UPDATE plots SET crop = NULL WHERE growth >= 100;` then sell what you harvested, buy seeds, and `UPDATE plots SET crop = 'sunpuff', growth = 0 WHERE crop IS NULL AND id IN (SELECT id FROM plots WHERE crop IS NULL LIMIT 10);`",
    },
    reward: { coins: 50, xp: 80 },
  },
  {
    id: 'f4-earned',
    chapter: 7.5,
    kind: 'report',
    title: 'The Mayor’s accounts',
    story: 'Mayor Thimble wants to brag about you to the other villages, so the badger needs numbers.',
    task: 'Answer the Mayor.',
    question: 'In total, how many coins have all your `sell` orders brought in?',
    expected: "SELECT COALESCE(SUM(total), 0) FROM orders WHERE action = 'sell'",
    hints: {
      nudge: 'Every sale is a row in `orders`, and its `total` is what it earned.',
      blank: "SELECT SUM(total) FROM orders WHERE action = '___';",
      answer: "Run `SELECT SUM(total) FROM orders WHERE action = 'sell';`",
    },
    reward: { coins: 20, xp: 30 },
  },
  {
    id: 'f4-south',
    chapter: 7.5,
    kind: 'report',
    title: 'Room to grow',
    story: '"And how much room is left down south?" asks Thimble, squinting at the South field.',
    task: 'Answer the Mayor.',
    question: 'How many plots in the South field (row 4 or higher) are empty right now?',
    expected: 'SELECT COUNT(*) FROM plots WHERE row >= 4 AND crop IS NULL',
    hints: {
      nudge: 'Empty plots have a `NULL` crop. The South field is `row >= 4`.',
      blank: 'SELECT COUNT(*) FROM plots WHERE row >= 4 AND crop IS ___;',
      answer: 'Run `SELECT COUNT(*) FROM plots WHERE row >= 4 AND crop IS NULL;`',
    },
    reward: { coins: 20, xp: 30 },
  },
  // ───────────────────── Chapter 8: JOIN ─────────────────────
  {
    id: 'c8-meet',
    chapter: 8,
    kind: 'query',
    title: 'Who’s standing on what?',
    story:
      "With fourteen creatures spread over three fields, I keep losing track of who is standing on what. The answer is split across two tables: `creatures` knows each creature's `plot_id`, and `plots` knows what's growing on each plot.\n\nA **JOIN** stitches tables together wherever their values match. It's the most powerful spell in the Ledger.",
    task: "Show each creature's `name` next to the `crop` on the plot it's standing on.",
    concept: {
      title: 'JOIN … ON',
      body: '`FROM a JOIN b ON a.x = b.y` pairs up rows from both tables wherever the condition is true. When a column name could belong to either table, write it as `table.column`.',
      example: 'SELECT orders.item, market.sell_price FROM orders JOIN market ON orders.item = market.item;',
    },
    hints: {
      nudge: "A creature's `plot_id` matches a plot's `id`. Join on that.",
      blank: 'SELECT creatures.name, plots.crop FROM creatures JOIN plots ON creatures.plot_id = ___;',
    },
    expected: 'SELECT creatures.name, plots.crop FROM creatures JOIN plots ON creatures.plot_id = plots.id',
    mustInclude: [join],
    reward: { coins: 20, xp: 30 },
  },
  {
    id: 'c8-alias',
    chapter: 8,
    kind: 'query',
    title: 'Nicknames',
    story: "Writing `creatures.` and `plots.` over and over gets tiring. You can give each table a short **alias** right after its name, and use that instead.",
    task: "Show each creature's `name` with the `row` and `col` of its plot. Try using aliases!",
    concept: {
      title: 'Table aliases',
      body: '`FROM creatures AS c` lets you write `c.name` instead of `creatures.name`. (The `AS` is optional.) Aliases make joins much easier to read.',
      example: 'SELECT i.item, m.sell_price FROM inventory AS i JOIN market AS m ON i.item = m.item;',
    },
    hints: {
      nudge: 'Same join as before, with `c` for creatures and `p` for plots.',
      blank: 'SELECT c.name, p.row, p.col FROM creatures AS c JOIN plots AS p ON c.plot_id = ___;',
    },
    expected: 'SELECT c.name, p.row, p.col FROM creatures AS c JOIN plots AS p ON c.plot_id = p.id',
    mustInclude: [join],
    reward: { coins: 15, xp: 25 },
  },
  {
    id: 'c8-worth',
    chapter: 8,
    kind: 'query',
    title: 'What’s the barn worth?',
    story:
      "`inventory` knows how many of everything you have. `market` knows what each thing sells for. Neither one alone knows what your barn is *worth*… but joined together, they do. You can do maths across a join, and then aggregate it, too.",
    task: 'Find the total value of your barn: the `SUM` of each item’s `quantity` times its `sell_price`.',
    hints: {
      nudge: "Join `inventory` to `market` on `item`, then `SUM(inventory.quantity * market.sell_price)`. (Seeds aren't in `market`, so the join leaves them out.)",
      blank: 'SELECT SUM(inventory.quantity * market.sell_price) FROM inventory JOIN market ON inventory.item = ___;',
    },
    expected: 'SELECT SUM(inventory.quantity * market.sell_price) FROM inventory JOIN market ON inventory.item = market.item',
    mustInclude: [join],
    reward: { coins: 20, xp: 30 },
  },
  {
    id: 'c8-glimmer',
    chapter: 8,
    kind: 'action',
    title: 'A light in the dark',
    onStart: (api) => {
      const msg = arrive(api, 'Glimmerwick', 7, 2, 8);
      api.system("UPDATE inventory SET quantity = quantity + 4 WHERE item = 'sunpuff_seed'");
      return `${msg} Mayor Thimble sent 4 Sunpuff seeds "for the moth".`;
    },
    story:
      "A **Glimmerwick** has settled on plot 7, a moth with a tiny flame for a head, dozing in Chimnius's warmth. Mayor Thimble sent four Sunpuff seeds with a note: *for the moth*. Odd. Glimmerwicks are said to work in the dark, but nobody agrees on what they *do*.",
    task: 'Make sure some **Sunpuffs** are growing, then end the day.',
    hints: {
      nudge: 'Plant the Sunpuff seeds Thimble sent (anywhere you like), then press 🌙 End day.',
      blank: "UPDATE plots SET crop = 'sunpuff', growth = 0 WHERE id IN (SELECT id FROM plots WHERE crop IS NULL LIMIT ___);",
      answer: "Write `UPDATE plots SET crop = 'sunpuff', growth = 0 WHERE id IN (SELECT id FROM plots WHERE crop IS NULL LIMIT 4);` then press 🌙 End day.",
    },
    check: (api) => Number(api.scalar("SELECT COUNT(*) FROM farm_log WHERE event = 'pollinated'")) > 0,
    reward: { coins: 10, xp: 15 },
  },
  {
    id: 'c8-pollen',
    chapter: 8,
    kind: 'answer',
    title: 'What does the moth want?',
    story:
      "Something glowing visited some plots last night, and `farm_log` has new `'pollinated'` entries. But the log only records a `plot_id`. To see *what was growing* on those plots, you'll need to join the log to `plots`.",
    task: '**Which crops does Glimmerwick pollinate?**',
    hints: {
      nudge: "Join `farm_log` to `plots` on the plot id, and keep only the `'pollinated'` events.",
      blank: "SELECT farm_log.plot_id, plots.crop FROM farm_log JOIN plots ON farm_log.plot_id = plots.id WHERE farm_log.event = '___';",
      answer:
        "Run `SELECT farm_log.plot_id, plots.crop FROM farm_log JOIN plots ON farm_log.plot_id = plots.id WHERE farm_log.event = 'pollinated';`. Every pollinated plot is a Sunpuff, even though other crops were growing too.",
    },
    choices: ['Whatever grows next to Chimnius', 'Only Sunpuffs: it ignores every other crop', 'The crops with the lowest moisture'],
    correct: 1,
    discovers: ['glimmer_pollinate', 'glimmer_flowers'],
    reward: { coins: 20, xp: 30 },
  },
  {
    id: 'c8-kinds',
    chapter: 8,
    kind: 'query',
    title: 'Busy bodies',
    story:
      "`farm_log` knows each entry's `source` by name, but not what *kind* of creature wrote it. `creatures` knows that. Join them, then group, and you can see which kind of creature is busiest.",
    task: 'Show each creature `kind` next to how many `farm_log` entries creatures of that kind have written.',
    hints: {
      nudge: "Join `farm_log` to `creatures` where `farm_log.source = creatures.name`, then `GROUP BY creatures.kind`. (Entries from the Farmer or the Frost have no matching creature, so the join leaves them out.)",
      blank: 'SELECT creatures.kind, COUNT(*) FROM farm_log JOIN creatures ON farm_log.source = creatures.name GROUP BY ___;',
    },
    expected: 'SELECT creatures.kind, COUNT(*) FROM farm_log JOIN creatures ON farm_log.source = creatures.name GROUP BY creatures.kind',
    mustInclude: [join, groupBy],
    reward: { coins: 20, xp: 30 },
  },
  {
    id: 'c8-empty',
    chapter: 8,
    kind: 'query',
    title: 'The lonely plots',
    story:
      "A normal `JOIN` only keeps rows that have a match on *both* sides. So a plot with nobody standing on it simply… vanishes from the result. To keep those, use a **LEFT JOIN**: every row from the left table stays, and the missing right-hand side is filled with `NULL`. And you already know how to find `NULL`s!",
    task: 'List the `id` of every plot that has **no** creature standing on it.',
    concept: {
      title: 'LEFT JOIN',
      body: '`a LEFT JOIN b ON …` keeps *every* row of `a`. Where nothing in `b` matches, `b`’s columns are `NULL`. So `WHERE b.id IS NULL` finds the rows of `a` with no match at all.',
      example: 'SELECT market.item, orders.id FROM market LEFT JOIN orders ON orders.item = market.item;',
    },
    hints: {
      nudge: 'Start from `plots`, `LEFT JOIN creatures ON creatures.plot_id = plots.id`, and keep rows where the creature side is `NULL`.',
      blank: 'SELECT plots.id FROM plots LEFT JOIN creatures ON creatures.plot_id = plots.id WHERE creatures.id IS ___;',
    },
    expected: 'SELECT plots.id FROM plots LEFT JOIN creatures ON creatures.plot_id = plots.id WHERE creatures.id IS NULL',
    mustInclude: [{ pattern: /\bleft\s+(outer\s+)?join\b/i, message: 'Use a `LEFT JOIN`, so plots with no creature are kept.' }],
    reward: { coins: 25, xp: 40 },
  },

  // ─────────────────── Free play: Lantern Night ───────────────────
  {
    id: 'f5-lantern',
    chapter: 8.5,
    kind: 'goal',
    title: 'Lantern Night',
    story:
      "Every autumn, the Hollow lights the **Lantern Night** parade, and this year Mayor Thimble wants Sunpuff garlands on every lantern. Your Glimmerwick is the talk of the valley. Sunpuffs grow faster with a moth around!\n\n" +
      freePlay +
      "\n\nJoins will help you keep track: which plots have Sunpuffs, who's standing near them, and what your barn is worth.",
    task: 'Grow the garlands for Lantern Night.',
    goals: [
      { label: 'Have 12 Sunpuffs growing at once', progress: (api) => ({ have: Number(api.scalar("SELECT COUNT(*) FROM plots WHERE crop = 'sunpuff'")), need: 12 }) },
      {
        label: 'Glimmerwick pollinates 15 Sunpuffs (it manages 3 a night)',
        progress: (api) => ({
          // DISTINCT: Echolamb copies yesterday's entries, and an echo isn't a real visit.
          have: Number(
            api.scalar("SELECT COUNT(DISTINCT day || ':' || plot_id) FROM farm_log WHERE event = 'pollinated' AND day >= ?", [api.progress.questStart.day]),
          ),
          need: 15,
        }),
      },
      { label: 'Harvest 16 Sunpuffs', progress: (api) => ({ have: since(api, (s) => s.harvestedBy.sunpuff ?? 0), need: 16 }) },
      { label: 'Earn 250 coins from selling', progress: (api) => ({ have: since(api, (s) => s.earned), need: 250 }) },
      { label: 'Every creature in a good mood (6+) at the same time', progress: (api) => ({ have: lowestMood(api), need: 6 }) },
    ],
    hints: {
      nudge: 'Glimmerwick only boosts three Sunpuffs a night, the least-grown ones first. Keep some young Sunpuffs growing every night, or it has nothing to visit (and keep it fed!).',
      blank: "Plant a batch in one go: `INSERT INTO orders (action, item, quantity) VALUES ('buy', 'sunpuff_seed', 6);` then `UPDATE plots SET crop = 'sunpuff', growth = 0 WHERE id IN (SELECT id FROM plots WHERE crop IS NULL LIMIT 6);`",
      answer: 'Keep about a dozen Sunpuffs growing, feed everyone each morning, harvest ripe plots, sell, and replant. Avoid Snoutroot on the Puddlewumps’ plots!',
    },
    reward: { coins: 50, xp: 80 },
  },
  {
    id: 'f5-busiest',
    chapter: 8.5,
    kind: 'report',
    title: 'The parade marshal',
    story: 'The parade marshal, a nervous vole with a clipboard, wants the hardest-working kind of creature to lead the parade.',
    task: 'Answer the marshal.',
    question: 'Which `kind` of creature has written the most entries in your log? (Type the kind, like `mud-beast`.)',
    expected:
      'SELECT kind FROM (SELECT creatures.kind AS kind, COUNT(*) AS n FROM farm_log JOIN creatures ON farm_log.source = creatures.name GROUP BY creatures.kind) WHERE n = (SELECT MAX(n) FROM (SELECT COUNT(*) AS n FROM farm_log JOIN creatures ON farm_log.source = creatures.name GROUP BY creatures.kind))',
    hints: {
      nudge: 'Join the log to creatures, group by kind, and sort so the biggest count comes first.',
      blank: 'SELECT creatures.kind, COUNT(*) FROM farm_log JOIN creatures ON farm_log.source = creatures.name GROUP BY creatures.kind ORDER BY COUNT(*) ___ LIMIT 1;',
      answer:
        'Run `SELECT creatures.kind, COUNT(*) FROM farm_log JOIN creatures ON farm_log.source = creatures.name GROUP BY creatures.kind ORDER BY COUNT(*) DESC LIMIT 1;`',
    },
    reward: { coins: 20, xp: 30 },
  },
  {
    id: 'f5-shared',
    chapter: 8.5,
    kind: 'report',
    title: 'Company for the crops',
    story:
      '"Crops grow happier with company," the vole insists. "How many of your plots have *both* a crop growing *and* at least one creature on them?"\n\nCareful: a plot with two creatures on it shows up *twice* in a join…',
    task: 'Answer the marshal.',
    question: 'How many plots have a crop growing **and** at least one creature standing on them?',
    expected: 'SELECT COUNT(DISTINCT plots.id) FROM plots JOIN creatures ON creatures.plot_id = plots.id WHERE plots.crop IS NOT NULL',
    hints: {
      nudge: 'Join plots to creatures and keep plots with a crop. But count each *plot* only once, even if two creatures share it.',
      blank: 'SELECT COUNT(DISTINCT plots.id) FROM plots JOIN creatures ON creatures.plot_id = plots.id WHERE plots.crop IS ___;',
      answer:
        'Run `SELECT COUNT(DISTINCT plots.id) FROM plots JOIN creatures ON creatures.plot_id = plots.id WHERE plots.crop IS NOT NULL;`. `COUNT(*)` would count a plot twice if two creatures share it.',
    },
    reward: { coins: 30, xp: 40 },
  },
  // ─────────────── Chapter 9: subqueries & CTEs ───────────────
  {
    id: 'c9-land',
    chapter: 9,
    kind: 'query',
    title: 'The land office',
    story:
      "You've been piling up coins, and Mayor Thimble has noticed. The badger has opened a **land office**, and its deeds are in a new table, `land`. Six parcels of 64 plots each, every one with creatures already living there.\n\nLet's see what's for sale, cheapest first.",
    task: "Show the `name` and `price` of every parcel you don't own yet (`owned = 0`), cheapest first.",
    hints: {
      nudge: 'Filter `land` with `WHERE owned = 0` and sort by `price`.',
      blank: 'SELECT name, price FROM land WHERE owned = 0 ORDER BY ___;',
    },
    expected: 'SELECT name, price FROM land WHERE owned = 0 ORDER BY price',
    ordered: true,
    reward: { coins: 10, xp: 20 },
  },
  {
    id: 'c9-buy',
    chapter: 9,
    kind: 'action',
    title: 'Mossy Hollow',
    story:
      "**Mossy Hollow** is the cheapest: 400 coins for 64 plots, plus two Squeals, a Puddlewump and a Henbell who already live there. You buy land the same way you buy seeds: an order. Mayor Thimble reads the orders table too.",
    task: 'Buy **Mossy Hollow** with an `INSERT INTO orders`.',
    hints: {
      nudge: "The `item` is the parcel's name, and the `quantity` is 1. (If you're short of coins, sell some goods first.)",
      blank: "INSERT INTO orders (action, item, quantity) VALUES ('buy', '___', 1);",
      answer: "Write `INSERT INTO orders (action, item, quantity) VALUES ('buy', 'Mossy Hollow', 1);`",
    },
    check: (api) => Number(api.scalar("SELECT owned FROM land WHERE name = 'Mossy Hollow'")) === 1,
    reward: { coins: 20, xp: 30 },
  },
  {
    id: 'c9-fields',
    chapter: 9,
    kind: 'query',
    title: 'Too big to see',
    story:
      "Your farm is now too big to see all at once. The farm panel can only show one area at a time. From here on, the **Ledger** is how you see the whole farm. Every plot now has a `field` column saying which part of the farm it's in.",
    task: 'Show each `field` next to how many plots it has.',
    hints: {
      nudge: 'Group `plots` by `field` and count each group.',
      blank: 'SELECT field, COUNT(*) FROM plots GROUP BY ___;',
    },
    expected: 'SELECT field, COUNT(*) FROM plots GROUP BY field',
    mustInclude: [groupBy],
    reward: { coins: 10, xp: 20 },
  },
  {
    id: 'c9-above',
    chapter: 9,
    kind: 'query',
    title: 'Above average',
    story:
      "Which plots are doing better than the farm as a whole? To answer that you need *two* questions: \"what's the average growth?\" and \"which plots beat it?\". You can put the first question *inside* the second.",
    task: "Show the `id`, `field` and `growth` of every plot whose growth is above the farm's average growth.",
    concept: {
      title: 'Subqueries',
      body: 'A **subquery** is a whole `SELECT` in brackets, used inside another query. One that returns a single value can go anywhere a value can, like after `>` in a `WHERE`.',
      example: 'SELECT item FROM market WHERE sell_price > (SELECT AVG(sell_price) FROM market);',
    },
    hints: {
      nudge: 'Compare `growth` to `(SELECT AVG(growth) FROM plots)`.',
      blank: 'SELECT id, field, growth FROM plots WHERE growth > (SELECT ___(growth) FROM plots);',
    },
    expected: 'SELECT id, field, growth FROM plots WHERE growth > (SELECT AVG(growth) FROM plots)',
    mustInclude: [subquery],
    reward: { coins: 20, xp: 30 },
  },
  {
    id: 'c9-in',
    chapter: 9,
    kind: 'query',
    title: 'Standing on nothing',
    story:
      "A subquery can also return a whole *list*. Then `IN` checks whether a value is somewhere in that list. It's often a simpler way to connect tables than a `JOIN`.",
    task: 'Show the `name` of every creature standing on a plot with **no crop**.',
    concept: {
      title: 'IN (subquery)',
      body: '`WHERE x IN (SELECT …)` keeps rows whose `x` appears anywhere in the subquery’s results. The subquery must return just one column.',
      example: 'SELECT * FROM inventory WHERE item IN (SELECT item FROM market WHERE sell_price > 10);',
    },
    hints: {
      nudge: "Keep creatures whose `plot_id` is `IN` the list of empty plots' ids.",
      blank: 'SELECT name FROM creatures WHERE plot_id IN (SELECT id FROM plots WHERE crop IS ___);',
    },
    expected: 'SELECT name FROM creatures WHERE plot_id IN (SELECT id FROM plots WHERE crop IS NULL)',
    mustInclude: [subquery, { pattern: /\bin\s*\(/i, message: 'Use `IN (SELECT …)` for this one.' }],
    reward: { coins: 20, xp: 30 },
  },
  {
    id: 'c9-feed-field',
    chapter: 9,
    kind: 'action',
    title: 'Feeding one field',
    story:
      "The Mossy Hollow creatures are starving after the move, but you can't see them from here. No matter: subqueries work in the Quill too. Feed only the creatures standing in Mossy Hollow.",
    task: "Feed every creature in **Mossy Hollow** with one `UPDATE`, using `IN (SELECT …)` to pick them out.",
    hints: {
      nudge: "Feed creatures `WHERE plot_id IN` the ids of plots whose `field` is `'Mossy Hollow'`.",
      blank: "UPDATE creatures SET hunger = 0 WHERE plot_id IN (SELECT id FROM plots WHERE field = '___');",
      answer: "Write `UPDATE creatures SET hunger = 0 WHERE plot_id IN (SELECT id FROM plots WHERE field = 'Mossy Hollow');`",
    },
    check: (api) =>
      quillUses(api, 'fed') > 0 &&
      Number(api.scalar("SELECT MAX(hunger) FROM creatures WHERE plot_id IN (SELECT id FROM plots WHERE field = 'Mossy Hollow')")) <= 2,
    reward: { coins: 15, xp: 25 },
  },
  {
    id: 'c9-from',
    chapter: 9,
    kind: 'query',
    title: 'A table made of a query',
    story:
      "A query's result *is* a table. So you can put a subquery in `FROM` and query its results, like a table that only exists for a moment. Give it a name with `AS`.",
    task: "First count `farm_log` entries per `source` (call the count `n`). Then find the **average** of those counts.",
    concept: {
      title: 'Subqueries in FROM',
      body: '`SELECT … FROM (SELECT …) AS t` treats the inner query’s results as a table called `t`. Name any computed columns (`COUNT(*) AS n`) so the outer query can use them.',
      example: 'SELECT MAX(total) FROM (SELECT item, SUM(quantity) AS total FROM orders GROUP BY item) AS t;',
    },
    hints: {
      nudge: 'Inside: `SELECT source, COUNT(*) AS n FROM farm_log GROUP BY source`. Outside: `SELECT AVG(n) FROM ( … ) AS t`.',
      blank: 'SELECT AVG(n) FROM (SELECT source, COUNT(*) AS n FROM farm_log GROUP BY ___) AS t;',
    },
    expected: 'SELECT AVG(n) FROM (SELECT source, COUNT(*) AS n FROM farm_log GROUP BY source) AS t',
    mustInclude: [subquery],
    reward: { coins: 20, xp: 30 },
  },
  {
    id: 'c9-cte',
    chapter: 9,
    kind: 'query',
    title: 'The field report',
    story:
      "Subqueries inside subqueries get hard to read fast. A **CTE** lets you write the inner query *first*, give it a name, and then use it like a table. Perfect for a field report.\n\nBonus trick: `COUNT(crop)` counts only rows where `crop` isn't NULL, which is just the planted plots.",
    task: 'Using `WITH`, make a table `f` of each `field` with its `total` plots and `planted` plots. Then show the fields where **less than half** the plots are planted.',
    concept: {
      title: 'WITH (Common Table Expressions)',
      body: '`WITH name AS (SELECT …) SELECT … FROM name` defines a named, temporary result you can query below it, as many times as you like. It reads top to bottom, like a recipe.',
      example: 'WITH pricey AS (SELECT * FROM market WHERE sell_price >= 10) SELECT item FROM pricey;',
    },
    hints: {
      nudge: 'In the CTE: `SELECT field, COUNT(*) AS total, COUNT(crop) AS planted FROM plots GROUP BY field`. Then keep rows where `planted * 2 < total`.',
      blank:
        'WITH f AS (SELECT field, COUNT(*) AS total, COUNT(crop) AS planted FROM plots GROUP BY field) SELECT field, planted, total FROM f WHERE planted * 2 < ___;',
    },
    expected:
      'WITH f AS (SELECT field, COUNT(*) AS total, COUNT(crop) AS planted FROM plots GROUP BY field) SELECT field, planted, total FROM f WHERE planted * 2 < total',
    mustInclude: [{ pattern: /^\s*with\b/i, message: 'Start with `WITH f AS ( … )` for this one.' }],
    reward: { coins: 25, xp: 40 },
  },

  // ─────────────────── Free play: The Land Rush ───────────────────
  {
    id: 'f6-rush',
    chapter: 9.5,
    kind: 'goal',
    title: 'The Land Rush',
    story:
      "Word has spread that Mayor Thimble is selling land, and farmers from three valleys are eyeing the deeds. Buy what you can before they do!\n\n" +
      freePlay +
      "\n\nYou won't be able to *see* most of your farm, so let the Ledger be your eyes. A few good queries each morning will tell you where the hungry creatures, dry plots and ripe crops are.",
    task: 'Grow the farm.',
    goals: [
      { label: 'Own all 6 parcels of land', progress: (api) => ({ have: Number(api.scalar('SELECT COUNT(*) FROM land WHERE owned = 1')), need: 6 }) },
      { label: 'Have 300 plots growing crops at once', progress: (api) => ({ have: plantedNow(api), need: 300 }) },
      { label: 'Earn 5000 coins from selling', progress: (api) => ({ have: since(api, (s) => s.earned), need: 5000 }) },
      { label: 'Every creature in a good mood (6+) at the same time', progress: (api) => ({ have: lowestMood(api), need: 6 }) },
    ],
    hints: {
      nudge: 'Each morning, ask the Ledger: who is hungry, which plots are dry, and what is ripe? Then fix it all with a few writes.',
      blank: 'A field-by-field picture: `SELECT field, COUNT(crop) AS planted, SUM(growth >= 100) AS ripe, SUM(crop IS NOT NULL AND moisture = 0) AS dry FROM plots GROUP BY field;`',
      answer:
        "Morning routine: `UPDATE creatures SET hunger = 0;` `UPDATE plots SET crop = NULL WHERE growth >= 100;` sell what you harvested, buy seeds and plant with `UPDATE plots SET crop = 'sunpuff', growth = 0 WHERE id IN (SELECT id FROM plots WHERE crop IS NULL LIMIT 40);` and buy the next parcel as soon as you can afford it.",
    },
    reward: { coins: 100, xp: 100 },
  },
  {
    id: 'f6-fullest',
    chapter: 9.5,
    kind: 'report',
    title: 'The land surveyor',
    story: "A land surveyor (a hare with a very long measuring tape) is mapping the valley's farms.",
    task: 'Answer the surveyor.',
    question: 'Which `field` has the most plots planted right now? (Type the field name.)',
    expected:
      'WITH f AS (SELECT field, COUNT(crop) AS planted FROM plots GROUP BY field) SELECT field FROM f WHERE planted = (SELECT MAX(planted) FROM f)',
    hints: {
      nudge: 'Count planted plots per field (`COUNT(crop)`), then find the biggest.',
      blank: 'SELECT field, COUNT(crop) FROM plots GROUP BY field ORDER BY COUNT(crop) ___ LIMIT 1;',
      answer: 'Run `SELECT field, COUNT(crop) FROM plots GROUP BY field ORDER BY COUNT(crop) DESC LIMIT 1;`',
    },
    reward: { coins: 25, xp: 40 },
  },
  {
    id: 'f6-idle',
    chapter: 9.5,
    kind: 'report',
    title: 'Idle hooves',
    story: '"And how many of your creatures are just standing about on bare earth?" the hare asks, peering at the far fields you can’t see.',
    task: 'Answer the surveyor.',
    question: 'How many creatures are standing on plots with **no crop** right now?',
    expected: 'SELECT COUNT(*) FROM creatures WHERE plot_id IN (SELECT id FROM plots WHERE crop IS NULL)',
    hints: {
      nudge: 'Count creatures whose `plot_id` is `IN` the list of empty plots.',
      blank: 'SELECT COUNT(*) FROM creatures WHERE plot_id IN (SELECT id FROM plots WHERE crop IS ___);',
      answer: 'Run `SELECT COUNT(*) FROM creatures WHERE plot_id IN (SELECT id FROM plots WHERE crop IS NULL);`',
    },
    reward: { coins: 25, xp: 40 },
  },
  // ─────────────── Chapter 10: window functions ───────────────
  {
    id: 'c10-number',
    chapter: 10,
    kind: 'query',
    title: 'Something under the moss',
    onStart: (api) => arrive(api, 'Mossgrandle', 11, 0, 7),
    story:
      "A huge, ancient lump of moss has settled on plot 11. It has a face somewhere in there, I think. It hasn't moved, and it snores. The townsfolk call it a **Mossgrandle**, and say it's the oldest thing in the Hollow.\n\nThat makes me think about time. Your Ledger now holds weeks of history, and **window functions** let one row look at the rows around it: numbering them, ranking them, keeping running totals, comparing with yesterday. Let's start simple.",
    task: 'Show every parcel in `land` with its `name`, `price` and a number `n` counting from 1, cheapest first.',
    concept: {
      title: 'Window functions: … OVER ( … )',
      body: 'A **window function** calculates something for each row using a "window" of other rows, *without* squashing them together like `GROUP BY` does. `ROW_NUMBER() OVER (ORDER BY x)` numbers the rows 1, 2, 3… in order of `x`.',
      example: 'SELECT item, sell_price, ROW_NUMBER() OVER (ORDER BY sell_price DESC) AS n FROM market;',
    },
    hints: {
      nudge: 'Add `ROW_NUMBER() OVER (ORDER BY price) AS n` to your list of columns.',
      blank: 'SELECT name, price, ROW_NUMBER() OVER (ORDER BY ___) AS n FROM land;',
    },
    expected: 'SELECT name, price, ROW_NUMBER() OVER (ORDER BY price) AS n FROM land',
    mustInclude: [over],
    reward: { coins: 20, xp: 30 },
  },
  {
    id: 'c10-rank',
    chapter: 10,
    kind: 'query',
    title: 'Ties for first place',
    story:
      "`ROW_NUMBER` always counts 1, 2, 3, even when two rows are tied. That isn't fair in a contest! `RANK` gives tied rows the *same* rank, then skips ahead. Your barn has lots of ties: plenty of items sit at zero.",
    task: 'Rank the items in `inventory` by `quantity`, biggest first, using `RANK()`. Show `item`, `quantity` and the rank.',
    concept: {
      title: 'RANK and DENSE_RANK',
      body: '`RANK() OVER (ORDER BY x DESC)` gives ties the same rank and then skips (1, 1, 3). `DENSE_RANK()` doesn’t skip (1, 1, 2). `ROW_NUMBER()` never ties (1, 2, 3).',
      example: 'SELECT name, mood, RANK() OVER (ORDER BY mood DESC) FROM creatures;',
    },
    hints: {
      nudge: 'Use `RANK() OVER (ORDER BY quantity DESC)`.',
      blank: 'SELECT item, quantity, RANK() OVER (ORDER BY quantity ___) FROM inventory;',
    },
    expected: 'SELECT item, quantity, RANK() OVER (ORDER BY quantity DESC) FROM inventory',
    mustInclude: [over, { pattern: /\brank\s*\(/i, message: 'Use `RANK()` here, so ties share a place.' }],
    reward: { coins: 20, xp: 30 },
  },
  {
    id: 'c10-running',
    chapter: 10,
    kind: 'query',
    title: 'The money mountain',
    story:
      "Every sale you've made is in `orders`. Let's watch your fortune grow, day by day.\n\nWith `ORDER BY` inside the `OVER`, `SUM` stops being one big total and becomes a **running total**: each row adds up everything up to and including itself.",
    task:
      "Using the CTE `daily` (each `day`'s coins from `'sell'` orders, as `earned`), show each `day`, its `earned`, and a running total called `running`.",
    concept: {
      title: 'Running totals: SUM(…) OVER (ORDER BY …)',
      body: '`SUM(x) OVER (ORDER BY day)` adds up `x` for every row from the first day up to the current one. `AVG`, `COUNT`, `MIN` and `MAX` work the same way.',
      example: 'SELECT day, temperature, AVG(temperature) OVER (ORDER BY day) AS avg_so_far FROM weather WHERE day <= 10;',
    },
    hints: {
      nudge: `Start with: ${'`'}${DAILY}${'`'}, then select from \`daily\` with \`SUM(earned) OVER (ORDER BY day)\`.`,
      blank: `${DAILY} SELECT day, earned, SUM(earned) OVER (ORDER BY ___) AS running FROM daily;`,
    },
    expected: `${DAILY} SELECT day, earned, SUM(earned) OVER (ORDER BY day) AS running FROM daily`,
    mustInclude: [over],
    reward: { coins: 25, xp: 35 },
  },
  {
    id: 'c10-lag',
    chapter: 10,
    kind: 'query',
    title: 'Better than yesterday?',
    story:
      "Was today a better day than yesterday? To answer that, each row needs to peek at the row *before* it. That's exactly what `LAG` does.",
    task: "Using the same `daily` CTE, show each `day`, its `earned`, and the `change` from the previous selling day (`earned` minus the previous day's `earned`).",
    concept: {
      title: 'LAG and LEAD',
      body: '`LAG(x) OVER (ORDER BY day)` is the value of `x` on the *previous* row; `LEAD(x)` is the *next* row. The first row has no previous one, so its `LAG` is `NULL`.',
      example: 'SELECT day, temperature, temperature - LAG(temperature) OVER (ORDER BY day) AS change FROM weather WHERE day <= 10;',
    },
    hints: {
      nudge: 'Subtract `LAG(earned) OVER (ORDER BY day)` from `earned`.',
      blank: `${DAILY} SELECT day, earned, earned - ___(earned) OVER (ORDER BY day) AS change FROM daily;`,
    },
    expected: `${DAILY} SELECT day, earned, earned - LAG(earned) OVER (ORDER BY day) AS change FROM daily`,
    mustInclude: [over, { pattern: /\blag\s*\(/i, message: 'Use `LAG(earned)` to peek at the previous day.' }],
    reward: { coins: 25, xp: 35 },
  },
  {
    id: 'c10-best',
    chapter: 10,
    kind: 'query',
    title: 'The best plot in every field',
    story:
      "Mayor Thimble is giving a rosette to the best plot in **each** field. `PARTITION BY` restarts the window for every group, so numbering starts again at 1 in each field. Then keep just the 1s.\n\nOne catch: window functions are worked out *after* `WHERE`, so you can't filter on them directly. Wrap them in a CTE first.",
    task:
      'For each `field`, show the plot with the highest `growth` (`field`, `id`, `growth`). Break ties by the lowest `id`.',
    concept: {
      title: 'PARTITION BY',
      body: '`ROW_NUMBER() OVER (PARTITION BY field ORDER BY growth DESC)` numbers rows separately within each field. Keep `n = 1` in an outer query to get the top row per group.',
      example: 'SELECT name, kind, ROW_NUMBER() OVER (PARTITION BY kind ORDER BY name) AS n FROM creatures;',
    },
    hints: {
      nudge: 'In a CTE, number plots `PARTITION BY field ORDER BY growth DESC, id`. Then keep rows `WHERE n = 1`.',
      blank:
        'WITH r AS (SELECT field, id, growth, ROW_NUMBER() OVER (PARTITION BY ___ ORDER BY growth DESC, id) AS n FROM plots) SELECT field, id, growth FROM r WHERE n = 1;',
    },
    expected:
      'WITH r AS (SELECT field, id, growth, ROW_NUMBER() OVER (PARTITION BY field ORDER BY growth DESC, id) AS n FROM plots) SELECT field, id, growth FROM r WHERE n = 1',
    mustInclude: [over, { pattern: /\bpartition\s+by\b/i, message: 'Use `PARTITION BY field` so the numbering restarts in each field.' }],
    reward: { coins: 30, xp: 40 },
  },
  {
    id: 'c10-moss-wait',
    chapter: 10,
    kind: 'action',
    title: 'Watching the moss',
    story:
      "That Mossgrandle has done nothing but snore. But last night I could have sworn I heard a great green *sigh*… Let's keep farming and keep an eye on the log. One night won't tell us much. We need to see it happen **twice**.",
    task: "Keep farming (ending days) until Mossgrandle's `'bloomed'` event has happened on **two** different days.",
    hints: {
      nudge: "Check with `SELECT day, amount FROM farm_log WHERE event = 'bloomed';` each morning.",
      blank: 'Keep your morning routine going and press 🌙 End day. It may take several nights.',
      answer: "End days (feeding everyone as usual) until `SELECT COUNT(DISTINCT day) FROM farm_log WHERE event = 'bloomed';` shows 2.",
    },
    check: (api) => bloomDaysSince(api, 0) >= 2,
    reward: { coins: 15, xp: 20 },
  },
  {
    id: 'c10-moss-why',
    chapter: 10,
    kind: 'answer',
    title: 'The rhythm of the moss',
    story:
      "There it is: the Mossgrandle *does* wake up. But how often? With `LAG` you can put each bloom next to the one before it, and see the gap. (Use `DISTINCT` days. Echolamb copies the log, remember!)",
    task: '**How often does Mossgrandle bloom?**',
    hints: {
      nudge: "Take the distinct days with a `'bloomed'` event, and subtract `LAG(day)` from each one.",
      blank: "SELECT day, day - LAG(day) OVER (ORDER BY day) AS gap FROM (SELECT DISTINCT day FROM farm_log WHERE event = '___');",
      answer:
        "Run `SELECT day, day - LAG(day) OVER (ORDER BY day) AS gap FROM (SELECT DISTINCT day FROM farm_log WHERE event = 'bloomed');`. The gap is always 4.",
    },
    choices: ['Every night, but you only notice sometimes', 'Every 4th night, regular as clockwork', 'Only on nights when it rains'],
    correct: 1,
    discovers: ['moss_bloom', 'moss_sleep'],
    reward: { coins: 25, xp: 40 },
  },

  // ─────────────────── Free play: Record Season ───────────────────
  {
    id: 'f7-records',
    chapter: 10.5,
    kind: 'goal',
    title: 'Record Season',
    story:
      "The Hollow's merchants keep a **records board**, and Mayor Thimble wants your name at the top. This one isn't about *how much* you grow. It's about *when* you sell. Your barn can hold goods back for a better day…\n\n" +
      freePlay +
      "\n\nYour running-total and `LAG` queries from this chapter will show you exactly how each day compares.",
    task: 'Set the records.',
    goals: [
      { label: 'Grow your daily sales 3 days in a row', progress: (api) => ({ have: longestRise(api), need: 3 }) },
      {
        label: 'Beat your best-ever day of sales',
        progress: (api) => {
          const start = api.progress.questStart.day;
          const before = Number(api.scalar("SELECT COALESCE(MAX(t), 0) FROM (SELECT SUM(total) AS t FROM orders WHERE action = 'sell' AND day < ? GROUP BY day)", [start]));
          const since = Math.max(0, ...dailySales(api, start, api.day));
          return { have: since, need: before + 1 };
        },
      },
      { label: 'See Mossgrandle bloom twice more', progress: (api) => ({ have: bloomDaysSince(api, api.progress.questStart.day), need: 2 }) },
      { label: 'Every creature in a good mood (6+) at the same time', progress: (api) => ({ have: lowestMood(api), need: 6 }) },
    ],
    hints: {
      nudge: "You don't have to sell everything at once. Keep some goods back, and sell a little more each day than the day before.",
      blank: `See how each day compares: ${'`'}${DAILY} SELECT day, earned, earned - LAG(earned) OVER (ORDER BY day) AS change FROM daily;${'`'}`,
      answer:
        "Stop selling for a day or two to build up stock. Then sell a bit more each day than the day before (check yesterday's total with the `LAG` query). For the record day, save up and sell everything at once.",
    },
    reward: { coins: 100, xp: 100 },
  },
  {
    id: 'f7-jump',
    chapter: 10.5,
    kind: 'report',
    title: 'The records board',
    story: 'The records clerk, a very precise owl, wants one more line for the board.',
    task: 'Answer the clerk.',
    question: 'What is the **biggest increase** in sales from one selling day to the next, in coins?',
    expected: `${DAILY}, c AS (SELECT earned - LAG(earned) OVER (ORDER BY day) AS change FROM daily) SELECT MAX(change) FROM c`,
    hints: {
      nudge: 'Work out each day’s change with `LAG`, then take the `MAX` of those changes.',
      blank: `${DAILY}, c AS (SELECT earned - LAG(earned) OVER (ORDER BY day) AS change FROM daily) SELECT ___(change) FROM c;`,
      answer: `Run ${'`'}${DAILY}, c AS (SELECT earned - LAG(earned) OVER (ORDER BY day) AS change FROM daily) SELECT MAX(change) FROM c;${'`'}`,
    },
    reward: { coins: 30, xp: 40 },
  },
  {
    id: 'f7-second',
    chapter: 10.5,
    kind: 'report',
    title: 'The silver medal',
    story: '"Everyone remembers first place," hoots the owl. "I like to honour second."',
    task: 'Answer the clerk.',
    question: 'Which `kind` of creature is **second** most common on your farm? (Type the kind, like `bell-fowl`.)',
    expected:
      'WITH k AS (SELECT kind, COUNT(*) AS n FROM creatures GROUP BY kind), r AS (SELECT kind, DENSE_RANK() OVER (ORDER BY n DESC) AS place FROM k) SELECT kind FROM r WHERE place = 2',
    hints: {
      nudge: 'Count creatures per kind, then rank the kinds by that count with `DENSE_RANK()` and keep rank 2.',
      blank:
        'WITH k AS (SELECT kind, COUNT(*) AS n FROM creatures GROUP BY kind), r AS (SELECT kind, DENSE_RANK() OVER (ORDER BY n DESC) AS place FROM k) SELECT kind FROM r WHERE place = ___;',
      answer:
        'Run `WITH k AS (SELECT kind, COUNT(*) AS n FROM creatures GROUP BY kind), r AS (SELECT kind, DENSE_RANK() OVER (ORDER BY n DESC) AS place FROM k) SELECT kind FROM r WHERE place = 2;`',
    },
    reward: { coins: 30, xp: 40 },
  },
];

export function chapterOf(q: Quest): Chapter {
  return CHAPTERS.find((c) => c.n === q.chapter) ?? CHAPTERS[0];
}

import type { Chapter, Quest, QuestApi, Stats } from '../types';
import { SPECIES } from './creatures';
import { plotDistance } from './schema';

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
const groupBy = { pattern: /\bgroup\s+by\b/i, message: 'Use `GROUP BY` to make one row per group.' };
const isNull = { pattern: /\bis\s+(not\s+)?null\b/i, message: 'Use `IS NULL` (or `IS NOT NULL`) to test for missing values.' };
const distinct = { pattern: /\bdistinct\b/i, message: 'Use `DISTINCT` to remove the repeats.' };

/** How much a stat has grown since the current quest started. */
function since(api: QuestApi, pick: (s: Stats) => number): number {
  return pick(api.progress.stats) - pick(api.progress.questStart.stats);
}
const lowestMood = (api: QuestApi) => Number(api.scalar('SELECT MIN(mood) FROM creatures') ?? 0);
const plantedNow = (api: QuestApi) => Number(api.scalar('SELECT COUNT(*) FROM plots WHERE crop IS NOT NULL'));
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
      return plotDistance(h, c) > 1;
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
];

export function chapterOf(q: Quest): Chapter {
  return CHAPTERS.find((c) => c.n === q.chapter) ?? CHAPTERS[0];
}

import type { Database, SqlValue } from 'sql.js';
import { CROPS } from './data/crops';
import { speciesOf } from './data/creatures';
import { gridDistance, plotPositions } from './data/schema';
import type { NightReport } from './types';

interface CreatureRow {
  id: number;
  name: string;
  kind: string;
  plot_id: number;
  hunger: number;
  mood: number;
}

interface PlotRow {
  id: number;
  crop: string | null;
  growth: number;
  moisture: number;
  warmth: number;
  tilled: number;
}

function all<T>(db: Database, sql: string, params: SqlValue[] = []): T[] {
  const st = db.prepare(sql);
  st.bind(params);
  const out: T[] = [];
  while (st.step()) out.push(st.getAsObject() as T);
  st.free();
  return out;
}

/** Mossgrandle blooms on nights whose day number is a multiple of this. */
export const MOSS_CYCLE = 4;
export const MOSS_BOOST = 40;

const clamp = (n: number, lo = 0, hi = 10) => Math.max(lo, Math.min(hi, n));

/** "Henbell", "Henbell and Clang", "Henbell, Clang and Peal". */
export function listNames(names: (string | number)[]): string {
  let xs = names.map(String);
  if (xs.length > 6) xs = [...xs.slice(0, 5), `${xs.length - 5} others`];
  return xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/**
 * Runs one night on the farm: creatures act, weather hits, crops grow,
 * and the day counter advances. Everything that happens is written to farm_log.
 */
export function runNight(db: Database): NightReport {
  const day = Number(all<{ day: number }>(db, 'SELECT day FROM farm')[0].day);
  const weather = all<{ temperature: number; sky: string }>(db, 'SELECT temperature, sky FROM weather WHERE day = ?', [day])[0] ?? {
    temperature: 10,
    sky: 'cloudy',
  };
  const creatures = all<CreatureRow>(db, 'SELECT id, name, kind, plot_id, hunger, mood FROM creatures');
  const pos = plotPositions(db);
  const plotDistance = (a: number, b: number) => {
    const pa = pos.get(a);
    const pb = pos.get(b);
    return pa && pb ? gridDistance(pa, pb) : Infinity;
  };
  const species = (c: CreatureRow) => speciesOf(c)?.name;
  const plots = all<PlotRow>(db, 'SELECT id, crop, growth, moisture, warmth, tilled FROM plots');
  const lines: string[] = [];
  // Who did what tonight, so a big farm gets one line per kind of event, not one per creature.
  const did = new Map<string, string[]>();
  const note = (what: string, who: string | number) => did.set(what, [...(did.get(what) ?? []), String(who)]);
  const who = (what: string) => did.get(what) ?? [];

  const log = (source: string, plotId: number, event: string, amount: number) =>
    db.run('INSERT INTO farm_log (day, source, plot_id, event, amount) VALUES (?, ?, ?, ?, ?)', [day, source, plotId, event, amount]);
  const addItem = (item: string, n: number) => db.run('UPDATE inventory SET quantity = quantity + ? WHERE item = ?', [n, item]);

  // Everyone gets hungrier; only fed, cheerful creatures work.
  for (const c of creatures) if (!speciesOf(c)?.ethereal) c.hunger = clamp(c.hunger + 2);
  const works = new Map(creatures.map((c) => [c.id, c.hunger < 8 && c.mood > 3]));
  const moodDelta = new Map(creatures.map((c) => [c.id, 0]));
  const bump = (id: number, d: number) => moodDelta.set(id, (moodDelta.get(id) ?? 0) + d);

  const chimniuses = creatures.filter((c) => species(c) === 'Chimnius');
  let echoed = false;
  const plotById = new Map(plots.map((p) => [p.id, p]));
  const watered = new Set<number>();
  const soggy = new Map<number, string>();
  let nullkinPlot: number | null = null;
  /** Plot → the Glimmerwick pollinating it tonight. */
  const pollinated = new Map<number, string>();
  /** Plots a blooming Mossgrandle fertilises tonight. */
  const bloomed = new Set<number>();

  for (const c of creatures) {
    const working = works.get(c.id);
    switch (species(c)) {
      case 'Squeal':
        if (working) {
          const p = plotById.get(c.plot_id);
          if (p) p.tilled = 1;
          log(c.name, c.plot_id, 'tilled', 1);
          note('tilled', c.name);
        }
        break;
      case 'Henbell':
        if (working) {
          addItem('egg', 1);
          log(c.name, c.plot_id, 'laid_egg', 1);
          note('egg', c.name);
        }
        log(c.name, c.plot_id, 'rang_bell', 1);
        for (const other of creatures) if (other.id !== c.id) bump(other.id, 1);
        break;
      case 'Sortoise':
        if (working) {
          addItem('shiny_pebble', 1);
          log(c.name, c.plot_id, 'found', 1);
          note('dug', c.name);
        }
        break;
      case 'Chimnius':
        log(c.name, c.plot_id, 'puffed_smoke', 1);
        break;
      case 'Puddlewump':
        if (working) {
          for (const p of plots) {
            if (plotDistance(c.plot_id, p.id) <= 1) {
              watered.add(p.id);
              log(c.name, p.id, 'watered', 1);
            }
          }
          note('watered', c.name);
        }
        // Wet or not, a puddle's own plot is always soggy.
        soggy.set(c.plot_id, c.name);
        break;
      case 'Echolamb': {
        if (working) {
          addItem('echo_wool', 1);
          log(c.name, c.plot_id, 'grew_wool', 1);
          note('wool', c.name);
        }
        // The echo happens once a night, however many Echolambs there are.
        if (echoed) break;
        echoed = true;
        // "Repeats yesterday": copies the previous night's entries as exact duplicates.
        const before = Number(all<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM farm_log')[0].n);
        db.run(
          `INSERT INTO farm_log (day, source, plot_id, event, amount)
           SELECT day, source, plot_id, event, amount FROM farm_log
           WHERE day = ? AND source IS NOT NULL AND source NOT IN ('Echolamb', 'Frost', 'Farmer')`,
          [day - 1],
        );
        const copies = Number(all<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM farm_log')[0].n) - before;
        if (copies) lines.push(`🐑 Baa… baa… baa… (the Ledger feels oddly repetitive).`);
        break;
      }
      case 'Nullkin':
        nullkinPlot = c.plot_id;
        break;
      case 'Mossgrandle': {
        // Sleeps, and every few nights wakes to fertilise everything within two steps, all at once.
        if (day % MOSS_CYCLE === 0) {
          const near = plots.filter((p) => plotDistance(c.plot_id, p.id) <= 2 && p.crop && p.growth < 100);
          for (const p of near) bloomed.add(p.id);
          log(c.name, c.plot_id, 'bloomed', near.length);
          note('bloomed', c.plot_id);
        } else {
          log(c.name, c.plot_id, 'snored', 1);
          note('snored', c.name);
        }
        break;
      }
      case 'Glimmerwick':
        // Flies anywhere on the farm to the three least-grown Sunpuffs (it only loves flowers).
        if (working) {
          const flowers = plots
            .filter((p) => p.crop === 'sunpuff' && p.growth < 100 && !pollinated.has(p.id))
            .sort((a, b) => a.growth - b.growth || a.id - b.id)
            .slice(0, 3);
          for (const p of flowers) pollinated.set(p.id, c.name);
          if (!flowers.length) note('fluttered', c.name);
        }
        break;
    }
  }

  // Smoke bothers sensitive creatures near any Chimnius.
  for (const c of creatures) {
    if (!speciesOf(c)?.dislikesSmoke) continue;
    if (chimniuses.some((ch) => plotDistance(ch.plot_id, c.plot_id) <= 1)) {
      bump(c.id, -2);
      log(c.name, c.plot_id, 'coughed', 1);
      note('coughed', c.name);
    }
  }

  // Hunger affects mood.
  for (const c of creatures) {
    if (speciesOf(c)?.ethereal) {
      // Ghosts don't eat, so they neither grumble nor perk up from food.
    } else if (c.hunger >= 8) {
      bump(c.id, -1);
      log(c.name, c.plot_id, 'grumbled', 1);
      note('grumbled', c.name);
    } else if (c.hunger < 5) {
      bump(c.id, 1);
    }
    c.mood = clamp(c.mood + (moodDelta.get(c.id) ?? 0));
    db.run('UPDATE creatures SET hunger = ?, mood = ? WHERE id = ?', [c.hunger, c.mood, c.id]);
  }

  // Weather and crops.
  let frosted = 0;
  let lost = 0;
  for (const p of plots) {
    let bonus = 0;
    for (const ch of chimniuses) {
      const d = plotDistance(ch.plot_id, p.id);
      if (d === 0) bonus += 8;
      else if (d === 1) bonus += 5;
    }
    p.warmth = weather.temperature + bonus;
    p.moisture = weather.sky === 'rain' || watered.has(p.id) ? 3 : Math.max(0, p.moisture - 1);

    if (p.warmth < 0) {
      frosted++;
      log('Frost', p.id, 'frost', 1);
      if (p.crop) {
        lost++;
        p.crop = null;
        p.growth = 0;
      }
    } else if (p.crop === 'snoutroot' && soggy.has(p.id) && p.growth < 100) {
      // Root crops rot in a puddle's soggy soil instead of growing.
      p.growth = Math.max(0, p.growth - 15);
      log(soggy.get(p.id)!, p.id, 'rotted', 1);
      note('rotted', p.id);
    } else if (p.crop && p.growth < 100) {
      const crop = CROPS[p.crop];
      const rate = crop ? crop.rate : 25;
      const grow = Math.round(p.moisture > 0 ? rate : rate / 2) + (p.tilled ? 10 : 0);
      const pollen = pollinated.has(p.id) ? 15 : 0;
      if (pollen) {
        log(pollinated.get(p.id)!, p.id, 'pollinated', pollen);
        note('pollinated', p.id);
      }
      const moss = bloomed.has(p.id) ? MOSS_BOOST : 0;
      p.growth = Math.min(100, p.growth + grow + pollen + moss);
    }
    db.run('UPDATE plots SET crop = ?, growth = ?, moisture = ?, warmth = ?, tilled = ? WHERE id = ?', [
      p.crop,
      p.growth,
      p.moisture,
      p.warmth,
      p.tilled,
      p.id,
    ]);
  }
  const one = (what: string) => who(what).length === 1;
  if (who('tilled').length) lines.push(`🐷 ${listNames(who('tilled'))} tilled ${one('tilled') ? 'its plot' : 'their plots'}.`);
  if (who('egg').length) lines.push(one('egg') ? `🥚 ${who('egg')[0]} laid an egg.` : `🥚 ${who('egg').length} eggs laid (${listNames(who('egg'))}).`);
  if (who('dug').length) lines.push(`🐢 ${listNames(who('dug'))} dug ${one('dug') ? 'something' : 'things'} up.`);
  if (who('watered').length) lines.push(`💧 ${listNames(who('watered'))} watered the plots around ${one('watered') ? 'it' : 'them'}.`);
  if (who('bloomed').length) lines.push(`🌿 Something let out a great green sigh, and the crops around plot ${listNames(who('bloomed'))} shot up!`);
  if (who('snored').length) lines.push('💤 Something snored very deeply all night.');
  if (who('pollinated').length) lines.push(`🕯️ Something glowing visited plot${one('pollinated') ? '' : 's'} ${listNames(who('pollinated'))} in the dark.`);
  if (who('fluttered').length) lines.push(`🕯️ ${listNames(who('fluttered'))} fluttered about all night, looking for something.`);
  if (who('wool').length) lines.push(`🧶 ${listNames(who('wool'))} grew ${one('wool') ? 'a bundle' : 'bundles'} of wool.`);
  if (who('coughed').length) lines.push(`😷 ${listNames(who('coughed'))} coughed all night.`);
  if (who('grumbled').length) lines.push(`😠 ${listNames(who('grumbled'))} grumbled with hunger.`);
  if (who('rotted').length) lines.push(`🤢 Snoutroot is rotting in soggy soil on plot${one('rotted') ? '' : 's'} ${listNames(who('rotted'))}.`);
  if (weather.sky === 'rain') lines.push('🌧️ Rain soaked every plot.');
  if (frosted) lines.push(`❄️ Frost hit ${frosted} plot${frosted === 1 ? '' : 's'}${lost ? ` — ${lost} crop${lost === 1 ? '' : 's'} lost!` : '.'}`);

  // The Nullkin nibbles last, after everything else has been written down.
  if (nullkinPlot !== null) {
    db.run(
      `UPDATE farm_log SET amount = NULL WHERE id = (
         SELECT MIN(id) FROM farm_log WHERE day = ? AND amount IS NOT NULL AND source IS NOT NULL AND source != 'Frost'
       )`,
      [day],
    );
    db.run('INSERT INTO farm_log (day, source, plot_id, event, amount) VALUES (?, NULL, ?, ?, 1)', [day, nullkinPlot, 'nibbled']);
    lines.push('👻 Something rustled the pages of the Ledger…');
  }

  const ready = plots.filter((p) => p.crop && p.growth >= 100).length;
  if (ready) lines.push(`✨ ${ready} plot${ready === 1 ? ' is' : 's are'} ready to harvest.`);

  db.run('UPDATE farm SET day = day + 1');
  if (lines.length === 0) lines.push('A quiet night. Nothing much happened.');
  return { day, lines };
}

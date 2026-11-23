import type { Database, SqlValue } from 'sql.js';
import { CROPS } from './data/crops';
import { SPECIES } from './data/creatures';
import { plotDistance } from './data/schema';
import type { NightReport } from './types';

interface CreatureRow {
  id: number;
  name: string;
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

const clamp = (n: number, lo = 0, hi = 10) => Math.max(lo, Math.min(hi, n));

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
  const creatures = all<CreatureRow>(db, 'SELECT id, name, plot_id, hunger, mood FROM creatures');
  const plots = all<PlotRow>(db, 'SELECT id, crop, growth, moisture, warmth, tilled FROM plots');
  const lines: string[] = [];

  const log = (source: string, plotId: number, event: string, amount: number) =>
    db.run('INSERT INTO farm_log (day, source, plot_id, event, amount) VALUES (?, ?, ?, ?, ?)', [day, source, plotId, event, amount]);
  const addItem = (item: string, n: number) => db.run('UPDATE inventory SET quantity = quantity + ? WHERE item = ?', [n, item]);

  // Everyone gets hungrier; only fed, cheerful creatures work.
  for (const c of creatures) if (!SPECIES[c.name]?.ethereal) c.hunger = clamp(c.hunger + 2);
  const works = new Map(creatures.map((c) => [c.id, c.hunger < 8 && c.mood > 3]));
  const moodDelta = new Map(creatures.map((c) => [c.id, 0]));
  const bump = (id: number, d: number) => moodDelta.set(id, (moodDelta.get(id) ?? 0) + d);

  const chimniuses = creatures.filter((c) => c.name === 'Chimnius');
  const plotById = new Map(plots.map((p) => [p.id, p]));
  const watered = new Set<number>();
  const soggy = new Set<number>();
  let nullkinPlot: number | null = null;

  for (const c of creatures) {
    const working = works.get(c.id);
    switch (c.name) {
      case 'Squeal':
        if (working) {
          const p = plotById.get(c.plot_id);
          if (p) p.tilled = 1;
          log(c.name, c.plot_id, 'tilled', 1);
          lines.push(`🐷 Squeal tilled plot ${c.plot_id}.`);
        }
        break;
      case 'Henbell':
        if (working) {
          addItem('egg', 1);
          log(c.name, c.plot_id, 'laid_egg', 1);
          lines.push('🥚 Henbell laid an egg.');
        }
        log(c.name, c.plot_id, 'rang_bell', 1);
        for (const other of creatures) if (other.id !== c.id) bump(other.id, 1);
        break;
      case 'Sortoise':
        if (working) {
          addItem('shiny_pebble', 1);
          log(c.name, c.plot_id, 'found', 1);
          lines.push('🐢 Sortoise dug something up.');
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
          lines.push(`💧 Puddlewump watered the plots around plot ${c.plot_id}.`);
        }
        // Wet or not, a puddle's own plot is always soggy.
        soggy.add(c.plot_id);
        break;
      case 'Echolamb': {
        if (working) {
          addItem('echo_wool', 1);
          log(c.name, c.plot_id, 'grew_wool', 1);
          lines.push('🧶 Echolamb grew a bundle of wool.');
        }
        // "Repeats yesterday": copies the previous night's entries as exact duplicates.
        const before = Number(all<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM farm_log')[0].n);
        db.run(
          `INSERT INTO farm_log (day, source, plot_id, event, amount)
           SELECT day, source, plot_id, event, amount FROM farm_log
           WHERE day = ? AND source IS NOT NULL AND source NOT IN ('Echolamb', 'Frost', 'Farmer')`,
          [day - 1],
        );
        const echoed = Number(all<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM farm_log')[0].n) - before;
        if (echoed) lines.push(`🐑 Baa… baa… baa… (the Ledger feels oddly repetitive).`);
        break;
      }
      case 'Nullkin':
        nullkinPlot = c.plot_id;
        break;
    }
  }

  // Smoke bothers sensitive creatures near any Chimnius.
  for (const c of creatures) {
    if (!SPECIES[c.name]?.dislikesSmoke) continue;
    if (chimniuses.some((ch) => plotDistance(ch.plot_id, c.plot_id) <= 1)) {
      bump(c.id, -2);
      log(c.name, c.plot_id, 'coughed', 1);
      lines.push(`😷 ${c.name} coughed all night.`);
    }
  }

  // Hunger affects mood.
  for (const c of creatures) {
    if (SPECIES[c.name]?.ethereal) {
      // Ghosts don't eat, so they neither grumble nor perk up from food.
    } else if (c.hunger >= 8) {
      bump(c.id, -1);
      log(c.name, c.plot_id, 'grumbled', 1);
      lines.push(`😠 ${c.name} grumbled with hunger.`);
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
      log('Puddlewump', p.id, 'rotted', 1);
      lines.push(`🤢 The Snoutroot on plot ${p.id} is rotting in soggy soil.`);
    } else if (p.crop && p.growth < 100) {
      const crop = CROPS[p.crop];
      const rate = crop ? crop.rate : 25;
      const grow = Math.round(p.moisture > 0 ? rate : rate / 2) + (p.tilled ? 10 : 0);
      p.growth = Math.min(100, p.growth + grow);
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

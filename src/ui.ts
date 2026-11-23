import type { SqlValue } from 'sql.js';
import { CROPS, GOODS, itemEmoji, itemLabel } from './data/crops';
import { COMING_SOON, SPECIES } from './data/creatures';
import { chapterOf, QUESTS } from './data/quests';
import { areaOf, fieldName } from './data/schema';
import { BADGES, type Action, type Game, type QueryOutcome, type Toast } from './game';
import { isSqlTemplate } from './sqlHelp';

// ───────────── tiny helpers ─────────────

const esc = (s: unknown) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Escapes, then supports `code`, **bold**, *italic* and line breaks. For trusted game text. */
function md(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

const SKY: Record<string, string> = { sunny: '☀️', cloudy: '☁️', rain: '🌧️', frost: '❄️' };

function meter(value: number, max: number, cls: string, label: string): string {
  const pct = Math.round((value / max) * 100);
  return `<span class="meter ${cls}" role="meter" aria-label="${esc(label)}" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="${max}"><span style="width:${pct}%"></span></span>`;
}

function cell(v: SqlValue): string {
  if (v === null) return '<span class="null">NULL</span>';
  if (typeof v === 'number' && !Number.isInteger(v)) return esc(Number(v.toFixed(4)));
  if (v instanceof Uint8Array) return `<span class="null">[blob]</span>`;
  return esc(v);
}

function table(columns: string[], rows: SqlValue[][], limit = 200): string {
  const head = columns.map((c) => `<th>${esc(c)}</th>`).join('');
  const body = rows
    .slice(0, limit)
    .map((r) => `<tr>${r.map((v) => `<td>${cell(v)}</td>`).join('')}</tr>`)
    .join('');
  const more = rows.length > limit ? `<p class="muted small">…and ${rows.length - limit} more rows</p>` : '';
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${more}`;
}

interface CreatureRow {
  id: number;
  name: string;
  kind: string;
  emoji: string;
  plot_id: number;
  hunger: number;
  mood: number;
}

interface PlotRow {
  id: number;
  row: number;
  col: number;
  crop: string | null;
  growth: number;
  moisture: number;
  warmth: number;
  tilled: number;
  field: string;
}

/** A plot placed on the visible grid (positions relative to the area being shown). */
type ShownPlot = PlotRow & { gr: number; gc: number };

// ───────────── the UI ─────────────

export function mountUI(root: HTMLElement, game: Game) {
  root.innerHTML = `
    <header class="topbar" id="topbar"></header>
    <main class="layout">
      <section class="col farm-col" aria-label="Your farm">
        <div class="panel" id="night"></div>
        <div class="panel" id="farm"></div>
        <div class="panel" id="creatures"></div>
        <div class="panel" id="barn"></div>
      </section>
      <section class="col quest-col" aria-label="Quest and Ledger">
        <div class="panel quest" id="quest"></div>
        <div class="panel ledger">
          <div class="panel-head">
            <h2>📜 The Ledger <span id="quill-badge"></span></h2>
            <span class="muted small">Ctrl/⌘ + Enter to run</span>
          </div>
          <textarea id="sql" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="SQL query" placeholder="SELECT * FROM creatures;"></textarea>
          <div class="row">
            <button class="btn primary" id="run">Run query ▶</button>
            <button class="btn ghost" id="clear">Clear</button>
          </div>
          <div id="result" aria-live="polite"></div>
        </div>
      </section>
      <aside class="col side-col" aria-label="Reference">
        <div class="panel">
          <div class="tabs" role="tablist" id="tabs"></div>
          <div id="side"></div>
        </div>
      </aside>
    </main>
    <div class="toasts" id="toasts" aria-live="polite"></div>
  `;

  const $ = (id: string) => root.querySelector<HTMLElement>('#' + id)!;
  const editor = $('sql') as HTMLTextAreaElement;
  let selectedPlot: number | null = null;
  /** The farm is too big to show at once: one area (the home farm, or one parcel) at a time. */
  let currentArea = 'Home farm';
  let sideTab: 'schema' | 'bestiary' | 'badges' = 'schema';
  let lastOutcome: QueryOutcome | null = null;
  let reportDraft = '';
  const openTables = new Set<string>();

  // ───────── toasts ─────────
  const toastBox = $('toasts');
  function showToast(t: Toast) {
    const el = document.createElement('div');
    el.className = `toast ${t.kind}`;
    el.innerHTML = `<strong>${esc(t.title)}</strong>${t.body ? `<div class="toast-body">${md(t.body)}</div>` : ''}${
      t.sql ? `<div class="toast-sql"><span class="muted small">The Ledger whispers:</span><pre><code>${esc(t.sql)}</code></pre></div>` : ''
    }`;
    el.addEventListener('click', () => el.remove());
    toastBox.prepend(el);
    while (toastBox.children.length > 5) toastBox.lastElementChild?.remove();
    setTimeout(() => el.remove(), t.sql ? 9000 : 7000);
  }
  game.setToastHandler(showToast);

  // ───────── panels ─────────
  function renderTopbar() {
    const lvl = game.level;
    const w = game.all<{ temperature: number; sky: string }>('SELECT temperature, sky FROM weather WHERE day = ?', [game.day])[0];
    const xpPct = lvl.xpNeeded ? Math.round((lvl.xpInto / lvl.xpNeeded) * 100) : 100;
    $('topbar').innerHTML = `
      <div class="brand">🐷 <span>Super Squeal</span></div>
      <div class="chips">
        <span class="chip" title="In-game day">📅 Day ${game.day}</span>
        <span class="chip" title="Tonight's weather">${w ? `${SKY[w.sky] ?? '🌤️'} Tonight ${w.temperature}°` : ''}</span>
        <span class="chip" title="Coins">🪙 ${game.coins}</span>
        <span class="chip level" title="${game.progress.xp} XP">
          ⭐ ${esc(lvl.title)}
          <span class="meter xp"><span style="width:${xpPct}%"></span></span>
        </span>
        <span class="chip" title="Days in a row you've played">🔥 ${game.progress.streak.count}</span>
      </div>
      <div class="row">
        <button class="btn ghost" data-act="rewind" title="Undo everything since this morning">⏪ Rewind</button>
        <button class="btn night" data-act="end-day">🌙 End day</button>
        <button class="btn ghost icon" data-act="reset" title="Start a brand-new farm" aria-label="Start over">↺</button>
      </div>`;
  }

  function renderNight() {
    const n = game.lastNight;
    const el = $('night');
    el.hidden = !n;
    if (!n) return;
    el.innerHTML = `<div class="panel-head"><h2>🌙 Last night</h2><span class="muted small">Night ${n.day}</span></div>
      <ul class="night-lines">${n.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
  }

  function renderFarm(plots: ShownPlot[], creatures: CreatureRow[], areas: { name: string; plots: number }[], totalPlots: number) {
    const byPlot = new Map<number, CreatureRow[]>();
    for (const c of creatures) byPlot.set(c.plot_id, [...(byPlot.get(c.plot_id) ?? []), c]);

    const tiles = plots
      .map((p) => {
        const crop = p.crop ? CROPS[p.crop] : null;
        const ready = p.crop && p.growth >= 100;
        const here = byPlot.get(p.id) ?? [];
        const center = crop ? (p.growth < 34 ? '🌱' : crop.emoji) : p.tilled ? '<span class="tilled">≋≋</span>' : '';
        const cls = ['plot', p.tilled ? 'is-tilled' : '', ready ? 'is-ready' : '', p.warmth < 0 ? 'is-frosty' : '', selectedPlot === p.id ? 'is-selected' : '']
          .filter(Boolean)
          .join(' ');
        const label = `Plot ${p.id}${crop ? `, ${crop.label} ${p.growth}%` : ', empty'}${here.length ? `, ${here.map((c) => c.name).join(' and ')}` : ''}`;
        return `<button class="${cls}" style="grid-row:${p.gr};grid-column:${p.gc}" data-act="select-plot" data-plot="${p.id}" aria-label="${esc(label)}" aria-pressed="${selectedPlot === p.id}">
          <span class="plot-id">${p.id}</span>
          ${ready ? '<span class="sparkle">✨</span>' : ''}
          <span class="plot-crop">${center}</span>
          <span class="plot-creatures">${here.map((c) => `<span title="${esc(c.name)}">${esc(c.emoji)}</span>`).join('')}</span>
          ${crop ? `<span class="plot-growth"><span style="width:${p.growth}%"></span></span>` : ''}
        </button>`;
      })
      .join('');

    const cols = Math.max(...plots.map((x) => x.gc));
    let detail = '<p class="muted small">Click a plot to plant, water or harvest.</p>';
    const p = plots.find((x) => x.id === selectedPlot);
    if (p) {
      const crop = p.crop ? CROPS[p.crop] : null;
      const seeds = game.all<{ item: string; quantity: number }>("SELECT item, quantity FROM inventory WHERE item LIKE '%_seed'");
      const seedCount = (id: string) => seeds.find((s) => s.item === id + '_seed')?.quantity ?? 0;
      const actions: string[] = [];
      if (!crop) {
        for (const c of Object.values(CROPS)) {
          const n = seedCount(c.id);
          actions.push(
            `<button class="btn small" data-act="plant" data-plot="${p.id}" data-crop="${c.id}" ${n ? '' : 'disabled'}>Plant ${c.emoji} ${esc(c.label)} <span class="muted">(${n})</span></button>`,
          );
        }
      } else if (p.growth >= 100) {
        actions.push(`<button class="btn small primary" data-act="harvest" data-plot="${p.id}">✨ Harvest ${crop.emoji}</button>`);
      }
      actions.push(`<button class="btn small" data-act="water" data-plot="${p.id}" ${p.moisture >= 3 ? 'disabled' : ''}>💧 Water</button>`);
      detail = `<div class="plot-detail">
        <div class="plot-detail-head"><strong>Plot ${p.id}</strong> <span class="muted small">${cols > 4 ? `${fieldName(p)} · ` : ''}row ${p.row}, col ${p.col}</span></div>
        <div class="facts">
          <span>${crop ? `${crop.emoji} ${esc(crop.label)} · ${p.growth}%` : 'Empty soil'}</span>
          <span>💧 ${p.moisture}/3</span>
          <span>🌡️ ${p.warmth}°</span>
          <span>${p.tilled ? '🐾 Tilled' : 'Untilled'}</span>
        </div>
        <div class="row wrap">${actions.join('')}</div>
      </div>`;
    }

    const tabs =
      areas.length > 1
        ? `<div class="area-tabs" role="tablist" aria-label="Farm areas">${areas
            .map(
              (a) =>
                `<button role="tab" class="tab ${a.name === currentArea ? 'active' : ''}" aria-selected="${a.name === currentArea}" data-act="area" data-area="${esc(a.name)}">${esc(a.name)}</button>`,
            )
            .join('')}</div>
          <p class="muted small area-note">Showing ${plots.length} of ${totalPlots} plots. The Ledger can see them all: try <code>SELECT field, COUNT(crop) FROM plots GROUP BY field;</code></p>`
        : '';
    $('farm').innerHTML = `<div class="panel-head"><h2>🌾 Farm</h2>${areas.length > 1 ? `<span class="muted small">${esc(currentArea)}</span>` : ''}</div>${tabs}
      <div class="grid ${cols > 4 ? 'big' : ''}" style="grid-template-columns: repeat(${cols}, 1fr)">${tiles}</div>${detail}`;
  }

  function renderCreatures(creatures: CreatureRow[], plotIds: number[], total: number) {
    const plotOptions = (current: number) =>
      plotIds.map((n) => `<option value="${n}" ${n === current ? 'selected' : ''}>Plot ${n}</option>`).join('');
    const cards = creatures
      .map(
        (c) => `<div class="creature">
        <div class="creature-emoji" aria-hidden="true">${esc(c.emoji)}</div>
        <div class="creature-body">
          <div><strong>${esc(c.name)}</strong> <span class="muted small">${esc(c.kind)}</span></div>
          <div class="stat"><span class="small">Hunger</span>${meter(c.hunger, 10, c.hunger >= 8 ? 'bad' : c.hunger >= 5 ? 'meh' : 'good', `${c.name} hunger`)}<span class="small num">${c.hunger}</span></div>
          <div class="stat"><span class="small">Mood</span>${meter(c.mood, 10, c.mood <= 3 ? 'bad' : c.mood <= 5 ? 'meh' : 'good', `${c.name} mood`)}<span class="small num">${c.mood}</span></div>
          <div class="row wrap">
            <button class="btn small" data-act="feed" data-name="${esc(c.name)}">🍽️ Feed</button>
            <label class="small move">Move to <select data-act="move" data-name="${esc(c.name)}">${plotOptions(c.plot_id)}</select></label>
          </div>
        </div>
      </div>`,
      )
      .join('');
    $('creatures').innerHTML = `<div class="panel-head"><h2>🐾 Creatures${creatures.length < total ? ` in ${esc(currentArea)}` : ''}</h2><span class="muted small">${
      creatures.length < total ? `${creatures.length} of ${total}` : total
    }</span></div><div class="creature-list ${creatures.length > 6 ? 'scroll' : ''}">${cards}</div>`;
  }

  function renderBarn() {
    const inv = game.all<{ item: string; quantity: number }>('SELECT item, quantity FROM inventory');
    const qty = (item: string) => inv.find((i) => i.item === item)?.quantity ?? 0;
    const coins = game.coins;
    const seeds = Object.values(CROPS)
      .map(
        (c) => `<tr><td>🌱 ${esc(c.label)}</td><td class="num">${qty(c.id + '_seed')}</td>
        <td><button class="btn small" data-act="buy" data-crop="${c.id}" ${coins >= c.seedPrice ? '' : 'disabled'}>Buy · ${c.seedPrice}🪙</button></td></tr>`,
      )
      .join('');
    const goods = [...Object.keys(CROPS), ...Object.keys(GOODS)]
      .map((item) => {
        const n = qty(item);
        const price = CROPS[item]?.sellPrice ?? GOODS[item]?.sellPrice ?? 0;
        return `<tr class="${n ? '' : 'dim'}"><td>${itemEmoji(item)} ${esc(itemLabel(item))}</td><td class="num">${n}</td>
          <td class="row"><button class="btn small" data-act="sell" data-item="${item}" ${n ? '' : 'disabled'}>Sell 1 · ${price}🪙</button>
          <button class="btn small ghost" data-act="sell-all" data-item="${item}" ${n > 1 ? '' : 'disabled'}>All</button></td></tr>`;
      })
      .join('');
    // The land office opens in chapter 9. Land is bought by writing an order, so there's no Buy button.
    const landOpen = game.progress.questIndex >= QUESTS.findIndex((q) => q.id === 'c9-land');
    const forSale = landOpen ? game.all<{ name: string; price: number; plots: number }>('SELECT name, price, plots FROM land WHERE owned = 0 ORDER BY price') : [];
    const land = forSale.length
      ? `<tr><th colspan="3">Land for sale</th></tr>${forSale
          .map(
            (l) => `<tr><td>🗺️ ${esc(l.name)} <span class="muted small">${l.plots} plots</span></td><td class="num">${l.price}🪙</td>
          <td><button class="btn small ghost" data-act="use-sql" data-sql="${esc(`INSERT INTO orders (action, item, quantity) VALUES ('buy', '${l.name}', 1);`)}">Copy order into Ledger</button></td></tr>`,
          )
          .join('')}`
      : '';
    $('barn').innerHTML = `<div class="panel-head"><h2>🛖 Barn</h2></div>
      <table class="barn"><tbody><tr><th colspan="3">Seeds</th></tr>${seeds}<tr><th colspan="3">Goods</th></tr>${goods}${land}</tbody></table>`;
  }

  function renderQuest() {
    const q = game.currentQuest();
    const el = $('quest');
    if (!q) {
      el.innerHTML = `<div class="keystone"><div class="avatar" aria-hidden="true">🌾</div><div class="bubble"><p><strong>You did it!</strong> You've finished every chapter written so far. The Hollow is quieter now… but strange footprints lead toward the pond.</p><p><strong>Chapter 10: Window functions</strong> (rankings and running totals across the seasons) is coming soon. Until then the Ledger, and the Quill, are yours. Keep farming and keep asking it questions!</p></div></div>`;
      return;
    }
    const ch = chapterOf(q);
    const idx = game.progress.questIndex;
    const level = game.hintLevel(q.id);
    const cost = game.nextHintCost(q.id);
    const answerText = q.hints.answer ?? (q.kind === 'query' ? `\`${q.expected};\`` : '');
    const blankCode = q.hints.blank;
    const isCode = isSqlTemplate(blankCode);

    const hints: string[] = [];
    if (level >= 1) hints.push(`<li>💡 ${md(q.hints.nudge)}</li>`);
    if (level >= 2)
      hints.push(
        isCode
          ? `<li>🧩 Fill in the blanks: <pre><code>${esc(blankCode)}</code></pre><button class="btn small ghost" data-act="use-sql" data-sql="${esc(blankCode)}">Copy into Ledger</button></li>`
          : `<li>🧩 ${md(blankCode)}</li>`,
      );
    if (level >= 3)
      hints.push(
        q.kind === 'query'
          ? `<li>🔑 The answer: <pre><code>${esc(q.expected)};</code></pre><button class="btn small ghost" data-act="use-sql" data-sql="${esc(q.expected + ';')}">Copy into Ledger</button></li>`
          : `<li>🔑 ${md(answerText)}</li>`,
      );

    const hintBtn =
      cost === null
        ? ''
        : `<button class="btn small ghost" data-act="hint">${level === 0 ? 'Get a hint' : 'Another hint'} ${cost ? `· ${cost}🪙` : '· free'}</button>`;

    let interaction = '';
    if (q.kind === 'answer') {
      interaction = `<div class="choices">${q.choices
        .map((c, i) => `<button class="btn choice" data-act="answer" data-choice="${i}">${esc(c)}</button>`)
        .join('')}</div>`;
    } else if (q.kind === 'action') {
      interaction = /^(INSERT|UPDATE|DELETE)\s/.test(q.hints.blank)
        ? `<p class="muted small">🪶 Write it in the Ledger below.</p>`
        : `<p class="muted small">👈 Use the farm panels to do this.</p>`;
    } else if (q.kind === 'goal') {
      interaction = `<ul class="goals">${game
        .goalStatus(q)
        .map(
          (g) => `<li class="${g.done ? 'done' : ''}">
            <span class="goal-check" aria-hidden="true">${g.done ? '✅' : '⬜'}</span>
            <span class="goal-label">${esc(g.label)}</span>
            ${meter(Math.min(Math.max(g.have, 0), g.need), g.need, g.done ? 'good' : 'meh', g.label)}
            <span class="small num">${Math.max(g.have, 0)}/${g.need}</span>
          </li>`,
        )
        .join('')}</ul>`;
    } else if (q.kind === 'report') {
      interaction = `<form class="report" data-form="report">
        <label for="report-answer"><strong>❓ ${md(q.question)}</strong></label>
        <div class="row">
          <input id="report-answer" autocomplete="off" placeholder="Your answer" value="${esc(reportDraft)}" />
          <button class="btn primary" type="submit">Submit</button>
        </div>
        <p class="muted small">Find it with any query you like, then type the answer here.</p>
      </form>`;
    }

    el.innerHTML = `
      <div class="quest-meta">
        <span class="chip small ${ch.free ? 'free' : ''}">${ch.free ? '🌻 Free play' : `Chapter ${ch.n} · ${esc(ch.concept)}`}</span>
        <span class="muted small">${esc(ch.title)} · Quest ${idx + 1} of ${QUESTS.length}</span>
      </div>
      <h2 class="quest-title">${esc(q.title)}</h2>
      <div class="keystone">
        <div class="avatar" aria-hidden="true" title="Keystone the scarecrow">🌾</div>
        <div class="bubble"><p>${md(q.story)}</p></div>
      </div>
      <div class="task">🎯 ${md(q.task)}</div>
      ${
        q.concept
          ? `<details class="concept" open><summary>📘 New spell: <strong>${esc(q.concept.title)}</strong></summary>
              <p>${md(q.concept.body)}</p>
              ${q.concept.example ? `<p class="small muted">Example (it does a different job on purpose, so it's not the answer):</p><pre><code>${esc(q.concept.example)}</code></pre>` : ''}</details>`
          : ''
      }
      ${interaction}
      <div class="hints">${hints.length ? `<ul>${hints.join('')}</ul>` : ''}${hintBtn}</div>`;
  }

  function renderResult() {
    const el = $('result');
    const o = lastOutcome;
    if (!o) {
      el.innerHTML = '';
      return;
    }
    if (o.error) {
      el.innerHTML = `<div class="error"><div class="keystone small"><div class="avatar" aria-hidden="true">🌾</div><div class="bubble"><p>${md(o.error)}</p></div></div>
        ${o.rawError ? `<details class="raw"><summary>What the Ledger actually said</summary><code>${esc(o.rawError)}</code></details>` : ''}</div>`;
      return;
    }
    const wrote = o.write
      ? `<div class="feedback ok wrote">🪶 ${o.write.changed} row${o.write.changed === 1 ? '' : 's'} changed.${
          o.write.effects.length ? `<ul>${o.write.effects.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''
        }</div>`
      : '';
    const r = o.result ?? { columns: [], rows: [] };
    const fb = o.feedback ? `<div class="feedback ${o.feedback.ok ? 'ok' : 'nope'}">${o.feedback.ok ? '🎉' : '🤔'} ${md(o.feedback.message)}</div>` : '';
    const body = r.columns.length
      ? `<p class="muted small">${r.rows.length} row${r.rows.length === 1 ? '' : 's'}</p>${table(r.columns, r.rows)}`
      : o.write
        ? ''
        : '<p class="muted small">Done. (That query returned no table.)</p>';
    el.innerHTML = wrote + fb + body;
  }

  function renderSide() {
    const tabs: [typeof sideTab, string][] = [
      ['schema', '🗂️ Schema'],
      ['bestiary', '📔 Bestiary'],
      ['badges', '🏅 Badges'],
    ];
    $('tabs').innerHTML = tabs
      .map(([id, label]) => `<button role="tab" aria-selected="${sideTab === id}" class="tab ${sideTab === id ? 'active' : ''}" data-act="tab" data-tab="${id}">${label}</button>`)
      .join('');

    const side = $('side');
    if (sideTab === 'schema') {
      const info = game.schemaInfo();
      side.innerHTML =
        `<p class="muted small">Every table in the Ledger. Open one to peek at its first rows.</p>` +
        info.tables
          .map((t) => {
            const open = openTables.has(t);
            const peek = open ? game.execResult(`SELECT * FROM "${t}" LIMIT 3`) : null;
            return `<details class="schema-table" data-table="${esc(t)}" ${open ? 'open' : ''}>
              <summary><code>${esc(t)}</code> <span class="muted small">${info.byTable[t].length} columns</span></summary>
              <div class="cols">${info.byTable[t].map((c) => `<code class="col-chip">${esc(c)}</code>`).join('')}</div>
              ${peek ? table(peek.columns, peek.rows) : ''}
              <button class="btn small ghost" data-act="use-sql" data-sql="SELECT * FROM ${esc(t)};">Query this table</button>
            </details>`;
          })
          .join('');
    } else if (sideTab === 'bestiary') {
      const { found, total } = game.bestiaryProgress;
      const cards = game.progress.met
        .map((name) => SPECIES[name])
        .filter(Boolean)
        .map(
          (s) => `<div class="beast">
            <div class="beast-head"><span class="beast-emoji" aria-hidden="true">${s.emoji}</span><div><strong>${esc(s.name)}</strong><div class="muted small">${esc(s.kind)}</div></div></div>
            <p class="small">${esc(s.blurb)}</p>
            <dl>${s.traits
              .map((t) => {
                const known = game.progress.discovered.includes(t.id);
                return `<dt>${esc(t.label)}</dt><dd class="${known ? '' : 'unknown'}">${known ? esc(t.value) : '???'}</dd>`;
              })
              .join('')}</dl>
          </div>`,
        )
        .join('');
      const unseen = Object.keys(SPECIES).filter((n) => !game.progress.met.includes(n)).length + COMING_SOON.length;
      side.innerHTML = `<div class="stat"><span class="small">Discovered</span>${meter(found, total, 'good', 'Bestiary progress')}<span class="small num">${found}/${total}</span></div>
        <div class="beasts">${cards}</div>
        <div class="silhouettes" title="Creatures you haven't met yet">${'<span>❓</span>'.repeat(unseen)}</div>
        <p class="muted small">${unseen} more creatures roam the Hollow…</p>`;
    } else {
      side.innerHTML = `<div class="badges">${BADGES.map((b) => {
        const has = game.progress.badges.includes(b.id);
        return `<div class="badge ${has ? '' : 'locked'}"><span class="badge-emoji" aria-hidden="true">${has ? b.emoji : '🔒'}</span><div><strong>${esc(b.name)}</strong><div class="small muted">${esc(b.desc)}</div></div></div>`;
      }).join('')}</div>
      <p class="muted small">Queries run: ${game.progress.stats.queries} · Harvested: ${game.progress.stats.harvested} · Sold: ${game.progress.stats.sold}</p>`;
    }
  }

  function renderQuillBadge() {
    $('quill-badge').innerHTML = game.progress.quill ? '<span class="chip small quill" title="Your SQL can change the farm">🪶 Quill</span>' : '';
    $('run').textContent = game.progress.quill ? 'Run ▶' : 'Run query ▶';
  }

  function render() {
    renderQuillBadge();
    const creatures = game.all<CreatureRow>('SELECT * FROM creatures ORDER BY id');
    const plots = game.all<PlotRow>('SELECT * FROM plots ORDER BY id');

    // Areas in the order they were acquired; show only the current one.
    const areas: { name: string; plots: number }[] = [];
    for (const p of plots) {
      const a = areaOf(p.field);
      const found = areas.find((x) => x.name === a);
      if (found) found.plots++;
      else areas.push({ name: a, plots: 1 });
    }
    if (!areas.some((a) => a.name === currentArea)) currentArea = areas[0]?.name ?? 'Home farm';
    const here = plots.filter((p) => areaOf(p.field) === currentArea);
    const minRow = Math.min(...here.map((p) => p.row));
    const minCol = Math.min(...here.map((p) => p.col));
    const shown: ShownPlot[] = here.map((p) => ({ ...p, gr: p.row - minRow + 1, gc: p.col - minCol + 1 }));
    const shownIds = new Set(here.map((p) => p.id));
    if (selectedPlot !== null && !shownIds.has(selectedPlot)) selectedPlot = null;

    renderTopbar();
    renderNight();
    renderFarm(shown, creatures, areas, plots.length);
    renderCreatures(
      creatures.filter((c) => shownIds.has(c.plot_id)),
      here.map((p) => p.id),
      creatures.length,
    );
    renderBarn();
    renderQuest();
    renderSide();
  }

  // ───────── events ─────────
  function runQuery() {
    lastOutcome = game.runPlayerQuery(editor.value);
    renderResult();
    render();
  }

  function useSql(sql: string) {
    editor.value = sql;
    editor.focus();
    const blank = sql.indexOf('___');
    if (blank >= 0) editor.setSelectionRange(blank, blank + 3);
  }

  root.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el || el.tagName === 'SELECT') return;
    const d = el.dataset;
    const act = (a: Action) => game.act(a);
    switch (d.act) {
      case 'select-plot':
        selectedPlot = selectedPlot === Number(d.plot) ? null : Number(d.plot);
        render();
        break;
      case 'feed':
        act({ type: 'feed', name: d.name! });
        break;
      case 'plant':
        act({ type: 'plant', plot: Number(d.plot), crop: d.crop! });
        break;
      case 'water':
        act({ type: 'water', plot: Number(d.plot) });
        break;
      case 'harvest':
        act({ type: 'harvest', plot: Number(d.plot) });
        break;
      case 'buy':
        act({ type: 'buy', crop: d.crop! });
        break;
      case 'sell':
        act({ type: 'sell', item: d.item!, all: false });
        break;
      case 'sell-all':
        act({ type: 'sell', item: d.item!, all: true });
        break;
      case 'end-day':
        game.endDay();
        break;
      case 'rewind':
        if (confirm('Rewind to the start of today? Anything you did today on the farm will be undone (quest progress is kept).')) game.rewind();
        break;
      case 'reset':
        if (confirm('Start a brand-new farm? All progress will be lost.')) {
          lastOutcome = null;
          selectedPlot = null;
          renderResult();
          game.reset();
        }
        break;
      case 'answer':
        game.answer(Number(d.choice));
        break;
      case 'hint':
        game.buyHint();
        break;
      case 'use-sql':
        useSql(d.sql ?? '');
        break;
      case 'tab':
        sideTab = d.tab as typeof sideTab;
        renderSide();
        break;
      case 'area':
        currentArea = d.area ?? 'Home farm';
        selectedPlot = null;
        render();
        break;
    }
  });

  root.addEventListener('submit', (e) => {
    const form = e.target as HTMLFormElement;
    if (form.dataset.form !== 'report') return;
    e.preventDefault();
    // Clear before submitting: a correct answer redraws the panel for the next question.
    const answer = reportDraft;
    reportDraft = '';
    if (!game.submitReport(answer)) reportDraft = answer;
  });

  root.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.id === 'report-answer') reportDraft = el.value;
  });

  root.addEventListener('change', (e) => {
    const el = e.target as HTMLSelectElement;
    if (el.dataset.act === 'move') game.act({ type: 'move', name: el.dataset.name!, plot: Number(el.value) });
  });

  root.addEventListener(
    'toggle',
    (e) => {
      const el = e.target as HTMLDetailsElement;
      const t = el.dataset?.table;
      if (!t) return;
      const was = openTables.has(t);
      if (el.open) openTables.add(t);
      else openTables.delete(t);
      if (el.open !== was) renderSide();
    },
    true,
  );

  $('run').addEventListener('click', runQuery);
  $('clear').addEventListener('click', () => {
    editor.value = '';
    lastOutcome = null;
    renderResult();
    editor.focus();
  });
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runQuery();
    }
  });

  game.subscribe(render);
  render();

  // Saves are batched, so make sure nothing is lost when the tab is closed or hidden.
  window.addEventListener('pagehide', () => game.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') game.flush();
  });
}

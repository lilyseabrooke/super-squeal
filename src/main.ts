import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { Game } from './game';
import { mountUI } from './ui';
import './style.css';

async function start() {
  const app = document.getElementById('app')!;
  try {
    const SQL = await initSqlJs({ locateFile: () => wasmUrl, useOldExtensionFunctions: false });
    const game = new Game(SQL);
    mountUI(app, game);
  } catch (e) {
    console.error(e);
    app.innerHTML = '<div class="loading">🐷💤 The farm failed to wake up. Try reloading the page.</div>';
  }
}

void start();

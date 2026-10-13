import { Chess } from './vendor/chess.js';

// ---------- Motor (Stockfish en Web Worker) ----------
class Engine {
  constructor(url) {
    this.w = new Worker(url);
    this.listeners = [];
    this.w.onmessage = e => { const l = String(e.data); this.listeners.slice().forEach(f => f(l)); };
    this.busy = null; this.ready = this.cmdWait('uci', 'uciok').then(() => this.cmdWait('isready', 'readyok'));
  }
  send(c) { this.w.postMessage(c); }
  cmdWait(c, token) {
    return new Promise(res => { const f = l => { if (l.startsWith(token)) { this.off(f); res(); } }; this.listeners.push(f); this.send(c); });
  }
  off(f) { this.listeners = this.listeners.filter(x => x !== f); }
  async stop() { if (this.busy) { this.send('stop'); await this.busy.catch(() => {}); } }
  search(fen, opts = {}) {
    // serializa las búsquedas: cada una detiene a la anterior y espera su bestmove
    this.gen = (this.gen || 0) + 1; const g = this.gen;
    this.queue = (this.queue || Promise.resolve()).then(async () => {
      await this.ready; await this.stop();
      if (g !== this.gen) return { bestmove: null, score: null, stale: true };
      return this._search(fen, opts);
    });
    return this.queue;
  }
  async _search(fen, { skill = 20, limit = 'movetime 1000', onInfo } = {}) {
    const turn = fen.split(' ')[1];
    let last = null;
    const p = new Promise(res => {
      const f = l => {
        if (l.startsWith('info') && l.includes(' score ') && !l.includes('lowerbound') && !l.includes('upperbound')) {
          const m = l.match(/score (cp|mate) (-?\d+)/), pv = l.match(/ pv (.+)$/), d = l.match(/ depth (\d+)/);
          if (m && (!/multipv (\d+)/.test(l) || /multipv 1 /.test(l))) {
            let v = +m[2]; if (turn === 'b') v = -v;           // perspectiva de Blancas
            last = { type: m[1], value: v, depth: d ? +d[1] : 0, pv: pv ? pv[1].split(' ') : [] };
            onInfo && onInfo(last);
          }
        } else if (l.startsWith('bestmove')) {
          this.off(f); const bm = l.split(' ')[1];
          res({ bestmove: bm && bm !== '(none)' ? bm : null, score: last });
        }
      };
      this.listeners.push(f);
    });
    this.busy = p.finally(() => { if (this.busy === wrapped) this.busy = null; });
    const wrapped = this.busy;
    this.send('setoption name Skill Level value ' + skill);
    this.send('position fen ' + fen);
    this.send('go ' + limit);
    return p;
  }
}

// ---------- Estado ----------
const $ = id => document.getElementById(id);
const game = new Chess();
const engine = new Engine(window.ENGINE_URL || 'vendor/sf-worker.js');
let orientation = 'w', selected = null, lastMove = null, bestArrow = null, evalCache = {}, thinking = false, token = 0;
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const FILES = 'abcdefgh';

for (let i = 20; i >= 0; i--) { const o = document.createElement('option'); o.value = i; o.textContent = i === 20 ? '20 (Máximo)' : String(i); $('skill').appendChild(o); }
// preferencias guardadas
const prefs = JSON.parse(localStorage.getItem('appchess-prefs') || '{}');
['mode', 'color', 'skill', 'limit'].forEach(k => { if (prefs[k] != null) $(k).value = prefs[k]; });
if (prefs.showEval === false) $('showEval').checked = false;
const savePrefs = () => localStorage.setItem('appchess-prefs', JSON.stringify({ mode: $('mode').value, color: $('color').value, skill: $('skill').value, limit: $('limit').value, showEval: $('showEval').checked }));
orientation = $('color').value;
const userColor = () => $('color').value;
const isPlay = () => $('mode').value === 'play';

// ---------- Tablero ----------
const board = $('board');
function squares() { const r = []; for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) { const f = orientation === 'w' ? col : 7 - col, rk = orientation === 'w' ? 8 - row : row + 1; r.push(FILES[f] + rk); } return r; }
function render() {
  board.innerHTML = '';
  const legal = selected ? game.moves({ square: selected, verbose: true }) : [];
  const inCheck = game.inCheck() ? findKing(game.turn()) : null;
  squares().forEach((sq, i) => {
    const d = document.createElement('div');
    const f = FILES.indexOf(sq[0]), r = +sq[1];
    d.className = 'sq ' + ((f + r) % 2 ? 'l' : 'd');
    d.dataset.sq = sq;
    if (lastMove && (lastMove.from === sq || lastMove.to === sq)) d.classList.add('last');
    if (sq === selected) d.classList.add('sel');
    if (sq === inCheck) d.classList.add('check');
    const lm = legal.find(m => m.to === sq); if (lm) d.classList.add(game.get(sq) ? 'hintcap' : 'hint');
    const p = game.get(sq);
    if (p) { const s = document.createElement('span'); s.className = 'pc ' + p.color; s.textContent = GLYPH[p.type] + '\uFE0E'; d.appendChild(s); }
    if (i % 8 === 0) { const c = document.createElement('span'); c.className = 'coord r'; c.textContent = sq[1]; d.appendChild(c); }
    if (i >= 56) { const c = document.createElement('span'); c.className = 'coord f'; c.textContent = sq[0]; d.appendChild(c); }
    board.appendChild(d);
  });
  drawArrow(); renderMoves(); updateStatus();
}
function findKing(c) { for (const row of game.board()) for (const p of row) if (p && p.type === 'k' && p.color === c) return p.square; }
function sqCenter(sq) { let f = FILES.indexOf(sq[0]), r = +sq[1]; let x = orientation === 'w' ? f : 7 - f, y = orientation === 'w' ? 8 - r : r - 1; return [x * 100 + 50, y * 100 + 50]; }
function drawArrow() {
  const svg = $('arrows');
  svg.innerHTML = '<defs><marker id="ah" markerWidth="4" markerHeight="4" refX="2.2" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 z" fill="rgba(255,170,0,.9)"/></marker></defs>';
  if (!bestArrow || bestArrow.fen !== game.fen()) return;
  const [x1, y1] = sqCenter(bestArrow.uci.slice(0, 2)), [x2, y2] = sqCenter(bestArrow.uci.slice(2, 4));
  const ang = Math.atan2(y2 - y1, x2 - x1), sx = x2 - Math.cos(ang) * 30, sy = y2 - Math.sin(ang) * 30;
  svg.insertAdjacentHTML('beforeend', `<line x1="${x1}" y1="${y1}" x2="${sx}" y2="${sy}" stroke="rgba(255,170,0,.85)" stroke-width="16" stroke-linecap="round" marker-end="url(#ah)"/>`);
}
function renderMoves() {
  const h = game.history(), ol = $('moves'); ol.innerHTML = '';
  for (let i = 0; i < h.length; i += 2) { const li = document.createElement('li'); li.innerHTML = `<span>${h[i]}</span><span>${h[i + 1] || ''}</span>`; ol.appendChild(li); }
  ol.scrollTop = ol.scrollHeight;
}
function updateStatus() {
  let s;
  if (game.isCheckmate()) s = 'Jaque mate. Ganan ' + (game.turn() === 'w' ? 'las Negras' : 'las Blancas') + '.';
  else if (game.isStalemate()) s = 'Tablas por ahogado.';
  else if (game.isThreefoldRepetition()) s = 'Tablas por repetición.';
  else if (game.isInsufficientMaterial()) s = 'Tablas por material insuficiente.';
  else if (game.isDraw()) s = 'Tablas (regla de 50 movimientos).';
  else if (thinking) s = 'Stockfish está pensando…';
  else s = 'Juegan ' + (game.turn() === 'w' ? 'las Blancas' : 'las Negras') + (game.inCheck() ? ' (jaque)' : '');
  $('status').textContent = s;
}

// ---------- Barra de evaluación ----------
function setEval(sc) {
  if (!sc) return;
  let pct, txt;
  if (sc.type === 'mate') { pct = sc.value > 0 ? 100 : sc.value < 0 ? 0 : (game.turn() === 'w' ? 0 : 100); txt = (sc.value >= 0 ? '' : '-') + 'M' + Math.abs(sc.value); }
  else { const p = 1 / (1 + Math.exp(-0.004 * sc.value)); pct = p * 100; txt = (sc.value > 0 ? '+' : '') + (sc.value / 100).toFixed(1); }
  $('evalfill').style.height = (orientation === 'w' ? pct : 100 - pct) + '%';
  $('evalfill').style.top = orientation === 'w' ? 'auto' : '0';
  $('evalfill').style.bottom = orientation === 'w' ? '0' : 'auto';
  $('evaltext').textContent = txt;
  $('evalbar').dataset.cp = sc.type === 'cp' ? sc.value : 'M' + sc.value;
  $('info').textContent = `Evaluación (Blancas): ${txt} · profundidad ${sc.depth}`;
}
$('showEval').onchange = () => { $('evalbar').classList.toggle('hide', !$('showEval').checked); savePrefs(); };
$('evalbar').classList.toggle('hide', !$('showEval').checked);

// ---------- Lógica de turno ----------
async function afterPositionChange() {
  render();
  const my = ++token;
  if (game.isGameOver()) { await engine.stop(); if (game.isCheckmate()) setEval({ type: 'mate', value: 0, depth: 0 }); return; }
  const fen = game.fen();
  if (isPlay() && game.turn() !== userColor()) {
    thinking = true; updateStatus();
    const r = await engine.search(fen, { skill: +$('skill').value, limit: $('limit').value, onInfo: sc => my === token && setEval(sc) });
    if (my !== token) return;
    thinking = false;
    if (r.bestmove && !r.stale) { applyUci(r.bestmove); return afterPositionChange(); }
    updateStatus();
  } else {
    // análisis de fondo para la barra y la "Mejor jugada"
    const r = await engine.search(fen, { skill: 20, limit: 'movetime 1500', onInfo: sc => my === token && setEval(sc) });
    if (my === token && r.bestmove) evalCache[fen] = r;
  }
}
function applyUci(uci) {
  const m = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
  lastMove = m; selected = null; return m;
}
function canMoveNow() { return !game.isGameOver() && (!isPlay() || (game.turn() === userColor() && !thinking)); }

async function tryMove(from, to) {
  const cands = game.moves({ square: from, verbose: true }).filter(m => m.to === to);
  if (!cands.length) return false;
  let promotion;
  if (cands[0].promotion) promotion = await askPromotion(game.turn());
  lastMove = game.move({ from, to, promotion }); selected = null; bestArrow = null;
  afterPositionChange(); return true;
}
function askPromotion(color) {
  return new Promise(res => {
    const box = $('promochoices'); box.innerHTML = '';
    ['q', 'r', 'b', 'n'].forEach(t => { const b = document.createElement('button'); b.textContent = GLYPH[t] + '\uFE0E'; b.style.color = color === 'w' ? '#fff' : '#111'; b.style.webkitTextStroke = color === 'w' ? '1px #222' : ''; b.onclick = () => { $('promo').hidden = true; res(t); }; box.appendChild(b); });
    $('promo').hidden = false;
  });
}

// ---------- Interacción: tocar y arrastrar ----------
let drag = null;
function sqFromPoint(x, y) { const el = document.elementFromPoint(x, y); const s = el && el.closest && el.closest('.sq'); return s ? s.dataset.sq : null; }
board.addEventListener('pointerdown', e => {
  const s = e.target.closest('.sq'); if (!s) return;
  const sq = s.dataset.sq, p = game.get(sq);
  if (!canMoveNow()) return;
  if (selected && selected !== sq && (!p || p.color !== game.turn())) { tryMove(selected, sq).then(ok => { if (!ok) { selected = null; render(); } }); return; }
  if (p && p.color === game.turn()) {
    selected = sq; render();
    const ghost = document.createElement('span'); ghost.className = 'pc drag ' + p.color; ghost.textContent = GLYPH[p.type] + '\uFE0E';
    ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px'; ghost.style.display = 'none';
    document.body.appendChild(ghost); drag = { from: sq, ghost, x: e.clientX, y: e.clientY, moved: false };
    board.setPointerCapture(e.pointerId);
  } else { selected = null; render(); }
});
board.addEventListener('pointermove', e => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) { drag.moved = true; drag.ghost.style.display = ''; const o = board.querySelector(`[data-sq="${drag.from}"] .pc`); if (o) o.style.opacity = .3; }
  drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
});
const endDrag = e => {
  if (!drag) return; const d = drag; drag = null; d.ghost.remove();
  if (!d.moved) return;
  const to = sqFromPoint(e.clientX, e.clientY);
  if (to && to !== d.from) tryMove(d.from, to).then(ok => { if (!ok) render(); }); else render();
};
board.addEventListener('pointerup', endDrag); board.addEventListener('pointercancel', endDrag);

// ---------- Botones ----------
$('btnNew').onclick = () => { game.reset(); lastMove = null; selected = null; bestArrow = null; thinking = false; evalCache = {}; orientation = userColor(); afterPositionChange(); };
$('btnUndo').onclick = async () => {
  ++token; thinking = false; await engine.stop();
  game.undo();
  if (isPlay() && game.turn() !== userColor() && game.history().length) game.undo();
  const h = game.history({ verbose: true }); lastMove = h[h.length - 1] || null; selected = null; bestArrow = null;
  afterPositionChange();
};
$('btnFlip').onclick = () => { orientation = orientation === 'w' ? 'b' : 'w'; render(); const c = evalCache[game.fen()]; if (c) setEval(c.score); };
$('btnBest').onclick = async () => {
  const fen = game.fen(); if (game.isGameOver()) return;
  if (isPlay() && game.turn() !== userColor()) return;
  let r = evalCache[fen];
  if (!r) { $('info').textContent = 'Buscando la mejor jugada…'; const my = ++token; r = await engine.search(fen, { skill: 20, limit: $('limit').value, onInfo: sc => setEval(sc) }); if (game.fen() !== fen) return; evalCache[fen] = r; }
  if (!r.bestmove) return;
  bestArrow = { fen, uci: r.bestmove }; drawArrow();
  const tmp = new Chess(fen); const m = tmp.move({ from: r.bestmove.slice(0, 2), to: r.bestmove.slice(2, 4), promotion: r.bestmove[4] || undefined });
  $('info').textContent = `Mejor jugada: ${m.san}` + (r.score ? ` · eval ${$('evaltext').textContent}` : '');
};
function pgn() {
  game.header('Event', 'App Chess', 'Site', 'Local', 'Date', new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
    'White', isPlay() && userColor() === 'b' ? 'Stockfish 16' : 'Fede', 'Black', isPlay() && userColor() === 'w' ? 'Stockfish 16' : (isPlay() ? 'Fede' : '?'));
  return game.pgn();
}
$('btnPgn').onclick = () => {
  const t = pgn(); $('pgnout').hidden = false; $('pgnout').value = t;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'application/x-chess-pgn' })); a.download = 'partida.pgn'; a.click();
};
$('btnCopy').onclick = async () => { const t = pgn(); $('pgnout').hidden = false; $('pgnout').value = t; try { await navigator.clipboard.writeText(t); $('info').textContent = 'PGN copiado.'; } catch { $('pgnout').select(); } };
['mode', 'color', 'skill', 'limit'].forEach(k => $(k).onchange = () => { savePrefs(); if (k === 'color') { orientation = userColor(); } afterPositionChange(); });

engine.ready.then(() => { $('status').textContent = 'Motor listo'; afterPositionChange(); });
render();
window.__app = { game, engine }; // para pruebas

if ('serviceWorker' in navigator && location.protocol !== 'file:' && !window.NO_SW) navigator.serviceWorker.register('sw.js').catch(() => {});

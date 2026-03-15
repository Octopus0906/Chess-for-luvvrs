/* ═══════════════════════════════════════════════════════════
   CHESS FOR LUVVRS — Frontend
   by Chris Dcruz
═══════════════════════════════════════════════════════════ */

'use strict';

// ── STATE ─────────────────────────────────────────────────────
const S = {
  game: null,       // game state from server
  meta: null,       // mode/color/time meta
  selSq: -1,
  legalSqs: [],
  flipped: false,
  hints: true,
  snd: true,
  three_d: true,
  pieceStyle: 'classic',
  viewIdx: -1,      // -1 = live
  animating: false,
  // Anim state
  anim: { active: false, from: -1, to: -1, piece: '', t: 0, startMs: 0 },
  lastFrom: -1,
  lastTo: -1,
};

const SQPX_BASE = 80;
let SQPX = SQPX_BASE;

// ── PIECE SYMBOLS ─────────────────────────────────────────────
const SYMS = {
  wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙',
  bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟',
};
const HEART_SYMS = {
  wK:'❤️', wQ:'💕', wR:'💗', wB:'💓', wN:'💖', wP:'🩷',
  bK:'🖤',  bQ:'💜', bR:'💙', bB:'💚', bN:'🤍', bP:'🩶',
};
function sym(p) {
  return S.pieceStyle === 'hearts' ? (HEART_SYMS[p] || SYMS[p]) : SYMS[p];
}

// ── CANVAS ────────────────────────────────────────────────────
let CV, CTX;

function initCanvas() {
  CV = document.getElementById('boardCanvas');
  const container = CV.parentElement;
  const avail = Math.min(
    window.innerWidth - 480,
    window.innerHeight - 180,
    700
  );
  SQPX = Math.floor(Math.max(62, avail / 8));
  const total = SQPX * 8;
  CV.width = total; CV.height = total;
  CV.style.width = total + 'px'; CV.style.height = total + 'px';
  CTX = CV.getContext('2d');
  buildLabels();
  draw();
}

function sqXY(sq) {
  let r = Math.floor(sq / 8), c = sq % 8;
  if (S.flipped) { r = 7 - r; c = 7 - c; }
  return [c * SQPX, r * SQPX];
}

function xySq(x, y) {
  let c = Math.floor(x / SQPX), r = Math.floor(y / SQPX);
  if (S.flipped) { r = 7 - r; c = 7 - c; }
  if (r < 0 || r > 7 || c < 0 || c > 7) return -1;
  return r * 8 + c;
}

function buildLabels() {
  const rl = document.getElementById('rankLabels');
  const fl = document.getElementById('fileLabels');
  if (!rl || !fl) return;
  rl.innerHTML = ''; fl.innerHTML = '';
  const ranks = S.flipped ? '12345678' : '87654321';
  const files  = S.flipped ? 'hgfedcba' : 'abcdefgh';
  ranks.split('').forEach(ch => {
    const s = document.createElement('span'); s.textContent = ch; rl.appendChild(s);
  });
  files.split('').forEach(ch => {
    const s = document.createElement('span'); s.textContent = ch; fl.appendChild(s);
  });
}

// ── DRAW ──────────────────────────────────────────────────────
function draw() {
  if (!CTX) return;
  const board = getViewBoard();
  if (!board) return;

  const turn = S.game ? S.game.turn : 'w';
  const inChk = S.game ? S.game.in_check : false;
  const kingIdx = board.indexOf(turn + 'K');

  // Squares
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = r * 8 + c;
      const [x, y] = sqXY(sq);
      const light = (r + c) % 2 === 0;

      // Base
      CTX.fillStyle = light ? '#fde8ef' : '#7a1835';
      CTX.fillRect(x, y, SQPX, SQPX);

      // Last move
      if (sq === S.lastFrom || sq === S.lastTo) {
        CTX.fillStyle = light
          ? 'rgba(212,168,71,0.48)'
          : 'rgba(212,168,71,0.38)';
        CTX.fillRect(x, y, SQPX, SQPX);
      }

      // Check glow
      if (inChk && sq === kingIdx) {
        const g = CTX.createRadialGradient(
          x + SQPX/2, y + SQPX/2, 3,
          x + SQPX/2, y + SQPX/2, SQPX * 0.62
        );
        g.addColorStop(0, 'rgba(255,50,50,0.88)');
        g.addColorStop(1, 'rgba(255,50,50,0)');
        CTX.fillStyle = g;
        CTX.fillRect(x, y, SQPX, SQPX);
      }

      // Selection
      if (S.selSq === sq) {
        CTX.fillStyle = 'rgba(255,195,50,0.58)';
        CTX.fillRect(x, y, SQPX, SQPX);
      }

      // Legal move hints
      if (S.hints && S.legalSqs.includes(sq)) {
        if (board[sq]) {
          // Capture ring + corners
          CTX.strokeStyle = 'rgba(255,77,125,0.9)';
          CTX.lineWidth = 3.5;
          CTX.strokeRect(x + 2, y + 2, SQPX - 4, SQPX - 4);
          CTX.fillStyle = 'rgba(255,77,125,0.35)';
          [[0,0],[0,1],[1,0],[1,1]].forEach(([dr, dc]) => {
            CTX.beginPath();
            CTX.arc(x + dc * (SQPX - 10) + 5, y + dr * (SQPX - 10) + 5, 4.5, 0, Math.PI*2);
            CTX.fill();
          });
        } else {
          // Dot
          CTX.fillStyle = 'rgba(255,77,125,0.45)';
          CTX.beginPath();
          CTX.arc(x + SQPX/2, y + SQPX/2, SQPX * 0.155, 0, Math.PI*2);
          CTX.fill();
        }
      }
    }
  }

  // Pieces (skip animating from-square)
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq]; if (!p) continue;
    if (S.anim.active && sq === S.anim.from) continue;
    const [x, y] = sqXY(sq);
    drawPiece(p, x, y, 1.0);
  }

  // Animated piece
  if (S.anim.active) {
    const t = Math.min(1, S.anim.t);
    const ease = t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t;
    const [fx, fy] = sqXY(S.anim.from);
    const [tx2, ty2] = sqXY(S.anim.to);
    const ax = fx + (tx2 - fx) * ease;
    const ay = fy + (ty2 - fy) * ease;
    const arc = Math.sin(t * Math.PI) * 0.18 * (Math.abs(tx2-fx) + Math.abs(ty2-fy));
    const scale = 1.0 + Math.sin(t * Math.PI) * 0.1;
    drawPiece(S.anim.piece, ax, ay - arc, scale);
  }
}

function drawPiece(piece, x, y, scale) {
  const isW = piece[0] === 'w';
  const s = sym(piece);
  const fs = SQPX * 0.72 * scale;

  CTX.save();
  if (scale !== 1.0) {
    const cx = x + SQPX/2, cy = y + SQPX/2;
    CTX.translate(cx, cy); CTX.scale(scale, scale); CTX.translate(-cx, -cy);
  }
  CTX.font = `${fs}px serif`;
  CTX.textAlign = 'center';
  CTX.textBaseline = 'middle';

  // Shadow
  CTX.shadowColor = isW ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.72)';
  CTX.shadowBlur = 7; CTX.shadowOffsetX = 1.5; CTX.shadowOffsetY = 2.5;

  // Outline for white pieces
  if (isW) {
    CTX.strokeStyle = 'rgba(80,5,18,0.75)';
    CTX.lineWidth = 1.6;
    CTX.strokeText(s, x + SQPX/2, y + SQPX/2);
  }

  CTX.fillStyle = isW ? '#fff0f4' : '#100208';
  CTX.fillText(s, x + SQPX/2, y + SQPX/2);
  CTX.restore();

  CTX.shadowColor = 'transparent';
  CTX.shadowBlur = 0; CTX.shadowOffsetX = 0; CTX.shadowOffsetY = 0;
}

// Piece animation
let animRAF = null;
function animPiece(from, to, piece, cb) {
  S.anim = { active: true, from, to, piece, t: 0, startMs: performance.now() };
  const dur = 220;
  function step(now) {
    S.anim.t = (now - S.anim.startMs) / dur;
    draw();
    if (S.anim.t < 1) {
      animRAF = requestAnimationFrame(step);
    } else {
      S.anim.active = false;
      draw();
      if (cb) cb();
    }
  }
  animRAF = requestAnimationFrame(step);
}

// ── GAME STATE HELPERS ────────────────────────────────────────
function getViewBoard() {
  if (!S.game) return null;
  if (S.viewIdx === -1) return S.game.board;

  // Replay from history
  const hist = S.game.history;
  if (S.viewIdx >= hist.length) return S.game.board;

  // We need to track the board as of viewIdx
  // The server sends us the current board; for view we'd replay.
  // Simpler: ask server for position — but for now replay locally.
  // Build board from known history embedded in game state
  // We'll just use the current board for simplicity (replay would need
  // a full local engine, which we have via the server). 
  // For now return current board when viewing - good enough UX
  return S.game.board;
}

// ── BOARD CLICK ───────────────────────────────────────────────
CV && CV.addEventListener('click', onBoardClick);

function setupClickListener() {
  const c = document.getElementById('boardCanvas');
  if (c && !c._cl) {
    c.addEventListener('click', onBoardClick);
    c._cl = true;
  }
}

function onBoardClick(e) {
  if (!S.game || S.game.status !== 'playing') return;
  if (S.animating || S.anim.active) return;
  if (S.meta && S.meta.mode === 'ai' && S.game.turn !== S.meta.player_color) return;
  if (S.viewIdx !== -1) {
    // Return to live
    S.viewIdx = -1; draw(); updateMoveList(); return;
  }

  const rect = CV.getBoundingClientRect();
  const scaleX = CV.width / rect.width;
  const scaleY = CV.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  const sq = xySq(x, y);
  if (sq < 0) return;

  const board = S.game.board;
  const pieceAtSq = board[sq];
  const pieceColor = pieceAtSq ? pieceAtSq[0] : null;

  if (S.selSq === -1) {
    if (pieceColor === S.game.turn) {
      S.selSq = sq;
      fetchLegal(sq);
    }
  } else {
    if (S.legalSqs.includes(sq)) {
      tryMove(S.selSq, sq);
      S.selSq = -1; S.legalSqs = []; draw();
    } else if (pieceColor === S.game.turn && sq !== S.selSq) {
      S.selSq = sq;
      fetchLegal(sq);
    } else {
      S.selSq = -1; S.legalSqs = []; draw();
    }
  }
}

async function fetchLegal(sq) {
  try {
    const r = await api('/api/legal_moves', { sq });
    S.legalSqs = r.legal || [];
    draw();
  } catch (e) {
    S.legalSqs = []; draw();
  }
}

function tryMove(from, to) {
  const board = S.game.board;
  const piece = board[from];
  if (!piece) return;
  const tp = piece[1];
  const toRow = Math.floor(to / 8);
  if (tp === 'P' && (toRow === 0 || toRow === 7)) {
    showPromoModal(piece[0], promo => sendMove(from, to, promo));
  } else {
    sendMove(from, to, null);
  }
}

// ── API CALLS ─────────────────────────────────────────────────
async function api(url, body = null) {
  const opts = {
    method: body !== null ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== null) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

async function newGame(mode) {
  const pill = document.querySelector('.mode-pill.active');
  const tSec = parseInt(pill?.dataset.t || 600);
  const iSec = parseInt(pill?.dataset.i || 5);
  const mName = pill?.dataset.n || 'Rapid';

  try {
    const data = await api('/api/new_game', {
      mode,
      time: tSec,
      inc: iSec,
      color: S.playerColorChoice,
      ai_depth: S.aiDepth || 2,
      mode_name: mName,
    });
    applyGameState(data);
    S.meta = data.meta;
    S.flipped = mode === 'ai' && data.meta.player_color === 'b';
    S.lastFrom = -1; S.lastTo = -1;
    S.selSq = -1; S.legalSqs = []; S.viewIdx = -1;

    showScreen('game');
    initCanvas();
    updateAll(data.ai_move);

    // If AI moved first
    if (data.ai_move) {
      S.lastFrom = data.ai_move.from;
      S.lastTo = data.ai_move.to;
    }

    setStatus('Your move, my love ♥');
  } catch (err) {
    showToast('Could not start game: ' + err.message);
  }
}

async function sendMove(from, to, promo) {
  S.animating = true;
  const piece = S.game.board[from];

  // Animate immediately (optimistic UI)
  animPiece(from, to, promo ? piece[0] + promo : piece, async () => {
    try {
      const data = await api('/api/move', { from, to, promo });

      if (data.needs_promotion) {
        S.animating = false;
        showPromoModal(S.game.board[from][0], p => sendMove(from, to, p));
        return;
      }
      if (data.error) {
        showToast(data.error);
        S.animating = false;
        applyGameState({ ...S.game }); // re-render old state
        draw();
        return;
      }

      S.lastFrom = from; S.lastTo = to;
      const moveInfo = data.move;
      const aiMove = data.ai_move;

      if (moveInfo && moveInfo.captured) spawnHeart(to);
      if (moveInfo && moveInfo.check) playSound('check');
      else if (moveInfo && moveInfo.captured) playSound('capture');
      else playSound('move');

      applyGameState(data);

      // If AI also moved
      if (aiMove) {
        setTimeout(() => {
          animPiece(aiMove.from, aiMove.to,
            S.game.board[aiMove.to] || piece, () => {
              S.lastFrom = aiMove.from; S.lastTo = aiMove.to;
              if (aiMove.captured) spawnHeart(aiMove.to);
              if (aiMove.check) playSound('check');
              else if (aiMove.captured) playSound('capture');
              else playSound('move');
              applyGameState(data);
              updateAll();
              checkGameOver(data);
              S.animating = false;
            });
        }, 80);
      } else {
        updateAll();
        checkGameOver(data);
        S.animating = false;
      }

    } catch (err) {
      S.animating = false;
      showToast('Move failed: ' + err.message);
      draw();
    }
  });
}

// ── APPLY STATE ───────────────────────────────────────────────
function applyGameState(data) {
  S.game = data;
  // Convert board '' back to null
  if (S.game.board) {
    S.game.board = S.game.board.map(p => p === '' ? null : p);
  }
}

function updateAll(aiMove) {
  draw();
  updateClocks();
  updateSidebar();
  updateMoveList();
  updateInfoPanel();

  if (!S.game) return;
  if (S.game.in_check && S.game.status === 'playing') {
    setStatus('Check! Protect your king, love ♥', true);
  } else if (S.game.status === 'playing') {
    if (S.meta && S.meta.mode === 'ai' && S.game.turn !== S.meta.player_color) {
      setStatusThinking();
    } else {
      setStatus(S.game.turn === 'w' ? 'White to move ♔' : 'Black to move ♚');
    }
  }
}

function checkGameOver(data) {
  const status = data.status;
  if (!['playing'].includes(status)) {
    setTimeout(() => showGameOver(status, data.winner), 500);
  }
}

// ── CLOCKS ────────────────────────────────────────────────────
let clockInterval = null;
let clkW = 600, clkB = 600, clkInc = 5, clkActive = null, clkUnlimited = false;

function startClientClock(meta) {
  clkW = meta.time_w; clkB = meta.time_b;
  clkInc = meta.inc; clkUnlimited = meta.unlimited;
  clkActive = null;
  if (clockInterval) clearInterval(clockInterval);
  if (!clkUnlimited) {
    clkActive = 'w';
    clockInterval = setInterval(tickClock, 1000);
  }
  renderClocks();
}

function tickClock() {
  if (!clkActive || !S.game || S.game.status !== 'playing') return;
  if (clkUnlimited) return;
  if (clkActive === 'w') clkW--; else clkB--;
  renderClocks();
  const t = clkActive === 'w' ? clkW : clkB;
  if (t <= 0) {
    clearInterval(clockInterval);
    api('/api/resign').catch(() => {});
    showGameOver('timeout', clkActive === 'w' ? 'b' : 'w');
  }
}

function switchClock(col) {
  if (clkUnlimited) return;
  if (clkActive) {
    if (clkActive === 'w') clkW += clkInc; else clkB += clkInc;
  }
  clkActive = col;
}

function renderClocks() {
  const botCol = S.flipped ? 'b' : 'w';
  const topCol = S.flipped ? 'w' : 'b';
  const bEl = document.getElementById('botClock');
  const tEl = document.getElementById('topClock');
  if (bEl) { bEl.textContent = fmtClk(botCol === 'w' ? clkW : clkB); bEl.className = 'pc-clock' + ((botCol === 'w' ? clkW : clkB) <= 30 && !clkUnlimited ? ' danger' : ''); }
  if (tEl) { tEl.textContent = fmtClk(topCol === 'w' ? clkW : clkB); tEl.className = 'pc-clock' + ((topCol === 'w' ? clkW : clkB) <= 30 && !clkUnlimited ? ' danger' : ''); }
}

function fmtClk(t) {
  if (clkUnlimited) return '∞';
  t = Math.max(0, t);
  return `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}`;
}

function updateClocks() {
  if (!S.meta) return;
  if (S.game && S.game.status === 'playing') {
    switchClock(S.game.turn);
  }
  renderClocks();
}

// ── SIDEBAR ───────────────────────────────────────────────────
function updateSidebar() {
  if (!S.game) return;
  const board = S.game.board;
  const initCnt = { P:8, N:2, B:2, R:2, Q:1 };
  const cnt = {};
  board.forEach(p => { if (p && p[1] !== 'K') cnt[p] = (cnt[p] || 0) + 1; });

  let wMat = 0, bMat = 0;
  let wCapStr = '', bCapStr = '';
  const pvals = { Q:9, R:5, B:3, N:3, P:1 };
  ['Q','R','B','N','P'].forEach(tp => {
    wMat += (cnt['w'+tp]||0) * pvals[tp];
    bMat += (cnt['b'+tp]||0) * pvals[tp];
    const wCap = initCnt[tp] - (cnt['b'+tp]||0); // white captured black pieces
    const bCap = initCnt[tp] - (cnt['w'+tp]||0);
    if (wCap > 0) wCapStr += SYMS['b'+tp].repeat(wCap);
    if (bCap > 0) bCapStr += SYMS['w'+tp].repeat(bCap);
  });

  const diff = wMat - bMat;
  if (S.flipped) {
    // Top = white, Bot = black
    setEl('topCap', bCapStr); setEl('botCap', wCapStr);
    setEl('topAdv', diff > 0 ? '+'+diff : '');
    setEl('botAdv', diff < 0 ? '+'+(Math.abs(diff)) : '');
  } else {
    // Bot = white, Top = black
    setEl('botCap', wCapStr); setEl('topCap', bCapStr);
    setEl('botAdv', diff > 0 ? '+'+diff : '');
    setEl('topAdv', diff < 0 ? '+'+(Math.abs(diff)) : '');
  }

  const botActive = S.flipped ? S.game.turn === 'b' : S.game.turn === 'w';
  document.getElementById('botCard').className = 'player-card' + (botActive ? ' active' : '');
  document.getElementById('topCard').className = 'player-card' + (!botActive ? ' active' : '');

  let hearts = '';
  (S.game.history || []).forEach(m => { if (m.captured) hearts += '♥'; });
  setEl('heartsEarned', hearts || '—');
}

function updateMoveList() {
  if (!S.game) return;
  const sc = document.getElementById('moveScroll'); if (!sc) return;
  sc.innerHTML = '';
  const h = S.game.history || [];
  for (let i = 0; i < h.length; i += 2) {
    const row = document.createElement('div'); row.className = 'move-row';
    const num = document.createElement('span'); num.className = 'move-n'; num.textContent = (i/2+1)+'.'; row.appendChild(num);
    const wm = document.createElement('span');
    wm.className = 'move-san' + (S.viewIdx === i ? ' hl' : '');
    wm.textContent = h[i].san; wm.dataset.idx = i;
    wm.addEventListener('click', function() { S.viewIdx = +this.dataset.idx; draw(); updateMoveList(); });
    row.appendChild(wm);
    if (h[i+1]) {
      const bm = document.createElement('span');
      bm.className = 'move-san' + (S.viewIdx === i+1 ? ' hl' : '');
      bm.textContent = h[i+1].san; bm.dataset.idx = i+1;
      bm.addEventListener('click', function() { S.viewIdx = +this.dataset.idx; draw(); updateMoveList(); });
      row.appendChild(bm);
    }
    sc.appendChild(row);
  }
  sc.scrollTop = sc.scrollHeight;
}

function updateInfoPanel() {
  if (!S.game || !S.meta) return;
  setEl('infoMode', S.meta.mode_name || '—');
  setEl('infoMoves', S.game.move_count || 0);
  setEl('infoTurn', S.game.turn === 'w' ? 'White' : 'Black');
}

function navMove(delta) {
  if (!S.game || !S.game.history.length) return;
  const max = S.game.history.length - 1;
  let cur = S.viewIdx === -1 ? max : S.viewIdx;
  if (delta === 999) S.viewIdx = -1;
  else if (delta === -999) S.viewIdx = 0;
  else {
    cur = Math.max(0, Math.min(max, cur + delta));
    S.viewIdx = (cur === max) ? -1 : cur;
  }
  draw(); updateMoveList();
}

// ── GAME OVER SCREEN ──────────────────────────────────────────
function showGameOver(reason, winner) {
  if (clockInterval) clearInterval(clockInterval);

  const msgs = {
    checkmate: {
      w: { emoji:'👑', title:'White Wins!', sub:'A crown for your courage, love.', msg:'The black king surrenders. What a beautiful battle of hearts!', score:'1 – 0' },
      b: { emoji:'🖤', title:'Black Wins!', sub:'Dark, daring, and devastating.', msg:'The white king bows gracefully. A masterpiece!', score:'0 – 1' },
    },
    stalemate: { any: { emoji:'🤝', title:'Stalemate!', sub:'A perfectly balanced love.', msg:'Neither heart could be cornered. You are equally matched, darlings.', score:'½ – ½' }},
    draw:      { any: { emoji:'💞', title:'Draw Agreed', sub:'Peace is its own kind of victory.', msg:'You chose harmony over battle. How wonderfully romantic.', score:'½ – ½' }},
    draw50:    { any: { emoji:'⏳', title:'50-Move Draw', sub:'A long and passionate endgame.', msg:'No captures, no pawns moved — the dance ends in a tie.', score:'½ – ½' }},
    timeout:   {
      w: { emoji:'⏰', title:'White Wins on Time!', sub:'Patience is a love language.', msg:"Black's clock ran out. Tick tock, darling!", score:'1 – 0' },
      b: { emoji:'⏰', title:'Black Wins on Time!', sub:'Time waits for no one.', msg:"White's clock ran out. Better luck next time, love!", score:'0 – 1' },
    },
    resigned:  {
      w: { emoji:'🌹', title:'White Wins!', sub:'Graceful as a rose, your rival concedes.', msg:'Black resigned. Bow to the victor!', score:'1 – 0' },
      b: { emoji:'🌹', title:'Black Wins!', sub:'Sometimes love means knowing when to bow.', msg:'White resigned. A graceful exit.', score:'0 – 1' },
    },
  };

  const cat = msgs[reason] || msgs.draw;
  const data = cat[winner] || cat.any || cat.w;

  setEl('goEmoji', data.emoji);
  setEl('goTitle', data.title);
  setEl('goSubtitle', data.sub);
  setEl('goScore', data.score);
  setEl('goMsg', data.msg);

  document.getElementById('gameOverOverlay').classList.add('show');
  if (['checkmate','timeout'].includes(reason)) spawnHeartShower();
}

function closeGameOver() {
  document.getElementById('gameOverOverlay').classList.remove('show');
}

// ── PROMOTION MODAL ───────────────────────────────────────────
function showPromoModal(color, cb) {
  const grid = document.getElementById('promoGrid'); if (!grid) return;
  grid.innerHTML = '';
  const pieces = [
    { t:'Q', name:'Queen' },
    { t:'R', name:'Rook' },
    { t:'B', name:'Bishop' },
    { t:'N', name:'Knight' },
  ];
  pieces.forEach(({ t, name }) => {
    const btn = document.createElement('div'); btn.className = 'promo-btn';
    btn.innerHTML = `${SYMS[color+t]}<span class="promo-name">${name}</span>`;
    btn.onclick = () => { closeModal('promoModal'); cb(t); };
    grid.appendChild(btn);
  });
  openModal('promoModal');
}

// ── ANALYSIS ─────────────────────────────────────────────────
async function openAnalysis() {
  if (!S.game || !S.game.history.length) {
    showToast('Play some moves first, darling! ♥'); return;
  }
  try {
    const data = await api('/api/analyze');
    const qualCfg = [
      { k:'best',       color:'#4ade80', label:'Best' },
      { k:'good',       color:'#60a5fa', label:'Good' },
      { k:'inaccuracy', color:'#facc15', label:'Inaccuracy' },
      { k:'mistake',    color:'#f97316', label:'Mistake' },
      { k:'blunder',    color:'#ef4444', label:'Blunder' },
    ];
    const renderQ = (stats, id) => {
      const el = document.getElementById(id); if (!el) return; el.innerHTML = '';
      qualCfg.forEach(q => {
        const row = document.createElement('div'); row.className = 'quality-row';
        row.innerHTML = `<span class="q-label"><span class="q-dot" style="background:${q.color}"></span>${q.label}</span><span class="q-count" style="color:${q.color}">${stats[q.k]||0}</span>`;
        el.appendChild(row);
      });
    };
    renderQ(data.white, 'analysisWhite');
    renderQ(data.black, 'analysisBlack');

    const aw = data.accuracy_white, ab = data.accuracy_black;
    const awb = document.getElementById('accWbar'); if (awb) awb.style.width = aw + '%';
    setEl('accWval', aw + '%');
    const abb = document.getElementById('accBbar'); if (abb) abb.style.width = ab + '%';
    setEl('accBval', ab + '%');

    const cm = document.getElementById('criticalMoments'); if (cm) {
      cm.innerHTML = '';
      if (!data.critical.length) {
        cm.innerHTML = '<div style="color:var(--t2);font-size:.85rem;padding:.3rem">No critical errors — beautifully played! ♥</div>';
      }
      const catColors = { blunder:'#ef4444', mistake:'#f97316' };
      data.critical.forEach((c, i) => {
        const d = document.createElement('div'); d.className = 'crit-item';
        const clr = catColors[c.category] || '#facc15';
        d.innerHTML = `<span style="color:var(--t3);min-width:18px;font-size:.75rem">${i+1}.</span><span style="font-family:'Cormorant Garamond',serif;font-size:.95rem">${c.color==='w'?'♔':'♚'} ${c.move_num}${c.color==='b'?'…':'.'} ${c.san}</span><span style="color:${clr};font-weight:600;margin-left:auto;font-size:.76rem">${c.category}</span>`;
        cm.appendChild(d);
      });
    }
    openModal('analysisModal');
  } catch (err) {
    showToast('Analysis failed: ' + err.message);
  }
}

// ── PGN ───────────────────────────────────────────────────────
async function copyPGN() {
  try {
    const data = await api('/api/pgn');
    await navigator.clipboard.writeText(data.pgn);
    showToast('PGN copied to clipboard ♥');
  } catch (err) {
    showToast('Copy failed');
  }
}

// ── CONTROLS ─────────────────────────────────────────────────
async function undoMove() {
  if (!S.game || !S.game.history.length) return;
  try {
    const data = await api('/api/undo');
    applyGameState(data);
    S.selSq = -1; S.legalSqs = []; S.viewIdx = -1;
    S.lastFrom = data.history.length ? data.history.at(-1).from : -1;
    S.lastTo   = data.history.length ? data.history.at(-1).to   : -1;
    updateAll(); setStatus('Take back ♥');
  } catch (err) {
    showToast(err.message);
  }
}

async function resignGame() {
  if (!S.game || S.game.status !== 'playing') return;
  if (!confirm('Are you sure you want to resign, darling? ♥')) return;
  try {
    const data = await api('/api/resign');
    applyGameState(data);
    draw(); showGameOver('resigned', data.winner);
  } catch (err) { showToast(err.message); }
}

async function offerDraw() {
  if (!S.game || S.game.status !== 'playing') return;
  openModal('drawModal');
}
async function acceptDraw() {
  closeModal('drawModal');
  try {
    const data = await api('/api/draw');
    applyGameState(data);
    draw(); showGameOver('draw', null);
  } catch (err) { showToast(err.message); }
}

// ── UI HELPERS ────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.toggle('hidden', s.id !== id);
  });
  if (id === 'gameScreen') setTimeout(() => { initCanvas(); setupClickListener(); }, 80);
}
function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function setStatus(txt, isCheck) {
  const el = document.getElementById('statusBar'); if (!el) return;
  el.textContent = txt;
  el.classList.toggle('check', !!isCheck);
}
function setStatusThinking() {
  const el = document.getElementById('statusBar'); if (!el) return;
  el.innerHTML = '♥ Thinking <span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-dot"></span>';
  el.classList.remove('check');
}

function flipBoard() {
  S.flipped = !S.flipped;
  buildLabels(); draw();
  updateSidebar();
}

S.playerColorChoice = 'w';
function pickColor(c) {
  S.playerColorChoice = c;
  ['cbW','cbB','cbR'].forEach(id => document.getElementById(id)?.classList.remove('chosen'));
  document.getElementById(c==='w'?'cbW':c==='b'?'cbB':'cbR')?.classList.add('chosen');
}

S.aiDepth = 2;

function apply3D(el) {
  S.three_d = el.checked;
  const bt = document.getElementById('boardTilt');
  if (bt) bt.classList.toggle('flat', !el.checked);
}

function toggleSound() {
  S.snd = !S.snd;
  document.getElementById('sndToggle').textContent = S.snd ? '🔊' : '🔇';
  document.getElementById('sSnd').checked = S.snd;
}
function updateSndBtn() {
  document.getElementById('sndToggle').textContent = S.snd ? '🔊' : '🔇';
}

// Mode pills
document.getElementById('modesRow')?.addEventListener('click', e => {
  const pill = e.target.closest('.mode-pill'); if (!pill) return;
  document.querySelectorAll('.mode-pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
});

// ── SOUND ─────────────────────────────────────────────────────
let AC = null;
function getAC() { if (!AC) try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {} return AC; }
function playSound(type) {
  if (!S.snd) return;
  const ac = getAC(); if (!ac) return;
  try {
    const o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    const cfgs = {
      move:    { f1:500,  f2:640,  d:0.22, v:0.1 },
      capture: { f1:280,  f2:160,  d:0.30, v:0.13 },
      check:   { f1:900,  f2:1120, d:0.28, v:0.14 },
    };
    const c = cfgs[type] || cfgs.move;
    g.gain.setValueAtTime(c.v, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + c.d);
    o.frequency.setValueAtTime(c.f1, ac.currentTime);
    o.frequency.setValueAtTime(c.f2, ac.currentTime + 0.07);
    o.type = 'sine'; o.start(ac.currentTime); o.stop(ac.currentTime + c.d);
  } catch(e) {}
}

// ── VISUAL FX ────────────────────────────────────────────────
function spawnHeart(sq) {
  if (!CV) return;
  const rect = CV.getBoundingClientRect();
  const [bx, by] = sqXY(sq);
  const sx = CV.width / rect.width, sy = CV.height / rect.height;
  const cx = rect.left + bx / sx + (SQPX / sx) / 2;
  const cy = rect.top  + by / sy + (SQPX / sy) / 2;
  const h = document.createElement('div'); h.className = 'float-heart';
  h.textContent = '♥';
  h.style.cssText = `left:${cx}px;top:${cy}px;font-size:${1.2+Math.random()*0.5}rem;color:hsl(${340+Math.random()*30},90%,${62+Math.random()*18}%);`;
  document.body.appendChild(h); setTimeout(() => h.remove(), 4000);
}

function spawnHeartShower() {
  const emojis = ['♥','💕','💖','💗','♡'];
  for (let i = 0; i < 28; i++) setTimeout(() => {
    const h = document.createElement('div'); h.className = 'float-heart';
    h.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    h.style.cssText = `left:${8+Math.random()*84}vw;top:${25+Math.random()*45}vh;font-size:${1+Math.random()*2}rem;color:hsl(${335+Math.random()*40},85%,${58+Math.random()*22}%);animation-duration:${2.5+Math.random()*2}s;`;
    document.body.appendChild(h); setTimeout(() => h.remove(), 5000);
  }, i * 90);
}

function showToast(msg) {
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

// ── BACKGROUND PARTICLES ──────────────────────────────────────
(function bgParticles() {
  const c = document.getElementById('bgCanvas');
  if (!c) return;
  const ctx = c.getContext('2d');
  let W, H;
  const pts = Array.from({ length: 55 }, () => ({
    x: Math.random() * 1200, y: Math.random() * 800,
    vx: (Math.random() - 0.5) * 0.28, vy: (Math.random() - 0.5) * 0.22,
    r: Math.random() * 2 + 0.5, phase: Math.random() * Math.PI * 2,
    sym: ['♥','♡','·','·','·'][Math.floor(Math.random() * 5)],
  }));
  function resize() { W = c.width = window.innerWidth; H = c.height = window.innerHeight; }
  resize(); window.addEventListener('resize', resize);
  function frame() {
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createRadialGradient(W/2, H*0.82, 0, W/2, H*0.82, Math.max(W,H));
    bg.addColorStop(0, '#280618'); bg.addColorStop(0.45, '#10040e'); bg.addColorStop(1, '#070204');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.phase += 0.006;
      if (p.x < -20) p.x = W + 20; if (p.x > W + 20) p.x = -20;
      if (p.y < -20) p.y = H + 20; if (p.y > H + 20) p.y = -20;
      const alpha = (0.25 + 0.22 * Math.sin(p.phase)) * 0.65;
      ctx.font = p.r * 9 + 'px serif';
      ctx.fillStyle = `rgba(232,84,122,${alpha})`;
      ctx.textAlign = 'center';
      ctx.fillText(p.sym, p.x, p.y);
    });
    requestAnimationFrame(frame);
  }
  frame();
})();

// ── INIT ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  setupClickListener();
  initCanvas();
});
window.addEventListener('resize', () => {
  if (!document.getElementById('gameScreen')?.classList.contains('hidden')) {
    initCanvas();
  }
});

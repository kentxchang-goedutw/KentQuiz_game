// ===== board.js：升學大冒險（地圖版）=====
// 參考原作「買賣能力」：一格一格的地圖、三轉輪拉霸、殘機、特殊格子、階段審查與升降級
const RANKS = [
  { title: '小組長', eval: '加油喔' }, { title: '班長', eval: '再努力' }, { title: '模範生', eval: '普通' },
  { title: '學生會長', eval: '實力派' }, { title: '榜首', eval: '傑出人物' }
];
const ENDING_TEXT = [
  '唉……你的榮昇只到了「小組長」。窗外的落葉，好像在替你嘆氣……',
  '你的榮昇只到了「班長」。被冷落的滋味可真不好受啊……',
  '「模範生」？還不錯啦，但離榜首還有一大段距離呢。',
  '只差一步就是榜首了！下次一定可以！'
];
// 格子底色（依格子種類）
const CELLS = {
  start: '#ffffff', q: '#9fd3ff', hint: '#ffd56b', who: '#8ff09a', lie: '#c9b8ff', trip: '#bfe8ff', rapid: '#ff9ad5',
  trouble: '#ff7a7a', lucky: '#fff3a0', fever: '#ffb347', branch: '#ece6fa', fate: '#d9c2ff', check: '#ffd700'
};
// 地圖格子上的圖示：各學級學校生活裡會看到的物品（不顯示題型文字）
const STAGE_ITEMS = [
  { q: '🖍️', hint: '🧸', who: '🧩', lie: '🎈', trip: '🚌', rapid: '🥁', trouble: '🦖', lucky: '🍭', fever: '🎠', branch: '🪧', fate: '🎪' },   // 幼稚園
  { q: '✏️', hint: '📒', who: '🔍', lie: '📏', trip: '🎒', rapid: '⏰', trouble: '🧹', lucky: '🍱', fever: '🪀', branch: '🪧', fate: '🔔' },   // 國小
  { q: '📘', hint: '🧮', who: '🔬', lie: '📐', trip: '🏀', rapid: '⏱️', trouble: '📝', lucky: '🥤', fever: '🎧', branch: '🪧', fate: '🔔' },   // 國中
  { q: '📚', hint: '🧪', who: '🔭', lie: '🖊️', trip: '🏐', rapid: '⌚', trouble: '📋', lucky: '🍜', fever: '🎸', branch: '🪧', fate: '⚖️' },   // 高中
  { q: '💻', hint: '📖', who: '🗺️', lie: '📰', trip: '✈️', rapid: '☕', trouble: '📑', lucky: '🍕', fever: '🎮', branch: '🪧', fate: '⚖️' }    // 大學
];
// 特殊事件格在圖示下方標出事件名稱（一般答題格不標題型）
const EVENT_LABEL = { start: 'START', check: '期末審查', trip: '校外教學', rapid: '快問快答', trouble: 'TROUBLE', lucky: 'LUCKY', fever: 'FEVER', branch: '分岐', fate: '天堂地獄' };
const cellIcon = (type, si) => type === 'start' ? '🏫' : type === 'check' ? '🏆' : STAGE_ITEMS[si][type];
const LANE_INFO = { upper: '上部課程（難・分數×1.5）', lower: '下部課程（輕鬆）', heaven: '榮昇之路', hell: '坎坷之路' };
const TRIP_PLACE = { '自然': '科學博物館', '社會': '歷史博物館', '數學': '數學遊樂園', '國語': '圖書館', '英語': '國際村', '英文': '國際村', '生活常識': '消防局', '台灣在地文化': '老街', '健康': '醫院', '藝術': '美術館', '音樂': '音樂廳' };
const START_LIVES = 3;

// ---------- 題目來源 ----------
function boardPool(combo) {
  const out = [];
  combo.items.forEach(it => { const b = Data.map[it.bankId]; if (b && it.weight > 0) out.push(...b.questions); });
  return out;
}
function poolInfo(pool) {
  const tf = pool.filter(q => q.type === 'truefalse');
  return {
    total: pool.length,
    images: pool.filter(q => q.image && (q.type === 'choice' || q.type === 'image')).length,
    hints: pool.filter(q => q.hints && q.hints.length && (q.type === 'choice' || q.type === 'image')).length,
    choice: pool.filter(q => q.type === 'choice' || q.type === 'image').length,
    tfO: tf.filter(q => q.answer === 'O').length, tfX: tf.filter(q => q.answer === 'X').length,
    subjects: [...new Set(pool.map(q => q.subject).filter(Boolean))]
  };
}
// 從題目池抽一題：先找沒出過、難度相符的，再慢慢放寬
function drawFrom(filter, diff) {
  let c = G.pool.filter(q => filter(q) && !G.asked.has(q.id));
  if (!c.length) c = G.pool.filter(filter);
  if (!c.length) return null;
  const near = c.filter(q => Quiz.dist(q.difficulty, diff) === 0), near1 = c.filter(q => Quiz.dist(q.difficulty, diff) <= 1);
  const src = near.length ? near : near1.length ? near1 : c;
  const q = pick(src); G.asked.add(q.id); return q;
}
function drawAny(diff) {
  const { list } = Quiz.draw(G.combo, Data.map, 1, diff, G.asked);
  if (!list.length) return null;
  G.asked.add(list[0].id); return list[0];
}
// 選擇題只留 n 個選項（一定包含正確答案）
function trimOpts(p, n) {
  if (!(p.type === 'choice' || p.type === 'image') || p.opts.length <= n) return p;
  const others = Quiz.shuffle(p.opts.filter((o, i) => i !== p.correct)).slice(0, n - 1);
  const opts = Quiz.shuffle([p.opts[p.correct], ...others]);
  return Object.assign({}, p, { opts, correct: opts.indexOf(p.opts[p.correct]) });
}
// 謊言四選一：三題「對」的是非題＋一題「錯」的，問哪一個說法是錯的
function makeLie(diff) {
  const x = drawFrom(q => q.type === 'truefalse' && q.answer === 'X', diff);
  const os = []; for (let i = 0; i < 3; i++) { const o = drawFrom(q => q.type === 'truefalse' && q.answer === 'O' && !os.includes(q), diff); if (o) os.push(o); }
  if (!x || os.length < 3) return null;
  const all = Quiz.shuffle([x, ...os]);
  return { type: 'choice', src: x, question: '下面哪一個說法是錯的？', subject: x.subject || '其他', opts: all.map(q => ({ text: q.question })), correct: all.indexOf(x),
    answerText: x.question, explain: x.explain ? `錯誤的說法：${x.question}（${x.explain}）` : `錯誤的說法：${x.question}` };
}

// ---------- 地圖產生 ----------
function makeStage(si) {
  const info = G.info, nodes = [];
  const add = (type, x, y, lane) => { nodes.push({ id: nodes.length, type, x, y, lane, next: [] }); return nodes.length - 1; };
  const link = (a, b) => nodes[a].next.push(b);
  const W = {
    main: { q: 30, hint: 10, who: 8, lie: 8, trip: 9, rapid: si >= 1 ? 6 : 0, trouble: si >= 1 ? 7 : 0, lucky: 10, fever: 5 },
    upper: { q: 20, hint: 10, who: 8, lie: 8, rapid: 12, trouble: 14, fever: 8, lucky: 6 },
    lower: { q: 40, lucky: 12, hint: 8, trip: 10, lie: 6 },
    heaven: { lucky: 40, fever: 30, q: 30 },
    hell: { trouble: 60, rapid: 25, q: 15 }
  };
  const ok = { who: info.images > 0, lie: info.tfO >= 3 && info.tfX >= 1, hint: info.choice > 0, trip: info.subjects.length > 0 };
  const pickType = lane => {
    const w = Object.entries(W[lane]).filter(([k, v]) => v > 0 && ok[k] !== false);
    let r = Math.random() * w.reduce((s, [, v]) => s + v, 0);
    for (const [k, v] of w) { r -= v; if (r < 0) return k; }
    return 'q';
  };
  let x = 0, prev = add('start', x++, 0, 'main');
  const seg = n => { for (let i = 0; i < n; i++) { const id = add(pickType('main'), x++, 0, 'main'); link(prev, id); prev = id; } };
  const fork = (type, la, lb, n) => {
    const f = add(type, x++, 0, 'main'); link(prev, f);
    let a = f, b = f; const bx = x;
    for (let i = 0; i < n; i++) {
      const u = add(pickType(la), bx + i, -1, la); link(a, u); a = u;
      const d = add(pickType(lb), bx + i, 1, lb); link(b, d); b = d;
    }
    x = bx + n; const m = add(pickType('main'), x++, 0, 'main'); link(a, m); link(b, m); prev = m;
  };
  seg(2 + si);
  if (si >= 1) fork('branch', 'upper', 'lower', 3);
  seg(2);
  if (si >= 3) fork('fate', 'heaven', 'hell', 3);
  seg(1 + (si >= 2 ? 1 : 0));
  const c = add('check', x++, 0, 'main'); link(prev, c);
  return nodes;
}
function stageInfo(si) { return stageCfg(si); }

// ---------- 開始新的一局 ----------
function startBoardGame(combo, character) {
  const pool = boardPool(combo);
  G = { mode: 'board', comboId: combo.id, combo, character, pool, info: poolInfo(pool), asked: new Set(),
    si: 0, rank: 0, rankHist: [0], score: 0, lives: START_LIVES, continues: 0, buff: {}, stageResults: [], b: null };
  go('board', { newStage: true });
}

// ==========================================================
// 地圖畫面
// ==========================================================
Scenes.board = {
  enter(arg = {}) {
    if (arg.newStage || !G.b) G.b = { nodes: makeStage(G.si), pos: 0, choice: {} };
    this.b = G.b; this.phase = 'idle'; this.camX = this.nodeX(G.b.pos) - 110; this.hop = null;
    Sound.playMusic('title');
    this.route = h('div', { class: 'route' }, ['START', '1', '2', '3', '4', '5', 'GOAL'].map((s, i) =>
      h('span', { class: 'r' + (i === G.si + 1 ? ' on' : i <= G.si ? ' done' : '') }, i >= 1 && i <= 5 ? `${s} ${DEFAULT_STAGES[i - 1].name}` : s)));
    this.hud = h('div', { class: 'bhud' });
    this.reels = [0, 1].map(() => h('div', { class: 'reel' }, '？'));
    this.btn = h('button', { class: 'btn red gobtn', onclick: () => this.press() }, 'GO!');
    this.msg = h('span', { class: 'tag bmsg' });
    ui.append(this.route, this.hud,
      h('div', { class: 'reelbox' }, h('div', null, h('div', { class: 'reelcap' }, h('span', null, '步數'), h('span', null, '狀態')), h('div', { class: 'reels' }, this.reels)), this.btn),
      h('button', { class: 'btn small gray quitbtn', title: '也可以按 Esc', onclick: () => this.quit() }, '🚪 離開遊戲'));
    this.renderHud();
    if (arg.newStage) {
      const st = stageInfo(G.si);
      ui.append(h('div', { class: 'banner stay stagebanner' }, `STAGE ${G.si + 1}　${st.name}`));
      Sound.sfx('bell');
      later(() => { ui.querySelectorAll('.stagebanner').forEach(e => e.remove()); this.say('按下 GO! 轉動拉霸，前進到下一格！'); }, 2200);
      if (G.si === 0) Sound.say('V02');
    } else this.say(arg.msg || '按下 GO! 繼續前進！');
  },
  renderHud() {
    const lives = h('span', { class: 'lives' }, Array.from({ length: G.lives }, () => h('img', { src: (Art.portrait(G.character, 'normal', 0.42)).src, alt: '' })));
    const buffs = [G.buff.lessTarget ? '目標 −1' : '', G.buff.twoChoice ? '下次二選一' : ''].filter(Boolean).join('・');
    this.hud.replaceChildren(
      h('span', { class: 'tag' }, '1P ', h('b', null, G.score.toLocaleString())),
      h('span', { class: 'tag' }, `${RANKS[G.rank].title}（${RANKS[G.rank].eval}）`, buffs ? h('b', null, '　🍀' + buffs) : null),
      this.msg,
      h('span', { class: 'tag' }, '殘機 ', lives));
  },
  say(t) { this.msg.textContent = t; },
  quit() {
    if (this.phase === 'moving' || this.phase === 'spinning') return;
    if (confirm('確定要離開升學大冒險嗎？這一場的進度和分數不會保留。')) go('modes');
  },
  nodeX(id) { return this.b.nodes[id].x * 52 + 30; },
  nodeY(id) { return 112 + this.b.nodes[id].y * 34; },
  press() {
    if (this.phase === 'idle') this.spin();
    else if (this.phase === 'spinning') this.stop();
  },
  key(e) {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (this.choose) return; this.press(); }
    if (this.choose && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) this.choose(e.key === 'ArrowUp' ? 0 : 1);
    if (e.key === 'Escape') this.quit();
  },
  spin() {
    this.phase = 'spinning'; this.btn.textContent = 'STOP!'; Sound.sfx('ok'); Sound.say('B01');
    const faces = [['1', '2', '3', '4'].slice(0, this.maxSteps()), ['😊', '😢']];
    this.spinT = setInterval(() => this.reels.forEach((r, i) => { if (!r.dataset.stop) r.textContent = pick(faces[i]); }), 70);
    this.reels.forEach(r => { delete r.dataset.stop; r.classList.add('spin'); });
    this.autoStop = later(() => this.stop(), 4000);
  },
  async stop() {
    if (this.phase !== 'spinning') return;
    this.phase = 'stopping'; clearTimeout(this.autoStop); const tok = sceneToken;
    const steps = 1 + (Math.random() * this.maxSteps() | 0);
    const mood = Math.random() < 0.5 ? 'happy' : 'sad';
    const vals = [String(steps), mood === 'happy' ? '😊' : '😢'];
    for (let i = 0; i < vals.length; i++) {
      await sleep(320); if (!alive(tok)) return;
      this.reels[i].dataset.stop = 1; this.reels[i].textContent = vals[i]; this.reels[i].classList.remove('spin'); Sound.sfx('stamp');
    }
    clearInterval(this.spinT);
    G.turn = { steps, fmt: G.buff.twoChoice ? 2 : 4, mood };
    this.say(`前進 ${steps} 格｜${mood === 'happy' ? '😊 笑臉：目標少一題、時間多一點' : '😢 哭臉：目標多一題、時間少一點'}`);
    this.btn.disabled = true;
    await sleep(700); if (!alive(tok)) return;
    this.move(steps);
  },
  // 站在分岐（或天堂地獄）路口時最多走 3 格，才不會一次走完整條 3 格的岔路
  maxSteps() { return this.b.nodes[this.b.pos].next.length > 1 ? 3 : 4; },
  nextOf(id) {
    const n = this.b.nodes[id];
    if (n.next.length > 1) return n.next[this.b.choice[id] || 0];
    return n.next[0];
  },
  async move(steps) {
    this.phase = 'moving'; const tok = sceneToken;
    for (let i = 0; i < steps; i++) {
      const nx = this.nextOf(this.b.pos); if (nx == null) break;
      this.hop = { from: this.b.pos, to: nx, t0: performance.now() };
      Sound.sfx('move'); await sleep(320); if (!alive(tok)) return;
      this.b.pos = nx; this.hop = null;
      if (['branch', 'fate', 'check'].includes(this.b.nodes[nx].type)) break;   // 強制停下的格子
    }
    await sleep(250); if (!alive(tok)) return;
    this.land(this.b.nodes[this.b.pos]);
  },
  // 依格子種類觸發事件
  land(node) {
    const t = node.type, lane = node.lane, st = stageInfo(G.si), turn = G.turn || { fmt: 4, mood: 'happy' };
    const happy = turn.mood === 'happy';
    const diff = lane === 'upper' || lane === 'hell' ? [Math.min(5, st.diff[0] + 1), Math.min(5, st.diff[1] + 1)] : st.diff;
    const mult = lane === 'upper' ? 1.5 : lane === 'heaven' ? 2 : 1;
    const sec = Math.max(5, st.sec + (happy ? 3 : -2));
    let target = Math.max(1, 2 + (G.si >= 3 ? 1 : 0) + (happy ? -1 : 1) - (G.buff.lessTarget ? 1 : 0));
    const back = msg => go('board', { msg });
    const useBuffs = () => { G.buff = {}; };
    const base = { diff, mult, sec, fmt: turn.fmt, lane };
    if (t === 'lucky') return this.lucky();
    if (t === 'fever') return go('fever');
    if (t === 'branch') return this.branch(node, ['upper', 'lower'], '分岐點！要走哪一條路？', 'B05');
    if (t === 'start') return back();
    useBuffs();
    if (t === 'q') return go('challenge', Object.assign(base, { kind: 'q', title: '答題挑戰', target }));
    if (t === 'hint') return go('challenge', Object.assign(base, { kind: 'hint', title: '啟發性', target: 1, fmt: 3, sec: sec + 5, voice: 'B18' }));
    if (t === 'who') return go('challenge', Object.assign(base, { kind: 'who', title: '這是誰？', target: 1, fmt: 3, sec: 10, voice: 'B14' }));
    if (t === 'lie') return go('challenge', Object.assign(base, { kind: 'lie', title: '謊言', target: 1, fmt: 4, sec: sec + 5, voice: 'B15' }));
    if (t === 'trip') {
      const subj = pick(G.info.subjects);
      return go('challenge', Object.assign(base, { kind: 'trip', title: `校外教學：${TRIP_PLACE[subj] || subj + '教室'}`, subject: subj, count: 3, voice: 'B07' }));
    }
    if (t === 'rapid') return go('challenge', Object.assign(base, { kind: 'rapid', title: '快問快答', target: 3 + Math.floor(G.si / 2), total: 20, fmt: Math.min(turn.fmt, 3), voice: 'B08' }));
    if (t === 'trouble') return go('challenge', Object.assign(base, { kind: 'trouble', title: 'TROUBLE', count: 3, sec: 8, voice: 'B03' }));
    if (t === 'fate') return go('challenge', Object.assign(base, { kind: 'fate', title: '天堂與地獄', count: 1, fmt: 4, voice: 'B06', node: node.id }));
    if (t === 'check') return go('challenge', { kind: 'check', title: `${st.name}　期末審查`, diff: st.diff, sec: st.sec, count: st.count, pass: Math.ceil(st.count * st.pass / 100), fmt: 4, voice: 'B21', mult: 1 });
  },
  lucky() {
    const opts = [['lessTarget', '下一關少答一題！'], ['twoChoice', '下一關題目變成二選一！'], ['life', '殘機 +1！'], ['score', '加 5,000 分！']];
    const [k, txt] = pick(opts);
    if (k === 'life') G.lives++; else if (k === 'score') G.score += 5000; else G.buff[k] = true;
    Sound.sfx('levelup'); Sound.say('B02');
    ui.append(h('div', { class: 'luckycard' }, h('b', null, 'LUCKY!'), txt));
    this.renderHud(); this.done(`🍀 LUCKY！${txt}`);
  },
  branch(node, lanes, text, voice) {
    this.phase = 'choose'; Sound.say(voice); this.say(text + '（5 秒內選擇）');
    let left = 5; const cd = h('b', null, left);
    const pickLane = i => { if (!this.choose) return; this.choose = null; clearInterval(timer); box.remove(); this.b.choice[node.id] = i; Sound.sfx('ok'); this.done(`走${LANE_INFO[lanes[i]]}！`); };
    const box = h('div', { class: 'forkbox' }, h('div', null, text, '　', cd),
      h('button', { class: 'btn red', onclick: () => pickLane(0) }, '⬆ ' + LANE_INFO[lanes[0]]),
      h('button', { class: 'btn', onclick: () => pickLane(1) }, '⬇ ' + LANE_INFO[lanes[1]]));
    ui.append(box); this.choose = pickLane;
    const timer = setInterval(() => { left--; cd.textContent = left; if (left <= 0) pickLane(1); }, 1000); timers.push(timer);
  },
  done(msg) {
    this.phase = 'idle'; this.btn.textContent = 'GO!'; this.btn.disabled = false; this.say(msg + '　按下 GO! 繼續');
    later(() => ui.querySelectorAll('.luckycard').forEach(e => e.remove()), 2200);
  },
  exit() { clearInterval(this.spinT); },
  draw(c, t) {
    Art.boardBg(c, G.si);
    const b = this.b; let px, py;
    if (this.hop) {
      const k = Math.min(1, (t - this.hop.t0) / 300);
      px = this.nodeX(this.hop.from) + (this.nodeX(this.hop.to) - this.nodeX(this.hop.from)) * k;
      py = this.nodeY(this.hop.from) + (this.nodeY(this.hop.to) - this.nodeY(this.hop.from)) * k - Math.sin(k * Math.PI) * 14;
    } else { px = this.nodeX(b.pos); py = this.nodeY(b.pos); }
    this.camX += ((px - 120) - this.camX) * 0.12;
    c.save(); c.translate(-this.camX, 0);
    // 路線
    c.lineWidth = 5; c.lineCap = 'round';
    b.nodes.forEach(n => n.next.forEach(m => {
      const chosen = n.next.length < 2 || b.choice[n.id] == null || b.nodes[m] === b.nodes[n.next[b.choice[n.id]]];
      c.strokeStyle = chosen ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.35)';
      c.beginPath(); c.moveTo(this.nodeX(n.id), this.nodeY(n.id)); c.lineTo(this.nodeX(m), this.nodeY(m)); c.stroke();
    }));
    // 格子
    c.textAlign = 'center'; c.textBaseline = 'middle';
    b.nodes.forEach(n => {
      const x = this.nodeX(n.id), y = this.nodeY(n.id);
      if (x - this.camX < -40 || x - this.camX > 360) return;
      const big = n.type === 'check';
      const w = big ? 40 : 32, hgt = big ? 38 : 30;
      c.fillStyle = 'rgba(30,27,46,.35)'; Art.rrect(c, x - w / 2 + 1.5, y - hgt / 2 + 2.5, w, hgt, 7); c.fill();
      c.fillStyle = n.lane === 'hell' ? '#5a2236' : n.lane === 'heaven' ? '#fff4c4' : CELLS[n.type];
      Art.rrect(c, x - w / 2, y - hgt / 2, w, hgt, 7); c.fill();
      c.strokeStyle = '#1E1B2E'; c.lineWidth = 1.4; c.stroke();
      c.font = `${big ? 24 : 19}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`; c.fillStyle = '#1E1B2E';
      c.fillText(cellIcon(n.type, G.si), x, y + 1);
      const label = EVENT_LABEL[n.type];
      if (label) {
        c.font = 'bold 6.5px "Microsoft JhengHei",sans-serif';
        const lw = c.measureText(label).width + 8, ly = y + hgt / 2 + 6;
        c.fillStyle = n.type === 'trouble' || n.lane === 'hell' ? '#8a1c1c' : '#1E1B2E';
        Art.rrect(c, x - lw / 2, ly - 5, lw, 10, 5); c.fill();
        c.fillStyle = '#fff'; c.fillText(label, x, ly + 0.5);
      }
    });
    // 分岐路線名稱
    c.font = 'bold 7px "Microsoft JhengHei",sans-serif';
    b.nodes.forEach(n => {
      if (n.next.length < 2) return;
      n.next.forEach(m => {
        const lane = b.nodes[m].lane;
        c.fillStyle = 'rgba(30,27,46,.75)'; const tx = this.nodeX(m) + 40, ty = this.nodeY(m) + (b.nodes[m].y < 0 ? -22 : 30);
        Art.rrect(c, tx - 40, ty - 6, 80, 12, 6); c.fill(); c.fillStyle = '#fff'; c.fillText(LANE_INFO[lane], tx, ty);
      });
    });
    // 玩家
    Art.drawChar(c, G.character, px - 21, py - 52, this.phase === 'moving' ? 'happy' : 'normal', t, 0.65);
    c.restore();
  }
};

// ==========================================================
// 答題挑戰（各種格子共用）
// ==========================================================
Scenes.challenge = {
  enter(cfg) {
    this.cfg = cfg; this.right = 0; this.wrongN = 0; this.asked = 0; this.gain = 0; this.phase = 'intro';
    this.teacherExpr = 'normal'; this.playerExpr = 'normal'; this.kids = 'idle'; this.spin = 0;
    this.host = cfg.kind === 'trouble' ? 'rival' : cfg.kind === 'check' || cfg.kind === 'fate' ? 'principal' : 'teacher';
    this.bg = cfg.kind === 'rapid' ? 'quizshow' : cfg.kind === 'check' || cfg.kind === 'fate' ? 'auditorium' : 'classroom';
    Sound.playMusic(cfg.kind === 'check' || cfg.kind === 'trouble' || cfg.kind === 'rapid' ? 'boss' : 'quiz');
    this.hud = h('div', { class: 'bhud' });
    this.board = h('div', { class: 'board chboard' + (cfg.kind === 'rapid' ? ' dark' : '') });
    this.tbar = h('div', { class: 'tbar' }, h('i'));
    this.optBox = h('div', { class: 'opts' });
    ui.append(this.hud, this.board, this.tbar, this.optBox);
    if (cfg.kind === 'rapid') { this.globalLeft = cfg.total; }
    if (cfg.kind === 'check') { this.globalLeft = cfg.count * cfg.sec * 0.85; }
    this.renderHud();
    this.intro();
  },
  renderHud() {
    const c = this.cfg;
    let goal = '';
    if (c.kind === 'check') goal = `審查：${c.count} 題內答對 ${c.pass} 題　已答對 ${this.right}`;
    else if (c.target) goal = '目標 ' + '●'.repeat(Math.min(this.right, c.target)) + '○'.repeat(Math.max(0, c.target - this.right));
    else goal = `第 ${Math.min(this.asked + (this.phase === 'answer' ? 0 : 1), c.count)} / ${c.count} 題　答對 ${this.right}`;
    const lives = h('span', { class: 'lives' }, Array.from({ length: G.lives }, () => h('img', { src: Art.portrait(G.character, 'normal', 0.42).src, alt: '' })));
    this.hud.replaceChildren(h('span', { class: 'tag' }, '1P ', h('b', null, (G.score + this.gain).toLocaleString())),
      h('span', { class: 'tag goal' }, c.title + '　' + goal), h('span', { class: 'tag' }, '殘機 ', lives));
  },
  intro() {
    // 主持人開場語音：第一題會等它播完，才開始讀題與計時
    this.hostVoice = this.cfg.voice ? Sound.say(this.cfg.voice) : null;
    if (this.cfg.kind === 'trip') {   // 校外教學：顯示目的地大標題，等校車開過畫面再答題
      this.busT = performance.now();
      const banner = h('div', { class: 'banner stay' }, this.cfg.title);
      ui.append(banner);
      later(() => { banner.remove(); this.nextQ(); }, 2300);
      return;
    }
    this.nextQ();
  },
  source() {
    const c = this.cfg;
    let p = null;
    if (c.kind === 'lie') p = makeLie(c.diff);
    else if (c.kind === 'who') { const q = drawFrom(q => q.image && (q.type === 'choice' || q.type === 'image'), c.diff); p = q && Quiz.prepare(q); }
    else if (c.kind === 'hint') {
      const q = drawFrom(q => q.hints && q.hints.length && (q.type === 'choice' || q.type === 'image'), c.diff) || drawFrom(q => q.type === 'choice' || q.type === 'image', c.diff);
      p = q && Quiz.prepare(q);
    } else if (c.kind === 'trip') { const q = drawFrom(q => q.subject === c.subject, c.diff) || drawAny(c.diff); p = q && Quiz.prepare(q); }
    else { const q = drawAny(c.diff); p = q && Quiz.prepare(q); }
    if (!p) { const q = drawAny(c.diff); p = q && Quiz.prepare(q); }   // 特殊題目不夠時改出一般題
    return p && trimOpts(p, c.fmt || 4);
  },
  finished() {
    const c = this.cfg;
    if (c.kind === 'rapid' || c.kind === 'check') return this.globalLeft <= 0 || (c.kind === 'check' && this.asked >= c.count);
    if (c.target) return this.right >= c.target;
    return this.asked >= c.count;
  },
  async nextQ() {
    const tok = sceneToken, c = this.cfg;
    ui.querySelectorAll('.bigmark,.nextbtn').forEach(e => e.remove());
    this.board.replaceChildren(); this.optBox.replaceChildren(); this.optBox.className = 'opts';
    if (this.finished()) return this.finish();
    const p = this.source(); if (!p) return this.finish();
    this.p = p; this.phase = 'show'; this.teacherExpr = 'normal'; this.playerExpr = 'normal';
    this.renderHud();
    const q = h('div', { class: 'qtext' });
    if (c.kind === 'hint') {
      this.board.append(q); q.textContent = p.question;
      if (p.src.hints && p.src.hints.length) q.append(h('div', { class: 'hintline' }, '💡 提示：' + p.src.hints.join('、')));
    } else if (c.kind === 'who') {
      this.spot = h('div', { class: 'spot' });
      this.board.append(h('div', { class: 'spotwrap' }, h('img', { src: p.image, alt: '題目圖片' }), this.spot), q);
      q.textContent = p.question; this.spotT = performance.now();
    } else {
      this.board.append(q); if (p.image) this.board.append(h('img', { class: 'qimg', src: p.image, alt: '題目圖片' }));
      q.textContent = p.question;
    }
    Sound.sfx('chalk');
    this.api = renderOptions(this.optBox, p, r => this.answer(r));
    if (this.hostVoice) {   // 主持人還在說話：先顯示題目，選項暫時不能按，時間也還不開始
      this.optBox.style.pointerEvents = 'none';
      await this.hostVoice; this.hostVoice = null;
      if (!alive(tok)) return;
      this.optBox.style.pointerEvents = '';
    }
    Sound.speak(p.question);
    this.left = c.kind === 'rapid' || c.kind === 'check' ? null : (c.sec || 12); this.total = this.left; this.warned = false;
    this.phase = 'answer';
  },
  update(dt, now) {
    if (this.cfg.kind === 'who' && this.spot && this.phase === 'answer') {
      const k = (now - this.spotT) / 1000;
      this.spot.style.setProperty('--x', (50 + Math.sin(k * 1.3) * 35) + '%');
      this.spot.style.setProperty('--y', (50 + Math.cos(k * 1.7) * 32) + '%');
    }
    if (this.globalLeft != null && (this.phase === 'answer' || this.phase === 'feedback')) {
      this.globalLeft -= dt;
      const tot = this.cfg.kind === 'rapid' ? this.cfg.total : this.cfg.count * this.cfg.sec * 0.85;
      this.tbar.firstChild.style.width = Math.max(0, this.globalLeft / tot * 100) + '%';
      this.tbar.classList.toggle('warn', this.globalLeft <= 5);
      if (this.globalLeft <= 0 && this.phase === 'answer') { this.phase = 'over'; if (this.api) this.api.lock(); Sound.sfx('alarm'); Sound.say('V08'); later(() => this.finish(), 1200); }
      return;
    }
    if (this.phase !== 'answer' || this.left == null) return;
    this.left -= dt;
    this.tbar.firstChild.style.width = Math.max(0, this.left / this.total * 100) + '%';
    this.tbar.classList.toggle('warn', this.left <= 4);
    if (this.left <= 4 && !this.warned) { this.warned = true; this.playerExpr = 'think'; Sound.sfx('tick'); Sound.say('V07'); }
    if (this.left <= 0) this.answer(null, true);
  },
  answer(r, timeout) {
    if (this.phase !== 'answer') return;
    this.phase = 'feedback'; if (this.api) this.api.lock(); Sound.stopSpeak();
    const c = this.cfg, p = this.p, ok = !timeout && Quiz.check(p, r);
    this.asked++;
    if (this.spot) this.spot.classList.add('off');
    if (this.api && this.api.mark) this.api.mark(typeof r === 'number' ? r : null, ok);
    ui.append(h('div', { class: 'bigmark ' + (ok ? 'ok' : 'ng') }, ok ? '○' : '✕'));
    const qt = this.board.querySelector('.qtext');
    if (qt) {
      qt.textContent = p.question;
      if (!ok) qt.append(h('div', { class: 'ansline' }, (timeout ? '時間到！' : '') + '正確答案：' + p.answerText));
      if (p.explain) qt.append(h('div', { class: 'explain' }, '📖 ' + p.explain));
    }
    if (ok) {
      this.right++;
      const bonus = Math.round((1000 + Math.max(0, Math.floor(this.left || 0)) * 100) * (c.mult || 1));
      this.gain += bonus; toast(`正確！+${bonus.toLocaleString()}（TIME BONUS）`);
      Sound.sfx('correct'); this.teacherExpr = 'happy'; this.playerExpr = 'happy'; Sound.say(pick(['V05a', 'V05b', 'V05c']));
    } else {
      this.wrongN++;
      Sound.sfx('wrong'); this.teacherExpr = 'shock'; this.playerExpr = 'shock';
      Sound.say(timeout ? 'V08' : pick(['V06a', 'V06b']));
      if (c.kind === 'rapid') { this.spinT = performance.now(); Sound.sfx('whoosh'); }
      if (!['rapid', 'check', 'fate'].includes(c.kind)) {
        G.lives--; this.renderHud();
        if (G.lives <= 0) { this.phase = 'dead'; later(() => { G.score += this.gain; go('continue'); }, 1600); return; }
      }
    }
    this.renderHud();
    const wait = c.kind === 'rapid' ? 650 : ok ? 1300 : 2200;
    if (c.kind !== 'rapid') ui.append(h('button', { class: 'btn yellow nextbtn', onclick: () => this.goNext() }, '繼續 ▶'));
    this.autoNext = later(() => this.goNext(), wait + (p.explain && c.kind !== 'rapid' ? 900 : 0));
  },
  goNext() { if (this.phase !== 'feedback') return; clearTimeout(this.autoNext); this.phase = 'next'; Sound.stopVoice(); this.nextQ(); },
  key(e) {
    if (this.phase === 'answer' && this.api && this.api.key) this.api.key(e);
    else if (this.phase === 'feedback' && (e.key === 'Enter' || e.key === ' ')) this.goNext();
  },
  // 結算：依格子種類決定成功或失敗
  finish() {
    if (this.phase === 'end') return; this.phase = 'end';
    const c = this.cfg; let ok, msg;
    if (c.kind === 'check') {
      ok = this.right >= c.pass; G.score += this.gain;
      return go('verdict', { ok, right: this.right, count: c.count, pass: c.pass });
    }
    if (c.kind === 'fate') {
      ok = this.right >= 1; G.score += this.gain; G.b.choice[c.node] = ok ? 0 : 1;
      return go('board', { msg: ok ? '答對了！走上「榮昇之路」！' : '答錯了……掉進「坎坷之路」！' });
    }
    if (c.kind === 'rapid') {
      ok = this.right >= c.target;
      if (!ok) { G.lives--; if (G.lives <= 0) { G.score += this.gain; return go('continue'); } }
    } else if (c.kind === 'trouble') {
      ok = this.right >= 2; if (ok) { this.gain += 5000; Sound.say('B04'); }
    } else ok = !c.target || this.right >= c.target;
    G.score += this.gain;
    msg = ok ? `CLEAR！+${this.gain.toLocaleString()}` : (c.kind === 'rapid' ? '沒有達成目標，殘機 −1' : '挑戰失敗');
    ui.append(h('div', { class: 'clearcard ' + (ok ? 'ok' : 'ng') }, h('b', null, ok ? 'CLEAR!' : 'FAILED'), h('span', null, '+' + this.gain.toLocaleString())));
    Sound.sfx(ok ? 'levelup' : 'cancel');
    later(() => go('board', { msg }), 1900);
  },
  draw(c, t) {
    const o = { stage: DEFAULT_STAGES[G.si].key, host: this.host === 'rival' ? 'teacher' : this.host, teacherExpr: this.teacherExpr, playerExpr: this.playerExpr, player: G.character, kids: this.kids };
    if (this.bg === 'quizshow') {
      Art.bgImage(c, 'bg_quizshow');
      const k = this.spinT ? (t - this.spinT) / 900 : 1;
      const rot = k < 1 ? k * Math.PI * 4 : 0;
      Art.img(c, 'chair', 222, 112, 64, 0, rot);
      const fly = k < 1 ? Math.sin(k * Math.PI) * 40 : 0;
      Art.drawChar(c, G.character, 214 + fly, 74 - fly, k < 1 ? 'shock' : this.playerExpr, t, 1.25, true);
      Art.drawChar(c, 'teacher', -6, 126, this.teacherExpr, t, 1.6);
      return;
    }
    if (this.bg === 'auditorium') Art.auditorium(c, t, o);
    else Art.classroom(c, t, o);
    if (this.host === 'rival') { c.fillStyle = 'rgba(80,0,0,.25)'; c.fillRect(0, 0, 320, 240); Art.img(c, 'rival', 2, 120, 60); }
    if (this.busT) {
      const k = (t - this.busT) / 2000;
      if (k < 1) Art.img(c, 'bus', -90 + k * 420, 150, 90); else this.busT = null;
    }
  }
};

// ==========================================================
// 幸運旋轉機（FEVER）
// ==========================================================
Scenes.fever = {
  enter() {
    Sound.playMusic('shop'); Sound.say('B16');
    const sym = ['🍒', '🔔', '⭐', '7', '🍋'];
    this.reels = [0, 1, 2].map(() => h('div', { class: 'reel big' }, '?'));
    this.idx = 0; this.vals = [];
    this.btn = h('button', { class: 'btn red gobtn', onclick: () => this.stop() }, 'STOP!');
    ui.append(h('div', { class: 'fever panel' }, h('h1', null, '🎰 幸運旋轉機'), h('p', null, '依序按 STOP 停下轉輪！三個一樣有大獎'), h('div', { class: 'reels' }, this.reels), this.btn));
    this.spinT = setInterval(() => this.reels.forEach((r, i) => { if (i >= this.idx) r.textContent = pick(sym); }), 60);
    this.sym = sym;
  },
  stop() {
    if (this.idx >= 3) return;
    // 稍微偏向對中，讓小朋友常常有獎
    const v = this.idx > 0 && Math.random() < 0.45 ? this.vals[0] : pick(this.sym);
    this.vals.push(v); this.reels[this.idx].textContent = v; this.idx++; Sound.sfx('stamp');
    if (this.idx < 3) return;
    clearInterval(this.spinT); this.btn.disabled = true;
    const [a, b, c] = this.vals;
    let prize = 0;
    if (a === b && b === c) prize = a === '7' ? 100000 : a === '⭐' ? 50000 : 30000;
    else if (a === b || b === c || a === c) prize = 5000;
    G.score += prize;
    if (prize >= 30000) { Sound.sfx('levelup'); Sound.sfx('clap'); Sound.say('B17'); } else if (prize) Sound.sfx('coin'); else Sound.sfx('cancel');
    ui.append(h('div', { class: 'clearcard ' + (prize ? 'ok' : 'ng') }, h('b', null, prize ? 'FEVER!' : '可惜～'), h('span', null, '+' + prize.toLocaleString())));
    later(() => go('board', { msg: prize ? `🎰 FEVER！獲得 ${prize.toLocaleString()} 分` : '🎰 沒有對中，下次再來！' }), 2200);
  },
  key(e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.stop(); } },
  exit() { clearInterval(this.spinT); },
  draw(c, t) { Art.bgImage(c, 'bg_quizshow'); c.fillStyle = 'rgba(30,27,46,.35)'; c.fillRect(0, 0, 320, 240); }
};

// ==========================================================
// 階段審查結果：獎盃升起「成功」或倒下「失敗」
// ==========================================================
Scenes.verdict = {
  enter(r) {
    this.ok = r.ok; this.t0 = performance.now();
    Sound.stopMusic(); Sound.sfx('bell');
    ui.append(h('div', { class: 'vresult panel' }, `${DEFAULT_STAGES[G.si].name}期末審查：${r.count} 題答對 ${r.right} 題（需要 ${r.pass} 題）`));
    later(() => { ui.append(h('div', { class: 'stampbig ' + (r.ok ? 'ok' : 'ng') }, r.ok ? '成功' : '失敗')); Sound.sfx('stamp'); Sound.say(r.ok ? 'B09' : 'B10'); }, 1500);
    G.stageResults.push({ name: DEFAULT_STAGES[G.si].name, ok: r.ok, right: r.right, count: r.count });
    G.rank = Math.max(0, Math.min(4, G.rank + (r.ok ? 1 : -1)));
    G.rankHist.push(G.rank);
    later(() => go('rankchart'), 4200);
    this.onDown = () => go('rankchart'); later(() => screenEl.addEventListener('pointerdown', this.onDown), 2000);
  },
  exit() { screenEl.removeEventListener('pointerdown', this.onDown); },
  draw(c, t) {
    Art.boardBg(c, G.si);
    const k = Math.min(1, (t - this.t0) / 1300);
    if (this.ok) {
      const y = 240 - k * 170; Art.img(c, 'trophy', 120, y, 80);
      if (k >= 1 && Math.floor(t / 300) % 2) { Art.star(c, 110, 80, 6, '#F2B632'); Art.star(c, 210, 100, 5, '#F2B632'); }
    } else {
      const rot = k * 1.4, y = 70 + k * 60; Art.img(c, 'trophy', 120, y, 80, 0, rot);
    }
  }
};

// ==========================================================
// 職位階梯表：5×5 格，紅色折線上升或下墜
// ==========================================================
Scenes.rankchart = {
  enter() {
    this.t0 = performance.now();
    const hist = G.rankHist, up = hist[hist.length - 1] > hist[hist.length - 2], same = hist[hist.length - 1] === hist[hist.length - 2];
    const title = RANKS[G.rank].title;
    Sound.playMusic('title');
    later(() => {
      ui.append(h('div', { class: 'bubble rankmsg' }, same ? `維持「${title}」……` : up ? `${title}榮昇！！` : `被降級了……變成「${title}」`));
      Sound.say(up ? 'B11' : 'B12'); if (up) Sound.sfx('levelup');
    }, 1200);
    const last = G.si >= 4;
    ui.append(h('button', { class: 'btn red nextbtn', onclick: () => this.next() }, last ? '看結局 ▶' : '下一階段 ▶'));
    later(() => this.next(), 6500);
  },
  next() {
    if (this.went) return; this.went = true;
    if (G.si >= 4) return go(G.rank >= 4 ? 'graduation' : 'ending');
    G.si++; G.b = null; go('board', { newStage: true });
  },
  key(e) { if (e.key === 'Enter' || e.key === ' ') this.next(); },
  draw(c, t) {
    Art.bgImage(c, 'bg_title'); c.fillStyle = 'rgba(30,27,46,.72)'; c.fillRect(0, 0, 320, 240);
    const X0 = 92, Y0 = 34, CW = 40, RH = 34;
    c.font = 'bold 7px "Microsoft JhengHei",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let r = 0; r < 5; r++) {
      const y = Y0 + (4 - r) * RH;
      c.fillStyle = r % 2 ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.12)'; c.fillRect(X0, y, CW * 6, RH);
      c.fillStyle = '#F2B632'; c.fillText(RANKS[r].eval, 50, y + RH / 2 - 6);
      c.fillStyle = '#fff'; c.font = 'bold 9px "Microsoft JhengHei",sans-serif'; c.fillText(RANKS[r].title, 50, y + RH / 2 + 6); c.font = 'bold 7px "Microsoft JhengHei",sans-serif';
    }
    ['開始', ...DEFAULT_STAGES.map(s => s.name)].forEach((s, i) => { c.fillStyle = i - 1 === G.si ? '#F2B632' : '#ccc'; c.fillText(s, X0 + CW / 2 + i * CW, Y0 + RH * 5 + 8); });
    const pts = G.rankHist.map((r, i) => [X0 + CW / 2 + i * CW, Y0 + (4 - r) * RH + RH / 2]);
    const k = Math.min(1, (t - this.t0) / 1000);
    c.strokeStyle = '#E2453C'; c.lineWidth = 3; c.lineJoin = 'round'; c.beginPath();
    pts.forEach((p, i) => {
      if (i === pts.length - 1 && i > 0) { const q = pts[i - 1]; c.lineTo(q[0] + (p[0] - q[0]) * k, q[1] + (p[1] - q[1]) * k); }
      else if (i === 0) c.moveTo(p[0], p[1]); else c.lineTo(p[0], p[1]);
    });
    c.stroke();
    pts.forEach((p, i) => { if (i < pts.length - 1 || k >= 1) { c.fillStyle = '#fff'; c.beginPath(); c.arc(p[0], p[1], 3, 0, Math.PI * 2); c.fill(); } });
    const lp = pts[pts.length - 1];
    if (k >= 1) Art.drawChar(c, G.character, lp[0] - 16, lp[1] - 40, 'happy', t, 0.55);
  }
};

// ==========================================================
// CONTINUE（殘機歸零）
// ==========================================================
Scenes.continue = {
  enter() {
    this.left = 9; Sound.playMusic('sad'); Sound.say('B13');
    this.num = h('div', { class: 'cnum' }, '9');
    ui.append(h('div', { class: 'contbox' }, h('h1', null, 'CONTINUE?'), this.num,
      h('button', { class: 'btn yellow', onclick: () => this.cont() }, '🪙 投幣接關'), h('button', { class: 'btn gray', onclick: () => go('ending') }, '放棄')));
    this.t = setInterval(() => { this.left--; this.num.textContent = this.left; Sound.sfx('tick'); if (this.left <= 0) { clearInterval(this.t); go('ending'); } }, 1000);
  },
  cont() { clearInterval(this.t); Sound.sfx('coinIn'); G.lives = START_LIVES; G.score = 0; G.continues++; go('board', { msg: '接關成功！分數重新計算，繼續加油！' }); },
  key(e) { if (e.key === 'Enter' || e.key === ' ') this.cont(); },
  exit() { clearInterval(this.t); },
  draw(c, t) { Art.sunset(c, t, { player: G.character }); c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(0, 0, 320, 240); }
};

// ==========================================================
// 結局：依最後的職位給評語（榜首另外進畢業典禮）
// ==========================================================
Scenes.ending = {
  enter() {
    Sound.playMusic('sad'); Sound.say('B19');
    this.leaves = Array.from({ length: 4 }, (_, i) => ({ x: 60 + i * 60, d: i * 1300 }));
    this.nameInp = h('input', { value: CHARS[G.character].name, maxlength: 12 });
    this.saveBtn = h('button', { class: 'btn red', onclick: () => this.save() }, '🏆 登上排行榜');
    ui.append(h('div', { class: 'endbox panel' },
      h('div', { class: 'endtitle' }, `最終職位：${RANKS[G.rank].title}`),
      h('p', null, ENDING_TEXT[Math.min(3, G.rank)]),
      h('p', { class: 'hint' }, `總分 ${G.score.toLocaleString()}　各階段審查：` + (G.stageResults.map(s => `${s.name}${s.ok ? '成功' : '失敗'}`).join('、') || '還沒有進行') + (G.continues ? `（接關 ${G.continues} 次）` : '')),
      h('div', { class: 'row', style: 'justify-content:center' }, '名字：', this.nameInp, this.saveBtn),
      h('div', { class: 'row', style: 'justify-content:center;margin-top:12px' },
        h('button', { class: 'btn', onclick: () => go('select', { mode: 'board' }) }, '再玩一次'),
        h('button', { class: 'btn gray', onclick: () => go('modes') }, '回選單'))));
    later(() => Sound.say('V16'), 6000);
  },
  save() {
    Rank.add(G.comboId, { name: this.nameInp.value.trim() || CHARS[G.character].name, score: G.score, char: G.character, date: new Date().toLocaleDateString('zh-TW'), title: RANKS[G.rank].title });
    this.saveBtn.disabled = true; Sound.sfx('coin'); toast('已登上排行榜！');
  },
  draw(c, t) {
    Art.sunset(c, t, {});
    Art.drawChar(c, G.character, 128, 118, G.rank >= 2 ? 'normal' : 'cry', t, 1.3);
    this.leaves.forEach(l => {
      const k = ((t + l.d) % 5200) / 5200;
      c.save(); c.translate(l.x + Math.sin(k * 8) * 14, -10 + k * 250); c.rotate(k * 6);
      c.fillStyle = '#c8812f'; c.beginPath(); c.ellipse(0, 0, 4, 2, 0, 0, Math.PI * 2); c.fill(); c.restore();
    });
    Art.drawChar(c, 'teacher', 2, 160, 'happy', t, 1.1);
    Art.drawChar(c, 'principal', 244, 160, 'normal', t, 1.1);
  }
};

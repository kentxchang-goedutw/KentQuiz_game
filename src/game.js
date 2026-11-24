// ===== game.js：場景管理、答題畫面與各遊戲模式 =====
const ui = document.getElementById('ui');
const cv = document.getElementById('bg');
const ctx = cv.getContext('2d'); ctx.imageSmoothingQuality = 'high';
const screenEl = document.getElementById('screen');

// 建立 DOM：字串一律當成純文字（textContent），不使用 innerHTML，避免題庫夾帶程式碼
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.entries(v).forEach(([p, val]) => el.style.setProperty(p, val));
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (['value', 'checked', 'disabled', 'selected', 'type'].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) { if (k == null || k === false) continue; el.append(k instanceof Node ? k : document.createTextNode(String(k))); }
  return el;
}
const pick = a => a[Math.random() * a.length | 0];
function toast(msg) { const t = h('div', { class: 'toast' }, msg); screenEl.append(t); setTimeout(() => t.remove(), 2700); }
function modal(content, { onClose } = {}) {
  const bg = h('div', { class: 'modal-bg' }, h('div', { class: 'panel modal' }, content));
  const close = () => { bg.remove(); onClose && onClose(); };
  bg.addEventListener('pointerdown', e => { if (e.target === bg) close(); });
  ui.append(bg); return close;
}

// ---------- 場景管理 ----------
const Scenes = {};
let scene = null, timers = [], sceneToken = 0;
function later(fn, ms) { const id = setTimeout(fn, ms); timers.push(id); return id; }
const sleep = ms => new Promise(r => later(r, ms));
const alive = tok => tok === sceneToken;
function go(name, arg, opt = {}) {
  if (!opt.keepVoice) Sound.stopVoice();
  Sound.stopSpeak();
  if (scene && scene.exit) scene.exit();
  timers.forEach(clearTimeout); timers = []; sceneToken++;
  ui.replaceChildren();
  scene = Object.create(Scenes[name]); scene.name = name;
  scene.enter(arg);
}
let lastT = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  if (scene) {
    if (scene.update) scene.update(dt, now);
    // 畫布 960×720，場景用 320×240 的邏輯座標作畫
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 960, 720); ctx.setTransform(3, 0, 0, 3, 0, 0);
    if (scene.draw) scene.draw(ctx, now);
  }
  requestAnimationFrame(loop);
}
function fit() {
  const s = Math.min(innerWidth / 960, innerHeight / 720);
  screenEl.style.transform = `translate(-50%,-50%) scale(${s})`;
}
addEventListener('resize', fit);
addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName || '')) return;
  if (ui.querySelector('.modal-bg')) return;
  if (scene && scene.key) scene.key(e);
});
function applyLook() {
  const s = Settings.get();
  document.body.classList.toggle('big', !!s.bigText);
  document.body.classList.toggle('noflash', !!s.noFlash);
}

// ---------- 資料 ----------
const Data = {
  banks: [], map: {}, combos: [],
  async load() {
    let banks = await Store.allBanks(), combos = await Store.allCombos();
    // 第一次打開，或這個 index.html 的內建題庫版本更新了：寫入內建題庫（同 ID 覆蓋，老師自己建的題庫不受影響）
    let seen = null; try { seen = localStorage.getItem('mg-builtin-ver'); } catch (e) { }
    if ((!banks.length && !combos.length) || seen !== LOCAL_DATA.version) {
      const bb = builtinBanks(), bc = builtinCombos();
      const keepB = new Set(bb.map(b => b.bankId)), keepC = new Set(bc.map(c => c.id));
      // 舊版打包進來、這一版沒有的內建題庫與組合（例如範例題庫）一併移除，只留老師自己在遊戲裡建立的
      const removed = new Set(banks.filter(b => b.builtin && !keepB.has(b.bankId)).map(b => b.bankId));
      for (const id of removed) await Store.delBank(id);
      const stale = c => c.builtin || SAMPLE_COMBOS.some(s => s.id === c.id) || (c.items.length && c.items.every(it => removed.has(it.bankId)));
      for (const c of combos) if (stale(c) && !keepC.has(c.id)) await Store.delCombo(c.id);
      for (const b of bb) await Store.putBank(b);
      for (const c of bc) await Store.putCombo(c);
      try { localStorage.setItem('mg-builtin-ver', LOCAL_DATA.version); } catch (e) { }
      banks = await Store.allBanks(); combos = await Store.allCombos();
    }
    this.banks = banks.sort((a, b) => (b.builtin ? 1 : 0) - (a.builtin ? 1 : 0) || a.name.localeCompare(b.name, 'zh-Hant'));
    this.map = Object.fromEntries(banks.map(b => [b.bankId, b]));
    this.combos = combos;
  },
  combo(id) { return this.combos.find(c => c.id === id); }
};
const stageCfg = i => Object.assign({}, DEFAULT_STAGES[i], Settings.get().stages[i], { key: DEFAULT_STAGES[i].key, name: DEFAULT_STAGES[i].name, diff: DEFAULT_STAGES[i].diff });

const CHARS = {
  aming: { name: '阿明', type: '活力型', desc: '衝動，答得快也錯得快', quote: '「這題我會啦！」', no: '080821' },
  ying: { name: '小瑩', type: '書蟲型', desc: '認真，緊張時會推眼鏡', quote: '「讓我想想……」', no: '080915' },
  qiang: { name: '胖仔強', type: '搞笑型', desc: '樂天，答錯也笑嘻嘻', quote: '「下課去福利社！」', no: '080707' }
};
let G = null; // 目前這一場遊戲的狀態

// ---------- 選項元件（所有模式共用）----------
const NB_COLORS = ['#E2453C', '#3A6EA5', '#F2B632', '#5cbf60', '#b06ad9', '#ff8a3c'];
function renderOptions(box, p, onAnswer, disabled = []) {
  box.replaceChildren();
  let locked = false; const api = { lock() { locked = true; } };
  if (p.type === 'choice' || p.type === 'image' || p.type === 'truefalse') {
    const tf = p.type === 'truefalse';
    // 選項文字長時改成一行一個的長條版面，特別長再縮小字體，避免文字被切掉
    const maxLen = tf ? 0 : Math.max(...p.opts.map(o => [...o.text].length));
    box.className = 'opts ' + (tf ? 'tf' : maxLen > 12 ? 'list' + (maxLen > 40 ? ' xl' : '') : 'grid4');
    const els = p.opts.map((o, i) => h('button', { class: 'nb', style: { '--c': tf ? (i ? '#E2453C' : '#3A6EA5') : NB_COLORS[i] }, onclick: () => choose(i) },
      h('span', { class: 'num' }, tf ? '' : String(i + 1)), h('span', { class: 'txt' }, o.text)));
    box.append(...els);
    disabled.forEach(i => { els[i].disabled = true; els[i].classList.add('off'); });
    function choose(i) { if (locked || els[i].disabled) return; locked = true; els[i].classList.add('picked'); Sound.sfx('ok'); onAnswer(i); }
    api.key = e => {
      if (tf) { if (/^[oO1]$/.test(e.key)) choose(0); else if (/^[xX2]$/.test(e.key)) choose(1); return; }
      const k = '1234'.indexOf(e.key); if (k >= 0 && k < els.length) choose(k);
    };
    api.disable = idx => idx.forEach(i => { els[i].disabled = true; els[i].classList.add('off'); });
    api.mark = (chosen, ok, showAnswer = true) => { if (chosen != null && chosen >= 0) els[chosen].classList.add(ok ? 'right' : 'wrong'); if (showAnswer) els[p.correct].classList.add('answer'); };
  } else if (p.type === 'order') {
    box.className = 'opts order';
    const seq = [];
    const seqEl = h('span', { class: 'seq' }), ph = h('span', { class: 'ph' }, '依照順序點選下面的選項');
    const reset = h('button', { class: 'btn small gray', onclick: () => { if (locked) return; seq.length = 0; els.forEach(e => { e.classList.remove('used'); e.querySelector('.num').textContent = ''; }); draw(); } }, '重來');
    const slots = h('div', { class: 'slots' }, ph, seqEl, reset);
    const els = p.opts.map((o, i) => h('button', { class: 'nb', style: { '--c': NB_COLORS[i] }, onclick: () => add(i) }, h('span', { class: 'num' }), h('span', { class: 'txt' }, o.text)));
    function draw() { ph.style.display = seq.length ? 'none' : ''; seqEl.textContent = seq.map(k => p.opts[k].text).join(' → '); }
    function add(i) {
      if (locked || els[i].classList.contains('used')) return;
      seq.push(i); els[i].classList.add('used'); els[i].querySelector('.num').textContent = seq.length; Sound.sfx('move'); draw();
      if (seq.length === p.opts.length) { locked = true; onAnswer(seq.map(k => p.opts[k].text)); }
    }
    box.append(slots, h('div', { class: 'ordergrid' }, els));
    api.key = e => { const k = parseInt(e.key, 10) - 1; if (k >= 0 && k < els.length) add(k); if (e.key === 'Backspace') reset.click(); };
    api.mark = (c, ok) => { slots.classList.add(ok ? 'right' : 'wrong'); };
  } else if (p.type === 'number') {
    box.className = 'opts number';
    let val = '';
    const disp = h('div', { class: 'numdisp' }, '　');
    const show = () => disp.textContent = val || '　';
    const press = k => {
      if (locked) return; Sound.sfx('move');
      if (k === '⌫') val = val.slice(0, -1);
      else if (k === 'C') val = '';
      else if (k === '−') val = val.startsWith('-') ? val.slice(1) : '-' + val;
      else if (k === '確定') { if (val === '' || val === '-') return; locked = true; onAnswer(val); return; }
      else if (k === '.') { if (!val.includes('.')) val += val === '' || val === '-' ? '0.' : '.'; }
      else if (val.replace(/[-.]/g, '').length < 10) val += k;
      show();
    };
    const keys = ['7', '8', '9', '⌫', '4', '5', '6', 'C', '1', '2', '3', '確定', '0', '.', '−'];
    box.append(disp, ...keys.map(k => h('button', { class: 'key' + (k === '確定' ? ' ok' : ''), onclick: () => press(k) }, k === 'C' ? '清除' : k)));
    api.key = e => {
      if (/^[0-9.]$/.test(e.key)) press(e.key); else if (e.key === '-') press('−');
      else if (e.key === 'Backspace') press('⌫'); else if (e.key === 'Enter') press('確定');
    };
    api.mark = (c, ok) => disp.classList.add(ok ? 'right' : 'wrong');
  }
  return api;
}

// ==========================================================
// 標題畫面
// ==========================================================
Scenes.title = {
  enter() {
    ui.append(
      h('div', { class: 'title-logo bounce-in' }, '好學小學堂'),
      h('div', { class: 'title-sub' }, 'HAOXUE QUIZ SCHOOL'),
      h('div', { class: 'press blink' }, 'PRESS START'),
      h('div', { class: 'credit' }, '原創角色・原創美術・原創音樂｜致敬 90 年代街機問答遊戲'),
      h('button', { class: 'btn small gray gear', onclick: e => { e.stopPropagation(); Sound.init(); go('settings', { back: 'title' }); } }, '⚙ 設定')
    );
    this.onDown = () => this.start();
    screenEl.addEventListener('pointerdown', this.onDown);
    if (Sound.ready) Sound.playMusic('title');
  },
  exit() { screenEl.removeEventListener('pointerdown', this.onDown); },
  key(e) { if (e.key === 'Enter' || e.key === ' ') this.start(); },
  async start() {
    if (this.pressed) { go('modes'); return; }
    this.pressed = true; const tok = sceneToken;
    Sound.init(); Sound.sfx('coinIn'); Sound.playMusic('title');
    await Sound.say('V01');
    if (alive(tok)) go('modes');
  },
  draw(c, t) { Art.title(c, t); }
};

// ==========================================================
// 選擇模式
// ==========================================================
Scenes.modes = {
  enter() {
    Sound.playMusic('title');
    const cards = [
      ['board', '升學大冒險', '一格一格的地圖！轉拉霸前進、闖過各種格子，每個階段審查成功就榮昇，目標成為全校榜首！', 'aming'],
      ['battle', '教室搶答', '2 到 4 隊分組搶答，老師在講台主持，最後上頒獎台。', 'teacher'],
      ['practice', '自由練習', '選一份題庫慢慢練，沒有時間壓力，錯題可以重練。', 'ying']
    ];
    this.focus = 0;
    this.els = cards.map(([id, title, desc, who], i) => h('button', { class: 'mode-card', onclick: () => this.choose(id), onmouseenter: () => this.setFocus(i) },
      Art.portrait(who, 'happy', 2), h('h2', null, title), h('p', null, desc)));
    this.ids = cards.map(c => c[0]);
    ui.append(h('div', { class: 'menu-title' }, '選擇模式'), h('div', { class: 'modes' }, this.els),
      h('div', { class: 'mode-bar' },
        LOCAL_DATA.hideManager ? null : h('button', { class: 'btn wood', onclick: () => go('banks') }, '📚 題庫管理'),
        h('button', { class: 'btn yellow', onclick: () => go('ranks') }, '🏆 排行榜'),
        h('button', { class: 'btn gray', onclick: () => go('settings', { back: 'modes' }) }, '⚙ 設定'),
        h('button', { class: 'btn gray', onclick: () => go('title') }, '回標題')));
    this.setFocus(0);
  },
  setFocus(i) { this.focus = i; this.els.forEach((e, k) => e.classList.toggle('focus', k === i)); },
  key(e) {
    const m = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 }[e.key], n = this.els.length;
    if (m) { Sound.sfx('move'); this.setFocus((this.focus + m + n) % n); }
    if (e.key === 'Enter' || e.key === ' ') this.choose(this.ids[this.focus]);
    if (e.key === 'Escape') go('title');
  },
  choose(id) {
    Sound.sfx('ok');
    if (!Data.banks.length) { toast('目前沒有任何題庫，請先到「題庫管理」匯入'); return; }
    if (id === 'board') go('select', { mode: id });
    else if (id === 'battle') go('battleSetup');
    else go('practiceSetup');
  },
  draw(c, t) { Art.title(c, t); c.fillStyle = 'rgba(30,27,46,.45)'; c.fillRect(0, 0, 320, 240); }
};

// ==========================================================
// 選角色、選題庫組合
// ==========================================================
Scenes.select = {
  enter({ mode }) {
    this.mode = mode; this.char = 'aming';
    Sound.playMusic('title');
    Sound.say('V02');
    this.cards = Object.entries(CHARS).map(([id, c]) => h('div', { class: 'idcard pin', onclick: () => this.setChar(id) },
      h('div', { class: 'head' }, '好學小學堂　學生證'),
      Art.portrait(id, 'normal', 2.6),
      h('h3', null, c.name), h('p', null, `學號 ${c.no}・${c.type}`), h('p', null, c.desc), h('p', null, c.quote)));
    this.ids = Object.keys(CHARS);
    this.sel = h('select', { onchange: () => this.check() }, Data.combos.map(c => h('option', { value: c.id }, c.name)));
    this.info = h('div', { class: 'hint' });
    this.go = h('button', { class: 'btn red', onclick: () => this.start() }, '入學 ▶');
    ui.append(h('div', { class: 'menu-title', style: 'top:8px;font-size:34px' }, '入學報到：選一位同學'),
      h('div', { class: 'ids' }, this.cards),
      h('div', { class: 'enroll panel' },
        h('div', { class: 'row' }, h('b', null, '題庫組合：'), this.sel, h('span', { style: 'flex:1' }), h('button', { class: 'btn gray', onclick: () => go('modes') }, '返回'), this.go),
        this.info));
    if (!Data.combos.length) { this.info.textContent = '還沒有題庫組合，請先到「題庫管理 → 題庫組合」建立。'; this.go.disabled = true; }
    this.setChar('aming', true); this.check();
  },
  setChar(id, silent) {
    this.char = id; this.cards.forEach((c, i) => c.classList.toggle('sel', this.ids[i] === id));
    if (!silent) { Sound.sfx('ok'); Sound.say('P_' + id + '_intro'); }
  },
  check() {
    const combo = Data.combo(this.sel.value); if (!combo) return;
    this.info.replaceChildren();
    const pi = poolInfo(boardPool(combo));
    this.info.append(`這個組合共有 ${pi.total} 題。`);
    const miss = [];
    if (!pi.images) miss.push('沒有附圖片的選擇題 →「這是誰」格不會出現');
    if (pi.tfO < 3 || pi.tfX < 1) miss.push('是非題不足（要 3 題 O＋1 題 X）→「謊言」格不會出現');
    if (!pi.hints) miss.push('沒有「提示關鍵詞」→「啟發性」格會把題目切成三段當提示');
    if (miss.length) this.info.append(h('br'), h('span', { class: 'warn' }, '⚠ ' + miss.join('；')));
    const total = combo.items.reduce((s, it) => s + ((Data.map[it.bankId] || {}).questions || []).length, 0);
    this.go.disabled = total === 0;
  },
  key(e) {
    const i = this.ids.indexOf(this.char);
    if (e.key === 'ArrowRight') this.setChar(this.ids[(i + 1) % 3]);
    if (e.key === 'ArrowLeft') this.setChar(this.ids[(i + 2) % 3]);
    if (e.key === 'Enter') this.start();
    if (e.key === 'Escape') go('modes');
  },
  start() {
    const combo = Data.combo(this.sel.value); if (!combo) return;
    Sound.sfx('coinIn');
    startBoardGame(combo, this.char);
  },
  draw(c, t) { Art.bulletin(c, t); }
};

function listCtrl({ kind, questions, title, onFinish, sec = 0 }) {
  const qs = questions.map(q => Quiz.prepare(q));
  let i = -1, right = 0, done = 0; const wrong = [];
  return {
    kind, stage: 'elem', host: 'teacher', player: 'ying',
    index: () => i,
    tag: () => `${title}　<b>${i + 1}</b> / ${qs.length}`,
    right: () => `答對 <b>${right}</b> 題`,
    next() { i++; return i < qs.length ? qs[i] : null; },
    seconds: () => sec, alwaysWait: true,
    resolve(p, ok, remain, info) { done++; if (ok) right++; else wrong.push({ q: p.src, resp: info.resp, p }); return {}; },
    finish() { onFinish({ right, total: qs.length, wrong }); },
    // 中途離開：只算已經作答的題目
    quitLabel: kind === 'try' ? '離開試玩' : '結束練習',
    quit() { onFinish({ right, total: done, wrong, quit: true }); }
  };
}

// ==========================================================
// 答題畫面（所有模式共用）
// ==========================================================
Scenes.quiz = {
  enter(ctrl) {
    this.c = ctrl; this.teacherExpr = 'normal'; this.playerExpr = 'normal'; this.kids = 'idle';
    this.hud = h('div', { class: 'hud' });
    this.board = h('div', { class: 'board' });
    this.optBox = h('div', { class: 'opts' });
    this.clockNum = h('div', { class: 'clock-num' });
    ui.append(this.hud, this.board, this.optBox, this.clockNum);
    if (ctrl.quit) ui.append(h('button', { class: 'btn small gray quitbtn', title: '也可以按 Esc', onclick: () => this.quit() }, '🚪 ' + ctrl.quitLabel));
    Sound.playMusic('quiz');
    this.nextQ();
  },
  renderHud() {
    const c = this.c;
    const left = h('div', { class: 'tag' }); setRich(left, c.tag());
    const right = h('div', { class: 'tag' }); setRich(right, c.right());
    this.hud.replaceChildren(left, right);
  },
  quit() {
    if (!this.c.quit || this.phase === 'quit') return;
    this.phase = 'quit'; Sound.stopVoice(); Sound.stopSpeak();
    this.c.quit();
  },
  cleanupQ() {
    ui.querySelectorAll('.nextbtn').forEach(e => e.remove());
    this.board.replaceChildren(); this.optBox.replaceChildren(); this.optBox.className = 'opts';
    this.api = null; this.clock = null; this.clockNum.textContent = ''; this.warned = false;
  },
  async nextQ() {
    const tok = sceneToken;
    this.cleanupQ();
    const p = this.c.next();
    if (!p) { this.c.finish(); return; }
    this.p = p; this.phase = 'writing';
    this.total = this.remain = this.c.seconds(p); this.lastSec = null;
    this.teacherExpr = 'normal'; this.playerExpr = 'normal'; this.kids = 'idle';
    Sound.setTempo(this.c.index() >= 2 ? 1.1 : 1);
    this.renderHud();
    await this.write(p, tok); if (!alive(tok)) return;
    Sound.speak(p.question);
    this.api = renderOptions(this.optBox, p, r => this.answer(r));
    this.phase = 'answer';
  },
  async write(p, tok) {
    const q = h('div', { class: 'qtext' });
    this.board.append(q);
    if (p.image) this.board.append(h('img', { class: 'qimg', src: p.image, alt: '題目圖片' }));
    let skip = false; const onDown = () => skip = true;
    screenEl.addEventListener('pointerdown', onDown, { once: true });
    const chars = [...p.question];
    for (let i = 1; i <= chars.length; i++) {
      if (!alive(tok)) return;
      q.textContent = chars.slice(0, i).join('');
      if (skip) { q.textContent = p.question; break; }
      if (i % 2) Sound.sfx('chalk');
      await sleep(chars.length > 30 ? 18 : 32);
    }
    screenEl.removeEventListener('pointerdown', onDown);
  },
  update(dt) {
    if (this.phase !== 'answer' || !this.total) return;
    this.remain -= dt;
    const s = Math.max(0, Math.ceil(this.remain));
    if (s !== this.lastSec) {
      this.lastSec = s;
      this.clockNum.textContent = s;
      this.clockNum.classList.toggle('warn', s <= 5);
      if (s <= 5 && s > 0) {
        Sound.sfx('tick');
        if (!this.warned) { this.warned = true; this.playerExpr = 'think'; Sound.setTempo(1.35); Sound.say('V07'); }
      }
    }
    this.clock = { frac: Math.max(0, this.remain) / this.total, warn: this.remain <= 5 };
    if (this.remain <= 0) this.answer(null, true);
  },
  answer(r, timeout) {
    if (this.phase !== 'answer') return;
    if (this.api) this.api.lock();
    Sound.stopSpeak();
    this.finishAnswer(!timeout && Quiz.check(this.p, r), r, { timeout });
  },
  async finishAnswer(ok, r, info) {
    this.phase = 'feedback'; const tok = sceneToken; const p = this.p; const c = this.c;
    Sound.setTempo(1);
    c.resolve(p, ok, Math.max(0, this.remain), Object.assign({ resp: r }, info));
    if (this.api) this.api.mark(typeof r === 'number' ? r : null, ok);
    if (!this.board.querySelector('.qtext')) this.board.append(h('div', { class: 'qtext' }, p.question));
    const qt = this.board.querySelector('.qtext');
    qt.textContent = p.question;
    if (!ok) qt.append(h('div', { class: 'ansline' }, (info.timeout ? '時間到！' : '') + '正確答案：' + p.answerText));
    if (p.explain) qt.append(h('div', { class: 'explain' }, '📖 ' + p.explain));
    this.renderHud();
    const voices = [];
    if (ok) {
      Sound.sfx('correct'); this.teacherExpr = 'happy'; this.playerExpr = 'happy';
      voices.push(pick(['V05a', 'V05b', 'V05c']));
    } else {
      if (info.timeout) { Sound.sfx('alarm'); voices.push('V08'); }
      Sound.sfx('wrong'); this.teacherExpr = 'shock'; this.playerExpr = 'shock';
      if (!info.timeout) voices.push(pick(['V06a', 'V06b']));
      if (c.kind === 'practice') { this.birdT = performance.now(); if (Math.random() < 0.35) voices.push('V20'); else if (Math.random() < 0.5) voices.push('P_' + c.player + '_ouch'); }
    }
    const nextBtn = h('button', { class: 'btn yellow nextbtn', onclick: () => this.goNext() }, '下一題 ▶');
    ui.append(nextBtn);
    for (const v of voices) { await Sound.say(v); if (!alive(tok) || this.phase !== 'feedback') return; }
    if (ok && !p.explain && !c.alwaysWait) { await sleep(700); if (alive(tok) && this.phase === 'feedback') this.goNext(); }
  },
  goNext() { if (this.phase !== 'feedback') return; this.phase = 'next'; Sound.stopVoice(); this.nextQ(); },
  key(e) {
    if (this.phase === 'answer' && this.api && this.api.key) this.api.key(e);
    else if (this.phase === 'feedback' && (e.key === 'Enter' || e.key === ' ')) this.goNext();
    if (e.key === 'Escape') this.quit();
  },
  birdPos(t) {
    if (!this.birdT) return null;
    const k = (t - this.birdT) / 1000;
    if (k > 2.4) { this.birdT = null; return null; }
    // 從課桌飛到玩家頭上拍拍，再飛回課桌
    const sx = 276, sy = 176, tx = 248, ty = 108;
    if (k < 0.6) return { x: sx + (tx - sx) * k / 0.6, y: sy + (ty - sy) * k / 0.6 - Math.sin(k / 0.6 * Math.PI) * 30, flip: true };
    if (k < 1.8) return { x: tx + Math.sin(k * 12) * 3, y: ty + Math.sin(k * 20) * 2, flip: true };
    const b = (k - 1.8) / 0.6; return { x: tx + (sx - tx) * b, y: ty + (sy - ty) * b - Math.sin(b * Math.PI) * 30 };
  },
  draw(c, t) {
    const o = { stage: this.c.stage, host: this.c.host, teacherExpr: this.teacherExpr, playerExpr: this.playerExpr, player: this.c.player, kids: this.kids,
      clock: this.total && this.clock ? this.clock : (this.total && this.phase === 'writing' ? { frac: 1, warn: false } : null),
      birdState: this.birdPos(t) || {} };
    Art.classroom(c, t, o);
  }
};
// HUD 用的少量格式（只處理我們自己寫的 <b>，資料內容一律跳脫）
function setRich(el, s) {
  el.replaceChildren();
  s.split(/(<b>.*?<\/b>)/).forEach(part => {
    if (part.startsWith('<b>')) el.append(h('b', null, part.slice(3, -4)));
    else if (part) el.append(part);
  });
}

// ==========================================================
// 畢業典禮與證書
// ==========================================================
Scenes.graduation = {
  enter() {
    Sound.playMusic('grad'); Sound.sfx('whoosh'); Sound.sfx('clap');
    Sound.say('B20');
    later(() => this.cert(), 2600);
    ui.append(h('div', { class: 'banner stay', style: 'top:40px' }, '恭喜成為全校榜首！'));
  },
  cert() {
    ui.querySelectorAll('.banner').forEach(e => e.remove());
    const d = new Date();
    this.nameInp = h('input', { value: CHARS[G.character].name, maxlength: 12 });
    this.saveBtn = h('button', { class: 'btn red', onclick: () => this.save() }, '🏆 登上排行榜');
    ui.append(h('div', { class: 'cert' },
      h('h1', null, '畢業證書'),
      Art.portrait(G.character, 'proud', 1.6),
      h('p', { style: 'text-align:left;margin:16px 0 0' }, '學生 ', this.nameInp, ' 於本校修業期滿，',
        `從幼稚園一路闖到大學，通過層層審查榮昇為「全校榜首」，總分 ${G.score.toLocaleString()} 分，成績優異，准予畢業，特頒此證。`),
      h('p', { style: 'text-align:left;font-size:18px' }, '各階段審查：' + G.stageResults.map(s => `${s.name}${s.ok ? '成功' : '失敗'}`).join('、') + (G.continues ? `（接關 ${G.continues} 次）` : '')),
      h('p', { style: 'text-align:left;font-size:18px' }, `題庫組合：${G.combo.name}`),
      h('p', { style: 'margin-top:20px' }, `好學小學堂　校長　王　　中華民國 ${d.getFullYear() - 1911} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`),
      h('div', { class: 'seal' }, '好學小\n學堂印'),
      h('div', { class: 'cert-actions' }, this.saveBtn,
        h('button', { class: 'btn', onclick: () => window.print() }, '🖨 列印證書'),
        h('button', { class: 'btn gray', onclick: () => go('title') }, '回標題'))));
  },
  save() {
    const name = this.nameInp.value.trim() || CHARS[G.character].name;
    Rank.add(G.comboId, { name, score: G.score, char: G.character, date: new Date().toLocaleDateString('zh-TW'), title: RANKS[G.rank].title });
    this.saveBtn.disabled = true; Sound.sfx('coin'); toast('已登上排行榜！');
    later(() => go('ranks', { comboId: G.comboId }), 1200);
  },
  draw(c, t) { Art.graduation(c, t, { player: G.character }); }
};

// ==========================================================
// 排行榜
// ==========================================================
Scenes.ranks = {
  enter(arg = {}) {
    Sound.playMusic('title');
    const opts = [];
    Data.combos.forEach(c => opts.push([c.id, '升學大冒險：' + c.name]));
    this.sel = h('select', { onchange: () => this.render() }, opts.map(([v, n]) => h('option', { value: v, selected: v === arg.comboId }, n)));
    this.table = h('div');
    ui.append(h('div', { class: 'panel center', style: 'width:760px;height:620px;display:flex;flex-direction:column;gap:10px' },
      h('h1', { style: 'text-align:center' }, '🏆 排行榜'), h('div', { class: 'row' }, '題庫組合：', this.sel), this.table,
      h('div', { class: 'row', style: 'justify-content:center;margin-top:auto' }, h('button', { class: 'btn gray', onclick: () => go('modes') }, '回選單'))));
    this.render();
  },
  render() {
    const id = this.sel.value; const list = id ? Rank.list(id) : [];
    this.table.replaceChildren(list.length ? h('table', { class: 't' },
      h('tr', null, h('th', null, '名次'), h('th', null, '名字'), h('th', null, '角色'), h('th', null, '總分'), h('th', null, '職位'), h('th', null, '日期')),
      list.map((r, i) => h('tr', null, h('td', null, i + 1), h('td', null, r.name), h('td', null, (CHARS[r.char] || {}).name || ''), h('td', null, Number(r.score).toLocaleString()), h('td', null, r.title || ''), h('td', null, r.date))))
      : h('p', { style: 'text-align:center;font-size:22px' }, '還沒有人上榜，快去挑戰吧！'));
  },
  key(e) { if (e.key === 'Escape') go('modes'); },
  draw(c, t) { Art.title(c, t); }
};

// ==========================================================
// 自由練習
// ==========================================================
Scenes.practiceSetup = {
  enter() {
    Sound.playMusic('title');
    const sel = h('select', null, Data.banks.map(b => h('option', { value: b.bankId }, `${b.name}（${b.questions.length} 題）`)));
    const diff = h('select', null, h('option', { value: '' }, '全部難度'), [1, 2, 3, 4, 5].map(d => h('option', { value: d }, '難度 ' + d)));
    ui.append(h('div', { class: 'panel center', style: 'width:640px;text-align:center' },
      h('h1', null, '自由練習'), h('p', null, '沒有時間限制，答完會列出錯題和詳解，可以只重練錯題。'),
      h('div', { class: 'row', style: 'justify-content:center' }, '題庫：', sel), h('div', { class: 'row', style: 'justify-content:center;margin-top:10px' }, '難度：', diff),
      h('div', { class: 'row', style: 'justify-content:center;margin-top:20px' },
        h('button', { class: 'btn gray', onclick: () => go('modes') }, '返回'),
        h('button', { class: 'btn red', onclick: () => {
          const b = Data.map[sel.value]; let qs = b.questions;
          if (diff.value) qs = qs.filter(q => q.difficulty === +diff.value);
          if (!qs.length) { toast('這個難度沒有題目'); return; }
          startPractice(b.name, Quiz.shuffle(qs));
        } }, '開始練習 ▶'))));
  },
  draw(c, t) { Art.classroom(c, t, { stage: 'elem', player: 'ying' }); }
};
function startPractice(name, questions) {
  go('quiz', listCtrl({ kind: 'practice', title: '自由練習：' + name, questions,
    onFinish: res => res.total ? go('practiceEnd', { name, res, questions }) : go('practiceSetup') }));
}
Scenes.practiceEnd = {
  enter({ name, res, questions }) {
    Sound.playMusic('shop');
    const pct = Math.round(res.right / res.total * 100);
    ui.append(h('div', { class: 'paper', style: 'height:680px' },
      h('h2', null, '練習結果'), h('div', { class: 'score' }, pct),
      h('div', null, `${name}：答對 ${res.right} / ${res.total} 題` + (res.quit ? `（提早結束，題庫共 ${questions.length} 題）` : '')),
      h('div', { class: 'rows', style: 'height:470px' }, res.wrong.length ? res.wrong.map(w => h('div', null,
        h('div', { class: 'r' }, h('span', { class: 'mk' }, '✘'), h('span', null, w.q.question)),
        h('div', { class: 'ex' }, `正確答案：${w.p.answerText}` + (w.q.explain ? `　📖 ${w.q.explain}` : '')))) : h('p', { style: 'font-size:24px' }, '全部答對，太厲害了！🎉')),
      h('div', { class: 'actions' },
        res.wrong.length ? h('button', { class: 'btn red', onclick: () => startPractice(name, res.wrong.map(w => w.q)) }, '只重練錯題') : null,
        h('button', { class: 'btn', onclick: () => startPractice(name, Quiz.shuffle(questions)) }, '再練一次'),
        h('button', { class: 'btn gray', onclick: () => go('modes') }, '回選單'))));
  },
  draw(c, t) { Art.classroom(c, t, { stage: 'elem', player: 'ying', playerExpr: 'happy', teacherExpr: 'proud' }); }
};

// ==========================================================
// 教室搶答
// ==========================================================
const TEAM_KEYS = ['Q', 'P', 'Z', 'M'];
const TEAM_COLORS = ['#E2453C', '#3A6EA5', '#F2B632', '#3f9a4a'];
Scenes.battleSetup = {
  enter() {
    Sound.playMusic('title');
    const n = h('select', { onchange: () => draw() }, [2, 3, 4].map(k => h('option', { value: k, selected: k === 4 }, k + ' 隊')));
    const names = ['紅隊', '藍隊', '黃隊', '綠隊'].map(v => h('input', { value: v, maxlength: 8, style: 'width:140px' }));
    const combo = h('select', null, Data.combos.map(c => h('option', { value: c.id }, c.name)));
    const count = h('input', { type: 'number', value: 10, min: 1, max: 50, style: 'width:80px' });
    const sec = h('input', { type: 'number', value: 10, min: 3, max: 60, style: 'width:80px' });
    const diff = h('select', null, [['1-5', '全部難度'], ['1-2', '簡單（1–2）'], ['2-3', '普通（2–3）'], ['3-4', '有點難（3–4）'], ['4-5', '很難（4–5）']].map(([v, t]) => h('option', { value: v }, t)));
    const wrap = h('div', { class: 'row wrap' });
    const draw = () => wrap.replaceChildren(...names.slice(0, +n.value).map((el, i) => h('span', { class: 'row' }, h('b', { style: `color:${TEAM_COLORS[i]}` }, `${TEAM_KEYS[i]} 鍵：`), el)));
    draw();
    ui.append(h('div', { class: 'panel center', style: 'width:780px' },
      h('h1', null, '教室搶答・分組設定'),
      h('div', { class: 'form-grid' },
        h('label', null, '隊伍數'), n, h('label', null, '隊名'), wrap,
        h('label', null, '題庫組合'), combo, h('label', null, '難度'), diff,
        h('label', null, '題數'), h('span', null, count, ' 題'), h('label', null, '作答秒數'), h('span', null, sec, ' 秒（搶到後）')),
      h('p', { class: 'hint' }, '搶答：各隊按鍵盤 Q、P、Z、M，或點螢幕四角的大按鈕。搶到的隊伍由老師幫忙點選答案；答錯就把機會讓給其他隊。'),
      h('div', { class: 'row', style: 'justify-content:flex-end' },
        h('button', { class: 'btn gray', onclick: () => go('modes') }, '返回'),
        h('button', { class: 'btn red', onclick: () => {
          const c = Data.combo(combo.value); if (!c) { toast('請先建立題庫組合'); return; }
          const [lo, hi] = diff.value.split('-').map(Number);
          const { list, short } = Quiz.draw(c, Data.map, Math.max(1, +count.value || 10), [lo, hi], new Set());
          if (!list.length) { toast('這個組合沒有題目'); return; }
          if (short) toast('題目不夠，會有重複的題目');
          go('battle', { teams: names.slice(0, +n.value).map((el, i) => ({ name: el.value || TEAM_KEYS[i] + '隊', score: 0, i })), list, sec: Math.max(3, +sec.value || 10) });
        } }, '開始搶答 ▶'))));
  },
  draw(c, t) { Art.classroom(c, t, { stage: 'elem' }); }
};

Scenes.battle = {
  enter({ teams, list, sec }) {
    this.teams = teams; this.list = list; this.sec = sec; this.qi = -1; this.teacherExpr = 'normal'; this.kids = 'idle';
    Sound.playMusic('quiz');
    this.board = h('div', { class: 'board' }); this.optBox = h('div', { class: 'opts' });
    this.status = h('div', { class: 'status' }); this.clockNum = h('div', { class: 'clock-num' });
    const pos = [['left:8px;top:300px'], ['right:8px;top:300px'], ['left:8px;bottom:8px'], ['right:8px;bottom:8px']];
    this.teamEls = teams.map((t, i) => {
      const sc = h('div', { class: 'sc' }, '0');
      const el = h('div', { class: 'team', style: `${pos[i]};background:${TEAM_COLORS[i]}`, onpointerdown: e => { if (e.target.closest('.adj')) return; this.buzz(i); } },
        h('h3', null, t.name), sc, h('span', { class: 'key' }, TEAM_KEYS[i] + ' 鍵'),
        h('div', { class: 'adj' },
          h('button', { class: 'btn small green', onclick: () => this.adjust(i, 100) }, '加分'),
          h('button', { class: 'btn small gray', onclick: () => this.adjust(i, -100) }, '扣分')));
      el._sc = sc; return el;
    });
    this.hostBar = h('div', { class: 'host-bar' },
      h('span', { class: 'hud' }),
      h('button', { class: 'btn small yellow', onclick: () => this.reveal() }, '公布答案'),
      h('button', { class: 'btn small', onclick: () => this.nextQ() }, '跳題 / 下一題 ▶'),
      h('button', { class: 'btn small red', onclick: () => this.end() }, '結束'));
    this.counter = h('div', { class: 'tag', style: 'background:#1E1B2E;color:#fff;padding:4px 12px;border-radius:6px' });
    this.hostBar.firstChild.replaceWith(this.counter);
    ui.append(this.board, this.optBox, this.status, this.clockNum, this.hostBar, ...this.teamEls);
    this.nextQ(true);
  },
  async nextQ(first) {
    const tok = sceneToken;
    this.qi++;
    if (this.qi >= this.list.length) { this.end(); return; }
    this.p = Quiz.prepare(this.list[this.qi]); this.out = new Set(); this.wrongIdx = []; this.holder = null; this.phase = 'writing'; this.remain = 0;
    this.teacherExpr = 'normal'; this.kids = 'idle';
    this.board.replaceChildren(); this.optBox.replaceChildren(); this.clockNum.textContent = '';
    this.counter.textContent = `第 ${this.qi + 1} / ${this.list.length} 題`;
    this.refreshTeams(); this.status.textContent = '老師出題中……';
    if (first) await Sound.say('V25'); else if (this.qi < 12) await Sound.say('V04_' + (this.qi + 1));
    if (!alive(tok)) return;
    const q = h('div', { class: 'qtext' }, this.p.question);
    this.board.append(q); if (this.p.image) this.board.append(h('img', { class: 'qimg', src: this.p.image }));
    Sound.sfx('chalk'); Sound.speak(this.p.question);
    this.showOpts(true);
    this.open();
  },
  showOpts(lockedView) {
    this.api = renderOptions(this.optBox, this.p, r => this.answer(r), this.wrongIdx);
    this.optBox.style.pointerEvents = lockedView ? 'none' : '';
    this.optBox.style.opacity = lockedView ? '.7' : '1';
  },
  open() {
    this.phase = 'buzz'; this.holder = null; this.remain = 0; this.clockNum.textContent = '';
    this.status.textContent = '🔔 按搶答鍵！'; this.refreshTeams();
  },
  buzz(i) {
    if (this.phase !== 'buzz' || i >= this.teams.length || this.out.has(i)) return;
    this.phase = 'answer'; this.holder = i; this.remain = this.sec; this.lastSec = null;
    Sound.sfx('buzz'); Sound.stopSpeak();
    this.status.textContent = `${this.teams[i].name} 搶到了！請作答`;
    this.refreshTeams(); this.showOpts(false);
  },
  update(dt) {
    if (this.phase !== 'answer') return;
    this.remain -= dt;
    const s = Math.max(0, Math.ceil(this.remain));
    if (s !== this.lastSec) { this.lastSec = s; this.clockNum.textContent = s; this.clockNum.classList.toggle('warn', s <= 3); if (s <= 3 && s > 0) Sound.sfx('tick'); }
    if (this.remain <= 0) { Sound.sfx('alarm'); this.answer(null); }
  },
  answer(r) {
    if (this.phase !== 'answer') return;
    const i = this.holder; const ok = r != null && Quiz.check(this.p, r);
    if (ok) {
      this.teams[i].score += 100; Sound.sfx('correct'); this.teacherExpr = 'happy'; this.kids = 'clap'; Sound.sfx('clap');
      this.api.mark(typeof r === 'number' ? r : null, true);
      this.status.textContent = `${this.teams[i].name} 答對！+100`; Sound.say(pick(['V05a', 'V05b', 'V05c']));
      this.done();
    } else {
      Sound.sfx('wrong'); this.teacherExpr = 'shock'; this.out.add(i);
      if (typeof r === 'number') this.wrongIdx.push(r);
      Sound.say(pick(['V06a', 'V06b']));
      const left = this.teams.filter(t => !this.out.has(t.i));
      // 沒有隊伍可以搶了，或是非題答錯（剩下的答案已經很明顯）就直接公布
      if (!left.length || this.p.type === 'truefalse') { this.status.textContent = `${this.teams[i].name} 答錯了！`; this.reveal(); return; }
      this.status.textContent = `${this.teams[i].name} 答錯了！機會讓給其他隊`;
      this.phase = 'wait';
      later(() => { this.showOpts(true); this.open(); }, 1200);
    }
  },
  reveal() {
    if (this.phase === 'done' || this.phase === 'writing') return;
    this.phase = 'done'; Sound.stopSpeak();
    if (this.api && this.p.type !== 'order' && this.p.type !== 'number') this.api.mark(null, true);
    this.showAnswer(); this.refreshTeams();
  },
  done() { this.phase = 'done'; this.showAnswer(); this.refreshTeams(); },
  showAnswer() {
    const q = this.board.querySelector('.qtext');
    if (q && !q.querySelector('.ansline')) { q.append(h('div', { class: 'ansline' }, '正確答案：' + this.p.answerText)); if (this.p.explain) q.append(h('div', { class: 'explain' }, '📖 ' + this.p.explain)); }
    this.clockNum.textContent = '';
    if (!this.status.textContent.includes('答對')) this.status.textContent = '公布答案！按「下一題」繼續';
  },
  adjust(i, d) { this.teams[i].score += d; Sound.sfx(d > 0 ? 'coin' : 'cancel'); this.refreshTeams(); },
  refreshTeams() {
    this.teamEls.forEach((el, i) => {
      el._sc.textContent = this.teams[i].score;
      el.classList.toggle('active', this.holder === i && this.phase === 'answer');
      el.classList.toggle('out', this.out && this.out.has(i));
    });
  },
  key(e) {
    const k = TEAM_KEYS.indexOf(e.key.toUpperCase());
    if (k >= 0 && this.phase === 'buzz') { this.buzz(k); return; }
    if (this.phase === 'answer' && this.api && this.api.key) this.api.key(e);
    else if (this.phase === 'done' && (e.key === 'Enter' || e.key === ' ')) this.nextQ();
  },
  end() { go('podium', this.teams); },
  draw(c, t) { Art.arena(c, t, { teacherExpr: this.teacherExpr, kids: this.kids, clock: this.phase === 'answer' ? { frac: Math.max(0, this.remain) / this.sec, warn: this.remain <= 3 } : null }); }
};

Scenes.podium = {
  enter(teams) {
    Sound.playMusic('grad'); Sound.sfx('clap'); Sound.say('V26');
    const sorted = [...teams].sort((a, b) => b.score - a.score);
    const order = sorted.length >= 3 ? [sorted[1], sorted[0], sorted[2]] : [sorted[1], sorted[0]];
    const heights = { 0: 300, 1: 220, 2: 160 };
    ui.append(h('div', { class: 'banner stay', style: 'top:30px' }, `冠軍：${sorted[0].name}`),
      h('div', { class: 'podium' }, order.filter(Boolean).map(t => {
        const place = sorted.indexOf(t);
        return h('div', { class: 'p', style: `height:${heights[place]}px;background:${TEAM_COLORS[t.i]}` }, h('b', null, ['🥇', '🥈', '🥉'][place]), t.name, h('div', null, t.score + ' 分'));
      })),
      sorted[3] ? h('div', { class: 'abs', style: 'left:0;right:0;bottom:80px;text-align:center;color:#fff;font-size:22px;text-shadow:2px 2px 0 #1E1B2E' }, `第 4 名：${sorted[3].name} ${sorted[3].score} 分`) : null,
      h('div', { class: 'row abs', style: 'left:0;right:0;bottom:20px;justify-content:center' },
        h('button', { class: 'btn', onclick: () => go('battleSetup') }, '再玩一次'), h('button', { class: 'btn gray', onclick: () => go('modes') }, '回選單')));
  },
  draw(c, t) { Art.graduation(c, t, {}); }
};

// ---------- 啟動 ----------
(async function boot() {
  fit(); applyLook();
  requestAnimationFrame(loop);
  await Promise.all([Art.load(), Data.load()]);
  go('title');
})();

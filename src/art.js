// ===== art.js：用生成圖片（Canva AI 繪製）組合場景 =====
// 畫布實際 960×720，程式以 320×240 的邏輯座標作畫（game.js 每幀先 scale(3)）
const PAL = {
  board: '#2F5D3A', chalk: '#F7F3E8', blue: '#3A6EA5', yellow: '#F2B632', red: '#E2453C',
  pink: '#F6A6B2', wood: '#A0703C', ol: '#1E1B2E'
};
const OL = PAL.ol;

const Art = (() => {
  const IMG = {};
  // 開機時把內嵌圖片全部解碼好
  function load() {
    return Promise.all(Object.entries(IMAGES).map(([k, src]) => new Promise(res => {
      const im = new Image();
      im.onload = () => { IMG[k] = im; res(); };
      im.onerror = () => res();
      im.src = src;
    })));
  }

  // ---------- 向量小工具 ----------
  function rrect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function star(c, x, y, r, col) {
    c.save(); c.translate(x, y); c.fillStyle = col; c.beginPath();
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, rr = i % 2 ? r * 0.35 : r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    c.closePath(); c.fill(); c.restore();
  }
  function drop(c, x, y, r, col) {
    c.fillStyle = col; c.beginPath(); c.moveTo(x, y - r * 1.8); c.quadraticCurveTo(x + r, y - r * 0.3, x, y + r); c.quadraticCurveTo(x - r, y - r * 0.3, x, y - r * 1.8); c.fill();
  }
  function bgImage(c, key) {
    if (IMG[key]) c.drawImage(IMG[key], 0, 0, 320, 240);
    else { c.fillStyle = '#f3ead2'; c.fillRect(0, 0, 320, 240); }
  }

  // ---------- 角色 ----------
  // 表情對應圖片：開心／得意 → _happy，驚嚇／哭哭 → _sad，其他用基本圖
  function variant(id, expr) {
    if ((expr === 'happy' || expr === 'proud') && IMG[id + '_happy']) return id + '_happy';
    if ((expr === 'shock' || expr === 'cry') && IMG[id + '_sad']) return id + '_sad';
    return id;
  }
  // x,y 是 (64*s)×(64*s) 方框左上角，角色腳底貼齊方框底部
  function drawChar(c, id, x, y, expr = 'normal', t = 0, s = 1.5, flip = false) {
    const key = variant(id, expr), im = IMG[key];
    if (!im) return;
    const H = 64 * s, h = H * 1.04, w = h * im.width / im.height;
    let dx = 0, dy = 0;
    if (expr === 'happy' || expr === 'proud') dy = -Math.abs(Math.sin(t / 170)) * 4;
    else if (expr === 'shock') dx = Math.sin(t / 25) * 0.8;
    else dy = Math.sin(t / 520) * 0.7;
    const left = x + (H - w) / 2 + dx, top = y + H - h + dy;
    c.save();
    if (flip) { c.translate(left + w, top); c.scale(-1, 1); c.drawImage(im, 0, 0, w, h); }
    else c.drawImage(im, left, top, w, h);
    c.restore();
    const cx = left + w / 2;
    if (expr === 'think') {
      const bx = cx + w * 0.38, by = top + 6 + Math.sin(t / 200) * 1.5;
      c.fillStyle = '#fff'; c.strokeStyle = OL; c.lineWidth = 1;
      c.beginPath(); c.arc(bx, by, 7, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = OL; c.font = 'bold 10px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', bx, by + 0.5);
    }
    if (key === id && expr === 'shock') { drop(c, cx + w * 0.3, top + 14, 2.5, '#8fd3ff'); drop(c, cx - w * 0.32, top + 18, 2, '#8fd3ff'); }
    if (key === id && expr === 'cry') for (let i = 0; i < 4; i++) { const k = (t / 600 + i / 4) % 1; drop(c, cx + (i % 2 ? 1 : -1) * (6 + k * 10), top + 20 + k * 20, 1.8, '#6cc4ff'); }
    if (expr === 'proud' || (expr === 'happy' && key === id)) { const f = Math.floor(t / 250) % 2; star(c, cx - w * 0.5, top + 10 + f * 3, 4, PAL.yellow); star(c, cx + w * 0.5, top + 16 - f * 3, 3.5, PAL.yellow); }
  }
  // 藍啚：x,y 是左上角，大約 40×34
  function bird(c, x, y, t, flip = false) {
    const im = IMG.bird; if (!im) return;
    const w = 40, h = w * im.height / im.width, dy = -Math.abs(Math.sin(t / 220)) * 1.5;
    c.save(); c.translate(x + w / 2, y + h / 2 + dy); c.rotate(Math.sin(t / 300) * 0.05);
    if (flip) c.scale(-1, 1);
    c.drawImage(im, -w / 2, -h / 2, w, h); c.restore();
  }
  // 背景同學一排（頭露在作業簿上方）
  function classmates(c, x, y, w, pose, t) {
    const im = IMG.classmates; if (!im) return;
    const h = w * im.height / im.width;
    const dy = (pose === 'clap' || pose === 'bang') ? -Math.abs(Math.sin(t / 110)) * 2.5 : (pose === 'raise' ? -1.5 : 0);
    c.drawImage(im, x, y + dy, w, h);
  }

  // 黑板（或白板）
  function board(c, x, y, w, h, white) {
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.25)'; c.shadowBlur = 6; c.shadowOffsetY = 2;
    rrect(c, x - 5, y - 5, w + 10, h + 10, 5);
    const fg = c.createLinearGradient(0, y - 5, 0, y + h + 5);
    fg.addColorStop(0, white ? '#d9dee5' : '#c8915a'); fg.addColorStop(1, white ? '#a9b2bd' : '#8a5a2b');
    c.fillStyle = fg; c.fill(); c.restore();
    rrect(c, x, y, w, h, 3);
    const g = c.createLinearGradient(x, y, x + w, y + h);
    if (white) { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#eef2f6'); }
    else { g.addColorStop(0, '#356b43'); g.addColorStop(1, '#264f31'); }
    c.fillStyle = g; c.fill();
    if (!white) { c.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < 9; i++) { c.beginPath(); c.ellipse(x + (i * 53) % w, y + (i * 29) % h, 14, 3, -0.2, 0, Math.PI * 2); c.fill(); } }
    c.fillStyle = white ? '#9aa4ae' : '#7b5228'; rrect(c, x - 3, y + h + 3, w + 6, 3, 1.5); c.fill();
    [['#fff', 20], [PAL.yellow, 30], [PAL.pink, 40]].forEach(([col, dx]) => { c.fillStyle = col; rrect(c, x + dx, y + h + 1.5, 7, 2, 1); c.fill(); });
  }
  // 玩家課桌
  function desk(c, x, y, w, h, col = '#c8915a') {
    c.save(); c.shadowColor = 'rgba(0,0,0,0.3)'; c.shadowBlur = 4;
    rrect(c, x, y, w, h, 4);
    c.fillStyle = col; c.fill(); c.restore();
    const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.28)');
    rrect(c, x, y, w, h, 4); c.fillStyle = g; c.fill();
    c.fillStyle = 'rgba(255,255,255,0.25)'; rrect(c, x + 3, y + 2, w - 6, 2, 1); c.fill();
  }

  // 鬧鐘
  function clock(c, x, y, frac, t, warn) {
    const sh = warn ? Math.sin(t / 30) * 1.2 : 0;
    c.save(); c.translate(x + sh, y);
    c.fillStyle = PAL.yellow; c.strokeStyle = OL; c.lineWidth = 1;
    [-8, 8].forEach(dx => { c.beginPath(); c.arc(dx, -9, 4.5, Math.PI, 0); c.fill(); c.stroke(); });
    c.beginPath(); c.moveTo(-7, 9); c.lineTo(-9, 13); c.moveTo(7, 9); c.lineTo(9, 13); c.stroke();
    c.beginPath(); c.arc(0, 0, 11.5, 0, Math.PI * 2); c.fillStyle = warn ? PAL.red : PAL.blue; c.fill(); c.stroke();
    c.beginPath(); c.arc(0, 0, 8.8, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
    c.fillStyle = '#9aa'; for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; c.beginPath(); c.arc(Math.sin(a) * 7, -Math.cos(a) * 7, 0.6, 0, Math.PI * 2); c.fill(); }
    // 剩餘時間扇形
    c.fillStyle = warn ? 'rgba(226,69,60,0.25)' : 'rgba(58,110,165,0.18)';
    c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 8.5, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); c.closePath(); c.fill();
    const a = (1 - frac) * Math.PI * 2;
    c.strokeStyle = warn ? PAL.red : OL; c.lineWidth = 1.3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.sin(a) * 6.5, -Math.cos(a) * 6.5); c.stroke();
    c.fillStyle = OL; c.beginPath(); c.arc(0, 0, 1.2, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  // 飄落的鳳凰花瓣／彩帶
  function petals(c, t, n, cols, speed = 1) {
    for (let i = 0; i < n; i++) {
      const x = (i * 47 + t / 25 * speed * ((i % 3) + 1)) % 340 - 10, y = (i * 61 + t / 18 * speed * ((i % 2) + 1)) % 260 - 10;
      c.save(); c.translate(x, y); c.rotate(t / 400 + i); c.fillStyle = cols[i % cols.length];
      c.beginPath(); c.ellipse(0, 0, 2.2, 1.2, 0, 0, Math.PI * 2); c.fill(); c.restore();
    }
  }

  // ---------- 場景 ----------
  function title(c, t) { bgImage(c, 'bg_title'); petals(c, t, 14, ['#ff6b4a', '#ff9a5c', '#e2453c'], 0.6); }

  function classroomBg(stage) { return { kinder: 'bg_kinder', univ: 'bg_univ' }[stage] || 'bg_classroom'; }
  // 主要答題教室；o: {stage, host, teacherExpr, playerExpr, player, kids, clock, birdState}
  function classroom(c, t, o) {
    const stage = o.stage || 'elem';
    bgImage(c, classroomBg(stage));
    board(c, 14, 18, 292, 88);
    classmates(c, 76, 99, 168, o.kids || 'idle', t);
    drawChar(c, o.host || 'teacher', -8, 122, o.teacherExpr || 'normal', t, 1.6);
    if (o.player) {
      drawChar(c, o.player, 226, 124, o.playerExpr || 'normal', t, 1.6, true);
      desk(c, 234, 206, 84, 34, stage === 'kinder' ? '#8fd0ff' : '#c8915a');
    }
    const bs = o.birdState || {};
    if (bs.x != null) bird(c, bs.x, bs.y, t, bs.flip); else bird(c, 276, 176, t, true);
    if (o.clock) clock(c, 292, 34, o.clock.frac, t, o.clock.warn);
  }
  function auditorium(c, t, o) {
    bgImage(c, 'bg_auditorium');
    board(c, 14, 18, 292, 88);
    classmates(c, 76, 99, 168, o.kids || 'idle', t);
    drawChar(c, 'principal', -8, 122, o.teacherExpr || 'normal', t, 1.6);
    if (o.player) {
      drawChar(c, o.player, 226, 124, o.playerExpr || 'normal', t, 1.6, true);
      desk(c, 234, 206, 84, 34, '#9a5a2a');
    }
    const bs = o.birdState || {};
    if (bs.x != null) bird(c, bs.x, bs.y, t, bs.flip); else bird(c, 276, 176, t, true);
    if (o.clock) clock(c, 292, 34, o.clock.frac, t, o.clock.warn);
  }
  function sunset(c, t, o) {
    bgImage(c, 'bg_sunset');
    if (o && o.player) drawChar(c, o.player, 118, 122, 'cry', t, 1.7);
  }
  function graduation(c, t, o) {
    bgImage(c, 'bg_graduation');
    petals(c, t, 40, [PAL.yellow, PAL.pink, '#fff', '#8fd18f', '#9fc8ff', '#ff6b4a'], 1.2);
    if (o && o.player) drawChar(c, o.player, 120, 112, 'proud', t, 1.7);
    for (let i = 0; i < 4; i++) {
      const k = (t / 1800 + i / 4) % 1, x = 40 + i * 80 + Math.sin(k * 6 + i) * 10, y = 200 - Math.sin(k * Math.PI) * 170;
      c.save(); c.translate(x, y); c.rotate(Math.sin(k * 8) * 0.4);
      c.fillStyle = OL; c.beginPath(); c.moveTo(-8, 0); c.lineTo(0, -4); c.lineTo(8, 0); c.lineTo(0, 4); c.closePath(); c.fill();
      c.fillRect(-4, 1, 8, 4); c.strokeStyle = PAL.yellow; c.lineWidth = 1; c.beginPath(); c.moveTo(0, 0); c.lineTo(6, 6); c.stroke();
      c.restore();
    }
  }
  function bulletin(c, t) { bgImage(c, 'bg_bulletin'); bird(c, 272, 4 + Math.sin(t / 400), t, true); }
  function arena(c, t, o) { classroom(c, t, Object.assign({ stage: 'elem' }, o)); }

  // 頭像（給 DOM 用）
  function portrait(id, expr = 'normal', size = 3) {
    const key = id === 'bird' ? 'bird' : variant(id, expr);
    const img = document.createElement('img');
    img.className = 'portrait'; img.alt = '';
    if (IMG[key]) img.src = IMG[key].src;
    img.style.width = img.style.height = 64 * size + 'px';
    return img;
  }

  // 通用：畫一張生成圖（w 給定時 h 依比例），rot 為旋轉角度（以圖片中心）
  function img(c, key, x, y, w, h, rot = 0, flip = false) {
    const im = IMG[key]; if (!im) return;
    h = h || w * im.height / im.width;
    c.save(); c.translate(x + w / 2, y + h / 2); if (rot) c.rotate(rot); if (flip) c.scale(-1, 1);
    c.drawImage(im, -w / 2, -h / 2, w, h); c.restore();
  }
  // 地圖背景：依階段疊上不同天色（早上→下午→黃昏→夜晚）
  const SKY = ['rgba(255,255,255,0)', 'rgba(255,200,110,0.22)', 'rgba(255,140,60,0.32)', 'rgba(190,100,210,0.36)', 'rgba(50,25,90,0.55)'];
  function boardBg(c, si) {
    bgImage(c, 'bg_board');
    const g = c.createLinearGradient(0, 0, 0, 240);
    g.addColorStop(0, SKY[si] || SKY[0]); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 320, 240);
    if (si >= 4) { c.fillStyle = 'rgba(255,190,120,0.18)'; c.fillRect(0, 170, 320, 70); }
  }

  return { load, drawChar, title, classroom, auditorium, sunset, graduation, bulletin, arena, portrait, img, boardBg, bgImage, rrect, star };
})();

// ===== engine.js：抽題、打亂選項、判斷對錯、計分（純邏輯）=====
const Quiz = {
  shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; },
  dist(d, [lo, hi]) { return d < lo ? lo - d : d > hi ? d - hi : 0; },

  // 依比例分配題數（最大餘數法）
  allocate(n, weights) {
    const tot = weights.reduce((a, b) => a + b, 0) || 1;
    const raw = weights.map(w => n * w / tot), q = raw.map(Math.floor);
    let left = n - q.reduce((a, b) => a + b, 0);
    raw.map((r, i) => [r - q[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { q[i]++; left--; } });
    return q;
  },

  // 從題庫組合抽 n 題；asked = 這場已出過的題目 id
  draw(combo, bankMap, n, range, asked = new Set()) {
    const items = combo.items.filter(it => bankMap[it.bankId] && bankMap[it.bankId].questions.length && it.weight > 0);
    if (!items.length) return { list: [], short: true };
    const quotas = this.allocate(n, items.map(it => it.weight));
    const used = new Set(), list = []; let short = false;
    const pickOne = qs => {
      for (const allowAsked of [false, true]) for (let d = 0; d <= 4; d++) {
        const cand = qs.filter(q => !used.has(q.id) && (allowAsked || !asked.has(q.id)) && this.dist(q.difficulty, range) <= d);
        if (cand.length) { if (allowAsked) short = true; return cand[Math.random() * cand.length | 0]; }
      }
      short = true; // 題庫太小：同一場只好重複
      const near = qs.filter(q => this.dist(q.difficulty, range) <= 1);
      const src = near.length ? near : qs;
      return src[Math.random() * src.length | 0];
    };
    items.forEach((it, i) => {
      for (let k = 0; k < quotas[i]; k++) { const q = pickOne(bankMap[it.bankId].questions); used.add(q.id); list.push(q); }
    });
    return { list: this.shuffle(list), short };
  },

  // 這個組合在某個難度範圍內，相鄰難度也算，共有幾題可用
  available(combo, bankMap, range) {
    let n = 0;
    combo.items.forEach(it => { const b = bankMap[it.bankId]; if (b && it.weight > 0) n += b.questions.filter(q => this.dist(q.difficulty, range) <= 1).length; });
    return n;
  },

  // 把題目整理成要顯示的樣子（打亂選項）
  prepare(q) {
    const p = { src: q, type: q.type, question: q.question, image: q.image, explain: q.explain, subject: q.subject || '其他' };
    if (q.type === 'choice' || q.type === 'image') {
      const idx = this.shuffle([0, 1, 2, 3]);
      p.opts = idx.map(i => ({ text: q.options[i], orig: i }));
      p.correct = p.opts.findIndex(o => o.orig === q.answer - 1);
      p.answerText = q.options[q.answer - 1];
    } else if (q.type === 'truefalse') {
      p.opts = [{ text: '○' }, { text: '✕' }];
      p.correct = q.answer === 'O' ? 0 : 1;
      p.answerText = q.answer === 'O' ? '○（對）' : '✕（錯）';
    } else if (q.type === 'order') {
      const seq = String(q.answer).split(',').map(Number);
      p.correctSeq = seq.map(k => q.options[k - 1]);
      let opts = this.shuffle(q.options);
      if (opts.join('|') === p.correctSeq.join('|') && opts.length > 1) opts = [...opts.slice(1), opts[0]];
      p.opts = opts.map(text => ({ text }));
      p.answerText = p.correctSeq.join(' → ');
    } else if (q.type === 'number') {
      p.correct = Number(q.answer);
      p.answerText = String(q.answer);
    }
    return p;
  },

  check(p, r) {
    if (r == null) return false;
    if (p.type === 'order') return Array.isArray(r) && r.join('|') === p.correctSeq.join('|');
    if (p.type === 'number') { const v = parseFloat(String(r).replace(/,/g, '')); return isFinite(v) && Math.abs(v - p.correct) < 1e-9; }
    return r === p.correct;
  },

  multiplier(combo) { return combo >= 10 ? 2 : combo >= 5 ? 1.5 : combo >= 3 ? 1.2 : 1; },
  rankPoints(remainSec, combo) { return Math.round((100 + Math.max(0, Math.floor(remainSec)) * 10) * this.multiplier(combo)); }
};

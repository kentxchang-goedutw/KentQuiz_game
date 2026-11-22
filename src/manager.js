// ===== manager.js：題庫管理、題庫組合、匯入匯出、AI 出題提示詞、錄音室、設定 =====
let mgrUnlocked = false;
const newId = p => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const ansText = q => q.type === 'choice' || q.type === 'image' ? `${q.answer}. ${q.options[q.answer - 1]}` : q.type === 'order' ? String(q.answer) : String(q.answer);

Scenes.banks = {
  enter(arg = {}) {
    if (LOCAL_DATA.hideManager) return go('modes'); // 學生版：沒有題庫管理
    Sound.playMusic('shop');
    if (Settings.get().password && !mgrUnlocked) return this.gate(arg);
    this.tab = arg.tab || 'banks'; this.edit = arg.edit || null;
    this.body = h('div', { class: 'body' });
    const tabs = [['banks', '📚 題庫'], ['combos', '🧩 題庫組合'], ['import', '📥 匯入／匯出'], ['ai', '🤖 AI 出題'], ['studio', '🎙 錄音室'], ['lock', '🔒 老師密碼']];
    this.tabEls = tabs.map(([id, name]) => h('button', { class: 'tab', onclick: () => { this.tab = id; this.edit = null; this.render(); } }, name));
    ui.append(h('div', { class: 'panel mgr' },
      h('div', { class: 'tabs' }, this.tabEls, h('span', { style: 'flex:1' }), h('button', { class: 'btn small gray', onclick: () => go('modes') }, '回選單')),
      this.body));
    this.render();
  },
  gate(arg) {
    const inp = h('input', { class: 'pwd', type: 'password', maxlength: 4, inputmode: 'numeric' });
    const tryIt = () => { if (inp.value === Settings.get().password) { mgrUnlocked = true; go('banks', arg); } else { Sound.sfx('wrong'); inp.value = ''; toast('密碼不對喔'); } };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') tryIt(); });
    ui.append(h('div', { class: 'panel center', style: 'width:480px;text-align:center' },
      h('h1', null, '🔒 老師專用'), h('p', null, '請輸入四位數老師密碼'), inp,
      h('div', { class: 'row', style: 'justify-content:center;margin-top:16px' }, h('button', { class: 'btn gray', onclick: () => go('modes') }, '返回'), h('button', { class: 'btn red', onclick: tryIt }, '進入'))));
    setTimeout(() => inp.focus(), 50);
  },
  render() {
    this.tabEls.forEach((t, i) => t.classList.toggle('on', ['banks', 'combos', 'import', 'ai', 'studio', 'lock'][i] === this.tab));
    this.body.replaceChildren();
    this.body.scrollTop = 0;
    if (this.tab === 'banks') this.edit ? this.renderBank(Data.map[this.edit]) : this.renderBanks();
    else this['render_' + this.tab]();
  },
  async reload() { await Data.load(); this.render(); },

  // ---------- 題庫列表 ----------
  renderBanks() {
    const b = this.body;
    b.append(h('div', { class: 'row', style: 'margin-bottom:10px' },
      h('button', { class: 'btn small green', onclick: () => this.newBank() }, '＋ 新增空白題庫'),
      h('button', { class: 'btn small gray', onclick: () => this.restoreSamples() }, '還原內建題庫'),
      h('span', { class: 'hint' }, '每張卡片下方是難度 1–5 的題數；升學大冒險各學級分別抽難度 1、1–2、2–3、3–4、4–5。')));
    if (!Data.banks.length) b.append(h('p', null, '還沒有題庫。到「匯入／匯出」匯入，或用「AI 出題」產生題目吧！'));
    b.append(h('div', { class: 'cards' }, Data.banks.map(bank => {
      const cnt = [1, 2, 3, 4, 5].map(d => bank.questions.filter(q => q.difficulty === d).length);
      const max = Math.max(1, ...cnt);
      return h('div', { class: 'bank-card' },
        h('h3', null, bank.name), h('div', { class: 'hint' }, `${bank.author || '—'}・共 ${bank.questions.length} 題`),
        h('div', { class: 'bars' }, cnt.map(n => h('div', { style: { height: (n / max * 100) + '%', background: n ? '#3A6EA5' : '#E2453C' } }, h('span', null, n)))),
        h('div', { class: 'bars-lbl' }, [1, 2, 3, 4, 5].map(d => h('span', null, '難' + d))),
        h('div', { class: 'row wrap', style: 'margin-top:6px;gap:6px' },
          h('button', { class: 'btn small', onclick: () => { this.edit = bank.bankId; this.render(); } }, '編輯'),
          h('button', { class: 'btn small gray', onclick: () => download(bank.name + '.csv', bankToCSV(bank), 'text/csv') }, 'CSV'),
          h('button', { class: 'btn small gray', onclick: () => download(bank.name + '.json', JSON.stringify(stripBank(bank), null, 2), 'application/json') }, 'JSON'),
          h('button', { class: 'btn small red', onclick: () => this.delBank(bank) }, '刪除')));
    })));
  },
  async newBank() {
    const name = prompt('新題庫的名稱（例如：五年級自然 第一單元）'); if (!name) return;
    const bank = { bankId: newId('bank'), name: name.trim(), author: '', version: 1, questions: [] };
    await Store.putBank(bank); await Data.load(); this.edit = bank.bankId; this.render();
  },
  async restoreSamples() {
    if (!confirm('要把內建題庫和內建組合還原成這個檔案打包時的內容嗎？（同 ID 的會被覆蓋，你自己建的題庫不受影響）')) return;
    for (const b of builtinBanks()) await Store.putBank(b);
    for (const c of builtinCombos()) await Store.putCombo(c);
    toast('內建題庫已還原'); this.reload();
  },
  async delBank(bank) {
    if (!confirm(`確定刪除「${bank.name}」（${bank.questions.length} 題）？刪除後無法復原，建議先匯出備份。`)) return;
    await Store.delBank(bank.bankId);
    for (const c of Data.combos) if (c.items.some(it => it.bankId === bank.bankId)) { c.items = c.items.filter(it => it.bankId !== bank.bankId); await Store.putCombo(c); }
    toast('已刪除'); this.reload();
  },

  // ---------- 編輯單一題庫 ----------
  renderBank(bank) {
    if (!bank) { this.edit = null; return this.renderBanks(); }
    const name = h('input', { value: bank.name, style: 'width:320px' }), author = h('input', { value: bank.author || '', style: 'width:160px' });
    this.body.append(h('div', { class: 'row wrap', style: 'margin-bottom:10px' },
      h('button', { class: 'btn small gray', onclick: () => { this.edit = null; this.render(); } }, '← 題庫列表'),
      '名稱', name, '作者', author,
      h('button', { class: 'btn small green', onclick: async () => { bank.name = name.value.trim() || bank.name; bank.author = author.value.trim(); await Store.putBank(bank); toast('已儲存'); this.reload(); } }, '儲存名稱'),
      h('button', { class: 'btn small yellow', onclick: () => this.qForm(bank, null) }, '＋ 新增題目')));
    this.body.append(h('table', { class: 't' },
      h('tr', null, ['#', '題型', '題目', '答案', '難度', '科目', '操作'].map(t => h('th', null, t))),
      bank.questions.map((q, i) => h('tr', null,
        h('td', null, i + 1), h('td', null, TYPE_NAME[q.type]), h('td', null, q.question, q.image ? ' 🖼' : ''), h('td', null, ansText(q)), h('td', null, q.difficulty), h('td', null, q.subject || ''),
        h('td', { style: 'white-space:nowrap' },
          h('button', { class: 'btn small yellow', onclick: () => this.tryQ(bank, q) }, '試玩'), ' ',
          h('button', { class: 'btn small', onclick: () => this.qForm(bank, q) }, '編輯'), ' ',
          h('button', { class: 'btn small red', onclick: async () => { if (!confirm('刪除這一題？')) return; bank.questions = bank.questions.filter(x => x !== q); await Store.putBank(bank); this.reload(); } }, '刪')))) ));
    if (!bank.questions.length) this.body.append(h('p', null, '這份題庫還沒有題目。按「＋ 新增題目」，或到「匯入／匯出」貼上 AI 產生的題目。'));
  },
  tryQ(bank, q) {
    Sound.init();
    go('quiz', listCtrl({ kind: 'try', title: '試玩這一題', questions: [q], sec: 15, onFinish: () => go('banks', { tab: 'banks', edit: bank.bankId }) }));
  },
  qForm(bank, q) {
    const src = q || { type: 'choice', question: '', options: ['', '', '', ''], answer: 1, difficulty: 1, subject: '', explain: '' };
    const type = h('select', null, Object.entries(TYPE_NAME).map(([k, v]) => h('option', { value: k, selected: k === src.type }, v)));
    const question = h('textarea', { rows: 2, style: 'width:100%' }); question.value = src.question;
    const opts = [0, 1, 2, 3, 4, 5].map(i => h('input', { value: (src.options || [])[i] || '', placeholder: '選項 ' + (i + 1), style: 'width:200px' }));
    const optRow = h('div', { class: 'row wrap' }, opts);
    const answer = h('input', { value: src.type === 'order' ? src.answer : String(src.answer ?? ''), style: 'width:160px' });
    const ansHint = h('span', { class: 'hint' });
    const diff = h('select', null, [1, 2, 3, 4, 5].map(d => h('option', { value: d, selected: d === src.difficulty }, d)));
    const subject = h('input', { value: src.subject || '' }), explain = h('input', { value: src.explain || '', style: 'width:100%' });
    const image = h('input', { value: src.image && !src.image.startsWith('data:') ? src.image : '', placeholder: '圖片網址（https://…）', style: 'width:360px' });
    let imgData = src.image && src.image.startsWith('data:') ? src.image : '';
    const imgInfo = h('span', { class: 'hint' }, imgData ? '已內嵌圖片' : '');
    const file = h('input', { type: 'file', accept: 'image/*', onchange: async () => { if (file.files[0]) { imgData = await shrinkImage(file.files[0]); imgInfo.textContent = '已內嵌圖片'; image.value = ''; } } });
    const err = h('div', { class: 'warn' });
    const sync = () => {
      const t = type.value;
      const n = t === 'choice' || t === 'image' ? 4 : t === 'order' ? 6 : 0;
      opts.forEach((o, i) => o.style.display = i < n ? '' : 'none');
      ansHint.textContent = { choice: '填正確選項編號 1–4', image: '填正確選項編號 1–4（記得放圖片）', truefalse: '填 O（對）或 X（錯）', order: '選項照正確順序填時，留空即可；或填 3,1,4,2', number: '填數字' }[t];
    };
    type.onchange = sync; sync();
    const close = modal(h('div', { style: 'width:820px' },
      h('h2', null, q ? '編輯題目' : '新增題目'),
      h('div', { class: 'form-grid' },
        h('label', null, '題型'), type, h('label', null, '題目'), question, h('label', null, '選項'), optRow,
        h('label', null, '答案'), h('span', { class: 'row' }, answer, ansHint), h('label', null, '難度'), diff,
        h('label', null, '科目'), subject, h('label', null, '詳解'), explain,
        h('label', null, '圖片'), h('span', { class: 'row wrap' }, image, file, imgInfo)),
      err,
      h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:12px' },
        h('button', { class: 'btn gray', onclick: () => close() }, '取消'),
        h('button', { class: 'btn green', onclick: async () => {
          const t = type.value, n = t === 'choice' || t === 'image' ? 4 : t === 'order' ? 6 : 0;
          const raw = { type: t, question: question.value, options: opts.slice(0, n).map(o => o.value), answer: answer.value, difficulty: diff.value, subject: subject.value, explain: explain.value, image: imgData || image.value };
          const { q: nq, errors } = normQuestion(raw);
          if (errors.length) { err.textContent = '⚠ ' + errors.join('；'); return; }
          nq.id = q ? q.id : newId(bank.bankId);
          if (q) bank.questions[bank.questions.indexOf(q)] = nq; else bank.questions.push(nq);
          await Store.putBank(bank); close(); toast('已儲存'); this.reload();
        } }, '儲存'))));
  },

  // ---------- 題庫組合 ----------
  render_combos() {
    const b = this.body;
    b.append(h('div', { class: 'row', style: 'margin-bottom:10px' }, h('button', { class: 'btn small green', onclick: () => this.comboForm(null) }, '＋ 新增組合'),
      h('span', { class: 'hint' }, '組合決定一場遊戲要從哪些題庫、用什麼比例出題。')));
    Data.combos.forEach(c => {
      const tot = c.items.reduce((s, it) => s + it.weight, 0) || 1;
      const short = [0, 1, 2, 3, 4].map(stageCfg).filter(st => Quiz.available(c, Data.map, st.diff) < st.count).map(st => st.name);
      b.append(h('div', { class: 'bank-card', style: 'margin-bottom:10px' },
        h('div', { class: 'row' }, h('h3', { style: 'flex:1' }, c.name),
          h('button', { class: 'btn small', onclick: () => this.comboForm(c) }, '編輯'),
          h('button', { class: 'btn small red', onclick: async () => { if (!confirm(`刪除組合「${c.name}」？（題庫本身不會被刪掉）`)) return; await Store.delCombo(c.id); this.reload(); } }, '刪除')),
        h('div', null, c.items.map(it => `${(Data.map[it.bankId] || { name: '（已刪除的題庫）' }).name} ${Math.round(it.weight / tot * 100)}%`).join('　／　') || '（沒有題庫）'),
        short.length ? h('div', { class: 'warn' }, '⚠ 這些學級題目不足，會重複出題：' + short.join('、')) : h('div', { class: 'hint' }, '✔ 升學大冒險五個學級的題目都夠用')));
    });
  },
  comboForm(c) {
    const name = h('input', { value: c ? c.name : '新的題庫組合', style: 'width:360px' });
    const rows = Data.banks.map(b => {
      const it = c && c.items.find(x => x.bankId === b.bankId);
      const chk = h('input', { type: 'checkbox', checked: !!it }), w = h('input', { type: 'number', value: it ? it.weight : 1, min: 0, style: 'width:80px' });
      return { b, chk, w, el: h('tr', null, h('td', null, chk), h('td', null, b.name), h('td', null, b.questions.length), h('td', null, w)) };
    });
    const close = modal(h('div', { style: 'width:720px' },
      h('h2', null, c ? '編輯題庫組合' : '新增題庫組合'),
      h('div', { class: 'row' }, '名稱', name),
      h('p', { class: 'hint' }, '勾選要用的題庫，「比重」決定出題比例，例如 40、30、30。全部填 1 就是平均。'),
      h('table', { class: 't' }, h('tr', null, h('th', null, '用'), h('th', null, '題庫'), h('th', null, '題數'), h('th', null, '比重')), rows.map(r => r.el)),
      h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:12px' },
        h('button', { class: 'btn small gray', onclick: () => rows.forEach(r => r.w.value = 1) }, '平均分配'),
        h('button', { class: 'btn gray', onclick: () => close() }, '取消'),
        h('button', { class: 'btn green', onclick: async () => {
          const items = rows.filter(r => r.chk.checked).map(r => ({ bankId: r.b.bankId, weight: Math.max(0, +r.w.value || 0) }));
          if (!items.length || !items.some(i => i.weight > 0)) { toast('至少要勾選一份題庫，而且比重要大於 0'); return; }
          await Store.putCombo({ id: c ? c.id : newId('combo'), name: name.value.trim() || '未命名組合', items });
          close(); toast('已儲存'); this.reload();
        } }, '儲存'))));
  },

  // ---------- 匯入／匯出 ----------
  render_import() {
    const b = this.body;
    const file = h('input', { type: 'file', multiple: true, accept: '.csv,.tsv,.txt,.json,.xlsx', style: 'display:none', onchange: () => this.handleFiles([...file.files]) });
    const drop = h('div', { class: 'drop' }, '把 Excel（.xlsx）、CSV 或 JSON 檔拖到這裡，或 ', h('button', { class: 'btn small', onclick: () => file.click() }, '選擇檔案'), file,
      h('div', { class: 'hint' }, 'Excel 一張工作表就是一份題庫，工作表名稱就是題庫名稱。'));
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); this.handleFiles([...e.dataTransfer.files]); });
    const ta = h('textarea', { rows: 6, style: 'width:100%', placeholder: '把 AI 網站產生的 JSON 或 CSV 文字整段貼在這裡（有 ``` 也沒關係）' });
    const nm = h('input', { placeholder: '題庫名稱（JSON 裡有 name 就不用填）', style: 'width:320px' });
    this.preview = h('div');
    b.append(
      h('h3', null, '1. 匯入檔案'), drop,
      h('h3', { style: 'margin-top:14px' }, '2. 或貼上文字'), ta,
      h('div', { class: 'row', style: 'margin:6px 0 14px' }, nm, h('button', { class: 'btn small yellow', onclick: () => this.parse(() => parseText(ta.value, nm.value.trim() || '貼上的題庫')) }, '檢查並預覽')),
      this.preview,
      h('h3', { style: 'margin-top:14px' }, '3. 範本與備份'),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn small', onclick: () => download('好學小學堂-題庫範本.csv', TEMPLATE_CSV, 'text/csv') }, '下載 Excel／CSV 範本'),
        h('button', { class: 'btn small green', onclick: () => this.exportAll() }, '匯出全部備份（JSON）'),
        h('span', { class: 'hint' }, '換電腦或清除瀏覽器資料前，先匯出備份；要還原時把備份檔拖進上面的框框。')));
  },
  async handleFiles(files) {
    this.preview.replaceChildren();
    for (const f of files) await this.parse(() => parseFile(f), true);
  },
  async parse(fn, append) {
    if (!append) this.preview.replaceChildren();
    let res;
    try { res = await fn(); } catch (e) { this.preview.append(h('p', { class: 'warn' }, '⚠ ' + e.message)); return; }
    if (res.backup) return this.previewBackup(res.backup);
    res.banks.forEach(d => this.previewDraft(d));
  },
  previewDraft(d) {
    const okRows = d.rows.filter(r => !r.errors.length), bad = d.rows.length - okRows.length;
    const name = h('input', { value: d.name, style: 'width:300px' });
    const mk = h('input', { type: 'checkbox', checked: true });
    const btn = h('button', { class: 'btn small green', disabled: !okRows.length, onclick: async () => {
      const exists = d.bankId && Data.map[d.bankId];
      if (exists && !confirm(`已經有 bankId 為「${d.bankId}」的題庫「${exists.name}」，要覆蓋它嗎？`)) return;
      const bankId = d.bankId || newId('bank');
      const bank = { bankId, name: name.value.trim() || d.name, author: d.author || '', version: 1, questions: okRows.map((r, i) => Object.assign({}, r.q, { id: r.q.id || bankId + '-' + String(i + 1).padStart(3, '0') })) };
      await Store.putBank(bank);
      if (mk.checked) await Store.putCombo({ id: 'combo-' + bankId, name: bank.name, items: [{ bankId, weight: 1 }] });
      btn.disabled = true; btn.textContent = '✔ 已匯入'; Sound.sfx('coin');
      toast(`已匯入「${bank.name}」${bank.questions.length} 題`); await Data.load();
    } }, `匯入 ${okRows.length} 題`);
    this.preview.append(h('div', { class: 'bank-card', style: 'margin:8px 0' },
      h('div', { class: 'row wrap' }, '題庫名稱', name, h('label', null, mk, ' 同時建立只含這份題庫的組合'), btn),
      h('div', { class: bad ? 'warn' : 'hint' }, `共 ${d.rows.length} 題：可以匯入 ${okRows.length} 題` + (bad ? `，有 ${bad} 列有問題（標紅色，不會匯入，請修正後再匯入一次）` : '，全部沒問題！')),
      h('div', { style: 'max-height:300px;overflow:auto;margin-top:6px' }, h('table', { class: 't' },
        h('tr', null, ['列', '題型', '題目', '答案', '難度', '問題'].map(t => h('th', null, t))),
        d.rows.map(r => h('tr', { class: r.errors.length ? 'err' : '' }, h('td', null, r.line), h('td', null, TYPE_NAME[r.q.type] || '?'), h('td', null, r.q.question),
          h('td', null, r.errors.length ? '' : ansText(r.q)), h('td', null, r.q.difficulty || ''), h('td', { class: 'why' }, r.errors.map(e => `第 ${r.line} 列${e}`).join('；'))))))));
  },
  previewBackup(data) {
    const nv = Object.keys(data.voices || {}).length;
    this.preview.append(h('div', { class: 'bank-card' },
      h('h3', null, '這是「好學小學堂」完整備份檔'),
      h('p', null, `${(data.banks || []).length} 份題庫、${(data.combos || []).length} 個組合、${nv} 段錄音（${data.exported || ''}）`),
      h('button', { class: 'btn green', onclick: async () => {
        if (!confirm('還原備份會覆蓋同一個 ID 的題庫、組合和錄音，確定嗎？')) return;
        for (const b of data.banks || []) await Store.putBank(b);
        for (const c of data.combos || []) await Store.putCombo(c);
        for (const [id, url] of Object.entries(data.voices || {})) { await Store.putVoice(id, await dataURLToBlob(url)); Sound.forget(id); }
        toast('備份已還原'); this.reload();
      } }, '還原這份備份')));
  },
  async exportAll() {
    const voices = {};
    for (const id of await Store.voiceIds()) { const b = await Store.getVoice(id); if (b) voices[id] = await blobToDataURL(b); }
    const data = { app: 'minguo-school', version: 1, exported: new Date().toLocaleString('zh-TW'), banks: Data.banks, combos: Data.combos, voices };
    const d = new Date(), stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    download(`好學小學堂-備份-${stamp}.json`, JSON.stringify(data), 'application/json');
  },

  // ---------- AI 出題提示詞 ----------
  render_ai() {
    const grade = h('select', null, ['國小低年級', '國小中年級', '國小高年級', '國中', '高中', '一般大人'].map(g => h('option', { selected: g === '國小高年級' }, g)));
    const subject = h('input', { value: '自然', style: 'width:140px' });
    const topic = h('input', { value: '五年級自然：太陽與天氣', style: 'width:360px' });
    const count = h('input', { type: 'number', value: 30, min: 5, max: 100, style: 'width:80px' });
    const types = [['choice', '四選一'], ['truefalse', '是非'], ['order', '排序'], ['number', '數字']].map(([v, t]) => ({ v, t, el: h('input', { type: 'checkbox', checked: true }) }));
    const fmt = h('select', null, h('option', { value: 'json' }, 'JSON（推薦，最不容易出錯）'), h('option', { value: 'csv' }, 'CSV（可以貼進 Excel 再修改）'));
    const ref = h('textarea', { rows: 8, style: 'width:100%', placeholder: '（選填）出題依據與要求；也可以把課文、講義或重點直接貼在這裡' });
    ref.value = AI_REF_DEFAULT;
    const out = h('textarea', { rows: 14, style: 'width:100%;font-size:15px', readonly: true });
    const make = () => out.value = buildAIPrompt({ grade: grade.value, subject: subject.value.trim(), topic: topic.value.trim(), count: +count.value || 30, types: types.filter(t => t.el.checked).map(t => t.v), format: fmt.value, ref: ref.value.trim() });
    [grade, subject, topic, count, fmt, ref, ...types.map(t => t.el)].forEach(el => el.addEventListener('input', make));
    make();
    this.body.append(
      h('p', null, '填好下面的資料，按「複製提示詞」，貼到 ChatGPT、Gemini、Claude 等 AI 網站。把 AI 回覆的文字整段複製，回到「匯入／匯出」貼上就能建立題庫。'),
      h('div', { class: 'form-grid' },
        h('label', null, '年級'), grade, h('label', null, '科目'), subject, h('label', null, '單元／主題'), topic,
        h('label', null, '題數'), count, h('label', null, '題型'), h('span', { class: 'row' }, types.map(t => h('label', null, t.el, t.t))),
        h('label', null, '輸出格式'), fmt, h('label', null, '參考資料'), ref),
      h('div', { class: 'row', style: 'margin:10px 0' },
        h('button', { class: 'btn yellow', onclick: async () => { try { await navigator.clipboard.writeText(out.value); toast('已複製提示詞！'); } catch (e) { out.select(); document.execCommand('copy'); toast('已複製提示詞！'); } } }, '📋 複製提示詞'),
        h('button', { class: 'btn', onclick: () => { this.tab = 'import'; this.render(); } }, '我拿到 AI 的回覆了 → 去匯入')),
      out);
  },

  // ---------- 錄音室 ----------
  async render_studio() {
    const recorded = new Set(await Store.voiceIds());
    this.body.append(h('p', null, '每一句台詞都可以用自己的聲音重新錄製，錄好的聲音會取代預設語音（存在這台電腦的瀏覽器裡，匯出備份時會一起帶走）。'));
    const tbl = h('table', { class: 't' }, h('tr', null, ['編號', '角色', '台詞', '預設', '我的錄音'].map(t => h('th', null, t))));
    LINES_DEF.lines.forEach(l => {
      const cell = h('td', { style: 'white-space:nowrap' });
      const draw = () => {
        cell.replaceChildren();
        const rec = h('button', { class: 'btn small red', onclick: () => this.record(l.id, rec, draw) }, '● 錄音');
        cell.append(rec);
        if (recorded.has(l.id)) cell.append(' ',
          h('button', { class: 'btn small green', onclick: async () => Sound.previewBlob(await Store.getVoice(l.id)) }, '▶'), ' ',
          h('button', { class: 'btn small gray', onclick: async () => { await Store.delVoice(l.id); Sound.forget(l.id); recorded.delete(l.id); draw(); } }, '刪除'));
      };
      draw();
      tbl.append(h('tr', null, h('td', null, l.id), h('td', null, LINES_DEF.speakers[l.speaker].name), h('td', null, l.text),
        h('td', null, VOICE_DATA[l.id] ? h('button', { class: 'btn small', onclick: () => Sound.previewBlob(new Blob([Uint8Array.from(atob(VOICE_DATA[l.id]), ch => ch.charCodeAt(0))], { type: 'audio/mpeg' })) }, '▶') : '—'),
        cell));
      cell._recorded = recorded;
    });
    this.body.append(tbl);
    this.recorded = recorded;
  },
  async record(id, btn, redraw) {
    if (this.rec) { this.rec.stop(); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { toast('沒辦法使用麥克風：請允許瀏覽器使用麥克風'); return; }
    const chunks = [], mr = new MediaRecorder(stream);
    this.rec = mr;
    mr.ondataavailable = e => chunks.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach(t => t.stop()); this.rec = null;
      const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
      await Store.putVoice(id, blob); Sound.forget(id); this.recorded.add(id);
      toast('錄好了！'); redraw();
    };
    mr.start(); btn.textContent = '■ 停止'; btn.classList.remove('red'); btn.classList.add('yellow');
  },
  exit() { if (this.rec) this.rec.stop(); },

  // ---------- 老師密碼 ----------
  render_lock() {
    const inp = h('input', { class: 'pwd', type: 'password', maxlength: 4, inputmode: 'numeric' });
    const has = !!Settings.get().password;
    this.body.append(h('div', { style: 'text-align:center;margin-top:40px' },
      h('h2', null, has ? '目前已設定老師密碼' : '目前沒有設定老師密碼'),
      h('p', null, '設定四位數密碼後，進入題庫管理要先輸入密碼，避免學生偷看答案或改題目。'),
      inp,
      h('div', { class: 'row', style: 'justify-content:center;margin-top:14px' },
        h('button', { class: 'btn green', onclick: () => { if (!/^\d{4}$/.test(inp.value)) { toast('請輸入四位數字'); return; } Settings.set({ password: inp.value }); mgrUnlocked = true; toast('密碼已設定，請記好喔！'); this.render(); } }, '設定密碼'),
        has ? h('button', { class: 'btn red', onclick: () => { Settings.set({ password: '' }); toast('已取消密碼'); this.render(); } }, '取消密碼') : null)));
  }
};

function stripBank(b) { const { builtin, ...rest } = b; return rest; }
function shrinkImage(file, max = 480) {
  return new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      res(c.toDataURL(/png|gif/.test(file.type) ? 'image/png' : 'image/jpeg', 0.85));
    };
    img.onerror = rej; img.src = url;
  });
}

// 「AI 出題」頁的「參考資料」預設內容：請 AI 依上傳文件分析知識點，再依不同思考層次出題
const AI_REF_DEFAULT = `請以我上傳的文件（課文、講義或學習單）作為出題範圍，依照下面步驟出題：
1. 先仔細閱讀文件，條列出文件中所有的知識點，並標出哪些是學生必須學會的核心概念。
2. 依照核心知識點出題，每個核心知識點至少出 1 題，越重要的知識點出越多題；不要出文件裡沒有教的內容。
3. 不要只考背誦，題目要涵蓋不同的思考層次：
   ・記憶：名詞、事實、定義
   ・理解：用自己的話解釋、比較異同、找出原因
   ・應用：放進生活情境、計算、解決問題
   ・分析：推理判斷、找出因果關係、辨認錯誤說法
4. 上面指定的每一種題型都要用到，難度 1～5 平均分配，應用和分析的題目放在難度 3～5。
5. 錯誤選項要合理、是學生常見的迷思，不要一眼就能看出答案。
6. 請先在程式碼區塊外面列出知識點清單，再輸出題庫。`;

// AI 出題用的提示詞（README 裡也有同樣的範本）
function buildAIPrompt({ grade, subject, topic, count, types, format, ref }) {
  const tn = { choice: '四選一', truefalse: '是非題', order: '排序題', number: '數字題（答案是一個數字）' };
  const mix = types.length <= 1 ? `全部都是${tn[types[0] || 'choice']}` : `以四選一為主（約七成），其餘平均分給：${types.filter(t => t !== 'choice').map(t => tn[t]).join('、')}`;
  const common = `你是一位很會出題的台灣${grade}${subject}老師。請幫我為「問答闖關遊戲」出一份題庫。

【主題／單元】${topic || subject}
【題數】${count} 題
【難度】1（最簡單）到 5（最難），每個難度的題數盡量平均
【題型】${mix}
${ref ? `【出題依據與要求】\n${ref}\n` : ''}
出題規則：
1. 一律使用繁體中文與台灣用語。
2. 題目 40 字以內，選項 15 字以內，因為要寫在黑板上。
3. 內容必須正確、適合${grade}，答案只能有一個，不要出有爭議的題目。
4. 每題都要有一句 30 字以內的詳解，說明為什麼。
5. 四選一的正確答案位置要平均分散在 1、2、3、4。
`;
  if (format === 'csv') return common + `
題庫請用 CSV 格式，全部放在「同一個」程式碼區塊中，區塊裡只能有 CSV（知識點清單等說明請寫在程式碼區塊外面）。第一列是標題列，欄位如下：
題型,題目,選項1,選項2,選項3,選項4,答案,難度,科目,詳解

欄位填法：
- 題型：四選一、是非、排序、數字 其中一個
- 四選一：選項1～4 都要填，答案填正確選項的編號 1～4
- 是非：選項留空，答案填 O（對）或 X（錯）
- 排序：選項1～4 依「正確順序」填寫，答案填 1,2,3,4（遊戲會自動打亂）
- 數字：選項留空，答案只填阿拉伯數字
- 難度：1～5；科目：填「${subject}」
- 如果某一格裡有逗號，整格要用英文雙引號包起來

範例：
題型,題目,選項1,選項2,選項3,選項4,答案,難度,科目,詳解
四選一,台灣最高的山是？,雪山,玉山,合歡山,阿里山,2,1,社會,玉山主峰約 3952 公尺
是非,鯨魚是魚類。,,,,,X,1,自然,鯨魚是哺乳類
排序,依照青蛙的成長順序排好,卵,蝌蚪,長出腳的蝌蚪,青蛙,"1,2,3,4",2,自然,青蛙會經過變態
數字,12 × 12 = ?,,,,,144,2,數學,12 個 12 是 144
`;
  return common + `
題庫請用下面格式的 JSON，全部放在「同一個」程式碼區塊中，區塊裡只能有 JSON（知識點清單等說明請寫在程式碼區塊外面）：
{
  "name": "${topic || subject}",
  "author": "AI 出題",
  "questions": [
    {"type": "choice", "question": "台灣最高的山是？", "options": ["雪山", "玉山", "合歡山", "阿里山"], "answer": 2, "difficulty": 1, "subject": "${subject}", "explain": "玉山主峰約 3952 公尺。"},
    {"type": "truefalse", "question": "鯨魚是魚類。", "answer": "X", "difficulty": 1, "subject": "${subject}", "explain": "鯨魚是哺乳類，用肺呼吸。"},
    {"type": "order", "question": "依照青蛙的成長順序排好", "options": ["卵", "蝌蚪", "長出腳的蝌蚪", "青蛙"], "answer": "1,2,3,4", "difficulty": 2, "subject": "${subject}", "explain": "青蛙會經過變態才長大。"},
    {"type": "number", "question": "12 × 12 = ?", "answer": 144, "difficulty": 2, "subject": "${subject}", "explain": "12 個 12 是 144。"}
  ]
}

欄位說明：
- type：choice（四選一）、truefalse（是非）、order（排序）、number（數字）
- choice：options 一定要 4 個，answer 填正確選項的編號 1～4
- truefalse：不用 options，answer 填 "O"（對）或 "X"（錯）
- order：options 依「正確順序」寫 2～6 個，answer 填 "1,2,3,4"（遊戲會自動打亂）
- number：不用 options，answer 只填數字
- difficulty：1～5 的整數
（上面四題只是格式範例，請不要放進題庫）
`;
}

// ==========================================================
// 設定
// ==========================================================
Scenes.settings = {
  enter(arg = {}) {
    this.back = arg.back || 'modes';
    Sound.playMusic('shop');
    const s = Settings.get();
    const slider = (key, label, test) => {
      const r = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s[key], oninput: () => { Settings.set({ [key]: +r.value }); Sound.applyVolumes(); }, onchange: test });
      return h('div', { class: 'set-row' }, h('span', { style: 'width:120px' }, label), r);
    };
    const toggle = (key, label, hint) => {
      const c = h('input', { type: 'checkbox', checked: !!s[key], onchange: () => { Settings.set({ [key]: c.checked }); applyLook(); Sound.applyVolumes(); } });
      return h('div', { class: 'set-row' }, h('label', null, c, ' ', label), hint ? h('span', { class: 'hint' }, hint) : null);
    };
    const tts = Sound.hasTTS();
    const stageRows = DEFAULT_STAGES.map((d, i) => {
      const st = stageCfg(i);
      const inp = (k, min, max) => h('input', { type: 'number', value: st[k], min, max, style: 'width:80px', onchange: e => { const all = Settings.get().stages.map(x => Object.assign({}, x)); all[i][k] = Math.max(min, Math.min(max, +e.target.value || st[k])); Settings.set({ stages: all }); } });
      return h('tr', null, h('td', null, d.name), h('td', null, inp('count', 1, 50)), h('td', null, inp('sec', 3, 120)), h('td', null, inp('pass', 0, 100)), h('td', null, d.diff.join('–')));
    });
    ui.append(h('div', { class: 'panel mgr' },
      h('div', { class: 'tabs' }, h('h1', { style: 'flex:1;margin:0' }, '⚙ 設定'), h('button', { class: 'btn small gray', onclick: () => go(this.back) }, '返回')),
      h('div', { class: 'body' },
        h('h3', null, '聲音'),
        slider('volMusic', '背景音樂', () => Sound.playMusic('shop')),
        slider('volVoice', '語音', () => Sound.say('V05a')),
        slider('volSfx', '音效', () => Sound.sfx('correct')),
        toggle('readQuestion', '讀題（用瀏覽器內建語音朗讀題目）', tts ? '✔ 這台電腦有中文語音' : '⚠ 這台電腦沒有中文語音，只會顯示字幕；角色台詞仍然有聲音'),
        toggle('loud', '大聲公模式', '語音音量加大，適合接喇叭在教室使用'),
        h('h3', null, '畫面'),
        toggle('bigText', '大字模式', '題目和選項字放大'),
        toggle('noFlash', '關閉閃爍特效', '照顧小朋友的眼睛'),
        h('h3', null, '升學大冒險：各學級設定'),
        h('table', { class: 't', style: 'width:auto' }, h('tr', null, ['學級', '題數', '每題秒數', '及格線', '出題難度'].map(t => h('th', null, t))), stageRows),
        h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'btn small gray', onclick: () => { Settings.resetStages(); go('settings', { back: this.back }); } }, '還原預設值')),
        LOCAL_DATA.hideManager ? null : h('p', { class: 'hint' }, '老師密碼在「題庫管理 → 老師密碼」設定。'))));
  },
  key(e) { if (e.key === 'Escape') go(this.back); },
  draw(c, t) { Art.bulletin(c, t); }
};

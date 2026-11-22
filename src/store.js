// ===== store.js：設定、IndexedDB、題庫匯入匯出與驗證 =====
const DEFAULT_STAGES = [
  { key: 'kinder', name: '幼稚園', count: 5, sec: 15, pass: 60, diff: [1, 1] },
  { key: 'elem', name: '國小', count: 8, sec: 15, pass: 60, diff: [1, 2] },
  { key: 'junior', name: '國中', count: 10, sec: 12, pass: 60, diff: [2, 3] },
  { key: 'senior', name: '高中', count: 10, sec: 12, pass: 70, diff: [3, 4] },
  { key: 'univ', name: '大學', count: 12, sec: 10, pass: 70, diff: [4, 5] }
];

const Settings = (() => {
  const KEY = 'mg-settings';
  const DEF = { volMusic: 0.6, volVoice: 0.9, volSfx: 0.7, readQuestion: true, bigText: false, noFlash: false, loud: false, password: '', stages: DEFAULT_STAGES };
  let s;
  try { s = Object.assign({}, DEF, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { s = Object.assign({}, DEF); }
  if (!Array.isArray(s.stages) || s.stages.length !== 5) s.stages = DEF.stages;
  return {
    get: () => s,
    set(patch) { Object.assign(s, patch); try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { } },
    resetStages() { this.set({ stages: JSON.parse(JSON.stringify(DEFAULT_STAGES)) }); }
  };
})();

const Rank = {
  key: id => 'mg-rank-' + id,
  list(id) { try { return JSON.parse(localStorage.getItem(this.key(id)) || '[]'); } catch (e) { return []; } },
  add(id, entry) {
    const l = this.list(id); l.push(entry); l.sort((a, b) => b.score - a.score);
    const top = l.slice(0, 10);
    try { localStorage.setItem(this.key(id), JSON.stringify(top)); } catch (e) { }
    return top;
  }
};

// ---------- IndexedDB（失敗時退回記憶體，至少能玩）----------
const Store = (() => {
  let dbp = null; const mem = { banks: new Map(), combos: new Map(), voices: new Map() };
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(res => {
      try {
        const r = indexedDB.open('minguo-school', 1);
        r.onupgradeneeded = () => {
          const d = r.result;
          d.createObjectStore('banks', { keyPath: 'bankId' });
          d.createObjectStore('combos', { keyPath: 'id' });
          d.createObjectStore('voices');
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => res(null);
      } catch (e) { res(null); }
    });
    return dbp;
  }
  async function op(store, mode, fn) {
    const d = await db();
    if (!d) return fn(null, mem[store]);
    return new Promise((res, rej) => {
      const tx = d.transaction(store, mode), os = tx.objectStore(store);
      const req = fn(os);
      tx.oncomplete = () => res(req && 'result' in req ? req.result : undefined);
      tx.onerror = () => rej(tx.error);
    });
  }
  const memAll = m => [...m.values()];
  return {
    allBanks: () => op('banks', 'readonly', (os, m) => os ? os.getAll() : { result: memAll(m) }),
    putBank: b => op('banks', 'readwrite', (os, m) => os ? os.put(b) : m.set(b.bankId, b)),
    delBank: id => op('banks', 'readwrite', (os, m) => os ? os.delete(id) : m.delete(id)),
    allCombos: () => op('combos', 'readonly', (os, m) => os ? os.getAll() : { result: memAll(m) }),
    putCombo: c => op('combos', 'readwrite', (os, m) => os ? os.put(c) : m.set(c.id, c)),
    delCombo: id => op('combos', 'readwrite', (os, m) => os ? os.delete(id) : m.delete(id)),
    getVoice: id => op('voices', 'readonly', (os, m) => os ? os.get(id) : { result: m.get(id) }),
    putVoice: (id, blob) => op('voices', 'readwrite', (os, m) => os ? os.put(blob, id) : m.set(id, blob)),
    delVoice: id => op('voices', 'readwrite', (os, m) => os ? os.delete(id) : m.delete(id)),
    voiceIds: () => op('voices', 'readonly', (os, m) => os ? os.getAllKeys() : { result: [...m.keys()] })
  };
})();

// ---------- 題目驗證與正規化 ----------
const TYPE_MAP = {
  '四選一': 'choice', '選擇': 'choice', '選擇題': 'choice', '單選': 'choice', '單選題': 'choice', choice: 'choice',
  '是非': 'truefalse', '是非題': 'truefalse', truefalse: 'truefalse', tf: 'truefalse',
  '排序': 'order', '排序題': 'order', order: 'order',
  '看圖': 'image', '看圖題': 'image', image: 'image',
  '數字': 'number', '數字題': 'number', number: 'number', '填數字': 'number'
};
const TYPE_NAME = { choice: '四選一', truefalse: '是非', order: '排序', image: '看圖', number: '數字' };

function safeImage(u) { u = String(u || '').trim(); return /^(https?:\/\/|data:image\/)/i.test(u) ? u : ''; }

function normQuestion(raw) {
  const errors = [];
  const str = v => v == null ? '' : String(v).trim();
  const type = TYPE_MAP[str(raw.type).toLowerCase()] || TYPE_MAP[str(raw.type)];
  if (!type) errors.push(`題型「${str(raw.type) || '空白'}」看不懂，請填 四選一／是非／排序／看圖／數字`);
  const question = str(raw.question);
  if (!question) errors.push('題目是空的');
  let options = (Array.isArray(raw.options) ? raw.options : []).map(str).filter(x => x !== '');
  let answer = raw.answer;
  const ans = str(answer);
  if (type === 'choice' || type === 'image') {
    if (options.length !== 4) errors.push(`四選一要剛好 4 個選項（現在 ${options.length} 個）`);
    let n = NaN;
    if (/^[A-Da-d]$/.test(ans)) n = 'ABCD'.indexOf(ans.toUpperCase()) + 1;
    else if (/^\d+$/.test(ans)) n = +ans;
    else if (options.includes(ans)) n = options.indexOf(ans) + 1;
    if (!(n >= 1 && n <= 4)) errors.push(`答案「${ans}」不在 1–4`);
    answer = n;
    if (type === 'image' && !safeImage(raw.image)) errors.push('看圖題需要圖片網址或內嵌圖片');
  } else if (type === 'truefalse') {
    const m = { o: 'O', '○': 'O', '〇': 'O', true: 'O', t: 'O', '是': 'O', '對': 'O', '正確': 'O', x: 'X', '✕': 'X', '×': 'X', '✗': 'X', false: 'X', f: 'X', '否': 'X', '錯': 'X', '錯誤': 'X' };
    answer = m[ans.toLowerCase()] || m[ans];
    if (!answer) errors.push(`是非題答案要填 O 或 X（現在是「${ans}」）`);
    options = [];
  } else if (type === 'order') {
    if (options.length < 2 || options.length > 6) errors.push(`排序題要有 2–6 個選項（現在 ${options.length} 個）`);
    const seq = ans ? ans.split(/[\s,，、>＞→-]+/).filter(Boolean).map(x => /^[A-Fa-f]$/.test(x) ? 'ABCDEF'.indexOf(x.toUpperCase()) + 1 : parseInt(x, 10)) : options.map((_, i) => i + 1);
    const ok = seq.length === options.length && [...seq].sort((a, b) => a - b).every((v, i) => v === i + 1);
    if (!ok) errors.push(`排序答案「${ans}」要把 1 到 ${options.length} 各寫一次，例如 3,1,4,2`);
    answer = seq.join(',');
  } else if (type === 'number') {
    const v = parseFloat(ans.replace(/,/g, ''));
    if (!isFinite(v)) errors.push(`數字題答案「${ans}」不是數字`);
    answer = v; options = [];
  }
  const difficulty = parseInt(raw.difficulty, 10);
  if (!(difficulty >= 1 && difficulty <= 5)) errors.push(`難度「${str(raw.difficulty)}」要是 1–5`);
  const q = { type, question, options, answer, difficulty, subject: str(raw.subject), explain: str(raw.explain) };
  const img = safeImage(raw.image); if (img) q.image = img;
  const voice = str(raw.voice); if (/^(https?:|data:audio\/)/i.test(voice)) q.voice = voice;
  if (raw.id) q.id = str(raw.id);
  return { q, errors };
}

// ---------- CSV / 表格 ----------
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const delim = (first.split('\t').length > first.split(',').length) ? '\t' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"' && cell === '') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}
const HEADER_MAP = {
  '題型': 'type', 'type': 'type', '題目': 'question', 'question': 'question', '答案': 'answer', 'answer': 'answer',
  '難度': 'difficulty', 'difficulty': 'difficulty', '科目': 'subject', 'subject': 'subject', '詳解': 'explain', '解析': 'explain', 'explain': 'explain',
  '圖片': 'image', 'image': 'image', '語音': 'voice', 'voice': 'voice'
};
// 二維表格 → 題目列
function rowsToRaw(rows) {
  if (!rows.length) return [];
  let head = rows[0].map(h => String(h).trim().toLowerCase());
  let start = 1;
  if (!head.some(h => HEADER_MAP[h] === 'question')) { head = ['題型', '題目', '選項1', '選項2', '選項3', '選項4', '答案', '難度', '科目', '詳解']; start = 0; }
  return rows.slice(start).map((r, k) => {
    const o = { options: [], _line: k + start + 1 };
    head.forEach((h, i) => {
      const v = r[i] == null ? '' : String(r[i]);
      const m = /^(選項|option)\s*(\d)$/.exec(h);
      if (m) o.options[+m[2] - 1] = v;
      else if (HEADER_MAP[h]) o[HEADER_MAP[h]] = v;
    });
    o.options = o.options.map(x => x == null ? '' : x);
    return o;
  });
}

// ---------- 極簡 .xlsx 讀取（瀏覽器內建解壓縮，不需外部函式庫）----------
async function readXlsx(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('不是有效的 .xlsx 檔');
  const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const files = {}, dec = new TextDecoder();
  for (let k = 0; k < n; k++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    files[name] = { method, csize, lo };
    p += 46 + nl + el + cl;
  }
  async function read(name) {
    const f = files[name]; if (!f) return null;
    const start = f.lo + 30 + dv.getUint16(f.lo + 26, true) + dv.getUint16(f.lo + 28, true);
    const data = u8.subarray(start, start + f.csize);
    if (f.method === 0) return dec.decode(data);
    if (!('DecompressionStream' in window)) throw new Error('這個瀏覽器不支援讀取 Excel，請另存成 CSV 再匯入');
    const ds = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return await new Response(ds).text();
  }
  const xml = s => new DOMParser().parseFromString(s, 'application/xml');
  const wb = xml(await read('xl/workbook.xml'));
  const rels = xml(await read('xl/_rels/workbook.xml.rels'));
  const relMap = {};
  [...rels.getElementsByTagName('Relationship')].forEach(r => relMap[r.getAttribute('Id')] = r.getAttribute('Target'));
  const ssText = await read('xl/sharedStrings.xml');
  const ss = ssText ? [...xml(ssText).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
  const colIdx = ref => { const L = ref.replace(/\d+/g, ''); let v = 0; for (const ch of L) v = v * 26 + ch.charCodeAt(0) - 64; return v - 1; };
  const sheets = [];
  for (const s of wb.getElementsByTagName('sheet')) {
    let target = relMap[s.getAttribute('r:id')] || '';
    target = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
    const sx = await read(target); if (!sx) continue;
    const rows = [];
    for (const r of xml(sx).getElementsByTagName('row')) {
      const row = [];
      for (const c of r.getElementsByTagName('c')) {
        const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0];
        let val = '';
        if (t === 's') val = ss[+(v && v.textContent)] || '';
        else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
        else val = v ? v.textContent : '';
        row[colIdx(c.getAttribute('r'))] = val;
      }
      rows.push([...row].map(x => x == null ? '' : x));
    }
    sheets.push({ name: s.getAttribute('name'), rows: rows.filter(r => r.some(x => String(x).trim())) });
  }
  return sheets;
}

// ---------- 匯入：把文字或檔案轉成「待匯入題庫」草稿 ----------
// 回傳 { banks: [{name, author, rows:[{q, errors, line}]}], backup?: {...} }
function draftFromRaw(name, raws, meta = {}) {
  return { name: name || '未命名題庫', author: meta.author || '', bankId: meta.bankId || '', rows: raws.map((r, i) => Object.assign(normQuestion(r), { line: r._line || i + 1 })) };
}
function parseText(text, fallbackName) {
  text = String(text).replace(/^﻿/, '').trim();
  // AI 常把結果包在 ``` 程式碼區塊裡，先拿掉
  if (/```/.test(text)) { const m = text.match(/```[a-zA-Z]*\s*\n([\s\S]*?)```/g); if (m) text = m.map(b => b.replace(/^```[a-zA-Z]*\s*\n/, '').replace(/```$/, '')).join('\n').trim(); }
  if (/^[\[{]/.test(text)) {
    let data;
    try { data = JSON.parse(text); } catch (e) {
      try { data = JSON.parse(text.replace(/,\s*([\]}])/g, '$1')); } catch (e2) { throw new Error('JSON 格式有錯：' + e.message); }
    }
    if (data && data.app === 'minguo-school') return { banks: [], backup: data };
    const list = Array.isArray(data) ? data : [data];
    if (list.length && list[0] && Array.isArray(list[0].questions)) {
      return { banks: list.map(b => draftFromRaw(b.name || fallbackName, b.questions, b)) };
    }
    return { banks: [draftFromRaw(fallbackName, list)] };
  }
  return { banks: [draftFromRaw(fallbackName, rowsToRaw(parseCSV(text)))] };
}
async function parseFile(file) {
  const base = file.name.replace(/\.[^.]+$/, '');
  if (/\.xlsx$/i.test(file.name)) {
    const sheets = await readXlsx(await file.arrayBuffer());
    return { banks: sheets.map(s => draftFromRaw(s.name, rowsToRaw(s.rows))) };
  }
  if (/\.xls$/i.test(file.name)) throw new Error('舊版 .xls 無法讀取，請在 Excel 另存為 .xlsx 或 CSV');
  return parseText(await file.text(), base);
}

// ---------- 匯出 ----------
function download(name, data, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name; document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const blobToDataURL = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
const dataURLToBlob = async u => (await fetch(u)).blob();

function csvCell(v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function bankToCSV(bank) {
  const head = ['題型', '題目', '選項1', '選項2', '選項3', '選項4', '選項5', '選項6', '答案', '難度', '科目', '詳解', '圖片'];
  const lines = [head.join(',')];
  bank.questions.forEach(q => {
    const o = q.options || [];
    lines.push([TYPE_NAME[q.type], q.question, o[0], o[1], o[2], o[3], o[4], o[5], q.type === 'truefalse' ? q.answer : q.answer, q.difficulty, q.subject, q.explain, q.image && !q.image.startsWith('data:') ? q.image : ''].map(csvCell).join(','));
  });
  return '﻿' + lines.join('\r\n');
}
const TEMPLATE_CSV = '﻿題型,題目,選項1,選項2,選項3,選項4,答案,難度,科目,詳解,圖片\r\n'
  + '四選一,台灣最高的山是？,玉山,雪山,合歡山,阿里山,1,1,社會,玉山主峰約 3952 公尺,\r\n'
  + '是非,鯨魚是魚類。,,,,,X,1,自然,鯨魚是哺乳類,\r\n'
  + '數字,12 × 12 = ?,,,,,144,2,數學,,\r\n'
  + '排序,把數字由小到大排好,9,2,7,4,"2,4,3,1",2,數學,2→4→7→9,\r\n'
  + '看圖,這是什麼？,貓,狗,鳥,魚,3,1,自然,,https://example.com/bird.png\r\n';

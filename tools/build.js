// 把 src/ 的程式、圖片、語音、題庫/ 資料夾的題庫打包成單一 HTML 檔：「好學小學堂＋第一個題庫名稱（學生版／教師版）.html」
// 用法：node tools/build.js                 （只放 題庫/ 資料夾裡的題庫；會詢問是否隱藏「題庫管理」）
//       node tools/build.js --student       （學生版：隱藏題庫管理，不詢問）
//       node tools/build.js --teacher       （教師版：保留題庫管理，不詢問）
//       node tools/build.js --with-samples  （另外加入 180 題範例題庫，可與上面合用）
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const R = p => path.join(__dirname, '..', p);
const read = p => fs.readFileSync(R(p), 'utf8');
const useSamples = process.argv.includes('--with-samples');

// ---------- 語音 ----------
const lines = JSON.parse(read('src/lines.json'));
const voices = {};
for (const l of lines.lines) {
  const f = R('tools/voices/' + l.id + '.mp3');
  if (fs.existsSync(f) && fs.statSync(f).size > 0) voices[l.id] = fs.readFileSync(f).toString('base64');
  else console.warn('缺少語音：', l.id);
}

// ---------- 圖片（tools/images/*.webp，由 tools/process_images.py 產生）----------
const images = {};
for (const f of fs.readdirSync(R('tools/images')).filter(f => f.endsWith('.webp')).sort())
  images[f.replace(/\.webp$/, '')] = 'data:image/webp;base64,' + fs.readFileSync(R('tools/images/' + f)).toString('base64');
if (!Object.keys(images).length) console.warn('⚠ tools/images/ 裡沒有圖片，畫面會缺少角色與背景');

// ---------- 題庫/ 資料夾 ----------
// 借用遊戲本身的匯入與驗證程式（src/store.js），確保打包和在遊戲裡匯入的規則完全一樣
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(read('src/store.js'), sandbox);
const { parseText, normQuestion } = vm.runInContext('({ parseText, normQuestion })', sandbox);

function fail(msg) { console.error('\n✘ 打包失敗：' + msg + '\n'); process.exit(1); }

// 題庫/ 的規則：
// - 直接放在 題庫/ 的每個檔案 → 一個題庫，並自動建立一個同名組合
// - 題庫/ 裡的每個子資料夾 → 資料夾裡的檔案各是一個題庫，但只建立「一個」以資料夾為名的組合，各題庫平均出題
// - 開頭是 _ 的檔案或資料夾不會打包
const BANK_DIR = R('題庫');
const BANK_RE = /\.(json|csv|tsv|txt)$/i;
const localBanks = [], localCombos = [];
let comboConfig = null, problems = 0;
const entries = dir => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter(e => !e.name.startsWith('_')).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')) : [];

// 讀一個題庫檔；group 是所在子資料夾名稱（直接放在 題庫/ 的是 null）
function loadFile(rel, group) {
  const fname = path.basename(rel), base = fname.replace(/\.[^.]+$/, '');
  const text = fs.readFileSync(path.join(BANK_DIR, rel), 'utf8');
  // 長得像組合設定（[{ name, banks }]）但檔名不是「組合.json」：給清楚的提示，不當成題庫
  try {
    const j = JSON.parse(text.replace(/^﻿/, ''));
    if (Array.isArray(j) && j.length && j.every(x => x && x.banks)) {
      console.warn(`⚠ 題庫/${rel} 看起來是組合設定檔，但只有檔名剛好是「組合.json」、而且直接放在 題庫/ 底下才會被讀取，這個檔案略過`);
      return;
    }
  } catch (e) { /* 不是純 JSON，交給下面的 parseText 判斷 */ }
  let res;
  try { res = parseText(text, base); } catch (e) { fail(`題庫/${rel}：${e.message}`); }
  if (res.backup) { // 遊戲匯出的完整備份檔
    for (const b of res.backup.banks || []) {
      const qs = [];
      b.questions.forEach((q, i) => { const r = normQuestion(q); if (r.errors.length) { problems++; console.warn(`⚠ 題庫/${rel}「${b.name}」第 ${i + 1} 題：${r.errors.join('；')}`); } else qs.push(Object.assign(r.q, { id: q.id || b.bankId + '-' + (i + 1) })); });
      localBanks.push({ bankId: b.bankId, name: b.name, author: b.author || '', version: 1, questions: qs, base, group });
    }
    if (!group) for (const c of res.backup.combos || []) localCombos.push(c);
    if (Object.keys(res.backup.voices || {}).length) console.warn(`⚠ 題庫/${rel} 裡的自錄語音不會打包（錄音請在遊戲的錄音室錄，或用備份檔還原）。`);
    return;
  }
  res.banks.forEach((d, k) => {
    const bankId = d.bankId || 'local-' + (group ? group + '-' : '') + base + (res.banks.length > 1 ? '-' + (k + 1) : '');
    const qs = [];
    d.rows.forEach((r, i) => {
      if (r.errors.length) { problems++; console.warn(`⚠ 題庫/${rel}「${d.name}」第 ${r.line} 列：${r.errors.join('；')}（這題略過）`); }
      else qs.push(Object.assign({}, r.q, { id: r.q.id || bankId + '-' + String(i + 1).padStart(3, '0') }));
    });
    if (!qs.length) { console.warn(`⚠ 題庫/${rel}「${d.name}」沒有可以用的題目，略過`); return; }
    localBanks.push({ bankId, name: d.name, author: d.author || '', version: 1, questions: qs, base, group });
  });
}

const groups = [];
for (const e of entries(BANK_DIR)) {
  if (e.isDirectory()) {
    groups.push(e.name);
    for (const s of entries(path.join(BANK_DIR, e.name))) {
      if (s.isDirectory()) console.warn(`⚠ 題庫/${e.name}/${s.name}/ 是第二層資料夾，不會讀取（子資料夾只能有一層）`);
      else if (BANK_RE.test(s.name)) loadFile(path.join(e.name, s.name), e.name);
      else if (/\.xlsx?$/i.test(s.name)) console.warn(`⚠ 題庫/${e.name}/${s.name} 是 Excel 檔，不會讀取，請另存成「CSV UTF-8」`);
    }
  } else if (e.name === '組合.json') {
    try { comboConfig = JSON.parse(fs.readFileSync(path.join(BANK_DIR, e.name), 'utf8').replace(/^﻿/, '')); } catch (err) { fail(`題庫/組合.json 不是正確的 JSON：${err.message}`); }
  } else if (BANK_RE.test(e.name)) loadFile(e.name, null);
  else if (/\.xlsx?$/i.test(e.name)) console.warn(`⚠ 題庫/${e.name} 是 Excel 檔，不會讀取，請另存成「CSV UTF-8」`);
}
const dup = localBanks.map(b => b.bankId).filter((id, i, a) => a.indexOf(id) !== i);
if (dup.length) fail(`有兩份題庫的 bankId 一樣：${[...new Set(dup)].join('、')}。請把其中一份 JSON 的 "bankId" 改成不同的英數字。`);

// 直接放在 題庫/ 的題庫：每份一個同名組合
for (const b of localBanks.filter(b => !b.group))
  if (!localCombos.some(c => c.items.length === 1 && c.items[0].bankId === b.bankId)) localCombos.push({ id: 'combo-' + b.bankId, name: b.name, items: [{ bankId: b.bankId, weight: 1 }] });
// 子資料夾：整個資料夾一個組合，裡面的題庫平均出題
for (const g of groups) {
  const members = localBanks.filter(b => b.group === g);
  if (!members.length) { console.warn(`⚠ 題庫/${g}/ 裡沒有可以用的題庫檔，略過`); continue; }
  localCombos.push({ id: 'local-group-' + g, name: g, items: members.map(b => ({ bankId: b.bankId, weight: 1 })) });
}
// 題庫/組合.json：自訂組合
if (comboConfig) {
  if (!Array.isArray(comboConfig)) fail('題庫/組合.json 最外層要是 [ ... ] 陣列');
  const find = key => localBanks.find(b => b.name === key || b.bankId === key || b.base === key);
  comboConfig.forEach((c, i) => {
    if (!c.name || !c.banks) fail(`題庫/組合.json 第 ${i + 1} 個組合要有 "name" 和 "banks"`);
    const entries = Array.isArray(c.banks) ? c.banks.map(k => [k, 1]) : Object.entries(c.banks);
    const items = entries.map(([k, w]) => {
      const b = find(k); if (!b) fail(`題庫/組合.json「${c.name}」找不到題庫「${k}」（請填題庫名稱或檔名）`);
      return { bankId: b.bankId, weight: Number(w) || 0 };
    });
    localCombos.push({ id: 'local-combo-' + c.name, name: c.name, items });
  });
}
localBanks.forEach(b => { delete b.base; delete b.group; });

if (!useSamples && !localBanks.length) fail('題庫/ 資料夾裡沒有任何題庫，遊戲會沒有題目可以玩。請先放入題庫檔；若只想打包內建範例題庫，請改用 node tools/build.js --with-samples');

// 要不要隱藏「題庫管理」：有指定參數就照參數；雙擊 打包.bat 時直接詢問；沒辦法詢問時預設學生版
async function askHideManager() {
  if (process.argv.includes('--student')) return true;
  if (process.argv.includes('--teacher')) return false;
  if (!process.stdin.isTTY) return true;
  const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  const ans = await new Promise(r => rl.question('\n要隱藏「題庫管理」嗎？輸出給學生練習用建議隱藏。\n  Y＝隱藏（學生版，直接按 Enter 也是）  N＝保留（教師版）：', r));
  rl.close();
  return !/^\s*n/i.test(ans);
}

(async () => {
const hideManager = await askHideManager();
const localData = { samples: useSamples, hideManager, banks: localBanks, combos: localCombos };
localData.version = crypto.createHash('sha1').update(JSON.stringify(localData) + read('src/banks.js')).digest('hex').slice(0, 12);

// ---------- 組成 HTML ----------
const js = ['store.js', 'art.js', 'audio.js', 'engine.js', 'banks.js', 'game.js', 'board.js', 'manager.js']
  .map(f => `// ---------- ${f} ----------\n` + read('src/' + f)).join('\n');
const safeJSON = o => JSON.stringify(o).replace(/<\//g, '<\\/');
if (/<\/script/i.test(js)) throw new Error('程式碼裡不能出現 </script>');

const html = read('src/template.html')
  .replace('/*CSS*/', () => read('src/style.css'))
  .replace('/*LINES*/', () => safeJSON(lines))
  .replace('/*VOICE_DATA*/', () => safeJSON(voices))
  .replace('/*LOCAL_DATA*/', () => safeJSON(localData))
  .replace('/*IMAGES*/', () => safeJSON(images))
  .replace('/*JS*/', () => js);
// 檔名：好學小學堂＋學生在選單裡看到的第一個題庫名稱（去掉檔名不能用的字元）
const firstName = (localCombos[0] || {}).name || (useSamples ? '範例題庫' : '');
const outName = ('好學小學堂' + firstName).replace(/[\\/:*?"<>|]/g, '_').trim() + (hideManager ? '（學生版）' : '（教師版）') + '.html';
fs.writeFileSync(R(outName), html);

console.log('\n內建題庫：');
if (useSamples) console.log('  ・範例題庫 6 份（180 題）');
localBanks.forEach(b => console.log(`  ・${b.name}（${b.questions.length} 題）`));
const nameOf = id => (localBanks.find(b => b.bankId === id) || { name: id }).name;
console.log('題庫組合（學生在遊戲裡選的）：' + [useSamples ? '範例組合 4 個' : '', ...localCombos.map(c => c.items.length > 1 ? `${c.name}（${c.items.map(it => nameOf(it.bankId)).join('＋')}）` : c.name)].filter(Boolean).join('、'));
if (!localBanks.length) console.log('（題庫/ 資料夾裡沒有題庫檔；檔名開頭是 _ 的範例檔不會被打包）');
if (problems) console.log(`\n⚠ 有 ${problems} 題格式有問題被略過，請看上面的訊息修正後再打包一次。`);
console.log(hideManager ? '版本：學生版（已隱藏「題庫管理」）' : '版本：教師版（保留「題庫管理」）');
console.log(`\n✔ ${outName} 完成：${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB，圖片 ${Object.keys(images).length} 張，語音 ${Object.keys(voices).length} 句，題庫版本 ${localData.version}\n`);
})();

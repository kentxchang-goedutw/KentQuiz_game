// ===== audio.js：Web Audio 三軌（音樂、語音、音效）＋ 字幕 ＋ 讀題 =====
const Sound = (() => {
  let ctx = null, master, bus = {}, duck = 1;
  const LINE_MAP = {};
  LINES_DEF.lines.forEach(l => LINE_MAP[l.id] = l);

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.connect(ctx.destination);
    ['music', 'voice', 'sfx'].forEach(k => { bus[k] = ctx.createGain(); bus[k].connect(master); });
    applyVolumes();
  }
  function applyVolumes() {
    if (!ctx) return;
    const s = Settings.get();
    const t = ctx.currentTime;
    bus.music.gain.setTargetAtTime(s.volMusic * 0.35 * duck, t, 0.08);
    bus.voice.gain.setTargetAtTime(s.volVoice * (s.loud ? 2.2 : 1.1), t, 0.02);
    bus.sfx.gain.setTargetAtTime(s.volSfx * 0.5, t, 0.02);
  }
  function setDuck(on) { duck = on ? 0.25 : 1; applyVolumes(); }

  // ---------- 合成器 ----------
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function freq(n) {
    const m = /^([A-G])([#b]?)(\d)$/.exec(n); if (!m) return 0;
    const semi = NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12;
    return 440 * Math.pow(2, (semi - 69) / 12);
  }
  function tone(f, start, dur, type = 'square', vol = 0.3, dest = 'sfx', slide = 0, bell = false) {
    if (!ctx || !f) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, start);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.008);
    if (bell) g.gain.exponentialRampToValueAtTime(0.0001, start + dur * 1.6);
    else { g.gain.setValueAtTime(vol, start + Math.max(0.01, dur * 0.7)); g.gain.exponentialRampToValueAtTime(0.0001, start + dur); }
    o.connect(g); g.connect(bus[dest]);
    o.start(start); o.stop(start + dur * (bell ? 1.7 : 1) + 0.02);
  }
  let noiseBuf = null;
  function noise(start, dur, vol = 0.3, filt = 2000, type = 'bandpass') {
    if (!ctx) return;
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = filt;
    g.gain.setValueAtTime(vol, start); g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    s.connect(f); f.connect(g); g.connect(bus.sfx); s.start(start); s.stop(start + dur + 0.02);
  }

  const SFX = {
    coin(t) { tone(988, t, 0.07, 'square', 0.25); tone(1319, t + 0.07, 0.25, 'square', 0.25); },
    move(t) { tone(660, t, 0.04, 'square', 0.15); },
    ok(t) { tone(784, t, 0.06, 'square', 0.2); tone(1175, t + 0.06, 0.12, 'square', 0.2); },
    cancel(t) { tone(440, t, 0.06, 'square', 0.2); tone(330, t + 0.06, 0.12, 'square', 0.2); },
    correct(t) { tone(1047, t, 0.25, 'sine', 0.45, 'sfx', 0, true); tone(784, t + 0.18, 0.5, 'sine', 0.45, 'sfx', 0, true); },
    wrong(t) { tone(180, t, 0.18, 'square', 0.3, 'sfx', 120); tone(150, t + 0.22, 0.3, 'square', 0.3, 'sfx', 90); },
    chalk(t) { noise(t, 0.05, 0.25, 3500); },
    tick(t) { tone(1800, t, 0.03, 'square', 0.15); noise(t, 0.03, 0.1, 6000, 'highpass'); },
    alarm(t) { for (let i = 0; i < 10; i++) tone(i % 2 ? 1400 : 1800, t + i * 0.07, 0.06, 'square', 0.18); },
    stamp(t) { noise(t, 0.15, 0.6, 300, 'lowpass'); tone(90, t, 0.12, 'sine', 0.5); },
    clap(t) { for (let i = 0; i < 14; i++) noise(t + i * 0.06 + Math.random() * 0.03, 0.05, 0.3, 1500 + Math.random() * 1500); },
    bang(t) { for (let i = 0; i < 6; i++) { noise(t + i * 0.18, 0.1, 0.5, 200, 'lowpass'); tone(70, t + i * 0.18, 0.1, 'sine', 0.4); } },
    whoosh(t) { tone(200, t, 0.5, 'triangle', 0.2, 'sfx', 1600); noise(t, 0.4, 0.2, 1200); },
    buzz(t) { tone(523, t, 0.08, 'square', 0.25); tone(1046, t + 0.08, 0.15, 'square', 0.25); },
    item(t) { [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.06, 0.1, 'square', 0.2)); },
    levelup(t) { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, t + i * 0.1, 0.12, 'square', 0.22)); },
    // 西敏寺鐘聲（公眾領域），上下課鐘
    bell(t) { ['E5', 'C5', 'D5', 'G4', 'G4', 'D5', 'E5', 'C5'].forEach((n, i) => tone(freq(n), t + i * 0.45 + (i >= 4 ? 0.4 : 0), 0.6, 'sine', 0.35, 'sfx', 0, true)); },
    coinIn(t) { tone(1319, t, 0.05, 'square', 0.2); tone(1760, t + 0.05, 0.3, 'square', 0.2); }
  };
  function sfx(name) { if (!ctx || !SFX[name]) return; SFX[name](ctx.currentTime + 0.01); }

  // ---------- 8-bit 音樂（全部原創旋律；驪歌為公眾領域蘇格蘭民謠）----------
  const SONGS = {
    title: { bpm: 150, lead: 'square', chords: 'C F C G C F G C',
      mel: 'G4.1 C5.1 C5.2 E5.2 C5.2|F5.2 A5.2 G5.4|E5.1 E5.1 G5.2 E5.2 C5.2|D5.2 E5.1 D5.1 B4.4|G4.1 C5.1 C5.2 E5.2 G5.2|A5.2 F5.2 A5.2 C6.2|B5.2 G5.2 D5.2 B4.2|C5.4 r.2 G4.2' },
    quiz: { bpm: 126, lead: 'square', chords: 'C Am F G C Am F G',
      mel: 'E5.1 G5.1 E5.1 C5.1 D5.2 E5.2|A4.2 C5.2 E5.4|F5.1 E5.1 D5.1 C5.1 A4.2 C5.2|B4.2 D5.2 G4.4|E5.1 G5.1 A5.2 G5.1 E5.1 C5.2|A4.1 C5.1 E5.2 D5.1 C5.1 A4.2|F4.2 A4.2 C5.2 D5.2|B4.2 G4.2 B4.2 D5.2' },
    shop: { bpm: 100, lead: 'bell', chords: 'F Dm Bb C F Dm C F',
      mel: 'A5.2 F5.2 C5.2 F5.2|D5.2 F5.2 A5.4|Bb5.2 A5.2 G5.2 F5.2|E5.2 G5.2 C6.4|A5.1 Bb5.1 A5.2 F5.2 C5.2|D5.2 E5.2 F5.4|G5.2 Bb5.2 A5.2 G5.2|F5.6 r.2' },
    boss: { bpm: 144, lead: 'square', chords: 'Am Am F E Am Am Dm E',
      mel: 'A4.1 A4.1 C5.1 A4.1 E5.2 D5.2|C5.1 B4.1 A4.2 E4.4|F4.1 A4.1 C5.1 F5.1 E5.2 C5.2|B4.1 G#4.1 E4.2 G#4.2 B4.2|A4.1 A4.1 C5.1 A4.1 E5.2 G5.2|F5.1 E5.1 D5.1 C5.1 B4.2 A4.2|D5.2 F5.2 A5.2 F5.2|E5.2 D5.2 C5.2 B4.2' },
    grad: { bpm: 96, lead: 'triangle', chords: 'F C F Bb F C Bb F',
      mel: 'F5.3 F5.1 F5.2 A5.2|G5.3 F5.1 G5.2 A5.2|F5.3 F5.1 A5.2 C6.2|D6.6 D6.2|C6.3 A5.1 A5.2 F5.2|G5.3 F5.1 G5.2 A5.2|F5.3 D5.1 D5.2 C5.2|F5.6 C5.2' },
    sad: { bpm: 80, lead: 'triangle', chords: 'Am F C E Am F E Am',
      mel: 'E5.4 C5.2 A4.2|F4.4 A4.4|G4.2 E4.2 G4.2 C5.2|B4.6 r.2|E5.4 D5.2 C5.2|A4.4 F4.4|G#4.2 B4.2 E5.4|A4.6 r.2' }
  };
  const CHORD = { C: ['C3', 'G3'], Am: ['A2', 'E3'], F: ['F2', 'C3'], G: ['G2', 'D3'], Dm: ['D3', 'A3'], Bb: ['Bb2', 'F3'], E: ['E2', 'B2'] };
  function parseSong(s) {
    const notes = [];
    s.mel.split('|').forEach(bar => {
      let used = 0;
      bar.trim().split(/\s+/).forEach(tok => { const [n, d] = tok.split('.'); const dur = +d; if (used + dur <= 8) { notes.push([n, dur]); used += dur; } });
      if (used < 8) notes.push(['r', 8 - used]);
    });
    const bass = [];
    s.chords.split(' ').forEach(ch => { const [a, b] = CHORD[ch]; for (let i = 0; i < 4; i++) bass.push([i % 2 ? b : a, 2]); });
    return { mel: notes, bass };
  }
  let music = null, timer = null;
  function playMusic(name, tempo = 1) {
    if (!ctx) return;
    if (music && music.name === name) { music.tempo = tempo; return; }
    stopMusic();
    const s = SONGS[name]; if (!s) return;
    const p = parseSong(s);
    music = { name, s, p, tempo, tr: [{ list: p.mel, i: 0, t: ctx.currentTime + 0.1 }, { list: p.bass, i: 0, t: ctx.currentTime + 0.1 }] };
    timer = setInterval(schedule, 50); schedule();
  }
  function schedule() {
    if (!music || !ctx) return;
    const eighth = 60 / (music.s.bpm * music.tempo) / 2;
    music.tr.forEach((tr, k) => {
      while (tr.t < ctx.currentTime + 0.25) {
        const [n, d] = tr.list[tr.i];
        const dur = d * eighth;
        if (n !== 'r') {
          if (k === 0) {
            if (music.s.lead === 'bell') tone(freq(n), tr.t, Math.min(dur, 0.4), 'sine', 0.35, 'music', 0, true);
            else tone(freq(n), tr.t, dur * 0.9, music.s.lead, 0.16, 'music');
          } else tone(freq(n), tr.t, dur * 0.8, 'triangle', 0.4, 'music');
        }
        tr.t += dur; tr.i = (tr.i + 1) % tr.list.length;
      }
    });
  }
  function stopMusic() { clearInterval(timer); timer = null; music = null; }
  function setTempo(x) { if (music) music.tempo = x; }

  // ---------- 語音 ----------
  const cache = {};
  let curSrc = null, curToken = 0;
  function b64ToBuf(b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
  async function getBuffer(id) {
    if (cache[id]) return cache[id];
    let ab = null;
    const rec = await Store.getVoice(id).catch(() => null);
    if (rec) ab = await rec.arrayBuffer();
    else if (VOICE_DATA[id]) ab = b64ToBuf(VOICE_DATA[id]);
    if (!ab) return null;
    try { cache[id] = await ctx.decodeAudioData(ab); } catch (e) { return null; }
    return cache[id];
  }
  function forget(id) { delete cache[id]; }
  const subEl = () => document.getElementById('subtitle');
  function showSub(name, text) {
    const el = subEl(); el.replaceChildren();
    if (name) { const b = document.createElement('b'); b.textContent = name + '：'; el.append(b); }
    el.append(document.createTextNode(text)); el.classList.add('show');
  }
  function hideSub() { subEl().classList.remove('show'); }
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // 播放台詞（含字幕），回傳 Promise 在播完時 resolve
  async function say(id, opt = {}) {
    const line = LINE_MAP[id]; if (!line) return;
    const token = ++curToken;
    stopVoiceSource();
    const name = opt.name || LINES_DEF.speakers[line.speaker].name;
    showSub(name, opt.text || line.text);
    const vol = Settings.get().volVoice;
    let buf = null;
    if (ctx && vol > 0) buf = await getBuffer(id);
    if (token !== curToken) return;
    if (buf) {
      await new Promise(res => {
        const s = ctx.createBufferSource(); s.buffer = buf; s.connect(bus.voice);
        s.onended = () => { if (curSrc === s) curSrc = null; res(); };
        curSrc = s; s._res = res; setDuck(true); s.start();
      });
      if (token === curToken) setDuck(speaking);
    } else {
      await wait(400 + (opt.text || line.text).length * 160);
    }
    if (token === curToken) hideSub();
  }
  function stopVoiceSource() { if (curSrc) { const s = curSrc; curSrc = null; try { s.onended = null; s.stop(); } catch (e) { } if (s._res) s._res(); } }
  function stopVoice() { curToken++; stopVoiceSource(); setDuck(speaking); hideSub(); }
  async function previewBlob(blob) {
    init(); const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const s = ctx.createBufferSource(); s.buffer = buf; s.connect(bus.voice); s.start();
  }

  // ---------- 讀題（瀏覽器內建語音）----------
  let speaking = false;
  function zhVoice() {
    if (!('speechSynthesis' in window)) return null;
    const vs = speechSynthesis.getVoices();
    return vs.find(v => /zh[-_]TW/i.test(v.lang)) || vs.find(v => /zh[-_](HK|Hant)/i.test(v.lang)) || vs.find(v => /^zh/i.test(v.lang)) || null;
  }
  function hasTTS() { return !!zhVoice(); }
  function speak(text) {
    const s = Settings.get();
    if (!s.readQuestion || s.volVoice <= 0 || !('speechSynthesis' in window)) return;
    const v = zhVoice(); if (!v) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = v; u.lang = v.lang; u.rate = 1; u.volume = Math.min(1, s.volVoice * (s.loud ? 1.5 : 1));
    u.onstart = () => { speaking = true; setDuck(true); };
    u.onend = u.onerror = () => { speaking = false; setDuck(false); };
    speechSynthesis.speak(u);
  }
  function stopSpeak() { if ('speechSynthesis' in window) speechSynthesis.cancel(); speaking = false; setDuck(false); }
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => { };

  return { init, applyVolumes, sfx, playMusic, stopMusic, setTempo, say, stopVoice, forget, speak, stopSpeak, hasTTS, previewBlob, showSub, hideSub, LINE_MAP, get ready() { return !!ctx; } };
})();

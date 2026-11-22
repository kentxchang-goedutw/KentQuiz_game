# 預先產生所有角色台詞（src/lines.json）成 tools/voices/*.mp3
# 1. 先用 edge-tts（微軟台灣口音神經語音，需要網路）
# 2. 若某個聲音暫時無法使用，改用 Windows 內建的台灣語音（Zhiwei / Hanhan），再用 ffmpeg 調音高、語速
# 用法：python tools/gen_voices.py          （已存在的音檔會略過）
#       python tools/gen_voices.py --force  （全部重新產生）
import asyncio, json, os, re, subprocess, sys, tempfile
import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "tools", "voices")
LOCAL = {"zh-TW-YunJheNeural": ("Zhiwei", 110), "zh-TW-HsiaoChenNeural": ("Hanhan", 220), "zh-TW-HsiaoYuNeural": ("Yating", 220)}

def local_tts(text, sp, path):
    name, base_hz = LOCAL.get(sp["voice"], ("Hanhan", 220))
    wav = os.path.join(tempfile.gettempdir(), "mg_tts.wav")
    subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-File", os.path.join(ROOT, "tools", "winrt_tts.ps1"),
                    "-Text", text, "-Voice", name, "-Out", wav], check=True)
    pitch = 1 + int(re.sub(r"[^\d+-]", "", sp["pitch"])) / base_hz
    rate = 1 + int(re.sub(r"[^\d+-]", "", sp["rate"])) / 100
    filt = f"aresample=24000,asetrate={24000 * pitch:.0f},aresample=24000,atempo={rate / pitch:.3f}"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-af", filt, "-ac", "1", "-b:a", "48k", path], check=True)

async def main():
    force = "--force" in sys.argv
    data = json.load(open(os.path.join(ROOT, "src", "lines.json"), encoding="utf-8"))
    os.makedirs(OUT, exist_ok=True)
    for line in data["lines"]:
        path = os.path.join(OUT, line["id"] + ".mp3")
        if os.path.exists(path) and os.path.getsize(path) > 0 and not force:
            continue
        sp = data["speakers"][line["speaker"]]
        text = line.get("say", line["text"])
        ok = False
        for attempt in range(2):
            try:
                await edge_tts.Communicate(text, sp["voice"], rate=sp["rate"], pitch=sp["pitch"]).save(path)
                ok = os.path.getsize(path) > 0
                if ok: break
            except edge_tts.exceptions.NoAudioReceived:
                await asyncio.sleep(1)
        if ok:
            print("ok", line["id"], text)
        else:
            local_tts(text, sp, path)
            print("ok(local)", line["id"], text)

asyncio.run(main())

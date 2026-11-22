# 把 tools/images/raw/ 的生成圖處理成遊戲用的素材 tools/images/*.webp
# - 角色（白底）：從四周往內把白色背景去掉、裁切、縮小，存成透明 webp
# - 背景（bg_ 開頭）：縮成 960×720，存成 webp
# 用法：python tools/process_images.py
import os
from collections import deque
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "tools", "images", "raw")
OUT = os.path.join(ROOT, "tools", "images")


def remove_white(im):
    """從邊緣做 flood fill，把和邊緣相連的接近白色像素變透明（角色有深色描邊，不會吃進身體）。"""
    im = im.convert("RGB")
    w, h = im.size
    px = im.load()
    def whiteish(p):
        r, g, b = p
        return min(r, g, b) >= 232 and max(r, g, b) - min(r, g, b) <= 18
    bg = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if whiteish(px[x, y]) and not bg[y * w + x]:
                bg[y * w + x] = 1; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if whiteish(px[x, y]) and not bg[y * w + x]:
                bg[y * w + x] = 1; q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not bg[ny * w + nx] and whiteish(px[nx, ny]):
                bg[ny * w + nx] = 1; q.append((nx, ny))
    mask = Image.frombytes("L", (w, h), bytes(0 if v else 255 for v in bg))
    # 邊緣稍微柔化，避免白邊鋸齒
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    out = im.convert("RGBA")
    out.putalpha(mask)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in sorted(os.listdir(RAW)):
        if not f.endswith(".png"):
            continue
        name = f[:-4]
        im = Image.open(os.path.join(RAW, f))
        if name.startswith("bg_"):
            im = im.convert("RGB").resize((960, 720), Image.LANCZOS)
            im.save(os.path.join(OUT, name + ".webp"), "WEBP", quality=80, method=6)
        else:
            im = remove_white(im)
            im = im.crop(im.getbbox())
            limit = (900, 300) if name == "classmates" else (420, 420)
            im.thumbnail(limit, Image.LANCZOS)
            im.save(os.path.join(OUT, name + ".webp"), "WEBP", quality=85, method=6)
        print(name, im.size, os.path.getsize(os.path.join(OUT, name + ".webp")) // 1024, "KB")


main()

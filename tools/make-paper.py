"""クラフト紙の写真 → タイル4枚のシート(public/paper-kraft.webp)を作る。

★2026-08-26・第64巡。ユーザーが撮ったクラフト紙の写真(5705x8000 / 20.8MB)から、
繰り返しに見えないタイルのシートを作るための道具。**元の写真はリポジトリに無い**
(一時的な添付だった)ので、作り直すときは同じようなクラフト紙の写真を用意して
`SRC` を差し替えること。

作り:
  1. 離れた4か所を切る(模様が似ないように)。
  2. グレースケール → 大きなぼかしを引く(ハイパス)。照明・色ムラ・大きなシワが消え、
     繊維・斑点・細かいシワだけが残る。
  3. 半分ずらして重ね、境目を羽根ぼかしで混ぜて**継ぎ目を消す**。
  4. 標準偏差 22 に正規化して 2x2 に詰め、グレースケール WebP(q78)で書き出す。
     ★色は捨てる ― 濃さ 12% で色面に重ねると色の繊維は見えない。茶/麦わらの色味は
     実行時に `lib/paperTexture.ts` が付ける。
  ★q70 でも細かい目の残り方は元の 98%(実測)。品質を上げても大きくなるだけ。

  使い方: python3 tools/make-paper.py
"""
import sys
from PIL import Image, ImageFilter, ImageChops
import numpy as np

SRC = "/root/.claude/uploads/2c8f669c-a76e-541f-a6fd-ab5297a1706b/8f420648-image.jpg"
PATCH = 320          # タイル1辺(デバイス画素)
DOWN = 2             # 元画像を何分の1で見るか(紙の目の大きさ)
FEATHER = 56         # 継ぎ目を混ぜる幅
HIPASS = 48          # これより大きいムラ(照明・大きなシワ)は捨てる

im = Image.open(SRC).convert("L")
W, H = im.size
print("src", W, H)

# 離れた4か所から切る(模様が似ないように)
raw = PATCH * DOWN
spots = [
    (int(W*0.10), int(H*0.08)),
    (int(W*0.62), int(H*0.22)),
    (int(W*0.14), int(H*0.62)),
    (int(W*0.58), int(H*0.80)),
]

def tile(x, y):
    c = im.crop((x, y, x + raw, y + raw)).resize((PATCH, PATCH), Image.LANCZOS)
    # ハイパス: 大きなぼかしを引いて、繊維・斑点・細かいシワだけ残す
    blur = c.filter(ImageFilter.GaussianBlur(HIPASS))
    a = np.asarray(c, np.float32) - np.asarray(blur, np.float32) + 128.0
    # 継ぎ目消し: 半分ずらした自分と、境目だけ羽根ぼかしで混ぜる
    b = np.roll(np.roll(a, PATCH // 2, 0), PATCH // 2, 1)
    ax = np.arange(PATCH, dtype=np.float32)
    d = np.minimum(ax, PATCH - 1 - ax)              # 端からの距離
    m = np.clip(d / FEATHER, 0, 1)                  # 端ほど 0
    w = np.minimum(m[:, None], m[None, :])          # 端の十字だけ b を混ぜる
    a = a * w + b * (1 - w)
    # 中央値 128・ばらつきを揃える
    a = (a - np.median(a)) * 1.0 + 128.0
    s = a.std()
    if s > 1: a = (a - 128.0) * (22.0 / s) + 128.0  # 標準偏差 22 に正規化
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "L")

sheet = Image.new("L", (PATCH * 2, PATCH * 2))
for i, (x, y) in enumerate(spots):
    t = tile(x, y)
    sheet.paste(t, ((i % 2) * PATCH, (i // 2) * PATCH))
    print(f"patch{i} mean={np.asarray(t).mean():.1f} std={np.asarray(t).std():.1f}")

sheet.save("public/paper-kraft.webp", "WEBP", quality=78, method=6)


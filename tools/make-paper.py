"""クラフト紙の写真 → 図形に焼き込むシート(public/paper-kraft.webp)を作る。

★★2026-08-26・第65巡に**工程をほぼ全部やめた**。
第64巡は「4か所を切る → グレースケール → 大きなぼかしを引く(ハイパス) →
継ぎ目を混ぜる → 標準偏差を22に正規化」と5工程かけていたが、これは**別物を作る**
作業だった。実測すると:
  ・写真の低周波(照明・大きなシワ)は std 1.7〜2.6 しかない
    → **ハイパスはほとんど何も取り除いていない**のに、そのために色と諧調を捨てていた。
  ・写真の粒は std ≒ 11。それを 21.6 へ **2倍に増幅**していた。
  ・増幅のせいで圧縮が効かず 121KB。無加工なら同じ面積が半分以下で済む。
いまは**切って縮めるだけ**。明度だけを取り出すのは実行時(`lib/paperTexture.ts`)で行う。

★1枚で 768px 角にするので、図形1つ(最大 400 デバイス px)は**繰り返しに当たらない**。
だから継ぎ目消しも要らない(4枚に割る必要も無くなった)。向きとずらしは実行時に散らす。

★★**等倍で切る(縮小しない)**。縮小すると画素が平均されて**粒が消える** — 5.4倍に
縮めたら std が 11 → 6.9 まで落ちた。紙の目は高周波なので、これだけは守ること。
逆に圧縮には強く、q76 でも細かい目は元の 97% 残る(実測)。

★元の写真はリポジトリに無い(一時的な添付だった)。作り直すときは同じような
クラフト紙の写真を用意して `SRC` を差し替えること。

  使い方: python3 tools/make-paper.py
"""
from PIL import Image

SRC = "/root/.claude/uploads/2c8f669c-a76e-541f-a6fd-ab5297a1706b/8f420648-image.jpg"
OUT = "public/paper-kraft.webp"
SIZE = 768       # シート1辺(デバイス画素)。★元の写真から**等倍で**切る。
QUALITY = 76

im = Image.open(SRC).convert("RGB")
W, H = im.size
# 中央から**等倍で** 1枚。縁の写り込みを避けるため中央を使う。
x, y = (W - SIZE) // 2, (H - SIZE) // 2
sheet = im.crop((x, y, x + SIZE, y + SIZE))
sheet.save(OUT, "WEBP", quality=QUALITY, method=6)

import os, numpy as np
a = np.asarray(sheet.convert("L"), np.float64)
print(f"{OUT}: {SIZE}x{SIZE} / {os.path.getsize(OUT)/1024:.0f}KB")
print(f"  明度 中央値={np.median(a):.1f} std={a.std():.1f}  ← 写真のまま(増幅しない)")

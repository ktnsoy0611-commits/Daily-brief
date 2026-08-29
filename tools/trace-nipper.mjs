// ★★開発用。**改札鋏の平面図（線画）から輪郭を機械で抽出し、部品ごとに割る。**
//   目で読んで数値を打ち込むのをやめるための道具（16巡目）。
//
//   ★はじめは写真から抜こうとしたが、金属の斑・影・奥行きのせいで精度が出ず、
//     継ぎ目や V の頂点の推定も当てにならなかった。ユーザーが**平面図**を
//     用意してくれたので、そちらを正とする。線画なら閉じた領域を数えるだけで
//     部品が取れる ― 推定が1つも要らない。
//
//   PIL / numpy / cv2 はこの環境に無いので、Playwright の Chromium に
//   canvas で画像を復号させ、画素をそのまま読む。
//
//   node tools/trace-nipper.mjs <平面図> <out.json>
//   → out.json / out-overlay.png（重ねた確認用）/ lib/nipperShape.ts
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const src = process.argv[2], paint = process.argv[3], out = process.argv[4];
if (!src || !paint || !out) {
  console.error("usage: node tools/trace-nipper.mjs <平面図> <色分け図> <out.json>");
  process.exit(1);
}
const uriOf = (f) => `data:image/${f.toLowerCase().endsWith(".png") ? "png" : "jpeg"};base64,`
  + readFileSync(f).toString("base64");
const dataUri = uriOf(src), paintUri = uriOf(paint);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
page.on("console", (m) => console.error("[page]", m.text()));

const r = await page.evaluate(async ([uri, paintUri]) => {
  const img = new Image();
  await new Promise((ok, ng) => { img.onload = ok; img.onerror = ng; img.src = uri; });
  const W = img.naturalWidth, H = img.naturalHeight;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, W, H).data;

  // --- 線と紙を分ける（線画なので明るさだけで足りる） -------------------
  const INK_TH = 0.55;
  const ink = new Uint8Array(W * H);
  let inkPx = 0;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const v = Math.max(d[i], d[i + 1], d[i + 2]) / 255;
    if (v < INK_TH) { ink[p] = 1; inkPx++; }
  }

  // --- 紙を外から塗って、囲まれた領域（＝部品）を残す -------------------
  const outside = new Uint8Array(W * H), st = new Int32Array(W * H);
  { let sp = 0;
    const push = (p) => { if (!ink[p] && !outside[p]) { outside[p] = 1; st[sp++] = p; } };
    for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
    while (sp) { const p = st[--sp], x = p % W, y = (p / W) | 0;
      if (x > 0) push(p - 1); if (x < W - 1) push(p + 1);
      if (y > 0) push(p - W); if (y < H - 1) push(p + W); } }

  const cells = [];
  { const lab = new Int32Array(W * H).fill(-1);
    for (let p0 = 0; p0 < W * H; p0++) {
      if (ink[p0] || outside[p0] || lab[p0] >= 0) continue;
      const id = cells.length; let sp = 0; const pix = [];
      st[sp++] = p0; lab[p0] = id;
      while (sp) { const p = st[--sp]; pix.push(p);
        const x = p % W, y = (p / W) | 0;
        const go = (q) => { if (!ink[q] && !outside[q] && lab[q] < 0) { lab[q] = id; st[sp++] = q; } };
        if (x > 0) go(p - 1); if (x < W - 1) go(p + 1);
        if (y > 0) go(p - W); if (y < H - 1) go(p + W); }
      let x0 = W, x1 = 0, y0 = H, y1 = 0, sx = 0, sy = 0;
      for (const p of pix) { const x = p % W, y = (p / W) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; sx += x; sy += y; }
      cells.push({ id, pix, size: pix.length, bbox: { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0 },
        cx: sx / pix.length, cy: sy / pix.length });
    } }
  // --- ★★色分け図（ユーザーの手書き）を**割り当ての正**として読む ------
  //   線画だけでは、頭の板が青（左）か赤（右）かを機械で決められない。
  //   2つの部品は**重なっている**ので、見えている面がどちらかは図形からは
  //   分からない ― 人が示した色分けに従う。
  const pimg = new Image();
  await new Promise((ok, ng) => { pimg.onload = ok; pimg.onerror = ng; pimg.src = paintUri; });
  // ★★**色分け図は「塗り」で読む**（16巡目）。はじめは手書きの輪郭線を
  //   引いてもらって線の近さで判定したが、輪が閉じておらず精度が出なかった。
  //   いまは**塗った図**をもらうので、面の色をそのまま数えれば済む。
  //   ・赤（桃）＝右の部品／青＝左の部品／どちらでもない＝道具の外（V・バネ）。
  //   ・スクリーンショットの黒い帯は自動で切り落として、線画に重ねる。
  const pcrop = (() => {
    const t = document.createElement("canvas"); t.width = pimg.naturalWidth; t.height = pimg.naturalHeight;
    const c = t.getContext("2d", { willReadFrequently: true });
    c.drawImage(pimg, 0, 0);
    const q = c.getImageData(0, 0, t.width, t.height).data;
    // ★**紙が白い帯として並ぶ行／列**を探す。「黒でない画素」で囲むと
    //   ステータスバーの白い文字まで拾ってしまう（16巡目に実測）。
    const white = (p) => q[p * 4] > 195 && q[p * 4 + 1] > 195 && q[p * 4 + 2] > 195;
    const rowF = [], colF = [];
    for (let y = 0; y < t.height; y++) { let n = 0;
      for (let x = 0; x < t.width; x++) if (white(y * t.width + x)) n++;
      rowF.push(n / t.width); }
    for (let x = 0; x < t.width; x++) { let n = 0;
      for (let y = 0; y < t.height; y++) if (white(y * t.width + x)) n++;
      colF.push(n / t.height); }
    const run = (f, th) => {
      let bs = -1, be = -1, s2 = -1;
      for (let i = 0; i <= f.length; i++) {
        const ok = i < f.length && f[i] > th;
        if (ok && s2 < 0) s2 = i;
        if (!ok && s2 >= 0) { if (i - s2 > be - bs) { bs = s2; be = i; } s2 = -1; }
      }
      return [bs, be - 1];
    };
    const [y0, y1] = run(rowF, 0.5);
    const [x0, x1] = run(colF, (y1 - y0) / t.height * 0.5);
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  })();
  const pc = document.createElement("canvas"); pc.width = W; pc.height = H;
  const pctx = pc.getContext("2d", { willReadFrequently: true });
  pctx.drawImage(pimg, pcrop.x, pcrop.y, pcrop.w, pcrop.h, 0, 0, W, H);
  const pd = pctx.getImageData(0, 0, W, H).data;
  const side = new Uint8Array(W * H);   // 1=赤 2=青
  let nRed = 0, nBlue = 0;
  for (let i = 0, p = 0; i < pd.length; i += 4, p++) {
    const r = pd[i], g = pd[i + 1], b = pd[i + 2];
    if (r > g + 22 && r > b + 22) { side[p] = 1; nRed++; }
    else if (b > r + 22 && b > g + 12) { side[p] = 2; nBlue++; }
  }

  // --- 部品は**左端と右端から種を打って**取る ---------------------------
  // ★★大きい2つ、では取れない。平面図ではバネの針金が V の口を塞ぐので、
  //   **V の内側も大きな閉じた領域になる**（16巡目に実測）。
  //   道具の左端・右端は必ず持ち手の外縁なので、そこから内側へ入れば
  //   確実に部品に当たる ― 形の推定が1つも要らない。
  const cellAt = (() => {
    const idx = new Int32Array(W * H).fill(-1);
    cells.forEach((c, i) => { for (const p of c.pix) idx[p] = i; });
    return (x, y) => idx[y * W + x];
  })();
  let ix0 = W, ix1 = 0, iy0 = H, iy1 = 0;
  for (let p = 0; p < ink.length; p++) if (ink[p]) {
    const x = p % W, y = (p / W) | 0;
    if (x < ix0) ix0 = x; if (x > ix1) ix1 = x;
    if (y < iy0) iy0 = y; if (y > iy1) iy1 = y;
  }
  const seedFrom = (dir) => {
    for (let step = 0; step < W; step++) {
      const x = dir > 0 ? ix0 + step : ix1 - step;
      for (let y = iy0; y <= iy1; y++) {
        const c = cellAt(x, y);
        if (c >= 0 && cells[c].size > 200) return cells[c];
      }
    }
    return null;
  };
  const two = [seedFrom(1), seedFrom(-1)];
  if (!two[0] || !two[1] || two[0] === two[1]) return { error: "左右の部品が取れなかった", cellCount: cells.length };
  two.sort((a, b) => a.cx - b.cx);

  // 線の太さ ＝ **横に走査したときのインクの連なりの中央値**。
  // ★「インクの総数 ÷ 輪郭の長さ」では細部の線やロゴまで数に入って太く出る
  //   （16巡目に実測で 7 と出た。実際は 3）。隣接を見る半径が広すぎると、
  //   内部の細部まで外の地と繋がって見え、全部が背景に落ちる。
  const runs = [];
  for (let y = 0; y < H; y++) { let n = 0;
    for (let x = 0; x <= W; x++) {
      const v = x < W ? ink[y * W + x] : 0;
      if (v) n++; else { if (n > 0 && n < 40) runs.push(n); n = 0; }
    } }
  runs.sort((a, b) => a - b);
  const lineW = Math.max(2, runs[(runs.length / 2) | 0] || 3);

  // --- 線をまたぐ隣どうしを調べる ---------------------------------------
  // 平面図は**内部の細部の線**（天の段・ロゴ・スリット）でも領域が割れるので、
  // 部品はいくつもの領域に散らばる。線をまたいだ隣接関係で束ね直す。
  const OUT = -2, INKL = -1;
  const label = new Int32Array(W * H);
  for (let p = 0; p < label.length; p++) label[p] = ink[p] ? INKL : (outside[p] ? OUT : -3);
  cells.forEach((c, i) => { for (const p of c.pix) label[p] = i; });
  const R = lineW + 2;
  const adj = cells.map(() => new Set());
  const adjW = cells.map(() => new Map());   // 接している境界の長さ（インクの画素数）
  const adjOut = new Set();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!ink[y * W + x]) continue;
    const seen = new Set();
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const l = label[ny * W + nx];
      if (l >= 0 || l === OUT) seen.add(l);
    }
    const arr = [...seen];
    for (const a of arr) for (const b of arr) if (a !== b && a >= 0) {
      if (b === OUT) adjOut.add(a);
      else { adj[a].add(b); adjW[a].set(b, (adjW[a].get(b) ?? 0) + 1); }
    }
  }

  // --- 外の地と線1本で繋がる領域は「地」（＝V の内側・バネの輪の中） -----
  // ★★大きい2つ、では取れない。平面図ではバネの針金が V の口を塞ぐので、
  //   **V の内側も大きな閉じた領域になる**（16巡目に実測）。
  //   道具の左端・右端から種を打った2つだけを部品とし、そこから
  //   「地に繋がるもの」を除いて、残りを部品へ併合する。
  const isPart = new Set([cells.indexOf(two[0]), cells.indexOf(two[1])]);
  // 各領域の**縁が どの色の線に近いか**を数える。
  // ★緑（バネ）に接する領域は道具の外（V の内側・輪の中・針金の脇）。
  for (const c of cells) {
    let nr = 0, nb = 0;
    for (const p of c.pix) { if (side[p] === 1) nr++; else if (side[p] === 2) nb++; }
    c.red = nr; c.blue = nb;
    const share = Math.max(nr, nb) / c.size;
    c.side = share < 0.35 ? "-" : (nr >= nb ? "R" : "B");
  }
  // 赤にも青にも入っていない領域＝道具の外（V の内側・バネの輪の中・針金の脇）
  const bg = new Set();
  cells.forEach((c, i) => { if (!isPart.has(i) && c.side === "-") bg.add(i); });
  // --- 残りは細部。線をまたいで接している部品へ併合する ------------------
  // ★★**接している境界がいちばん長い相手**へ付ける。見つかった順に付けると、
  //   頭の板が箱の側へ流れてしまう（16巡目に実測）。板は左の持ち手と長い境界を
  //   共有しているので、長さで決めれば正しく分かれる。
  const LI = cells.indexOf(two[0]), RI = cells.indexOf(two[1]);
  const owner = new Map();
  for (const i of isPart) owner.set(i, i);
  // ★色が決まっている領域はそのまま入れる。残りだけ境界の長さで寄せる。
  cells.forEach((c, i) => {
    if (owner.has(i) || bg.has(i)) return;
    if (c.side === "R") owner.set(i, RI);
    else if (c.side === "B") owner.set(i, LI);
  });
  for (;;) {
    let best = null, bestW = 0;
    for (let i = 0; i < cells.length; i++) {
      if (bg.has(i) || owner.has(i)) continue;
      const w = new Map();
      for (const j of adj[i]) if (owner.has(j)) {
        const o = owner.get(j);
        w.set(o, (w.get(o) ?? 0) + (adjW[i].get(j) ?? 0));
      }
      for (const [o, ww] of w) if (ww > bestW) { bestW = ww; best = [i, o]; }
    }
    if (!best) break;
    owner.set(best[0], best[1]);
  }
  const partPix = new Map();
  for (const i of isPart) partPix.set(i, [...cells[i].pix]);
  for (const [i, o] of owner) if (i !== o) partPix.get(o).push(...cells[i].pix);
  const solids = cells.filter((c, i) => !isPart.has(i) && !bg.has(i));
  const [leftCell, rightCell] = two;

  // --- 線の太さのぶん膨らませて、輪郭を線の中心へ持っていく -------------
  const grow = (pix, r) => {
    const m = new Uint8Array(W * H);
    for (const p of pix) m[p] = 1;
    const pass = (src2, horiz) => {
      const o = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let v = 0;
        for (let k = -r; k <= r; k++) {
          const nx = horiz ? Math.min(W - 1, Math.max(0, x + k)) : x;
          const ny = horiz ? y : Math.min(H - 1, Math.max(0, y + k));
          v |= src2[ny * W + nx];
        }
        o[y * W + x] = v;
      }
      return o;
    };
    return pass(pass(m, true), false);
  };

  const N8 = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const trace = (m) => {
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : m[y * W + x];
    let start = -1;
    for (let p = 0; p < m.length && start < 0; p++) if (m[p]) start = p;
    const c = []; let cx = start % W, cy = (start / W) | 0, dir = 6;
    const sx = cx, sy = cy; let guard = 0;
    do { c.push([cx, cy]); let found = false;
      for (let k = 0; k < 8; k++) {
        const nd = (dir + 6 + k) % 8, nx = cx + N8[nd][0], ny = cy + N8[nd][1];
        if (at(nx, ny)) { cx = nx; cy = ny; dir = nd; found = true; break; }
      }
      if (!found) break;
    } while ((cx !== sx || cy !== sy) && ++guard < W * H * 4);
    return c;
  };
  const dp = (pts, eps) => {
    if (pts.length < 3) return pts.slice();
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const stk = [[0, pts.length - 1]];
    while (stk.length) {
      const [a, b] = stk.pop();
      const [ax, ay] = pts[a], [bx, by] = pts[b];
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
      let m = -1, md = eps;
      for (let i = a + 1; i < b; i++) {
        const dd = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L;
        if (dd > md) { md = dd; m = i; }
      }
      if (m > 0) { keep[m] = 1; stk.push([a, m], [m, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  };
  const EPS = Math.max(1.2, W / 420);
  // ★部品は細部の領域を束ねたものなので、太らせたあとに**いちばん大きな塊**だけを
  //   たどる。そうしないと、離れた小さな破片を輪郭と誤って数点しか出ない
  //   （16巡目に実測で 8 点になった）。
  // ★★塊は**ひとつとは限らない**。青の部品は赤の部品に挟み込まれているので、
  //   正面図では**頭の天に出る先だけが分かれて見える**（16巡目に実測 486px）。
  //   大きい順に返し、面積が主の 2% に満たない破片（線のかすれ）は捨てる。
  const lumps = (m) => {
    const lab = new Int32Array(W * H).fill(-1), stq = new Int32Array(W * H);
    const size = []; let n = 0;
    for (let p0 = 0; p0 < m.length; p0++) {
      if (!m[p0] || lab[p0] >= 0) continue;
      const id = n++; let sp = 0, sz = 0; stq[sp++] = p0; lab[p0] = id;
      while (sp) { const p = stq[--sp]; sz++;
        const x = p % W, y = (p / W) | 0;
        const go = (q) => { if (m[q] && lab[q] < 0) { lab[q] = id; stq[sp++] = q; } };
        if (x > 0) go(p - 1); if (x < W - 1) go(p + 1);
        if (y > 0) go(p - W); if (y < H - 1) go(p + W); }
      size[id] = sz;
    }
    const ids = size.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0])
      .filter(([s], k) => k === 0 || s >= size[0] * 0.02).map(([, i]) => i);
    return ids.map((id) => {
      const o = new Uint8Array(W * H);
      for (let p = 0; p < o.length; p++) o[p] = lab[p] === id ? 1 : 0;
      return o;
    });
  };
  const biggest = (m) => lumps(m)[0];
  const maskOf = (pix) => grow(pix, Math.max(1, Math.round(lineW / 2)) + 1);
  const polysOf = (pix) => lumps(maskOf(pix)).map((m) => dp(trace(m), EPS));
  const leftAll = polysOf(partPix.get(cells.indexOf(leftCell)));
  const rightAll = polysOf(partPix.get(cells.indexOf(rightCell)));
  const left = leftAll[0], right = rightAll[0];

  // --- 小さい部品を役で見分ける ----------------------------------------
  // バネの輪＝地に落ちた領域のうち、**丸い**もの（幅と高さが近い）
  const coilCell = cells.filter((c, i) => bg.has(i) && c.size > 40
      && Math.abs(c.bbox.w - c.bbox.h) < Math.max(c.bbox.w, c.bbox.h) * 0.35
      && c.cy > (leftCell.bbox.y0 + leftCell.bbox.y1) / 2)
    .sort((a, b) => b.size - a.size)[0] ?? null;

  // --- 継ぎ目と V の頂点（線画なら測るだけ） ----------------------------
  const edgesAt = (cell, y) => {
    let lo = W, hi = -1;
    for (const p of cell.pix) if (((p / W) | 0) === y) { const x = p % W; if (x < lo) lo = x; if (x > hi) hi = x; }
    return hi < 0 ? null : [lo, hi];
  };
  let apexY = -1, apexX = 0, seamX = 0, seamN = 0;
  for (let y = Math.min(leftCell.bbox.y0, rightCell.bbox.y0); y < H; y++) {
    const a = edgesAt(leftCell, y), b = edgesAt(rightCell, y);
    if (!a || !b) continue;
    const gap = b[0] - a[1];
    if (gap <= 30 && apexY < 0) { seamX += (a[1] + b[0]) / 2; seamN++; }
    if (gap > 30 && apexY < 0) { apexY = y; apexX = ((a[1] + b[0]) / 2) | 0; }
  }
  seamX = seamN ? Math.round(seamX / seamN) : Math.round((leftCell.bbox.x1 + rightCell.bbox.x0) / 2);

  // --- スリット ＝ 右の部品の頭にある**切れ込み**（天で口が開く） --------
  // ★閉じた領域ではないので「穴」としては拾えない。走査線に部品が2本現れる
  //   ところの隙間を集める。
  // ★切れ込みは**複数ある**（板を挟み込む溝と、細い窓）。行ごとの隙間を
  //   x のかたまりに分けて、いちばん左＝板と紙が入る溝を採る。
  let slotBox = null, slotAll = [];
  {
    const rp = maskOf(partPix.get(cells.indexOf(rightCell)));
    const gaps = [];
    for (let y = rightCell.bbox.y0; y < apexY; y++) {
      const rs = []; let st2 = -1;
      for (let x = 0; x <= W; x++) {
        const v = x < W ? rp[y * W + x] : 0;
        if (v && st2 < 0) st2 = x;
        if (!v && st2 >= 0) { rs.push([st2, x - 1]); st2 = -1; }
      }
      for (let i = 0; i + 1 < rs.length; i++) {
        const a = rs[i][1] + 1, b = rs[i + 1][0] - 1;
        if (b - a >= 2) gaps.push([y, a, b]);
      }
    }
    const cl = [];
    for (const [y, a, b] of gaps) {
      const hit = cl.find((c) => a <= c.x1 + 6 && b >= c.x0 - 6);
      if (hit) { hit.x0 = Math.min(hit.x0, a); hit.x1 = Math.max(hit.x1, b);
        hit.y0 = Math.min(hit.y0, y); hit.y1 = Math.max(hit.y1, y); hit.rows++; }
      else cl.push({ x0: a, x1: b, y0: y, y1: y, rows: 1 });
    }
    slotAll = cl.filter((c) => c.rows > 8).sort((a, b) => a.x0 - b.x0)
      .map((c) => ({ ...c, w: c.x1 - c.x0, h: c.y1 - c.y0 }));
    slotBox = slotAll[0] ?? null;
  }

  const bboxOf = (poly) => {
    let x0 = W, x1 = 0, y0 = H, y1 = 0;
    for (const [x, y] of poly) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0 };
  };
  const all = bboxOf([...left, ...right]);

  const overlay = (() => {
    const o = document.createElement("canvas"); o.width = W; o.height = H;
    const g = o.getContext("2d");
    g.drawImage(img, 0, 0);
    g.strokeStyle = "rgba(0,160,200,0.25)"; g.lineWidth = 1;
    for (let x = 0; x <= W; x += 50) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y <= H; y += 50) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    // 部品を塗って、割り当てが正しいか目で確かめられるようにする
    const paint = (pix, color) => {
      const im = g.getImageData(0, 0, W, H);
      const [rr, gg, bb] = color;
      for (const p of pix) { const i = p * 4;
        im.data[i] = (im.data[i] + rr) / 2; im.data[i + 1] = (im.data[i + 1] + gg) / 2;
        im.data[i + 2] = (im.data[i + 2] + bb) / 2; }
      g.putImageData(im, 0, 0);
    };
    if (false) {
      const pr = [], pb = [];
      for (let p = 0; p < RED.m.length; p++) { if (RED.m[p]) pr.push(p); if (BLUE.m[p]) pb.push(p); }
      paint(pr, [255, 90, 90]); paint(pb, [80, 130, 255]);
    } else {
      paint(partPix.get(cells.indexOf(leftCell)), [80, 130, 255]);
      paint(partPix.get(cells.indexOf(rightCell)), [255, 90, 90]);
    }
    const draw = (poly, color, w = 2) => {
      g.strokeStyle = color; g.lineWidth = w; g.beginPath();
      poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath(); g.stroke();
      g.fillStyle = color;
      for (const [x, y] of poly) g.fillRect(x - 2, y - 2, 4, 4);
    };
    draw(left, "#FF2D55"); draw(right, "#30D158");
    if (slotBox) { g.strokeStyle = "#FFD60A"; g.lineWidth = 2;
      g.strokeRect(slotBox.x0, slotBox.y0, slotBox.w, slotBox.h); }
    if (coilCell) { g.strokeStyle = "#0A84FF"; g.lineWidth = 2;
      g.strokeRect(coilCell.bbox.x0, coilCell.bbox.y0, coilCell.bbox.w, coilCell.bbox.h); }
    g.strokeStyle = "#BF5AF2"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(seamX, all.y0); g.lineTo(apexX, apexY); g.stroke();
    return o.toDataURL("image/png");
  })();

  return {
    W, H, inkThreshold: INK_TH, inkPixels: inkPx, lineWidth: lineW, simplifyEps: +EPS.toFixed(2),
    cellCount: cells.length, background: bg.size, details: solids.length,
    paintCrop: pcrop, paintPixels: { red: nRed, blue: nBlue },
    cellSides: [...cells].sort((a, b) => b.size - a.size).slice(0, 8)
      .map((c) => `${c.size}${c.side}(r${c.red} b${c.blue})`),
    cellSizes: [...cells].sort((a, b) => b.size - a.size).slice(0, 8).map((c) => c.size),
    seamX, apexX, apexY, bbox: all, aspect: +(all.w / all.h).toFixed(4),
    left: { poly: left, bbox: bboxOf(left) },
    right: { poly: right, bbox: bboxOf(right) },
    leftMore: leftAll.slice(1), rightMore: rightAll.slice(1),
    slot: slotBox, slotAll, pivot: { x: seamX, y: Math.round((leftCell.bbox.y0 + apexY) / 2) },
    coil: coilCell ? { ...coilCell.bbox, cx: Math.round(coilCell.cx), cy: Math.round(coilCell.cy) } : null,
    overlay,
  };
}, [dataUri, paintUri]);

await browser.close();
console.error(JSON.stringify({ ...r, overlay: "(png)",
  left: { pts: r.left.poly.length, bbox: r.left.bbox },
  right: { pts: r.right.poly.length, bbox: r.right.bbox },
  leftMore: r.leftMore.map((q) => q.length), rightMore: r.rightMore.map((q) => q.length) },
  null, 2));
writeFileSync(out, JSON.stringify({ ...r, overlay: undefined }));
writeFileSync(out.replace(/\.json$/, "") + "-overlay.png", Buffer.from(r.overlay.split(",")[1], "base64"));

// --- TS のソースを吐く -----------------------------------------------------
// 原点は**継ぎ目 × 頭の天**。平面図の 1px を 2.2 単位にする。y は上を正へ。
const K = 2.2, OX = r.seamX, OY = r.bbox.y0;
const mx = (x) => Math.round((x - OX) * K * 10) / 10;
const my = (y) => Math.round((OY - y) * K * 10) / 10;
const fmt = (poly) => poly.map(([x, y]) => `[${mx(x)}, ${my(y)}]`).join(", ");
const wrap = (str, n = 94) => {
  const out = []; let line = "  ";
  for (const tok of str.split(", ").map((t, i, a) => (i < a.length - 1 ? t + "," : t))) {
    if (line.length + tok.length > n) { out.push(line); line = "  "; }
    line += (line === "  " ? "" : " ") + tok;
  }
  out.push(line); return out.join("\n");
};
const sl = r.slot, co = r.coil;
const ts = `// ★★★**生成物。手で直さない。**
//   \`node tools/trace-nipper.mjs <平面図> <色分け図> <out.json>\` が作る。
//   形を変えたいときは**図を描き直して生成し直す**（目で数値を打ち込まない）。
//
//   平面図: ${process.argv[2].split("/").pop()} (${r.W}×${r.H})／色分け図: ${process.argv[3].split("/").pop()}
//   ・線画の**閉じた領域**を数え、道具の左端・右端から種を打って2部品を取る。
//   ・どの領域がどちらの部品かは**手書きの色分け**で決める（赤＝右／青＝左／
//     緑＝バネ）。2部品は重なっているので、図形だけでは決められない。
//   ・線の太さ ${r.lineWidth}px の半分だけ太らせて、輪郭を線の中心へ置いた。
//   継ぎ目 x=${r.seamX} / V の頂点 (${r.apexX}, ${r.apexY})。
//   原点は**継ぎ目 × 全体の天** = 図の (${OX}, ${OY})。1px = ${K} 単位。+y は上。
//   縦横比 ${r.aspect}（図の実測）。

/** 平面の点。★この表は**描き方から独立している**ので、ここで持つ。 */
export interface P2 { x: number; y: number }

/** 右の部品 ＝ 先端の箱と右の持ち手（一体）。**厚い**。 */
export const NIPPER_RIGHT: P2[] = [
${wrap(fmt(r.right.poly))}
].map(([x, y]) => ({ x, y }));

/**
 * 左の部品 ＝ 先端の板と左の持ち手。
 * ★持ち手より上は**右の部品より薄く**、右の部品の中へ挟み込まれる。
 */
export const NIPPER_LEFT: P2[] = [
${wrap(fmt(r.left.poly))}
].map(([x, y]) => ({ x, y }));

/**
 * 左の部品のうち、**赤の部品の外へ出ている残り**（正面では頭の天に出る先だけ）。
 * ★左の部品はひとつながりだが、間は右の部品に隠れるので図では切れて見える。
 *   同じ厚みで同じ支点を回る ―― 見えるところだけを別の面として押し出す。
 */
export const NIPPER_LEFT_TIPS: P2[][] = [
${r.leftMore.map((q) => `  [
${wrap(fmt(q))}
  ],`).join("\n")}
].map((poly) => poly.map(([x, y]) => ({ x, y })));

/** 紙が入るスリット（右の箱の天で口が開く切れ込み）。 */
export const NIPPER_SLOT = {
  x0: ${mx(sl.x0)}, x1: ${mx(sl.x1)}, y0: ${my(sl.y1)}, y1: ${my(sl.y0)},
};

/** バネの輪。 */
export const NIPPER_COIL = {
  cx: ${mx(co.cx)}, cy: ${my(co.cy)}, r: ${Math.round(((co.w + co.h) / 4) * K * 10) / 10},
};

/** ★支点。2部品が重なっているところ（ここを軸にペンチのように動く）。 */
export const NIPPER_PIVOT = { x: ${mx(r.pivot.x)}, y: ${my(r.pivot.y)} };

/** 道具全体の広がり（図の実測）。枠と接地を決めるのに使う。 */
export const NIPPER_EXTENT = {
  x0: ${mx(r.bbox.x0)}, x1: ${mx(r.bbox.x1)}, y0: ${my(r.bbox.y1)}, y1: ${my(r.bbox.y0)},
};
`;
writeFileSync("lib/nipperShape.ts", ts);
console.error(`→ lib/nipperShape.ts（右 ${r.right.poly.length}点 / 左 ${r.left.poly.length}点）`);

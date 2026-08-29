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
//   node tools/trace-nipper.mjs <平面図> <色分け図> <厚み図> <out.json>
//   → out.json / out-overlay.png（重ねた確認用）/ lib/nipperShape.ts
//
//   ★図は3枚とも**別の問い**に答える。1枚に兼ねさせない:
//     平面図   … 形（閉じた領域の輪郭）
//     色分け図 … どの領域がどちらの**部品**か（赤＝右／青＝左）
//     厚み図   … どこが**どれだけ厚い**か（サーモン＝厚／マゼンタ＝中／黄緑＝薄）
//   2部品は重なっているので、部品も厚みも**図形からは決められない**。人が示す。
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const src = process.argv[2], paint = process.argv[3], depth = process.argv[4], out = process.argv[5];
if (!src || !paint || !depth || !out) {
  console.error("usage: node tools/trace-nipper.mjs <平面図> <色分け図> <厚み図> <out.json>");
  process.exit(1);
}
const uriOf = (f) => `data:image/${f.toLowerCase().endsWith(".png") ? "png" : "jpeg"};base64,`
  + readFileSync(f).toString("base64");
const dataUri = uriOf(src), paintUri = uriOf(paint), depthUri = uriOf(depth);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
page.on("console", (m) => console.error("[page]", m.text()));

const r = await page.evaluate(async ([uri, paintUri, depthUri]) => {
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
  // ★★**手で塗った図は「塗り」で読む**（16巡目）。はじめは手書きの輪郭線を
  //   引いてもらって線の近さで判定したが、輪が閉じておらず精度が出なかった。
  //   いまは**塗った図**をもらうので、面の色をそのまま数えれば済む。
  //   ★スクリーンショットの黒い帯は自動で切り落として、線画へ重ねる。
  const readOverlay = async (uri2) => {
    const im = new Image();
    await new Promise((ok, ng) => { im.onload = ok; im.onerror = ng; im.src = uri2; });
    const t = document.createElement("canvas"); t.width = im.naturalWidth; t.height = im.naturalHeight;
    const c = t.getContext("2d", { willReadFrequently: true });
    c.drawImage(im, 0, 0);
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
    const [ya, yb] = run(rowF, 0.5);
    const [xa, xb] = run(colF, (yb - ya) / t.height * 0.5);
    const crop = { x: xa, y: ya, w: xb - xa + 1, h: yb - ya + 1 };
    const pc = document.createElement("canvas"); pc.width = W; pc.height = H;
    const pctx = pc.getContext("2d", { willReadFrequently: true });
    pctx.drawImage(im, crop.x, crop.y, crop.w, crop.h, 0, 0, W, H);
    return { crop, data: pctx.getImageData(0, 0, W, H).data };
  };

  // --- ★色分け図 … 赤（桃）＝右の部品／青＝左の部品／どちらでもない＝道具の外 ---
  const { crop: pcrop, data: pd } = await readOverlay(paintUri);
  const side = new Uint8Array(W * H);   // 1=赤 2=青
  let nRed = 0, nBlue = 0;
  for (let i = 0, p = 0; i < pd.length; i += 4, p++) {
    const r = pd[i], g = pd[i + 1], b = pd[i + 2];
    if (r > g + 22 && r > b + 22) { side[p] = 1; nRed++; }
    else if (b > r + 22 && b > g + 12) { side[p] = 2; nBlue++; }
  }

  // --- ★★厚み図 … 段を3つに読む（18巡目にユーザーが塗り分けて確定） -------
  //   「赤い部分は今の厚さと同じ／ピンクは赤より少しだけ薄い／緑はピンクよりも薄い」
  //   ★★判定は**実測した色**で書く（目分量で書かない）。ユーザーは**重ね絵の上に**
  //     塗るので、こちらが描いた注記の色と混ざらないことが要る:
  //       輪郭の緑 #30D158 は B=88 なので `G−B > 170` で落ちる
  //       継ぎ目の紫 #BF5AF2 は G=90 なので `G < 70` で落ちる
  //   どれにも当たらない画素は**厚**へ倒す（塗り残しで部品が消えないように）。
  const { crop: dcrop, data: dd } = await readOverlay(depthUri);
  const TIERS = 3;
  /** 段の**厚みの順**（大きいほど厚い）。実際の厚みは `lib/nipperRig.ts` が持つ。 */
  const HALF_ORDER = [2, 1, 0];
  const THICKEST = 0;
  /** 面取りの幅を画素で（`lib/nipperMesh.ts` の `CHAMFER` 7 単位 ÷ 1px=2.2単位）。 */
  const CHAMFER_PX = 3;
  const tier = new Uint8Array(W * H);   // 0=厚 1=中 2=薄
  const tierPx = [0, 0, 0];
  for (let i = 0, p = 0; i < dd.length; i += 4, p++) {
    const r = dd[i], g = dd[i + 1], b = dd[i + 2];
    let k = 0;
    if (g > 190 && g - b > 170 && g - r > 120) k = 2;          // 黄緑 ＝ 薄
    else if (r > 190 && g < 70 && b > 140) k = 1;              // マゼンタ ＝ 中
    tier[p] = k;
    if (r > g + 18 && r > b + 18 || k) tierPx[k]++;
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
  // ★画素の並び（添字の配列）でもマスク（Uint8Array）でも受ける。
  const grow = (pix, r) => {
    let m;
    if (pix instanceof Uint8Array) m = pix;
    else { m = new Uint8Array(W * H); for (const p of pix) m[p] = 1; }
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
  /** `grow` と対の収縮。★縁を触ったところは外扱い（外へ漏らさない）。 */
  const shrink = (m, r) => {
    const pass = (src2, horiz) => {
      const o = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let v = 1;
        for (let k = -r; k <= r; k++) {
          const nx = horiz ? x + k : x, ny = horiz ? y : y + k;
          v &= (nx < 0 || ny < 0 || nx >= W || ny >= H) ? 0 : src2[ny * W + nx];
        }
        o[y * W + x] = v;
      }
      return o;
    };
    return pass(pass(m, true), false);
  };
  const maskFrom = (pix) => { const m = new Uint8Array(W * H); for (const p of pix) m[p] = 1; return m; };
  const andM = (a, b) => { const o = new Uint8Array(W * H);
    for (let p = 0; p < o.length; p++) o[p] = a[p] & b[p]; return o; };
  const orM = (a, b) => { const o = new Uint8Array(W * H);
    for (let p = 0; p < o.length; p++) o[p] = a[p] | b[p]; return o; };
  const notM = (a) => { const o = new Uint8Array(W * H);
    for (let p = 0; p < o.length; p++) o[p] = a[p] ? 0 : 1; return o; };
  /**
   * ★塗りの手ぶれと1画素の階段を、**輪郭になる前に**落とす。
   * open（縮→膨）で棘を、close（膨→縮）で欠けを取る。大きさはほぼ変わらない。
   */
  const denoise = (m, r = 2) => shrink(grow(grow(shrink(m, r), r), r), r);

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
  /** Douglas–Peucker。★**開いた列**に使う（閉じた列に使うと端の segment が
   *  長さ0になって、どの点も距離0と判定され、両端しか残らない ― 19巡目に実測）。 */
  const dpIdx = (pts, eps) => {
    if (pts.length < 3) return pts.map((_, i) => i);
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
    const idx = [];
    for (let i = 0; i < pts.length; i++) if (keep[i]) idx.push(i);
    return idx;
  };
  const dp = (pts, eps) => dpIdx(pts, eps).map((i) => pts[i]);
  const EPS = Math.max(1.2, W / 420);
  /** 角を拾う粗さ。★これで残った点が「本物の角」。 */
  const EPS_CORNER = EPS * 3;
  /** 辺（直線／円弧）を当てるときの許容誤差（画素）。★形は変えない強さ。 */
  const ARC_TOL = 1.0;
  /**
   * 取り直す間隔（画素）。★辺の長さの下限を作る。
   * ★★**片の細いほうの寸法に合わせる**。一律にすると、細い片（頭の天の先は
   *   高さ14画素しかない）が丸められて面積を 13% 失う（19巡目に実測）。
   */
  const stepFor = (raw) => {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [x, y] of raw) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return Math.max(EPS * 2, Math.min(EPS * 6.5, Math.min(x1 - x0, y1 - y0) / 4));
  };

  // --- ★★なぞった輪郭を**整形する**（19巡目） ---------------------------
  //   トレースは「形を掴む」ところまで。画素の階段をそのまま多角形にすると、
  //   長さ1画素の辺と 50°を超える折れが山ほど残り、それが立体の稜線に出る
  //   （18巡目に実測 ― 短い辺 37本・急な折れ 33か所）。
  //
  //   ★角を鈍らせずに線だけ整えるのがねらい:
  //     ① 粗い Douglas–Peucker で**本物の角**を拾う
  //     ② 角と角のあいだの画素の列だけを平滑にする（両端は固定）
  //        → 直線だった区間は弦に収束して**まっすぐ**になり、曲線は**なめらか**になる
  //     ③ 細かい Douglas–Peucker で余った点を落とす
  //   ★回数は**区間の長さに合わせる**。短い区間に8回かけると弦へ寄りすぎて、
  //     小さい片の面積が 10% 痩せた（19巡目に実測）。
  const smoothRun = (run) => {
    if (run.length < 4) return run;
    const passes = Math.max(1, Math.min(10, Math.round(run.length / 6)));
    let a = run.map(([x, y]) => [x, y]);
    for (let k = 0; k < passes; k++) {
      const b = a.map(([x, y]) => [x, y]);
      for (let i = 1; i < a.length - 1; i++) {
        b[i][0] = (a[i - 1][0] + a[i][0] * 2 + a[i + 1][0]) / 4;
        b[i][1] = (a[i - 1][1] + a[i][1] * 2 + a[i + 1][1]) / 4;
      }
      a = b;
    }
    return a;
  };
  /**
   * ★弧長で**等間隔に取り直す**。平滑だけでは、DP が残った 1〜2 画素の揺れを
   * 追いかけて短い辺と急な折れを作り直してしまう（19巡目に実測 ― 短辺32本・
   * 急な折れ43か所）。等間隔に打ち直せば、短い辺は**作りようがない**。
   * 区間の両端（＝角）は必ず残す。
   */
  const resample = (run, step) => {
    if (run.length < 3) return run;
    const acc = [0];
    for (let i = 1; i < run.length; i++) {
      acc.push(acc[i - 1] + Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1]));
    }
    const L = acc[acc.length - 1];
    if (L < step) return [run[0], run[run.length - 1]];
    const n = Math.max(1, Math.round(L / step));
    const out = [];
    let j = 0;
    for (let k = 0; k <= n; k++) {
      const t = (L * k) / n;
      while (j + 1 < acc.length && acc[j + 1] < t) j++;
      const seg = acc[j + 1] - acc[j] || 1, u = (t - acc[j]) / seg;
      const a = run[j], b = run[Math.min(j + 1, run.length - 1)];
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
    }
    return out;
  };
  // --- ★★★整えた点列を**直線と円弧に組み直す**（20巡目） ------------------
  //   ユーザー指摘「なぞって点をとってきただけで、謂わば整理されていない」。
  //   角と角のあいだは**1本の辺**（直線か円弧）にする。直線も曲線もただの折れ線
  //   として持っているかぎり、いくら平滑にしても「整理された形」にはならない。
  //   ★次の巡のデフォルメは、この辺の並びを間引く／半径を丸めるだけで済む。

  /** 最小二乗の円あて（Taubin）。点が一直線に近いと `null`。 */
  const fitCircle = (pts) => {
    const n = pts.length;
    if (n < 4) return null;
    let mx = 0, my = 0;
    for (const [x, y] of pts) { mx += x; my += y; }
    mx /= n; my /= n;
    let Suu = 0, Suv = 0, Svv = 0, Suuu = 0, Svvv = 0, Suvv = 0, Svuu = 0;
    for (const [x, y] of pts) {
      const u = x - mx, v = y - my;
      Suu += u * u; Svv += v * v; Suv += u * v;
      Suuu += u * u * u; Svvv += v * v * v; Suvv += u * v * v; Svuu += v * u * u;
    }
    const det = Suu * Svv - Suv * Suv;
    if (Math.abs(det) < 1e-9) return null;
    const c1 = (Suuu + Suvv) / 2, c2 = (Svvv + Svuu) / 2;
    const uc = (c1 * Svv - c2 * Suv) / det, vc = (c2 * Suu - c1 * Suv) / det;
    const r = Math.sqrt(uc * uc + vc * vc + (Suu + Svv) / n);
    if (!isFinite(r) || r <= 0) return null;
    return { cx: mx + uc, cy: my + vc, r };
  };

  /** 点列から弦までの最大のずれ。 */
  const chordErr = (pts) => {
    const a = pts[0], b = pts[pts.length - 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    let m = 0;
    for (const [x, y] of pts) m = Math.max(m, Math.abs((x - a[0]) * dy - (y - a[1]) * dx) / L);
    return m;
  };
  /** 点列から当てた円までの最大のずれ。 */
  const circleErr = (pts, c) => {
    let m = 0;
    for (const [x, y] of pts) m = Math.max(m, Math.abs(Math.hypot(x - c.cx, y - c.cy) - c.r));
    return m;
  };

  /** 区間を**辺の並び**にする。直線で足りなければ円弧、それでも駄目なら半分に割る。 */
  const edgesOf = (pts, tol, depth = 0) => {
    const a = pts[0], b = pts[pts.length - 1];
    if (pts.length < 3) return [{ to: b }];
    if (chordErr(pts) <= tol) return [{ to: b }];
    const c = fitCircle(pts);
    // ★半径が区間の長さに比べて桁違いに大きい円は「直線の言い換え」なので採らない。
    const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (c && c.r < span * 40 && circleErr(pts, c) <= tol) {
      // ★★回る向きは**区間の中点が掃きの中に入るか**で決める。弦と中心の左右で
      //   推理すると、画像の y が下向きなことと合わさって裏返り、**長いほうの弧**を
      //   掃いて図形が破綻する（20巡目に実測 ― 面積が +1044% になった）。
      const ang = (q) => Math.atan2(q[1] - c.cy, q[0] - c.cx);
      const TAU = Math.PI * 2, wrap = (t) => ((t % TAU) + TAU) % TAU;
      const a0 = ang(a), sweepCcw = wrap(ang(b) - a0);
      const mid = wrap(ang(pts[pts.length >> 1]) - a0);
      return [{ to: b, r: c.r, ccw: mid <= sweepCcw, cx: c.cx, cy: c.cy }];
    }
    if (depth > 6) return [{ to: b }];
    const h = pts.length >> 1;
    return [...edgesOf(pts.slice(0, h + 1), tol, depth + 1),
      ...edgesOf(pts.slice(h), tol, depth + 1)];
  };

  /** 円弧を点に開く（★約4°刻み。検証で元の点列と突き合わせるのに使う）。 */
  const openEdge = (from, e) => {
    if (!e.r) return [e.to];
    const TAU = Math.PI * 2;
    const a0 = Math.atan2(from[1] - e.cy, from[0] - e.cx);
    const raw1 = Math.atan2(e.to[1] - e.cy, e.to[0] - e.cx);
    const d = e.ccw ? ((raw1 - a0) % TAU + TAU) % TAU : -(((a0 - raw1) % TAU + TAU) % TAU);
    const a1 = a0 + d;
    const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 45)));
    const out = [];
    for (let i = 1; i <= n; i++) {
      const t = a0 + ((a1 - a0) * i) / n;
      out.push([e.cx + Math.cos(t) * e.r, e.cy + Math.sin(t) * e.r]);
    }
    return out;
  };

  /** 画素の輪郭 → 整えた多角形。★戻り値に**整形のずれ**も入れて検証に出す。 */
  const fair = (raw) => {
    if (raw.length < 12) return { poly: dp(raw, EPS), moved: 0, area: 0 };
    // ★`raw` は閉じた輪だが**先頭と末尾は重ねない**（重ねると DP が壊れる）。
    //   先頭は追跡の開始点＝いちばん上の左端なので、角として扱ってよい。
    const step = stepFor(raw);
    // ★角で切り、**角と角のあいだをまるごと1本の辺へ**当てはめる。
    //   細かい間引きの点で切ると、どの区間も短くて直線にしかならず、
    //   円弧が1本も出ない（20巡目に実測 ― 37辺中36本が直線だった）。
    let idx = dpIdx(raw, EPS_CORNER);
    // 近すぎる角は溶かす（1〜2画素の辺を作らない）
    idx = idx.filter((v, k) => k === 0 || k === idx.length - 1
      || Math.hypot(raw[v][0] - raw[idx[k - 1]][0], raw[v][1] - raw[idx[k - 1]][1]) >= EPS * 1.6);

    const edges = [];
    const start = raw[idx[0]];
    for (let k = 0; k + 1 < idx.length; k++) {
      const run = resample(smoothRun(raw.slice(idx[k], idx[k + 1] + 1)), step);
      edges.push(...edgesOf(run, ARC_TOL));
    }
    // 閉じる（最後の角 → 最初の角。輪郭は先頭と末尾が隣り合っている）
    if (edges.length) edges.push({ to: start });

    // 円弧を開いて多角形にする（立体はこれを使う）。辺との対応も取る。
    const poly = [];
    const owner = [];
    let cur = start;
    edges.forEach((e, i) => {
      const seg = openEdge(cur, e);
      for (const q of seg) { poly.push(q); owner.push(i); }
      cur = seg[seg.length - 1];
    });
    // 整形でどれだけ動いたか（元の画素の輪郭からの最大距離）
    let moved = 0;
    for (const [x, y] of raw) {
      let best = Infinity;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
        let t = ((x - a[0]) * dx + (y - a[1]) * dy) / L2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d2 = (x - a[0] - dx * t) ** 2 + (y - a[1] - dy * t) ** 2;
        if (d2 < best) best = d2;
      }
      moved = Math.max(moved, Math.sqrt(best));
    }
    const areaOf = (q) => { let a = 0;
      for (let i = 0; i < q.length; i++) { const u = q[i], v = q[(i + 1) % q.length];
        a += u[0] * v[1] - v[0] * u[1]; } return Math.abs(a) / 2; };
    const a0 = areaOf(raw), a1 = areaOf(poly);
    const arcs = edges.filter((e) => e.r).length;
    return { poly, edges, owner, start, arcs, lines: edges.length - arcs,
      moved: +moved.toFixed(2), area: a0 ? +((a1 - a0) / a0 * 100).toFixed(2) : 0 };
  };
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
  const GROW = Math.max(1, Math.round(lineW / 2)) + 1;
  const maskOf = (pix) => denoise(grow(pix, GROW));
  const polysOf = (pix) => lumps(maskOf(pix)).map((m) => fair(trace(m)).poly);
  const leftPix = partPix.get(cells.indexOf(leftCell));
  const rightPix = partPix.get(cells.indexOf(rightCell));
  const leftAll = polysOf(leftPix);
  const rightAll = polysOf(rightPix);
  const left = leftAll[0], right = rightAll[0];

  // --- ★★厚みの片 ＝ **部品の画素 × 段の画素** ---------------------------
  //   段を線画の閉じた領域へ割り当てない。塗りが領域の境目に乗っている保証が
  //   無いから（緑の楔は左の持ち手と同じ領域にまたがる）。画素で交差させれば
  //   塗ったとおりに割れる。
  // ★★片はそれぞれ**同じだけ太らせる**ので、隣り合う片は必ず重なる ―― 段の
  //   境目に隙間が開かない。薄い片が厚い片へ食い込むぶんは中に隠れる。
  // ★★捨てるかどうかは**太らせる前の画素数**で決める。太らせた後の大きさで
  //   見ると、幅3画素の筋が 180 画素の塊に化けて残ってしまう（18巡目に実測 ―
  //   左の部品に 1〜107 画素の欠片が 16 枚出た）。本物の片は 298 画素以上ある。
  const MIN_PIECE = 200;
  /** 段の境目へ食い込ませる量（面取りが中へ隠れるだけの深さ）。 */
  const BURY = GROW + Math.round(CHAMFER_PX);

  /**
   * ★★★**薄い側だけが厚い側へ食い込む**（19巡目）。
   * 18巡目は全部の片を同じだけ太らせていたので、**厚い片が薄い領域へ庇のように
   * はみ出し**、段差が坂に見えていた。厚い段は太らせない ―― その境目が
   * **本物の段差の面**になる。薄い段だけが中へ潜り、自分の面取りごと隠れる。
   */
  const piecesOf = (pix) => {
    const partMask = maskOf(pix);
    const own = [];
    for (let k = 0; k < TIERS; k++) own.push(maskFrom(pix.filter((p) => tier[p] === k)));

    // 段ごとのマスクを**先に全部**作る（あとで隣どうしを突き合わせるため）。
    const live = [];
    for (let k = 0; k < TIERS; k++) {
      let n0 = 0;
      for (const v of own[k]) n0 += v;
      if (n0 < MIN_PIECE) continue;
      // ★伸びてよいのは「部品のうち、**自分より薄い段**の塗り以外」。
      //   ★★`own` だけを許すと、いちばん厚い段が**線の太さのぶんも伸びられず**、
      //     外の輪郭が線の内側に寄る（19巡目に実測）。
      let allow = partMask;
      for (let j = 0; j < TIERS; j++) {
        if (HALF_ORDER[j] < HALF_ORDER[k]) allow = andM(allow, notM(own[j]));
      }
      live.push({ k, mask: denoise(andM(grow(own[k], k === THICKEST ? GROW : BURY), allow), 1) });
    }

    const outp = [];
    for (const { k, mask } of live) {
      // ★★頂点が**段の境目**かどうかは、「そのすぐ外に**同じ部品の別の段**が
      //   居るか」で決める。外の縁からの距離で見ると、段の境目が外の縁まで
      //   届いているところを外と数えてしまう（19巡目に実測 ― 96点中9点しか
      //   拾えなかった）。薄い段は厚い段へ食い込ませてあるので、境目の点は
      //   必ず相手のマスクの中に入っている。
      let others = null;
      for (const o of live) if (o.k !== k) others = others ? orM(others, o.mask) : o.mask;
      const near = others ? grow(others, 2) : null;
      for (const m of lumps(mask)) {
        let px = 0;
        for (let p = 0; p < m.length; p++) if (m[p] && own[k][p]) px++;
        if (px < MIN_PIECE) continue;
        const f = fair(trace(m));
        if (f.poly.length < 4 || !f.edges) continue;
        // ★★段の境目の印は**辺ごと**（点ごとではない）。1本の辺はまるごと外の輪郭か、
        //   まるごと段の境目のどちらかなので、そのほうが素直で、印が途中で切れない。
        const hit = f.poly.map(([x, y]) => {
          if (!near) return 0;
          const xi = Math.min(W - 1, Math.max(0, Math.round(x)));
          const yi = Math.min(H - 1, Math.max(0, Math.round(y)));
          return near[yi * W + xi] ? 1 : 0;
        });
        const tally = f.edges.map(() => [0, 0]);
        f.owner.forEach((e, i) => { tally[e][hit[i]]++; });
        const flags = tally.map(([no, yes]) => (yes > no ? 1 : 0));
        outp.push({ tier: k, px, moved: f.moved, areaDelta: f.area,
          start: f.start, edges: f.edges, inner: flags,
          arcs: f.arcs, lines: f.lines, pts: f.poly.length });
      }
    }
    return outp;
  };
  const leftPieces = piecesOf(leftPix);
  const rightPieces = piecesOf(rightPix);

  // --- 小さい部品を役で見分ける ----------------------------------------
  // バネの輪＝地に落ちた領域のうち、**丸い**もの（幅と高さが近い）
  const coilCell = cells.filter((c, i) => bg.has(i) && c.size > 40
      && Math.abs(c.bbox.w - c.bbox.h) < Math.max(c.bbox.w, c.bbox.h) * 0.35
      && c.cy > (leftCell.bbox.y0 + leftCell.bbox.y1) / 2)
    .sort((a, b) => b.size - a.size)[0] ?? null;

  // --- ★★バネの輪と針金を**図から測る**（19巡目） ------------------------
  //   18巡目まで、輪の半径は「穴の bbox」から出していた（＝内半径）ので小さく、
  //   針金の太さは手で 7 と書いていた。どちらも図が持っている情報なので測る。
  const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  const coilMetrics = (() => {
    if (!coilCell) return null;
    const partAll = maskFrom([...leftPix, ...rightPix]);
    // 芯の半径 … 中心から放射に走査して、最初に当たるインクの帯の**中心**。
    const cx0 = coilCell.cx, cy0 = coilCell.cy;
    const reach = Math.max(coilCell.bbox.w, coilCell.bbox.h);
    const mids = [];
    for (let k = 0; k < 90; k++) {
      const a = (k / 90) * Math.PI * 2;
      let s0 = -1;
      for (let t = reach * 0.4; t < reach * 1.6; t += 0.25) {
        const x = Math.round(cx0 + Math.cos(a) * t), y = Math.round(cy0 + Math.sin(a) * t);
        if (x < 0 || y < 0 || x >= W || y >= H) break;
        const on = ink[y * W + x];
        if (on && s0 < 0) s0 = t;
        if (!on && s0 >= 0) { mids.push((s0 + t) / 2); break; }
      }
    }
    // 針金の半径 … 脚は**2本の線**で描かれている。行ごとに細い帯の対を拾い、
    // ★傾きで**垂直**の間隔へ直す（斜めなので横に測ると太く出る）。
    const y0 = Math.round(coilCell.bbox.y0 - reach * 2.4), y1 = Math.round(coilCell.bbox.y0);
    const rows = [];
    for (let y = Math.max(0, y0); y <= y1; y++) {
      const runs = []; let s1 = -1;
      for (let x = 0; x < W; x++) {
        const on = ink[y * W + x];
        if (on && s1 < 0) s1 = x;
        if (!on && s1 >= 0) { runs.push([(s1 + x - 1) / 2, x - s1]); s1 = -1; }
      }
      // ★★対の**あいだ**が針金の身。囲まれていて（＝外の地ではない）、
      //   どちらの部品でもないところだけを数える。これをしないと道具の輪郭の
      //   2本の縁を拾って倍の太さが出る（19巡目に実測 14.5px）。
      const thin = runs.filter((q) => q[1] <= lineW + 1).map((q) => q[0]);
      for (let i = 0; i + 1 < thin.length; i++) {
        const mx2 = Math.round((thin[i] + thin[i + 1]) / 2), q = y * W + mx2;
        if (outside[q] || partAll[q] || ink[q]) continue;
        rows.push({ y, a: thin[i], b: thin[i + 1], mid: (thin[i] + thin[i + 1]) / 2 });
        break;
      }
    }
    const perp = [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].y - rows[i - 1].y !== 1) continue;
      const gap = rows[i].b - rows[i].a;
      if (gap < lineW || gap > reach * 0.45) continue;
      perp.push(gap / Math.hypot(1, rows[i].mid - rows[i - 1].mid));
    }
    const R = mids.length ? med(mids) : reach / 2;
    const wire = perp.length ? med(perp) / 2 : lineW;

    // ★★★脚も図から測る（20巡目。ユーザー指摘「リングの辺りの形が捉えられていない」）。
    //   脚は**2本線で描かれていて、そのあいだが閉じた領域として残っている**。
    //   輪の帯を除いてから、その領域ごとに**主成分**を取れば、軸の両端が脚の端になる。
    //   ★19巡目まで脚の4点は手で置いていた ―― 図が持っている情報を書き写していた。
    const legs = cells
      // ★**地の領域**だけ（部品に割り当てられた領域は脚ではない）。これをしないと
      //   右の持ち手の内側の細部（1225px）を脚と取り違える（20巡目に実測）。
      .filter((cc, ci) => bg.has(ci) && cc !== coilCell && cc.size > 150 && cc.size < 6000
        && Math.hypot(cc.cx - cx0, cc.cy - cy0) < reach * 5)
      .map((cc) => {
        const pts = cc.pix
          .map((q) => [q % W, (q / W) | 0])
          .filter(([x, y]) => Math.hypot(x - cx0, y - cy0) > R + wire * 2.2);
        if (pts.length < 120) return null;
        let mx2 = 0, my2 = 0;
        for (const [x, y] of pts) { mx2 += x; my2 += y; }
        mx2 /= pts.length; my2 /= pts.length;
        let sxx = 0, sxy = 0, syy = 0;
        for (const [x, y] of pts) {
          const u = x - mx2, v = y - my2; sxx += u * u; sxy += u * v; syy += v * v;
        }
        // 主成分（2×2 の固有ベクトル）
        const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
        const ux = Math.cos(th), uy = Math.sin(th);
        let t0 = Infinity, t1 = -Infinity, spread = [];
        for (const [x, y] of pts) {
          const t = (x - mx2) * ux + (y - my2) * uy;
          if (t < t0) t0 = t; if (t > t1) t1 = t;
          spread.push(Math.abs(-(x - mx2) * uy + (y - my2) * ux));
        }
        spread.sort((a, b) => a - b);
        const half = spread[Math.floor(spread.length * 0.9)];
        const A2 = [mx2 + ux * t0, my2 + uy * t0], B2 = [mx2 + ux * t1, my2 + uy * t1];
        // 輪に近いほうを終点にする
        const dA = Math.hypot(A2[0] - cx0, A2[1] - cy0), dB = Math.hypot(B2[0] - cx0, B2[1] - cy0);
        const [far, nearEnd] = dA > dB ? [A2, B2] : [B2, A2];
        return { far, near: nearEnd, len: t1 - t0, half: +half.toFixed(2), n: pts.length };
      })
      .filter(Boolean)
      .sort((a, b) => b.len - a.len)
      .slice(0, 2);
    // ★左の脚（＝青の部品から出る）を先に。x が小さいほう。
    legs.sort((a, b) => a.far[0] - b.far[0]);

    return {
      r: +R.toFixed(2),
      // ★針金の太さは**脚の領域の広がり**からも取れる。2つの測り方が近いことを確かめる。
      wire: +wire.toFixed(2),
      wireFromLegs: legs.length ? +med(legs.map((l) => l.half)).toFixed(2) : null,
      legs: legs.map((l) => ({ far: l.far.map((v) => +v.toFixed(1)),
        near: l.near.map((v) => +v.toFixed(1)), n: l.n, half: l.half })),
      samples: { ring: mids.length, wire: perp.length },
    };
  })();

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
    paint(leftPix, [80, 130, 255]);
    paint(rightPix, [255, 90, 90]);
    const draw = (poly, color, w = 2) => {
      g.strokeStyle = color; g.lineWidth = w; g.beginPath();
      poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath(); g.stroke();
      g.fillStyle = color;
      for (const [x, y] of poly) g.fillRect(x - 2, y - 2, 4, 4);
    };
    draw(left, "#FF2D55"); draw(right, "#30D158");
    // ★厚みの片。**段で線の色を変える**（0=厚は描かない。それが地の状態なので）。
    const TIER_INK = [null, "#FF9F0A", "#00E5FF"];
    for (const q of [...leftPieces, ...rightPieces]) {
      if (!TIER_INK[q.tier]) continue;
      const pts = []; let from = q.start;
      for (const e of q.edges) { const seg = openEdge(from, e); pts.push(...seg); from = pts[pts.length - 1]; }
      draw(pts, TIER_INK[q.tier], 3);
    }
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
    depthCrop: dcrop, depthPixels: { thick: tierPx[0], mid: tierPx[1], thin: tierPx[2] },
    pieces: {
      left: leftPieces.map((q) => ({ tier: q.tier, px: q.px, pts: q.pts,
        lines: q.lines, arcs: q.arcs, inner: q.inner.reduce((a, b) => a + b, 0),
        moved: q.moved, areaDelta: q.areaDelta })),
      right: rightPieces.map((q) => ({ tier: q.tier, px: q.px, pts: q.pts,
        lines: q.lines, arcs: q.arcs, inner: q.inner.reduce((a, b) => a + b, 0),
        moved: q.moved, areaDelta: q.areaDelta })),
    },
    cellSides: [...cells].sort((a, b) => b.size - a.size).slice(0, 8)
      .map((c) => `${c.size}${c.side}(r${c.red} b${c.blue})`),
    cellSizes: [...cells].sort((a, b) => b.size - a.size).slice(0, 8).map((c) => c.size),
    seamX, apexX, apexY, bbox: all, aspect: +(all.w / all.h).toFixed(4),
    left: { poly: left, bbox: bboxOf(left) },
    right: { poly: right, bbox: bboxOf(right) },
    leftPieces, rightPieces,
    slot: slotBox, slotAll, pivot: { x: seamX, y: Math.round((leftCell.bbox.y0 + apexY) / 2) },
    coil: coilCell ? { ...coilCell.bbox, cx: Math.round(coilCell.cx), cy: Math.round(coilCell.cy),
      ...coilMetrics } : null,
    overlay,
  };
}, [dataUri, paintUri, depthUri]);

await browser.close();
console.error(JSON.stringify({ ...r, overlay: "(png)",
  left: { pts: r.left.poly.length, bbox: r.left.bbox },
  right: { pts: r.right.poly.length, bbox: r.right.bbox },
  leftPieces: undefined, rightPieces: undefined },
  null, 2));
writeFileSync(out, JSON.stringify({ ...r, overlay: undefined }));
writeFileSync(out.replace(/\.json$/, "") + "-overlay.png", Buffer.from(r.overlay.split(",")[1], "base64"));

// --- TS のソースを吐く -----------------------------------------------------
// 原点は**継ぎ目 × 頭の天**。平面図の 1px を 2.2 単位にする。y は上を正へ。
const K = 2.2, OX = r.seamX, OY = r.bbox.y0;
const mx = (x) => Math.round((x - OX) * K * 10) / 10;
const my = (y) => Math.round((OY - y) * K * 10) / 10;
const fmt = (poly) => poly.map(([x, y]) => `[${mx(x)}, ${my(y)}]`).join(", ");
const wrap = (str, n = 94, pad = "  ") => {
  const out = []; let line = pad;
  for (const tok of str.split(", ").map((t, i, a) => (i < a.length - 1 ? t + "," : t))) {
    if (line.length + tok.length > n) { out.push(line); line = pad; }
    line += (line === pad ? "" : " ") + tok;
  }
  out.push(line); return out.join("\n");
};
/** 片を「辺の並び」として書き出す。★1行1辺で、直線か円弧かが目で分かる。 */
const fmtPiece = (q) => {
  const body = q.edges.map((e, i) => {
    const inner = q.inner[i] ? ", 1" : "";
    if (!e.r) return `    L(${mx(e.to[0])}, ${my(e.to[1])}${inner}),`;
    return `    A(${mx(e.to[0])}, ${my(e.to[1])}, ${Math.round(e.r * K * 10) / 10},`
      + ` ${mx(e.cx)}, ${my(e.cy)}, ${e.ccw ? 0 : 1}${inner}),`;
  }).join("\n");
  return `  piece(${q.tier}, ${mx(q.start[0])}, ${my(q.start[1])}, [\n${body}\n  ]),`;
};
const sl = r.slot, co = r.coil;
const ts = `// ★★★**生成物。手で直さない。**
//   \`node tools/trace-nipper.mjs <平面図> <色分け図> <厚み図> <out.json>\` が作る。
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
 * 辺。\`r\` があれば**円弧**（\`c\` は中心）、無ければ**直線**。
 * ★★20巡目に、なぞった点の羅列をやめて**直線と円弧の並び**にした
 *   （ユーザー指摘「トレースで点をとってきただけで、整理されていない」）。
 * ★\`inner\` は**段の境目**の印。そこは面取りしない ―― 面取りを回すと段差が
 *   坂に見える（面取り 7 に対し段差は 17 しかない）。印が**辺ごと**なのは、
 *   1本の辺がまるごと外の輪郭かまるごと境目のどちらかだから。
 */
export interface NipperEdge { to: P2; r?: number; c?: P2; ccw?: boolean; inner?: boolean }

/**
 * ★★**押し出す単位**。部品を厚みの段で割ったもの。
 * \`tier\` は 0=厚 / 1=中 / 2=薄。**実際の厚みは \`lib/nipperRig.ts\` が決める**
 * （ここは「どこがどの段か」だけを持つ）。
 *
 * ★片どうしは**少し重なっている**ので、段の境目に隙間は開かない。
 *   薄い片が厚い片へ食い込むぶんは中に隠れる。
 * ★左の部品は赤に挟まれていて、正面では途中が隠れて切れて見える。
 *   切れた先も**同じ表に入っている** ―― 別の部品ではなく、同じ支点を回る。
 */
export interface NipperPiece { tier: 0 | 1 | 2; start: P2; edges: NipperEdge[] }

const L = (x: number, y: number, inner?: 1): NipperEdge =>
  ({ to: { x, y }, inner: inner === 1 });
const A = (
  x: number, y: number, r: number, cx: number, cy: number, ccw: 0 | 1, inner?: 1,
): NipperEdge => ({ to: { x, y }, r, c: { x: cx, y: cy }, ccw: ccw === 1, inner: inner === 1 });
const piece = (tier: 0 | 1 | 2, sx: number, sy: number, edges: NipperEdge[]): NipperPiece =>
  ({ tier, start: { x: sx, y: sy }, edges });

/** 右の部品の片（先端の箱と右の持ち手）。 */
export const NIPPER_RIGHT_PIECES: NipperPiece[] = [
${r.rightPieces.map(fmtPiece).join("\n")}
];

/** 左の部品の片（先端の板と左の持ち手）。支点まわりに一緒に回る。 */
export const NIPPER_LEFT_PIECES: NipperPiece[] = [
${r.leftPieces.map(fmtPiece).join("\n")}
];

/** 紙が入るスリット（右の箱の天で口が開く切れ込み）。 */
export const NIPPER_SLOT = {
  x0: ${mx(sl.x0)}, x1: ${mx(sl.x1)}, y0: ${my(sl.y1)}, y1: ${my(sl.y0)},
};

/**
 * バネの輪。★\`r\` は**芯の半径**（輪を放射に走査してインクの帯の中心を測った値）、
 * \`wire\` は**針金の半径**（脚の2本線の垂直な間隔の半分）。どちらも図の実測。
 * ★18巡目まで \`r\` に「穴の bbox」を入れていたので小さく、太さは手で書いていた。
 */
export const NIPPER_COIL = {
  cx: ${mx(co.cx)}, cy: ${my(co.cy)},
  r: ${Math.round(co.r * K * 10) / 10}, wire: ${Math.round(co.wire * K * 10) / 10},
  /** 青の部品から輪まで（付け根 → 輪の縁）。 */
  legFar: [${co.legs.map((l) => `{ x: ${mx(l.far[0])}, y: ${my(l.far[1])} }`)[0]
    ?? "{ x: 0, y: 0 }"}, ${co.legs.map((l) => `{ x: ${mx(l.near[0])}, y: ${my(l.near[1])} }`)[0]
    ?? "{ x: 0, y: 0 }"}],
  /** 輪から赤の部品まで（輪の縁 → 付け根）。 */
  legNear: [${co.legs.map((l) => `{ x: ${mx(l.near[0])}, y: ${my(l.near[1])} }`)[1]
    ?? "{ x: 0, y: 0 }"}, ${co.legs.map((l) => `{ x: ${mx(l.far[0])}, y: ${my(l.far[1])} }`)[1]
    ?? "{ x: 0, y: 0 }"}],
};

/** ★支点。2部品が重なっているところ（ここを軸にペンチのように動く）。 */
export const NIPPER_PIVOT = { x: ${mx(r.pivot.x)}, y: ${my(r.pivot.y)} };

/** 道具全体の広がり（図の実測）。枠と接地を決めるのに使う。 */
export const NIPPER_EXTENT = {
  x0: ${mx(r.bbox.x0)}, x1: ${mx(r.bbox.x1)}, y0: ${my(r.bbox.y1)}, y1: ${my(r.bbox.y0)},
};
`;
writeFileSync("lib/nipperShape.ts", ts);
console.error(`→ lib/nipperShape.ts（輪郭 右 ${r.right.poly.length}点 / 左 ${r.left.poly.length}点`
  + `／片 右 ${r.rightPieces.length} 枚・左 ${r.leftPieces.length} 枚）`);

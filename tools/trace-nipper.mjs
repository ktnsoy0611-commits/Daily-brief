// ★★開発用。**改札鋏を、部品ごとの平面図から機械で起こす。**
//   目で読んで数値を打ち込むのをやめるための道具（16巡目に着手）。
//
//   ★★★21巡目に**入力を4枚に変えた**（ユーザーが部品ごとの図を用意してくれた）。
//     16〜20巡目は**組み立て図1枚**から2部品を割っていたが、組み立て図では
//     **左の部品が右の部品に隠れている**ので、取れるのは見えている断片だけだった
//     （左が4枚に切れ、頭の中を通る本体が丸ごと欠けていた）。だから
//     「重なる部分がおかしい」のは当然だった ―― 重なりが存在しなかった。
//
//   PIL / numpy / cv2 はこの環境に無いので、Playwright の Chromium に
//   canvas で画像を復号させ、画素をそのまま読む。
//
//   node tools/trace-nipper.mjs <右の図> <左の図> <左の厚み図> <組み立て図> <out.json>
//   → out.json / out-overlay.png（重ねた確認用）/ lib/nipperShape.ts
//
//   ★4枚は**同じ枠**に描かれている（実測で bbox が一致）。位置合わせは要らない。
//     右の図     … 右の部品の**完全な**輪郭（先端の箱＋右の持ち手）
//     左の図     … 左の部品の**完全な**輪郭（先端の板＋左の持ち手）
//     左の厚み図 … 青＝薄い／赤＝厚い（★左だけ。右は一定）
//     組み立て図 … バネを取るために使う（両部品を引いた残りがバネ）
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
if (argv.length < 5) {
  console.error("usage: node tools/trace-nipper.mjs <右の図> <左の図> <左の厚み図> <組み立て図> <out.json>");
  process.exit(1);
}
const [rightSrc, leftSrc, depthSrc, asmSrc, out] = argv;
const uriOf = (f) => `data:image/${f.toLowerCase().endsWith(".png") ? "png" : "jpeg"};base64,`
  + readFileSync(f).toString("base64");

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
page.on("console", (m) => console.error("[page]", m.text()));

const r = await page.evaluate(async (uris) => {
  const [uRight, uLeft, uDepth, uAsm] = uris;
  const W = 472, H = 472;
  const read = async (u) => {
    const img = new Image();
    await new Promise((ok, ng) => { img.onload = ok; img.onerror = ng; img.src = u; });
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, W, H);
    return ctx.getImageData(0, 0, W, H).data;
  };
  const dRight = await read(uRight), dLeft = await read(uLeft);
  const dDepth = await read(uDepth), dAsm = await read(uAsm);

  // --- 線と紙を分ける（線画なので明るさだけで足りる） -------------------
  const INK_TH = 0.55;
  const inkOf = (d) => {
    const m = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      if (Math.max(d[i], d[i + 1], d[i + 2]) / 255 < INK_TH) m[p] = 1;
    }
    return m;
  };
  /** 外から紙を塗り、囲まれたところを**部品の面**として返す（インクを含む）。 */
  const fill = (ink) => {
    const outside = new Uint8Array(W * H), st = new Int32Array(W * H);
    let sp = 0;
    const push = (p) => { if (!ink[p] && !outside[p]) { outside[p] = 1; st[sp++] = p; } };
    for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
    while (sp) { const p = st[--sp], x = p % W, y = (p / W) | 0;
      if (x > 0) push(p - 1); if (x < W - 1) push(p + 1);
      if (y > 0) push(p - W); if (y < H - 1) push(p + W); }
    const m = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p++) m[p] = outside[p] ? 0 : 1;
    return m;
  };
  const inkRight = inkOf(dRight), inkLeft = inkOf(dLeft), inkAsm = inkOf(dAsm);
  const solidRight = fill(inkRight), solidLeft = fill(inkLeft);

  // --- 線の太さ（横に連続するインクの長さの中央値） ----------------------
  // ★インク ÷ 周長で見積もると 2 のところが 7 と出る（16巡目に実測）。
  const runs = [];
  for (let y = 0; y < H; y++) { let n = 0;
    for (let x = 0; x < W; x++) {
      if (inkAsm[y * W + x]) n++;
      else { if (n > 0 && n < 12) runs.push(n); n = 0; }
    } }
  runs.sort((a, b) => a - b);
  const lineW = Math.max(2, runs[(runs.length / 2) | 0] || 3);

  // --- ★左の厚み（青＝薄い／赤＝厚い）。★右は一定なので塗らない ---------
  //   判定は**実測した色**で書く（目分量で書かない）。
  const TIERS = 2;                    // 0=厚 1=薄
  const HALF_ORDER = [1, 0];
  const THICKEST = 0;
  const CHAMFER_PX = 3;
  const tier = new Uint8Array(W * H);
  const tierPx = [0, 0];
  for (let i = 0, p = 0; i < dDepth.length; i += 4, p++) {
    const R = dDepth[i], G = dDepth[i + 1], B = dDepth[i + 2];
    if (B > R + 40 && B > G + 40) { tier[p] = 1; tierPx[1]++; }
    else if (R > G + 40 && R > B + 40) { tierPx[0]++; }
  }
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

  // --- 片に割る（右は1枚、左は厚みで2枚） --------------------------------
  const GROW = Math.max(1, Math.round(lineW / 2)) + 1;
  const pixOf = (m) => { const a = []; for (let p = 0; p < m.length; p++) if (m[p]) a.push(p); return a; };
  const maskOf = (m) => denoise(grow(m, GROW));
  const MIN_PIECE = 200;
  const BURY = GROW + Math.round(CHAMFER_PX);

  /**
   * ★★★**薄い側だけが厚い側へ食い込む**（19巡目）。厚い段は太らせない ――
   * その境目が**本物の段差の面**になる。薄い段だけが中へ潜り、面取りごと隠れる。
   * ★段の境目は**すぐ外に同じ部品の別の段が居るか**で決める（外の縁からの距離では
   *   段が縁まで届いているところを外と数えてしまう）。
   */
  const piecesOf = (solid, byTier) => {
    const partMask = maskOf(solid);
    const own = [];
    for (let k = 0; k < TIERS; k++) {
      const m = new Uint8Array(W * H);
      for (let p = 0; p < W * H; p++) if (solid[p] && (byTier ? tier[p] === k : k === 0)) m[p] = 1;
      own.push(m);
    }
    const live = [];
    for (let k = 0; k < TIERS; k++) {
      let n0 = 0; for (const v of own[k]) n0 += v;
      if (n0 < MIN_PIECE) continue;
      let allow = partMask;
      for (let j = 0; j < TIERS; j++) {
        if (HALF_ORDER[j] < HALF_ORDER[k]) allow = andM(allow, notM(own[j]));
      }
      live.push({ k, mask: denoise(andM(grow(own[k], k === THICKEST ? GROW : BURY), allow), 1) });
    }
    const outp = [];
    for (const { k, mask } of live) {
      let others = null;
      for (const o of live) if (o.k !== k) others = others ? orM(others, o.mask) : o.mask;
      const near = others ? grow(others, 2) : null;
      for (const m of lumps(mask)) {
        let px = 0;
        for (let p = 0; p < m.length; p++) if (m[p] && own[k][p]) px++;
        if (px < MIN_PIECE) continue;
        const f = fair(trace(m));
        if (f.poly.length < 4 || !f.edges) continue;
        const hit = f.poly.map(([x, y]) => {
          if (!near) return 0;
          const xi = Math.min(W - 1, Math.max(0, Math.round(x)));
          const yi = Math.min(H - 1, Math.max(0, Math.round(y)));
          return near[yi * W + xi] ? 1 : 0;
        });
        const tally = f.edges.map(() => [0, 0]);
        f.owner.forEach((e, i) => { tally[e][hit[i]]++; });
        outp.push({ tier: k, px, moved: f.moved, areaDelta: f.area,
          start: f.start, edges: f.edges, inner: tally.map(([no, yes]) => (yes > no ? 1 : 0)),
          arcs: f.arcs, lines: f.lines, pts: f.poly.length, poly: f.poly });
      }
    }
    return outp;
  };
  // ★★★**塗り残しは「いちばん近い塗り」に倒す**（21巡目）。
  //   手で塗った図は**輪郭の黒い線の上を塗れない**ので、部品のふちに 2〜4画素の
  //   塗り残しが帯として残る（実測 956px、部品ぜんぶのふちに沿って）。
  //   既定を「厚い」にしていたため、**薄いはずの先端のふちだけが厚いまま**
  //   立ち上がっていた（ユーザーが赤丸で指摘した「エッジだけ高い」）。
  //   多源の幅優先で、近い塗りの段へ配る。
  {
    const q2 = new Int32Array(W * H);
    const seen = new Uint8Array(W * H);
    let head = 0, tail = 0;
    for (let p = 0; p < W * H; p++) {
      if (!solidLeft[p]) continue;
      const i = p * 4, R = dDepth[i], G = dDepth[i + 1], B = dDepth[i + 2];
      const painted = (B > R + 40 && B > G + 40) || (R > G + 40 && R > B + 40);
      if (painted) { seen[p] = 1; q2[tail++] = p; }
    }
    while (head < tail) {
      const p = q2[head++], x = p % W, y = (p / W) | 0;
      const go = (t) => { if (solidLeft[t] && !seen[t]) { seen[t] = 1; tier[t] = tier[p]; q2[tail++] = t; } };
      if (x > 0) go(p - 1); if (x < W - 1) go(p + 1);
      if (y > 0) go(p - W); if (y < H - 1) go(p + W);
    }
  }

  // ★★**右の部品の中では、左は必ず薄い段**にする（塗り分けより優先）。
  //   左は赤の中へ挟み込まれているので、そこで厚い段になっていると面が重なって
  //   ちらつく（21巡目に実測 ― 192px の細い筋が頭を縦に走った）。
  let forcedThin = 0;
  for (let p = 0; p < W * H; p++) {
    if (solidLeft[p] && solidRight[p] && tier[p] === 0) { tier[p] = 1; forcedThin++; }
  }
  const rightPieces = piecesOf(solidRight, false);
  const leftPieces = piecesOf(solidLeft, true);

  // --- ★支点 ＝ 2部品が**重なっている**ところ ---------------------------
  //   ★★部品ごとの図をもらって初めて測れるようになった（組み立て図では左が
  //     隠れていて重なりが存在しなかった）。重なりの**下の端**が蝶番 ――
  //     重心を軸にすると刃が頭から出てしまう。
  let ovN = 0, ovX0 = W, ovX1 = -1, ovY0 = H, ovY1 = -1;
  const ovRow = new Map();
  for (let p = 0; p < W * H; p++) {
    if (!solidRight[p] || !solidLeft[p]) continue;
    ovN++;
    const x = p % W, y = (p / W) | 0;
    if (x < ovX0) ovX0 = x; if (x > ovX1) ovX1 = x;
    if (y < ovY0) ovY0 = y; if (y > ovY1) ovY1 = y;
    const e = ovRow.get(y) ?? [W, -1, 0];
    if (x < e[0]) e[0] = x; if (x > e[1]) e[1] = x; e[2]++;
    ovRow.set(y, e);
  }
  // 下から数えて、重なりが十分に広い最初の行の中央
  let pivot = { x: Math.round((ovX0 + ovX1) / 2), y: Math.round((ovY0 + ovY1) / 2) };
  for (let y = ovY1; y >= ovY0; y--) {
    const e = ovRow.get(y);
    if (e && e[2] > (ovX1 - ovX0) * 0.3) { pivot = { x: Math.round((e[0] + e[1]) / 2), y }; break; }
  }

  // --- ★バネ ＝ 組み立てのインク − 両部品の面 ---------------------------
  //   ★★これも部品ごとの図があって初めてできる。19〜20巡目は「地の閉じた領域」を
  //     探して脚を当てていたが、右の持ち手の内側の細部と取り違えた。引き算なら迷わない。
  const bothGrown = grow(orM(solidRight, solidLeft), 2);
  const spring = new Uint8Array(W * H);
  let springPx = 0;
  for (let p = 0; p < W * H; p++) if (inkAsm[p] && !bothGrown[p]) { spring[p] = 1; springPx++; }

  const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  const coil = (() => {
    // 輪の内側の穴 ＝ バネのインクに囲まれた、いちばん大きくて丸い領域
    const hole = fill(spring);
    const inner = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p++) inner[p] = hole[p] && !spring[p] ? 1 : 0;
    let best = null;
    for (const m of lumps(inner)) {
      let n = 0, x0 = W, x1 = -1, y0 = H, y1 = -1;
      for (let p = 0; p < W * H; p++) if (m[p]) { n++;
        const x = p % W, y = (p / W) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (n < 200) continue;
      if (Math.abs((x1 - x0) - (y1 - y0)) > 10) continue;
      if (!best || n > best.n) best = { n, x0, x1, y0, y1 };
    }
    if (!best) return null;
    const cx = (best.x0 + best.x1) / 2, cy = (best.y0 + best.y1) / 2;
    // ★★放射に走査して**インクの帯を2本**取る。輪は**二重丸**で描かれている ――
    //   18〜20巡目は内側の円を芯として使っていたので、輪が 12% 小さかった。
    const in1 = [], out1 = [], in2 = [], out2 = [];
    const reach = Math.max(best.x1 - best.x0, best.y1 - best.y0);
    for (let k = 0; k < 120; k++) {
      const a = (k / 120) * Math.PI * 2;
      const band = []; let s = -1;
      for (let t = reach * 0.3; t < reach * 1.6; t += 0.25) {
        const x = Math.round(cx + Math.cos(a) * t), y = Math.round(cy + Math.sin(a) * t);
        if (x < 0 || y < 0 || x >= W || y >= H) break;
        const on = spring[y * W + x];
        if (on && s < 0) s = t;
        if (!on && s >= 0) { band.push([s, t]); s = -1; if (band.length === 2) break; }
      }
      if (band.length === 2) { in1.push(band[0][0]); out1.push(band[0][1]);
        in2.push(band[1][0]); out2.push(band[1][1]); }
    }
    if (in2.length < 30) return null;
    const rIn = (med(in1) + med(out1)) / 2, rOut = (med(in2) + med(out2)) / 2;
    const R = (rIn + rOut) / 2, wire = (rOut - rIn) / 2;

    // --- 脚 … 輪の帯を除いた残りを塊に割り、主成分で両端を取る -----------
    // ★★**塗りつぶしたバネ**から取る。インクのままだと脚の**2本の線が別々の塊**に
    //   なり、片方の脚の2本を「2本の脚」と取り違える（21巡目に実測 ―― 左の脚だけが
    //   2つ出て、右の脚が消えた）。
    // ★★脚は**両端が開いている**（部品のところで切り落としてある）ので、塗りつぶしでは
    //   閉じない。**閉じ演算**（太らせてから縮める）で2本の線を1本の帯へ繋ぐ。
    //   これをしないと片方の脚の2本の線を「2本の脚」と取り違える（21巡目に実測）。
    const solidWire = shrink(grow(spring, 5), 5);
    const rest = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p++) {
      if (!solidWire[p]) continue;
      const x = p % W, y = (p / W) | 0;
      if (Math.hypot(x - cx, y - cy) < rOut + wire * 1.5) continue;
      rest[p] = 1;
    }
    const legs = lumps(rest).map((m) => {
      const pts = [];
      for (let p = 0; p < W * H; p++) if (m[p]) pts.push([p % W, (p / W) | 0]);
      if (pts.length < 60) return null;
      let mx2 = 0, my2 = 0;
      for (const [x, y] of pts) { mx2 += x; my2 += y; }
      mx2 /= pts.length; my2 /= pts.length;
      let sxx = 0, sxy = 0, syy = 0;
      for (const [x, y] of pts) { const u = x - mx2, v = y - my2;
        sxx += u * u; sxy += u * v; syy += v * v; }
      const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
      const ux = Math.cos(th), uy = Math.sin(th);
      let t0 = Infinity, t1 = -Infinity;
      for (const [x, y] of pts) { const t = (x - mx2) * ux + (y - my2) * uy;
        if (t < t0) t0 = t; if (t > t1) t1 = t; }
      const A = [mx2 + ux * t0, my2 + uy * t0], B = [mx2 + ux * t1, my2 + uy * t1];
      const dA = Math.hypot(A[0] - cx, A[1] - cy), dB = Math.hypot(B[0] - cx, B[1] - cy);
      const [far, nearEnd] = dA > dB ? [A, B] : [B, A];
      return { far, near: nearEnd, len: Math.abs(t1 - t0), n: pts.length };
    }).filter(Boolean).sort((a, b) => b.len - a.len).slice(0, 2);
    legs.sort((a, b) => a.far[0] - b.far[0]);   // 左の脚（青から出る）を先に
    return { cx, cy, r: +R.toFixed(2), wire: +wire.toFixed(2),
      rIn: +rIn.toFixed(2), rOut: +rOut.toFixed(2), bands: in2.length,
      legs: legs.map((l) => ({ far: l.far.map((v) => +v.toFixed(1)),
        near: l.near.map((v) => +v.toFixed(1)), n: l.n })) };
  })();

  // --- 紙が入るスリット（右の部品の面の切れ込み） -----------------------
  //   行ごとに右の面の隙間を数え、x のかたまりに分ける。いちばん左が溝。
  let slotBox = null, slotAll = [];
  {
    // ★★**生の面**で測る。太らせて均すと、下へ行くほど細くなる溝が塞がって
    //   上の 27 行しか拾えない（21巡目に実測。溝は y48〜140 まである）。
    const rp = solidRight;
    let ry0 = H, ry1 = -1;
    for (let p = 0; p < W * H; p++) if (solidRight[p]) {
      const y = (p / W) | 0; if (y < ry0) ry0 = y; if (y > ry1) ry1 = y; }
    const gaps = [];
    for (let y = ry0; y < ry0 + (ry1 - ry0) * 0.45; y++) {
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

  // --- 全体の広がり（2つの面の和） --------------------------------------
  let ex0 = W, ex1 = -1, ey0 = H, ey1 = -1;
  for (let p = 0; p < W * H; p++) {
    if (!solidRight[p] && !solidLeft[p]) continue;
    const x = p % W, y = (p / W) | 0;
    if (x < ex0) ex0 = x; if (x > ex1) ex1 = x;
    if (y < ey0) ey0 = y; if (y > ey1) ey1 = y;
  }
  const all = { x0: ex0, x1: ex1, y0: ey0, y1: ey1, w: ex1 - ex0, h: ey1 - ey0 };

  // --- 重ね絵（組み立て図の上に、拾った形を描く） ------------------------
  const overlay = (() => {
    const o = document.createElement("canvas"); o.width = W; o.height = H;
    const g = o.getContext("2d");
    const im0 = g.createImageData(W, H);
    for (let i = 0; i < dAsm.length; i++) im0.data[i] = dAsm[i];
    g.putImageData(im0, 0, 0);
    g.strokeStyle = "rgba(0,160,200,0.25)"; g.lineWidth = 1;
    for (let x = 0; x <= W; x += 50) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y <= H; y += 50) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const paint = (mask, color) => {
      const im = g.getImageData(0, 0, W, H);
      const [rr, gg, bb] = color;
      for (let p = 0; p < W * H; p++) { if (!mask[p]) continue; const i = p * 4;
        im.data[i] = (im.data[i] + rr) / 2; im.data[i + 1] = (im.data[i + 1] + gg) / 2;
        im.data[i + 2] = (im.data[i + 2] + bb) / 2; }
      g.putImageData(im, 0, 0);
    };
    paint(solidLeft, [80, 130, 255]);
    paint(solidRight, [255, 90, 90]);
    paint(spring, [40, 220, 120]);
    const draw = (pts, color, w = 2) => {
      g.strokeStyle = color; g.lineWidth = w; g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath(); g.stroke();
      g.fillStyle = color;
      for (const [x, y] of pts) g.fillRect(x - 1.5, y - 1.5, 3, 3);
    };
    for (const q of rightPieces) draw(q.poly, "#30D158", 2);
    for (const q of leftPieces) draw(q.poly, q.tier ? "#00E5FF" : "#FF2D55", 2);
    if (slotBox) { g.strokeStyle = "#FFD60A"; g.lineWidth = 2;
      g.strokeRect(slotBox.x0, slotBox.y0, slotBox.w, slotBox.h); }
    if (coil) {
      g.strokeStyle = "#BF5AF2"; g.lineWidth = 2;
      for (const rr of [coil.r - coil.wire, coil.r + coil.wire]) {
        g.beginPath(); g.arc(coil.cx, coil.cy, rr, 0, Math.PI * 2); g.stroke();
      }
      g.beginPath();
      for (const l of coil.legs) { g.moveTo(l.far[0], l.far[1]); g.lineTo(l.near[0], l.near[1]); }
      g.stroke();
    }
    g.fillStyle = "#FF9F0A";
    g.beginPath(); g.arc(pivot.x, pivot.y, 5, 0, Math.PI * 2); g.fill();
    return o.toDataURL("image/png");
  })();

  const clean = (a) => a.map(({ poly, ...q }) => q);   // 点の列は JSON に出さない
  return {
    W, H, lineWidth: lineW,
    area: { right: pixOf(solidRight).length, left: pixOf(solidLeft).length, overlap: ovN },
    overlapBox: { x0: ovX0, x1: ovX1, y0: ovY0, y1: ovY1 },
    depthPixels: { thick: tierPx[0], thin: tierPx[1], forcedThin,
      // ★配ったあとの、左の面での実際の内訳
      leftThick: (() => { let n = 0;
        for (let p = 0; p < W * H; p++) if (solidLeft[p] && tier[p] === 0) n++; return n; })(),
      leftThin: (() => { let n = 0;
        for (let p = 0; p < W * H; p++) if (solidLeft[p] && tier[p] === 1) n++; return n; })() },
    springPx, coil, pivot, slot: slotBox, slotAll, bbox: all,
    aspect: +(all.w / all.h).toFixed(4),
    rightPieces, leftPieces,
    pieces: { right: clean(rightPieces), left: clean(leftPieces) },
    overlay,
  };
}, [uriOf(rightSrc), uriOf(leftSrc), uriOf(depthSrc), uriOf(asmSrc)]);

await browser.close();
console.error(JSON.stringify({ ...r, overlay: "(png)",
  rightPieces: undefined, leftPieces: undefined }, null, 2));
writeFileSync(out, JSON.stringify({ ...r, overlay: undefined,
  rightPieces: undefined, leftPieces: undefined }));
writeFileSync(out.replace(/\.json$/, "") + "-overlay.png",
  Buffer.from(r.overlay.split(",")[1], "base64"));

// --- TS のソースを吐く -----------------------------------------------------
// 原点は**支点 × 全体の天**。平面図の 1px を 2.2 単位にする。y は上を正へ。
const K = 2.2, OX = r.pivot.x, OY = r.bbox.y0;
const mx = (x) => Math.round((x - OX) * K * 10) / 10;
const my = (y) => Math.round((OY - y) * K * 10) / 10;
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
const pt = (p) => `{ x: ${mx(p[0])}, y: ${my(p[1])} }`;
const ts = `// ★★★**生成物。手で直さない。**
//   \`node tools/trace-nipper.mjs <右の図> <左の図> <左の厚み図> <組み立て図> <out.json>\`
//   が作る。形を変えたいときは**図を描き直して生成し直す**（目で数値を打ち込まない）。
//
//   右: ${rightSrc.split("/").pop()}／左: ${leftSrc.split("/").pop()}
//   左の厚み: ${depthSrc.split("/").pop()}／組み立て: ${asmSrc.split("/").pop()}
//
//   ★★★21巡目に**部品ごとの図**から起こすようにした。16〜20巡目は組み立て図1枚から
//     割っていたが、そこでは**左の部品が右に隠れている**ので断片しか取れず、
//     2部品の**重なりが存在しなかった**（ユーザー指摘「重なる部分がおかしい」）。
//   ・右の面 ${r.area.right}px ／ 左の面 ${r.area.left}px ／ **重なり ${r.area.overlap}px**。
//   ・厚みは左だけ塗り分け（薄い ${r.depthPixels.thin}px ／ 厚い ${r.depthPixels.thick}px）。右は一定。
//   ・バネは**組み立て図のインクから両部品を引いた残り**（${r.springPx}px）。
//   ・線の太さ ${r.lineWidth}px の半分だけ太らせて、輪郭を線の中心へ置いた。
//   原点は**支点 × 全体の天** = 図の (${OX}, ${OY})。1px = ${K} 単位。+y は上。
//   縦横比 ${r.aspect}（図の実測）。

/** 平面の点。★この表は**描き方から独立している**ので、ここで持つ。 */
export interface P2 { x: number; y: number }

/**
 * 辺。\`r\` があれば**円弧**（\`c\` は中心）、無ければ**直線**。
 * ★★20巡目に、なぞった点の羅列をやめて**直線と円弧の並び**にした。
 * ★\`inner\` は**段の境目**の印。そこは面取りしない ―― 面取りを回すと段差が
 *   坂に見える。印が**辺ごと**なのは、1本の辺がまるごと外の輪郭かまるごと境目の
 *   どちらかだから。
 */
export interface NipperEdge { to: P2; r?: number; c?: P2; ccw?: boolean; inner?: boolean }

/**
 * ★★**押し出す単位**。\`tier\` は 0=厚 / 1=薄。
 * **実際の厚みは \`lib/nipperRig.ts\` が決める**（ここは「どこがどの段か」だけ）。
 * ★右の部品は一定の厚みなので1枚。左は厚みの塗り分けで2枚に割れる。
 */
export interface NipperPiece { tier: 0 | 1; start: P2; edges: NipperEdge[] }

const L = (x: number, y: number, inner?: 1): NipperEdge =>
  ({ to: { x, y }, inner: inner === 1 });
const A = (
  x: number, y: number, r: number, cx: number, cy: number, ccw: 0 | 1, inner?: 1,
): NipperEdge => ({ to: { x, y }, r, c: { x: cx, y: cy }, ccw: ccw === 1, inner: inner === 1 });
const piece = (tier: 0 | 1, sx: number, sy: number, edges: NipperEdge[]): NipperPiece =>
  ({ tier, start: { x: sx, y: sy }, edges });

/** 右の部品（先端の箱と右の持ち手）。**動かない**。 */
export const NIPPER_RIGHT_PIECES: NipperPiece[] = [
${r.rightPieces.map(fmtPiece).join("\n")}
];

/** 左の部品（先端の板と左の持ち手）。★支点まわりに回る。赤の中へ挟み込まれる。 */
export const NIPPER_LEFT_PIECES: NipperPiece[] = [
${r.leftPieces.map(fmtPiece).join("\n")}
];

/** 紙が入るスリット（右の箱の天で口が開く切れ込み）。 */
export const NIPPER_SLOT = {
  x0: ${mx(sl.x0)}, x1: ${mx(sl.x1)}, y0: ${my(sl.y1)}, y1: ${my(sl.y0)},
};

/**
 * バネ。★★**輪は二重丸で描かれている**ので、放射に走査して帯を2本取り、
 * その中間を**芯の半径**、差の半分を**針金の半径**とする。
 * 18〜20巡目は内側の円を芯にしていたので、輪が 12% 小さかった。
 * 実測 … 内 ${co.rIn}px ／ 外 ${co.rOut}px（${co.bands} 方向で一致）。
 */
export const NIPPER_COIL = {
  cx: ${mx(co.cx)}, cy: ${my(co.cy)},
  r: ${Math.round(co.r * K * 10) / 10}, wire: ${Math.round(co.wire * K * 10) / 10},
  /** 左の部品から輪まで（付け根 → 輪の縁）。 */
  legFar: [${pt(co.legs[0].far)}, ${pt(co.legs[0].near)}],
  /** 輪から右の部品まで（輪の縁 → 付け根）。 */
  legNear: [${pt(co.legs[1].near)}, ${pt(co.legs[1].far)}],
};

/**
 * ★支点。**2部品が重なっているところの下の端**（＝腕が分かれる蝶番）。
 * ★★部品ごとの図をもらって初めて測れるようになった（21巡目）。
 * 重なり ${r.area.overlap}px・範囲 x ${r.overlapBox.x0}〜${r.overlapBox.x1} / y ${r.overlapBox.y0}〜${r.overlapBox.y1}。
 */
export const NIPPER_PIVOT = { x: ${mx(r.pivot.x)}, y: ${my(r.pivot.y)} };

/** 道具全体の広がり（2つの面の和）。枠と接地を決めるのに使う。 */
export const NIPPER_EXTENT = {
  x0: ${mx(r.bbox.x0)}, x1: ${mx(r.bbox.x1)}, y0: ${my(r.bbox.y1)}, y1: ${my(r.bbox.y0)},
};
`;
writeFileSync("lib/nipperShape.ts", ts);
const cnt = (a) => a.reduce((s, q) => s + q.edges.length, 0);
console.error(`→ lib/nipperShape.ts（右 ${r.rightPieces.length}枚/${cnt(r.rightPieces)}辺`
  + ` ・左 ${r.leftPieces.length}枚/${cnt(r.leftPieces)}辺）`);

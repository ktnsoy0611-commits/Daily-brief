import { INK, JOURNAL_FACE, PAPER, mixHex } from "./constants";
import { redOn } from "./palette";
import { PX_H, pixelWidth, plotText } from "./pixelFont";

// ★★★**録音機の窓（ドット表示）の描き方はここ1つ**（2026-09-27・第133巡にユーザー指定「**円盤とボタンの間に
// 黒い、ドット絵が表示されるようなスクリーン…ちゃんとピクセルの画面があるような感じ**」）。
// ★★**点の格子は消えている点も描く**（うっすら見える点の並び ＝ 「画面がそこに在る」）。
// ★★点は**四角**・点と点のあいだは 1 デバイス画素ぶん空ける。点の位置は**デバイス画素に揃える**（にじませない）。
// ★★灯る色は JOURNAL の青（墨の上で読める）・控えめは青を墨へ寄せた色・赤は `redOn(INK)`（録音の印と切り出しの端）。
// ★目盛りの外（点の寸法）。

/** 点の刻み（css px）。 */
export const PIXEL_PITCH = 4;

/** 点の明るさ … 0 消灯／1 控えめ／2 点灯／3 赤。 */
export type Tone = 0 | 1 | 2 | 3;

const COLOR: Record<Tone, string> = {
  0: mixHex(INK, PAPER, 0.09),
  1: mixHex(JOURNAL_FACE, INK, 0.62),
  2: JOURNAL_FACE,
  3: redOn(INK),
};

export interface ScreenFrame {
  /** 真ん中に大きく出す1語（ボタンの合図）。`null` なら通常の表示。 */
  flash: string | null;
  /** 合図の点滅で、いま灯っているか。 */
  flashOn: boolean;
  /** 上の行（左・右）。`dot` は左の頭に赤い丸（録音中）。 */
  left: string;
  leftTone: Tone;
  dot: boolean;
  right: string;
  rightTone: Tone;
  /** 波形の列（0〜1 の高さ）と、列ごとの明るさ。 */
  bars: number[];
  barTone: (i: number) => Tone;
  /** 赤い縦の線（列の番号）。 */
  marks: number[];
}

/** ★波形に使える列の数（格子の幅 − 左右の 1 点）。呼ぶ側が波形の列を作るのに使う。 */
export function waveCols(cssW: number): number {
  return Math.max(1, Math.floor(cssW / PIXEL_PITCH) - 2);
}

export function drawPixelScreen(cv: HTMLCanvasElement, cssW: number, cssH: number, f: ScreenFrame): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pw = Math.round(cssW * dpr); const ph = Math.round(cssH * dpr);
  if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
  const c = cv.getContext("2d");
  if (!c) return;
  const cols = Math.floor(cssW / PIXEL_PITCH);
  const rows = Math.floor(cssH / PIXEL_PITCH);
  if (cols < 1 || rows < 1) return;
  const grid = new Uint8Array(cols * rows);
  const set = (col: number, row: number, t: Tone) => {
    if (col < 0 || row < 0 || col >= cols || row >= rows) return;
    grid[row * cols + col] = t;
  };

  if (f.flash !== null) {
    // ★合図 … 1語だけを縦横の真ん中に。消えている拍は何も灯さない。
    if (f.flashOn) {
      const c0 = Math.floor((cols - pixelWidth(f.flash)) / 2);
      const r0 = Math.floor((rows - PX_H) / 2);
      plotText(f.flash, c0, r0, (x, y) => set(x, y, 2));
    }
  } else {
    // ★上の行 … 左に状態、右に時間。
    const top = 1;
    let lc = 1;
    if (f.dot) { plotText("●", lc, top, (x, y) => set(x, y, 3)); lc += 7; }
    plotText(f.left, lc, top, (x, y) => set(x, y, f.leftTone));
    plotText(f.right, cols - 1 - pixelWidth(f.right), top, (x, y) => set(x, y, f.rightTone));
    // ★波形 … 上の行の下 2 点から、下の縁の 1 点手前まで。真ん中から上下へ伸ばす。
    const w0 = top + PX_H + 2;
    const w1 = rows - 2;
    const mid = (w0 + w1) / 2;
    const half = Math.max(0.5, (w1 - w0 + 1) / 2);
    const n = Math.min(f.bars.length, cols - 2);
    for (let i = 0; i < n; i++) {
      const t = f.barTone(i);
      const k = Math.max(0, Math.round(f.bars[i] * half));
      if (k === 0) { set(1 + i, Math.round(mid), 1); continue; }   // ★音の無い所は中心の点だけ
      for (let r = Math.ceil(mid - k + 0.5); r <= Math.floor(mid + k - 0.5) + 1; r++) set(1 + i, r, t);
    }
    for (const m of f.marks) for (let r = w0 - 1; r <= w1 + 1; r++) set(1 + m, r, 3);
  }

  // ★点はデバイス画素に揃えて置く（点の大きさは刻み − 1 デバイス画素 ＝ 隙間が必ず1本通る）。
  const P = PIXEL_PITCH * dpr;
  const ox = Math.round((pw - cols * P) / 2); const oy = Math.round((ph - rows * P) / 2);
  const gap = Math.max(1, Math.round(dpr));
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = INK;
  c.fillRect(0, 0, pw, ph);
  for (const tone of [0, 1, 2, 3] as Tone[]) {
    c.fillStyle = COLOR[tone];
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        if (grid[r * cols + col] !== tone) continue;
        const x = ox + Math.round(col * P); const y = oy + Math.round(r * P);
        const x2 = ox + Math.round((col + 1) * P) - gap; const y2 = oy + Math.round((r + 1) * P) - gap;
        c.fillRect(x, y, x2 - x, y2 - y);
      }
    }
  }
}

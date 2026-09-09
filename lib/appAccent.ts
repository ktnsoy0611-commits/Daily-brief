// ★★★**アプリごとのアクセント色（2026-09-09・テスト）**
//
// ★★★**これは試し。`ACCENT_TEST` を `false` にすれば元の配色へ丸ごと戻る。**
//   戻すのはこのファイルの1行だけで、呼び出し側は触らなくてよい。
//
// ユーザー提供の参照画像（3枚のキャンバス）から**画素を測って**採った色。
// 1枚が1つのアプリで、**濃い色（メイン）と淡い色（サブ）の2色**を持つ。
//
// | アプリ | メイン | サブ | 出どころ |
// |---|---|---|---|
// | TASK    | `#630A36` ワイン | `#FED4E9` ピンク | 赤系のキャンバス |
// | EXPLORE | `#705BDA` 青紫   | `#C9F0FF` 水色   | 青系のキャンバス |
// | JOURNAL | `#FAFF7E` 黄     | `#CEC7B5` ベージュ | 黄系のキャンバス |
//
// ★★★**使い方の理屈**（デザインの筋）:
//   1. **色相はアプリの識別に使い切る。** どのアプリに居るかを色相1つで言うので、
//      **アプリの中で色相を増やさない**。
//   2. **分類（タグ5・ドメイン4・キー3）は、その家族の中の濃淡で分ける。**
//      メイン → サブ の補間で段を作る（`accentSteps`）。色相が同じまま明度だけ
//      動くので、並べても家族に見えるのに1つずつは見分けられる。
//   3. **メイン＝面、サブ＝その面の上のアクセント。** 面に載る**文字**は色を
//      決め打ちせず `bodyInkOn()` が面から導く（表を持たない ―― 表にすると、
//      色を替えた人が片方だけ直して読めない組を作る）。
//   4. 地はクリームのまま。**地までアプリごとに変えない** ―― 横に払って隣の
//      アプリへ移るとき、地が変わると画面が切り替わったのではなく
//      **点滅したように見える**。
//
// ★実測（`ACCENT_TEST` の段。地 `#FFFBF5` の上 ／ 面に載る字）:
//   TASK    12.52 / 8.09 / 4.86 / 3.01 / 1.95（字は最小 4.79）
//   EXPLORE  4.85 / 3.21 / 2.20 / 1.54（字は最小 4.49）
//   JOURNAL  1.04 / 1.23 / 1.47（字はすべて墨で 9.77 以上）

import type { AppId } from "./types";

/** ★★★**試しの入り／切り。`false` で元の配色（`SCHEME` の6色）へ丸ごと戻る。** */
export const ACCENT_TEST = true;

export interface Accent { main: string; sub: string }

/**
 * アプリ → その2色。
 * ★★★**色を `lib/constants.ts` の外に置く唯一の場所**。試しのあいだだけの例外で、
 * `constants.ts` から `accentSteps` を呼んでいるので**逆向きに import できない**
 * （両方向にすると循環参照で起動しない ―― 実際に踏んだ）。採否が決まったら、
 * 採るなら色を `PALETTE` へ移してこのファイルを消す。捨てるならファイルごと消す。
 */
export const APP_ACCENT: Record<Exclude<AppId, "home">, Accent> = {
  tasks: { main: "#630A36", sub: "#FED4E9" },   // 赤系（ワイン ／ ピンク）
  life: { main: "#705BDA", sub: "#C9F0FF" },    // 青系（青紫   ／ 水色）
  journal: { main: "#FAFF7E", sub: "#CEC7B5" }, // 黄系（黄     ／ ベージュ）
};

/** ★ホームは自分の色を持たない ―― 出てくるものが**元のアプリの色**を着てくる。 */
export const accentOf = (app: Exclude<AppId, "home">): Accent => APP_ACCENT[app];

const mix = (a: string, b: string, t: number): string => {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const v = (i: number) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t);
  return `#${[0, 1, 2].map((i) => v(i).toString(16).padStart(2, "0")).join("")}`;
};

/**
 * ★★その家族の**濃淡の段**を作る（メイン → サブ）。
 * ★★★**サブまで行き切らない**（`REACH`）―― 端まで補間すると、いちばん淡い段が
 * 地に溶けて「面がある」と読めなくなる。淡い側に少し余裕を残す。
 */
const REACH = 0.78;   // ★目盛りの外（色の段の到達点）
export function accentSteps(app: Exclude<AppId, "home">, n: number): string[] {
  const { main, sub } = APP_ACCENT[app];
  if (n <= 1) return [main];
  return Array.from({ length: n }, (_, i) => mix(main, sub, (i / (n - 1)) * REACH));
}

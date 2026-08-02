"use client";

import { APPS, BACKDROP_MODE, type BackdropMode } from "@/lib/apps";
import { BG } from "@/lib/constants";
import { shade } from "@/lib/helpers";

// ★アプリ全体の背景(2026-08-02)。
//
// ■ 3つの並べ方
//   ブリーフ  … 画面幅いっぱい(100vw)を1辺とする正方形のグリッドを画面中心
//                から上下へ展開し、その各マスに内接する正円を置く。上下の
//                マスは画面からはみ出して切れる(そのほうが良い、という指定)。
//   タスク    … 上のグリッドをさらに四分割した細かいグリッド(1辺 25vw)で、
//                画面左の一列だけに「左下が角の扇形」を置く。他のマスは空。
//   ジャーナル… 同じ細かいグリッドの、すべてのマスに円を置く。
//
// ■ 地と図形(明度は2値)
// 地は BG(グレー)のまま。図形のあるところだけがそれより**薄い**1色。
//
// ■ 遷移 ★ここが構造の要
// DOM は常に「細かいグリッドのマス」1枚 = div 1つ。40枚あり、3つの並べ方は
// **同じ40枚の置き方が違うだけ**:
//   タスク    … 左の列だけ等倍、他は大きさ0
//   ジャーナル… 全部が等倍
//   ブリーフ  … 4x4ぶんのマスが1つの大きな円の中心へ寄り、4倍に育つ
//                (16枚がぴったり重なるので、見た目は1つの正円になる)
// だからアプリを移る動きは「グリッドが細かく割れる / 大きくまとまる」という
// 一続きの変形になる。
//
// ■ なぜ transform と border-radius だけなのか
// 動かすのは transform(translate+scale) と border-radius(%) の2つだけで、
// top/left/width/height には一切触らない。マスは常に正方形なので、拡大しても
// 円が楕円に潰れない(border-radius を % で持たせてあるため、拡大に正しく
// 追従する)。そして **transform はレイアウトを起こさない**ので、40枚あっても
// 毎フレームの再レイアウトが発生しない。以前この背景まわりで性能の回帰を
// 起こした経緯(コミット e89e03f)を踏まえた選択。
//
// ■ 指の動きと直結
// 進み具合は AppShell が書く2つのCSS変数(--appi / --dragn)から作った連続値
// ひとつ(--p)だけで決まる。各マスの transform / border-radius は、それを
// 使った1本の calc() で書いてある。JSは毎フレーム何も計算せず、Reactの
// レンダーも1回も走らない。指を離した瞬間は --p が目的地へ飛ぶが、
// transition が掛かっているのでトラックのスライドと同じ 380ms で追いつく
// (globals.css の .app-backdrop-cell)。

// 細かいグリッド。1マス = 画面幅の1/4。
const COLS = 4;
const ROWS = 10;
const U = "25vw";
// 粗いグリッド(ブリーフ)。1マス = 細かいマス4つぶん = 画面幅いっぱい。
const BIG = 4;
const BIG_ROWS = 3;

// 図形の色。地(BG)より薄い1色だけ。
const MARK = shade(BG, 4);

const r4 = (n: number) => Math.round(n * 10000) / 10000;

// v0(タスク)→v1(ブリーフ)→v2(ジャーナル) を1本のcalc()で繋ぐ。
// --t1/--t2 は globals.css の .app-backdrop-grid が --p から作る。
function mix(v0: number, v1: number, v2: number, unit: string): string {
  return `calc(${r4(v0)}${unit} + (${r4(v1 - v0)}${unit}) * var(--t1) + (${r4(v2 - v1)}${unit}) * var(--t2))`;
}
// 長さ(マス単位)。25vw を掛ける。
const len = (v0: number, v1: number, v2: number) =>
  `calc(${U} * (${r4(v0)} + (${r4(v1 - v0)}) * var(--t1) + (${r4(v2 - v1)}) * var(--t2)))`;

interface Geom {
  /** 中心をずらす量(マス単位)。 */
  dx: number;
  dy: number;
  /** 拡大率。0なら消える。 */
  s: number;
  /** 角丸(%)。CSSと同じ TL,TR,BR,BL の順。50が全部で正円。 */
  rad: [number, number, number, number];
}

const CIRCLE: [number, number, number, number] = [50, 50, 50, 50];
// 左下が角の扇形 = 右上の角を1辺ぶん丸める。
const FAN_BL: [number, number, number, number] = [0, 100, 0, 0];

// マス(c,r)が、粗いグリッドの何番目の行にまとまるか。どちらのグリッドも
// 画面中心を軸に上下へ展開しているので、中心からの距離だけで決まる。
function bigRowOf(r: number): number {
  const rel = r - (ROWS - 1) / 2;              // 中心から何マス目か
  const g = Math.floor((rel + (BIG_ROWS * BIG) / 2) / BIG);
  return Math.min(BIG_ROWS - 1, Math.max(0, g));
}

function geomFor(mode: BackdropMode, c: number, r: number): Geom {
  if (mode === "dots") return { dx: 0, dy: 0, s: 1, rad: CIRCLE };
  if (mode === "leftFans") {
    return c === 0
      ? { dx: 0, dy: 0, s: 1, rad: FAN_BL }
      // 空のマスも「その場で大きさ0」にしておくと、出現・消滅が滑らかになる。
      : { dx: 0, dy: 0, s: 0, rad: CIRCLE };
  }
  // merged: 自分が属する大きな円の中心へ寄る。
  // ★大きな円になるのは、その組の代表の1枚だけ。残りは中心へ吸い込まれ
  // ながら消える。以前は16枚すべてを4倍に育てて重ねていた(見た目は同じ
  // 1つの円になる)が、390px の円を40枚ぶん塗ることになり、横スワイプの
  // long task が 0ms から 287ms へ増えた。代表1枚に絞ると塗りは 3枚ぶんで
  // 済み、「小さい円が吸い込まれて大きな円が生まれる」という見え方も
  // むしろ細分化の逆再生としてはっきりする。
  const g = bigRowOf(r);
  return {
    dx: COLS / 2 - (c + 0.5),
    dy: (g - (BIG_ROWS - 1) / 2) * BIG - (r - (ROWS - 1) / 2),
    s: isRepresentative(c, r, g) ? BIG : 0,
    rad: CIRCLE,
  };
}

// その組の大きな円を実際に描く1枚。組の中心にいちばん近いマスを選ぶ。
function isRepresentative(c: number, r: number, g: number): boolean {
  if (c !== 1) return false;
  const target = (g - (BIG_ROWS - 1) / 2) * BIG + (ROWS - 1) / 2;
  return r === Math.round(target);
}

export function AppBackdrop() {
  const modes = APPS.map((a) => BACKDROP_MODE[a.id]);
  const cells = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const [g0, g1, g2] = modes.map((m) => geomFor(m, c, r));
      const radius = ([0, 1, 2, 3] as const)
        .map((k) => mix(g0.rad[k], g1.rad[k], g2.rad[k], "%"))
        .join(" ");
      cells.push(
        <div key={`${c}-${r}`} className="app-backdrop-cell" style={{
          position: "absolute",
          left: `calc(${U} * ${c})`,
          // 細かいグリッドは画面中心を軸に上下へ展開する(はみ出して構わない)。
          top: `calc(50svh - ${U} * ${r4(ROWS / 2 - r)})`,
          width: U, height: U, background: MARK,
          transform: `translate(${len(g0.dx, g1.dx, g2.dx)}, ${len(g0.dy, g1.dy, g2.dy)}) scale(${mix(g0.s, g1.s, g2.s, "")})`,
          borderRadius: radius,
        }} />
      );
    }
  }
  return (
    <div aria-hidden style={{
      position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none",
      // 呼び出し元(シェル)に isolation:isolate を与えてあるので、-1にしても
      // シェルの外へ抜け落ちない。0のままだと、CSSの描画順の規則により
      // 通常フローの中身(タブの本文)より後に描かれて文字を覆ってしまう。
      zIndex: -1,
    }}>
      <div className="app-backdrop-grid" style={{ position: "absolute", inset: 0 }}>{cells}</div>
    </div>
  );
}

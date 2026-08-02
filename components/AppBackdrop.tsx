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
// 地はアプリの BG より少し濃いグレー。図形のあるところだけがそれより**薄い**
// 1色。この2値しか使わない。
//
// ■ 遷移 ★ここが構造の要
// DOM は常に「細かいグリッドのマス」1枚 = div 1つ。48枚あり、3つの並べ方は
// **同じ48枚の大きさが違うだけ**:
//   タスク    … 左の列だけ等倍、他は0
//   ジャーナル… 全部が等倍
//   ブリーフ  … 粗いマスの左上にあたるマスだけが4倍、他は0
//
// **マスは一度も動かない。** 変わるのは大きさ(と角の丸め方)だけで、
// transform-origin を左上に置いてあるため、伸縮するのは右辺と下辺
// ＝**グリッドの境目そのもの**。だからアプリを移る動きは、
// 「境目が滑って4つのマスが1つのマスにまとまり、そのマスに沿って円が現れる」
// という、グリッドに完全に沿った変形になる。以前はまとまる先の中心へ
// translate で寄せていたため、図形が画面を斜めに飛び回り「アニメーションが
// グリッドと無関係」に見えていた。
//
// ■ なぜ transform と border-radius だけなのか
// 動かすのは transform(scale) と border-radius(%) の2つだけで、
// top/left/width/height には一切触らない。マスは常に正方形なので、拡大しても
// 円が楕円に潰れない(border-radius を % で持たせてあるため、拡大に正しく
// 追従する)。そして **transform はレイアウトを起こさない**ので、48枚あっても
// 毎フレームの再レイアウトが発生しない。以前この背景まわりで性能の回帰を
// 起こした経緯(コミット e89e03f)を踏まえた選択。
//
// ■ 指の動きと直結
// 進み具合は AppShell が書く2つのCSS変数(--appi / --dragn)から作った連続値
// ひとつ(--p)だけで決まる。各マスの transform / border-radius は、それを
// 使った1本の calc() で書いてある。JSは毎フレーム何も計算せず、Reactの
// レンダーも1回も走らない。指を離した瞬間は --p が目的地へ飛ぶが、
// transition が掛かっているので滑らかに追いつく
// (globals.css の .app-backdrop-cell)。

// 細かいグリッド。1マス = 画面幅の1/4。
const COLS = 4;
// 粗いグリッドの行数(ブリーフ)。1マス = 細かいマス4つぶん = 画面幅いっぱい。
const BIG = 4;
const BIG_ROWS = 3;
// ★細かいグリッドの行数は粗いグリッドのちょうど4倍にする。どちらも画面中心を
// 軸に上下へ展開するので、行数がこの関係のときだけ**2つのグリッドの境目が
// 完全に重なる**(細かい4マスがちょうど粗い1マスに収まる)。ずれていると、
// 大きくなる途中でマスが grid から外れて見える。
const ROWS = BIG_ROWS * BIG;
const U = "25vw";

// 地と図形。地はアプリのBGより少しだけ濃いグレー、図形はそれより薄い。
// 「背景がグレーで、図形があるところが薄い」という指定どおりの向き。
const GROUND = shade(BG, -4);
const MARK = shade(BG, 3);

const r4 = (n: number) => Math.round(n * 10000) / 10000;

// v0(タスク)→v1(ブリーフ)→v2(ジャーナル) を1本のcalc()で繋ぐ。
// --t1/--t2 は globals.css の .app-backdrop-grid が --p から作る。
function mix(v0: number, v1: number, v2: number, unit: string): string {
  return `calc(${r4(v0)}${unit} + (${r4(v1 - v0)}${unit}) * var(--t1) + (${r4(v2 - v1)}${unit}) * var(--t2))`;
}

interface Geom {
  /** 大きさ(マス単位)。1が細かいマス1つぶん、4で粗いマス1つぶん、0で消える。 */
  s: number;
  /** 角丸(%)。CSSと同じ TL,TR,BR,BL の順。50が全部で正円。 */
  rad: [number, number, number, number];
}

const CIRCLE: [number, number, number, number] = [50, 50, 50, 50];
// 左下が角の扇形 = 右上の角を1辺ぶん丸める。
const FAN_BL: [number, number, number, number] = [0, 100, 0, 0];

// ★マスは**一度も動かない**。変わるのは大きさ(と角の丸め方)だけ。
// 以前は、まとまる先の中心へマスを translate で寄せていたため、40個の図形が
// 画面を斜めに飛び回る動きになり「アニメーションがグリッドと無関係」に
// 見えていた。いまは各マスが自分のグリッドの位置に留まったまま、
// **境目だけが動く**: 粗いマスの左上に居るマスが右下へ伸びて4倍のマスに
// 育ち、その内側にいた他のマスは自分の左上へ畳まれて消える。つまり
// 「グリッドの境目が移動して一つのマスになり、そのマスに沿って図形が出る」。
// transform-origin を左上にしてあるのがその要(下の style を参照)。
function geomFor(mode: BackdropMode, c: number, r: number): Geom {
  if (mode === "dots") return { s: 1, rad: CIRCLE };
  if (mode === "leftFans") return c === 0 ? { s: 1, rad: FAN_BL } : { s: 0, rad: FAN_BL };
  // merged: 粗いマスの左上にあたる細かいマスだけが4倍に育つ。2つのグリッドは
  // 境目が完全に重なっているので、育った先はちょうど粗いマス1つぶんになる。
  const isTopLeftOfBigCell = c === 0 && r % BIG === 0;
  return { s: isTopLeftOfBigCell ? BIG : 0, rad: CIRCLE };
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
          // ★左上を軸に伸縮する。だからマスの左辺・上辺は動かず、右辺と下辺
          // (＝グリッドの境目)だけが滑っていく。中心を軸にすると、育つときに
          // マスがその場から外へはみ出して見え、グリッドから浮いてしまう。
          transformOrigin: "0 0",
          transform: `scale(${mix(g0.s, g1.s, g2.s, "")})`,
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
      zIndex: -1, background: GROUND,
    }}>
      <div className="app-backdrop-grid" style={{ position: "absolute", inset: 0 }}>{cells}</div>
    </div>
  );
}

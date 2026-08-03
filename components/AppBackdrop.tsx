"use client";

import type { CSSProperties } from "react";
import { BG } from "@/lib/constants";
import { shade } from "@/lib/helpers";

// ★アプリ全体の背景(2026-08-03 作り直し)。
//
// ■ 1枚のグリッドを3アプリで共有する
// 基準は**画面幅の半分(50vw)を1辺とする正方形**。画面はこれで縦に2列へ
// 割れ、その分かれ目がちょうど画面の中央線になる。行は画面中心を軸に
// 上下へ展開する(端は画面からはみ出して切れる)。
//
//   ジャーナル … 左の列は**塗りつぶしの長方形**(6マスを縦に貫く1本の帯)。
//                 右の列は、直線部分を画面右端に置いて左へふくらむ半円。
//   タスク    … 左の列にだけ「左下が角の扇形」を縦一列に並べる。右は地。
//   ブリーフ  … 2x2マス(=画面幅いっぱい)の正方形に内接する円。1マスには
//                 その四半分が入るので、4マスが集まって1つの円になる。
//
// ■ ★図形と地は同格(どちらも図形として扱う)
// 「薄い図形 / 濃い地」で固定しない。ジャーナルだけは**地が薄く、図形が
// グレー**で、タスク・ブリーフとは明暗が逆になる。アプリを移るとその
// 地の色ごと入れ替わる。
//
// ■ ★動きはモーフィングではなく「はけて、入ってくる」
// 各マスは**窓(overflow:hidden)**で、その中に3アプリぶん(＋一周ぶん)の
// 面を縦一列/横一列に並べた帯が入っている。アプリを移ると帯ごと1マス分
// スライドするので、いまの図形は窓の外へはけ、次の図形が窓の外から
// 入ってくる。**地の色を持つ面そのものが動く**ため、塗りつぶしの部分は
// 「長方形が伸びてきて塗りつぶす」ように見える。
// 左の列は縦、右の列は横に動かして、ただの視差に見えないようにしてある。
// 行ごとに少しずつ遅らせてあるので、帯は段々に塗り替わる。
//
// ■ 指の動きと直結
// 進み具合は AppShell が書く2つのCSS変数(--appi / --dragn)から作った連続値
// ひとつ(--p)だけで決まる。JSは毎フレーム何も計算せず、Reactのレンダーも
// 1回も走らない。マスあたりの変形は1つ(帯のtranslateだけ)。

const COLS = 2;
const ROWS = 6;
const U = "50vw";

// 明度は2値だけ。どちらが地でどちらが図形かはアプリによって入れ替わる。
const LIGHT = shade(BG, 3);
const GREY = shade(BG, -4);

interface Pane {
  /** この面の地の色(=マスいっぱいに広がる長方形そのもの)。 */
  ground: string;
  /** 地の上に乗る図形。無ければ地だけの面。 */
  shape?: CSSProperties;
}

// p の順に並べた面。0=ジャーナル 1=タスク 2=ブリーフ 3=ジャーナル(一周ぶん)。
function panesFor(c: number, r: number): Pane[] {
  const sub = r % 2; // 2x2の大きなマスの中で上半分か下半分か(ブリーフ用)。

  // ジャーナル: 地が薄く、図形がグレー。
  const journal: Pane = c === 0
    // 左の列は塗りつぶし。6マスが縦に繋がって1本の長方形になる。
    ? { ground: LIGHT, shape: { inset: 0, background: GREY } }
    // 右の列は半円。マスと同じ直径の円を右へ半分ずらし、窓で切って
    // 直線部分を画面右端に出す(左へふくらむ)。
    : { ground: LIGHT, shape: { left: "50%", top: 0, width: "100%", height: "100%", borderRadius: "50%", background: GREY } };

  // タスク: 地がグレー、図形が薄い。左の列にだけ「左下が角の扇形」。
  const tasks: Pane = c === 0
    ? { ground: GREY, shape: { inset: 0, borderRadius: "0 100% 0 0", background: LIGHT } }
    : { ground: GREY };

  // ブリーフ: 2x2マスに内接する円の、このマスに入る四半分。角の丸めは
  // 「大きなマスの中心から遠いほうの角」を落とす向きにする。
  const radius = c === 0
    ? (sub === 0 ? "100% 0 0 0" : "0 0 0 100%")
    : (sub === 0 ? "0 100% 0 0" : "0 0 100% 0");
  const brief: Pane = { ground: GREY, shape: { inset: 0, borderRadius: radius, background: LIGHT } };

  return [journal, tasks, brief, journal];
}

export function AppBackdrop() {
  const cells = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const panes = panesFor(c, r);
      // 左の列は縦、右の列は横へ動かす。
      const vertical = c === 0;
      cells.push(
        <div
          key={`${c}-${r}`}
          className={`app-backdrop-cell ${vertical ? "bd-v" : "bd-h"}`}
          style={{
            left: `calc(${U} * ${c})`,
            // 行は画面中心を軸に上下へ展開する(はみ出して構わない)。
            top: `calc(50svh - ${U} * ${ROWS / 2 - r})`,
            // 落ち着くときだけ行ごとに少し遅らせる(指で動かしている間は
            // トランジション自体が切ってあるので1:1で追従する)。
            ["--d" as string]: `${r * 34}ms`,
          }}
        >
          <div className="app-backdrop-strip">
            {panes.map((pane, i) => (
              <div key={i} className="app-backdrop-pane" style={{
                background: pane.ground,
                [vertical ? "top" : "left"]: `calc(100% * ${i})`,
              }}>
                {pane.shape && <div style={{ position: "absolute", ...pane.shape }} />}
              </div>
            ))}
          </div>
        </div>
      );
    }
  }
  return (
    <div aria-hidden style={{
      position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none",
      // 呼び出し元(シェル)に isolation:isolate を与えてあるので、-1にしても
      // シェルの外へ抜け落ちない。0のままだと、CSSの描画順の規則により
      // 通常フローの中身(タブの本文)より後に描かれて文字を覆ってしまう。
      zIndex: -1, background: GREY,
    }}>
      <div className="app-backdrop-grid" style={{ position: "absolute", inset: 0 }}>{cells}</div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BD_GREY, BD_LIGHT } from "@/lib/constants";
import type { AppId } from "@/lib/types";

// ★アプリ全体の背景(2026-08-03 作り直し・3度目)。
//
// ■ 何を変えたか
// これまでは背景を指の動き(--dragn)に1:1で溶接し、マスの中の図形を連続的に
// 変形させていた。だから「白い図形が動くだけ」に見えていた。
// **指の動きから完全に切り離した**。スワイプで画面(トラック)が先に移り、
// アプリが確定したところで、背景は**自分のアニメーションを1本流す**:
//   去るほう … いま出ている図形が、来た道を戻るように順にはけていく
//   来るほう … 新しい地の色が上から下りてきて、その後に図形が
//                1つずつ時間差で入ってくる
// 図形ごとに入り方が違う(帯は上から伸びる/三角は右から差し込む/扇形は角から
// 開く/円は中心から立ち上がる)。動画の参考どおり、1つの動きに全部を
// 乗せるのではなく、それぞれの figure が自分の動きを持つ。
//
// ■ 構図(グリッドは3アプリ共通・50vw)
// 基準は画面幅の半分(50vw)を1辺とする正方形。画面はこれで縦に2列へ割れ、
// 分かれ目がちょうど画面の中央線に来る。行は画面中心を軸に上下へ展開する。
//   ジャーナル … 左半分は**1枚の長い長方形**(グリッドを縦に横断する)。
//                 右の列は、1マスにぴったり収まる三角形(右辺が画面の端、
//                 頂点が左を向く)。
//   タスク    … 左の列にだけ「左下が角の扇形」を縦一列。右は地のまま。
//   ブリーフ  … 2x2マス(=画面幅いっぱい)に内接する円。
//
// ■ 図形と地は同格
// ジャーナルだけは地が薄く図形がグレーで、タスク・ブリーフとは明暗が逆。
//
// ■ 性能
// 指で引いている間、背景は**一切動かない**(計算もしない)。アプリが確定した
// 瞬間に、要素13枚以下のCSSアニメーションが1本走って終わる。以前のように
// 毎フレーム全マスの transform を calc し直すことがなくなった。

const LIGHT = BD_LIGHT;
const GREY = BD_GREY;

// 50vw のマスが縦に何行ぶん並ぶか(画面外へはみ出す分を含む)。
const ROWS = 6;
const U = "50vw";
// ブリーフの円(画面幅いっぱい)は何段か。ROWS のちょうど半分にすると、
// 2つのグリッドの境目が完全に重なる。
const BIG_ROWS = ROWS / 2;

// 去る側を画面に残しておく時間。いちばん遅い図形が消え、かつ新しい地が
// 完全に塗り終わるまで(globals.css の3拍のタイムラインを参照)。
const LEAVE_MS = 700;
// 入ってくるときの遅れ。地(180ms〜)が下りきってから figure が動き出す。
const IN_BAND = 340;
const IN_FIGURE = 420;
const IN_STEP = 60;
// 去るときの遅れ。上から順に、入るときより詰めて。
const OUT_STEP = 40;

interface Piece {
  cls: string;
  /** 入ってくるときの遅れ(ms)。 */
  din: number;
  /** 去るときの遅れ(ms)。上から順にはけるので行の順そのまま。 */
  dout: number;
  style: CSSProperties;
}

// 行 i(50vwのマス)の上端。画面中心を軸に上下へ展開する。
const rowTop = (i: number) => `calc(50svh - ${U} * ${ROWS / 2 - i})`;

function groundOf(app: AppId): string {
  return app === "journal" ? LIGHT : GREY;
}

function piecesFor(app: AppId): Piece[] {
  if (app === "journal") {
    const pieces: Piece[] = [
      // 左半分は1枚の長方形。グリッドを縦に横断するので、マスに割らずに
      // 1要素で持つ。上から下へ伸びてくる。
      { cls: "bd-band", din: IN_BAND, dout: 0, style: { left: 0, top: 0, width: U, height: "100%", background: GREY } },
    ];
    for (let i = 0; i < ROWS; i++) {
      // 1マスにぴったり収まる三角形。右辺が画面の端に重なり、頂点が左を向く。
      // clip-path はこの要素が2D変形(translateX)しか受けないので安全
      // (3D変形されたレイヤーに掛けると Safari で崩れる・HANDOFF §7.14)。
      pieces.push({
        cls: "bd-right", din: IN_FIGURE + i * IN_STEP, dout: i * OUT_STEP,
        style: { left: U, top: rowTop(i), width: U, height: U, clipPath: "polygon(100% 0, 100% 100%, 0 50%)", background: GREY },
      });
    }
    return pieces;
  }
  if (app === "tasks") {
    const pieces: Piece[] = [];
    for (let i = 0; i < ROWS; i++) {
      // 左下が角の扇形。その角(左下)を軸に開く。
      pieces.push({
        cls: "bd-corner", din: IN_FIGURE + i * IN_STEP, dout: i * OUT_STEP,
        style: { left: 0, top: rowTop(i), width: U, height: U, borderRadius: "0 100% 0 0", background: LIGHT },
      });
    }
    return pieces;
  }
  // ブリーフ: 画面幅いっぱいの円。中心から立ち上がる。
  const pieces: Piece[] = [];
  for (let k = 0; k < BIG_ROWS; k++) {
    pieces.push({
      cls: "bd-pop", din: IN_FIGURE + k * IN_STEP * 1.6, dout: k * OUT_STEP * 1.6,
      style: { left: 0, top: `calc(50svh - 100vw * ${BIG_ROWS / 2 - k})`, width: "100vw", height: "100vw", borderRadius: "50%", background: LIGHT },
    });
  }
  return pieces;
}

function Layer({ app, leaving }: { app: AppId; leaving?: boolean }) {
  return (
    // 去る層は、来る層と同じアニメーションを**逆再生**する(bd-leaving)。
    // 来た道をそのまま戻るので、動きの語彙が増えず、記述も半分で済む。
    <div className={`bd-layer${leaving ? " bd-leaving" : ""}`}>
      <div className="bd-piece bd-ground" style={{ background: groundOf(app) }} />
      {piecesFor(app).map((p, i) => (
        <div key={i} className={`bd-piece ${p.cls}`} style={{ ...p.style, ["--din" as string]: `${p.din}ms`, ["--dout" as string]: `${p.dout}ms` }} />
      ))}
    </div>
  );
}

export function AppBackdrop({ appId }: { appId: AppId }) {
  const [cur, setCur] = useState(appId);
  const [leaving, setLeaving] = useState<AppId | null>(null);
  // ★同じアプリへ戻ってきたときもアニメーションを必ず出し直すため、
  // 「何回目の切り替えか」を key に混ぜる(値の一致でReactが再利用するのを
  // 避ける。ゴールのシートで同じ問題を踏んだのと同じ対処・HANDOFF §7.29)。
  const [turn, setTurn] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (appId === cur) return;
    setLeaving(cur);
    setCur(appId);
    setTurn((n) => n + 1);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLeaving(null), LEAVE_MS);
  }, [appId, cur]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // ★いまの地の色を body にも書く。シェルの高さは 100svh 固定なので、
  // iOSでツールバーが引っ込んで表示領域が広がると、その差の帯が背景に
  // 覆われず body の色のまま残る。地の色と違うと、そこが「画面の端」の
  // 線として見えてしまう(実機で報告された症状)。
  useEffect(() => {
    const c = groundOf(cur);
    document.body.style.backgroundColor = c;
    document.documentElement.style.backgroundColor = c;
  }, [cur]);

  return (
    <div aria-hidden style={{
      position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none",
      // 呼び出し元(シェル)に isolation:isolate を与えてあるので、-1にしても
      // シェルの外へ抜け落ちない。0のままだと、CSSの描画順の規則により
      // 通常フローの中身(タブの本文)より後に描かれて文字を覆ってしまう。
      zIndex: -1, background: GREY,
    }}>
      {leaving && <Layer key={`out-${turn}`} app={leaving} leaving />}
      <Layer key={`in-${turn}`} app={cur} />
    </div>
  );
}

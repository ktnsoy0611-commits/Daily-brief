"use client";

import { type CSSProperties } from "react";
import { PAPER, RUST, SANS } from "@/lib/constants";

// ★声のメモのカセットプレイヤー。
//
// ユーザー本人が持っているカセットプレイヤー(黄色い本体・青い前面パネル・
// 灰色の扉・濃灰の天面)を、アーカイブのバインダー(components/Binder.tsx)と
// 同じ「面を組んだ3Dの箱」として作る。録音中は画面の中央に出てきてリールが
// 回り、送信すると蓋が開いて中のカセットが飛んでいく。
//
// 面の組み方・注意点はBinder3Dと共通:
//   - 3D変形される要素には border-radius / overflow:hidden / box-shadow を
//     持たせない(Safariで角丸のクリップ・影の合成が崩れる。§5・§7.9・§7.14)。
//     角丸とクリップは、3D変形を受けない「中身の面」自身が持つ。
//   - 箱の影は、perspective を持つだけで自身は3D変形されていない一番外側の
//     箱に box-shadow で付ける(§7.18)。
//
// 座標はすべて下の基準サイズ(W×H)の中の px で書き、表示するときに scale() で
// まとめて縮める(数字を読みやすくするため)。

const W = 300;   // 基準の幅
const H = 232;   // 基準の高さ
const D = 26;    // 本体の厚み
const R = 16;    // 本体の角丸

// のぞき窓。カセット本体と蓋もこの矩形に合わせて置く。
const WIN = { x: 128, y: 26, w: 146, h: 88 };
// 蓋(スモークの窓)の z 位置。カセット(下記)より手前に来るようにする。
const LID_Z = D / 2 + 1.2;
const TAPE_Z = D / 2 + 0.6;

const BODY = "#D2A03B";        // 本体の黄
const BODY_DARK = "#A87B28";   // 側面(黄を暗くしたもの)
const PANEL = "#2C6E8A";       // 前面パネルの青(BLUEと同系)
const TOPCASE = "#3B3B39";     // 天面の濃灰
const TOPCASE_HI = "#565654";  // 天面のボタン
const DOOR = "#9C9C96";        // 下の扉の灰
const GLASS = "#151C20";       // 窓の奥(暗がり)
const TAPE = "#26262A";        // カセット本体
const TAPE_DEEP = "#141416";   // リールの軸・スポーク
const HUB = "#CFCFC8";         // リールのハブ

// ---- 部品 ------------------------------------------------------------------

// リール。スポーク(3本の棒)があることで回転が読める。
function Reel({ size, spinMs, spinning }: { size: number; spinMs: number; spinning: boolean }) {
  return (
    <div style={{ position: "relative", width: size, height: size, borderRadius: "50%", background: HUB }}>
      <div
        className={spinning ? "cp-reel" : undefined}
        style={{ position: "absolute", inset: 0, animationDuration: `${spinMs}ms` }}
      >
        {[0, 60, 120].map((deg) => (
          <div key={deg} style={{
            position: "absolute", left: "50%", top: "50%",
            width: size * 0.84, height: 3, marginLeft: -size * 0.42, marginTop: -1.5,
            background: TAPE_DEEP, transform: `rotate(${deg}deg)`,
          }} />
        ))}
        <div style={{
          position: "absolute", left: "50%", top: "50%",
          width: size * 0.3, height: size * 0.3, marginLeft: -size * 0.15, marginTop: -size * 0.15,
          borderRadius: "50%", background: TAPE_DEEP,
        }} />
      </div>
    </div>
  );
}

// 窓の中のカセット。送信するときはこれが上へ飛んでいく(cp-eject)。
// ★このカセットは面(前面)のクリップの外側の層に置く。前面は角丸で
// overflow:hidden なので、その中に置くと飛び出したところで切り取られる。
function Cassette({ spinning, ejecting }: { spinning: boolean; ejecting: boolean }) {
  const w = WIN.w - 12;
  const h = WIN.h - 12;
  const reel = 44;
  return (
    <div className={ejecting ? "cp-eject" : undefined} style={{
      position: "absolute", left: WIN.x + 6, top: WIN.y + 6, width: w, height: h,
      borderRadius: 4, background: TAPE,
    }}>
      {/* 上端のラベル(紙の帯) */}
      <div style={{ position: "absolute", left: 7, right: 7, top: 6, height: 13, borderRadius: 2, background: PAPER, opacity: 0.88 }} />
      <div style={{ position: "absolute", left: 11, top: 10, width: 34, height: 2, background: "rgba(26,26,24,0.34)" }} />
      <div style={{ position: "absolute", left: 11, top: 15, width: 20, height: 2, background: "rgba(26,26,24,0.20)" }} />
      {/* 左右のリール */}
      <div style={{ position: "absolute", left: 12, top: h - reel - 8 }}>
        <Reel size={reel} spinMs={2600} spinning={spinning} />
      </div>
      <div style={{ position: "absolute", left: w - reel - 12, top: h - reel - 8 }}>
        <Reel size={reel} spinMs={2600} spinning={spinning} />
      </div>
      {/* テープの走る窓(下端の細い抜き) */}
      <div style={{ position: "absolute", left: w / 2 - 13, top: h - 15, width: 26, height: 7, borderRadius: 1, background: TAPE_DEEP }} />
    </div>
  );
}

// 扉のすべり止めのドット(写真の指かけ)。
function DoorDots() {
  const cols = 4;
  const rows = 3;
  return (
    <div style={{ position: "absolute", left: 16, top: 14, display: "grid", gridTemplateColumns: `repeat(${cols}, 13px)`, gridTemplateRows: `repeat(${rows}, 12px)` }}>
      {Array.from({ length: cols * rows }, (_, i) => (
        <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(26,26,24,0.30)" }} />
      ))}
    </div>
  );
}

// ラジオのダイヤル(目盛りとつまみ)。
function Dial() {
  const ticks = 9;
  return (
    <div style={{ position: "absolute", left: 118, top: 130, width: 168, height: 30 }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 13, height: 2, background: "rgba(250,250,249,0.34)" }} />
      {Array.from({ length: ticks }, (_, i) => (
        <div key={i} style={{
          position: "absolute", left: (168 / (ticks - 1)) * i, top: 4, width: 2, height: i % 2 === 0 ? 9 : 5,
          background: "rgba(250,250,249,0.42)",
        }} />
      ))}
      <div style={{ position: "absolute", left: 74, top: 9, width: 13, height: 11, borderRadius: 2, background: "#DDDDD6" }} />
    </div>
  );
}

// ---- 前面 ------------------------------------------------------------------

// ★この面自身は3D変形を受けない(受けるのは外側のラッパー)。角丸と
// overflow:hidden をここが持つことで、Safariでも正しくクリップされる。
function PlayerFace({ recording }: { recording: boolean }) {
  return (
    <div style={{ position: "absolute", inset: 0, borderRadius: R, overflow: "hidden", background: BODY }}>
      {/* 前面パネル(青)。左上だけ大きく丸める。 */}
      <div style={{ position: "absolute", left: 104, top: 0, right: 0, bottom: 60, background: PANEL, borderTopLeftRadius: 60 }} />
      {/* 窓の奥(暗がり)。この上にカセット、さらにその上に蓋が重なる。 */}
      <div style={{
        position: "absolute", left: WIN.x, top: WIN.y, width: WIN.w, height: WIN.h,
        borderRadius: 10, background: GLASS,
        // 奥まって見えるように内側に影を落とす(この面は3D変形を受けない
        // ので box-shadow を使ってよい)。カセットが飛んでいったあと、
        // 空になった中がへこんで見える。
        boxShadow: "inset 0 3px 7px rgba(0,0,0,0.55)",
      }} />
      <Dial />
      {/* オレンジのしるし(ロゴの位置) */}
      <div style={{ position: "absolute", left: 220, top: 148, width: 54, height: 9, borderRadius: 4.5, background: RUST }} />
      {/* 左の縦のロゴ */}
      <div style={{
        position: "absolute", left: 18, top: 26, writingMode: "vertical-rl",
        fontFamily: SANS, fontSize: 11, fontWeight: 800, letterSpacing: "0.26em", color: "rgba(26,26,24,0.60)",
      }}>MEMO</div>
      {/* 録音ランプ */}
      <div className={recording ? "cp-rec" : undefined} style={{
        position: "absolute", left: 40, top: 122, width: 13, height: 13, borderRadius: "50%",
        background: RUST, opacity: recording ? 1 : 0.3,
      }} />
      {/* 下の扉(灰) */}
      <div style={{ position: "absolute", left: 70, top: 172, right: 0, bottom: 0, background: DOOR, borderTopLeftRadius: 12 }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 1, background: "rgba(26,26,24,0.18)" }} />
        <DoorDots />
      </div>
    </div>
  );
}

// ---- 箱 --------------------------------------------------------------------

export type PlayerMode = "recording" | "sending";

export function CassettePlayer({ width = 300, mode }: { width?: number; mode: PlayerMode }) {
  const k = width / W;
  const recording = mode === "recording";
  const ejecting = mode === "sending";
  const lidStyle: CSSProperties = {
    position: "absolute", left: WIN.x - 4, top: WIN.y - 4, width: WIN.w + 8, height: WIN.h + 8,
    borderRadius: 11,
    // スモークの窓。中のカセットが透けて見えるくらいの濃さにする。
    background: "linear-gradient(148deg, rgba(255,255,255,0.16) 0%, rgba(20,28,32,0.60) 34%, rgba(20,28,32,0.72) 100%)",
    border: "1px solid rgba(250,250,249,0.14)",
    transformOrigin: "50% 100%",
    transform: `translateZ(${LID_Z}px)`,
    ...({ ["--cp-lid-z" as string]: `${LID_Z}px` } as CSSProperties),
  };
  return (
    // 外側の箱はレイアウト上の実寸(縮めたあとの大きさ)だけを持つ。
    <div style={{ width: W * k, height: H * k }}>
      <div style={{ width: W, height: H, transform: `scale(${k})`, transformOrigin: "0 0" }}>
        {/* ★影はここ(perspectiveを持つだけで自身は3D変形されない箱)に付ける。 */}
        <div className="cp-enter" style={{
          width: W, height: H, perspective: 900,
          filter: "drop-shadow(0 22px 40px rgba(0,0,0,0.42))",
        }}>
          <div style={{
            position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d",
            // ★少し上から・少し右から見た角度。rotateX は「負」で上から見た
            // 形になる(正にすると下から見上げる形になり、天面が裏を向いて
            // backface-visibility で消える)。
            transform: "rotateX(-13deg) rotateY(-13deg)",
          }}>
            {/* 前面 */}
            <div style={{ position: "absolute", inset: 0, transform: `translateZ(${D / 2}px)` }}>
              <PlayerFace recording={recording} />
            </div>
            {/* 天面(濃灰・ボタン)。★左右を角丸の半径ぶん内側に寄せている:
                前面は角が丸いのに、この面を端まで伸ばすと丸めた角の外側へ
                直角の板が突き出て見える(§5・§7.13のBinderEdgeFaceと同じ
                崩れ方)。角丸の部分には面を作らないことで構造的に避ける。 */}
            <div style={{
              position: "absolute", left: R, right: R, top: 0, height: D, background: TOPCASE,
              transform: `rotateX(90deg) translateZ(${D / 2}px)`,
              backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
            }}>
              <div style={{ position: "absolute", left: 46, top: 7, width: 52, height: 11, borderRadius: 3, background: TOPCASE_HI }} />
              <div style={{ position: "absolute", left: 152, top: 7, width: 52, height: 11, borderRadius: 3, background: TOPCASE_HI }} />
            </div>
            {/* 右の側面(上下も同じ理由で角丸のぶん内側に寄せる) */}
            <div style={{
              position: "absolute", right: 0, top: R, bottom: R, width: D, background: BODY_DARK,
              transform: `rotateY(90deg) translateZ(${D / 2}px)`,
              backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
            }}>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(0,0,0,0.20), rgba(0,0,0,0.02))" }} />
            </div>
            {/* カセットの層。前面のクリップの外にあるので、飛び出しても切れない。 */}
            <div style={{ position: "absolute", inset: 0, transform: `translateZ(${TAPE_Z}px)` }}>
              <Cassette spinning={recording} ejecting={ejecting} />
            </div>
            {/* 蓋(スモークの窓)。送信するとき下端を軸に手前へ開く。 */}
            <div className={ejecting ? "cp-lid" : undefined} style={lidStyle} />
          </div>
        </div>
      </div>
    </div>
  );
}

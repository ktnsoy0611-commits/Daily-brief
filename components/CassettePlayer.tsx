"use client";

import { type CSSProperties } from "react";

// ★声のメモのカセットプレイヤー。ユーザー本人が持っている実機(SONY
// WM-FS191)の写真から起こした。アーカイブのバインダー(components/Binder.tsx)と
// 同じ「面を組んだ3Dの箱」として作る。
//
// 実機の作り(写真から読み取ったこと):
//   - 本体は**縦長**。実寸 91×116×36mm なので、前面の縦横比は 0.78、厚みは
//     幅の 0.36 もある。ずんぐりした箱で、薄い板ではない。
//   - 黄色いのは**カセットの蓋**で、灰色のシャーシに被さっている一枚の
//     厚いシェル。角がとても丸く、上端・右端では側面へ回り込んでいる。
//   - 蓋の上に青いラベルが刷ってあり、その中に縦のチューニング目盛りと、
//     スモークの窓(中のカセットがうっすら見える)がある。左端の縦長の
//     灰色の帯は、シャーシ側のくぼみ(上半分に滑り止めのドット)。
//   - 天面は灰色で、黒い操作ボタンが4つ、くぼんだ溝に並ぶ。右の側面には
//     細長い通気の溝が3本。
//
// 面の組み方・注意点はBinder3Dと共通:
//   - 3D変形される要素には border-radius / overflow:hidden / box-shadow を
//     持たせない(Safariで角丸のクリップ・影の合成が崩れる。§5・§7.9・§7.14)。
//     角丸とクリップは、3D変形を受けない「中身の面」自身が持つ。
//   - 天面・側面は角丸の半径ぶん内側に寄せる。端まで伸ばすと、丸めた角の
//     外側へ直角の板が突き出て見える(§7.13)。
//   - 上から見た角度は `rotateX` が「負」(正だと下から見上げる形になり、
//     天面が裏を向いて backface-visibility で消える)。
//   - 箱の影は、perspective を持つだけで自身は3D変形されていない一番外側の
//     箱に付ける(§7.18)。
//
// 座標はすべて下の基準サイズ(W×H)の中の px で書き、表示するときに `scale()`
// でまとめて縮める(数字を読みやすくするため)。

const W = 240;   // 基準の幅
const H = 306;   // 基準の高さ(実機の 91:116)
const D = 84;    // 厚み(実機の 36mm 相当)
const R = 18;    // 本体の角丸(★天面・側面はこの分だけ内側に寄せるので、
                 // 大きくするほど角に隙間が見える。控えめにする)

// 蓋(黄色いシェル)。前面いっぱいに被さる。左右を内側に寄せると、側面の
// 面との間に隙間(奥が透ける段差)ができるので寄せない。下だけシャーシの
// 縁が覗く。
const DOOR = { x: 0, y: 0, w: W, h: H - 4, r: 20 };
const DOOR_Z = D / 2 + 2.5;   // 蓋は前面よりほんの少し手前(別部品なので)
const BAY_Z = D / 2 + 0.8;    // 中のカセット

const YELLOW = "#E8A319";
const YELLOW_DEEP = "#C4841A";
const CHASSIS = "#7C7A73";
const CHASSIS_DEEP = "#63615B";
const CHASSIS_DARK = "#4E4C48";
const NAVY = "#1B3A4B";       // SONY のロゴ・青ラベルの文字
const LABEL_BLUE = "#2B5B96";
const ORANGE = "#D9531E";
const SMOKE = "rgba(16,22,26,0.88)";
const BAY = "#33322F";
const TAPE = "#26262A";
const TAPE_DEEP = "#131315";
const HUB = "#CFCFC8";
const PAPER_LABEL = "#EFEDE6";

// ---- 部品 ------------------------------------------------------------------

// リール。スポーク(3本の棒)があることで回転が読める。
function Reel({ size, spinning, spinMs = 2600 }: { size: number; spinning: boolean; spinMs?: number }) {
  return (
    <div style={{ position: "relative", width: size, height: size, borderRadius: "50%", background: HUB }}>
      <div className={spinning ? "cp-reel" : undefined} style={{ position: "absolute", inset: 0, animationDuration: `${spinMs}ms` }}>
        {[0, 60, 120].map((deg) => (
          <div key={deg} style={{
            position: "absolute", left: "50%", top: "50%",
            width: size * 0.84, height: Math.max(2, size * 0.07), marginLeft: -size * 0.42, marginTop: -Math.max(1, size * 0.035),
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

// ドットの滑り止め(蓋の左の灰色の帯・天面の左)。
function Dots({ cols, rows, pitch, size, color }: { cols: number; rows: number; pitch: number; size: number; color: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${pitch}px)`, gridAutoRows: `${pitch}px` }}>
      {Array.from({ length: cols * rows }, (_, i) => (
        <div key={i} style={{ width: size, height: size, borderRadius: "50%", background: color }} />
      ))}
    </div>
  );
}

// ---- 蓋(黄色いシェル)-------------------------------------------------------

// ★この面自身は3D変形を受けない(受けるのは外側のラッパー)。角丸と
// overflow:hidden をここが持つことで、Safariでも正しくクリップされる。
function DoorFace({ recording }: { recording: boolean }) {
  return (
    // ★この面は3D変形を受けないので box-shadow を使ってよい。内側に光と影を
    // 落として、平らな板ではなく「丸みのある樹脂のシェル」に見せる。
    <div style={{
      position: "absolute", inset: 0, borderRadius: DOOR.r, overflow: "hidden", background: YELLOW,
      boxShadow: "inset 11px 12px 20px rgba(255,255,255,0.26), inset -12px -16px 26px rgba(0,0,0,0.20)",
    }}>
      {/* SONY(右上) */}
      <div style={{
        position: "absolute", right: 20, top: 16,
        fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", color: NAVY,
        fontFamily: "Futura, 'Century Gothic', system-ui, sans-serif",
      }}>SONY</div>

      {/* 左の灰色の帯(シャーシのくぼみ)。上半分にドットの滑り止め。 */}
      <div style={{
        position: "absolute", left: 13, top: 44, width: 40, height: 206, borderRadius: 8,
        background: CHASSIS_DEEP, boxShadow: "inset 0 2px 5px rgba(0,0,0,0.38), inset 0 -1px 0 rgba(255,255,255,0.14)",
      }}>
        <div style={{ position: "absolute", left: 7, top: 12 }}>
          <Dots cols={3} rows={4} pitch={9} size={5} color="rgba(26,26,24,0.44)" />
        </div>
      </div>

      {/* 青いラベル。右側だけ大きく丸い。 */}
      <div style={{
        position: "absolute", left: 56, top: 46, width: 132, height: 204,
        borderRadius: "6px 48px 44px 6px", background: LABEL_BLUE,
      }}>
        {/* 縦のチューニング目盛り(左=AM・右=FM の2列) */}
        <div style={{ position: "absolute", left: 25, top: 26, width: 10, height: 146, borderRadius: 5, background: "#12161A" }} />
        <div style={{ position: "absolute", left: 23, top: 84, width: 14, height: 8, borderRadius: 2, background: "#B9C4C9" }} />
        {Array.from({ length: 5 }, (_, i) => (
          <div key={`am${i}`} style={{ position: "absolute", left: 10, top: 36 + i * 26, width: 12, height: 1.5, background: "rgba(250,250,249,0.60)" }} />
        ))}
        {Array.from({ length: 6 }, (_, i) => (
          <div key={`fm${i}`} style={{ position: "absolute", left: 38, top: 32 + i * 24, width: 10, height: 1.5, background: "rgba(250,250,249,0.60)" }} />
        ))}

        {/* スモークの窓。中のカセットがうっすら見える(実機と同じで、これは
            蓋に付いている窓なので、蓋が開くと一緒に開く)。青いラベルの中に
            収め、右と下に青い縁を残す。 */}
        <div style={{
          position: "absolute", left: 52, top: 16, width: 68, height: 172,
          borderRadius: "20px 36px 34px 20px", background: SMOKE, overflow: "hidden",
        }}>
          <div style={{ position: "absolute", left: 11, top: 22, opacity: 0.5 }}>
            <Reel size={44} spinning={recording} />
          </div>
          <div style={{ position: "absolute", left: 11, top: 104, opacity: 0.5 }}>
            <Reel size={44} spinning={recording} />
          </div>
          {/* 斜めの映り込み */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(128deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 46%)" }} />
        </div>

        {/* オレンジのロゴ(sports)と、その下の白い行(WALKMAN FM/AM)。
            実機と同じで、窓の下の方に重なって刷ってある。 */}
        <div style={{ position: "absolute", left: 10, top: 158, width: 96, height: 13, borderRadius: 6.5, background: ORANGE }} />
        <div style={{ position: "absolute", left: 22, top: 177, width: 76, height: 6, borderRadius: 3, background: "rgba(250,250,249,0.88)" }} />
      </div>

      {/* 録音ランプ(実機には無いが、録音中であることの手がかりとして左下に置く) */}
      <div className={recording ? "cp-rec" : undefined} style={{
        position: "absolute", left: 24, top: 264, width: 12, height: 12, borderRadius: "50%",
        background: ORANGE, opacity: recording ? 1 : 0.26,
      }} />

      {/* 光沢。丸みのあるプラスチックに見えるよう、左上から斜めに白を落とす。 */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(122deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0.04) 34%, rgba(0,0,0,0.10) 100%)", pointerEvents: "none" }} />
    </div>
  );
}

// ---- シャーシ(蓋の下。開くとここが見える)------------------------------------

function ChassisFace() {
  return (
    <div style={{ position: "absolute", inset: 0, borderRadius: R, overflow: "hidden", background: CHASSIS }}>
      {/* カセットの入る窪み */}
      <div style={{
        position: "absolute", left: 14, top: 16, right: 14, bottom: 20, borderRadius: 14,
        background: BAY, boxShadow: "inset 0 4px 10px rgba(0,0,0,0.55)",
      }} />
      {/* 機構(ヘッド・キャプスタン)の気配 */}
      <div style={{ position: "absolute", left: 26, top: 130, width: 26, height: 44, borderRadius: 3, background: CHASSIS_DEEP }} />
      <div style={{ position: "absolute", left: 30, top: 190, width: 8, height: 8, borderRadius: "50%", background: CHASSIS_DARK }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(122deg, rgba(255,255,255,0.10), rgba(0,0,0,0.10))", pointerEvents: "none" }} />
    </div>
  );
}

// 窪みの中のカセット(縦向き。リールは上下に並ぶ)。送信するときはこれが
// 上へ飛んでいく(cp-eject)。
function Cassette({ spinning, ejecting }: { spinning: boolean; ejecting: boolean }) {
  const w = 150;
  const h = 234;
  const reel = 58;
  return (
    <div className={ejecting ? "cp-eject" : undefined} style={{
      position: "absolute", left: (W - w) / 2, top: 34, width: w, height: h, borderRadius: 5, background: TAPE,
    }}>
      {/* 紙のラベル(長辺に沿った帯) */}
      <div style={{ position: "absolute", left: 7, top: 9, width: 30, height: h - 18, borderRadius: 2, background: PAPER_LABEL, opacity: 0.92 }} />
      <div style={{ position: "absolute", left: 12, top: 18, width: 3, height: 52, background: "rgba(26,26,24,0.30)" }} />
      <div style={{ position: "absolute", left: 19, top: 18, width: 3, height: 32, background: "rgba(26,26,24,0.18)" }} />
      {/* リール(上下) */}
      <div style={{ position: "absolute", left: 64, top: 30 }}><Reel size={reel} spinning={spinning} /></div>
      <div style={{ position: "absolute", left: 64, top: 146 }}><Reel size={reel} spinning={spinning} /></div>
      {/* テープの走る窓 */}
      <div style={{ position: "absolute", left: w - 16, top: h / 2 - 13, width: 7, height: 26, borderRadius: 1, background: TAPE_DEEP }} />
    </div>
  );
}

// ---- 箱 --------------------------------------------------------------------

export type PlayerMode = "idle" | "recording" | "sending";

export function CassettePlayer({ width = 240, mode, onTap }: { width?: number; mode: PlayerMode; onTap?: () => void }) {
  const k = width / W;
  const recording = mode === "recording";
  const ejecting = mode === "sending";
  // 蓋は左端(蝶番)を軸に手前へ開く。★translateZ は3Dの位置そのものなので、
  // 回転だけを足せるようキーフレームへ変数で渡す。
  const doorStyle: CSSProperties = {
    position: "absolute", left: DOOR.x, top: DOOR.y, width: DOOR.w, height: DOOR.h,
    transformOrigin: "0% 50%",
    transform: `translateZ(${DOOR_Z}px)`,
    ...({ ["--cp-door-z" as string]: `${DOOR_Z}px` } as CSSProperties),
  };
  return (
    // 外側の箱はレイアウト上の実寸(縮めたあとの大きさ)だけを持つ。
    <div style={{ width: W * k, height: H * k }}>
      <div style={{ width: W, height: H, transform: `scale(${k})`, transformOrigin: "0 0" }}>
        {/* ★影はここ(perspectiveを持つだけで自身は3D変形されない箱)に付ける。 */}
        <div
          className="cp-enter"
          onClick={onTap}
          role={onTap ? "button" : undefined}
          aria-label={onTap ? (recording ? "録音を終える" : "録音する") : undefined}
          style={{
            width: W, height: H, perspective: 900, cursor: onTap ? "pointer" : "default",
            filter: "drop-shadow(0 20px 34px rgba(0,0,0,0.34))",
          }}
        >
          <div style={{
            position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d",
            transform: "rotateX(-15deg) rotateY(-21deg)",
          }}>
            {/* ★中身の芯。天面・側面は角丸の半径ぶん内側に寄せてあるため、
                角のところだけ面が無く、そのままだと背景が透けて見える(丸めた
                角の外へ直角の板を突き出させない代わりの穴)。箱の真ん中の
                深さに、本体と同じ輪郭の暗い板を1枚入れておくと、その穴から
                見えるのが背景ではなく「箱の中の陰」になる。 */}
            <div style={{ position: "absolute", inset: 0, borderRadius: R, background: CHASSIS_DARK, transform: "translateZ(0px)" }} />
            {/* 前面=シャーシ(蓋を開けると見える) */}
            <div style={{ position: "absolute", inset: 0, transform: `translateZ(${D / 2}px)` }}>
              <ChassisFace />
            </div>
            {/* 窪みの中のカセット */}
            <div style={{ position: "absolute", inset: 0, transform: `translateZ(${BAY_Z}px)` }}>
              <Cassette spinning={recording} ejecting={ejecting} />
            </div>
            {/* 天面(灰色・黒いボタン4つ)。左右は角丸のぶん内側に寄せる。 */}
            <div style={{
              position: "absolute", left: R, right: R, top: 0, height: D, background: CHASSIS_DEEP,
              transform: `rotateX(90deg) translateZ(${D / 2}px)`,
              backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
            }}>
              {/* ボタンのくぼんだ溝。浅い角度でしか見えないので、いちばん
                  見える手前寄り(=この面の下の方)に置く。 */}
              <div style={{
                position: "absolute", left: 40, bottom: 20, right: 8, height: 30, borderRadius: 6,
                background: CHASSIS_DARK, boxShadow: "inset 0 2px 4px rgba(0,0,0,0.45)",
                display: "flex", alignItems: "center", gap: 5, padding: "0 6px",
              }}>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} style={{ flex: 1, height: 20, borderRadius: 3, background: "#1B1B1C" }} />
                ))}
              </div>
              <div style={{ position: "absolute", left: 8, bottom: 22 }}>
                <Dots cols={3} rows={3} pitch={8} size={4} color="rgba(26,26,24,0.34)" />
              </div>
              {/* 蓋(黄色いシェル)が天面へ回り込んでいる帯。手前の縁に置く。 */}
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 22, background: `linear-gradient(0deg, ${YELLOW} 0%, ${YELLOW_DEEP} 100%)` }} />
            </div>
            {/* 右の側面(通気の溝3本)。上下は角丸のぶん内側に寄せる。 */}
            <div style={{
              position: "absolute", right: 0, top: R, bottom: R, width: D, background: CHASSIS_DEEP,
              transform: `rotateY(90deg) translateZ(${D / 2}px)`,
              backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
            }}>
              {/* 通気の細い溝(実機は縦長の穴が3つ) */}
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ position: "absolute", left: 26, top: 40 + i * 66, width: 40, height: 10, borderRadius: 5, background: "rgba(0,0,0,0.30)" }} />
              ))}
              {/* 蓋の回り込み(手前の縁=この面の左端) */}
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 22, background: `linear-gradient(90deg, ${YELLOW} 0%, ${YELLOW_DEEP} 100%)` }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(0,0,0,0.06), rgba(0,0,0,0.30))", pointerEvents: "none" }} />
            </div>
            {/* 蓋。閉じている間はシャーシと中のカセットを覆い隠す。 */}
            <div className={ejecting ? "cp-door" : undefined} style={doorStyle}>
              <DoorFace recording={recording} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

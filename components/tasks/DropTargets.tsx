"use client";

import { useEffect, useRef, useState } from "react";
import { NAV_H, PAPER } from "@/lib/constants";
import { createAnchorRect } from "@/lib/motion";
import { SPACE } from "@/lib/tokens";

// ★★図形を**掴んでいるあいだ**だけ出てくる的(第44巡に DRIFT で作り、第54巡に
// GRAVITY へも広げたので共通部品へ切り出した)。
//   上 = 口         … 飲み込む。DRIFT では「タスクにする」、GRAVITY では「完了」。
//   下 = ブラックホール … 捨てる。どちらの層でも「削除」。
//
// ★★★第57巡の作り直し(「丸の中に図が描いてあるだけ」というユーザー指摘)。
//  1. **右下の「作る」の丸から分離して出てくる**。`createAnchorRect()` でその丸の
//     場所を測り、そこからの差を `--ox`/`--oy` に入れて CSS が飛ばす。
//  2. **近さを連続値で持つ**(`aimTargets` が `--near` を毎フレーム書く)。
//     真偽だけだと「近づけると開く / 回転が速くなる」が作れない。
//  3. 口は**上下の唇**。近づくと開き、指の方へ少し寄る。常にわずかに呼吸している。
//  4. ゴミ箱は**ブラックホール**。ゆっくり回り、近づくと速く回って塵が舞う。
//
// 見た目と動きは `app/globals.css` の `.drift-target`。ここは器と当たり判定だけ。

export type DropTarget = "trash" | "mouth" | null;

/** 的の当たり判定。指の座標(clientX/Y)が的の矩形＋遊びの中にあるか。 */
const PAD = 14;
/** 「近い」と見なす距離。ここで `--near` が 0、的の中心で 1。 */
const NEAR_R = 150;
/** 口が指の方へ寄る量(近さ 1 のときの px)。 */
const LEAN = 9;

const inRect = (el: HTMLElement | null, cx: number, cy: number) => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return cx >= r.left - PAD && cx <= r.right + PAD && cy >= r.top - PAD && cy <= r.bottom + PAD;
};

export function targetAt(
  mouth: HTMLElement | null, trash: HTMLElement | null, cx: number, cy: number,
): DropTarget {
  if (inRect(mouth, cx, cy)) return "mouth";
  if (inRect(trash, cx, cy)) return "trash";
  return null;
}

/**
 * ★★当たり判定を返しつつ、**近さ**を的の CSS 変数へ書く(第57巡)。
 * 指の追従なので `setState` しない ― 呼ぶのは各層の `move` の中だけ。
 *   `--near` … 0..1(`NEAR_R` で 0、中心で 1)
 *   `--lx` / `--ly` … 指の方へ寄る量(px)。口が使う。
 */
export function aimTargets(
  mouth: HTMLElement | null, trash: HTMLElement | null, cx: number, cy: number,
): DropTarget {
  for (const el of [mouth, trash]) {
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const dx = cx - (r.left + r.width / 2);
    const dy = cy - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    const near = Math.max(0, Math.min(1, 1 - d / NEAR_R));
    el.style.setProperty("--near", near.toFixed(3));
    const k = (near * LEAN) / (d || 1);
    el.style.setProperty("--lx", `${(dx * k).toFixed(1)}px`);
    el.style.setProperty("--ly", `${(dy * k).toFixed(1)}px`);
  }
  return targetAt(mouth, trash, cx, cy);
}

/** 離した瞬間のアクションの合図(CSS の `[data-fire]`)。 */
export const FIRE_MS = 460;
export function fireTarget(el: HTMLElement | null) {
  if (!el) return;
  el.setAttribute("data-fire", "");
  window.setTimeout(() => el.removeAttribute("data-fire"), FIRE_MS);
}

export function DropTargets({ show, hover, mouthRef, trashRef }: {
  /** 掴んでいるあいだ true(作るボタンから分離して出てくる)。 */
  show: boolean;
  hover: DropTarget;
  mouthRef: React.MutableRefObject<HTMLDivElement | null>;
  trashRef: React.MutableRefObject<HTMLDivElement | null>;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // ★出どころを**測ってから**滑り出す。同じ描画で `--ox` と `.in` を一緒に変えると、
  //   ブラウザは**古い `--ox`**から補間してしまう(別のアプリを見ている間に測った値が
  //   残る)。1フレームだけ置いて、変数が入ってから `.in` を付ける。
  const [armed, setArmed] = useState(false);
  // ★出どころ ―「作る」の丸の中心までの差を測って `--ox`/`--oy` へ。
  //   出るときも帰るときも**黒い丸から生えて、黒い丸へ吸い込まれる**ように見える。
  //   ★★的そのものを `getBoundingClientRect` で測らないこと — 的には
  //   `transform: translate(var(--ox)…) scale(0.18)` が**すでに掛かっている**ので、
  //   測ると自分の変形ぶんだけずれた値が返る(第57巡に踏んだ)。器の矩形と
  //   `offsetTop`(変形の影響を受けない)から**素の中心**を出す。
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const a = createAnchorRect();
    const wr = wrap.getBoundingClientRect();
    for (const el of [mouthRef.current, trashRef.current]) {
      if (!el) continue;
      if (!show) { el.style.setProperty("--near", "0"); el.style.setProperty("--lx", "0px"); el.style.setProperty("--ly", "0px"); }
      if (!a) { el.style.setProperty("--ox", "0px"); el.style.setProperty("--oy", "0px"); continue; }
      const cx = wr.left + el.offsetLeft + el.offsetWidth / 2;
      const cy = wr.top + el.offsetTop + el.offsetHeight / 2;
      el.style.setProperty("--ox", `${Math.round(a.left + a.width / 2 - cx)}px`);
      el.style.setProperty("--oy", `${Math.round(a.top + a.height / 2 - cy)}px`);
    }
    if (!show) { setArmed(false); return; }
    const r = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(r);
  }, [show, mouthRef, trashRef]);

  return (
    <div ref={wrapRef} style={{
      position: "absolute", right: SPACE.lg - 2, bottom: `calc(${NAV_H} + ${SPACE.md}px)`,
      display: "flex", flexDirection: "column", gap: SPACE.md + 2,
      pointerEvents: "none", zIndex: 4,
    }}>
      <div ref={mouthRef} className={`drift-target${armed ? " in" : ""}${hover === "mouth" ? " hot" : ""}`} data-kind="mouth">
        <Mouth />
      </div>
      <div ref={trashRef} className={`drift-target${armed ? " in" : ""}${hover === "trash" ? " hot" : ""}`} data-kind="trash">
        <BlackHole />
      </div>
    </div>
  );
}

/** ★口。上下の唇。閉じているときは1本の線、近づくと開く(`--near`)。 */
function Mouth() {
  return (
    <svg width={34} height={34} viewBox="0 0 34 34" aria-hidden focusable="false">
      <g className="mouth-jaw">
        <path className="lip lip-up" d="M5 17 Q17 9.5 29 17 Q17 14.5 5 17 Z" fill={PAPER} />
        <path className="lip lip-lo" d="M5 17 Q17 19.5 29 17 Q17 24.5 5 17 Z" fill={PAPER} />
      </g>
    </svg>
  );
}

/** ★ブラックホール。中心の穴＋降着円盤(弧)＋吸い込まれる塵。
 *  回転は `app/globals.css`(環境ループ)。近づくと速くなる。 */
function BlackHole() {
  return (
    <svg width={34} height={34} viewBox="0 0 34 34" aria-hidden focusable="false">
      {/* 降着円盤 ― 太さ違いの弧が2枚、逆向きに回る。 */}
      <g className="bh-disc bh-disc-a">
        <path d="M17 3.5 A13.5 13.5 0 0 1 30.5 17" fill="none" stroke={PAPER} strokeWidth={3} strokeLinecap="round" />
        <path d="M17 30.5 A13.5 13.5 0 0 1 3.5 17" fill="none" stroke={PAPER} strokeWidth={3} strokeLinecap="round" />
      </g>
      <g className="bh-disc bh-disc-b">
        <path d="M17 7.5 A9.5 9.5 0 0 1 26.5 17" fill="none" stroke={PAPER} strokeWidth={1.6} strokeLinecap="round" opacity={0.72} />
        <path d="M17 26.5 A9.5 9.5 0 0 1 7.5 17" fill="none" stroke={PAPER} strokeWidth={1.6} strokeLinecap="round" opacity={0.72} />
      </g>
      {/* 事象の地平面 ― 光を通さない穴。 */}
      <circle className="bh-core" cx={17} cy={17} r={5.4} fill="#000" />
      {/* 塵 ― 外から中心へ螺旋で吸い込まれて消える(近づいたときだけ)。 */}
      <g className="bh-dust">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <circle key={i} className={`dust d${i}`} cx={17} cy={17} r={1.15} fill={PAPER} />
        ))}
      </g>
    </svg>
  );
}

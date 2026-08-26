"use client";

import { useEffect, useRef, useState } from "react";
import { INK, NAV_H, RUST } from "@/lib/constants";
import { createAnchorRect } from "@/lib/motion";
import { SPACE } from "@/lib/tokens";

// ★★図形を**掴んでいるあいだ**だけ出てくる的(第44巡に DRIFT で作り、第54巡に
// GRAVITY へも広げたので共通部品へ切り出した)。
//   上 = 口         … 飲み込む。DRIFT では「タスクにする」、GRAVITY では「完了」。
//   下 = ブラックホール … 捨てる。どちらの層でも「削除」。
//
// ★★★第58巡 …**形そのものが UI**(ユーザー指定)。黒い丸の台も影も無い。
//   口は**唇だけ**の墨色のシルエット、ブラックホールは**穴そのもの**。
//   第57巡までは「丸の中に図が描いてあるだけ」だった。
//
// ・**右下の「作る」の丸から分離して出てくる**(`createAnchorRect()` で測った差を
//   `--ox`/`--oy` に入れて CSS が飛ばす)。
// ・**近さを連続値で持つ**(`aimTargets` が `--near` を毎フレーム書く)。真偽だけだと
//   「近づけると開く / 回転が速くなる」が作れない。
//
// 見た目と動きは `app/globals.css` の `.drift-target`。ここは器と当たり判定だけ。

export type DropTarget = "trash" | "mouth" | null;

/** 的の当たり判定。指の座標(clientX/Y)が的の矩形＋遊びの中にあるか。 */
const PAD = 14;
/** 「近い」と見なす距離。ここで `--near` が 0、的の中心で 1。 */
const NEAR_R = 150;
/** 口が指の方へ寄る量(近さ 1 のときの px)。 */
const LEAN = 9;

/**
 * ★★★的の**素の矩形**(2026-08-26・第65巡)。
 *
 * `getBoundingClientRect()` を読んではいけない ― `.drift-target` は出るときに
 * `scale(0.18) → scale(1)` を `--t-in`(700ms) かけて**変形中**なので、
 * **掴み始めの 0.7 秒は当たり判定が最大 1/5.5 の大きさで、`--ox/--oy` ぶん
 * ずれた場所にある**。実機で「掴んだときに変な挙動をする」と言われた一因。
 * `offsetLeft/offsetTop/offsetWidth/offsetHeight` は**変形の影響を受けない**ので、
 * 親(器)の位置と足せば、アニメーションの途中でも**着地する場所**が分かる。
 * ★下の `createAnchorRect` の隣のコメントが同じ作法を書いている ― 出どころを揃えた。
 */
const restRect = (el: HTMLElement) => {
  const par = (el.offsetParent as HTMLElement | null) ?? el;
  const pr = par.getBoundingClientRect();
  const left = pr.left + el.offsetLeft;
  const top = pr.top + el.offsetTop;
  return { left, top, right: left + el.offsetWidth, bottom: top + el.offsetHeight,
    width: el.offsetWidth, height: el.offsetHeight };
};

const inRect = (el: HTMLElement | null, cx: number, cy: number) => {
  if (!el) return false;
  const r = restRect(el);
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
    const r = restRect(el);            // ★変形中の箱を測らない(上の注を見ること)
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
      position: "absolute", right: SPACE.sm, bottom: `calc(${NAV_H} + ${SPACE.md}px)`,
      display: "flex", flexDirection: "column", alignItems: "center", gap: SPACE.lg,
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

/** ★口 ―**唇だけ**。閉じているときは横に長い一文字、近づくと上下へ開く。 */
function Mouth() {
  return (
    <svg width={72} height={72} viewBox="0 0 72 72" aria-hidden focusable="false">
      <g className="mouth-jaw">
        {/* 上唇 ― 山なりに厚い。 */}
        <path className="lip lip-up" d="M6 36 Q36 12 66 36 Q36 27 6 36 Z" fill={INK} />
        {/* 下唇 ― ふっくら。 */}
        <path className="lip lip-lo" d="M6 36 Q36 45 66 36 Q36 62 6 36 Z" fill={INK} />
      </g>
    </svg>
  );
}

/** ★ブラックホール ―**穴そのもの**。事象の地平面(黒い円)に降着円盤の弧が巻く。
 *  回転は `app/globals.css`(環境ループ)。近づくと速くなり、塵が吸い込まれる。 */
function BlackHole() {
  return (
    <svg width={72} height={72} viewBox="0 0 72 72" aria-hidden focusable="false">
      <g className="bh-disc bh-disc-a">
        <path d="M36 6 A30 30 0 0 1 66 36" fill="none" stroke={INK} strokeWidth={7} strokeLinecap="round" />
        <path d="M36 66 A30 30 0 0 1 6 36" fill="none" stroke={INK} strokeWidth={7} strokeLinecap="round" />
      </g>
      <g className="bh-disc bh-disc-b">
        <path d="M36 14 A22 22 0 0 1 58 36" fill="none" stroke={INK} strokeWidth={3.4} strokeLinecap="round" opacity={0.66} />
        <path d="M36 58 A22 22 0 0 1 14 36" fill="none" stroke={INK} strokeWidth={3.4} strokeLinecap="round" opacity={0.66} />
      </g>
      {/* 光を通さない穴。★台ではなく**これが的の本体**。 */}
      <circle className="bh-core" cx={36} cy={36} r={13} fill="#000" />
      {/* 塵 ― 外から中心へ螺旋で吸い込まれて消える(近づいたときだけ)。 */}
      <g className="bh-dust">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <circle key={i} className={`dust d${i}`} cx={36} cy={36} r={2} fill={RUST} />
        ))}
      </g>
    </svg>
  );
}

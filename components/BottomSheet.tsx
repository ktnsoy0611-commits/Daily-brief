"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { PAPER, SOFT_SHADOW_LG } from "@/lib/constants";

interface BottomSheetProps {
  onClose: () => void;
  children: ReactNode | ((requestClose: () => void) => ReactNode);
  maxHeight?: string;
}

// iOSでキーボードが開くと、レイアウト上のビューポート(inset:0の基準)は
// そのままなのに実際に見える領域(visualViewport)だけが狭くなり、下寄せの
// オーバーレイがキーボードの裏に隠れてしまう。heightだけを見て器を狭めても、
// フォーカスした入力欄をSafariが画面内に収めようとvisualViewport自体を
// 上へスクロールさせた(offsetTopが0でなくなった)場合には器がズレて宙に
// 浮いてしまうため、offsetTopも一緒に追って器の上端も動かす。
function useVisualViewport() {
  const [rect, setRect] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setRect({ top: vv.offsetTop, height: vv.height });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return rect;
}

// 全オーバーレイ共通のポップアップ。以前は白い1枚のシート(下部シート)の
// 中にあらゆる中身を入れていたが、「背景がブラーになり、その上にカードが
// 浮いている」デザインに変更したため、この器自体はもう背景を持たない
// (スクロール領域とポップアニメーションだけを担当する透明な箱)。
// 中身がPosterCardのようなカード集合の場合はそのまま浮かせ、フォームや
// 一覧のような不透明な面が要る中身は、呼び出し側で下のOverlayCardに
// 包んでもらう。閉じる操作は常に「カード(パネル)以外の場所をタップ」だけ。
export function BottomSheet({ onClose, children, maxHeight = "82vh" }: BottomSheetProps) {
  const [open, setOpen] = useState(false);
  const vv = useVisualViewport();
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // ★このコンポーネントが(呼び出し側の状態変化などで)閉じるアニメーション
  // の途中で不意にアンマウントされた場合、下のsetTimeoutが生き残ったまま
  // 後から古いonClose()を呼んでしまうことがあった。例: ゴールタブで
  // バインダーを閉じた直後(220msのフェードアウト中)に同じバインダーを
  // 再タップすると、呼び出し側のstateが「既に同じ値」のため変化なしと
  // 判定されてしまい何も起きない(Reactは値が変わらないsetStateを無視する)
  // まま、この生き残ったタイマーが後からonClose()を呼び、開き直したはずの
  // シートを閉じてしまっていた。アンマウント時にタイマーを確実に破棄する。
  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  const requestClose = () => {
    setOpen(false);
    closeTimerRef.current = window.setTimeout(onClose, 220);
  };

  // 中身は呼び出し側ごとに構造がバラバラ(フォームや複数カードのグリッドなど)
  // なので、子要素にstopPropagationを仕込む方式だと、見た目は背景(ブラー)
  // なのに実はスクロール領域の余白だった、という場所でタップしても閉じない
  // 事故が起きやすい。代わりに「クリックされた要素がこの判定対象そのもの
  // かどうか」だけで見る、より確実な方式にしている。
  // onClickではなくonPointerDownで判定しているのは、指がわずか(数px)でも
  // 動くとタッチブラウザがそのジェスチャーをスクロールの開始とみなし、
  // click自体が発火しないことがあるため。特に画面端に近いブラー部分は
  // タップと同時にわずかな横ぶれが乗りやすく、closeがほとんど反応しない
  // ように見えていた。pointerdownは指が触れた瞬間に確定するため、この
  // 揺れの影響を受けない。
  const closeIfSelf = (e: PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    // ★このpointerdownでrequestClose()を呼んでから実際にpointerEventsが
    // noneへ切り替わるまでの間に、ブラウザが標準で送るpointerup後の
    // 互換click イベントが割り込むと、その時点でこのブラーは既に
    // pointerEvents:noneになっている(または切り替わり中)ため、click の
    // ヒットテストがブラーの下の要素(ボタン等)まで突き抜けてしまい、
    // 「ブラーを閉じたつもりが下のボタンを誤タップした」ことになっていた。
    // pointerdownでpreventDefault()すると、ブラウザはこのジェスチャーに
    // 続く互換マウスイベント(click含む)を一切合成しなくなるため、
    // この突き抜け自体が起こらなくなる。
    e.preventDefault();
    requestClose();
  };

  return (
    // ブラー+暗転の背景は常に画面いっぱいに固定する。以前はこの背景自体を
    // visualViewportの高さに合わせて縮めていたが、キーボードが開くと
    // レイアウト上のビューポートはそのまま(縮まない)なのに背景だけ縮む
    // ことになり、背景の下端とキーボードの間に「ブラーの効いていない
    // 素の背景」が帯状に見えてしまっていた。位置決め(キーボードの上に
    // パネルを置く)は内側の透明な箱だけに任せ、見た目のブラー/暗転は
    // 常に画面全体を覆うようにして、継ぎ目が絶対に出ないようにしている。
    <div onPointerDown={closeIfSelf} style={{
      position: "fixed", inset: 0, zIndex: 45,
      background: open ? "rgba(16,16,20,0.4)" : "rgba(16,16,20,0)",
      backdropFilter: open ? "blur(20px) saturate(1.5)" : "blur(0px)",
      WebkitBackdropFilter: open ? "blur(20px) saturate(1.5)" : "blur(0px)",
      transition: "background 0.3s ease, backdrop-filter 0.3s ease, -webkit-backdrop-filter 0.3s ease",
      // requestClose()はsetOpen(false)で背景のフェードアウトを開始した
      // あと、実際にこの要素がアンマウントされるまで220ms待つ(トランジション
      // を最後まで見せるため)。その間もこの要素は画面全体を覆うfixed+
      // inset:0のままで、pointerEventsを閉じていなかったため、閉じている
      // 最中の約220msだけ画面のどこをタップしても(たとえば直後に押した
      // フローティングのバインド！ボタンも)このdivに奪われて何も起きない、
      // という無反応に見える不具合があった。閉じ始めた瞬間(open===false)に
      // pointerEventsをnoneにして、以後のタップを素通りさせる。
      pointerEvents: open ? "auto" : "none",
    }}>
      <div style={{
        position: "fixed", top: vv ? `${vv.top}px` : 0, left: 0, right: 0, height: vv ? `${vv.height}px` : "100dvh",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "max(20px, env(safe-area-inset-top)) 0 max(20px, env(safe-area-inset-bottom))",
        pointerEvents: "none",
      }}>
        <div style={{
          width: "calc(100% - 48px)", maxWidth: 380, maxHeight, pointerEvents: open ? "auto" : "none",
          display: "flex", flexDirection: "column", overflow: "hidden",
          transform: open ? "translateY(0) scale(1)" : "translateY(14px) scale(0.94)",
          opacity: open ? 1 : 0,
          transition: "transform 0.32s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease",
        }}>
          <div onPointerDown={closeIfSelf} className="no-scrollbar" style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 4px" }}>
            {typeof children === "function" ? children(requestClose) : children}
          </div>
        </div>
      </div>
    </div>
  );
}

// BottomSheetの中に置くグリッドなど、独自の入れ物(div)を挟む場合に、
// その入れ物の余白(カードが無い空セルなど)をタップしても閉じられるように
// するためのヘルパー。onPointerDownに渡すだけで、そのdiv自身が押された
// 時だけhandlerを呼ぶ(子要素のカードをタップした時は呼ばれない)。上の
// closeIfSelfと同じ理由でonClickではなくonPointerDownにしている。
export function closeOnSelfClick(handler: () => void) {
  return (e: PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    // closeIfSelfと同じ理由(下の要素への互換clickの突き抜け防止)。
    e.preventDefault();
    handler();
  };
}

// フォームや一覧など、ブラー背景の上でもそれ自体が読める不透明な面が
// 必要な中身を包むための、浮いた白いカード。PosterCardの集合のように
// それ自体が完結したビジュアルを持つ中身は、これを使わずそのまま浮かせる。
export function OverlayCard({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: PAPER, borderRadius: 22, padding: "18px 18px 20px", boxShadow: SOFT_SHADOW_LG }}>
      {children}
    </div>
  );
}

"use client";

import { SPACE, TYPE, TRACK, WEIGHT, RADIUS } from "@/lib/tokens";
import { ms, T_ITEM } from "@/lib/motion";
import { ChevronUp, Map as MapIcon, Maximize2, Minimize2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BinderModal, Masthead, SectionLabel, SelectablePosterCard } from "@/components/common";
import { LeafletMap } from "@/components/LeafletMap";
import { PlanGenerateSheet } from "@/components/PlanGenerateSheet";
import { KIND_ICON } from "@/components/tabs/StockTab";
import { appTitle } from "@/lib/apps";
import { BG, HAIRLINE, INK, ITEM_DOMAINS, MUTED, PAPER, RUST, SANS, SOFT_SHADOW, SOFT_SHADOW_LG, itemKindOf } from "@/lib/constants";
import { domainOf, hasPlace, haptic, originBadge } from "@/lib/helpers";
import type { GeneratedPlan } from "@/lib/planPipeline";
import type { AppState, Item, ItemDomain, TabProps } from "@/lib/types";

// ドック表示の地図。stuck(=下の棚のスクロールでsticky状態に入った)の
// 間は幅を縮めるアニメーションを付ける。widthはレイアウトに実際に効く
// プロパティなので、縮んだ分だけ周りの余白も一緒に詰まり、
// transform:scaleでは起きる「縮んだ絵の周りに元のサイズ分の空白が
// 残る」不自然な空きができない。縮小時は中央寄せではなく右寄せ
// (margin-leftだけauto)にする。
// 地図の縮小率(0=フルサイズ100%、1=完全に縮んだ72%)。以前はIntersectionObserverの
// 二値(stuck/not stuck)にCSSトランジションを付けて「パッと切り替わる」演出
// だったが、「アニメーションではなく、スクロールするほどだんだん小さく
// なる感じにしてほしい」という指定を受け、CSSトランジションを撤去して
// スクロール位置に直接連動する連続値にした(下のsentinelRef参照)。
const MAP_MIN_WIDTH_RATIO = 0.72;
function MapCanvas({ items, selectedIds, onOpenPin, shrink, onOpenFullscreen, onCollapse }: {
  items: Item[];
  selectedIds: string[];
  onOpenPin: (item: Item) => void;
  shrink: number;
  onOpenFullscreen: () => void;
  onCollapse: () => void;
}) {
  const widthPct = 100 - shrink * (100 - MAP_MIN_WIDTH_RATIO * 100);
  return (
    <div style={{
      position: "relative", width: `${widthPct}%`, aspectRatio: "4 / 3", borderRadius: RADIUS.xl, overflow: "hidden",
      flexShrink: 0, border: `1px solid ${HAIRLINE}`,
    }}>
      {/* 背景=実地図(Leaflet+OSM)。ピンはLeafletMap内で自作デザインを重ねる。 */}
      <LeafletMap items={items} selectedIds={selectedIds} onOpenPin={onOpenPin} />
      {/* 地図右下の全画面トグル。地図単体をタブの他の内容(棚・帯)から
          切り離して大きく見たいという要望に応える。 */}
      <button onClick={onOpenFullscreen} aria-label="地図を全画面表示" style={{
        position: "absolute", right: SPACE.md, bottom: SPACE.md, width: 34, height: 34, borderRadius: RADIUS.circle,
        background: PAPER, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: SOFT_SHADOW, color: INK, padding: 0, zIndex: 500,
      }}>
        <Maximize2 size={15} strokeWidth={2} />
      </button>
      {/* 地図をたたむ。地図が要らない日(棚から直接選ぶ・プランを生成するだけ)に
          画面の大半を占有し続けないよう、その場で閉じられるようにする。
          zIndexは全画面ボタンと同じくLeafletのpane(400番台)より上。 */}
      <button onClick={onCollapse} aria-label="地図をたたむ" style={{
        position: "absolute", right: SPACE.md, top: SPACE.md, width: 34, height: 34, borderRadius: RADIUS.circle,
        background: PAPER, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: SOFT_SHADOW, color: INK, padding: 0, zIndex: 500,
      }}>
        <ChevronUp size={16} strokeWidth={2.2} />
      </button>
    </div>
  );
}

// 全画面表示。BottomSheetと同じ「mountした直後にrAFでenteredをtrueにし、
// 閉じる時はまずenteredをfalseへ戻してトランジションを最後まで見せてから
// 実際にアンマウントする」パターンに揃えている(コード全体で開閉アニメーションの
// 作法を統一するため)。トグルボタンを押した瞬間ではなくズームしながら
// 開閉させたい、という要望に応える。
// ★`--t-item` と同じ(第33巡)。数字は lib/motion.ts が持つ。
const MAP_FULLSCREEN_MS = ms(T_ITEM);
function MapFullscreenOverlay({ items, selectedIds, onOpenPin, onRequestClose }: {
  items: Item[];
  selectedIds: string[];
  onOpenPin: (item: Item) => void;
  onRequestClose: () => void;
}) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const requestClose = () => {
    setEntered(false);
    setTimeout(onRequestClose, MAP_FULLSCREEN_MS);
  };
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50, overflow: "hidden",
      paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)",
      transform: entered ? "scale(1)" : "scale(0.4)", transformOrigin: "top center",
      opacity: entered ? 1 : 0,
      transition: `transform ${MAP_FULLSCREEN_MS}ms var(--ease-sheet), opacity ${MAP_FULLSCREEN_MS}ms var(--ease-sheet)`,
      background: BG,
    }}>
      <LeafletMap items={items} selectedIds={selectedIds} onOpenPin={onOpenPin} />
      <button onClick={requestClose} aria-label="地図の全画面表示を閉じる" style={{
        position: "absolute", right: SPACE.md, bottom: SPACE.md, width: 34, height: 34, borderRadius: RADIUS.circle,
        background: PAPER, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: SOFT_SHADOW, color: INK, padding: 0, zIndex: 500,
      }}>
        <Minimize2 size={15} strokeWidth={2} />
      </button>
    </div>
  );
}

function HorizontalShelf({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: SPACE.xl }}>
      <SectionLabel text={title} style={{ marginBottom: SPACE.md }} />
      <div className="no-scrollbar" style={{ display: "flex", gap: SPACE.md, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: SPACE.hair, marginLeft: -SPACE.lg, marginRight: -SPACE.lg, paddingLeft: SPACE.lg, paddingRight: SPACE.lg }}>
        {children}
      </div>
    </section>
  );
}

// プラン生成(AIによる3案)のUIは components/PlanGenerateSheet.tsx に分けている。
// 以前ここにあった「今週のおすすめ」(地図座標の近接クラスタリングで束ねた
// モデルプランのエンベロープ)は、AIによるプラン生成に役割を譲って撤去した。

// プランタブの選択画面。地図(場所が絡むItemのピン。ドメインを問わない)+
// 「プランを生成」+「モノ・バショ・タイケン・ジョウホウ」の棚。棚の区分と
// 名称はストックタブ・アーカイブと共通の語彙(domainOf)にしている。
function MapPlanner({ stocked, draftSelection, interests, onOpenPin, onToggleItem, onApplyPlan, savedPlans, onSavePlans }: {
  stocked: Item[];
  draftSelection: string[];
  // 興味・好み(設定画面のチップ)。プラン生成でAIへ渡す。
  interests: { label: string; weight: number }[];
  onOpenPin: (item: Item) => void;
  onToggleItem: (item: Item) => void;
  onApplyPlan: (itemIds: string[]) => void;
  // 生成した3案は appState に持たせて永続化する(シートを閉じても・タブを
  // 切り替えても・アプリを開き直しても、次に生成し直すまで残る)。
  savedPlans: { plans: GeneratedPlan[]; area: string | null; at: string } | null;
  onSavePlans: (next: { plans: GeneratedPlan[]; area: string | null; at: string } | null) => void;
}) {
  const byNewest = (a: Item, b: Item) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
  // 地図に出るのは場所が絡むItemだけ(ドメインを問わない。位置情報の
  // 有無はドメインとは別軸)。プラン生成の材料も同じプール(回る順序と距離を
  // 扱うため、位置を持たない候補は組み込めない)。
  const mapPool = stocked.filter(hasPlace);
  const byDomain = (d: ItemDomain) => stocked.filter((i) => domainOf(i) === d).slice().sort(byNewest);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  // 地図の開閉。地図が要らない日のために閉じられるようにする(ユーザー指定)。
  // 閉じている間はsticky枠・センチネルごと描画しないので、縮小の計測処理も
  // 自動的に止まる(センチネルのcallback refがnullで呼ばれてクリーンアップされる)。
  const [mapOpen, setMapOpen] = useState(true);
  // AIが生成した3案。以前はここのローカルstateに置いていたため、シートを
  // 閉じる・タブを切り替える(AppShellがkey={tab}で作り直す)だけで消えて
  // 二度と見られなかった(ユーザー報告)。appStateへ持ち上げ、次に生成し直す
  // まで残るようにしてある。
  const [planSheet, setPlanSheet] = useState(false);
  const plans = savedPlans?.plans ?? null;
  const planArea = savedPlans?.area ?? null;
  // 地図の縮小度合いを、地図の直前に置いた高さ0のセンチネル要素の
  // スクロール位置から連続値(0〜1)で求める。以前はIntersectionObserverで
  // 「センチネルが見えているか否か」の二値だけを見てCSSトランジションで
  // パッと切り替えていたが、「アニメーションではなく、スクロールする
  // ほどだんだん小さくなる感じにしてほしい」という指定を受け、スクロール
  // イベントを直接ポーリングしてセンチネルが上端をどれだけ通り過ぎたかを
  // 毎フレーム測る方式に作り替えた(センチネルとstickyの地図は隙間なく
  // 連続しているため、センチネルが上端を通り過ぎた量=地図が縮み始めて
  // からの距離として使える)。
  // useEffect+useRefではなくcallback refにしているのは、「Keepがまだ
  // ない」ときの早期returnがこのセンチネル自体をまだ描画しない(下の
  // stocked.length===0分岐)ため。useEffectを空配列依存にすると、
  // 最初のマウント時(センチネルがまだ存在しない=refがnull)の一度きりで
  // 観測を諦めてしまい、その後デモデータ投入等でセンチネルが実際に
  // 現れても二度と観測が始まらない不具合になっていた。callback refは
  // 依存配列を問わずDOMノードが実際にアタッチされた瞬間に呼ばれるため、
  // この早期returnの有無に関わらず確実に動く。
  // ★マップの縮小と「固定→最小で流れる」挙動。
  // 設計: マップを「フルサイズ高さで固定した枠(zone)」で囲み、その枠の中で
  // position:sticky+縮小させる。枠の高さが一定なので、
  //  (1) マップを縮小しても枠の高さは変わらない=下のコンテンツ(今週のおすすめ)が
  //      リフローで動かない=「グイッと引っ張られる」感覚が消える。
  //  (2) 枠がフルサイズ高さぶんの領域を確保しているので、固定中はその領域が
  //      下のコンテンツを常に押し下げ、マップが今週のおすすめに重ならない。
  //  (3) スクロールが進んで枠の下端がマップの下端に追いつくと、CSS stickyの
  //      仕様どおりマップが枠と一緒に自然に上へ流れて消える(=最小で流れる、
  //      継ぎ目のジャンプ無し)。
  // 縮小率はスクロール量に直結させ(センチネルが固定線を通り過ぎた量/RANGE)、
  // RANGE=フルサイズ高さ×(1-最小率)にすることで、マップが枠から流れ出る
  // ちょうどその頃に最小へ到達する。フルサイズ高さは器の幅から算出する。
  const mapShrinkCleanupRef = useRef<(() => void) | null>(null);
  const mapShrinkRafRef = useRef<number | null>(null);
  const [mapShrink, setMapShrink] = useState(0);
  const [mapFullHeight, setMapFullHeight] = useState(0);
  // 枠(zone)のsticky top。フルサイズ高さと最小高さの差ぶんだけ負にすることで、
  // マップが最小に達したちょうどその瞬間に枠がstickyで止まり、最小サイズの
  // マップが画面上端に貼り付いたまま(その下をコンテンツが流れていく)になる
  // (「最小まで縮小したら画面上側についてくる」の実装。下のJSX参照)。
  const [mapZoneTop, setMapZoneTop] = useState(0);
  const sentinelRef = useCallback((el: HTMLDivElement | null) => {
    mapShrinkCleanupRef.current?.();
    mapShrinkCleanupRef.current = null;
    if (!el) return;
    // ★closest で「自分が乗っているスクロールルート」を引く。
    // アプリ切替が横スライドになり、指で引いている間は3アプリぶんの
    // [data-tab-scroll-root] が同時に存在する。document.querySelector だと
    // 先頭(=タスクの列)を掴んでしまい、地図の縮小計算が別の列の寸法で
    // 走って壊れる。
    const root = el.closest<HTMLElement>("[data-tab-scroll-root]");
    if (!root) return;
    const measure = () => {
      mapShrinkRafRef.current = null;
      const rootRect = root.getBoundingClientRect();
      const cs = getComputedStyle(root);
      const padTop = parseFloat(cs.paddingTop) || 0;
      const padLeft = parseFloat(cs.paddingLeft) || 0;
      const padRight = parseFloat(cs.paddingRight) || 0;
      const contentWidth = root.clientWidth - padLeft - padRight;
      const fullH = contentWidth * 0.75; // aspectRatio 4/3
      setMapFullHeight(fullH);
      const range = Math.max(1, fullH * (1 - MAP_MIN_WIDTH_RATIO));
      setMapZoneTop(-range);
      // 固定線(マップがここに来たら貼り付く)= コンテナ上端+上パディング。
      const stickyLine = rootRect.top + padTop;
      // センチネルは枠の直前(高さ0)。固定線をどれだけ通り過ぎたか=縮小の進み。
      const over = stickyLine - el.getBoundingClientRect().top;
      setMapShrink(Math.max(0, Math.min(1, over / range)));
    };
    const onScroll = () => {
      if (mapShrinkRafRef.current == null) mapShrinkRafRef.current = requestAnimationFrame(measure);
    };
    measure();
    root.addEventListener("scroll", onScroll, { passive: true });
    mapShrinkCleanupRef.current = () => {
      root.removeEventListener("scroll", onScroll);
      if (mapShrinkRafRef.current != null) { cancelAnimationFrame(mapShrinkRafRef.current); mapShrinkRafRef.current = null; }
    };
  }, []);

  // 候補が1件も無いときは何も置かない(説明文も図形も出さない。ネオバウハウス化で
  // 空状態の言葉を削った、2026-08-02)。
  if (stocked.length === 0) return <main />;

  const bottomPadding = draftSelection.length > 0 ? 96 : 24;
  const selectableCard = (i: Item) => (
    <SelectablePosterCard key={i.id} title={i.title} image={i.images?.[0]} color={i.color}
      sub={i.area && i.area !== "—" ? i.area : (i.creator || i.category || itemKindOf(i.kind).label)}
      icon={KIND_ICON[i.kind]} badge={originBadge(i.origin)}
      selected={draftSelection.includes(i.id)} onToggle={() => onToggleItem(i)} />
  );

  return (
    <main style={{ paddingTop: SPACE.lg, paddingBottom: bottomPadding }}>
      {/* マップだけ画面上部に追従(sticky)させる。下の棚(今週のおすすめ・
          4ドメイン)をスクロールしても、地図は常に見える位置に留まり
          続けてほしいという要望に対応。topは0(=data-tab-scroll-rootの
          パディング内側の上端)でよい: スクロールコンテナ自体が既に
          安全域ぶんの上パディングを持っているため、地図はそこに正しく
          張り付く。zIndexは棚のカード(通常の書式優先度)より確実に手前に
          出るよう与えるが、nav(25)より低くして被らないようにする。
          全画面表示中は下のcreatePortalで別枠に描画するため、ここは
          非表示にする(sticky自身が新しい重なりコンテキストを作るため、
          中でposition:fixedにしてもnav(25)より手前に出せず、閉じる
          ボタンがnavに押されてクリックできなくなる不具合になっていた)。 */}
      {mapOpen ? (
        <>
      <div ref={sentinelRef} style={{ height: 0 }} aria-hidden />
      {/* ★フルサイズ高さで固定した枠(zone)+その中でsticky固定+縮小するマップ、
          の二段sticky構成。
          - 枠の高さが一定なので縮小しても下のコンテンツが動かず(引っ張られ感が
            消える)、枠がフルサイズぶんの領域を確保するので固定中は今週の
            おすすめに重ならない(縮小はスクロール量に連動)。
          - 内側のマップはtop:0のstickyで、縮小中ずっと画面上端に貼り付く。
          - 外側の枠はtop=-(フルH-最小H)のsticky。マップが最小に達したちょうど
            その瞬間に枠が止まる高さに設定してあるため、最小サイズのマップが
            そのまま画面上端に貼り付き続け(=最小まで縮小したら画面上側に
            ついてくる)、その下を今週のおすすめ以降が流れていく。以前は枠を
            非stickyにしていたため最小で枠ごと流れて消えていた。
          高さ未実測(0)の初回だけはautoにしておく(その瞬間はマップ実寸=
          フルサイズなので枠もフルサイズになる)。 */}
      <div style={{ position: "sticky", top: mapZoneTop, height: mapFullHeight > 0 ? mapFullHeight : undefined, zIndex: 4 }}>
        {/* 幅が縮んだ時に右へ寄せる処理は、この親をdisplay:flex+
            justifyContent:flex-endにするだけで済む(幅が縮むほど余った分だけ
            自動的に右へ寄る)。 */}
        <div style={{ position: "sticky", top: 0, visibility: mapFullscreen ? "hidden" : "visible", display: "flex", justifyContent: "flex-end" }}>
          <MapCanvas items={mapPool} selectedIds={draftSelection} onOpenPin={onOpenPin} shrink={mapShrink}
            onOpenFullscreen={() => setMapFullscreen(true)} onCollapse={() => { haptic(6); setMapOpen(false); }} />
        </div>
      </div>
      {/* 全画面表示はAppShellの外(document.body直下)へPortalで描画し、
          祖先(sticky wrapper)の重なりコンテキストの影響を受けない、
          素のbodyレベルでのzIndex比較にする。開閉ともズームしながらの
          アニメーション付き(MapFullscreenOverlay内部)。 */}
      {mapFullscreen && typeof document !== "undefined" && createPortal(
        <MapFullscreenOverlay items={mapPool} selectedIds={draftSelection} onOpenPin={onOpenPin} onRequestClose={() => setMapFullscreen(false)} />,
        document.body
      )}
        </>
      ) : (
        // たたんだ状態。開く手がかりとして、地図があった場所に同じ幅の
        // チップを1本置く(nav・戻るチップと同じ「PAPER地+SOFT_SHADOWで浮く
        // 丸チップ」の語彙)。
        <button onClick={() => { haptic(6); setMapOpen(true); }} style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: SPACE.sm,
          background: PAPER, border: "none", borderRadius: RADIUS.pill, padding: `${SPACE.md}px 0`, cursor: "pointer",
          fontFamily: SANS, fontSize: TYPE.small, fontWeight: WEIGHT.bold, color: INK, boxShadow: SOFT_SHADOW,
        }}>
          <MapIcon size={14} strokeWidth={2.2} />
          地図をひらく
        </button>
      )}
      <div style={{ height: 22 }} />
      {/* ★プランを生成。プランタブを開いたとき画面の中ほどに来る位置(地図の
          すぐ下、棚の手前)に、単独で大きく置く。地図と棚のあいだが、
          「ここから何をするか」を決める場所として一番自然なため。 */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: SPACE.sm, padding: `${SPACE.sm}px 0 ${SPACE.xl}px` }}>
        <button onClick={() => { haptic(10); setPlanSheet(true); }} style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: SPACE.sm,
          padding: `${SPACE.lg}px ${SPACE.xxl}px`, borderRadius: RADIUS.pill, border: "none", cursor: "pointer",
          background: INK, color: PAPER, fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.bold, letterSpacing: TRACK.normal,
          boxShadow: SOFT_SHADOW_LG,
        }}>
          <Sparkles size={15} strokeWidth={2.4} />
          プランを生成
        </button>
        <span style={{ fontSize: TYPE.small, color: MUTED, letterSpacing: TRACK.normal }}>
{plans ? "3案" : ""}
        </span>
      </div>
      {ITEM_DOMAINS.map((d) => {
        const items = byDomain(d.id);
        return items.length > 0 && (
          <HorizontalShelf key={d.id} title={d.label}>
            {items.map(selectableCard)}
          </HorizontalShelf>
        );
      })}
      {planSheet && (
        <PlanGenerateSheet
          pool={mapPool}
          plans={plans}
          area={planArea}
          interests={interests}
          onGenerated={(next, area) => onSavePlans(next ? { plans: next, area, at: new Date().toISOString() } : null)}
          onApply={onApplyPlan}
          onClose={() => setPlanSheet(false)}
        />
      )}
    </main>
  );
}

// ★確定ビュー(ConfirmedStack: 見開きのバインダー・カードの束・閉じる表紙・
// 落下アニメーション・「バインド！」ボタン)はこのタブから撤去した。
// 1日を締める操作は、画面下から引き上げるダッシュボードの「今日を終える」に
// 集約している(components/Dashboard.tsx、HANDOFF §8.25)。プランタブは
// 「地図で見て、プランを立てて、行き先を選ぶ」ことだけを担う。

export function ExecuteTab({ appState, persist, showToast, profileButton, selection, toggleItemSelection, addItemIds }: TabProps) {
  const [pinItem, setPinItem] = useState<Item | null>(null);
  // 選択状態はAppShellへ引き上げ、ストックタブと共有している(タブ・アプリを
  // 跨いで選べるようにするため)。draftSelectionという名前はこのタブ内での
  // 既存コードとの差分を最小にするため残している。
  const draftSelection = selection.itemIds;

  // 地図・棚に出すのはストックの候補(candidate)だけ。実行済み(done)は
  // アーカイブへ移っており、ここには出さない。
  const stocked = appState.items.filter((i) => i.status === "candidate");

  const toggleDraftItem = (item: Item) => toggleItemSelection(item.id);
  // AIが生成したプランを採用する = その行き先をまとめて選択に足す。既に
  // 手で選んでいたものは外さない(追加のみ)。締めはダッシュボードの
  // 「今日を終える」で行う。
  const applyGeneratedPlan = (itemIds: string[]) => {
    haptic(12);
    addItemIds(itemIds);
    showToast(`${itemIds.length}件をプランに追加しました`);
  };
  // 生成した3案の保存先はappState(=永続化される)。生成のたびに待ち時間と
  // コストがかかるので、シートを閉じてもタブを移っても、次に生成し直すまで
  // そのまま残す。
  const saveGeneratedPlans = (next: AppState["generatedPlans"]) => {
    const s = structuredClone(appState);
    s.generatedPlans = next;
    persist(s);
  };

  return (
    <>
      <Masthead title={appTitle("life")} corner={profileButton} />
      <MapPlanner
        stocked={stocked} draftSelection={draftSelection}
        onOpenPin={setPinItem} onToggleItem={toggleDraftItem} onApplyPlan={applyGeneratedPlan}
        interests={appState.profile.interests}
        savedPlans={appState.generatedPlans ?? null} onSavePlans={saveGeneratedPlans}
      />
      <BinderModal
        item={pinItem}
        onClose={() => setPinItem(null)}
        actionSlot={pinItem ? ((closeSheet) => (
          <button onClick={() => { toggleDraftItem(pinItem); closeSheet(); }} style={{
            width: "100%", padding: `${SPACE.md}px 0`, borderRadius: RADIUS.pill, cursor: "pointer", fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.bold, letterSpacing: TRACK.normal,
            background: draftSelection.includes(pinItem.id) ? "transparent" : INK,
            color: draftSelection.includes(pinItem.id) ? RUST : PAPER,
            border: draftSelection.includes(pinItem.id) ? `1.5px solid ${RUST}` : "none",
          }}>{draftSelection.includes(pinItem.id) ? "外す" : "＋ 今日に追加"}</button>
        )) : undefined}
      />
    </>
  );
}

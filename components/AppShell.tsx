"use client";

import { Heart, LayoutGrid, Map as MapIcon, Newspaper, Sparkles, Sprout, User } from "lucide-react";
import { useCallback, useEffect, useState, type ComponentType, type CSSProperties } from "react";
import { AddWishSheet } from "@/components/AddWishSheet";
import { PlanSelectionBar } from "@/components/PlanSelectionBar";
import { BriefTab } from "@/components/tabs/BriefTab";
import { ExecuteTab } from "@/components/tabs/ExecuteTab";
import { GoalsTab } from "@/components/tabs/GoalsTab";
import { ProfileTab } from "@/components/tabs/ProfileTab";
import { RecordsTab } from "@/components/tabs/RecordsTab";
import { StockTab } from "@/components/tabs/StockTab";
import { BG, BLUE, HEADER_CHIP_SIZE, INK, NAV_BOTTOM_GAP, PAPER, RUST, SANS, SOFT_SHADOW } from "@/lib/constants";
import { DataStore } from "@/lib/dataStore";
import { buildMagazine, detectInterests, haptic, hasPlace, isExpiredItem, todayKey } from "@/lib/helpers";
import type { AppState, ItemDomain, PlanSelection, TabId, TabProps } from "@/lib/types";

const TABS: { id: TabId; label: string; Icon: ComponentType<{ size?: number; strokeWidth?: number; color?: string; style?: CSSProperties }> }[] = [
  { id: "records", label: "アーカイブ", Icon: LayoutGrid },
  { id: "brief", label: "ブリーフ", Icon: Newspaper },
  { id: "goals", label: "ゴール", Icon: Sprout },
  { id: "stock", label: "ストック", Icon: Heart },
  { id: "execute", label: "プラン", Icon: MapIcon },
];

export function AppShell() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [tab, setTab] = useState<TabId>("records");
  const [showProfile, setShowProfile] = useState(false);
  const [storageMode, setStorageMode] = useState(DataStore.mode);
  const [toast, setToast] = useState("");
  // ウィッシュはどのタブにいても書ける「受信箱」。タブバー横の独立した
  // ボタンから開くため、タブ固有の状態ではなくここに置く。
  const [addingWish, setAddingWish] = useState(false);
  // プランへバインドする候補の選択。タブを切り替えてもAppShell自体は
  // 常にマウントされたままなので(key={tab}で差し替わるのは中身のタブ
  // だけ)、ここに置くだけでストックタブ⇄プランタブを跨いで選択が
  // 保持される。
  const [selection, setSelection] = useState<PlanSelection>({ itemIds: [] });

  useEffect(() => {
    let alive = true;
    DataStore.load().then(async (s) => {
      if (!alive) return;
      // マガジンは「その日専用」。日付が変わっても未回答(✓も×もされていない)
      // ままの項目が残っていたら、ダッシュボードの通知キューに移してリセットする。
      let mutated = false;
      if (s.magazine && s.magazine.dateKey !== todayKey()) {
        // 場所を持たない作品・モノは候補プールに残り続けるだけなので通知は
        // 不要。場所が絡むItemだけ「行きましたか？」の確認待ちに回す。
        const staleIds = (s.magazine.itemIds ?? []).filter((id) => {
          const item = s.items.find((i) => i.id === id);
          return item && item.status !== "done" && hasPlace(item);
        });
        const existing = new Set(s.pendingReview ?? []);
        staleIds.forEach((id) => existing.add(id));
        s.pendingReview = Array.from(existing);
        s.magazine = null;
        mutated = true;
      }
      // 会期・予約期間が過ぎた(または場所が絡むのに30日経った)Itemを自動で削除。
      // 終わったはずの展覧会やライブが候補に残り続けるのを防ぐ。
      const expiredIds = s.items.filter(isExpiredItem).map((i) => i.id);
      if (expiredIds.length > 0) {
        s.items = s.items.filter((i) => !expiredIds.includes(i.id));
        if (s.magazine) s.magazine.itemIds = s.magazine.itemIds.filter((id) => !expiredIds.includes(id));
        s.pendingReview = (s.pendingReview ?? []).filter((id) => !expiredIds.includes(id));
        mutated = true;
      }
      setAppState(s);
      setStorageMode(DataStore.mode);
      if (mutated) await DataStore.save(s);
    });
    return () => { alive = false; };
  }, []);

  const persist = useCallback((next: AppState) => {
    setAppState(next);
    DataStore.save(next).then(setStorageMode);
  }, []);
  const goTab = useCallback((id: TabId) => setTab(id), []);
  const toggleItemSelection = useCallback((id: string) => {
    haptic(8);
    setSelection((s) => ({ itemIds: s.itemIds.includes(id) ? s.itemIds.filter((x) => x !== id) : [...s.itemIds, id] }));
  }, []);
  const addItemIds = useCallback((ids: string[]) => {
    haptic(10);
    setSelection((s) => ({ itemIds: Array.from(new Set([...s.itemIds, ...ids])) }));
  }, []);
  // フローティングUIの「バインド！」。ストックタブから押した場合でも、
  // プランタブの地図の「作る」ボタンと全く同じ組み立てロジック
  // (buildMagazine)で今日のマガジンを確定し、結果を確認できるよう
  // プランタブへ連れて行く。useCallbackで包まずレンダーのたびに作り
  // 直しているのは、appState/selectionを常に最新のクロージャで参照
  // したいため(このボタンはクリックハンドラとして渡すだけで、深い
  // メモ化の対象にはならない)。
  const bindSelection = () => {
    if (!appState || selection.itemIds.length === 0) return;
    haptic(16);
    persist(buildMagazine(appState, selection.itemIds));
    setSelection({ itemIds: [] });
    setTab("execute");
  };
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 1600); };
  // ウィッシュの追加。ストックには入らず(ウィッシュはカテゴリーではない)、
  // ブリーフの生成材料になるだけの自由文として保存する。ここで選んだ
  // ドメインは、ブリーフがどんな種類の提案として返すかの手がかりになる。
  const addWish = (title: string, category: ItemDomain) => {
    if (!appState) return;
    haptic();
    const next = structuredClone(appState);
    next.wishes.unshift({ id: `wish-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title, category, status: "stock", addedAt: new Date().toISOString() });
    persist(next);
    showToast("ウィッシュを書きました");
  };

  useEffect(() => {
    if (!appState) return;
    const detected = detectInterests(appState.wishes, appState.items);
    const next = structuredClone(appState);
    next.profile = next.profile ?? { interests: [], currentFocus: "" };
    let changed = false;
    detected.forEach((d) => {
      const existing = next.profile.interests.find((i) => i.label === d.label);
      if (!existing) {
        next.profile.interests.push({ id: `auto-${d.label}-${Date.now()}`, label: d.label, categoryId: d.categoryId, kind: d.kind ?? "hobby", weight: d.weight, source: "auto", addedAt: new Date().toISOString() });
        changed = true;
      } else if (existing.source === "auto" && d.weight > existing.weight) {
        existing.weight = d.weight;
        changed = true;
      }
    });
    if (changed) persist(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState?.wishes, appState?.items]);

  if (!appState) {
    return <div style={{ minHeight: "100dvh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, color: "#9A988E", fontSize: 13 }}>読み込んでいます…</div>;
  }

  const interestCount = (appState.profile?.interests ?? []).length;
  const profileButton = (
    <button onClick={() => { haptic(5); setShowProfile(true); }} aria-label="プロフィール" style={{
      position: "relative", width: HEADER_CHIP_SIZE, height: HEADER_CHIP_SIZE, borderRadius: "50%",
      background: PAPER, border: "none", display: "flex", alignItems: "center", justifyContent: "center",
      cursor: "pointer", color: INK, boxShadow: SOFT_SHADOW, padding: 0, flexShrink: 0,
    }}>
      <User size={17} strokeWidth={1.75} />
      {interestCount > 0 && (
        <span style={{
          position: "absolute", top: -3, right: -3, minWidth: 15, height: 15, borderRadius: 999, background: BLUE,
          color: PAPER, fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px",
        }}>{interestCount}</span>
      )}
    </button>
  );
  const tabProps: TabProps = { appState, persist, showToast, goTab, profileButton, selection, toggleItemSelection, addItemIds, setSelection };

  // 実行タブなどをスクロールした状態で別タブ(特にブリーフタブ)へ切り替えると
  // ヘッダーが見切れる不具合が繰り返し再発していた。原因は「ウィンドウ/body
  // 自体がスクロールする」設計にあった: タブ切替はDOMのkeyを変えて中身を
  // 差し替えるだけなので、スクロール位置(window.scrollY)は前のタブのぶんが
  // そのまま残り、次のタブがそれを引き継いでしまう。scrollTo(0,0)を都度
  // 呼ぶ対症療法を重ねても、実機の慣性スクロールとのタイミング競合で
  // すり抜けることがあった。
  // 根本対応として、外側の器(この最外周div)は常にちょうど100dvhの高さで
  // overflow:hiddenにしてウィンドウ自体は絶対にスクロールしないようにし、
  // 代わりにタブの中身を包むこの内側のdivだけがoverflow-y:autoでスクロール
  // する。key={tab}でタブ切替のたびにこの内側divごとDOMが作り直されるため、
  // スクロール位置は毎回ブラウザネイティブに0から始まり、前のタブの位置が
  // 引き継がれる余地がそもそも無くなる。ブリーフタブだけは元々スクロール
  // させたくない(カード自体で完結する設計)ので、ここでoverflowを明示的に
  // hiddenにする(以前はブリーフタブ側でdocument.body.style.overflowを
  // 直接いじっていたが、bodyがそもそもスクロールしなくなったので不要になった)。
  const scrollLocked = !showProfile && tab === "brief";
  return (
    <div style={{ height: "100dvh", overflow: "hidden", background: BG, display: "flex", flexDirection: "column", alignItems: "center", fontFamily: SANS, color: INK }}>
      <div data-tab-scroll-root style={{
        width: "100%", maxWidth: 420, flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
        overflowY: scrollLocked ? "hidden" : "auto", WebkitOverflowScrolling: "touch", overscrollBehaviorY: "contain",
        padding: `max(16px, env(safe-area-inset-top)) 16px ${showProfile ? "24px" : "16px"}`,
      }}>
        {storageMode === "memory" && <div style={{ fontSize: 9, color: RUST, letterSpacing: "0.05em", padding: "6px 4px 0", textAlign: "right" }}>メモリ動作中</div>}

        {showProfile ? (
          <ProfileTab appState={appState} persist={persist} onClose={() => setShowProfile(false)} />
        ) : (
          <>
            {/* minHeight:0が無いと、flexアイテムのデフォルトのmin-height:auto
                (=中身の実サイズより縮められない)により、実行タブの確定
                ビューのような「自分の内側だけがoverflow-y:autoでスクロール
                する」子要素がいくら正しく組んであっても、この外側のdiv
                自体が中身の全高までズルズル伸びてしまい、結局スクロール
                の主体が想定と違う一番外側の(この上の)コンテナ側にすり
                替わってしまっていた。実行タブの「バインドボタンを押すと
                リスト先頭へ戻す」処理は内側のスクロール要素を対象に
                scrollTopを操作していたため、実際にスクロールしていたのが
                外側だったこの状態では効かず、「直したはずなのに直って
                いない」という不具合の実際の原因になっていた。 */}
            <div key={tab} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, animation: "tab-in 0.22s cubic-bezier(0.32,0.72,0,1)" }}>
              {tab === "brief" && <BriefTab {...tabProps} />}
              {tab === "stock" && <StockTab {...tabProps} />}
              {tab === "goals" && <GoalsTab {...tabProps} />}
              {tab === "records" && <RecordsTab {...tabProps} />}
              {tab === "execute" && <ExecuteTab {...tabProps} />}
            </div>
          </>
        )}
      </div>

      {toast && (
        <div key={toast} style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: INK, color: PAPER, borderRadius: 999,
          fontSize: 11, letterSpacing: "0.06em", padding: "8px 18px", boxShadow: "0 8px 24px rgba(23,23,21,0.25)", zIndex: 50,
          animation: "toast-in 0.3s cubic-bezier(0.32,0.72,0,1)",
        }}>{toast}</div>
      )}

      {/* タブを跨いで持ち回すバインド候補の確定UI。プロフィール画面を
          開いている間だけは他の浮遊UIと同じく隠す。 */}
      {!showProfile && (
        <PlanSelectionBar
          appState={appState} selection={selection}
          toggleItemSelection={toggleItemSelection}
          onClear={() => setSelection({ itemIds: [] })}
          onBind={bindSelection}
        />
      )}

      {/* ヘッダーのプロフィール丸アイコン/件数ピルと同じ「PAPERの丸背景+
          SOFT_SHADOWで浮く」語彙に揃えたフローティングタブバー。position:
          fixedにすると、iOS SafariのURLバー(動的ツールバー)の表示/非表示
          遷移中に固定要素が実際のビューポートとズレて、下に不自然な隙間が
          生まれることがある(このアプリで以前sticky→fixedへの変更で
          一度再発したバグ)。stickyなら実スクロール位置基準になるため、
          この種のズレを避けられる。navの箱自体はbottom:0(実際の画面下端)
          まで届かせておき、ピルはその中でmarginBottomにより浮かせる。
          下地へ溶け込むグラデーションは、以前はnavの内側(nav自身のzIndex
          =25)に敷いていたが、それだとPlanSelectionBar/ExecuteTabの
          バインド！ボタンのような「それ自体は不透明な独立UI」の上にまで
          このグラデーションが被さり、その下端が白っぽく洗われて見える
          事故があった。グラデーションは「素通しのスクロールコンテンツ」
          だけを対象にしたいので、nav本体(タップ対象のピル、zIndex=25)とは
          別レイヤー(zIndex=15)に分離している。バインド！系のボタンは
          さらにnavのピルの影の滲みでうっすら覆われて見える不具合もあった
          ため、両方ともnavより高いzIndex=26にして常に手前に出している。 */}
      {!showProfile && (
        <>
          <div aria-hidden style={{ position: "sticky", bottom: 0, width: "100%", height: 0, zIndex: 15, pointerEvents: "none" }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: -44, bottom: 0, background: `linear-gradient(to bottom, ${BG}00 0, ${BG} 44px, ${BG} 100%)` }} />
          </div>
          <nav style={{ position: "sticky", bottom: 0, width: "100%", zIndex: 25, display: "flex", justifyContent: "center", padding: "0 16px", pointerEvents: "none" }}>
            {/* SOFT_SHADOW_LG(ぼかし32px)をそのまま使うと、NAV_BOTTOM_GAPで
                画面下端ぎりぎりまで詰めたこのピルの下側は、影が滲みきる前に
                画面の外(=物理的な限界)へ突き当たり、途中でスパッと切れた
                ような不自然な見た目になっていた。ピルだけは控えめな専用の
                影に差し替え、余白が数pxしか無くても中で滲み切るようにする。 */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", maxWidth: 420 - 32, pointerEvents: "auto" }}>
              <div style={{ position: "relative", flex: 1, display: "flex", background: PAPER, borderRadius: 999, boxShadow: "0 2px 7px rgba(28,28,30,0.16)", padding: 6, marginBottom: NAV_BOTTOM_GAP }}>
                {TABS.map((t) => {
                  const active = tab === t.id;
                  return (
                    <button key={t.id} onClick={() => { haptic(5); goTab(t.id); }} style={{ flex: 1, padding: "7px 0 6px", background: "none", border: "none", cursor: "pointer", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <div style={{ width: 44, height: 28, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", background: active ? INK : "transparent", transition: "background 0.2s" }}>
                        <t.Icon size={19} strokeWidth={1.8} color={active ? PAPER : "rgba(23,23,21,0.38)"} style={{ transition: "color 0.2s, stroke 0.2s" }} />
                      </div>
                      <span style={{ fontFamily: SANS, fontSize: 9.5, color: active ? INK : "rgba(23,23,21,0.38)", fontWeight: active ? 700 : 400, transition: "color 0.2s" }}>{t.label}</span>
                    </button>
                  );
                })}
              </div>
              {/* ウィッシュは特定のタブの持ち物ではなく、どこにいても書ける
                  「受信箱」への入り口であることを見た目でも伝えるため、
                  タブのピルからは意図的に切り離した独立の丸ボタンにしている。 */}
              <button onClick={() => { haptic(5); setAddingWish(true); }} aria-label="ウィッシュを書く" style={{
                flexShrink: 0, width: 52, height: 52, borderRadius: "50%", background: INK, border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 7px rgba(28,28,30,0.16)", marginBottom: NAV_BOTTOM_GAP, padding: 0,
              }}>
                <Sparkles size={19} strokeWidth={1.8} color={PAPER} />
              </button>
            </div>
          </nav>
        </>
      )}

      {addingWish && <AddWishSheet onAdd={addWish} onClose={() => setAddingWish(false)} />}
    </div>
  );
}

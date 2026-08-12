"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AddWishSheet } from "@/components/AddWishSheet";
import { AppBackdrop, groundOf } from "@/components/AppBackdrop";
import { TAB_ICON_OFF, TabGlyph, TabIcon } from "@/components/TabIcons";
import { Dashboard } from "@/components/Dashboard";
import { SelectionMarker } from "@/components/PlanSelectionBar";
import { SignInGate } from "@/components/SignInGate";
import { useVoiceRecorder } from "@/components/VoiceRecorder";
import { VoiceOverlay } from "@/components/VoiceStudio";
import { BriefTab } from "@/components/tabs/BriefTab";
import { ExecuteTab } from "@/components/tabs/ExecuteTab";
import { GoalsTab } from "@/components/tabs/GoalsTab";
import { JournalTab } from "@/components/tabs/JournalTab";
import { ProfileTab } from "@/components/tabs/ProfileTab";
import { RecordTab } from "@/components/tabs/RecordTab";
import { StockTab } from "@/components/tabs/StockTab";
import { InboxView } from "@/components/tabs/InboxView";
import { TasksTab } from "@/components/tabs/TasksTab";
import { APPS, DEFAULT_TAB, appDef, type AppDef } from "@/lib/apps";
import { BD_GREY, HEADER_CHIP_SIZE, INK, NAV_BOTTOM_GAP, NAV_H, NAV_PILL_PAD, PAPER, RUST, SANS, SOFT_SHADOW, TAB_MARK, TAB_PAD_TOP } from "@/lib/constants";
import { DataStore } from "@/lib/dataStore";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import { syncDayRecordsToMyBrain, syncTasteToMyBrain } from "@/lib/myBrainSyncClient";
import { haptic, hasPlace, isExpiredItem, pruneOldBriefs, todayKey } from "@/lib/helpers";
import type { AppId, AppState, InboxCandidate, ItemDomain, JournalEntry, JournalTabId, PlanSelection, TabId, TabProps, TasksTabId, VoiceControls } from "@/lib/types";

// 読み込み待機画面。2x2のグリッドの上を、黒い幾何学が動き回る
// (globals.css の load-rect / load-dot / load-fan)。背景と同じ語彙で、
// 1マスの中で完結させず、2x1・2x2の長方形へ伸びたり、グリッドを横断して
// 移動したり、回転したりする。半円は使わない。文字も出さない。
const LOAD_CELL = 56;
function LoadingScreen() {
  return (
    <div style={{ height: "100svh", background: BD_GREY, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="load-grid" style={{ width: LOAD_CELL * 2, height: LOAD_CELL * 2, ["--u" as string]: `${LOAD_CELL}px` }}>
        {/* 重なり順: 円・扇形が下、長方形が上(2x2に伸びたとき全部を覆う)。 */}
        <div className="load-shape load-dot" style={{ background: INK }} />
        <div className="load-shape load-fan" style={{ background: INK }} />
        <div className="load-shape load-rect" style={{ background: INK }} />
      </div>
    </div>
  );
}

// 隣のアプリへ落ち着くまでの時間は globals.css の .app-track が持つ(380ms)。
// ダッシュボードのシートの高さ(画面に対する割合)と、落ち着くまでの時間。
// components/Dashboard.tsx / globals.css と揃えること。
const DASH_SHEET_RATIO = 0.84;
const DASH_MS = 360;
// 指を離したあとの時間の下限・上限(慣性で伸び縮みする)。
const DASH_MIN_MS = 190;
const DASH_MAX_MS = 560;

// ★一周ループのための折り返し量(列の幅の倍数)。
// 列 j は本来トラックの j 番目に居るが、いまの通し番号 pos から見て
// 「いちばん近い、同じ余りの位置」へ置き直す。たとえば pos が末尾(2)のとき、
// 先頭の列(0)は右隣(位置3)へ回り込む。これで列を増やさずに、どちらの向きへ
// 払っても必ず隣に列がいる状態が作れる。
function wrapOf(j: number, pos: number): number {
  const n = APPS.length;
  const cur = ((pos % n) + n) % n;
  // -1(左隣) / 0(自分) / 1(右隣) のどれか。
  const d = ((j - cur + n + 1) % n) - 1;
  return pos + d - j;
}

function Toast({ text }: { text: string }) {
  return (
    <div key={text} style={{
      position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: INK, color: PAPER, borderRadius: 999,
      fontSize: 11, letterSpacing: "0.06em", padding: "8px 18px", boxShadow: "0 8px 24px rgba(26,26,24,0.25)", zIndex: 50,
      animation: "toast-in 0.3s cubic-bezier(0.32,0.72,0,1)",
    }}>{text}</div>
  );
}

// ★1アプリぶんの列(背景＋スクロールルート＋タブバー)。**React.memo** で
// 包んであるのが要点: シェル側の state(トースト・ダッシュボードの開閉など)が
// 動いても、props が同じ列は再レンダーされない。以前はシェルの再レンダーが
// そのままマウント済みの全アプリのタブへ流れ込み、実機で毎フレーム200ms級の
// long task を出していた(ユーザー報告「タブの切り替えが非常に重い」)。
interface AppColumnProps {
  a: AppDef;
  tab: TabId;
  active: boolean;
  mounted: boolean;
  /** 一周ループのための折り返し量(列の幅の倍数)。0なら本来の場所。 */
  wrap: number;
  memoryMode: boolean;
  tabProps: TabProps;
  appState: AppState;
  persist: (next: AppState) => void;
  showToast: (msg: string) => void;
  goTab: (id: TabId) => void;
  onNavPointerDown: (e: ReactPointerEvent) => void;
  onRecord: () => void;
  navDragged: React.MutableRefObject<boolean>;
}

const AppColumn = memo(function AppColumn({ a, tab, active, mounted, wrap, memoryMode, tabProps, appState, persist, showToast, goTab, onNavPointerDown, onRecord, navDragged }: AppColumnProps) {
  // ★1画面で完結し、スクロールさせないタブ。
  const scrollLocked = tab === "brief" || tab === "journal-record";
  return (
        <div style={{
          position: "relative", isolation: "isolate", width: `${100 / APPS.length}%`, height: "100%",
          display: "flex", flexDirection: "column", alignItems: "center", overflow: "hidden",
          // ★一周ループのための折り返し。列は本来トラックの中の自分の場所に
          // 並んでいるが、通し番号が端を越えたときは、この列を1周ぶん(±300%)
          // ずらして反対側へ回り込ませる。こうすると、どちらの向きへ払っても
          // 必ず隣に列がいる状態を、列を増やさずに作れる。値が変わるのは
          // アプリが切り替わった瞬間だけなので、ドラッグ中は静止している。
          transform: wrap ? `translateX(${wrap * 100}%)` : undefined,
          // ★★アプリの地色は**この列が持つ**(2026-08-12)。
          // 以前は画面全体に1枚だけ敷いた帆布(AppBackdrop)が現在のアプリの色を
          // 塗り、アプリが切り替わるときにその1枚が**クロスフェード**していた。
          // 列は横へスライドするのに、地色だけがその場で混ざるので、遷移中は
          // 「新しいアプリの領域に古い地色が残っている」状態になり、タブバーの
          // 下など、中身が自分で地を塗っている所との境目が見えていた
          // (実測: 払っている間ずっと 179、離すと 206→233→236 と混ざる)。
          // 地色を列に持たせると、A の地が出ていって B の地が入ってくるだけに
          // なるので、混ざる瞬間そのものが無くなる。**背景を変えても同じ**。
          // ★タブや中身の側で地色を塗らないこと。塗ると出どころが2つになり、
          // 遷移中にどちらかがズレて必ず境目が出る。
          background: groundOf(a.id),
        }}>
          <div data-tab-scroll-root style={{
            width: "100%", maxWidth: 420, flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
            overflowY: scrollLocked ? "hidden" : "auto", WebkitOverflowScrolling: "touch", overscrollBehaviorY: "contain",
            // ★スクロール中に要素がサイズ変化(プランタブの地図の縮小など)しても、
            // ブラウザのスクロールアンカリングがscrollTopを勝手に補正して
            // 「グイッと引っ張られる」ジャンプを起こさないよう無効化する。
            overflowAnchor: "none",
            // ★下の逃がしはここではなく、中身の枠(下の tab-in)が持つ。
            // スクロールコンテナ自身の padding-bottom は、flex の中身が
            // 伸びたときに scrollHeight へ正しく入らないことがあり、
            // 実際に最後の項目がタブバーの裏へ潜って止まった。
            padding: "var(--pad-top) 16px 0",
          }}>
            {active && memoryMode && <div style={{ fontSize: 9, color: RUST, letterSpacing: "0.05em", padding: "6px 4px 0", textAlign: "right" }}>メモリ動作中</div>}

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
            {/* ★タブを切り替えたときの入場アニメーション(globals.css の
                tab-in)。以前これを廃止したのは、opacity/transformを
                アニメーションする要素が新しい重なりコンテキストを作り、
                内側のzIndexを持つ要素(ブリーフの育成カードのフッター、
                zIndex:26)が、外側のnav手前の帯(zIndex:15)より手前に
                出せなくなったため。
                いまは**そのフッターを持つブリーフタブだけ**、この枠自体に
                zIndex:16を与えて帯より手前へ出している。ブリーフは中身を
                スクロールしない(scrollLocked)ので、帯のぼかしが効かなく
                なっても失うものが無い。他のタブは枠にzIndexを付けないため、
                従来どおり帯の下に潜り、ぼかしが正しく効く。 */}
            {mounted && (
              <div key={tab} className="tab-in" style={{
                display: "flex", flexDirection: "column", minHeight: 0,
                // ★flex-basis は auto(=中身の高さ)。`flex: 1`(basis 0)にすると、
                // この枠は「空いている高さ」に固定され、中身が長いタブでは
                // 中身がこの枠から**はみ出して**しまう。はみ出した分は枠の
                // padding-bottom の外側なので、下の逃がしが効かず、最後の項目が
                // タブバーの裏に潜って止まる(実測で 38px 隠れていた)。
                // basis:auto なら「中身が短ければ空きいっぱいに伸び、長ければ
                // 中身の高さになる」ので、padding-bottom が必ず効く。
                flex: "1 0 auto",
                // ★タブバーのぶんの逃がし。タブバーはフローから外して浮かせて
                // あるので、中身がその裏で止まらないようここで空けておく。
                // 画面の四隅まで敷きたいタブは `.full-bleed` がこれを打ち消す。
                paddingBottom: "var(--nav-h)",
                ...(scrollLocked ? { position: "relative" as const, zIndex: 16 } : null),
              }}>
                {tab === "brief" && <BriefTab {...tabProps} />}
                {tab === "stock" && <StockTab {...tabProps} />}
                {tab === "goals" && <GoalsTab {...tabProps} />}
                {tab === "execute" && <ExecuteTab {...tabProps} />}
                {tab === "tasks-inbox" && <InboxView appState={appState} persist={persist} showToast={showToast} />}
                {(tab === "tasks-today" || tab === "tasks-all") && <TasksTab {...tabProps} tab={tab as TasksTabId} />}
                {/* ★active(このアプリが表示中か)を明示的に渡す。円の入場アニメーションの
                    合図に使う。IntersectionObserver で見え方から推測する方式は、実機で
                    一度も発火せず「円が出てこない」不具合になった。 */}
                {tab === "journal-record" && <RecordTab {...tabProps} appActive={active} />}
                {(tab === "journal-today" || tab === "journal-archive") && <JournalTab {...tabProps} tab={tab as JournalTabId} />}
              </div>
            )}
          </>
      </div>

      {/* ★★タブバーは**フローから外して画面の上に浮かせる**(2026-08-12)。
          以前はスクロールルートの中に flex の兄弟として置いていたため、
          「本文の領域がタブバーの上端で終わる」構造になっていた。その結果、
          全面に敷きたい背景や大きな図形は必ずタブバーの手前で途切れ、
          タブの側が negative margin でタブバーの高さぶん食い込ませる、という
          帳尻合わせが要った。高さの数字がどこかでずれるたびに
          「タブバーの上下に境目が出る」「背景が途中で切れる」不具合が
          再発し、そのたびに直す羽目になっていた。
          いまはタブバーが**列の中の絶対配置**で、本文の領域は常に画面いっぱい。
          中身はタブバーの下へそのまま continue し、タブバーはその上に浮く。
          スクロールする中身がタブバーの裏に隠れて止まらないよう、逃がしは
          スクロールルートの padding-bottom(= --nav-h)で一元的に行う。
          画面の四隅まで敷きたいタブは globals.css の `.full-bleed` を付ける
          だけでよい(高さの計算はそこ1箇所にしかない)。
          ★position:fixed にはしないこと。iOS SafariのURLバー伸縮中に実際の
          ビューポートとズレて下に隙間が生まれる(過去に再発済み)。列は
          シェル(100svh)の中の普通の要素なので、その中の absolute なら
          ビューポートの都合に影響されない。
          下地へ溶け込むグラデーションは、以前はnavの内側(nav自身のzIndex
          =25)に敷いていたが、それだとPlanSelectionBar/ExecuteTabの
          バインド！ボタンのような「それ自体は不透明な独立UI」の上にまで
          このグラデーションが被さり、その下端が白っぽく洗われて見える
          事故があった。グラデーションは「素通しのスクロールコンテンツ」
          だけを対象にしたいので、nav本体(タップ対象のピル、zIndex=25)とは
          別レイヤー(zIndex=15)に分離している。バインド！系のボタンは
          さらにnavのピルの影の滲みでうっすら覆われて見える不具合もあった
          ため、両方ともnavより高いzIndex=26にして常に手前に出している。 */}
          {/* ★nav手前のぼかしの帯は**撤去した**(2026-08-03)。
              backdrop-filter + mask-image の組み合わせは Safari がマスクを
              無視することがあり、その場合ぼかしが矩形いっぱいに効いて硬い
              境目が出る。実機で「タブバーのあたりの画面が途切れて見える・
              タブバー下部に画面の端が見える」と報告されたのがこれ。
              画面全体を覆うぼかし層は、スクロールのたびに合成をやり直すため
              ちらつきの原因にもなる。ピル自体が不透明な紙色で影も持っている
              ので、帯が無くても下を流れる中身とは十分に見分けが付く。 */}
          {/* ダッシュボードを引き上げている間は、globals.css の
              [data-dash-active="1"] .app-nav がこれを消し、portal側の
              モーフ用ピルへ役目を渡す(見た目が同一の位置で入れ替わる)。
              CSS側でやるのは、そのためだけに列を再レンダーしないため。 */}
          <nav className="app-nav" style={{
            position: "absolute", left: 0, right: 0, bottom: 0,
            display: "flex", flexDirection: "column", alignItems: "center",
            padding: "0 16px", zIndex: 25, pointerEvents: "none",
          }}>
            {/* いま3つのアプリのどこにいるか。文字は出さず、点だけの控えめな
                目印にしている。この目印もトラックに乗っているので、指で
                引いている最中に「次のアプリの目印」が一緒に流れ込んでくる
                (だから遷移のアニメーションを別に付ける必要が無い)。 */}
            <div style={{ display: "flex", gap: 5, paddingBottom: 7 }}>
              {APPS.map((d) => (
                <span key={d.id} style={{
                  width: d.id === a.id ? 14 : 5, height: 5, borderRadius: 999,
                  background: d.id === a.id ? INK : "rgba(26,26,24,0.22)",
                }} />
              ))}
            </div>
            {/* SOFT_SHADOW_LG(ぼかし32px)をそのまま使うと、NAV_BOTTOM_GAPで
                画面下端ぎりぎりまで詰めたこのピルの下側は、影が滲みきる前に
                画面の外(=物理的な限界)へ突き当たり、途中でスパッと切れた
                ような不自然な見た目になっていた。ピルだけは控えめな専用の
                影に差し替え、余白が数pxしか無くても中で滲み切るようにする。 */}
            {/* ★タブバーの上を左右に払うと、この帯ごと(=中身も背景の図形も)
                横へスライドして隣のアプリへ移る。上へ引き上げるとダッシュ
                ボードが開く。判定をこのタブバーの帯だけに閉じ込めているのは、
                タブの中身(ブリーフのカードのスワイプ、アーカイブの棚の横
                スクロール、地図のパン)と一切ぶつからないようにするため。 */}
            <div
              onPointerDown={onNavPointerDown}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%", maxWidth: 420 - 32, pointerEvents: "auto",
                touchAction: "none",
              }}
            >
              {/* ★ピルの高さは以前と同じ64px(内側 TAB_MARK=52 + 上下の余白6)。
                  選択中の印はその内側にぴったり収まる**正円**で、直径が
                  そのままピルの内側の高さになる。文字は出さず、読み上げ用の
                  ラベルは aria-label に残す。 */}
              <div style={{ position: "relative", flex: 1, display: "flex", background: PAPER, borderRadius: 999, boxShadow: "0 2px 7px rgba(26,26,24,0.14)", padding: NAV_PILL_PAD, marginBottom: NAV_BOTTOM_GAP }}>
                {/* 選択中の印。1枚だけ置いて隣のタブへ滑らせる。 */}
                <div aria-hidden style={{
                  position: "absolute", top: NAV_PILL_PAD, left: NAV_PILL_PAD, height: TAB_MARK,
                  width: `calc((100% - ${NAV_PILL_PAD * 2}px) / ${a.tabs.length})`,
                  transform: `translateX(${Math.max(0, a.tabs.findIndex((t) => t.id === tab)) * 100}%)`,
                  transition: "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)",
                  display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none",
                }}>
                  <div style={{ width: TAB_MARK, height: TAB_MARK, borderRadius: "50%", background: INK }} />
                </div>
                {a.tabs.map((t) => {
                  const active = tab === t.id;
                  return (
                    <button key={t.id} aria-label={t.label} onClick={() => { if (navDragged.current) return; haptic(5); goTab(t.id); }} style={{ position: "relative", zIndex: 1, flex: 1, height: TAB_MARK, padding: 0, background: "none", border: "none", cursor: "pointer", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <TabGlyph name={t.icon} label={t.en} color={active ? PAPER : TAB_ICON_OFF} />
                    </button>
                  );
                })}
              </div>
              {/* ★右端の丸ボタンは**録音**。3つのアプリすべてで同じ位置・
                  同じ意味の常設ボタンにしてある(ユーザー指定)。どのタブから
                  押しても、いまの画面が暗くなって声の記録が開く。 */}
              <button
                onClick={() => { if (navDragged.current) return; onRecord(); }}
                aria-label="録音する"
                style={{
                  flexShrink: 0, width: 52, height: 52, borderRadius: "50%", background: INK, border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 7px rgba(26,26,24,0.14)", marginBottom: NAV_BOTTOM_GAP, padding: 0,
                }}
              >
                <TabIcon name="record" color={PAPER} size={22} />
              </button>
            </div>
          </nav>
        </div>
  );
});

export function AppShell() {
  const [appState, setAppState] = useState<AppState | null>(null);
  // ★いま開いているアプリ(タスク / 今のアプリ / ジャーナル)。タブバーの上を
  // 左右にスワイプすると APPS の順に循環して切り替わる。アプリごとに最後に
  // 見ていたタブを覚えておき、戻ってきたときそこへ帰れるようにする。
  // ★いま何番目にいるかは、0〜2に丸めない**通し番号**で持つ。右端からさらに
  // 右へ払うと3, 4… と増え、左へ払うと -1, -2… と減る。丸めてしまうと端で
  // 位置が飛んでしまい、一周ループのアニメーションが繋がらない。
  // 実際のアプリは pos を3で割った余りで決まる(下の appId)。
  const [pos, setPos] = useState(() => APPS.findIndex((a) => a.id === "life"));
  const appId = APPS[((pos % APPS.length) + APPS.length) % APPS.length].id;
  const setAppId = useCallback((id: AppId) => {
    setPos((prev) => {
      const cur = ((prev % APPS.length) + APPS.length) % APPS.length;
      const next = APPS.findIndex((a) => a.id === id);
      if (next < 0 || next === cur) return prev;
      // いまの通し番号から、いちばん近い同じ余りの位置へ動かす。
      const d = ((next - cur + APPS.length + 1) % APPS.length) - 1;
      return prev + (d === 0 ? APPS.length : d);
    });
  }, []);
  const [tabByApp, setTabByApp] = useState<Record<AppId, TabId>>({ ...DEFAULT_TAB });
  // ★ダッシュボード(画面下から引き上げる引き出し)。3つのアプリのどこからでも
  // 開ける共通のUIなので、タブではなくここに持つ。
  // 開き具合(0〜1)は指の位置と1対1で繋がっているが、**Reactのstateには持たない**。
  // documentElementの --dash に書くだけにして、指を動かしている間はレンダーを
  // 1回も起こさない(下のsetDashVar)。stateとして持つのは「いま出ているか」だけ。
  const [dashMounted, setDashMounted] = useState(false);
  const dashPRef = useRef(0);
  const setDashVar = useCallback((v: number, dragging: boolean) => {
    const root = document.documentElement;
    dashPRef.current = v;
    root.style.setProperty("--dash", String(v));
    root.dataset.dashDragging = dragging ? "1" : "0";
    root.dataset.dashActive = v > 0 ? "1" : "0";
  }, []);
  // ★指を離したあとの動きに「慣性」を持たせる(2026-08-04)。以前は速さに
  // 関わらず必ず340msの一定時間で運んでいたため、勢いよく払っても、そっと
  // 離しても同じ速さで動き、「ぎこちない・慣性がない」と報告された。
  // 残りの距離を、離した瞬間の指の速さでそのまま運びきる時間を求めて
  // --dash-ms に書く(速く払えば短く、そっと離せば長く)。減速の効き方も
  // 指数のease-out(0.16,1,0.3,1)にして、勢いが自然に収束するようにした。
  const settleDash = useCallback((open: boolean, vpx = 0) => {
    if (open) setDashMounted(true);
    const travel = Math.max(200, (window.innerHeight || 844) * DASH_SHEET_RATIO);
    const distPx = Math.abs((open ? 1 : 0) - dashPRef.current) * travel;
    const speed = Math.min(3.2, Math.abs(vpx)); // px/ms
    const ms = speed > 0.12
      ? Math.round(Math.min(DASH_MAX_MS, Math.max(DASH_MIN_MS, (distPx / speed) * 1.15)))
      : DASH_MS;
    document.documentElement.style.setProperty("--dash-ms", `${ms}ms`);
    // 開くときは、マウントされた次のフレームに --dash を1へ動かす
    // (同じフレームで0→1にするとtransitionが発火しない)。
    requestAnimationFrame(() => setDashVar(open ? 1 : 0, false));
    if (!open) window.setTimeout(() => { if (dashPRef.current === 0) setDashMounted(false); }, ms + 60);
  }, [setDashVar]);
  // ジェスチャーのハンドラはwindowへ張る都合で作り直したくない(useCallbackの
  // 依存を空にしてある)ため、いま何番目のアプリかはrefで読む。
  const posRef = useRef(pos);
  posRef.current = pos;
  const shellRef = useRef<HTMLDivElement>(null);
  // ★横スライドの位置はCSS変数で持つ。--app-offset は通し番号が変わったときだけ、
  // --drag は指が動いている間だけ書く(どちらもReactのレンダーを起こさない)。
  // ★背景はこの2つを一切見ない。指の動きから切り離し、アプリが確定した
  // 瞬間に自分のアニメーションを流す(components/AppBackdrop.tsx)。
  const setTrackVars = useCallback((p: number) => {
    document.documentElement.style.setProperty("--app-offset", `${(-p * 100) / APPS.length}%`);
  }, []);
  useEffect(() => { setTrackVars(pos); }, [pos, setTrackVars]);
  const setDragVar = useCallback((px: number, dragging: boolean) => {
    const root = document.documentElement;
    root.style.setProperty("--drag", `${px}px`);
    root.dataset.dragging = dragging ? "1" : "0";
  }, []);
  const [showProfile, setShowProfile] = useState(false);
  const [storageMode, setStorageMode] = useState(DataStore.mode);
  // 認証状態。Supabase未構成(環境変数なし)のときは認証ゲートを一切出さず、
  // これまでどおりlocalStorageで動く。そのため未構成なら authReady は即true・
  // userId は null 扱いで、ゲートの分岐をすべて素通りさせる。
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [userId, setUserId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  // ウィッシュはどのタブにいても書ける「受信箱」。タブバー横の独立した
  // ボタンから開くため、タブ固有の状態ではなくここに置く。
  const [addingWish, setAddingWish] = useState(false);
  // プランへバインドする候補の選択。タブを切り替えてもAppShell自体は
  // 常にマウントされたままなので(key={tab}で差し替わるのは中身のタブ
  // だけ)、ここに置くだけでストックタブ⇄プランタブを跨いで選択が
  // 保持される。
  const [selection, setSelection] = useState<PlanSelection>({ itemIds: [] });

  // 認証状態の監視(Supabase構成済みのときだけ)。初回セッションを確認して
  // authReady を立て、以後 onAuthStateChange でサインイン/アウトを追う。
  // 未構成なら何もしない(authReadyは初期値trueのまま、ゲートは出ない)。
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUserId(data.session?.user.id ?? null);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
      setAuthReady(true);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    // 認証の確認が済むまで待つ。構成済みで未ログインのときは何も読み込まず、
    // 在メモリの状態もクリアしてゲートに委ねる(サインアウト時のリセットも兼ねる)。
    if (!authReady) return;
    if (isSupabaseConfigured && !userId) { setAppState(null); return; }
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
        // 綴じられないまま日付をまたいだバインダーは解散し、中のカードは
        // 候補(candidate)へ戻す。プランの地図はもうplanned単体では表示
        // しない(現在のmagazineに綴じられているものだけ表示する)ため、
        // ここで戻さないと、どの画面からも見えず触れないゾンビItemになる。
        (s.magazine.itemIds ?? []).forEach((id) => {
          const item = s.items.find((i) => i.id === id);
          if (item && item.status === "planned") item.status = "candidate";
        });
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
      // 古いブリーフの号(その日限りで二度と参照されない)を間引く。
      const { pruned, changed: briefsChanged } = pruneOldBriefs(s.briefs ?? {});
      if (briefsChanged) {
        s.briefs = pruned;
        mutated = true;
      }
      setAppState(s);
      setStorageMode(DataStore.mode);
      if (mutated) await DataStore.save(s);
    });
    return () => { alive = false; };
    // 未構成なら初回のみ、構成済みなら userId が確定/変化(サインイン・アウト)
    // するたびに読み直す。
  }, [authReady, userId]);

  const persist = useCallback((next: AppState) => {
    setAppState(next);
    DataStore.save(next).then(setStorageMode);
  }, []);

  // my-brain(GitHub)→アプリの取り込み。好み・興味はアプリの設定画面から
  // my-brainへ書き込む(syncTasteToMyBrain)が、逆方向(my-brainを他アプリ
  // ―将来のジャーナル等―が直接更新した内容をこのアプリへ反映する)は、
  // クライアントがGitHubへ直接アクセスできない(GITHUB_TOKENはサーバーのみ)
  // ため、起動時にサーバー経由(/api/mybrain/read)で1回だけ取り込む。
  // ローカルに無いラベルだけを追加する(既存の重みは上書きしない)。
  const pulledMyBrainRef = useRef(false);
  useEffect(() => {
    if (!appState || pulledMyBrainRef.current) return;
    pulledMyBrainRef.current = true;
    fetch("/api/mybrain/read").then((r) => r.json()).then((data) => {
      if (!data?.ok) return;
      // 好み・興味チップはCoworkが taste-state.md を所有する。アプリはそれを取り込んで
      // 表示するだけ。ユーザーが手で足したチップ(source:"user")は残し、それ以外
      // (Cowork由来)は taste-state.md の現在値で置き換える(Coworkが消したものは消える)。
      // 手で消したラベル(dismissedInterests)は復活させない。
      // 好み/興味は「興味・好み」1リストへ統合済み(HANDOFF §8.14 優先度3)。
      // read routeはそれを単一 taste で返す(interestは後方互換で来ても取り込む)。
      const brainTaste: { label?: unknown; weight?: unknown }[] = [
        ...(Array.isArray(data.taste) ? data.taste : []),
        ...(Array.isArray(data.interest) ? data.interest : []),
      ];
      if (brainTaste.length === 0) return; // Coworkの結果がまだ無ければ触らない
      const next = structuredClone(appState);
      next.profile = next.profile ?? { interests: [] };
      const dismissed = new Set(next.profile.dismissedInterests ?? []);
      const userManual = next.profile.interests.filter((i) => i.source === "user" && !dismissed.has(i.label));
      const pinned = new Set(userManual.map((i) => i.label));
      const seen = new Set<string>();
      const fromBrain = brainTaste
        .filter((d): d is { label: string; weight?: number } => !!d && typeof d.label === "string" && !dismissed.has(d.label) && !pinned.has(d.label))
        .filter((d) => (seen.has(d.label) ? false : (seen.add(d.label), true)))
        .map((d) => ({ id: `cowork-${d.label}`, label: d.label, weight: typeof d.weight === "number" ? d.weight : 0, source: "auto" as const, addedAt: new Date().toISOString() }));
      const nextInterests = [...userManual, ...fromBrain];
      const keyOf = (arr: typeof nextInterests) => arr.map((i) => i.label).sort().join("|");
      if (keyOf(nextInterests) !== keyOf(next.profile.interests)) {
        next.profile.interests = nextInterests;
        persist(next);
      }
    }).catch(() => {});
  }, [appState, persist]);
  // ★夜間のCoworkが my-brain へ書いた「インボックスの候補」と「その日の
  // ジャーナル」を、起動時に1回だけ取り込む。既に持っているid・承認済み/
  // 却下済みのものは無視する(同じ候補が何度も戻ってこないように)。
  const pulledInboxRef = useRef(false);
  useEffect(() => {
    if (!appState || pulledInboxRef.current) return;
    pulledInboxRef.current = true;
    fetch("/api/mybrain/inbox").then((r) => r.json()).then((data) => {
      if (!data?.ok) return;
      const cands: InboxCandidate[] = Array.isArray(data.candidates) ? data.candidates : [];
      const entries: JournalEntry[] = Array.isArray(data.journal) ? data.journal : [];
      const summaries: Record<string, { text: string; at: string }> = data.summaries && typeof data.summaries === "object" ? data.summaries : {};
      if (cands.length === 0 && entries.length === 0 && Object.keys(summaries).length === 0) return;
      const next = structuredClone(appState);
      next.inbox = next.inbox ?? [];
      next.journal = next.journal ?? [];
      const seenCand = new Set([...next.inbox.map((c) => c.id), ...(next.profile.handledInbox ?? [])]);
      const seenEntry = new Set(next.journal.map((e) => e.id));
      const addedC = cands.filter((c) => c.id && !seenCand.has(c.id));
      const addedE = entries.filter((e) => !seenEntry.has(e.id));
      // その日のまとめ(Coworkが自動生成した日記)は、常に最新の内容で置き換える。
      const curSum = next.daySummaries ?? {};
      const sumChanged = Object.entries(summaries).some(([k, v]) => curSum[k]?.text !== v?.text);
      if (addedC.length === 0 && addedE.length === 0 && !sumChanged) return;
      next.inbox = [...addedC, ...next.inbox];
      next.journal = [...addedE, ...next.journal];
      if (sumChanged) next.daySummaries = { ...curSum, ...summaries };
      persist(next);
    }).catch(() => {});
  }, [appState, persist]);

  const goTab = useCallback((id: TabId) => {
    // どのアプリのタブかは APPS の定義から引く(他アプリのタブを指定された
    // 場合はそのアプリごと切り替わる)。
    const owner = APPS.find((a) => a.tabs.some((t) => t.id === id));
    setAppId(owner?.id ?? "life");
    setTabByApp((prev) => ({ ...prev, [owner?.id ?? "life"]: id }));
  }, [setAppId]);
  // ★タブバーのジェスチャー。横に払えばアプリの切り替え、上へ引き上げれば
  // ダッシュボード。最初の10pxでどちらの軸かを決め、決まった軸だけを見る
  // (斜めの動きで両方が中途半端に反応するのを防ぐ)。指を離すまでに一度でも
  // 動いていたら、ジェスチャーの終わりに合成されるclick(タブの切り替え)は
  // 無視する(navDraggedRef)。
  //
  // 追従は要素のReactハンドラではなく **windowへ直接張ったリスナー** で行う。
  // 指がタブバーの外(上方向へのドラッグでは必ず外へ出る)へ移動した瞬間に
  // 要素側のonPointerMoveは呼ばれなくなり、ジェスチャーが途中で死ぬため
  // (アーカイブの長押しドラッグで同じ罠を踏んでいる。HANDOFF §7.26)。
  //
  // ★横は「中身ごと横スライド」(ページング)になった。3アプリを横一列の
  // トラックに並べ、指の動きに1:1で追従させる。以前は地の色が変わるだけで
  // 何も動かず、タブバーだけが4割の量で申し訳程度にずれていた。
  // 端(タスク/ジャーナル)では循環をやめ、ゴムのように抵抗して戻る
  // (ページングで端から反対の端へ飛ぶと、2画面ぶん逆走する見た目になり
  // 「スワイプしている」感覚と矛盾するため。lifeが真ん中なので、どのアプリへも
  // 最大2回で行ける)。
  const navPressRef = useRef<{ id: number; x: number; y: number; axis: "" | "x" | "y" } | null>(null);
  const navDraggedRef = useRef(false);
  // ★どのアプリの中身をマウント済みにしてあるか。**増えるだけで減らさない**。
  // 以前は pointerdown のたびに両隣をマウントし、460ms後に外していた。つまり
  // タブを普通にタップしただけでアプリ2つのマウントとアンマウントが往復し、
  // 実機ではそこで1秒以上メインスレッドが止まっていた(ユーザー報告「タップ
  // しても切り替わらない」の直接の原因)。一度用意したら以後ずっと使い回す。
  const [mountedApps, setMountedApps] = useState<AppId[]>(["life"]);
  const mountApp = useCallback((id: AppId) => {
    setMountedApps((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);
  // 初回描画が落ち着いた頃(アイドル)に残りのアプリを先読みしておく。指が
  // 触れた時点では既に用意できているので、スワイプの出だしで止まらない。
  useEffect(() => {
    if (!appState) return;
    const idle: (cb: () => void) => number = typeof window.requestIdleCallback === "function"
      ? (cb) => window.requestIdleCallback(cb, { timeout: 3000 }) as unknown as number
      : (cb) => window.setTimeout(cb, 1200);
    const h = idle(() => setMountedApps(APPS.map((a) => a.id)));
    return () => { if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(h); else window.clearTimeout(h); };
  }, [appState]);
  const onNavPointerDown = useCallback((e: ReactPointerEvent) => {
    const COMMIT_RATIO = 0.18;   // 横: 画面幅のこの割合を超えたら隣へ送る
    const FLICK_PX_PER_MS = 0.5; // 短く速く払ったときは距離が足りなくても送る
    const width = window.innerWidth || 390;
    navPressRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: "" };
    navDraggedRef.current = false;
    // 速度の見積り用に直近の位置と時刻を持つ。
    let lastX = e.clientX;
    let lastY = e.clientY;
    let lastT = performance.now();
    let vx = 0;
    let vy = 0;
    // 1フレームに1回だけCSS変数へ書く(pointermoveは1フレームに複数回来ることがある)。
    let raf = 0;
    let pending: (() => void) | null = null;
    const schedule = (fn: () => void) => {
      pending = fn;
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; pending?.(); pending = null; });
    };
    const finish = () => {
      navPressRef.current = null;
      if (raf) { cancelAnimationFrame(raf); raf = 0; pending = null; }
      setDragVar(0, false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
    // ポインタを取り上げられたとき。縦に引きかけていたなら、開き具合も
    // 必ず閉じ切ってから終わる(上のaddEventListenerのコメント参照)。
    const cancel = () => {
      const axis = navPressRef.current?.axis;
      finish();
      if (axis === "y") settleDash(false);
    };
    function move(ev: PointerEvent) {
      const pr = navPressRef.current;
      if (!pr || pr.id !== ev.pointerId) return;
      const dx = ev.clientX - pr.x;
      const dy = ev.clientY - pr.y;
      const now = performance.now();
      const dt = now - lastT;
      if (dt > 0) { vx = (ev.clientX - lastX) / dt; vy = (ev.clientY - lastY) / dt; }
      lastX = ev.clientX; lastY = ev.clientY; lastT = now;
      if (!pr.axis) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        pr.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        navDraggedRef.current = true;
        // 縦だと決まった瞬間にダッシュボードを用意する(1回だけのstate更新)。
        if (pr.axis === "y") setDashMounted(true);
        if (pr.axis === "x") {
          // 左へ払うと --p は増える(0〜2 が基準でよい)。右へ払うと減るので、
          // 先頭に居るときだけ1周ぶん先(3)を基準にして 0 を下回らないようにする。
        }
      }
      if (pr.axis === "x") {
        // 一周ループするので、どちらの向きにも必ず隣がいる(端のゴムは無い)。
        schedule(() => setDragVar(dx, true));
        return;
      }
      // 縦: 引き上げた量をそのまま開き具合にする(1対1)。シートの上端が
      // 指についてくるので、travelは「シートの上端が動く距離」に合わせる。
      const travel = Math.max(200, (window.innerHeight || 844) * DASH_SHEET_RATIO);
      schedule(() => setDashVar(Math.min(1, Math.max(0, -dy / travel)), true));
    }
    function up(ev: PointerEvent) {
      const pr = navPressRef.current;
      const dx = pr ? ev.clientX - pr.x : 0;
      const axis = pr?.axis;
      // ★指を止めてから離したときは「速さ0」として扱う。vx/vy は
      // pointermove でしか更新されないので、止まっている間は最後に動いた
      // ときの速さが残り続ける。そのまま慣性に使うと、そっと置いたのに
      // 勢いよく飛んでいくことになる(実測でそうなっていた)。
      if (performance.now() - lastT > 70) { vx = 0; vy = 0; }
      finish();
      if (axis === "y") {
        // 上向きに速く払ったら、距離が足りなくても開く。
        const flickUp = vy <= -FLICK_PX_PER_MS;
        const open = flickUp || dashPRef.current >= 0.3;
        if (open) haptic(12);
        // 離した瞬間の速さをそのまま渡し、続きの動きへ引き継ぐ(慣性)。
        settleDash(open, vy);
        return;
      }
      if (axis !== "x") return;
      const far = Math.abs(dx) >= width * COMMIT_RATIO;
      // 速さで送るのは、指の向きと払った向きが一致しているときだけ。
      const flick = Math.abs(vx) >= FLICK_PX_PER_MS && Math.sign(vx) === Math.sign(dx);
      // 送らないときは、--drag が0へ戻るのに合わせて背景の figure も
      // そのまま戻ってくる(--outp が同じ書き込みで0になる)。
      if (!far && !flick) return;
      // 通し番号を素直に±1する。丸めないので端が無く、そのまま一周する。
      const step = dx < 0 ? 1 : -1;
      const next = posRef.current + step;
      haptic(10);
      // ★--drag(0へ)と--app-offset(隣のアプリへ)は必ず同じ同期の書き込みで
      // 揃える。offsetをReactのuseEffect任せにすると、「dragは0に戻ったが
      // offsetはまだ元のアプリ」という中途半端な状態が1フレーム描かれ得る
      // (＝一瞬だけ元の画面へ戻ってから隣へ動く)。
      setTrackVars(next);
      posRef.current = next;
      setPos(next);
      mountApp(APPS[((next % APPS.length) + APPS.length) % APPS.length].id);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    // ★pointercancelでも finish() だけでは足りない。縦(ダッシュボード)を
    // 引いている最中にiOSがポインタを取り上げると、--dash が途中の値のまま
    // 残り、data-dash-active="1" が効いたまま = **タブバーが opacity:0 で
    // 消え、画面全体を覆うscrimがタップを飲み続ける**という壊れた状態に
    // なっていた(pointerupが来ないので settleDash が呼ばれないため)。
    // 取り上げられたら必ず閉じ切る。
    window.addEventListener("pointercancel", cancel);
  }, [setDragVar, setDashVar, settleDash, mountApp, setTrackVars]);
  // トースト。他のコールバックが依存するので先に定義しておく。
  const showToast = useCallback((msg: string) => { setToast(msg); window.setTimeout(() => setToast(""), 1600); }, []);
  const toggleItemSelection = useCallback((id: string) => {
    haptic(8);
    setSelection((s) => ({ itemIds: s.itemIds.includes(id) ? s.itemIds.filter((x) => x !== id) : [...s.itemIds, id] }));
  }, []);
  const addItemIds = useCallback((ids: string[]) => {
    haptic(10);
    setSelection((s) => ({ itemIds: Array.from(new Set([...s.itemIds, ...ids])) }));
  }, []);
  // ★1日を締める操作(ダッシュボードの「今日を終える」)。
  // 選んでいたカードは実行済み(done)としてアーカイブのバインダーへまとめて
  // 移り、その日に済ませたタスクも同じ記録に添える。以前はこれを2段階
  // (プランの「バインダーへ」→確定ビューの「バインド！」)に分けていたが、
  // 確定ビューごと撤去してこの1操作に集約した(HANDOFF §8.25)。
  const finishDay = useCallback(() => {
    if (!appState) return;
    const next = structuredClone(appState);
    const boundAt = new Date().toISOString();
    // 実際にdoneへ変わったItemだけを記録する(設定画面から確認・元に戻せる
    // ようにするため)。タイトル等をスナップショットしておくので、後でItem
    // 自体が消えてもログの表示は壊れない。
    const boundItems: typeof next.bindLog[number]["items"] = [];
    selection.itemIds.forEach((id) => {
      const item = next.items.find((x) => x.id === id);
      if (item && item.status !== "done") {
        item.status = "done";
        item.doneAt = boundAt;
        boundItems.push({ id: item.id, title: item.title, kind: item.kind, color: item.color, images: item.images });
      }
    });
    // その日のうちに済ませたタスクも同じ記録へ添える(タスクの状態自体は
    // 変えない。まだ終わっていないタスクを締めの操作で勝手に完了扱いに
    // すると、記録が事実と食い違うため)。
    const today = todayKey();
    const doneTasks = (next.tasks ?? [])
      .filter((t) => t.dueDate === today && t.done)
      .map((t) => ({ id: t.id, title: t.title }));
    if (boundItems.length > 0 || doneTasks.length > 0) {
      next.bindLog = next.bindLog ?? [];
      next.bindLog.unshift({ id: `bindlog-${Date.now()}`, boundAt, items: boundItems, tasks: doneTasks.length > 0 ? doneTasks : undefined, undone: false });
    }
    persist(next);
    // 記録はアプリの中だけでなく my-brain 側にも揃えて、いつでも読めるように
    // する(ユーザー指定)。Coworkはこれと声のメモを材料に、その日のまとめを書く。
    syncDayRecordsToMyBrain(next);
    setSelection({ itemIds: [] });
    settleDash(false);
    showToast(boundItems.length > 0 ? `${boundItems.length}件をアーカイブへ綴じました` : "今日を終えました");
    if (boundItems.length > 0) goTab("journal-archive");
  }, [appState, selection, persist, settleDash, showToast, goTab]);
  // ★声のメモ。タブバー右の丸ボタンを長押ししている間だけ録音し、離すと
  // 文字起こしへ送る。結果はここへ溜まり、夜間にCoworkが読んで
  // インボックスの候補(タスク・ジャーナル・ウィッシュ等)へ分類する。
  const addVoiceNote = useCallback((r: { text: string; at: string; durationMs: number }) => {
    if (!appState) return;
    const next = structuredClone(appState);
    next.voiceNotes = next.voiceNotes ?? [];
    next.voiceNotes.unshift({ id: `voice-${Date.now()}`, at: r.at, text: r.text, durationMs: r.durationMs, status: "new" });
    persist(next);
    showToast("声のメモを保存しました");
  }, [appState, persist, showToast]);
  const recorder = useVoiceRecorder({ onDone: addVoiceNote, onError: (m) => showToast(m) });
  // ★録音の入口はタブバー右端の丸ボタンひとつ。押すと全画面のオーバーレイ
  // (VoiceOverlay)が開き、そこでタップして録音を始め、もう一度タップで
  // 止める。長押しでの録音(以前のトランシーバー式)は廃止した。
  const [studioOpen, setStudioOpen] = useState(false);
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;
  const onRecord = useCallback(() => {
    haptic(6);
    setStudioOpen(true);
  }, []);
  const closeStudio = useCallback(() => {
    // 録音中/確認中のまま閉じたら、その録音は捨てる。
    if (recorderRef.current.state === "recording" || recorderRef.current.state === "review") recorderRef.current.cancel();
    setStudioOpen(false);
  }, []);
  // ★「送信が終わったら閉じる」の判断は **VoiceStudio 側が持つ**
  // (2026-08-11に移した)。ここで即座に setStudioOpen(false) してしまうと、
  // オーバーレイが一瞬で消え、円が左右へ出ていくアニメーションが
  // 一度も見えないため。VoiceStudio が演出を終えてから onClose を呼ぶ。

  // ダッシュボードからのタスクのチェック。
  const toggleTask = useCallback((id: string) => {
    if (!appState) return;
    haptic(8);
    const next = structuredClone(appState);
    const t = next.tasks.find((x) => x.id === id);
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? new Date().toISOString() : undefined;
    persist(next);
  }, [appState, persist]);
  // ウィッシュの追加。ストックには入らず(ウィッシュはカテゴリーではない)、
  // ブリーフの生成材料になるだけの自由文として保存する。ここで選んだ
  // ドメインは、ブリーフがどんな種類の提案として返すかの手がかりになる。
  const addWish = useCallback((title: string, category: ItemDomain) => {
    if (!appState) return;
    haptic();
    const next = structuredClone(appState);
    next.wishes.unshift({ id: `wish-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title, category, status: "stock", addedAt: new Date().toISOString() });
    persist(next);
    syncTasteToMyBrain(next);
    showToast("ウィッシュを書きました");
  }, [appState, persist, showToast]);

  // 好み・興味の検出・更新は、アプリ側の単純なキーワード頻度(旧detectInterests)を
  // やめ、Coworkの週次分析(反応ログ→推論)が担うことにした。アプリはCoworkが
  // taste-state.mdへ書いた結果を起動時pull(下記)で取り込んで表示するだけ。
  // ユーザーの手編集(設定画面での追加・2段階削除)は引き続き可能で、
  // syncTasteToMyBrainでmy-brainへ反映される。

  // 設定ボタン。アイコンは幾何アイコン(TabIcons の gear)。以前ここに出して
  // いた興味の件数バッジは、情報として意味を成していないので撤去した
  // (2026-08-03)。
  const profileButton = useMemo(() => (
    <button onClick={() => { haptic(5); setShowProfile(true); }} aria-label="設定" style={{
      width: HEADER_CHIP_SIZE, height: HEADER_CHIP_SIZE, borderRadius: "50%",
      background: PAPER, border: "none", display: "flex", alignItems: "center", justifyContent: "center",
      cursor: "pointer", color: INK, boxShadow: SOFT_SHADOW, padding: 0, flexShrink: 0,
    }}>
      <TabIcon name="gear" color={INK} size={17} />
    </button>
  ), []);
  // ★props をメモ化する。以前はここで毎レンダー新しいオブジェクトを作って
  // いたため、シェルが再レンダーされるたびにマウント済みの全タブが
  // 作り直されていた(AppColumnのmemoも素通りしてしまう)。
  // ★録音の操作をタブへ渡す。**経過時間は渡さない**(100msごとに変わる値を
  // ここへ入れると、そのたびにtabPropsが作り直されて全タブが再レンダー
  // される)。録音の開始時刻だけを渡し、経過時間は表示する側が自分で数える。
  const voice = useMemo<VoiceControls>(
    () => ({
      state: recorder.state, startedAt: recorder.startedAt, durationMs: recorder.durationMs,
      paused: recorder.paused, elapsedMs: recorder.elapsedMs,
      levelsRef: recorder.levelsRef, timesRef: recorder.timesRef,
      toggle: recorder.toggle, togglePause: recorder.togglePause,
      send: recorder.send, cancel: recorder.cancel,
    }),
    [recorder.state, recorder.startedAt, recorder.durationMs, recorder.paused, recorder.elapsedMs,
      recorder.levelsRef, recorder.timesRef, recorder.toggle, recorder.togglePause, recorder.send, recorder.cancel],
  );
  // ウィッシュを書く入口。タブバーの右端は録音に譲ったので、いまは
  // ストックタブ(ウィッシュの一覧がある場所)から開く。
  const openWishSheet = useCallback(() => { haptic(5); setAddingWish(true); }, []);
  const tabProps = useMemo(
    () => (appState ? { appState, persist, showToast, goTab, profileButton, selection, toggleItemSelection, addItemIds, setSelection, voice, openWishSheet } as TabProps : null),
    [appState, persist, showToast, goTab, profileButton, selection, toggleItemSelection, addItemIds, voice, openWishSheet],
  );

  // 認証ゲート(Supabase構成済みのときだけ)。未構成なら以下の2分岐は素通り。
  if (isSupabaseConfigured && !authReady) {
    return <LoadingScreen />;
  }
  if (isSupabaseConfigured && authReady && !userId) {
    return <SignInGate />;
  }

  if (!appState || !tabProps) {
    return <LoadingScreen />;
  }


  // 実行タブなどをスクロールした状態で別タブ(特にブリーフタブ)へ切り替えると
  // ヘッダーが見切れる不具合が繰り返し再発していた。原因は「ウィンドウ/body
  // 自体がスクロールする」設計にあった: タブ切替はDOMのkeyを変えて中身を
  // 差し替えるだけなので、スクロール位置(window.scrollY)は前のタブのぶんが
  // そのまま残り、次のタブがそれを引き継いでしまう。scrollTo(0,0)を都度
  // 呼ぶ対症療法を重ねても、実機の慣性スクロールとのタイミング競合で
  // すり抜けることがあった。
  // 根本対応として、外側の器(この最外周div)は常にちょうどビューポートの高さで
  // overflow:hiddenにしてウィンドウ自体は絶対にスクロールしないようにし、
  // 代わりにタブの中身を包むこの内側のdivだけがoverflow-y:autoでスクロール
  // する。key={tab}でタブ切替のたびにこの内側divごとDOMが作り直されるため、
  // スクロール位置は毎回ブラウザネイティブに0から始まり、前のタブの位置が
  // 引き継がれる余地がそもそも無くなる。ブリーフタブだけは元々スクロール
  // させたくない(カード自体で完結する設計)ので、ここでoverflowを明示的に
  // hiddenにする(以前はブリーフタブ側でdocument.body.style.overflowを
  // 直接いじっていたが、bodyがそもそもスクロールしなくなったので不要になった)。
  // 高さの単位は100dvhではなく100svhにしている。dvh(動的ビューポート高)は
  // SafariのURLバーの伸縮に追従して値がライブに変わる設計だが、この器は
  // そもそも中身が一切スクロールしない(スクロールは内側のdivが担当し、
  // ブリーフタブ滞在中はそれすらhidden)ため、ライブ追従できる利点を
  // 一切使っていない。それでいて実機Safariのdvhはツールバーの動きと無関係な
  // タイミング(DOM更新のたびなど)でも値が揺れることがあり、これが
  // ブリーフタブでスワイプ確定・育成カード昇格の瞬間にカード全体がガクッと
  // 動く不具合の一因と疑われる(HANDOFF-CURRENT.md §7参照)。svh(小さい方の
  // ビューポート高=ツールバー表示時の高さ)は固定値でライブに変化しないため、
  // この揺れが構造的に起こらなくなる。代わりにツールバーが後から隠れた場合は
  // 器の下に数十pxの余白(背景色のみ)が残ることがあるが、スクロールを
  // 目的とした値ではないためこのアプリでは実害がない。
  // プランタブの確定ビュー(バインダー)は、以前ここに専用の入れ子スクロール
  // 領域(ExecuteTab内のscrollRef、外側をロックしてMasthead・「選び直す」を
  // 固定表示させる構成)を持たせていたが、ユーザーからの指摘により撤回した:
  // 他のタブ(ストック・アーカイブ等)はすべてMasthead込みでこの外側の
  // スクロールに乗る一枚の流れになっており、下までスクロールすればカードが
  // 画面の一番上まで届く。実行タブだけMastheadを画面上部に固定表示させる
  // 設計は他タブと挙動が異なり、「選び直すの下で境目ができてカードが
  // 見切れる」という体感の原因になっていた。他タブと同じ一枚のスクロール
  // に統一し、Mastheadも他タブ同様にスクロールで流れるようにする
  // (execMapModeはロックの判定にはもう使わないが、選択編集の状態管理
  // 自体はExecuteTab内で引き続き必要)。
  // 設定画面は3アプリ共通の1枚なので、横スライドのトラックとは別に出す。
  if (showProfile) {
    return (
      <div style={{ height: "100svh", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", fontFamily: SANS, color: INK, position: "relative" }}>
        <div data-tab-scroll-root style={{
          width: "100%", maxWidth: 420, flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
          overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehaviorY: "contain", overflowAnchor: "none",
          padding: "max(16px, env(safe-area-inset-top)) 16px 24px",
        }}>
          {storageMode === "memory" && <div style={{ fontSize: 9, color: RUST, letterSpacing: "0.05em", padding: "6px 4px 0", textAlign: "right" }}>メモリ動作中</div>}
          <ProfileTab appState={appState} persist={persist} onClose={() => setShowProfile(false)} />
        </div>
        {toast && <Toast text={toast} />}
      </div>
    );
  }

  return (
    <div ref={shellRef} style={{
      height: "100svh", overflow: "hidden",
      fontFamily: SANS, color: INK,
      // ★タブバーの高さと本文の上余白は、ここで一度だけCSS変数として配る。
      // 「タブバーのぶんの余白」を要る場所(スクロールルートの下パディング、
      // globals.css の .full-bleed)はすべてこれを見る。値を変えるときは
      // lib/constants.ts の NAV_H / TAB_PAD_TOP だけを直せばよい。
      ...({ "--nav-h": NAV_H, "--pad-top": TAB_PAD_TOP } as React.CSSProperties),
      // 背景(AppBackdrop)はzIndex:-1で敷くので、シェルを独立した重なりの
      // 単位にして、外へ抜け落ちないようにする。
      // 背景(AppBackdrop)はbody直下へポータルで敷いてあるので、ここは透明。
      position: "relative",
    }}>
      {/* ★背景は3アプリ共通の1枚のグリッド。列の中ではなくここ(シェル直下)に
          1つだけ置く。グリッド自体は動かず、アプリを移ると各マスの大きさが
          変わって図形が切り替わる。 */}
      <AppBackdrop appId={appId} />
      {/* ★3アプリを横一列に並べたトラック。タブバーも中身も、この1枚が
          まとめて動く(=「タブバーごとスワイプされる」)。各列が自分の
          スクロールルートと自分のタブバーを持つので、タブの数が3/4/2と
          違っても隣のタブバーがそのまま流れ込んで見える。 */}
      {/* 位置は globals.css の .app-track が --app-offset(アプリの番号) と
          --drag(指の量) から算出する。ドラッグ中はJSがCSS変数を書くだけで、
          Reactのレンダーは1回も走らない。 */}
      <div className="app-track" style={{
        position: "absolute", inset: 0, display: "flex", width: `${APPS.length * 100}%`,
      }}>
      {APPS.map((a, j) => (
        <AppColumn
          key={a.id}
          a={a}
          tab={tabByApp[a.id]}
          active={a.id === appId}
          mounted={mountedApps.includes(a.id)}
          wrap={wrapOf(j, pos)}
          memoryMode={storageMode === "memory"}
          tabProps={tabProps}
          appState={appState}
          persist={persist}
          showToast={showToast}
          goTab={goTab}
          onNavPointerDown={onNavPointerDown}
          onRecord={onRecord}
          navDragged={navDraggedRef}
        />
      ))}
      </div>

      {toast && <Toast text={toast} />}

      {/* タブ・アプリを跨いで持ち回す選択の目印。件数だけを示し、タップで
          ダッシュボードが開く(確定の操作はダッシュボードに集約した)。 */}
      {!dashMounted && (
        <SelectionMarker appState={appState} selection={selection} onOpen={() => settleDash(true)} />
      )}

      {addingWish && <AddWishSheet onAdd={addWish} onClose={() => setAddingWish(false)} />}

      {/* ★どのアプリからでも開く、声の記録の全画面オーバーレイ。 */}
      <VoiceOverlay voice={voice} open={studioOpen} onClose={closeStudio} />

      {/* ★ダッシュボード。タブバーを上へ引き上げる(または選択の目印をタップ
          する)と、3つのアプリのどこからでも開く共通の引き出し。選んでいる
          カードとその日のタスクを1枚で見渡し、「今日を終える」で1日を締める。 */}
      {dashMounted && (
        <Dashboard
          appState={appState}
          selection={selection}
          app={appDef(appId)}
          tab={tabByApp[appId]}
          onDrag={setDashVar}
          onSettle={settleDash}
          onToggleItem={toggleItemSelection}
          onClearSelection={() => setSelection({ itemIds: [] })}
          onToggleTask={toggleTask}
          onFinishDay={finishDay}
        />
      )}
    </div>
  );
}

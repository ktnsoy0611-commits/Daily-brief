"use client";

import { SPACE, TYPE, TRACK, WEIGHT, RADIUS } from "@/lib/tokens";
import { ms as msOf, T_ITEM, T_OUT } from "@/lib/motion";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { AddWishSheet } from "@/components/AddWishSheet";
import { AppBackdrop, groundOf } from "@/components/AppBackdrop";
import { inkVarsOn } from "@/lib/palette";
import { CreateMenu, type MenuAt } from "@/components/CreateMenu";
import { AppModules } from "@/components/AppModules";
import { AppNav } from "@/components/AppNav";
import { SignInGate } from "@/components/SignInGate";
import { useVoiceRecorder } from "@/components/VoiceRecorder";
import { VoiceOverlay } from "@/components/VoiceStudio";
import { DevStageTab } from "@/components/tabs/DevStageTab";
import { HomeTab } from "@/components/tabs/HomeTab";
import { ProfileTab } from "@/components/tabs/ProfileTab";
import { TaskComposer, type ComposerData } from "@/components/tasks/TaskComposer";
import { TaskSpace } from "@/components/tasks/TaskSpace";
import { ViewportProbe } from "@/components/tasks/ViewportProbe";
import { APPS, DEFAULT_TAB, type AppDef } from "@/lib/apps";
import { isViewportDebug } from "@/lib/debugViewport";
import { whenPileSettled } from "@/lib/bootQuiet";
import { BD_GREY, CHARCOAL, INK, NAV_H, PAPER, RUST, SANS, TAB_MARK, TAB_PAD_TOP } from "@/lib/constants";
import { DataStore } from "@/lib/dataStore";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import { kickViewport } from "@/lib/viewportKick";
import { syncTasteToMyBrain } from "@/lib/myBrainSyncClient";
import { haptic, hasPlace, isExpiredItem, pruneOldBriefs, todayKey } from "@/lib/helpers";
import type { AppId, AppState, InboxCandidate, ItemDomain, JournalEntry, TabId, TabProps, Task, VoiceControls } from "@/lib/types";

// 読み込み待機画面。2x2のグリッドの上を、黒い幾何学が動き回る
// (globals.css の load-rect / load-dot / load-fan)。背景と同じ語彙で、
// 1マスの中で完結させず、2x1・2x2の長方形へ伸びたり、グリッドを横断して
// 移動したり、回転したりする。半円は使わない。文字も出さない。
const LOAD_CELL = 56;
function LoadingScreen() {
  return (
    <div data-paint style={{ height: "100svh", background: BD_GREY, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="load-grid" style={{ width: LOAD_CELL * 2, height: LOAD_CELL * 2, ["--u" as string]: `${LOAD_CELL}px` }}>
        {/* 重なり順: 円・扇形が下、長方形が上(2x2に伸びたとき全部を覆う)。 */}
        <div className="load-shape load-dot" style={{ background: INK }} />
        <div className="load-shape load-fan" style={{ background: INK }} />
        <div className="load-shape load-rect" style={{ background: INK }} />
      </div>
    </div>
  );
}

function Toast({ text }: { text: string }) {
  return (
    <div key={text} style={{
      position: "fixed", top: SPACE.lg, left: "50%", transform: "translateX(-50%)", background: INK, color: PAPER, borderRadius: RADIUS.pill,
      fontSize: TYPE.small, fontWeight: WEIGHT.text, letterSpacing: TRACK.normal, padding: `${SPACE.sm}px ${SPACE.lg}px`, boxShadow: "0 8px 24px rgba(26,26,24,0.25)", zIndex: 50,
      animation: "toast-in var(--t-item) var(--ease-sheet)",
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
  /** ★★列の見え方 … いま表示中／入れ替わりで下に残っている（新しい列がその上へ現れ終わるまで）／隠れている。 */
  phase: "active" | "leaving" | "hidden";
  memoryMode: boolean;
  tabProps: TabProps;
  /** ★★モジュールへ運ぶ合図（`goTab` とバーの再タップ）。 */
  jump: { tab: TabId; n: number };
}

const AppColumn = memo(function AppColumn({ a, tab, active, mounted, phase, memoryMode, tabProps, jump }: AppColumnProps) {
  // ★★★**アプリの中身は3通り**（第134巡）… HOME ＝ 1枚きり／TASK ＝ 作り直すまで1枚（中で縦の払いを使う）／
  //   EXPLORE・JOURNAL ＝ 縦のモジュール（`AppModules`）。どれも列そのものはスクロールさせない。
  const isTasks = a.id === "tasks";
  const isModules = a.id === "life" || a.id === "journal";
  return (
        <div style={{
          // ★★★**4つの列は同じ場所に重ねて置く**（第134巡の2度目にユーザー指摘「**スワイプしているわけではない
          //   のでアプリ間をスライドするアニメーションは消す**」「**タブバーや要素が一瞬消える**」）。
          //   横一列のトラックを送る作りは、切り替えのたびに**列の置き直し（`transform`）とトラックの移動**が
          //   別々のフレームで効き、バーごと列が動いたり一瞬抜けたりしていた。
          //   → 新しい列を**古い列の上に重ねて不透明度だけで現す**（`T_ITEM`・`--ease-settle`）。古い列は現れ終わる
          //   まで下に残る（`leaving`）ので、**どの瞬間も画面に何も無いフレームが無い**。隠れた列は `visibility:
          //   hidden`（寸法はそのまま ＝ 戻っても測り直しも作り直しも起きない）。★`transform` は使わない（中の
          //   山・帯・送りは画面上の座標を測るので、動かすと切り替えの途中で測り違える）。
          position: "absolute", inset: 0, isolation: "isolate",
          display: "flex", flexDirection: "column", alignItems: "center", overflow: "hidden",
          zIndex: phase === "active" ? 2 : phase === "leaving" ? 1 : 0,
          visibility: phase === "hidden" ? "hidden" : "visible",
          opacity: phase === "hidden" ? 0 : 1,
          transition: phase === "active" ? "opacity var(--t-item) var(--ease-settle)" : "none",
          pointerEvents: phase === "active" ? "auto" : "none",
          // ★★アプリの地色は**この列が持つ**(2026-08-12)。タブや中身の側で地色を塗らないこと。
          background: groundOf(a.id),
          // ★★★**地の上に直接いる文字の色を、ここで決めて配る**（第77巡）。
          ...inkVarsOn(groundOf(a.id)),
        }}>
          <div data-tab-scroll-root style={{
            width: "100%", maxWidth: 420, flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
            // ★★縦の送りはモジュールの器（`ModuleRail`）が自分でやる。列はスクロールしない。
            overflowY: "hidden",
            // ★★★**横は決してスクロールさせない**（第103巡）。`hidden` ではなく `clip`（容器を作らない）。
            overflowX: "clip",
            overflowAnchor: "none",
            padding: `var(--pad-top) ${SPACE.lg}px 0`,
          }}>
            {active && memoryMode && <div style={{ fontSize: TYPE.micro, fontWeight: WEIGHT.text, color: RUST, letterSpacing: TRACK.normal, padding: `${SPACE.sm}px ${SPACE.xs}px 0`, textAlign: "right" }}>メモリ動作中</div>}
            {mounted && (
              // ★★key はアプリで固定する（モジュールを送っても・`goTab` でも中身を作り直さない ――
              //   matter.js の山や送りの位置が崩れるため）。
              <div key={a.id} style={{
                display: "flex", flexDirection: "column", minHeight: 0,
                flex: "1 0 auto",
                // ★タブバーのぶんの逃がし。画面の四隅まで敷く中身は `.full-bleed` がこれを打ち消す。
                paddingBottom: "var(--nav-h)",
                position: "relative", zIndex: 16,
              }}>
                {a.id === "home" && <HomeTab {...tabProps} appActive={active} />}
                {isTasks && <TaskSpace {...tabProps} tab={tab} appActive={active} />}
                {isModules && <AppModules app={a.id as "life" | "journal"} tabProps={tabProps} active={active} jump={jump} />}
              </div>
            )}
          </div>

        </div>
  );
});

export function AppShell() {
  const [appState, setAppState] = useState<AppState | null>(null);
  // ★★★**いま開いているアプリ**（第134巡）。バーを押すと、新しい列が古い列の上に不透明度で現れる
  //   （`AppColumn` の `phase`）。古い列は `T_ITEM` のあいだ下に残す（`leaving`）。
  // ★★★起動して最初に見るのは**ホーム**（2026-09-07 ユーザー確定）。
  const [appId, setAppIdState] = useState<AppId>("home");
  const [leaving, setLeaving] = useState<AppId | null>(null);
  const leaveTimer = useRef(0);
  const setAppId = useCallback((id: AppId) => {
    setAppIdState((cur) => {
      if (cur === id) return cur;
      setLeaving(cur);
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = window.setTimeout(() => setLeaving(null), msOf(T_ITEM));
      return id;
    });
  }, []);
  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);
  const [tabByApp, setTabByApp] = useState<Record<AppId, TabId>>({ ...DEFAULT_TAB });
  /** ★★モジュールへ運ぶ合図（アプリごと。`n` が変わるたびに1回運ぶ）。 */
  const [jumps, setJumps] = useState<Record<AppId, { tab: TabId; n: number }>>(
    () => Object.fromEntries(APPS.map((a) => [a.id, { tab: DEFAULT_TAB[a.id], n: 0 }])) as Record<AppId, { tab: TabId; n: number }>);
  const shellRef = useRef<HTMLDivElement>(null);
  // ★★シェルは絶対に横へも縦へもずれない(2026-08-19・第26巡)。
  // overflow:hidden でも、ブラウザは「画面の外にある要素へ焦点が移った」とき
  // 勝手にこの箱をスクロールする(iOS のキーボード表示・要素の可視化)。列は
  // 3つぶん(幅の3倍)並んでいるので、隣の列のボタンが焦点を取った瞬間に
  // scrollLeft が数百px になり、**指では二度と戻せない**(overflow:hidden なので
  // スクロールバーも慣性も無い)。実測で scrollLeft=320 のまま固定され、画面
  // 全体が左へ 320px ずれた状態になっていた=「レイアウトが崩れたまま直らない」。
  // 動かされたら即座に 0 へ戻す。ここが唯一の防波堤。
  // ★シェルはまだ画面に居ないことがある(読み込み中は別の枝を返す)ので、
  // ref ではなく document の捕捉相で受ける。scroll は上へ伝わらないが、
  // capture なら祖先でも拾える。
  useEffect(() => {
    const home = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (!el || !(el instanceof HTMLElement) || el.dataset.appShell === undefined) return;
      if (el.scrollLeft !== 0) el.scrollLeft = 0;
      if (el.scrollTop !== 0) el.scrollTop = 0;
    };
    document.addEventListener("scroll", home, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", home, { capture: true });
  }, []);
  // ★★iOS の既知の不具合への対処(2026-08-19・第30巡)。ホーム画面から起動した
  //   直後は、画面の高さを実際より短く報告することがある(`lib/viewportKick.ts`)。
  //   起動直後と、アプリへ戻ってきた瞬間(バックグラウンドから復帰)の2か所で
  //   一度ずつ、WebKit にレイアウトのやり直しを強制する。
  useEffect(() => {
    kickViewport();
    const onVisible = () => { if (document.visibilityState === "visible") kickViewport(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
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
      // 好み/興味は「興味・好み」1リストへ統合済み(docs/archive/brief-pipeline-2026-07.md §8.14 優先度3)。
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

  /** ★★飛んだ先で開いておきたい提案のカード（第119巡。ホームの山から BRIEF へ）。 */
  const [focusCard, setFocusCard] = useState<string | null>(null);
  const clearFocusCard = useCallback(() => setFocusCard(null), []);

  const goTab = useCallback((id: TabId, card?: string) => {
    // どのアプリのタブかは APPS の定義から引く(他アプリのタブを指定された
    // 場合はそのアプリごと切り替わる)。
    const owner = APPS.find((a) => a.tabs.some((t) => t.id === id));
    setAppId(owner?.id ?? "life");
    setTabByApp((prev) => ({ ...prev, [owner?.id ?? "life"]: id }));
    // ★★そのモジュールまで運ぶ（EXPLORE・JOURNAL の縦の送り）。
    setJumps((prev) => ({ ...prev, [owner?.id ?? "life"]: { tab: id, n: prev[owner?.id ?? "life"].n + 1 } }));
    // ★★**`undefined` で消さない** ―― 普通のタブ切り替えでも降ろしたいので、
    //   **渡されなければ `null`**（＝「開いておきたいカードは無い」）。
    setFocusCard(card ?? null);
  }, [setAppId]);
  // ★どのアプリの中身をマウント済みにしてあるか。**増えるだけで減らさない**。
  // 以前は pointerdown のたびに両隣をマウントし、460ms後に外していた。つまり
  // タブを普通にタップしただけでアプリ2つのマウントとアンマウントが往復し、
  // 実機ではそこで1秒以上メインスレッドが止まっていた(ユーザー報告「タップ
  // しても切り替わらない」の直接の原因)。一度用意したら以後ずっと使い回す。
  const [mountedApps, setMountedApps] = useState<AppId[]>(["home"]);
  const mountApp = useCallback((id: AppId) => {
    setMountedApps((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);
  // 初回描画が落ち着いた頃に残りのアプリを先読みしておく。指が触れた時点では
  // 既に用意できているので、スワイプの出だしで止まらない。
  //
  // ★★★**「落ち着いてから、1つずつ」**（2026-09-16・第115巡）。
  //   ★★★**第114巡までは `requestIdleCallback(..., {timeout:3000})` で2つを
  //     一度に載せていた** ―― `timeout` は「暇が無くても必ず呼ぶ」締切なので、
  //     **ホームの山が落ちている最中に必ず割り込む**。そこで EXPLORE の札の束と
  //     TASK の matter の世界と JOURNAL の録音の画面が**同時に組み上がり**、
  //     **全文書のレイアウトが 1回 400ms 超**（実測 … 348/516 個の再計算）。
  //     これが「**最初に図形が落ちてくる時だけ重い**」の正体で、
  //     **GRAVITY が軽いのは「最初の画面ではない」から**だった。
  //   ★★**軽いフレームが続いたら落ち着いたとみなす**（`CALM_*`）。どれだけ
  //     忙しくても `GIVE_UP_MS` で諦めて載せる（永久に載せないのは困る）。
  //   ★★**1回に1つ**。2つ同時だと、結局そこで1つの大きな山ができる。
  //   ★指が先に触れたら `mountApp` が即座に載せるので、待ちは体感に出ない。
  useEffect(() => {
    if (!appState) return;
    /** 軽いとみなすフレームの長さ（ms）と、続けて要る本数。★目盛りの外（手ざわり）。 */
    const CALM_MS = 24;
    const CALM_FRAMES = 20;
    /**
     * ★★**ここまでは何があっても載せない**（ms）。ホームの山が落ち終わるまで。
     * ★★★**「軽いフレームが続いた」だけでは足りない** ―― 落とす順は 60ms ずつ
     *   ずらしてあるので、**落ち始めの数百 ms は軽いフレームが並ぶ**。そこで
     *   載せると、いちばん見てほしい所に 160ms の山ができる（実測）。
     */
    const MIN_MS = 2200;
    /** どんなに忙しくても、ここまで待ったら載せる（ms）。 */
    const GIVE_UP_MS = 6000;
    /** ★★★**山が落ち終わるのを待つ上限**（第134巡）。山が何かで止まらなくても、ここで諦めて先へ進む。 */
    const SETTLE_LIMIT_MS = 12000;
    const rest = APPS.map((a) => a.id);
    let raf = 0; let calm = 0; let prev = 0;
    let t0 = performance.now();
    const tick = (t: number) => {
      if (prev) calm = t - prev < CALM_MS ? calm + 1 : 0;
      prev = t;
      if ((t - t0 > MIN_MS && calm >= CALM_FRAMES) || t - t0 > GIVE_UP_MS) {
        const next = rest.shift();
        if (next) mountApp(next);
        calm = 0;
        if (!rest.length) return;
      }
      raf = requestAnimationFrame(tick);
    };
    // ★★★**山が落ち終わってから数え始める**（第134巡。ユーザー指摘「**起動直後に図形が落ちてくる時にフレームレートが
    //   低下する**」）。第115巡の `MIN_MS`(2.2s) は「落ちている時間」の見積もりで、遅い端末では落下がそれより長く、
    //   `GIVE_UP_MS`(6s) で**落下の最中に**アプリを1つ組み上げていた（実測 CPU×4 で 6〜8s に 200ms 級の長い仕事）。
    //   → 山の合図（`lib/bootQuiet.ts`）を待ってから、軽いフレームが続くのを待つ。
    const cancel = whenPileSettled(() => {
      t0 = performance.now() - MIN_MS + msOf(T_OUT);
      raf = requestAnimationFrame(tick);
    }, SETTLE_LIMIT_MS);
    return () => { cancel(); cancelAnimationFrame(raf); };
  }, [appState, mountApp]);
  // ★★★**バーを押した**（第134巡）。別のアプリならそこへ移る（最後に見ていたモジュールのまま）。
  //   ★選んでいるアプリの印をもう一度押したら、そのアプリの**先頭のモジュール**へ戻る。
  const onGo = useCallback((id: AppId) => {
    if (id !== appId) { mountApp(id); setAppId(id); return; }
    const first = DEFAULT_TAB[id];
    setTabByApp((prev) => ({ ...prev, [id]: first }));
    setJumps((prev) => ({ ...prev, [id]: { tab: first, n: prev[id].n + 1 } }));
  }, [appId, mountApp, setAppId]);
  // トースト。他のコールバックが依存するので先に定義しておく。
  const showToast = useCallback((msg: string) => { setToast(msg); window.setTimeout(() => setToast(""), 1600); }, []);
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
  // ★★右端の丸は**作るものを選ぶ入口**(2026-08-19・第28巡にユーザー指定)。
  //   押した丸の場所を控えて、そこから円を広げる(`components/CreateMenu.tsx`)。
  const [menuAt, setMenuAt] = useState<MenuAt | null>(null);
  /** ★開発用。実機の数値を隅に出す(直ったら撤去する)。 */
  const [probe, setProbe] = useState(false);
  useEffect(() => setProbe(isViewportDebug()), []);
  const onRecord = useCallback((from: HTMLElement) => {
    haptic(6);
    const r = from.getBoundingClientRect();
    setMenuAt({ x: r.left, y: r.top, w: r.width, h: r.height });
  }, []);
  const openStudio = useCallback(() => { haptic(6); setStudioOpen(true); }, []);

  // ★★**タスクの追加は3つのアプリのどこからでも**(同巡)。以前はタスクアプリの
  //   ＋ からしか作れなかった。ここで持つのは「まだ保存していない下書き」1つだけで、
  //   題が付いたまま閉じたときに初めて `tasks` の先頭へ入る
  //   (タスクアプリの ＋ と同じ約束。`components/tabs/GravityTab.tsx`)。
  const [newTask, setNewTask] = useState<Task | null>(null);
  // ★`from`(押した所)は**もう見ない**(第62巡)。入力画面の帰り先は
  //   いつでも右下の丸 ― 出どころを溜めると、輪から開いたときの扇の先が
  //   焼き付いて、以後ずっとそこへ帰ってしまう(`lib/motion.ts` を見よ)。
  const openNewTask = useCallback(() => {
    setNewTask({ id: `task-${Date.now()}`, title: "", done: false, createdAt: new Date().toISOString(), weight: 2 });
  }, []);
  const saveNewTask = useCallback((base: Task, d: ComposerData, done: boolean) => {
    setNewTask(null);
    if (!appState || !d.title.trim()) return;      // 題が無いまま閉じたら何も無かったことに
    const next: AppState = structuredClone(appState);
    next.tasks = [{ ...base, ...d, done }, ...(next.tasks ?? [])];
    persist(next);
    // ★★**落ちるところを見せる**(第38巡にユーザー確定)。輪から作ったタスクは
    //   重さを持つので、行き先は必ず地上(GRAVITY)。**タスクアプリを見ている
    //   ときだけ**カメラをそこへ降ろす — 他のアプリに居るときに勝手に画面が
    //   変わるのは、頼んでいない移動なのでしない(次に開いたときには静かに
    //   積まれている)。降りた先で `GravityTab` が画面の上端の外から落とす。
    if (appId === "tasks" && !done) goTab("tasks-gravity");
  }, [appState, persist, appId, goTab]);
  const closeStudio = useCallback(() => {
    // 録音中/確認中のまま閉じたら、その録音は捨てる。
    if (recorderRef.current.state === "recording" || recorderRef.current.state === "review") recorderRef.current.cancel();
    setStudioOpen(false);
  }, []);
  // ★「送信が終わったら閉じる」の判断は **VoiceStudio 側が持つ**
  // (2026-08-11に移した)。ここで即座に setStudioOpen(false) してしまうと、
  // オーバーレイが一瞬で消え、円が左右へ出ていくアニメーションが
  // 一度も見えないため。VoiceStudio が演出を終えてから onClose を呼ぶ。

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

  // ★★設定の入口は**右下の輪の SETTING だけ**(2026-08-26・第68巡にユーザー指定)。
  //   以前は各画面の `Masthead` 右上に歯車の丸を常設していた
  //   (`TabProps.profileButton` → 7画面の `corner`)が、常に見えている必要の
  //   ない入口が全画面の右上を占め続けていた。入口は1か所に集める。
  const openSetting = useCallback(() => { haptic(5); setShowProfile(true); }, []);
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
    () => (appState ? { appState, persist, showToast, goTab, voice, openWishSheet, focusCard, clearFocusCard } as TabProps : null),
    [appState, persist, showToast, goTab, voice, openWishSheet, focusCard, clearFocusCard],
  );

  // ★★確認用の `DEV`（第134巡に EXPLORE のタブから設定の中へ移した）。
  const [showDev, setShowDev] = useState(false);

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
  // 動く不具合の一因と疑われる(docs/archive/ui-binder-2026-07.md §7 参照)。svh(小さい方の
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
  // ★★確認用の見本帳。3アプリ共通の1枚なので、設定と同じくトラックとは別に出す。
  if (showDev) {
    return (
      <div data-app-shell style={{
        height: "100svh", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center",
        fontFamily: SANS, color: INK, background: BD_GREY, position: "relative",
        ...({ "--nav-h": NAV_H, "--pad-top": TAB_PAD_TOP } as React.CSSProperties),
      }}>
        <div data-tab-scroll-root style={{
          width: "100%", maxWidth: 420, flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
          overflowY: "auto", overflowX: "clip", padding: `var(--pad-top) ${SPACE.lg}px 0`,
        }}>
          <DevStageTab />
        </div>
        <button onClick={() => setShowDev(false)} aria-label="DEV を閉じる" style={{
          // ★右下（タブバーの「作る」の丸と同じ場所）。上は見本の切り替えが使う。
          position: "absolute", bottom: `calc(${SPACE.lg}px + env(safe-area-inset-bottom))`, right: SPACE.lg, zIndex: 40,
          width: TAB_MARK, height: TAB_MARK, borderRadius: RADIUS.circle, border: "none", cursor: "pointer",
          background: INK, color: PAPER, display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
        }}><X size={20} strokeWidth={2} /></button>
      </div>
    );
  }

  if (showProfile) {
    return (
      // ★★設定は**全画面のオーバーレイ**。第78巡にユーザー指定で**暗い地**へ
      //   （入力画面・録音と揃える）。色の語彙は `ProfileTab` が自分で持つ。
      <div style={{ height: "100svh", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", fontFamily: SANS, color: PAPER, background: CHARCOAL, position: "relative" }}>
        <div data-tab-scroll-root style={{
          width: "100%", maxWidth: 420, flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
          overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehaviorY: "contain", overflowAnchor: "none",
          padding: `max(${SPACE.lg}px, env(safe-area-inset-top)) ${SPACE.lg}px ${SPACE.xl}px`,
        }}>
          {storageMode === "memory" && <div style={{ fontSize: TYPE.micro, fontWeight: WEIGHT.text, color: RUST, letterSpacing: TRACK.normal, padding: `${SPACE.sm}px ${SPACE.xs}px 0`, textAlign: "right" }}>メモリ動作中</div>}
          <ProfileTab appState={appState} persist={persist} onClose={() => setShowProfile(false)}
            onOpenDev={() => { setShowProfile(false); setShowDev(true); }} />
        </div>
        {toast && <Toast text={toast} />}

      {/* ★開発用の数値表示。**入力画面を開かなくても読める**ようにした
          (2026-08-19・第29巡)。画面の下端がページの外かどうかは、入力画面を
          開いていないときにこそ見たい。設定 →「画面の数値を出す」で出る。
          ★直ったら `lib/debugViewport.ts` ごと撤去する。 */}
      {probe && <ViewportProbe />}
      </div>
    );
  }

  return (
    <div ref={shellRef} data-app-shell style={{
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
      {/* ★★4つの列は同じ場所に重なる（`AppColumn` の `phase`）。 */}
      {APPS.map((a) => (
        <AppColumn
          key={a.id}
          a={a}
          tab={tabByApp[a.id]}
          active={a.id === appId}
          mounted={mountedApps.includes(a.id)}
          phase={a.id === appId ? "active" : a.id === leaving ? "leaving" : "hidden"}
          memoryMode={storageMode === "memory"}
          tabProps={tabProps}
          jump={jumps[a.id]}
        />
      ))}

      {/* ★★★**タブバーは1本だけ**。アプリの列の外に置くので、切り替えのあいだも**1px も動かず・消えない**
          （第134巡の2度目。列ごとに持っていたときは列と一緒に滑ったり抜けたりした）。
          ★position:fixed にはしないこと(iOS Safari の URL バー伸縮でずれる)。シェルの中の absolute。
          ★地の上の色は `inkVarsOn()` が置く（出どころは1つ）。 */}
      <nav className="app-nav" style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: `0 ${SPACE.lg}px`, zIndex: 25, pointerEvents: "none",
        ...inkVarsOn(groundOf(appId)),
      }}>
        <AppNav current={appId} onGo={onGo} onCreate={onRecord} />
      </nav>

      {toast && <Toast text={toast} />}

      {addingWish && <AddWishSheet onAdd={addWish} onClose={() => setAddingWish(false)} />}

      {/* ★★どのアプリからでも「作る」。右端の丸から円が広がって選ばせる。 */}
      {menuAt && (
        <CreateMenu
          at={menuAt}
          onClose={() => setMenuAt(null)}
          onRecord={openStudio}
          onTask={openNewTask}
          onSetting={openSetting}
        />
      )}

      {/* ★どのアプリからでも開く、声の記録の全画面オーバーレイ。 */}
      <VoiceOverlay voice={voice} open={studioOpen} onClose={closeStudio} />

      {/* ★どのアプリからでも作れるタスク。題が付いたまま閉じたら山へ入る。 */}
      {newTask && (
        <TaskComposer
          key={newTask.id}
          data={newTask}
          mode="task"
          onCommit={(d) => setNewTask((x) => (x ? { ...x, ...d } : x))}
          onConfirm={(d) => saveNewTask(newTask, d, true)}
          onDelete={() => setNewTask(null)}
          onClose={(d) => saveNewTask(newTask, d, false)}
        />
      )}

      {/* ★★開発用の数値表示(2026-08-19・第31巡)。第29巡は設定画面の中でだけ
          描いていて、**タブを見ている普通の状態や「作る」の輪を開いた状態では
          数値がまったく出せなかった**(実機で「タスク入力画面以外で数値が
          出ない」と報告)。ここは `[data-app-shell]` の直下 — 器そのものが
          `filter`(退がる演出)を持つと、その中の `position: fixed` は
          **器を基準に測られる**(CSS の仕様: filter は containing block を
          作る)ので、入力画面が開いている間は数値が「器の中の話」にすり替わる。
          その間は入力画面自身が持つ数値表示(`components/tasks/TaskComposer.tsx`)
          の方が正しいので、ここは黙らせる。 */}
      {probe && !newTask && <ViewportProbe />}
    </div>
  );
}

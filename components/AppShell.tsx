"use client";

import { PenLine, Plus, Settings, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AddWishSheet } from "@/components/AddWishSheet";
import { AppBackdrop } from "@/components/AppBackdrop";
import { Dashboard } from "@/components/Dashboard";
import { SelectionMarker } from "@/components/PlanSelectionBar";
import { SignInGate } from "@/components/SignInGate";
import { HOLD_MS, RecordingOverlay, useVoiceRecorder } from "@/components/VoiceRecorder";
import { BriefTab } from "@/components/tabs/BriefTab";
import { ExecuteTab } from "@/components/tabs/ExecuteTab";
import { GoalsTab } from "@/components/tabs/GoalsTab";
import { JournalTab } from "@/components/tabs/JournalTab";
import { ProfileTab } from "@/components/tabs/ProfileTab";
import { StockTab } from "@/components/tabs/StockTab";
import { InboxView } from "@/components/tabs/InboxView";
import { TasksTab } from "@/components/tabs/TasksTab";
import { APPS, DEFAULT_TAB } from "@/lib/apps";
import { BG, BLUE, GOLD, GREEN, HEADER_CHIP_SIZE, INK, MUTED, NAV_BOTTOM_GAP, PAPER, RUST, SANS, SOFT_SHADOW } from "@/lib/constants";
import { DataStore } from "@/lib/dataStore";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import { syncDayRecordsToMyBrain, syncTasteToMyBrain } from "@/lib/myBrainSyncClient";
import { haptic, hasPlace, isExpiredItem, pruneOldBriefs, todayKey } from "@/lib/helpers";
import type { AppId, AppState, InboxCandidate, ItemDomain, JournalEntry, JournalTabId, PlanSelection, TabId, TabProps, TasksTabId } from "@/lib/types";

// 読み込み待機画面。デザインコード(§5)の幾何学図形が左から右へ転がって
// 横断する(globals.cssの brief-roll)。図形ごとに開始を少しずつ遅らせて、
// 円・正方形・三角・長方形が続いて流れる。
function LoadingScreen() {
  const base: React.CSSProperties = { position: "absolute", top: "50%", left: 0, willChange: "transform" };
  return (
    <div style={{ height: "100svh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, fontFamily: SANS }}>
      <div style={{ position: "relative", width: 200, height: 34, overflow: "hidden" }}>
        <span className="brief-roll-shape" style={{ ...base, marginTop: -10, width: 20, height: 20, borderRadius: "50%", background: RUST, animationDelay: "0s" }} />
        <span className="brief-roll-shape" style={{ ...base, marginTop: -10, width: 20, height: 20, background: BLUE, animationDelay: "0.6s" }} />
        <span className="brief-roll-shape" style={{ ...base, marginTop: -9, width: 0, height: 0, borderLeft: "10px solid transparent", borderRight: "10px solid transparent", borderBottom: `18px solid ${GOLD}`, animationDelay: "1.2s" }} />
        <span className="brief-roll-shape" style={{ ...base, marginTop: -6, width: 24, height: 12, borderRadius: 2, background: GREEN, animationDelay: "1.8s" }} />
      </div>
      <div style={{ color: MUTED, fontSize: 12, letterSpacing: "0.08em" }}>読み込んでいます…</div>
    </div>
  );
}

// 指を離したあと、隣のアプリへ落ち着くまでの時間。
const SETTLE_MS = 380;

function Toast({ text }: { text: string }) {
  return (
    <div key={text} style={{
      position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: INK, color: PAPER, borderRadius: 999,
      fontSize: 11, letterSpacing: "0.06em", padding: "8px 18px", boxShadow: "0 8px 24px rgba(26,26,24,0.25)", zIndex: 50,
      animation: "toast-in 0.3s cubic-bezier(0.32,0.72,0,1)",
    }}>{text}</div>
  );
}

export function AppShell() {
  const [appState, setAppState] = useState<AppState | null>(null);
  // ★いま開いているアプリ(タスク / 今のアプリ / ジャーナル)。タブバーの上を
  // 左右にスワイプすると APPS の順に循環して切り替わる。アプリごとに最後に
  // 見ていたタブを覚えておき、戻ってきたときそこへ帰れるようにする。
  const [appId, setAppId] = useState<AppId>("life");
  const [tabByApp, setTabByApp] = useState<Record<AppId, TabId>>({ ...DEFAULT_TAB });
  // ★ダッシュボード(画面下から引き上げる引き出し)。3つのアプリのどこからでも
  // 開ける共通のUIなので、タブではなくここに持つ。
  const [dashOpen, setDashOpen] = useState(false);
  // ★アプリを横に引いている量(px)。3アプリを横一列に並べたトラックごと、
  // 指の動きに1:1で追従させる(タブバーも中身も背景の図形も一緒に流れる)。
  const [navDragX, setNavDragX] = useState(0);
  const [navDragging, setNavDragging] = useState(false);
  // ジェスチャーのハンドラはwindowへ張る都合で作り直したくない(useCallbackの
  // 依存を空にしてある)ため、いま何番目のアプリかはrefで読む。
  const appIndex = Math.max(0, APPS.findIndex((a) => a.id === appId));
  const appIndexRef = useRef(appIndex);
  appIndexRef.current = appIndex;
  // 背景の視差に「画面幅に対してどれだけ引いたか」を渡すために実測する。
  const shellRef = useRef<HTMLDivElement>(null);
  const [shellW, setShellW] = useState(0);
  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setShellW(el.getBoundingClientRect().width));
    ro.observe(el);
    setShellW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [appState]);
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
  }, []);
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
  // ★静止しているときは、いま見ているアプリの中身だけをマウントする。
  // 3アプリぶんを常に生かしておくと、プランタブのLeafletの地図やブリーフの
  // デッキが同時に3つ動き続けることになる。代わりに **タブバーに指が触れた
  // 瞬間(pointerdown)に両隣をマウントする**: 指はまだ止まっているので、
  // マウントのひと仕事が動き出しに乗らない。落ち着いたらまた外す。
  const [neighborsMounted, setNeighborsMounted] = useState(false);
  const unmountTimerRef = useRef<number | null>(null);
  useEffect(() => () => { if (unmountTimerRef.current != null) window.clearTimeout(unmountTimerRef.current); }, []);
  const onNavPointerDown = useCallback((e: ReactPointerEvent) => {
    const NAV_DASH_PX = 44;      // 縦: これ以上引き上げたらダッシュボードを開く
    const COMMIT_RATIO = 0.18;   // 横: 画面幅のこの割合を超えたら隣へ送る
    const FLICK_PX_PER_MS = 0.5; // 短く速く払ったときは距離が足りなくても送る
    const EDGE_RESIST = 0.32;    // 端でのゴムの効き
    const width = window.innerWidth || 390;
    navPressRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: "" };
    navDraggedRef.current = false;
    // 指が触れたこの瞬間に両隣を用意する(まだ動いていないので間に合う)。
    if (unmountTimerRef.current != null) { window.clearTimeout(unmountTimerRef.current); unmountTimerRef.current = null; }
    setNeighborsMounted(true);
    // 速度の見積り用に直近の位置と時刻を持つ。
    let lastX = e.clientX;
    let lastT = performance.now();
    let velocity = 0;
    const finish = () => {
      navPressRef.current = null;
      setNavDragX(0);
      setNavDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", finish);
      // 落ち着き(SETTLE_MS)を待ってから両隣を外す。
      unmountTimerRef.current = window.setTimeout(() => { unmountTimerRef.current = null; setNeighborsMounted(false); }, SETTLE_MS + 80);
    };
    function move(ev: PointerEvent) {
      const pr = navPressRef.current;
      if (!pr || pr.id !== ev.pointerId) return;
      const dx = ev.clientX - pr.x;
      const dy = ev.clientY - pr.y;
      if (!pr.axis) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        pr.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        navDraggedRef.current = true;
        if (pr.axis === "x") setNavDragging(true);
      }
      if (pr.axis === "x") {
        const now = performance.now();
        const dt = now - lastT;
        if (dt > 0) velocity = (ev.clientX - lastX) / dt;
        lastX = ev.clientX; lastT = now;
        // 隣が無い向き(端)へは、ゴムのように抵抗させる。
        const i = appIndexRef.current;
        const atEdge = (dx > 0 && i === 0) || (dx < 0 && i === APPS.length - 1);
        setNavDragX(atEdge ? dx * EDGE_RESIST : dx);
        return;
      }
      if (dy <= -NAV_DASH_PX) {
        finish();
        haptic(12);
        setDashOpen(true);
      }
    }
    function up(ev: PointerEvent) {
      const pr = navPressRef.current;
      const dx = pr ? ev.clientX - pr.x : 0;
      const axis = pr?.axis;
      finish();
      if (axis !== "x") return;
      const far = Math.abs(dx) >= width * COMMIT_RATIO;
      // 速さで送るのは、指の向きと払った向きが一致しているときだけ。
      const flick = Math.abs(velocity) >= FLICK_PX_PER_MS && Math.sign(velocity) === Math.sign(dx);
      if (!far && !flick) return;
      const i = appIndexRef.current;
      const next = dx < 0 ? i + 1 : i - 1;
      if (next < 0 || next >= APPS.length) return;
      haptic(10);
      setAppId(APPS[next].id);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", finish);
  }, []);
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
  const finishDay = () => {
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
    setDashOpen(false);
    showToast(boundItems.length > 0 ? `${boundItems.length}件をアーカイブへ綴じました` : "今日を終えました");
    if (boundItems.length > 0) goTab("journal-archive");
  };
  // ★声のメモ。タブバー右の丸ボタンを長押ししている間だけ録音し、離すと
  // 文字起こしへ送る。結果はここへ溜まり、夜間にCoworkが読んで
  // インボックスの候補(タスク・ジャーナル・ウィッシュ等)へ分類する。
  const addVoiceNote = (r: { text: string; at: string; durationMs: number }) => {
    if (!appState) return;
    const next = structuredClone(appState);
    next.voiceNotes = next.voiceNotes ?? [];
    next.voiceNotes.unshift({ id: `voice-${Date.now()}`, at: r.at, text: r.text, durationMs: r.durationMs, status: "new" });
    persist(next);
    showToast("声のメモを保存しました");
  };
  const recorder = useVoiceRecorder({ onDone: addVoiceNote, onError: (m) => showToast(m) });
  // 長押しの判定。押しっぱなしがHOLD_MSを超えたら録音を始め、離した時点で
  // 録音していたなら確定(=タップとしては扱わない)。
  const holdTimerRef = useRef<number | null>(null);
  const heldRef = useRef(false);
  const beginHold = () => {
    heldRef.current = false;
    if (holdTimerRef.current != null) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => { heldRef.current = true; recorder.start(); }, HOLD_MS);
  };
  const endHold = () => {
    if (holdTimerRef.current != null) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    if (heldRef.current) recorder.stop();
  };

  // ダッシュボードからのタスクのチェック。
  const toggleTask = (id: string) => {
    if (!appState) return;
    haptic(8);
    const next = structuredClone(appState);
    const t = next.tasks.find((x) => x.id === id);
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? new Date().toISOString() : undefined;
    persist(next);
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
    syncTasteToMyBrain(next);
    showToast("ウィッシュを書きました");
  };

  // 好み・興味の検出・更新は、アプリ側の単純なキーワード頻度(旧detectInterests)を
  // やめ、Coworkの週次分析(反応ログ→推論)が担うことにした。アプリはCoworkが
  // taste-state.mdへ書いた結果を起動時pull(下記)で取り込んで表示するだけ。
  // ユーザーの手編集(設定画面での追加・2段階削除)は引き続き可能で、
  // syncTasteToMyBrainでmy-brainへ反映される。

  // 認証ゲート(Supabase構成済みのときだけ)。未構成なら以下の2分岐は素通り。
  if (isSupabaseConfigured && !authReady) {
    return <LoadingScreen />;
  }
  if (isSupabaseConfigured && authReady && !userId) {
    return <SignInGate />;
  }

  if (!appState) {
    return <LoadingScreen />;
  }

  const interestCount = (appState.profile?.interests ?? []).length;
  const profileButton = (
    <button onClick={() => { haptic(5); setShowProfile(true); }} aria-label="設定" style={{
      position: "relative", width: HEADER_CHIP_SIZE, height: HEADER_CHIP_SIZE, borderRadius: "50%",
      background: PAPER, border: "none", display: "flex", alignItems: "center", justifyContent: "center",
      cursor: "pointer", color: INK, boxShadow: SOFT_SHADOW, padding: 0, flexShrink: 0,
    }}>
      <Settings size={17} strokeWidth={1.75} />
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
      <div style={{ height: "100svh", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", fontFamily: SANS, color: INK, background: BG, position: "relative" }}>
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
      // ★地の色は3アプリとも同じ(BG=ほんとに薄いグレー)。アプリの違いは
      // 背景に置いた大きな図形ひとつ(AppBackdrop)だけで伝える。
      background: BG, position: "relative",
    }}>
      {/* 背景の透かし図形。中身より遅い速さ(視差)で流れる。 */}
      <AppBackdrop index={appIndex} dragRatio={shellW ? navDragX / shellW : 0} animate={!navDragging} />

      {/* ★3アプリを横一列に並べたトラック。タブバーも中身も、この1枚が
          まとめて動く(=「タブバーごとスワイプされる」)。各列が自分の
          スクロールルートと自分のタブバーを持つので、タブの数が3/4/2と
          違っても隣のタブバーがそのまま流れ込んで見える。 */}
      <div style={{
        position: "absolute", inset: 0, display: "flex", width: `${APPS.length * 100}%`,
        // 単位に注意: %はこの要素自身の幅(=画面幅×3)に対する割合なので、
        // 1画面ぶん動かすには 100/3 % になる。
        transform: `translateX(calc(${(-appIndex * 100) / APPS.length}% + ${navDragX}px))`,
        transition: navDragging ? "none" : `transform ${SETTLE_MS}ms cubic-bezier(0.32,0.72,0,1)`,
        willChange: "transform",
      }}>
      {APPS.map((a) => {
        const aTab = tabByApp[a.id];
        // 静止しているときは、いま見ているアプリの中身だけを実際に描く。
        // 両隣はタブバーだけ描いておき、指が触れた瞬間に中身も用意する。
        const showBody = a.id === appId || neighborsMounted;
        const scrollLocked = aTab === "brief";
        return (
        <div key={a.id} style={{ width: `${100 / APPS.length}%`, height: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div data-tab-scroll-root style={{
            width: "100%", maxWidth: 420, flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
            overflowY: scrollLocked ? "hidden" : "auto", WebkitOverflowScrolling: "touch", overscrollBehaviorY: "contain",
            // ★スクロール中に要素がサイズ変化(プランタブの地図の縮小など)しても、
            // ブラウザのスクロールアンカリングがscrollTopを勝手に補正して
            // 「グイッと引っ張られる」ジャンプを起こさないよう無効化する。
            overflowAnchor: "none",
            padding: "max(16px, env(safe-area-inset-top)) 16px 16px",
          }}>
            {a.id === appId && storageMode === "memory" && <div style={{ fontSize: 9, color: RUST, letterSpacing: "0.05em", padding: "6px 4px 0", textAlign: "right" }}>メモリ動作中</div>}

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
            {/* animation(tab-in)は廃止した。opacityを0→1でアニメーションする
                要素はCSS仕様上その間(場合によってはアニメーション終了後も
                実機Safariでは)新しい重なりコンテキストを作ってしまい、この
                内側にあるzIndexを持つ要素(実行タブの確定バインド！ボタン、
                ブリーフの育成カードのフッター等)が、外側にあるnav手前の
                グラデーション(zIndex:15)より手前に出せなくなる不具合の
                原因になっていた(zIndexは同じ重なりコンテキストの中でしか
                比較されないため)。フェードインの見た目より、フローティング
                ボタンが常に正しく最前面に出ることを優先する。 */}
            {showBody && (
              <div key={aTab} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                {aTab === "brief" && <BriefTab {...tabProps} />}
                {aTab === "stock" && <StockTab {...tabProps} />}
                {aTab === "goals" && <GoalsTab {...tabProps} />}
                {aTab === "execute" && <ExecuteTab {...tabProps} />}
                {aTab === "tasks-inbox" && <InboxView appState={appState} persist={persist} showToast={showToast} />}
                {(aTab === "tasks-today" || aTab === "tasks-all") && <TasksTab {...tabProps} tab={aTab as TasksTabId} />}
                {(aTab === "journal-today" || aTab === "journal-archive") && <JournalTab {...tabProps} tab={aTab as JournalTabId} />}
              </div>
            )}
          </>
      </div>

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
          {/* グラデーションの高さを44pxから26pxへ縮め、上端をnavに近い
              位置(=下)へ寄せた。以前の44pxは表示領域を必要以上に狭めて
              いた、という指摘によるもの。 */}
          <div aria-hidden style={{ position: "sticky", bottom: 0, width: "100%", height: 0, zIndex: 15, pointerEvents: "none" }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: -26, bottom: 0, background: `linear-gradient(to bottom, ${BG}00 0, ${BG} 26px, ${BG} 100%)` }} />
          </div>
          <nav style={{ position: "sticky", bottom: 0, width: "100%", zIndex: 25, display: "flex", flexDirection: "column", alignItems: "center", padding: "0 16px", pointerEvents: "none" }}>
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
              <div style={{ position: "relative", flex: 1, display: "flex", background: PAPER, borderRadius: 999, boxShadow: "0 2px 7px rgba(26,26,24,0.14)", padding: 6, marginBottom: NAV_BOTTOM_GAP }}>
                {a.tabs.map((t) => {
                  const active = aTab === t.id;
                  return (
                    <button key={t.id} onClick={() => { if (navDraggedRef.current) return; haptic(5); goTab(t.id); }} style={{ flex: 1, padding: "7px 0 6px", background: "none", border: "none", cursor: "pointer", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <div style={{ width: 44, height: 28, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", background: active ? INK : "transparent", transition: "background 0.2s" }}>
                        <t.Icon size={19} strokeWidth={1.8} color={active ? PAPER : "rgba(26,26,24,0.38)"} style={{ transition: "color 0.2s, stroke 0.2s" }} />
                      </div>
                      <span style={{ fontFamily: SANS, fontSize: 9.5, color: active ? INK : "rgba(26,26,24,0.38)", fontWeight: active ? 700 : 400, transition: "color 0.2s" }}>{t.label}</span>
                    </button>
                  );
                })}
              </div>
              {/* 右の丸ボタンはアプリごとの「書く」入口。今のアプリでは
                  ウィッシュ(どのタブからでも書ける受信箱)。タスク・ジャーナルの
                  中身は後で作るため、今は場所だけ確保してある。 */}
              <button
                onPointerDown={beginHold}
                onPointerUp={endHold}
                onPointerCancel={endHold}
                onPointerLeave={endHold}
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => { if (navDraggedRef.current || heldRef.current) return; haptic(5); if (a.id === "life") setAddingWish(true); else showToast("この機能はこれから作ります"); }} aria-label={a.id === "life" ? "ウィッシュを書く" : a.id === "tasks" ? "タスクを足す" : "ジャーナルを書く"} style={{
                flexShrink: 0, width: 52, height: 52, borderRadius: "50%", background: INK, border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 7px rgba(26,26,24,0.14)", marginBottom: NAV_BOTTOM_GAP, padding: 0,
              }}>
                {a.id === "life" ? <Sparkles size={19} strokeWidth={1.8} color={PAPER} />
                  : a.id === "tasks" ? <Plus size={20} strokeWidth={2.2} color={PAPER} />
                  : <PenLine size={18} strokeWidth={1.9} color={PAPER} />}
              </button>
            </div>
          </nav>
        </div>
        );
      })}
      </div>

      {toast && <Toast text={toast} />}

      {/* タブ・アプリを跨いで持ち回す選択の目印。件数だけを示し、タップで
          ダッシュボードが開く(確定の操作はダッシュボードに集約した)。 */}
      {!dashOpen && (
        <SelectionMarker appState={appState} selection={selection} onOpen={() => setDashOpen(true)} />
      )}

      {addingWish && <AddWishSheet onAdd={addWish} onClose={() => setAddingWish(false)} />}

      {/* 録音中/文字起こし中の幕。 */}
      <RecordingOverlay state={recorder.state} elapsed={recorder.elapsed} />

      {/* ★ダッシュボード。タブバーを上へ引き上げる(または選択の目印をタップ
          する)と、3つのアプリのどこからでも開く共通の引き出し。選んでいる
          カードとその日のタスクを1枚で見渡し、「今日を終える」で1日を締める。 */}
      {dashOpen && (
        <Dashboard
          appState={appState}
          selection={selection}
          onToggleItem={toggleItemSelection}
          onClearSelection={() => setSelection({ itemIds: [] })}
          onToggleTask={toggleTask}
          onFinishDay={finishDay}
          onClose={() => setDashOpen(false)}
        />
      )}
    </div>
  );
}

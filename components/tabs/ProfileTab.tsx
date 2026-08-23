"use client";

import { RADIUS, TYPE } from "@/lib/tokens";
import { Activity, BarChart3, Heart, Link2, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { IconType } from "@/components/common";
import { Button } from "@/components/Button";
import { BLUE, FIXED_SOURCES, GREEN, HAIRLINE, INK, MUTED, PAPER, RUST, RUST_EDGE, RUST_TINT, SANS, SERIF } from "@/lib/constants";
import { isViewportDebug, setViewportDebug } from "@/lib/debugViewport";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import { haptic, shortDate } from "@/lib/helpers";
import { syncTasteToMyBrain } from "@/lib/myBrainSyncClient";
import type { AppState } from "@/lib/types";

// フェーズC-0「プロンプト実験場」で生成されるカードの形(BriefCard相当の
// 部分集合)。本番のデッキ統合前に、設定画面で品質を目視確認するためだけの
// 暫定型。/api/generate-brief の返り値と一致させる。
type GeneratedCard = {
  title: string; body: string; kind: string; trigger: string;
  area?: string; sourceUrl?: string; sourceLabel?: string; meta?: string[];
  expiresAt?: string; isDerived?: boolean; sourceWishTitle?: string;
};
type SiteTrace = {
  source: string; fetched: boolean; linkCount: number; candidates?: number;
};
type PageReadTrace = { url: string; ok: boolean };
type DropSummary = { sourceInvalid: number; expired: number; duplicateCandidate: number; outOfArea: number; irrelevant: number; overQuota: number };
type TokenUsage = { promptTokens: number; candidateTokens: number; totalTokens: number; calls: number };
type GenResponse =
  | {
      ok: true; cards: GeneratedCard[]; candidateCount: number;
      sites: SiteTrace[]; pagesRead: PageReadTrace[];
      dropped: DropSummary; tokens: TokenUsage; note?: string;
    }
  | { ok: false; reason: string; detail?: string };

// 「入力+右にボタン」の1行入力欄。この画面内の入力欄はすべてこの1つの
// スタイルに揃える(以前はセクションごとにフォント・サイズ・線の太さが
// バラバラだった)。
// (fontSize:16は「iOS Safariのフォーカス時自動ズーム対策」として一時
// 導入したが、その後viewport設定(app/layout.tsx)で元々userScalable:false
// になっており自動ズーム自体が発生しないことが判明し、この診断は誤り
// だったと分かった。「気になっていること」欄が保存ボタン未表示になる
// 不具合の実際の原因は特定できていないが、非編集/編集の2状態を切り替える
// 構成自体を撤去し「情報源」と同じ常時表示の構成にしたことで、その
// 状態遷移に起因する不具合の可能性そのものを消した(詳細は docs/archive/ui-binder-2026-07.md
// §7.21 参照)。fontSize:16はタップしやすい大きさとしてそのまま残す。)
const settingsInputStyle: React.CSSProperties = {
  flex: 1, border: "none", borderBottom: `1.5px solid ${INK}`, background: "transparent",
  fontFamily: SANS, fontSize: TYPE.lead, padding: "8px 2px", outline: "none", minWidth: 0,
};

// 各セクションを1枚の淡いカードにまとめる。以前はラベル+素のテキスト/
// 入力欄が背景に直置きで並んでいるだけで、区切りが弱く「物足りない」
// 見た目だった。カード化することで各セクションの範囲がひと目でわかり、
// 画面にリズムが生まれる。
function SettingsCard({ label, icon: Icon, children }: { label: string; icon?: IconType; children: React.ReactNode }) {
  return (
    <section style={{ background: "rgba(26,26,24,0.035)", border: `1px solid ${HAIRLINE}`, borderRadius: RADIUS.xl, padding: "16px 16px 16px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        {Icon && <Icon size={12} strokeWidth={2.2} color={MUTED} />}
        <span style={{ fontSize: TYPE.micro, letterSpacing: "0.22em", color: MUTED, fontWeight: 700 }}>{label}</span>
      </div>
      {children}
    </section>
  );
}

// 削除・取り消しの丸いアイコンボタン。PlanSelectionBarの「選択を外す」と
// 同じ語彙(RUST_TINT 地 + RUST)に揃え、テキストの「削除」
// 「元に戻す」のような素のテキストボタンをやめて画面内のボタンをすべて
// 同じ形式にする。
function IconButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} style={{
      width: 28, height: 28, borderRadius: RADIUS.circle, border: "none", background: RUST_TINT, color: RUST,
      display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, padding: 0,
    }}>
      {children}
    </button>
  );
}

// URLの削除ボタン。情報源は誤って消すと生成の巡回対象から外れてしまうため、
// チップと同様に一発では消さない。1回目のタップで「本当に削除？」の確認状態に
// なり、2回目で実削除。armed(確認状態かどうか)は親が共有stateで持つ(同時に
// armされるのは1つだけ)。数秒触らなければ親が自動で解除する。
function ConfirmDeleteButton({ armed, onArm, onConfirm, label }: {
  armed: boolean; onArm: () => void; onConfirm: () => void; label: string;
}) {
  if (armed) {
    return (
      <button onClick={onConfirm} aria-label={`${label}を本当に削除する`} style={{
        height: 28, padding: "0 12px", borderRadius: RADIUS.pill, border: "none", background: RUST, color: PAPER,
        display: "flex", alignItems: "center", cursor: "pointer", fontFamily: SANS, fontWeight: 700,
        fontSize: TYPE.small, letterSpacing: "0.03em", flexShrink: 0, whiteSpace: "nowrap",
      }}>本当に削除？</button>
    );
  }
  return (
    <IconButton onClick={onArm} label={`${label}を削除`}><X size={13} strokeWidth={2.4} /></IconButton>
  );
}

// 情報源・バインドの記録で共通に使う1行リスト(タイトル+補足+右端の
// アイコンボタン)。見た目(パディング・区切り線・文字サイズ)を1箇所に
// まとめることで、セクションごとに微妙に違う実装になるのを防ぐ。
function SettingsRow({ title, sub, faded, action }: { title: string; sub: string; faded?: boolean; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 2px", borderTop: `1px solid ${HAIRLINE}`, opacity: faded ? 0.5 : 1 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: TYPE.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ fontSize: TYPE.micro, color: MUTED, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
      </div>
      {action}
    </div>
  );
}

// 好み/興味で共通のチップ表示+追加欄。1色・1サイズのチップに揃えている
// のは、色分け+重み比例フォントサイズだった旧デザインが「ワードクラウド」
// のようで読みにくかったため。重み(weight)降順で並べる。
function InterestChips({ items, onRemove, inputValue, onInputChange, onAdd, placeholder }: {
  items: { id: string; label: string }[];
  onRemove: (id: string) => void;
  inputValue: string;
  onInputChange: (v: string) => void;
  onAdd: () => void;
  placeholder: string;
}) {
  // 好み・興味は主にCoworkの分析が維持するデータなので、×を1回押しただけでは
  // 消さない(誤削除防止)。1回目で「消す？」の確認状態にし、2回目で実際に削除。
  // 数秒触らなければ自動で確認を解除する。
  const [armedId, setArmedId] = useState<string | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleX = (id: string) => {
    haptic();
    if (armTimer.current) clearTimeout(armTimer.current);
    if (armedId === id) {
      setArmedId(null);
      onRemove(id);
      return;
    }
    setArmedId(id);
    armTimer.current = setTimeout(() => setArmedId(null), 3500);
  };
  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {items.length === 0 ? (
          <p style={{ fontSize: TYPE.body, color: MUTED, margin: 0 }}>まだありません。</p>
        ) : items.map((item) => {
          const armed = armedId === item.id;
          return (
          <span key={item.id} style={{
            display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 8px 8px 12px", borderRadius: RADIUS.pill,
            background: armed ? "rgba(183,65,42,0.12)" : "rgba(26,26,24,0.06)", color: INK, fontFamily: SANS, fontWeight: 600, fontSize: TYPE.body,
            transition: "background var(--t-item) var(--ease-settle)",
          }}>
            {item.label}
            {armed ? (
              <button onClick={() => handleX(item.id)} aria-label={`${item.label}を削除する`} style={{
                height: 16, padding: "0 8px", borderRadius: RADIUS.pill, border: "none", background: RUST, color: PAPER,
                display: "flex", alignItems: "center", cursor: "pointer", fontFamily: SANS, fontWeight: 700, fontSize: TYPE.micro, letterSpacing: "0.04em", flexShrink: 0,
              }}>消す</button>
            ) : (
              <button onClick={() => handleX(item.id)} aria-label={`${item.label}を削除`} style={{
                width: 16, height: 16, borderRadius: RADIUS.circle, border: "none", background: "rgba(26,26,24,0.1)", color: INK,
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, flexShrink: 0,
              }}>
                <X size={9} strokeWidth={2.6} />
              </button>
            )}
          </span>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input value={inputValue} onChange={(e) => onInputChange(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onAdd()}
          placeholder={placeholder} style={settingsInputStyle} />
        <Button variant="primary" onClick={onAdd}>追加</Button>
      </div>
    </>
  );
}

export function ProfileTab({ appState, persist, onClose }: {
  appState: AppState;
  persist: (next: AppState) => void;
  onClose: () => void;
}) {
  const [srcInput, setSrcInput] = useState("");
  const [fixedInput, setFixedInput] = useState("");
  const [tasteInput, setTasteInput] = useState("");
  // 上部のタブ: 好み・興味 / 情報源 / その他。
  const [tab, setTab] = useState<"taste" | "sources" | "other">("taste");
  // URL削除の2段階確認。同時にarmされるのは1つだけ(キーで識別)。数秒で自動解除。
  const [armedKey, setArmedKey] = useState<string | null>(null);
  // ★開発用。入力画面に実測値を出すか(直ったら撤去する)。
  const [probeOn, setProbeOn] = useState(false);
  useEffect(() => setProbeOn(isViewportDebug()), []);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const arm = (key: string) => {
    haptic();
    if (armTimer.current) clearTimeout(armTimer.current);
    setArmedKey(key);
    armTimer.current = setTimeout(() => setArmedKey(null), 3500);
  };
  const disarm = () => { if (armTimer.current) clearTimeout(armTimer.current); setArmedKey(null); };
  // my-brainへの同期結果。以前は結果を見ずに握りつぶしていたため、失敗しても
  // 画面に何も出ず原因が分からなかった。保存のたびにここへ表示する。
  const [syncMsg, setSyncMsg] = useState("");
  const reportSync = (result: Awaited<ReturnType<typeof syncTasteToMyBrain>>) => {
    if (!result) { setSyncMsg("my-brainへの同期に失敗しました(通信エラー)。"); return; }
    if (!result.ok) {
      const reasonJp =
        result.reason === "no_repo" ? "MYBRAIN_REPO未設定"
        : result.reason === "no_token" ? "GITHUB_TOKEN未設定"
        : result.reason;
      setSyncMsg(`my-brainへの同期に失敗しました(${reasonJp})。`);
      return;
    }
    setSyncMsg(result.wrote.length ? `my-brainに反映しました(${result.wrote.join("・")})。` : "my-brainは既に最新でした。");
  };

  // フェーズC-0: ブリーフ生成の実験。まだ本番デッキには繋がず、返ってきた
  // カードをこの画面に表示して品質を目視確認するだけ(docs/archive/brief-pipeline-2026-07.md §8.12)。
  const [genState, setGenState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [genCards, setGenCards] = useState<GeneratedCard[]>([]);
  const [genSites, setGenSites] = useState<SiteTrace[]>([]);
  const [genPagesRead, setGenPagesRead] = useState<PageReadTrace[]>([]);
  const [genDropped, setGenDropped] = useState<DropSummary | null>(null);
  const [genTokens, setGenTokens] = useState<TokenUsage | null>(null);
  const [genCandidateCount, setGenCandidateCount] = useState(0);
  const [genMsg, setGenMsg] = useState("");
  // 実験に使う情報源URL(改行区切り)。登録済みの「お気に入りの情報源」を
  // 初期値にしつつ、その場で貼り足し・編集できるようにする。本番では
  // Coworkが用意した情報源リストがこの役割を担う。
  const [genUrls, setGenUrls] = useState(() => (appState.sources ?? []).map((s) => s.url).join("\n"));
  // 「今すぐ生成」= 本人が設定画面から夜間Cronと同じ本番生成を手動起動する。
  const [genNow, setGenNow] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [genNowMsg, setGenNowMsg] = useState("");

  // 好み/興味は「興味・好み」1リストへ統合済み(docs/archive/brief-pipeline-2026-07.md §8.14 優先度3)。
  const taste = (appState.profile?.interests ?? []).slice().sort((a, b) => b.weight - a.weight);
  const sources = appState.sources ?? [];
  const bindLog = appState.bindLog ?? [];
  const cronStatus = appState.cronStatus;

  // 今月の反応の集計(読み取りのみ)。分析の材料(=my-brainのログ)が貯まって
  // いることを本人が確認できるようにする。残した/実行/星は前向きな反応として
  // ログに焼き付く材料、流したは参考(ログには残さない)。月はローカル(JST)基準。
  const nowYm = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; })();
  const ymOfIso = (iso?: string) => { if (!iso) return ""; const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
  const reactionCounts = (() => {
    let kept = 0, skipped = 0, done = 0, starred = 0;
    for (const [ek, b] of Object.entries(appState.briefs ?? {})) {
      if (ek.slice(0, 7) !== nowYm) continue; // デッキのキー = YYYY-MM-DD
      const fb = (b as { feedback?: Record<string, boolean> }).feedback ?? {};
      const decisions = (b as { decisions?: Record<string, string> }).decisions ?? {};
      for (const [cid, dec] of Object.entries(decisions)) {
        if (fb[cid]) continue; // 旗=拒否は残した/流したに数えない
        if (dec === "keep") kept++; else if (dec === "skip") skipped++;
      }
    }
    for (const it of appState.items ?? []) {
      if (it.status === "done" && ymOfIso(it.doneAt ?? it.addedAt) === nowYm) done++;
      if (it.good === true && ymOfIso(it.doneAt ?? it.addedAt) === nowYm) starred++;
    }
    return { kept, skipped, done, starred };
  })();

  const cronWhen = (iso: string) => {
    try { return new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
    catch { return iso; }
  };

  // Coworkが発掘して my-brain のプール(sources.md)に入れた情報源も、
  // お気に入りと合わせて一覧・削除できるように起動時に取り込む。
  const [poolSources, setPoolSources] = useState<{ url: string; label?: string }[]>([]);
  useEffect(() => {
    let alive = true;
    fetch("/api/mybrain/read").then((r) => r.json()).then((d) => {
      if (alive && d?.ok && Array.isArray(d.sources)) {
        setPoolSources(d.sources.filter((s: unknown): s is { url: string; label?: string } => !!s && typeof (s as { url?: unknown }).url === "string"));
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const normU = (u: string) => u.trim().replace(/\/+$/, "").toLowerCase();
  const dismissedSrc = new Set(appState.profile?.dismissedSources ?? []);
  const favUrlSet = new Set(sources.map((s) => normU(s.url)));
  const favVisible = sources.filter((s) => !dismissedSrc.has(s.url));
  const discovered = poolSources.filter((p) => !favUrlSet.has(normU(p.url)) && !dismissedSrc.has(p.url));
  // 情報源の削除: Coworkが発掘した分はプールから即座には消せない(次の更新で反映)
  // ため、除外リストへ記録してUI上は消す。生成の巡回対象からも外れる。
  const dismissSource = (url: string) => {
    haptic();
    const next = structuredClone(appState);
    next.profile = next.profile ?? { interests: [] };
    const d = next.profile.dismissedSources ?? [];
    if (!d.includes(url)) next.profile.dismissedSources = [...d, url];
    persist(next);
  };

  // 「興味・好み」はstateそのもの(profile.interests)の表示であり、ここから直接
  // 追加・削除できる(=今どんなデータでカードが生成されているかを見て編集できる
  // 場所にする)。追加した項目はsource:"user"にして、自動検出の重み更新
  // (source==="auto"の項目だけが対象)に上書きされないようにする。
  const addInterestItem = async (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    haptic();
    const next = structuredClone(appState);
    next.profile = next.profile ?? { interests: [] };
    if (!next.profile.interests.some((i) => i.label === trimmed)) {
      next.profile.interests.push({ id: `interest-${Date.now()}`, label: trimmed, weight: 10, source: "user", addedAt: new Date().toISOString() });
    }
    // 手動で追加し直したラベルは除外リストから外す(自動検出を再び許す)。
    if (next.profile.dismissedInterests?.length) {
      next.profile.dismissedInterests = next.profile.dismissedInterests.filter((l) => l !== trimmed);
    }
    persist(next);
    setSyncMsg("my-brainへ同期中…");
    reportSync(await syncTasteToMyBrain(next));
  };
  const removeInterestItem = async (id: string) => {
    haptic(6);
    const next = structuredClone(appState);
    next.profile = next.profile ?? { interests: [] };
    // 削除するラベルを控えておき、自動検出(detectInterests)が二度と
    // 再追加しないよう除外リスト(tombstone)へ入れる。これをしないと、
    // persistのたびに走る自動検出が同じラベルをすぐ復活させてしまう。
    const removed = next.profile.interests.find((i) => i.id === id)?.label;
    next.profile.interests = next.profile.interests.filter((i) => i.id !== id);
    if (removed) {
      const dismissed = next.profile.dismissedInterests ?? [];
      if (!dismissed.includes(removed)) next.profile.dismissedInterests = [...dismissed, removed];
    }
    persist(next);
    setSyncMsg("my-brainへ同期中…");
    reportSync(await syncTasteToMyBrain(next));
  };
  const addTaste = () => { addInterestItem(tasteInput); setTasteInput(""); };

  // 規定の情報源(展覧会・イベント・映画などアプリ内蔵のFIXED_SOURCES)。未編集なら
  // 内蔵リストをそのまま表示し、編集した時点で appState.fixedSources へ写し取る。
  // これは app_state 内だけで完結し(夜間Cronが直接読む)、my-brainには同期しない。
  const fixedList = appState.fixedSources ?? FIXED_SOURCES;
  const hostLabel = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
  const addFixedSource = () => {
    const url = fixedInput.trim();
    if (!/^https?:\/\//.test(url)) return;
    haptic();
    const next = structuredClone(appState);
    const cur = next.fixedSources ?? [...FIXED_SOURCES];
    if (!cur.some((u) => normU(u) === normU(url))) cur.unshift(url);
    next.fixedSources = cur;
    persist(next);
    setFixedInput("");
  };
  const removeFixedSource = (url: string) => {
    haptic(6);
    const next = structuredClone(appState);
    const cur = next.fixedSources ?? [...FIXED_SOURCES];
    next.fixedSources = cur.filter((u) => normU(u) !== normU(url));
    persist(next);
  };

  // デモ・テスト用のダミー(injectDemoで入れたアイテム・ウィッシュ・ゴールや、
  // 試行中のスワイプ記録)を消す。好み・興味・情報源などの設定は残し、
  // コンテンツ側だけを初期化する。反応ログ(my-brain)の元データが消えるので、
  // 以後の生成でダミー由来の行は増えない(既存のログファイルはGitHubで手動削除)。
  const clearTestData = () => {
    haptic(12);
    const next = structuredClone(appState);
    next.items = [];
    next.wishes = [];
    next.goals = [];
    next.briefs = {};
    next.bindLog = [];
    next.magazine = null;
    next.pendingReview = [];
    next.shelfOrder = {};
    persist(next);
  };

  // ★タスク/候補のダミーだけを消す(id が "demo-" で始まるもの)。
  // 手で作ったタスクや、声のメモから来た本物の候補は残す。ダミーを入れ直して
  // 積み方や落ち方を見直す往復のための入口(2026-08-16にユーザー指定)。
  const demoCount =
    (appState.tasks ?? []).filter((t) => t.id.startsWith("demo-")).length
    + (appState.inbox ?? []).filter((c) => c.id.startsWith("demo-")).length;

  const clearTaskDemo = () => {
    haptic(12);
    const next = structuredClone(appState);
    next.tasks = (next.tasks ?? []).filter((t) => !t.id.startsWith("demo-"));
    next.inbox = (next.inbox ?? []).filter((c) => !c.id.startsWith("demo-"));
    persist(next);
  };

  const addSource = async () => {
    const url = srcInput.trim();
    if (!/^https?:\/\//.test(url)) return;
    haptic();
    let label = url;
    try {
      label = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      /* そのまま */
    }
    const next = structuredClone(appState);
    next.sources = next.sources ?? [];
    next.sources.unshift({ id: `src-${Date.now()}`, url, label, addedAt: new Date().toISOString() });
    persist(next);
    setSrcInput("");
    setSyncMsg("my-brainへ同期中…");
    reportSync(await syncTasteToMyBrain(next));
  };
  const removeSource = async (id: string) => {
    const next = structuredClone(appState);
    next.sources = next.sources.filter((s) => s.id !== id);
    persist(next);
    setSyncMsg("my-brainへ同期中…");
    reportSync(await syncTasteToMyBrain(next));
  };
  // バインド！(確定ビューでの綴じ操作)を元に戻す。ログの対象Itemを
  // done→candidateへ戻すだけの単純な取り消しで、マガジンの再構築は
  // しない(「消してしまったカードをストックへ戻す」という最小限の
  // 復旧が目的のため)。
  const undoBind = (entryId: string) => {
    haptic(10);
    const next = structuredClone(appState);
    const entry = next.bindLog.find((e) => e.id === entryId);
    if (!entry || entry.undone) return;
    entry.items.forEach((snap) => {
      const item = next.items.find((x) => x.id === snap.id);
      if (item && item.status === "done") {
        item.status = "candidate";
        item.doneAt = undefined;
      }
    });
    entry.undone = true;
    entry.undoneAt = new Date().toISOString();
    persist(next);
  };

  // 今すぐ生成: 夜間Cronと同じ本番生成(build-brief)を、本人のアクセストークンで
  // 手動起動する。成功したら generatedDecks/cronStatus がサーバー側で更新される
  // ので、反映のために画面を再読み込みする(SERVER_OWNED_KEYSは起動時pullで読む)。
  const generateNow = async () => {
    if (genNow === "loading" || !supabase) return;
    haptic();
    setGenNow("loading");
    setGenNowMsg("");
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) { setGenNow("error"); setGenNowMsg("ログイン情報を取得できませんでした。一度サインインし直してください。"); return; }
      const res = await fetch("/api/cron/build-brief", { headers: { Authorization: `Bearer ${token}` } });
      // 生成は重い(枚数を増やしたぶん時間がかかる)ため、サーバーの処理時間上限を
      // 超えると本文が空/JSONでない応答が返り、res.json()がSafariで
      // 「The string did not match the expected pattern.」を投げる。空応答でも
      // サーバー側は途中まで書けていることがあるので、怖いエラーを出さず
      // 「時間がかかっています。更新して確認してください」と案内して再読込する。
      let data: { ok?: boolean; reason?: string; cardCount?: number; note?: string } | null = null;
      try { data = await res.json(); } catch { data = null; }
      if (!data) {
        setGenNow("error");
        setGenNowMsg("生成に時間がかかっています。しばらく待ってから画面を更新して、生成状況を確認してください。");
        setTimeout(() => window.location.reload(), 5000);
        return;
      }
      if (!res.ok || !data.ok) {
        setGenNow("error");
        const reason: string = data?.reason ?? `${res.status}`;
        setGenNowMsg(
          reason === "no_key" ? "GEMINI_API_KEYが未設定です(Vercelの環境変数)。"
          : reason === "no_sources" ? "巡回する情報源がありません。情報源タブで追加してください。"
          : reason === "not_configured" ? "サーバーの環境変数(Supabase/OWNER)が未設定です。"
          : reason === "unauthorized" ? "認可に失敗しました。サインインし直してください。"
          : reason.startsWith("gemini_") ? `生成に失敗しました(${reason})。少し待って再試行してください。`
          : `生成に失敗しました(${reason})。`,
        );
        return;
      }
      setGenNow("done");
      setGenNowMsg(`${data.cardCount ?? 0}枚を生成しました${data.cardCount === 0 && data.note ? `（${data.note}）` : ""}。反映のため画面を更新します…`);
      setTimeout(() => window.location.reload(), 1400);
    } catch (e) {
      setGenNow("error");
      setGenNowMsg(`通信に失敗しました。${e instanceof Error ? e.message : ""}`);
    }
  };

  // 生成を試す: 現在のウィッシュ・好み・興味をサーバー関数へ渡し、
  // Geminiが本物のWeb検索で作ったカードを受け取って表示する。
  const runGenerate = async () => {
    if (genState === "loading") return;
    const urls = genUrls.split("\n").map((u) => u.trim()).filter((u) => /^https?:\/\//.test(u));
    if (urls.length === 0) {
      setGenState("error");
      setGenMsg("情報源のURLを1つ以上入力してください(http〜で始まるもの)。");
      return;
    }
    haptic();
    setGenState("loading");
    setGenMsg("");
    setGenCards([]);
    setGenSites([]);
    setGenPagesRead([]);
    setGenDropped(null);
    setGenTokens(null);
    setGenCandidateCount(0);
    try {
      const res = await fetch("/api/generate-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wishes: (appState.wishes ?? []).filter((w) => w.status === "stock").map((w) => ({ title: w.title, domain: w.category, id: w.id })),
          taste: taste.map((i) => ({ label: i.label, weight: i.weight })),
          sources: urls,
          count: 3,
        }),
      });
      const data: GenResponse = await res.json();
      if (!data.ok) {
        setGenState("error");
        setGenMsg(
          data.reason === "no_key"
            ? "GEMINI_API_KEYが未設定です。Vercelの環境変数に登録すると動きます。"
            : data.reason === "no_sources"
            ? "情報源のURLを1つ以上入力してください。"
            : `生成に失敗しました(${data.reason})。${data.detail ?? ""}`,
        );
        return;
      }
      setGenCards(data.cards);
      setGenSites(data.sites);
      setGenPagesRead(data.pagesRead);
      setGenDropped(data.dropped);
      setGenTokens(data.tokens);
      setGenCandidateCount(data.candidateCount);
      setGenState("done");
      const notePart = data.note ? `${data.note} ` : "";
      const totalDropped = data.dropped.sourceInvalid + data.dropped.expired + data.dropped.duplicateCandidate + data.dropped.outOfArea + data.dropped.overQuota;
      const dropPart = totalDropped > 0 ? `検証で${totalDropped}件を除外しました(内訳は下記)。` : "";
      if (data.cards.length === 0) {
        setGenMsg(`${notePart}${dropPart || "カードが返りませんでした。情報源に合う情報が無かったか、ページを読めなかった可能性があります。下の詳細を確認してください。"}`.trim());
      } else {
        setGenMsg(`${notePart}${dropPart}`.trim());
      }
    } catch (e) {
      setGenState("error");
      setGenMsg(`通信に失敗しました。${e instanceof Error ? e.message : ""}`);
    }
  };

  return (
    <>
      <header style={{ padding: "16px 4px 12px", borderBottom: `2px solid ${INK}`, display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: TYPE.head, color: INK, padding: 0, lineHeight: 1 }} aria-label="閉じる">←</button>
        <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: TYPE.head, letterSpacing: "0.02em", lineHeight: 1 }}>設定</div>
      </header>

      <main style={{ paddingTop: 16 }}>
        {syncMsg && (
          <p style={{ fontSize: TYPE.small, color: MUTED, lineHeight: 1.6, margin: "0 2px 16px" }}>{syncMsg}</p>
        )}

        {/* 上部タブ。好み・興味は同じタブ、情報源(URL)は別タブ、それ以外は「その他」。 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {([["taste", "好み・興味"], ["sources", "情報源"], ["other", "その他"]] as const).map(([id, lbl]) => (
            <button key={id} onClick={() => { haptic(); setTab(id); disarm(); }} style={{
              flex: 1, padding: "8px 0", borderRadius: RADIUS.pill, border: "none", cursor: "pointer",
              background: tab === id ? INK : "rgba(26,26,24,0.06)", color: tab === id ? PAPER : INK,
              fontFamily: SANS, fontWeight: 700, fontSize: TYPE.small, letterSpacing: "0.03em",
            }}>{lbl}</button>
          ))}
        </div>

        {tab === "taste" && (<>
        {/* 「興味・好み」= state(profile.interests)をそのまま表示・編集する
            1リスト。好み/興味は概念が重なり重複しやすいため統合した
            (docs/archive/brief-pipeline-2026-07.md §8.14 優先度3)。ここから直接追加・削除したものも、
            KEEP等のフィードバックからの自動検出(Cowork分析経由)も同じ並びに
            混在する。手入力は残すが必須ではなく、主にログ分析が育てる。
            (かつての自由文「気になっていること」欄はウィッシュで代替済みのため廃止。) */}
        <SettingsCard label="興味・好み" icon={Heart}>
          <InterestChips items={taste} onRemove={removeInterestItem}
            inputValue={tasteInput} onInputChange={setTasteInput} onAdd={addTaste}
            placeholder="興味・好みを追加" />
        </SettingsCard>
        </>)}

        {tab === "sources" && (<>
          <SettingsCard label="規定の情報源（展覧会・イベント・映画）" icon={Link2}>
            <p style={{ fontSize: TYPE.small, color: MUTED, lineHeight: 1.7, margin: "0 0 12px" }}>
              毎晩かならず巡回する内蔵の情報源です。変えたいときは削除して、新しいURLを登録してください。
            </p>
            {fixedList.length === 0 ? (
              <p style={{ fontSize: TYPE.body, color: MUTED, margin: "0 0 12px" }}>まだありません。</p>
            ) : fixedList.map((url) => (
              <SettingsRow key={`fixed-${url}`} title={hostLabel(url)} sub={url}
                action={<ConfirmDeleteButton armed={armedKey === `fixed-${url}`} onArm={() => arm(`fixed-${url}`)}
                  onConfirm={() => { disarm(); removeFixedSource(url); }} label={hostLabel(url)} />} />
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input value={fixedInput} onChange={(e) => setFixedInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addFixedSource()}
                placeholder="URLを貼り付け" style={settingsInputStyle} />
              <Button variant="primary" onClick={addFixedSource}>登録</Button>
            </div>
          </SettingsCard>

          <SettingsCard label="その他の情報源" icon={Link2}>
          {favVisible.length === 0 && discovered.length === 0 ? (
            <p style={{ fontSize: TYPE.body, color: MUTED, margin: "0 0 12px" }}>まだありません。</p>
          ) : (
            <>
              {favVisible.map((s) => (
                <SettingsRow key={s.id} title={s.label} sub={s.url}
                  action={<ConfirmDeleteButton armed={armedKey === `fav-${s.id}`} onArm={() => arm(`fav-${s.id}`)}
                    onConfirm={() => { disarm(); removeSource(s.id); }} label={s.label} />} />
              ))}
              {discovered.map((s) => (
                <SettingsRow key={`found-${s.url}`} title={s.label || s.url} sub={s.url}
                  action={<ConfirmDeleteButton armed={armedKey === `disc-${s.url}`} onArm={() => arm(`disc-${s.url}`)}
                    onConfirm={() => { disarm(); dismissSource(s.url); }} label={s.label || s.url} />} />
              ))}
            </>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: favVisible.length === 0 && discovered.length === 0 ? 0 : 12 }}>
            <input value={srcInput} onChange={(e) => setSrcInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSource()}
              placeholder="URLを貼り付け" style={settingsInputStyle} />
            <Button variant="primary" onClick={addSource}>登録</Button>
          </div>
        </SettingsCard>
        </>)}

        {tab === "other" && (<>
        {/* 今月の反応の集計。カードにどう反応したかが分析(好み・興味の学習)の
            材料になっていることを、本人が数字で確認できるようにする。残した・
            実行・星は前向きな反応としてログ(my-brain)に貯まる材料。 */}
        <SettingsCard label="今月の反応" icon={BarChart3}>
          <div style={{ display: "flex", gap: 8 }}>
            {([["残した", reactionCounts.kept], ["実行", reactionCounts.done], ["星", reactionCounts.starred], ["流した", reactionCounts.skipped]] as const).map(([lbl, n]) => (
              <div key={lbl} style={{ flex: 1, textAlign: "center", padding: "12px 0", borderRadius: RADIUS.lg, background: "rgba(26,26,24,0.04)" }}>
                <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: TYPE.head, color: INK, lineHeight: 1 }}>{n}</div>
                <div style={{ fontFamily: SANS, fontSize: TYPE.small, color: MUTED, marginTop: 4 }}>{lbl}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: TYPE.small, color: MUTED, lineHeight: 1.7, margin: "12px 0 0" }}>
            残した・実行・星が、好み・興味の学習の材料になります（GitHubのmy-brainに記録されます）。流したは参考で、記録には残しません。
          </p>
        </SettingsCard>

        {/* 夜間Cron(ブリーフ生成)の直近の実行サマリ。Vercelのログを見なくても
            「動いているか・いつ・何枚生成したか」をここで確認できる。 */}
        <SettingsCard label="ブリーフ生成の状況" icon={Activity}>
          {cronStatus ? (
            <>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: TYPE.body }}>
                {cronStatus.cardCount}枚を生成{cronStatus.cardCount === 0 && cronStatus.note ? `（${cronStatus.note}）` : ""}
              </div>
              <div style={{ fontSize: TYPE.small, color: MUTED, marginTop: 4, lineHeight: 1.7 }}>
                {cronWhen(cronStatus.at)} ・ 情報源{cronStatus.sourceCount}サイト巡回{typeof cronStatus.sitesFetched === "number" ? `(取得成功${cronStatus.sitesFetched})` : ""}<br />
                {typeof cronStatus.candidateCount === "number" && <>候補{cronStatus.candidateCount}件<br /></>}
                {cronStatus.dropped && (() => {
                  const d = cronStatus.dropped;
                  const parts = [
                    d.duplicateCandidate ? `既出で除外${d.duplicateCandidate}` : "",
                    d.irrelevant ? `無関係${d.irrelevant}` : "",
                    d.outOfArea ? `圏外${d.outOfArea}` : "",
                    d.expired ? `終了済み${d.expired}` : "",
                    d.overQuota ? `枚数超過${d.overQuota}` : "",
                    d.sourceInvalid ? `出典不一致${d.sourceInvalid}` : "",
                  ].filter(Boolean);
                  return parts.length ? <>落ちた内訳: {parts.join(" / ")}<br /></> : null;
                })()}
                プール+{cronStatus.pooled} ／ トークン{cronStatus.totalTokens.toLocaleString()}
              </div>
            </>
          ) : (
            <p style={{ fontSize: TYPE.body, color: MUTED, margin: 0, lineHeight: 1.7 }}>
              まだ生成の記録がありません。夜間の生成(または下の「今すぐ生成」)が動くと、ここに直近の状況が表示されます。
            </p>
          )}
          {isSupabaseConfigured && (
            <>
              <button
                onClick={generateNow}
                disabled={genNow === "loading"}
                style={{
                  width: "100%", marginTop: 16, padding: "12px 0",
                  background: genNow === "loading" ? "rgba(26,26,24,0.2)" : INK, color: PAPER,
                  border: "none", borderRadius: RADIUS.pill, cursor: genNow === "loading" ? "default" : "pointer",
                  fontFamily: SANS, fontSize: TYPE.body, fontWeight: 700, letterSpacing: "0.08em",
                }}
              >
                {genNow === "loading" ? "生成中…（1分ほどかかります）" : "今すぐ生成"}
              </button>
              {genNowMsg && (
                <p style={{ fontSize: TYPE.small, color: genNow === "error" ? RUST : MUTED, lineHeight: 1.7, margin: "12px 0 0" }}>{genNowMsg}</p>
              )}
            </>
          )}
        </SettingsCard>

        {/* ★開発用。タスク入力画面の隅に、キーボードと矩形の実測値を出す。
            実機の崩れを数字で見るためのもの。**直ったら撤去する。** */}
        <SettingsCard label="画面の数値を出す" icon={RotateCcw}>
          <p style={{ fontSize: TYPE.small, color: MUTED, lineHeight: 1.7, margin: "0 0 12px" }}>
            タスク入力画面の左上に、キーボードの高さや画面のずれの実測値を小さく出します。レイアウトが崩れたときにこの画面を撮って送ってもらうためのもので、直ったら外します。
          </p>
          <button onClick={() => { const n = !probeOn; setProbeOn(n); setViewportDebug(n); }} style={{
            width: "100%", padding: "12px 0", background: probeOn ? INK : "transparent",
            color: probeOn ? PAPER : INK,
            border: `1.5px solid ${probeOn ? INK : "rgba(26,26,24,0.28)"}`,
            borderRadius: RADIUS.pill, cursor: "pointer",
            fontFamily: SANS, fontSize: TYPE.body, fontWeight: 700, letterSpacing: "0.06em",
          }}>{probeOn ? "数値を出している（切る）" : "数値を出す"}</button>


        </SettingsCard>

        {/* デモ・テストデータの削除。injectDemoで入れたダミーや試行中の記録を
            一括で消す(好み・興味・情報源などの設定は残す)。2段階確認。 */}
        <SettingsCard label="データの整理" icon={RotateCcw}>
          <p style={{ fontSize: TYPE.small, color: MUTED, lineHeight: 1.7, margin: "0 0 12px" }}>
            デモ投入や動作確認で入ったアイテム・ウィッシュ・ゴール・スワイプ記録を、まとめて削除します（好み・興味・情報源などの設定は残ります）。反応ログのファイルは、GitHubのmy-brainから手動で消してください。
          </p>
          {armedKey === "clear-test" ? (
            <button onClick={() => { disarm(); clearTestData(); }} style={{
              width: "100%", padding: "12px 0", background: RUST, color: PAPER, border: "none", borderRadius: RADIUS.pill,
              cursor: "pointer", fontFamily: SANS, fontSize: TYPE.body, fontWeight: 700, letterSpacing: "0.06em",
            }}>本当に削除？（元に戻せません）</button>
          ) : (
            <button onClick={() => arm("clear-test")} style={{
              width: "100%", padding: "12px 0", background: "transparent", color: RUST, border: `1.5px solid ${RUST_EDGE}`,
              borderRadius: RADIUS.pill, cursor: "pointer", fontFamily: SANS, fontSize: TYPE.body, fontWeight: 700, letterSpacing: "0.06em",
            }}>デモ・テストデータを削除</button>
          )}

          {/* ★タスク/候補のダミーだけを消す。上のボタンとは別扱いにしてある —
              上はブリーフ側(アイテム・ウィッシュ・ゴール)を消すもので、
              タスクの山を作り直したいだけのときに巻き添えにしたくない。 */}
          <div style={{ height: 1, background: HAIRLINE, margin: "16px 0" }} />
          <p style={{ fontSize: TYPE.small, color: MUTED, lineHeight: 1.7, margin: "0 0 12px" }}>
            タスクと候補に入れたデモだけを消します（手で作ったタスクと、声のメモから来た候補は残ります）。
          </p>
          <button onClick={clearTaskDemo} disabled={demoCount === 0} style={{
            width: "100%", padding: "12px 0", background: "transparent",
            color: demoCount === 0 ? MUTED : INK,
            border: `1.5px solid ${demoCount === 0 ? HAIRLINE : "rgba(26,26,24,0.28)"}`,
            borderRadius: RADIUS.pill, cursor: demoCount === 0 ? "default" : "pointer",
            fontFamily: SANS, fontSize: TYPE.body, fontWeight: 700, letterSpacing: "0.06em",
          }}>{demoCount === 0 ? "デモのタスク・候補はありません" : `デモのタスク・候補を削除（${demoCount}）`}</button>
        </SettingsCard>

        {/* バインド！(確定ビューでの綴じ操作)のログ。誤ってバインドして
            ストック/プランからカードが消えてしまった時に、この画面から
            元に戻せるようにする(docs/archive/ui-binder-2026-07.md §7.8参照)。 */}
        <SettingsCard label="バインドの記録" icon={RotateCcw}>
          {bindLog.length === 0 ? (
            <p style={{ fontSize: TYPE.body, color: MUTED, margin: 0 }}>まだありません。</p>
          ) : bindLog.map((entry) => (
            <SettingsRow key={entry.id} faded={entry.undone}
              title={`${entry.items.length}件・${entry.items.map((it) => it.title).join("、")}`}
              sub={`${shortDate(entry.boundAt)}にバインド${entry.undone ? "・取り消し済み" : ""}`}
              action={!entry.undone && <IconButton onClick={() => undoBind(entry.id)} label="バインドを元に戻す"><RotateCcw size={13} strokeWidth={2.4} /></IconButton>} />
          ))}
        </SettingsCard>

        {/* フェーズC-0「プロンプト実験場」。本番のブリーフタブは夜間Cronが
            生成したデッキ(generatedDecks)のみを使う。サンプルデータ
            (CARDS・injectDemo)は撤去済み。このカードは生成パイプラインの
            動作確認用として残す(docs/archive/brief-pipeline-2026-07.md §8.12)。 */}
        <SettingsCard label="ブリーフ生成の実験（開発用）" icon={Sparkles}>
          <p style={{ fontSize: TYPE.small, color: MUTED, lineHeight: 1.7, margin: "0 0 12px" }}>
            下の情報源ページをレンダリング(Jina Reader)でクリーンな本文に変換して
            Geminiが読み、そこに載っている情報から、今のウィッシュ・興味に合う
            カードを試作します(Google全体の検索はしません)。まだ本番のブリーフには
            反映されません。
          </p>
          <textarea
            value={genUrls}
            onChange={(e) => setGenUrls(e.target.value)}
            placeholder={"情報源のURLを1行に1つ\n例: https://www.momat.go.jp/"}
            rows={3}
            style={{
              width: "100%", boxSizing: "border-box", resize: "vertical", border: `1px solid ${HAIRLINE}`,
              borderRadius: RADIUS.lg, padding: 12, fontFamily: SANS, fontSize: TYPE.lead, lineHeight: 1.6, outline: "none",
              background: "#FAFAF6", color: INK, marginBottom: 12,
            }}
          />
          <button
            onClick={runGenerate}
            disabled={genState === "loading"}
            style={{
              width: "100%", padding: "12px 0", background: genState === "loading" ? "rgba(26,26,24,0.2)" : INK,
              color: PAPER, border: "none", borderRadius: RADIUS.pill, cursor: genState === "loading" ? "default" : "pointer",
              fontFamily: SANS, fontSize: TYPE.body, fontWeight: 700, letterSpacing: "0.08em",
            }}
          >
            {genState === "loading" ? "生成中…（数十秒かかります）" : "生成を試す"}
          </button>

          {genMsg && (
            <p style={{ fontSize: TYPE.small, color: genState === "error" ? RUST : MUTED, lineHeight: 1.7, margin: "12px 0 0" }}>{genMsg}</p>
          )}

          {genCards.map((c, i) => (
            <div key={i} style={{ marginTop: 12, padding: "12px 0 0", borderTop: `1px solid ${HAIRLINE}` }}>
              {/* 興味の広がり(派生)枠のカードも特別扱いせず他のカードと
                  同じ見た目で馴染ませる(trigger文字列ではなく isDerived
                  フラグで判定する)。 */}
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", marginBottom: 4 }}>
                <span style={{ fontSize: TYPE.micro, letterSpacing: "0.12em", color: MUTED, fontWeight: 700 }}>
                  {c.kind}{c.trigger && !c.isDerived ? `・${c.trigger}` : ""}{c.area ? `・${c.area}` : ""}
                </span>
              </div>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: TYPE.lead, lineHeight: 1.4, color: INK }}>{c.title}</div>
              <p style={{ fontSize: TYPE.small, color: "#5A5A54", lineHeight: 1.7, margin: "4px 0 0" }}>{c.body}</p>
              {c.meta && c.meta.length > 0 && (
                <div style={{ fontSize: TYPE.small, color: MUTED, marginTop: 4 }}>{c.meta.join(" ・ ")}</div>
              )}
              {c.sourceUrl && (
                <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display: "inline-block", marginTop: 8, fontSize: TYPE.small, color: BLUE, wordBreak: "break-all" }}>
                  {c.sourceLabel || c.sourceUrl}
                </a>
              )}
            </div>
          ))}

          {/* 実行トレース: 各段階で何が起きたかを目視確認できるようにする
              (層A=サイトごとのURL選定 / 層B=候補ページの取得 / 除外内訳 /
              トークン実測)。「Geminiに何を渡し何が返ったか見えない」という
              不透明さの解消が目的(HANDOFF §8.12参照)。 */}
          {genSites.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${HAIRLINE}` }}>
              <div style={{ fontSize: TYPE.micro, letterSpacing: "0.14em", color: MUTED, fontWeight: 700, marginBottom: 8 }}>情報源の取得</div>
              {genSites.map((s, i) => (
                <div key={i} style={{ fontSize: TYPE.small, color: MUTED, marginBottom: 8, lineHeight: 1.6 }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={{ color: s.fetched ? GREEN : RUST }}>{s.fetched ? "✓" : "×"}</span> {s.source}
                  </div>
                  {s.fetched && (
                    <div style={{ paddingLeft: 16 }}>
                      候補<span style={{ color: (s.candidates ?? 0) > 0 ? GREEN : RUST, fontWeight: 700 }}>{s.candidates ?? 0}</span>件 ／ Markdown中のリンク:{s.linkCount}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {genPagesRead.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${HAIRLINE}` }}>
              <div style={{ fontSize: TYPE.micro, letterSpacing: "0.14em", color: MUTED, fontWeight: 700, marginBottom: 8 }}>取得したページ（✓=Markdown取得成功）→ 抽出候補{genCandidateCount}件</div>
              {genPagesRead.map((s, i) => (
                <div key={i} style={{ fontSize: TYPE.small, color: MUTED, marginBottom: 4, display: "flex", gap: 8 }}>
                  <span style={{ color: s.ok ? GREEN : RUST, flexShrink: 0 }}>{s.ok ? "✓" : "×"}</span>
                  <a href={s.url} target="_blank" rel="noopener noreferrer"
                    style={{ color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.url}</a>
                </div>
              ))}
            </div>
          )}

          {genDropped && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${HAIRLINE}` }}>
              <div style={{ fontSize: TYPE.micro, letterSpacing: "0.14em", color: MUTED, fontWeight: 700, marginBottom: 8 }}>分類・除外の内訳（層C分類 → 層D検証）</div>
              <div style={{ fontSize: TYPE.small, color: MUTED, lineHeight: 1.8 }}>
                無関係と分類: {genDropped.irrelevant} ／ 出典URL不一致: {genDropped.sourceInvalid} ／
                終了済み: {genDropped.expired} ／ 重複候補: {genDropped.duplicateCandidate} ／
                生活圏外: {genDropped.outOfArea} ／ 上限超過(採用漏れ): {genDropped.overQuota}
              </div>
            </div>
          )}

          {genTokens && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${HAIRLINE}` }}>
              <div style={{ fontSize: TYPE.micro, letterSpacing: "0.14em", color: MUTED, fontWeight: 700, marginBottom: 8 }}>トークン使用量（実測）</div>
              <div style={{ fontSize: TYPE.small, color: MUTED }}>
                入力 {genTokens.promptTokens.toLocaleString()} ／ 出力 {genTokens.candidateTokens.toLocaleString()} ／
                合計 {genTokens.totalTokens.toLocaleString()}（{genTokens.calls}回のAPI呼び出し）
              </div>
            </div>
          )}
        </SettingsCard>

        {/* サインアウト。Supabase構成済みのときだけ表示する(このタブが
            見えている時点でログイン済み)。未構成(localStorage運用)では
            そもそもアカウントの概念が無いので出さない。押すとAppShellの
            onAuthStateChangeがサインインゲートへ戻す。 */}
        {isSupabaseConfigured && (
          <button
            onClick={() => { haptic(6); supabase?.auth.signOut(); }}
            style={{
              display: "block", margin: "4px auto 0", background: "none", border: "none",
              cursor: "pointer", fontFamily: SANS, fontSize: TYPE.small, color: MUTED,
              letterSpacing: "0.04em", padding: "8px 4px", textDecoration: "underline",
            }}
          >
            サインアウト
          </button>
        )}
        </>)}
      </main>
    </>
  );
}

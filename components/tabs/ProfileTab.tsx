"use client";

import { Heart, Link2, RotateCcw, Sparkles, X } from "lucide-react";
import { useState } from "react";
import type { IconType } from "@/components/common";
import { rowBtn } from "@/components/common";
import { BLUE, HAIRLINE, INK, PAPER, RUST, SANS, SERIF } from "@/lib/constants";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import { haptic, shortDate } from "@/lib/helpers";
import type { AppState } from "@/lib/types";

// フェーズC-0「プロンプト実験場」で生成されるカードの形(BriefCard相当の
// 部分集合)。本番のデッキ統合前に、設定画面で品質を目視確認するためだけの
// 暫定型。/api/generate-brief の返り値と一致させる。
type GeneratedCard = {
  title: string; body: string; kind: string; trigger: string;
  area?: string; sourceUrl?: string; sourceLabel?: string; meta?: string[];
  expiresAt?: string; serendipity?: boolean; sourceWishTitle?: string;
};
type GenResponse =
  | { ok: true; cards: GeneratedCard[]; raw: string; pages: { url: string; ok: boolean }[]; dropped: number; note?: string }
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
// 状態遷移に起因する不具合の可能性そのものを消した(詳細はHANDOFF-
// CURRENT.md参照)。fontSize:16はタップしやすい大きさとしてそのまま残す。)
const settingsInputStyle: React.CSSProperties = {
  flex: 1, border: "none", borderBottom: `1.5px solid ${INK}`, background: "transparent",
  fontFamily: SANS, fontSize: 16, padding: "7px 2px", outline: "none", minWidth: 0,
};

// 各セクションを1枚の淡いカードにまとめる。以前はラベル+素のテキスト/
// 入力欄が背景に直置きで並んでいるだけで、区切りが弱く「物足りない」
// 見た目だった。カード化することで各セクションの範囲がひと目でわかり、
// 画面にリズムが生まれる。
function SettingsCard({ label, icon: Icon, children }: { label: string; icon?: IconType; children: React.ReactNode }) {
  return (
    <section style={{ background: "rgba(23,23,21,0.035)", border: `1px solid ${HAIRLINE}`, borderRadius: 18, padding: "14px 16px 16px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
        {Icon && <Icon size={12} strokeWidth={2.2} color="#9A988E" />}
        <span style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E", fontWeight: 700 }}>{label}</span>
      </div>
      {children}
    </section>
  );
}

// 削除・取り消しの丸いアイコンボタン。PlanSelectionBarの「選択を外す」と
// 同じ語彙(rgba(168,85,47,0.12)地+RUST)に揃え、テキストの「削除」
// 「元に戻す」のような素のテキストボタンをやめて画面内のボタンをすべて
// 同じ形式にする。
function IconButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} style={{
      width: 28, height: 28, borderRadius: "50%", border: "none", background: "rgba(168,85,47,0.12)", color: RUST,
      display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, padding: 0,
    }}>
      {children}
    </button>
  );
}

// 情報源・バインドの記録で共通に使う1行リスト(タイトル+補足+右端の
// アイコンボタン)。見た目(パディング・区切り線・文字サイズ)を1箇所に
// まとめることで、セクションごとに微妙に違う実装になるのを防ぐ。
function SettingsRow({ title, sub, faded, action }: { title: string; sub: string; faded?: boolean; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 2px", borderTop: `1px solid ${HAIRLINE}`, opacity: faded ? 0.5 : 1 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ fontSize: 9.5, color: "#9A988E", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
      </div>
      {action}
    </div>
  );
}

export function ProfileTab({ appState, persist, onClose }: {
  appState: AppState;
  persist: (next: AppState) => void;
  onClose: () => void;
}) {
  const [focusDraft, setFocusDraft] = useState(appState.profile?.currentFocus ?? "");
  const [srcInput, setSrcInput] = useState("");

  // フェーズC-0: ブリーフ生成の実験。まだ本番デッキには繋がず、返ってきた
  // カードをこの画面に表示して品質を目視確認するだけ(HANDOFF §8.12)。
  const [genState, setGenState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [genCards, setGenCards] = useState<GeneratedCard[]>([]);
  const [genPages, setGenPages] = useState<{ url: string; ok: boolean }[]>([]);
  const [genMsg, setGenMsg] = useState("");
  // 実験に使う情報源URL(改行区切り)。登録済みの「お気に入りの情報源」を
  // 初期値にしつつ、その場で貼り足し・編集できるようにする。本番では
  // Coworkが用意した情報源リストがこの役割を担う。
  const [genUrls, setGenUrls] = useState(() => (appState.sources ?? []).map((s) => s.url).join("\n"));

  const interests = (appState.profile?.interests ?? []).slice().sort((a, b) => b.weight - a.weight);
  const sources = appState.sources ?? [];
  const bindLog = appState.bindLog ?? [];

  const saveFocus = () => {
    const next = structuredClone(appState);
    next.profile = next.profile ?? { interests: [], currentFocus: "" };
    next.profile.currentFocus = focusDraft.trim();
    persist(next);
  };
  const addSource = () => {
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
  };
  const removeSource = (id: string) => {
    const next = structuredClone(appState);
    next.sources = next.sources.filter((s) => s.id !== id);
    persist(next);
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

  // 生成を試す: 現在のウィッシュ・興味・気になっていることをサーバー関数へ
  // 渡し、Geminiが本物のWeb検索で作ったカードを受け取って表示する。
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
    setGenPages([]);
    try {
      const res = await fetch("/api/generate-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wishes: (appState.wishes ?? []).filter((w) => w.status === "stock").map((w) => w.title),
          interests: interests.map((i) => i.label),
          focus: appState.profile?.currentFocus ?? "",
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
      setGenPages(data.pages);
      setGenState("done");
      const notePart = data.note ? `${data.note} ` : "";
      const dropPart = data.dropped > 0 ? `出典URLが確認できなかった${data.dropped}件は捏造防止のため除外しました。` : "";
      if (data.cards.length === 0) {
        setGenMsg(`${notePart}${dropPart || "カードが返りませんでした。情報源に合う情報が無かったか、ページ本文を取得できなかった可能性があります。下の「読み込んだページ」を確認してください。"}`.trim());
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
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: INK, padding: 0, lineHeight: 1 }} aria-label="閉じる">←</button>
        <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 20, letterSpacing: "0.02em", lineHeight: 1 }}>設定</div>
      </header>

      <main style={{ paddingTop: 18 }}>
        {/* 「今、気になっていること」と「興味・好み」は、どちらも
            「今の関心」を表す情報として1枚のカードにまとめる(以前は
            別々のカードだったが、近い内容として1つの括りにしてほしい
            という指摘を受けた)。
            気になっていることの入力: 以前は非編集時(タップすると鉛筆
            アイコン付きの表示に切り替わる)と編集時(入力欄+保存ボタン)を
            state(editingFocus)で切り替えていたが、「情報源」の入力欄と
            見た目・挙動を揃えてほしいという指摘を受け、この切り替え自体を
            廃止した。情報源と全く同じ「常に入力欄+保存ボタンが両方
            見えている」構成にし、タップの回数や状態遷移に依存しない
            単純な形にした。 */}
        <SettingsCard label="気になっていること・好み" icon={Heart}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input value={focusDraft} onChange={(e) => setFocusDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveFocus()}
              placeholder="タップして入力" style={settingsInputStyle} />
            <button onClick={saveFocus} style={rowBtn(INK, PAPER)}>保存</button>
          </div>
          {/* 以前はカテゴリごとの色分け+重み(weight)に応じた文字サイズの
              変化を両方使っており、色もサイズもバラバラな「ワードクラウド」
              のようになって見づらかった。1色・1サイズの地味なチップへ揃え、
              重みは並び順(降順)だけで表す方が、興味の一覧としてずっと
              読みやすい。 */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            {interests.length === 0 ? (
              <p style={{ fontSize: 12, color: "#9A988E", margin: 0 }}>まだありません。</p>
            ) : interests.map((item) => (
              <span key={item.id} style={{
                display: "inline-flex", alignItems: "center", padding: "6px 12px", borderRadius: 999,
                background: "rgba(23,23,21,0.06)", color: INK, fontFamily: SANS, fontWeight: 600, fontSize: 12,
              }}>
                {item.label}
              </span>
            ))}
          </div>
        </SettingsCard>

        <SettingsCard label="お気に入りの情報源" icon={Link2}>
          {sources.length === 0 ? (
            <p style={{ fontSize: 12, color: "#9A988E", margin: "0 0 12px" }}>まだありません。</p>
          ) : sources.map((s) => (
            <SettingsRow key={s.id} title={s.label} sub={s.url}
              action={<IconButton onClick={() => removeSource(s.id)} label={`${s.label}を削除`}><X size={13} strokeWidth={2.4} /></IconButton>} />
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: sources.length === 0 ? 0 : 12 }}>
            <input value={srcInput} onChange={(e) => setSrcInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSource()}
              placeholder="URLを貼り付け" style={settingsInputStyle} />
            <button onClick={addSource} style={rowBtn(INK, PAPER)}>登録</button>
          </div>
        </SettingsCard>

        {/* バインド！(確定ビューでの綴じ操作)のログ。誤ってバインドして
            ストック/プランからカードが消えてしまった時に、この画面から
            元に戻せるようにする(HANDOFF-CURRENT.md §7.8参照)。 */}
        <SettingsCard label="バインドの記録" icon={RotateCcw}>
          {bindLog.length === 0 ? (
            <p style={{ fontSize: 12, color: "#9A988E", margin: 0 }}>まだありません。</p>
          ) : bindLog.map((entry) => (
            <SettingsRow key={entry.id} faded={entry.undone}
              title={`${entry.items.length}件・${entry.items.map((it) => it.title).join("、")}`}
              sub={`${shortDate(entry.boundAt)}にバインド${entry.undone ? "・取り消し済み" : ""}`}
              action={!entry.undone && <IconButton onClick={() => undoBind(entry.id)} label="バインドを元に戻す"><RotateCcw size={13} strokeWidth={2.4} /></IconButton>} />
          ))}
        </SettingsCard>

        {/* フェーズC-0「プロンプト実験場」。まだ本番のブリーフタブには繋がず、
            Geminiが本物のWeb検索で作ったカードをここに表示して品質を目視
            確認するための開発用セクション。アプリ完成時にはサンプルデータ
            (CARDS/injectDemo)と一緒にこのカードごと撤去する予定
            (HANDOFF §8.12)。 */}
        <SettingsCard label="ブリーフ生成の実験（開発用）" icon={Sparkles}>
          <p style={{ fontSize: 11, color: "#9A988E", lineHeight: 1.7, margin: "0 0 10px" }}>
            下の情報源ページをGeminiが実際に読み、そこに載っている情報から、
            今のウィッシュ・興味に合うカードを試作します(Google全体の検索は
            しません)。まだ本番のブリーフには反映されません。
          </p>
          <textarea
            value={genUrls}
            onChange={(e) => setGenUrls(e.target.value)}
            placeholder={"情報源のURLを1行に1つ\n例: https://www.momat.go.jp/"}
            rows={3}
            style={{
              width: "100%", boxSizing: "border-box", resize: "vertical", border: `1px solid ${HAIRLINE}`,
              borderRadius: 10, padding: 10, fontFamily: SANS, fontSize: 12, lineHeight: 1.6, outline: "none",
              background: "#FAFAF6", color: INK, marginBottom: 10,
            }}
          />
          <button
            onClick={runGenerate}
            disabled={genState === "loading"}
            style={{
              width: "100%", padding: "11px 0", background: genState === "loading" ? "rgba(23,23,21,0.2)" : INK,
              color: PAPER, border: "none", borderRadius: 999, cursor: genState === "loading" ? "default" : "pointer",
              fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
            }}
          >
            {genState === "loading" ? "生成中…（数十秒かかります）" : "生成を試す"}
          </button>

          {genMsg && (
            <p style={{ fontSize: 11, color: genState === "error" ? RUST : "#9A988E", lineHeight: 1.7, margin: "12px 0 0" }}>{genMsg}</p>
          )}

          {genCards.map((c, i) => (
            <div key={i} style={{ marginTop: 12, padding: "12px 0 0", borderTop: `1px solid ${HAIRLINE}` }}>
              {/* セレンディピティ枠のカードは特別扱いせず他のカードと同じ
                  見た目で馴染ませる(「セレンディピティ」の語は出さない)。 */}
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", marginBottom: 4 }}>
                <span style={{ fontSize: 8.5, letterSpacing: "0.12em", color: "#9A988E", fontWeight: 700 }}>
                  {c.kind}{c.trigger && c.trigger !== "セレンディピティ" ? `・${c.trigger}` : ""}{c.area ? `・${c.area}` : ""}
                </span>
              </div>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13.5, lineHeight: 1.4, color: INK }}>{c.title}</div>
              <p style={{ fontSize: 11.5, color: "#5A5A54", lineHeight: 1.7, margin: "4px 0 0" }}>{c.body}</p>
              {c.meta && c.meta.length > 0 && (
                <div style={{ fontSize: 10, color: "#9A988E", marginTop: 4 }}>{c.meta.join(" ・ ")}</div>
              )}
              {c.sourceUrl && (
                <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display: "inline-block", marginTop: 6, fontSize: 10.5, color: BLUE, wordBreak: "break-all" }}>
                  {c.sourceLabel || c.sourceUrl}
                </a>
              )}
            </div>
          ))}

          {genPages.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${HAIRLINE}` }}>
              <div style={{ fontSize: 8.5, letterSpacing: "0.14em", color: "#9A988E", fontWeight: 700, marginBottom: 6 }}>読み込んだページ（✓=本文取得成功）</div>
              {genPages.map((s, i) => (
                <div key={i} style={{ fontSize: 10, color: "#9A988E", marginBottom: 3, display: "flex", gap: 6 }}>
                  <span style={{ color: s.ok ? "#33633F" : RUST, flexShrink: 0 }}>{s.ok ? "✓" : "×"}</span>
                  <a href={s.url} target="_blank" rel="noopener noreferrer"
                    style={{ color: "#9A988E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.url}</a>
                </div>
              ))}
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
              cursor: "pointer", fontFamily: SANS, fontSize: 11.5, color: "#9A988E",
              letterSpacing: "0.04em", padding: "8px 4px", textDecoration: "underline",
            }}
          >
            サインアウト
          </button>
        )}
      </main>
    </>
  );
}

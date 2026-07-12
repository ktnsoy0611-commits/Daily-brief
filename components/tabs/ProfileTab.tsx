"use client";

import { RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { rowBtn } from "@/components/common";
import { HAIRLINE, INK, PAPER, RUST, SANS, SERIF } from "@/lib/constants";
import { haptic, shortDate } from "@/lib/helpers";
import type { AppState } from "@/lib/types";

// セクション見出し。ラベル語彙(letter-spacingを効かせた小さいラベル)を
// 画面内で1つに統一する。以前はセクションごとに説明文の有無・長さが
// バラバラで、UIとしての一貫性を欠いていた。
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 9, letterSpacing: "0.22em", color: "#9A988E", marginBottom: 10, fontWeight: 700 }}>{children}</div>;
}

// 「入力+右にボタン」の1行入力欄。以前は「今、気になっていること」が
// SERIF/16px/1.5px border、「お気に入りの情報源」がSANS/12.5px/1px border
// と、同じ構造(入力欄+確定ボタン)なのにフォント・サイズ・線の太さが
// バラバラで、この画面全体の「統一感がない」という指摘の中心だった。
// この画面内の入力欄はすべてこの1つのスタイルに揃える。
const settingsInputStyle: React.CSSProperties = {
  flex: 1, border: "none", borderBottom: `1.5px solid ${INK}`, background: "transparent",
  fontFamily: SANS, fontSize: 13, padding: "7px 2px", outline: "none", minWidth: 0,
};

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
  const [editingFocus, setEditingFocus] = useState(false);
  const [focusDraft, setFocusDraft] = useState(appState.profile?.currentFocus ?? "");
  const [srcInput, setSrcInput] = useState("");

  const interests = (appState.profile?.interests ?? []).slice().sort((a, b) => b.weight - a.weight);
  const sources = appState.sources ?? [];
  const bindLog = appState.bindLog ?? [];

  const saveFocus = () => {
    const next = structuredClone(appState);
    next.profile = next.profile ?? { interests: [], currentFocus: "" };
    next.profile.currentFocus = focusDraft.trim();
    persist(next);
    setEditingFocus(false);
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

  return (
    <>
      <header style={{ padding: "16px 4px 12px", borderBottom: `2px solid ${INK}`, display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: INK, padding: 0, lineHeight: 1 }} aria-label="閉じる">←</button>
        <div>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 20, letterSpacing: "0.02em", lineHeight: 1 }}>設定</div>
          <div style={{ fontSize: 9, letterSpacing: "0.26em", color: "#9A988E", marginTop: 4 }}>SETTINGS</div>
        </div>
      </header>

      <section style={{ paddingTop: 20 }}>
        <SectionLabel>今、気になっていること</SectionLabel>
        {editingFocus ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input autoFocus value={focusDraft} onChange={(e) => setFocusDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveFocus()}
              style={settingsInputStyle} />
            <button onClick={saveFocus} style={rowBtn(INK, PAPER)}>保存</button>
          </div>
        ) : (
          <div onClick={() => { setFocusDraft(appState.profile?.currentFocus ?? ""); setEditingFocus(true); }} style={{
            fontFamily: SERIF, fontSize: 17, lineHeight: 1.6, color: appState.profile?.currentFocus ? INK : "#9A988E", cursor: "pointer",
            borderBottom: "1px dashed rgba(23,23,21,0.25)", paddingBottom: 10,
          }}>
            {appState.profile?.currentFocus || "タップして入力（例: 最近は器に興味がある）"}
          </div>
        )}
      </section>

      <section style={{ paddingTop: 26, paddingBottom: 24 }}>
        <SectionLabel>興味・好み</SectionLabel>
        {/* 以前はカテゴリごとの色分け+重み(weight)に応じた文字サイズの
            変化を両方使っており、色もサイズもバラバラな「ワードクラウド」
            のようになって見づらかった。1色・1サイズの地味なチップへ揃え、
            重みは並び順(降順)だけで表す方が、興味の一覧としてずっと
            読みやすい。 */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {interests.length === 0 ? (
            <p style={{ fontSize: 12, color: "#9A988E" }}>まだありません。</p>
          ) : interests.map((item) => (
            <span key={item.id} style={{
              display: "inline-flex", alignItems: "center", padding: "6px 12px", borderRadius: 999,
              background: "rgba(23,23,21,0.06)", color: INK, fontFamily: SANS, fontWeight: 600, fontSize: 12,
            }}>
              {item.label}
            </span>
          ))}
        </div>
      </section>

      <section style={{ paddingTop: 6, paddingBottom: 28 }}>
        <SectionLabel>お気に入りの情報源</SectionLabel>
        {sources.length === 0 ? (
          <p style={{ fontSize: 12, color: "#9A988E", margin: "0 0 12px" }}>まだありません。</p>
        ) : sources.map((s) => (
          <SettingsRow key={s.id} title={s.label} sub={s.url}
            action={<IconButton onClick={() => removeSource(s.id)} label={`${s.label}を削除`}><X size={13} strokeWidth={2.4} /></IconButton>} />
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input value={srcInput} onChange={(e) => setSrcInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSource()}
            placeholder="https:// から始まるURLを貼り付け" style={settingsInputStyle} />
          <button onClick={addSource} style={rowBtn(INK, PAPER)}>登録</button>
        </div>
      </section>

      {/* バインド！(確定ビューでの綴じ操作)のログ。誤ってバインドして
          ストック/プランからカードが消えてしまった時に、この画面から
          元に戻せるようにする(HANDOFF-CURRENT.md §7.8参照)。 */}
      <section style={{ paddingTop: 6, paddingBottom: 28 }}>
        <SectionLabel>バインドの記録</SectionLabel>
        {bindLog.length === 0 ? (
          <p style={{ fontSize: 12, color: "#9A988E" }}>まだありません。</p>
        ) : bindLog.map((entry) => (
          <SettingsRow key={entry.id} faded={entry.undone}
            title={`${entry.items.length}件・${entry.items.map((it) => it.title).join("、")}`}
            sub={`${shortDate(entry.boundAt)}にバインド${entry.undone ? "・取り消し済み" : ""}`}
            action={!entry.undone && <IconButton onClick={() => undoBind(entry.id)} label="バインドを元に戻す"><RotateCcw size={13} strokeWidth={2.4} /></IconButton>} />
        ))}
      </section>
    </>
  );
}

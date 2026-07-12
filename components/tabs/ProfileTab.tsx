"use client";

import { Heart, Link2, Pencil, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import type { IconType } from "@/components/common";
import { rowBtn } from "@/components/common";
import { HAIRLINE, INK, PAPER, RUST, SANS, SERIF } from "@/lib/constants";
import { haptic, shortDate } from "@/lib/helpers";
import type { AppState } from "@/lib/types";

// 「入力+右にボタン」の1行入力欄。この画面内の入力欄はすべてこの1つの
// スタイルに揃える(以前はセクションごとにフォント・サイズ・線の太さが
// バラバラだった)。
// ★fontSizeは16px未満にしないこと。iOS Safariはfont-sizeが16px未満の
// input要素にフォーカスすると、ページ全体を自動でズームインする仕様が
// あり、ズーム変化の最中はレイアウトが一時的に乱れる(このinputの右にある
// 「保存」ボタンが画面外へ押し出されて見えなくなる、という報告があった)。
// 入力欄をもう一度タップすると直る、というのはズームが収まって再計算
// されるタイミングと一致しており、この閾値未満のfont-sizeが原因だったと
// 判断した。13pxから16pxへ上げることでズーム自体を発生させない。
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

      <main style={{ paddingTop: 18 }}>
        {/* 「今、気になっていること」と「興味・好み」は、どちらも
            「今の関心」を表す情報として1枚のカードにまとめる(以前は
            別々のカードだったが、近い内容として1つの括りにしてほしい
            という指摘を受けた)。
            気になっていることの表示: 以前は非編集時(SERIF/17px/破線下線)と
            編集時(入力欄、SANS)でフォント・サイズがまったく別物で、
            タップして初めて「統一されたデザイン」になる、という見た目の
            バグになっていた。両状態を同じフォント/サイズ/下線に揃え、
            非編集時は右端に鉛筆アイコンを添えることで「ここは編集できる」
            という手がかりを、テキストの見た目を変えずに示す。 */}
        <SettingsCard label="気になっていること・好み" icon={Heart}>
          {editingFocus ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input autoFocus value={focusDraft} onChange={(e) => setFocusDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveFocus()}
                style={settingsInputStyle} />
              <button onClick={saveFocus} style={rowBtn(INK, PAPER)}>保存</button>
            </div>
          ) : (
            <button onClick={() => { setFocusDraft(appState.profile?.currentFocus ?? ""); setEditingFocus(true); }} style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%", border: "none", background: "transparent",
              cursor: "pointer", padding: 0, textAlign: "left", borderBottom: `1.5px solid ${INK}`, paddingBottom: 7,
            }}>
              <span style={{
                flex: 1, minWidth: 0, fontFamily: SANS, fontSize: 13, color: appState.profile?.currentFocus ? INK : "#B5B3A8",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {appState.profile?.currentFocus || "タップして入力（例: 最近は器に興味がある）"}
              </span>
              <Pencil size={12} strokeWidth={2} color="#9A988E" style={{ flexShrink: 0 }} />
            </button>
          )}
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
              placeholder="https:// から始まるURLを貼り付け" style={settingsInputStyle} />
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
      </main>
    </>
  );
}

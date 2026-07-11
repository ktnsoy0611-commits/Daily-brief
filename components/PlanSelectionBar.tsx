"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { INK, NAV_OFFSET, PAPER, RUST, SANS, SOFT_SHADOW_LG } from "@/lib/constants";
import { img } from "@/lib/helpers";
import type { AppState, PlanSelection } from "@/lib/types";

interface SelectedEntry { id: string; title: string; image?: string; color?: string; }

function resolveEntries(appState: AppState, selection: PlanSelection): SelectedEntry[] {
  return selection.itemIds
    .map((id): SelectedEntry | null => {
      const item = appState.items.find((x) => x.id === id);
      return item ? { id, title: item.title, image: item.images?.[0], color: item.color } : null;
    })
    .filter((x): x is SelectedEntry => !!x);
}

// タブを跨いで持ち回すバインド候補(プラン選択)を、画面右下に常時浮かせた
// 小さなクラスターで見せる。以前はプランタブの地図画面だけに全幅の確定
// バーがあったが、ストックタブからも同じ選択に足せるようにしたため、
// 確定操作の入口を「どのタブにいても同じ場所に浮いている」この1つに
// 統一した。スタックしたカードのアイコンをタップすると内訳の一覧が開き、
// そこで1件ずつ外せる。
export function PlanSelectionBar({ appState, selection, toggleItemSelection, onClear, onBind }: {
  appState: AppState;
  selection: PlanSelection;
  toggleItemSelection: (id: string) => void;
  onClear: () => void;
  onBind: () => void;
}) {
  const [listOpen, setListOpen] = useState(false);
  const entries = resolveEntries(appState, selection);
  const count = entries.length;
  if (count === 0 && !listOpen) return null;
  const shown = entries.slice(-3);
  const rotations = [-8, 6, -4];

  return (
    <>
      {/* zIndexはnav(25)より高く。navのピルの影がわずかに滲んで、バインド！
          ボタンの下端に半透明のマスクがかかったように見える不具合があった
          ため、navより常に手前に出す。 */}
      <div style={{ position: "fixed", right: 16, bottom: `calc(${NAV_OFFSET} + 8px)`, zIndex: 26 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: PAPER, borderRadius: 999, padding: "7px 8px 7px 7px", boxShadow: SOFT_SHADOW_LG }}>
          {/* スタックしたカードのアイコン。小さく重ねた縮小サムネイルで
              「今バインドしようとしている束」であることを一目で伝える。 */}
          <button onClick={() => setListOpen(true)} aria-label="選択中のカードを見る" style={{ position: "relative", width: 42, height: 42, flexShrink: 0, border: "none", background: "none", cursor: "pointer", padding: 0 }}>
            {shown.map((it, i) => (
              <div key={it.id} style={{
                position: "absolute", top: 2, left: 2, width: 30, height: 30, borderRadius: 7, overflow: "hidden",
                border: "2px solid #fff", boxShadow: "0 2px 6px rgba(23,23,21,0.28)",
                transform: `rotate(${rotations[i % rotations.length]}deg) translate(${i * 3}px, ${i * -3}px)`, zIndex: i,
              }}>
                {it.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img(it.image, 80, 80)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", background: it.color ?? "#5A5A54" }} />
                )}
              </div>
            ))}
            {count > 0 && (
              <span style={{ position: "absolute", top: -4, right: -4, minWidth: 17, height: 17, borderRadius: 999, background: INK, color: PAPER, fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", zIndex: 10 }}>{count}</span>
            )}
          </button>
          <button onClick={onClear} aria-label="選択を取り消す" style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: "rgba(23,23,21,0.06)", color: "#5A5A54", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, padding: 0 }}>
            <X size={14} strokeWidth={2.4} />
          </button>
          <button onClick={onBind} disabled={count === 0} style={{
            flexShrink: 0, padding: "11px 16px", background: count === 0 ? "rgba(23,23,21,0.2)" : INK, color: PAPER, border: "none", borderRadius: 999,
            cursor: count === 0 ? "default" : "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", whiteSpace: "nowrap",
          }}>
            バインド！
          </button>
        </div>
      </div>

      {listOpen && (
        <BottomSheet onClose={() => setListOpen(false)} maxHeight="70vh">
          {() => (
            <div style={{ background: PAPER, borderRadius: 22, padding: "16px 14px 18px", boxShadow: SOFT_SHADOW_LG }}>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 15, margin: "2px 4px 14px" }}>選択中（{count}件）</div>
              {count === 0 ? (
                <p style={{ fontSize: 11.5, color: "#9A988E", margin: "0 4px" }}>まだ選んでいません。</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {entries.map((it) => (
                    <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 4px" }}>
                      <div style={{ width: 40, height: 40, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
                        {it.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={img(it.image, 100, 100)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", background: it.color ?? "#5A5A54" }} />
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, fontFamily: SANS, fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</div>
                      <button onClick={() => toggleItemSelection(it.id)} aria-label={`${it.title}を外す`} style={{ width: 28, height: 28, borderRadius: "50%", border: "none", background: "rgba(168,85,47,0.12)", color: RUST, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, padding: 0 }}>
                        <X size={13} strokeWidth={2.4} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </BottomSheet>
      )}
    </>
  );
}

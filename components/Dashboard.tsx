"use client";

import { Check, X } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { TaskRow } from "@/components/tabs/TasksTab";
import { BG, HAIRLINE, INK, MUTED, PAPER, RUST, SANS, SOFT_SHADOW, SOFT_SHADOW_LG } from "@/lib/constants";
import { haptic, img, todayKey, todayLabel } from "@/lib/helpers";
import type { AppState, PlanSelection } from "@/lib/types";

// ★ダッシュボード。画面下から引き上げて呼び出す、3つのアプリ共通の引き出し。
// 「いま選んでいるカード」と「その日のタスク」を1枚で見渡し、下部の
// 「今日を終える」で1日を締める(選んだカードは実行済みとしてアーカイブの
// バインダーへ、その日のタスクは完了になる)。
//
// 以前のプランタブの確定ビュー(ConfirmedStack、選択→バインダーへ→確定
// ビュー→バインド！という2段階)は撤去し、締める操作をこの1箇所に集約した。
//
// createPortalでdocument.body直下に描くのは、nav(zIndex:25)やタブ側の
// stickyが作る重なりコンテキストの影響を受けないようにするため(全画面の
// オーバーレイでこのプロジェクトが繰り返し踏んできた問題への定石)。

// 引き出しの高さ(画面に対する割合)。上に元の画面が少し覗く。
const SHEET_HEIGHT = "88svh";
// 下へこれ以上引いたら閉じる(px)。
const DISMISS_PX = 110;
const ANIM_MS = 300;

function SectionLabel({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "0 4px 10px" }}>
      <span style={{ fontFamily: SANS, fontSize: 11, letterSpacing: "0.16em", color: MUTED, fontWeight: 700 }}>{children}</span>
      {typeof count === "number" && (
        <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: INK }}>{count}</span>
      )}
    </div>
  );
}

function SelectedRow({ title, image, color, onRemove }: {
  title: string; image?: string; color?: string; onRemove: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, background: PAPER, borderRadius: 14, padding: "9px 12px 9px 9px", boxShadow: SOFT_SHADOW }}>
      <div style={{ width: 42, height: 42, borderRadius: 9, overflow: "hidden", flexShrink: 0, background: color ?? "#5A5A54" }}>
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img(image, 100, 100)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0, fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
      <button onClick={() => { haptic(6); onRemove(); }} aria-label={`${title}を外す`} style={{
        width: 26, height: 26, borderRadius: "50%", border: "none", background: "rgba(193,80,46,0.12)", color: RUST,
        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, padding: 0,
      }}>
        <X size={13} strokeWidth={2.4} />
      </button>
    </div>
  );
}

export function Dashboard({ appState, selection, onToggleItem, onClearSelection, onToggleTask, onFinishDay, onClose }: {
  appState: AppState;
  selection: PlanSelection;
  onToggleItem: (id: string) => void;
  onClearSelection: () => void;
  onToggleTask: (id: string) => void;
  onFinishDay: () => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  // 下へ引いている量(px)。指を離すとしきい値を超えていれば閉じ、
  // 超えていなければ0へ戻る。
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ id: number; y: number; active: boolean } | null>(null);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  // BottomSheetと同じ理由(閉じるタイマーが生き残って後から古いonCloseを
  // 呼ぶのを防ぐ)。
  useEffect(() => () => { if (closeTimer.current != null) window.clearTimeout(closeTimer.current); }, []);

  const requestClose = () => {
    setOpen(false);
    closeTimer.current = window.setTimeout(onClose, ANIM_MS);
  };

  // つまみ(ハンドル)と見出し部分を下へ引くと閉じられる。中身のスクロールと
  // 取り合わないよう、この判定はシートの上端の帯だけに付ける。
  const onGrabDown = (e: ReactPointerEvent) => {
    dragRef.current = { id: e.pointerId, y: e.clientY, active: true };
    setDragging(true);
  };
  const onGrabMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    setDragY(Math.max(0, e.clientY - d.y));
  };
  const endGrab = () => {
    const pulled = dragY;
    dragRef.current = null;
    setDragging(false);
    setDragY(0);
    if (pulled >= DISMISS_PX) requestClose();
  };

  const entries = selection.itemIds
    .map((id) => appState.items.find((x) => x.id === id))
    .filter((x): x is NonNullable<typeof x> => !!x);
  const today = todayKey();
  const todaysTasks = (appState.tasks ?? []).filter((t) => t.dueDate === today);
  const canFinish = entries.length > 0 || todaysTasks.length > 0;

  const body = (
    <div style={{ position: "fixed", inset: 0, zIndex: 55, pointerEvents: open ? "auto" : "none" }}>
      {/* 背景。タップで閉じる。 */}
      <div
        onPointerDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); requestClose(); } }}
        style={{
          position: "absolute", inset: 0,
          background: open ? "rgba(16,16,20,0.34)" : "rgba(16,16,20,0)",
          backdropFilter: open ? "blur(14px) saturate(1.3)" : "blur(0px)",
          WebkitBackdropFilter: open ? "blur(14px) saturate(1.3)" : "blur(0px)",
          transition: `background ${ANIM_MS}ms ease, backdrop-filter ${ANIM_MS}ms ease, -webkit-backdrop-filter ${ANIM_MS}ms ease`,
        }}
      />
      {/* 引き出し本体。下端に貼り付き、上端だけ角丸。 */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0, height: SHEET_HEIGHT,
        display: "flex", flexDirection: "column", alignItems: "center",
        transform: open ? `translateY(${dragY}px)` : "translateY(100%)",
        transition: dragging ? "none" : `transform ${ANIM_MS}ms cubic-bezier(0.32,0.72,0,1)`,
      }}>
        <div style={{
          width: "100%", maxWidth: 420, height: "100%", background: BG,
          borderTopLeftRadius: 26, borderTopRightRadius: 26, boxShadow: SOFT_SHADOW_LG,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* つまみ+見出し(ここを下へ引くと閉じる) */}
          <div onPointerDown={onGrabDown} onPointerMove={onGrabMove} onPointerUp={endGrab} onPointerCancel={endGrab}
            style={{ padding: "10px 20px 6px", flexShrink: 0, touchAction: "none", cursor: "grab" }}>
            <div style={{ width: 40, height: 4, borderRadius: 999, background: "rgba(26,26,24,0.18)", margin: "0 auto 14px" }} />
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 22, color: INK }}>ダッシュボード</div>
              <div style={{ fontSize: 11, letterSpacing: "0.1em", color: MUTED, fontWeight: 700 }}>{todayLabel()}</div>
            </div>
          </div>

          {/* 中身(スクロール) */}
          <div className="no-scrollbar" style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "16px 16px 8px" }}>
            <section style={{ marginBottom: 26 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <SectionLabel count={entries.length}>選んでいるカード</SectionLabel>
                {entries.length > 0 && (
                  <button onClick={() => { haptic(6); onClearSelection(); }} style={{
                    border: "none", background: "transparent", cursor: "pointer", fontFamily: SANS,
                    fontSize: 11, fontWeight: 700, color: MUTED, padding: "0 4px 10px",
                  }}>すべて外す</button>
                )}
              </div>
              {entries.length === 0 ? (
                <p style={{ fontSize: 11.5, lineHeight: 1.9, color: MUTED, margin: "0 4px" }}>
                  ストックやプランでカードを選ぶと、ここに集まります。
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {entries.map((it) => (
                    <SelectedRow key={it.id} title={it.title} image={it.images?.[0]} color={it.color} onRemove={() => onToggleItem(it.id)} />
                  ))}
                </div>
              )}
            </section>

            <section>
              <SectionLabel count={todaysTasks.length}>今日のタスク</SectionLabel>
              {todaysTasks.length === 0 ? (
                <p style={{ fontSize: 11.5, lineHeight: 1.9, color: MUTED, margin: "0 4px" }}>
                  今日のタスクはありません。
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {todaysTasks.map((t) => <TaskRow key={t.id} task={t} onToggle={onToggleTask} />)}
                </div>
              )}
            </section>
          </div>

          {/* 締めの操作。1日をここで終える。 */}
          <div style={{ flexShrink: 0, padding: "12px 16px max(16px, env(safe-area-inset-bottom))", borderTop: `1px solid ${HAIRLINE}` }}>
            <button
              onClick={() => { if (!canFinish) return; haptic(16); onFinishDay(); }}
              disabled={!canFinish}
              style={{
                width: "100%", padding: "15px 0", borderRadius: 999, border: "none",
                cursor: canFinish ? "pointer" : "default",
                background: canFinish ? INK : "rgba(26,26,24,0.18)", color: PAPER,
                fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              <Check size={15} strokeWidth={2.6} />
              今日を終える
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(body, document.body);
}

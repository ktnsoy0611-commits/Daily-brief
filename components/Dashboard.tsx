"use client";

import { Bookmark, Check, X } from "lucide-react";
import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { TaskRow } from "@/components/tabs/TasksTab";
import type { AppDef } from "@/lib/apps";
import { BG, HAIRLINE, INK, MUTED, NAV_BOTTOM_GAP, PAPER, RUST, SANS, SOFT_SHADOW, SOFT_SHADOW_LG } from "@/lib/constants";
import { haptic, img, todayKey, todayLabel } from "@/lib/helpers";
import type { AppState, PlanSelection, TabId } from "@/lib/types";

// ★ダッシュボード。画面下から引き上げて呼び出す、3つのアプリ共通の引き出し。
// 「いま選んでいるカード」と「その日のタスク」を1枚で見渡し、下部の丸ボタンで
// 1日を締める(選んだカードは実行済みとしてアーカイブのバインダーへ)。
//
// ★2026-08-02: 動きを作り直した。以前は「上へ44px引いたら開く」という離散的な
// しきい値で、300msかけてシートが飛び出すだけだった(指の動きと繋がっておらず
// カクついて見える)。いまは **進捗 progress(0..1) が指の位置と1対1で繋がって
// いる**。AppShellがこの値を持ち、タブバーの上ドラッグとこのシートの取手の
// 下ドラッグが同じ値を動かすので、開ける動きと閉じる動きが完全に対称になる。
//
// そして **掴んだタブバーがそのままシートの取手になる**: 引き上げるほどピルが
// 縮み、シートの上端に乗ったまま持ち上がって、最後は40x5の取手になる。
// 実装上は、本物のnav(スクロールルートの中のsticky)をportal(zIndex 55)の
// シートより手前に出すことはできないので、progress>0 の間だけ本物のnavを
// 透明にし、こちら側に同じ見た目のピルを描いて入れ替えている。入れ替えは
// progress≒0(見た目が同一)の瞬間なので継ぎ目は出ない(バインダーの表紙で
// 使ったのと同じ手)。
//
// createPortalでdocument.body直下に描くのは、nav(zIndex:25)やタブ側の
// stickyが作る重なりコンテキストの影響を受けないようにするため(全画面の
// オーバーレイでこのプロジェクトが繰り返し踏んできた問題への定石)。

// 引き出しの高さ(画面に対する割合)。上に元の画面が少し覗く。
export const SHEET_HEIGHT = "88svh";
const ANIM_MS = 340;
// タブバーのピルの、開く前(=定位置)の高さ。
const PILL_H = 64;
// 取手になりきったときの寸法。
const HANDLE_W = 40;
const HANDLE_H = 5;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// 2色の間を線形に混ぜる(#rrggbb限定)。ピルの紙色→取手の灰色の遷移用。
function mixHex(a: string, b: string, t: number): string {
  const rd = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const [r1, g1, b1] = rd(a);
  const [r2, g2, b2] = rd(b);
  const to = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${to(lerp(r1, r2, t))}${to(lerp(g1, g2, t))}${to(lerp(b1, b2, t))}`;
}
// 取手の色(BGの上に rgba(26,26,24,0.18) を重ねたのと同じ見え方)。
const HANDLE_COLOR = "#C6C6C4";

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

export function Dashboard({ appState, selection, app, tab, progress, dragging, onDrag, onSettle, onToggleItem, onClearSelection, onToggleTask, onFinishDay }: {
  appState: AppState;
  selection: PlanSelection;
  // 掴まれたタブバーの見た目を再現するために、いまのアプリとタブを受け取る。
  app: AppDef;
  tab: TabId;
  progress: number;
  dragging: boolean;
  onDrag: (p: number) => void;
  onSettle: (open: boolean) => void;
  onToggleItem: (id: string) => void;
  onClearSelection: () => void;
  onToggleTask: (id: string) => void;
  onFinishDay: () => void;
}) {
  const p = clamp01(progress);
  // 取手を下へ引いて閉じる。上のタブバーから引き上げるのと同じ progress を
  // 動かすので、開ける動きと閉じる動きが完全に対称になる。
  const grabRef = useRef<{ id: number; y: number; from: number; travel: number } | null>(null);
  const onGrabDown = (e: ReactPointerEvent) => {
    grabRef.current = { id: e.pointerId, y: e.clientY, from: p, travel: Math.max(200, window.innerHeight * 0.88) };
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* 合成イベントでは失敗しうる */ }
  };
  const onGrabMove = (e: ReactPointerEvent) => {
    const g = grabRef.current;
    if (!g || g.id !== e.pointerId) return;
    onDrag(clamp01(g.from - (e.clientY - g.y) / g.travel));
  };
  const endGrab = () => {
    if (!grabRef.current) return;
    grabRef.current = null;
    onSettle(p >= 0.65);
  };

  const entries = selection.itemIds
    .map((id) => appState.items.find((x) => x.id === id))
    .filter((x): x is NonNullable<typeof x> => !!x);
  const today = todayKey();
  const todaysTasks = (appState.tasks ?? []).filter((t) => t.dueDate === today);
  const canFinish = entries.length > 0 || todaysTasks.length > 0;

  // ピル→取手のモーフ。形は最後まで使い、中身(アイコン・右の丸ボタン)は
  // もっと早く消す(縮んだ器に文字が詰まって見えないように)。
  const shape = clamp01(p / 0.72);
  const icons = clamp01(1 - p / 0.22);
  const write = clamp01(1 - p / 0.16);
  const ease = shape * shape * (3 - 2 * shape); // smoothstep
  const pillH = lerp(PILL_H, HANDLE_H, ease);
  const trans = dragging ? "none" : `${ANIM_MS}ms cubic-bezier(0.32,0.72,0,1)`;

  const body = (
    <div style={{ position: "fixed", inset: 0, zIndex: 55, pointerEvents: p > 0.02 ? "auto" : "none" }}>
      {/* 背景。タップで閉じる。 */}
      <div
        onPointerDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); onSettle(false); } }}
        style={{
          position: "absolute", inset: 0,
          background: `rgba(16,16,20,${0.34 * p})`,
          backdropFilter: `blur(${14 * p}px) saturate(${1 + 0.3 * p})`,
          WebkitBackdropFilter: `blur(${14 * p}px) saturate(${1 + 0.3 * p})`,
          transition: dragging ? "none" : `background ${ANIM_MS}ms ease, backdrop-filter ${ANIM_MS}ms ease, -webkit-backdrop-filter ${ANIM_MS}ms ease`,
        }}
      />
      {/* 引き出し本体。下端に貼り付き、上端だけ角丸。progressで下から出る。 */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0, height: SHEET_HEIGHT,
        display: "flex", flexDirection: "column", alignItems: "center",
        transform: `translateY(${(1 - p) * 100}%)`,
        transition: dragging ? "none" : `transform ${trans}`,
      }}>
        <div style={{
          width: "100%", maxWidth: 420, height: "100%", background: BG,
          borderTopLeftRadius: 26, borderTopRightRadius: 26, boxShadow: SOFT_SHADOW_LG,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* 取手が乗るぶんの余白。取手自体は下のモーフ用ピルが担う。 */}
          <div style={{ height: 26, flexShrink: 0 }} />
          <div style={{ padding: "0 20px 6px", flexShrink: 0 }}>
            <div style={{ fontFamily: SANS, fontSize: 11, letterSpacing: "0.22em", color: MUTED, fontWeight: 700 }}>{todayLabel()}</div>
          </div>

          {/* 中身(スクロール) */}
          <div className="no-scrollbar" style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "10px 16px 8px" }}>
            <section style={{ marginBottom: 26 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 4px 10px" }}>
                {/* 見出しの言葉は置かず、アイコン＋数字だけで何の集まりかを示す。 */}
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Bookmark size={15} strokeWidth={2.2} color={MUTED} />
                  <span style={{ fontFamily: SANS, fontSize: 26, fontWeight: 800, color: entries.length ? INK : MUTED, lineHeight: 1 }}>{entries.length}</span>
                </span>
                {entries.length > 0 && (
                  <button onClick={() => { haptic(6); onClearSelection(); }} aria-label="すべて外す" style={{
                    width: 28, height: 28, borderRadius: "50%", border: "none", cursor: "pointer",
                    background: "rgba(193,80,46,0.12)", color: RUST, display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                  }}><X size={14} strokeWidth={2.4} /></button>
                )}
              </div>
              {entries.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {entries.map((it) => (
                    <SelectedRow key={it.id} title={it.title} image={it.images?.[0]} color={it.color} onRemove={() => onToggleItem(it.id)} />
                  ))}
                </div>
              )}
            </section>

            <section>
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 4px 10px" }}>
                <Check size={15} strokeWidth={2.6} color={MUTED} />
                <span style={{ fontFamily: SANS, fontSize: 26, fontWeight: 800, color: todaysTasks.length ? INK : MUTED, lineHeight: 1 }}>{todaysTasks.length}</span>
              </div>
              {todaysTasks.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {todaysTasks.map((t) => <TaskRow key={t.id} task={t} onToggle={onToggleTask} />)}
                </div>
              )}
            </section>
          </div>

          {/* 締めの操作。1日をここで終える。 */}
          <div style={{ flexShrink: 0, padding: "12px 16px max(16px, env(safe-area-inset-bottom))", borderTop: `1px solid ${HAIRLINE}`, display: "flex", justifyContent: "center" }}>
            <button
              onClick={() => { if (!canFinish) return; haptic(16); onFinishDay(); }}
              disabled={!canFinish}
              aria-label="今日を終える"
              style={{
                width: 60, height: 60, borderRadius: "50%", border: "none",
                cursor: canFinish ? "pointer" : "default",
                background: canFinish ? INK : "rgba(26,26,24,0.14)", color: PAPER,
                display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                boxShadow: canFinish ? SOFT_SHADOW_LG : "none",
              }}
            >
              <Check size={24} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      </div>

      {/* ★掴んだタブバー。引き上げるほど縮んで、シートの上端に乗ったまま
          持ち上がり、最後は取手になる。位置は「シートの上端の少し内側」で、
          定位置(navのある高さ)より下には行かない。 */}
      <div
        data-dash-handle
        onPointerDown={onGrabDown}
        onPointerMove={onGrabMove}
        onPointerUp={endGrab}
        onPointerCancel={endGrab}
        style={{
          position: "absolute", left: "50%",
          bottom: `max(${NAV_BOTTOM_GAP}, calc(${p} * ${SHEET_HEIGHT} - ${pillH + 12}px))`,
          transform: "translateX(-50%)",
          width: "100%", maxWidth: 420 - 32, display: "flex", alignItems: "center", gap: 10 * write,
          touchAction: "none", cursor: "grab",
          transition: dragging ? "none" : `bottom ${trans}`,
        }}
      >
        <div style={{
          position: "relative", display: "flex", overflow: "hidden",
          // 幅は「タブバーいっぱい」から取手の40pxへ。縮むぶん左に余白を足して
          // 最後は中央に収まるようにする。
          flexGrow: 0, flexShrink: 0,
          width: `calc(${lerp(100, 0, ease)}% + ${HANDLE_W * ease}px)`,
          height: pillH,
          marginLeft: `${lerp(0, 50, ease)}%`,
          transform: `translateX(${-HANDLE_W * ease * 0.5}px)`,
          background: mixHex(PAPER, HANDLE_COLOR, ease),
          borderRadius: 999, boxShadow: `0 2px 7px rgba(26,26,24,${0.14 * (1 - ease)})`,
          padding: 6 * (1 - ease),
          transition: dragging ? "none" : `all ${trans}`,
        }}>
          {app.tabs.map((t) => (
            <div key={t.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, opacity: icons, minWidth: 0 }}>
              <div style={{ width: 44, height: 28, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", background: tab === t.id ? INK : "transparent", flexShrink: 0 }}>
                <t.Icon size={19} strokeWidth={1.8} color={tab === t.id ? PAPER : "rgba(26,26,24,0.38)"} />
              </div>
              <span style={{ fontFamily: SANS, fontSize: 9.5, color: tab === t.id ? INK : "rgba(26,26,24,0.38)", fontWeight: tab === t.id ? 700 : 400 }}>{t.label}</span>
            </div>
          ))}
        </div>
        {/* 右の丸ボタンは早めに消える(取手には要らない)。 */}
        <div style={{
          flexShrink: 0, width: 52 * write, height: 52 * write, borderRadius: "50%", background: INK,
          opacity: write, transition: dragging ? "none" : `all ${trans}`,
        }} />
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(body, document.body);
}

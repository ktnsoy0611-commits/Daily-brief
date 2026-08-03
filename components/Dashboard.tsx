"use client";

import { Bookmark, Check, X } from "lucide-react";
import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { TaskRow } from "@/components/tabs/TasksTab";
import type { AppDef } from "@/lib/apps";
import { BG, HAIRLINE, INK, MUTED, NAV_BOTTOM_GAP, PAPER, RUST, SANS, SOFT_SHADOW, SOFT_SHADOW_LG, TAB_MARK_H, TAB_MARK_W } from "@/lib/constants";
import { haptic, img, todayKey, todayLabel } from "@/lib/helpers";
import type { AppState, PlanSelection, TabId } from "@/lib/types";

// ★ダッシュボード。画面下から引き上げて呼び出す、3つのアプリ共通の引き出し。
// 「いま選んでいるカード」と「その日のタスク」を1枚で見渡し、下部の丸ボタンで
// 1日を締める(選んだカードは実行済みとしてアーカイブのバインダーへ)。
//
// ★2026-08-02(第2弾): 開き具合を **CSSカスタムプロパティ --dash(0〜1)** で
// 駆動するように作り替えた。第1弾ではこれをReactのstateに持っていたため、
// 指を動かすたびにシェル全体が再レンダーされ、「挙動が悪い・操作しづらい」の
// 主因になっていた。いまはポインタのハンドラが documentElement へ --dash を
// 書くだけで、このコンポーネントは1回も再レンダーされない。位置・寸法・
// 不透明度はすべて calc() で --dash から導いている。
// 指を離したときは data-dash-dragging を外すだけで、globals.css の
// transition が最終値まで運ぶ(カスタムプロパティ自体のtransitionには
// @property の登録が要るので、そこには頼っていない)。
//
// 掴んだタブバーがそのままシートの取手になる、という第1弾の設計は維持:
// 引き上げるほどピルが縮み、シートの上端に乗ったまま持ち上がって取手になる。
// 本物のnavは globals.css の [data-dash-active="1"] .app-nav で消える。
//
// 閉じやすさ(ユーザー指定の3点):
//   1. 上端の帯(高さGRIP_H・幅いっぱい)のどこを掴んでも引き下げられる
//   2. 下へ速く払えば、距離が足りなくても即閉じる
//   3. シートの外(上に覗いている元の画面)をタップすると閉じる
//      ——シートを84svhに下げて、その領域を広げてある
//
// createPortalでdocument.body直下に描くのは、nav(zIndex:25)やタブ側の
// stickyが作る重なりコンテキストの影響を受けないようにするため(全画面の
// オーバーレイでこのプロジェクトが繰り返し踏んできた問題への定石)。

// 引き出しの高さ(画面に対する割合)。AppShellのDASH_SHEET_RATIOと揃えること。
const SHEET_RATIO = 0.84;
const SHEET_HEIGHT = `${SHEET_RATIO * 100}svh`;
// 掴み代の高さ。取手そのものは40x5だが、この帯のどこを掴んでも引ける。
const GRIP_H = 56;
// タブバーのピルの高さ。AppShell の TAB_SQUARE + 上下の余白と必ず揃える。
const PILL_H = TAB_MARK_H + 6 * 2;
const HANDLE_W = 40;
const HANDLE_H = 5;
// 下へこの速さで払ったら、距離に関わらず閉じる(px/ms)。
const FLICK = 0.45;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// --dash からピルの高さを出す式。位置の計算でも使い回す。
const PILL_H_EXPR = `calc(${PILL_H}px - var(--dash, 0) * ${PILL_H - HANDLE_H}px)`;

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

export function Dashboard({ appState, selection, app, tab, onDrag, onSettle, onToggleItem, onClearSelection, onToggleTask, onFinishDay }: {
  appState: AppState;
  selection: PlanSelection;
  // 掴まれたタブバーの見た目を再現するために、いまのアプリとタブを受け取る。
  app: AppDef;
  tab: TabId;
  // 進捗(0〜1)をCSS変数へ書く。Reactのstateは経由しない。
  onDrag: (p: number, dragging: boolean) => void;
  onSettle: (open: boolean) => void;
  onToggleItem: (id: string) => void;
  onClearSelection: () => void;
  onToggleTask: (id: string) => void;
  onFinishDay: () => void;
}) {
  // 取手(上端の帯)を下へ引いて閉じる。上のタブバーから引き上げるのと同じ
  // --dash を動かすので、開ける動きと閉じる動きが完全に対称になる。
  const grabRef = useRef<{ id: number; y: number; t: number; from: number; travel: number; last: number; lastT: number; v: number } | null>(null);
  const readDash = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dash")) || 0;

  const onGrabDown = (e: ReactPointerEvent) => {
    const from = readDash();
    grabRef.current = { id: e.pointerId, y: e.clientY, t: performance.now(), from, travel: Math.max(200, window.innerHeight * SHEET_RATIO), last: e.clientY, lastT: performance.now(), v: 0 };
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* 合成イベントでは失敗しうる */ }
  };
  const onGrabMove = (e: ReactPointerEvent) => {
    const g = grabRef.current;
    if (!g || g.id !== e.pointerId) return;
    const now = performance.now();
    if (now > g.lastT) g.v = (e.clientY - g.last) / (now - g.lastT);
    g.last = e.clientY; g.lastT = now;
    onDrag(clamp01(g.from - (e.clientY - g.y) / g.travel), true);
  };
  const endGrab = () => {
    const g = grabRef.current;
    if (!g) return;
    grabRef.current = null;
    // 下へ速く払ったら距離に関わらず閉じる。上へ払ったら開く。
    if (g.v >= FLICK) { onSettle(false); return; }
    if (g.v <= -FLICK) { onSettle(true); return; }
    onSettle(readDash() >= 0.55);
  };

  const entries = selection.itemIds
    .map((id) => appState.items.find((x) => x.id === id))
    .filter((x): x is NonNullable<typeof x> => !!x);
  const today = todayKey();
  const todaysTasks = (appState.tasks ?? []).filter((t) => t.dueDate === today);
  const canFinish = entries.length > 0 || todaysTasks.length > 0;

  const body = (
    <div style={{ position: "fixed", inset: 0, zIndex: 55 }}>
      {/* 背景。上に覗いている元の画面(=シートの外)をタップすると閉じる。
          シートを84svhにして、この帯を広めに取ってある。 */}
      <div
        className="dash-scrim"
        onPointerDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); onSettle(false); } }}
        style={{
          position: "absolute", inset: 0,
          background: "rgba(16,16,20,0.34)",
          opacity: "var(--dash, 0)",
          backdropFilter: "blur(14px) saturate(1.3)",
          WebkitBackdropFilter: "blur(14px) saturate(1.3)",
        }}
      />
      {/* 引き出し本体。下端に貼り付き、上端だけ角丸。--dashで下から出る。 */}
      <div className="dash-sheet" style={{
        position: "absolute", left: 0, right: 0, bottom: 0, height: SHEET_HEIGHT,
        display: "flex", flexDirection: "column", alignItems: "center",
        transform: "translateY(calc(100% - var(--dash, 0) * 100%))",
      }}>
        <div style={{
          width: "100%", maxWidth: 420, height: "100%", background: BG,
          borderTopLeftRadius: 26, borderTopRightRadius: 26, boxShadow: SOFT_SHADOW_LG,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* 取手が乗るぶんの余白。取手自体は下のモーフ用ピルが担う。 */}
          <div style={{ height: GRIP_H - 24, flexShrink: 0 }} />
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
          持ち上がり、最後は取手になる。**この帯全体(高さGRIP_H・幅いっぱい)が
          掴み代**で、取手そのものから離れた場所を掴んでも引き下げられる。 */}
      <div
        data-dash-handle
        className="dash-grip"
        onPointerDown={onGrabDown}
        onPointerMove={onGrabMove}
        onPointerUp={endGrab}
        onPointerCancel={endGrab}
        style={{
          position: "absolute", left: "50%", marginLeft: -210, width: 420, maxWidth: "100vw",
          // 定位置(navの高さ)より下には行かない。開くほどシートの上端へ登る。
          bottom: `max(${NAV_BOTTOM_GAP}, calc(var(--dash, 0) * ${SHEET_HEIGHT} - ${PILL_H_EXPR} - 12px))`,
          height: `max(${GRIP_H}px, ${PILL_H_EXPR})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 16px", touchAction: "none", cursor: "grab",
        }}
      >
        {/* ピル本体。--dash が進むほど幅と高さが縮み、紙色が取手の灰色へ移る。 */}
        <div className="dash-pill" style={{
          position: "relative", display: "flex", overflow: "hidden", flexShrink: 0,
          width: `calc(100% - var(--dash, 0) * (100% - ${HANDLE_W}px))`,
          height: PILL_H_EXPR,
          background: "rgba(26,26,24,0.18)",
          borderRadius: 999,
        }}>
          {/* 紙色は重ねたこの層の不透明度で消す(色そのものを補間するより軽い)。
              opacityは自動で0〜1にクランプされるので、係数だけで
              「dash 0.7 あたりで消えきる」を表現できる。 */}
          <div className="dash-pill-paper" aria-hidden style={{
            position: "absolute", inset: 0, background: PAPER, borderRadius: 999,
            boxShadow: "0 2px 7px rgba(26,26,24,0.14)",
            opacity: "calc(1 - var(--dash, 0) * 1.45)",
          }} />
          <div className="dash-pill-paper" style={{
            position: "relative", display: "flex", width: "100%", padding: 6,
            opacity: "calc(1 - var(--dash, 0) * 4.5)",
          }}>
            {/* 本物のタブバーと同じ「正方形の枠 + 内接する正円」。 */}
            {app.tabs.map((t) => (
              <div key={t.id} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minWidth: 0 }}>
                <div style={{ width: TAB_MARK_W, height: TAB_MARK_H, borderRadius: TAB_MARK_H / 2, display: "flex", alignItems: "center", justifyContent: "center", background: tab === t.id ? INK : "transparent", flexShrink: 0 }}>
                  <t.Icon size={22} strokeWidth={1.8} color={tab === t.id ? PAPER : "rgba(26,26,24,0.38)"} />
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* 右の丸ボタンは早めに消える(取手には要らない)。 */}
        <div className="dash-write" aria-hidden style={{
          flexShrink: 0, borderRadius: "50%", background: INK,
          width: "max(0px, calc(52px - var(--dash, 0) * 325px))",
          height: "max(0px, calc(52px - var(--dash, 0) * 325px))",
          marginLeft: "max(0px, calc(10px - var(--dash, 0) * 62px))",
          opacity: "calc(1 - var(--dash, 0) * 6.25)",
        }} />
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(body, document.body);
}

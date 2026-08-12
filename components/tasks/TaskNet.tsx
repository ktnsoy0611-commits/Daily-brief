"use client";

import { Check, Plus, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { faceFill, foldLight } from "@/components/tasks/PrismSolid";
import { HAIRLINE, INK, MUTED, PAPER, SANS } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import {
  assignFaces, boundsOf, fitTo, lateralCount, prismDraw, prismFaces, prismName,
  withKeyPlaced, withKeyRemoved,
} from "@/lib/prism";
import { FIVE_W_KEYS, FIVE_W_LABEL } from "@/lib/types";
import type { FiveW, FiveWKey, PrismSlot, SubTask, TaskSuggestion, TaskWeight } from "@/lib/types";

// ★展開図。立体をタップすると、パタパタと開いて中身(5W1H)が見える。
// 候補(まだ確定していない)と、確定したタスクの**両方が同じ画面**を使う。
//
// ★折れている最中は canvas に描き、開き切ったところで本物の DOM に差し替える。
// 円柱・半円柱の側面は曲面なので、途中の姿は「面ごとにアフィン変換した DOM」
// では表せない(曲がっているものは平行四辺形にならない)。一方、開き切った
// 状態は完全に平らなので、そこは DOM で作れて文字入力もそのまま置ける。
// これで CSS の 3D 変形(perspective / preserve-3d / rotateX)を一切使わずに
// 済む — このコードベースはそれで Safari の描画崩れを5回踏んでいる。
//
// ★ポータルで document.body 直下へ出す。`.app-track` の中に position:fixed を
// 書くと、祖先の transform が包含ブロックになって画面外へ飛ぶ(§26.1)。

const FOLD_MS = 520;
/** 展開図の器。左右は「＋」を置くぶん空けてある。 */
const NET_H = 300;
const SIDE_PAD = 34;

export interface NetData extends FiveW {
  title: string;
  faces?: Partial<Record<PrismSlot, FiveWKey>>;
  weight?: TaskWeight;
  subtasks?: SubTask[];
  suggestions?: TaskSuggestion[];
}

const WEIGHTS: { v: TaskWeight; label: string }[] = [
  { v: 1, label: "小" }, { v: 2, label: "中" }, { v: 3, label: "大" },
];

const valuesOf = (d: NetData) => ({ when: d.when, where: d.where, who: d.who, why: d.why, how: d.how });

export function TaskNet({ data, mode, autoEdit, onChange, onConfirm, onDelete, onClose }: {
  data: NetData;
  mode: "candidate" | "task";
  /** 開き切ったらすぐ題を入力状態にする(＋で作ったばかりのとき)。 */
  autoEdit?: boolean;
  onChange: (patch: Partial<NetData>) => void;
  onConfirm?: () => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const tRef = useRef(0);
  const dirRef = useRef(1);
  const closedRef = useRef(false);
  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState<PrismSlot | null>(null);
  const [draft, setDraft] = useState("");
  // 「＋」または空白の面をタップしたときに出す、まだ乗っていない項目の選択。
  const [picking, setPicking] = useState<{ slot?: PrismSlot; end?: "left" | "right" } | null>(null);
  const [size, setSize] = useState({ w: 358, h: NET_H });

  const values = valuesOf(data);
  const { faceCount, assigns } = useMemo(
    () => assignFaces(values, data.faces, data.title),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.when, data.where, data.who, data.why, data.how, data.faces, data.title],
  );
  const usedKeys = assigns.map((a) => a.key).filter(Boolean) as FiveWKey[];
  const freeKeys = FIVE_W_KEYS.filter((k) => !usedKeys.includes(k));

  // 展開図(t=1)の大きさで倍率を決め、折りたたみの途中もその倍率のままにする
  // (途中で拡大率が動くと、開くというより寄っていくように見えてしまう)。
  const layout = useMemo(() => {
    const flat = prismFaces(faceCount, 1);
    const w = Math.max(size.w - SIDE_PAD * 2, 80);
    const { scale } = fitTo(boundsOf(flat), w, size.h, 6);
    const fit = fitTo(boundsOf(flat), size.w, size.h, 0, scale);
    return {
      scale,
      faces: flat.map((f) => {
        const pts = f.points.map((p) => ({ x: p.x * scale + fit.dx, y: p.y * scale + fit.dy }));
        const xs = pts.map((p) => p.x);
        const ys = pts.map((p) => p.y);
        const bx = Math.min(...xs), by = Math.min(...ys);
        const bw = Math.max(...xs) - bx, bh = Math.max(...ys) - by;
        return {
          slot: f.slot, light: f.light, left: bx, top: by, width: bw, height: bh,
          clip: `polygon(${pts.map((p) => `${(((p.x - bx) / bw) * 100).toFixed(2)}% ${(((p.y - by) / bh) * 100).toFixed(2)}%`).join(",")})`,
        };
      }),
    };
  }, [faceCount, size.w, size.h]);

  // 器の実測。
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      // 値が同じなら更新しない(毎フレームの再レンダーを避ける)。
      setSize((cur) => (Math.abs(cur.w - r.width) < 0.5 && Math.abs(cur.h - r.height) < 0.5 ? cur : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 折りたたみ。canvas へ直接描く(Reactのstateは開き切った/閉じ切った時だけ動かす)。
  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { w, h } = size;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const t = tRef.current;
    const faces = prismDraw(faceCount, t);
    const fit = fitTo(boundsOf(faces), w, h, 0, layout.scale);
    for (const f of faces) {
      ctx.beginPath();
      f.points.forEach((p, i) => {
        const x = p.x * layout.scale + fit.dx;
        const y = p.y * layout.scale + fit.dy;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
      const fill = faceFill(foldLight(f.light, t));
      ctx.fillStyle = fill;
      ctx.strokeStyle = fill;
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
    }
  }, [faceCount, layout.scale, size]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(now - last, 48);
      last = now;
      const next = tRef.current + (dirRef.current * dt) / FOLD_MS;
      tRef.current = Math.max(0, Math.min(1, next));
      draw();
      if (dirRef.current > 0 && tRef.current >= 1) { setOpened(true); return; }
      if (dirRef.current < 0 && tRef.current <= 0) { onClose(); return; }
      raf = requestAnimationFrame(step);
    };
    if (!opened) raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [opened, draw, onClose]);

  // ＋で作ったばかりのものは、開き切ったところで題の入力へ入る。
  const autoEditedRef = useRef(false);
  useEffect(() => {
    if (!opened || !autoEdit || autoEditedRef.current) return;
    autoEditedRef.current = true;
    setDraft(data.title);
    setEditing("base0");
  }, [opened, autoEdit, data.title]);

  const beginClose = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    dirRef.current = -1;
    setEditing(null);
    setPicking(null);
    setOpened(false);
  }, []);

  const commit = () => {
    if (!editing) return;
    const a = assigns.find((x) => x.slot === editing);
    if (!a) { setEditing(null); return; }
    const v = draft.trim();
    if (a.key === null) onChange({ title: v || data.title });
    else onChange({ [a.key]: v } as Partial<NetData>);
    setEditing(null);
  };

  const addKey = (key: FiveWKey) => {
    haptic(8);
    const p = picking;
    setPicking(null);
    if (!p) return;
    if (p.slot) {
      // 空白の面へ入れる。その面にそのまま乗るよう、置き場所を明示する。
      onChange({ faces: { ...(data.faces ?? {}), [p.slot]: key } });
      setDraft("");
      setEditing(p.slot);
      return;
    }
    const faces = withKeyPlaced(values, data.faces, data.title, key, p.end ?? "right");
    onChange({ faces });
    const slot = (Object.keys(faces) as PrismSlot[]).find((s) => faces[s] === key);
    setDraft("");
    if (slot) setEditing(slot);
  };

  const removeKey = (key: FiveWKey) => {
    haptic(8);
    onChange({ faces: withKeyRemoved(values, data.faces, data.title, key), [key]: undefined } as Partial<NetData>);
  };

  const adopt = (s: TaskSuggestion) => {
    haptic(10);
    onChange({
      subtasks: [...(data.subtasks ?? []), { id: `sub-${Date.now()}`, title: s.title, done: false, fromSuggestion: true }],
      suggestions: (data.suggestions ?? []).filter((x) => x.id !== s.id),
    });
  };

  const lat = layout.faces.filter((f) => f.slot.startsWith("side"));
  const bandLeft = Math.min(...lat.map((f) => f.left));
  const bandRight = Math.max(...lat.map((f) => f.left + f.width));
  const bandMid = lat[0] ? lat[0].top + lat[0].height / 2 : size.h / 2;
  const canGrow = faceCount < 6 && freeKeys.length > 0;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 57, display: "flex", flexDirection: "column" }}>
      <div
        onPointerDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); beginClose(); } }}
        style={{ position: "absolute", inset: 0, background: "rgba(16,16,20,0.55)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
      />

      <div style={{ position: "relative", flex: 1, minHeight: 0, overflowY: "auto", padding: "max(18px, env(safe-area-inset-top)) 16px 16px" }}>
        {/* 見出し。いま何という立体なのか(=どれだけ決まっているか)を出す。 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 10, letterSpacing: "0.18em", fontWeight: 700, color: "rgba(255,255,255,0.72)" }}>
            {prismName(faceCount)}・{faceCount}面
          </span>
          <button onClick={beginClose} aria-label="閉じる" style={{
            width: 34, height: 34, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.3)",
            background: "transparent", color: PAPER, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}><X size={16} strokeWidth={2.2} /></button>
        </div>

        {/* 立体 ⇄ 展開図。 */}
        <div ref={wrapRef} style={{ position: "relative", width: "100%", height: NET_H }}>
          <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: opened ? 0 : 1 }} />
          {opened && (
            <>
              {layout.faces.map((f) => {
                const a = assigns.find((x) => x.slot === f.slot);
                if (!a) return null;
                const isTitle = a.key === null;
                const label = isTitle ? "なにを" : a.key ? FIVE_W_LABEL[a.key] : null;
                const isEditing = editing === f.slot;
                return (
                  <div key={f.slot} style={{
                    position: "absolute", left: f.left, top: f.top, width: f.width, height: f.height,
                    transition: "left 300ms ease, top 300ms ease, width 300ms ease, height 300ms ease",
                  }}>
                    <div style={{ position: "absolute", inset: 0, background: faceFill(foldLight(f.light, 1)), clipPath: f.clip }} />
                    <button
                      onClick={() => {
                        haptic(6);
                        if (a.key === null || a.key) { setDraft(a.value); setEditing(f.slot); }
                        else setPicking({ slot: f.slot });
                      }}
                      aria-label={label ? `${label}を編集` : "この面に項目を追加"}
                      style={{
                        position: "absolute", inset: 0, border: "none", background: "transparent", cursor: "pointer",
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
                        padding: "6px 8px", opacity: isEditing ? 0 : 1,
                      }}>
                      {label ? (
                        <>
                          <span style={{ fontSize: 8.5, letterSpacing: "0.14em", fontWeight: 700, color: MUTED }}>{label}</span>
                          <span style={{
                            fontFamily: SANS, fontSize: isTitle ? 12.5 : 11, fontWeight: isTitle ? 700 : 600, color: INK,
                            textAlign: "center", lineHeight: 1.35, maxWidth: "84%",
                            overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
                          }}>{a.value || "—"}</span>
                        </>
                      ) : (
                        <Plus size={16} strokeWidth={2.4} color={MUTED} />
                      )}
                    </button>
                    {isEditing && (
                      <input
                        autoFocus value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commit}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        style={{
                          position: "absolute", left: "10%", top: "50%", width: "80%", transform: "translateY(-50%)",
                          background: "transparent", border: "none", borderBottom: `1.5px solid ${INK}`,
                          textAlign: "center", fontFamily: SANS, fontSize: 12, color: INK, outline: "none", padding: "2px 0",
                        }}
                      />
                    )}
                    {/* この面から項目を外す。タイトルの面は外せない。 */}
                    {a.key && !isEditing && (
                      <button onClick={(e) => { e.stopPropagation(); removeKey(a.key as FiveWKey); }}
                        aria-label={`${label}の面を外す`}
                        style={{
                          position: "absolute", right: 2, top: 2, width: 18, height: 18, borderRadius: "50%",
                          border: "none", background: "rgba(26,26,24,0.10)", cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                        }}><X size={10} strokeWidth={2.6} color={MUTED} /></button>
                    )}
                  </div>
                );
              })}

              {/* 帯の両端の「＋」。押すと、まだ乗っていない項目だけが候補に出る。 */}
              {canGrow && (["left", "right"] as const).map((end) => (
                <button key={end} onClick={() => { haptic(8); setPicking({ end }); }}
                  aria-label={end === "left" ? "左に面を足す" : "右に面を足す"}
                  style={{
                    position: "absolute", top: bandMid - 13,
                    left: end === "left" ? bandLeft - 30 : bandRight + 4,
                    width: 26, height: 26, borderRadius: "50%", border: "1px dashed rgba(255,255,255,0.5)",
                    background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                  }}><Plus size={13} strokeWidth={2.4} color="rgba(255,255,255,0.8)" /></button>
              ))}
            </>
          )}
        </div>

        {/* 重要度。大きさ(重要度 × 切迫度)の片方をここで決める。 */}
        <Section label="重要度">
          <div style={{ display: "flex", gap: 8 }}>
            {WEIGHTS.map((w) => {
              const on = (data.weight ?? 2) === w.v;
              return (
                <button key={w.v} onClick={() => { haptic(6); onChange({ weight: w.v }); }} style={{
                  flex: 1, height: 38, borderRadius: 10, cursor: "pointer",
                  border: on ? "none" : "1px solid rgba(255,255,255,0.28)",
                  background: on ? PAPER : "transparent", color: on ? INK : "rgba(255,255,255,0.8)",
                  fontFamily: SANS, fontSize: 12, fontWeight: 700,
                }}>{w.label}</button>
              );
            })}
          </div>
        </Section>

        {/* 手順。AIの提案を採用するとここへ入る。 */}
        {(data.subtasks?.length ?? 0) > 0 && (
          <Section label="手順">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(data.subtasks ?? []).map((s) => (
                <button key={s.id} onClick={() => {
                  haptic(6);
                  onChange({ subtasks: (data.subtasks ?? []).map((x) => x.id === s.id ? { ...x, done: !x.done, doneAt: !x.done ? new Date().toISOString() : undefined } : x) });
                }} style={{
                  display: "flex", alignItems: "center", gap: 9, background: "transparent", border: "none",
                  padding: "4px 2px", cursor: "pointer", textAlign: "left",
                }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                    border: s.done ? "none" : "1.5px solid rgba(255,255,255,0.4)", background: s.done ? PAPER : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{s.done && <Check size={10} strokeWidth={3} color={INK} />}</span>
                  <span style={{
                    fontFamily: SANS, fontSize: 12.5, color: "rgba(255,255,255,0.9)",
                    textDecoration: s.done ? "line-through" : "none",
                  }}>{s.title}</span>
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* AIの付随提案。「新幹線は取った?」など。タップで手順に入る。 */}
        {(data.suggestions?.length ?? 0) > 0 && (
          <Section label="ほかに要るかもしれないこと">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {(data.suggestions ?? []).map((s) => (
                <span key={s.id} style={{
                  display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,0.1)",
                  borderRadius: 999, padding: "7px 6px 7px 12px",
                }}>
                  <button onClick={() => adopt(s)} style={{
                    background: "none", border: "none", padding: 0, cursor: "pointer",
                    fontFamily: SANS, fontSize: 12, color: PAPER, display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <Sparkles size={11} strokeWidth={2.2} />
                    {s.title}
                  </button>
                  <button onClick={() => onChange({ suggestions: (data.suggestions ?? []).filter((x) => x.id !== s.id) })}
                    aria-label={`${s.title}を却下`} style={{
                      width: 18, height: 18, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.14)",
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                    }}><X size={10} strokeWidth={2.6} color="rgba(255,255,255,0.7)" /></button>
                </span>
              ))}
            </div>
          </Section>
        )}
      </div>

      {/* 締め。候補は「タスクにする」で重力の側へ落ちていく。 */}
      <div style={{ position: "relative", flexShrink: 0, display: "flex", gap: 10, padding: "0 16px max(16px, env(safe-area-inset-bottom))" }}>
        {onDelete && (
          <button onClick={() => { haptic(8); onDelete(); }} aria-label={mode === "candidate" ? "この候補を捨てる" : "このタスクを消す"} style={{
            flexShrink: 0, width: 50, height: 50, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.32)",
            background: "transparent", color: PAPER, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}><X size={19} strokeWidth={2.2} /></button>
        )}
        {onConfirm && (
          <button onClick={() => { haptic(16); onConfirm(); }} style={{
            flex: 1, height: 50, borderRadius: 999, border: "none", background: PAPER, color: INK, cursor: "pointer",
            fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            <Check size={16} strokeWidth={2.6} />
            {mode === "candidate" ? "タスクにする" : "完了にする"}
          </button>
        )}
      </div>

      {/* まだ乗っていない項目の選択。 */}
      {picking && (
        <div onPointerDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); setPicking(null); } }}
          style={{ position: "absolute", inset: 0, background: "rgba(10,10,12,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: PAPER, borderRadius: 18, padding: 10, minWidth: 200, display: "flex", flexDirection: "column" }}>
            {freeKeys.map((k) => (
              <button key={k} onClick={() => addKey(k)} style={{
                background: "none", border: "none", padding: "12px 14px", textAlign: "left", cursor: "pointer",
                fontFamily: SANS, fontSize: 14, fontWeight: 600, color: INK,
                borderBottom: `1px solid ${HAIRLINE}`,
              }}>{FIVE_W_LABEL[k]}</button>
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 18 }}>
      <div style={{ fontSize: 9.5, letterSpacing: "0.18em", fontWeight: 700, color: "rgba(255,255,255,0.55)", marginBottom: 8 }}>{label}</div>
      {children}
    </section>
  );
}

export { lateralCount };

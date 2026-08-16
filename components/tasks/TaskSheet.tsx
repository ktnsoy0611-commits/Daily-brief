"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SolidCanvas } from "@/components/tasks/SolidCanvas";
import { BG, INK, MUTED, PAPER, RUST, SANS } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import { nextTag, resolveTag, tagColor, tagInk, tagLabel } from "@/lib/taskTags";
import { specOf } from "@/lib/taskSize";
import { SIDE_LABEL } from "@/lib/types";
import type { SideKey, SubTask, TaskSuggestion, TaskTag, TaskWeight } from "@/lib/types";

// ★タスクの設定画面。**方眼(グリッド)を強調した構成**にする(2026-08-13に
// ユーザー指定、参照画像=Strelka Institute のサイト)。画面いっぱいに RUST の
// 細い罫線を引き、中身はその方眼にぴったり乗せる。
//
//   [WEIGHT] [        いまの図形(プレビュー)        ]
//   [TITLE ] [WHEN] [CONTEXT] [BELONGINGS]
//   [      ] [    ] [       ] [   TAG    ]
//
// 中央の4マスが埋まった数だけ断面の形が 円 → 半円 → 三角 → 四角 と変わる。
// 重要度は図形の高さ、タイトルの文字数は横幅、残っている手順はスラブの枚数。
//
// ★地は他の画面と同じ明るいグレー(BG)。以前はこの画面だけ墨地で、他のUIから
// 浮いていた(ユーザー指摘「なぜかここのUIだけ他のUIと乖離している」)。
// ★OS標準のフォームUI(角丸ボタン・ドロップダウン・標準のテキストボックス・
// 影)は一切使わない。ベタ塗りの幾何学と太字のタイポグラフィだけ。
//
// ★ポータルで document.body 直下へ出す。`.app-track` の中に position:fixed を
// 書くと、祖先の transform が包含ブロックになって画面外へ飛ぶ(§26.1)。

const OPEN_MS = 340;
const DISMISS = 96;
/** 方眼のマスの大きさ。画面幅から4列ぶんを取ったときの1マス。 */
const GRID = 4;
/** 罫線。参照画像と同じ「細い赤」を、アプリが既に持つアクセント色でやる。 */
const RULE = RUST;
const RULE_W = 1;

export interface SheetData {
  /** タスク/候補の id。書体とタグの割り当ての種になる(図形の見た目を
   *  重力タブ・候補タブと一致させるために要る)。 */
  id?: string;
  title: string;
  when?: string;
  context?: string;
  belongings?: string;
  /** Free Text。形には影響しない。 */
  note?: string;
  weight?: TaskWeight;
  tag?: TaskTag;
  subtasks?: SubTask[];
  suggestions?: TaskSuggestion[];
}

const MIDDLE: SideKey[] = ["title", "when", "context", "belongings"];

export function TaskSheet({ data, mode, from = "bottom", autoEdit, onChange, onConfirm, onDelete, onClose }: {
  data: SheetData;
  mode: "candidate" | "task";
  /** どちらから滑り込むか。候補(DRIFT)は上から、山(GRAVITY)は下から。 */
  from?: "top" | "bottom";
  /** 開いたらすぐ題を入力状態にする(＋で作ったばかりのとき)。 */
  autoEdit?: boolean;
  onChange: (patch: Partial<SheetData>) => void;
  onConfirm?: () => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [editing, setEditing] = useState<SideKey | "note" | null>(autoEdit ? "title" : null);
  const [dragY, setDragY] = useState(0);
  const dragRef = useRef<{ id: number; y0: number } | null>(null);
  const leftRef = useRef(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const close = () => {
    if (leftRef.current) return;
    leftRef.current = true;
    setLeaving(true);
    setShown(false);
    window.setTimeout(onClose, OPEN_MS);
  };

  // 題が空でも図形は出す(円)。プレビューは中身に合わせて作り直る。
  const spec = useMemo(() => specOf({
    title: data.title, when: data.when, context: data.context, belongings: data.belongings,
    weight: data.weight, subtasks: data.subtasks,
  }), [data.title, data.when, data.context, data.belongings, data.weight, data.subtasks]);

  // ★図形は必ずタグの色を持つ。決めていなければ言葉から見立て、それでも
  // 決まらなければ id から決定的に割り当てる(2026-08-16確定)。
  const seed = data.id || "draft";
  const tag = resolveTag(data.tag, seed, data.title, data.when, data.context, data.belongings, data.note);

  const valueOf = (k: SideKey): string => (k === "title" ? data.title : data[k]) ?? "";

  const setValue = (k: SideKey | "note", v: string) => {
    onChange(k === "title" ? { title: v } : ({ [k]: v.trim() || undefined } as Partial<SheetData>));
  };

  const weight = data.weight ?? 2;
  const subtasks = data.subtasks ?? [];

  // 上の帯をつかんで下へ引くと閉じる。
  const onGrab = (e: React.PointerEvent) => { dragRef.current = { id: e.pointerId, y0: e.clientY }; };
  const onGrabMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    setDragY(Math.max(0, e.clientY - d.y0));
  };
  const onGrabEnd = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    dragRef.current = null;
    if (e.clientY - d.y0 > DISMISS) close();
    setDragY(0);
  };

  const hidden = from === "top" ? "-100%" : "100%";
  const sheet = (
    <div
      data-task-sheet
      style={{
        // 方眼の目盛り。NetGrid が実測して上書きするが、初回描画から罫線が
        // 出るよう既定値も持たせておく(★これが無いと var() が不正になり、
        // repeating-linear-gradient ごと描かれない — 実際に一度そうなった)。
        ["--cell" as string]: "89.5px",
        ["--gx" as string]: "16px",
        ["--gy" as string]: "0px",
        position: "fixed", inset: 0, zIndex: 60, background: BG,
        transform: shown && !leaving ? `translateY(${dragY}px)` : `translateY(${hidden})`,
        transition: dragRef.current ? "none" : `transform ${OPEN_MS}ms cubic-bezier(0.16,1,0.3,1)`,
        display: "flex", flexDirection: "column",
        paddingTop: "max(12px, env(safe-area-inset-top))",
      }}
    >
      {/* ★画面いっぱいの方眼。中身はこの目盛りにぴったり乗る。 */}
      <div aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage:
          `repeating-linear-gradient(to right, ${RULE} 0 ${RULE_W}px, transparent ${RULE_W}px var(--cell)),`
          + `repeating-linear-gradient(to bottom, ${RULE} 0 ${RULE_W}px, transparent ${RULE_W}px var(--cell))`,
        backgroundPosition: "var(--gx) 0, 0 var(--gy)",
        opacity: 0.5,
      }} />

      {/* 上の帯。つかんで下へ引くと閉じる。✕は2本の直線だけ。 */}
      <div
        onPointerDown={onGrab} onPointerMove={onGrabMove} onPointerUp={onGrabEnd} onPointerCancel={onGrabEnd}
        style={{
          position: "relative", flexShrink: 0, height: 44, display: "flex", alignItems: "center",
          padding: "0 16px", touchAction: "none",
        }}
      >
        <button onClick={close} aria-label="閉じる" style={{
          width: 24, height: 24, border: "none", background: "transparent", padding: 0, cursor: "pointer", position: "relative",
        }}>
          <span style={{ position: "absolute", left: 1, top: 11, width: 22, height: 1.6, background: INK, transform: "rotate(45deg)" }} />
          <span style={{ position: "absolute", left: 1, top: 11, width: 22, height: 1.6, background: INK, transform: "rotate(-45deg)" }} />
        </button>
        <span style={{
          marginLeft: "auto", fontFamily: SANS, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.24em", color: RULE,
        }}>{mode === "candidate" ? "CANDIDATE" : "TASK"}</span>
      </div>

      <div style={{ position: "relative", flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px 16px" }}>
        <NetGrid>
          {/* 左上 = 重要度。タップ or 縦スワイプで 小→中→大。 */}
          <WeightCell weight={weight} onSet={(w) => { haptic(6); onChange({ weight: w }); }} />

          {/* 右上の空き3マス = いまの図形(山に出るのと同じ絵)。 */}
          <div style={{ gridColumn: "2 / span 3", gridRow: 1, position: "relative" }}>
            <PreviewShape spec={spec} title={data.title} tag={tag} seed={seed} />
          </div>

          {/* 中央4マス = 側面の情報。埋まった数が断面の形になる。 */}
          {MIDDLE.map((k, i) => {
            const v = valueOf(k);
            const on = v.trim() !== "";
            return (
              <button key={k} onClick={() => { haptic(6); setEditing(k); }}
                aria-label={`${SIDE_LABEL[k]}を入力`}
                style={{ gridColumn: i + 1, gridRow: 2, ...cellStyle(on ? PAPER : "transparent") }}>
                <span style={{ ...labelStyle, color: RULE }}>{SIDE_LABEL[k]}</span>
                <span style={{
                  fontFamily: SANS, fontWeight: 700, fontSize: 12.5, lineHeight: 1.3, textAlign: "left",
                  color: on ? INK : MUTED,
                  overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
                }}>{on ? v : "—"}</span>
              </button>
            );
          })}

          {/* 右下 = タグ。タップで5つを循環し、マスの色がそのまま図形の色になる。
              ★「未設定」の見え方は作らない。決めていないものは resolveTag が
              見立てた1つを最初から出す(タグ無しの図形は存在しない・2026-08-16確定)。 */}
          <button onClick={() => { haptic(6); onChange({ tag: nextTag(tag) }); }}
            aria-label="タグを変える"
            style={{ gridColumn: 4, gridRow: 3, ...cellStyle(tagColor(tag)) }}>
            <span style={{ ...labelStyle, color: tagInk(tag), opacity: 0.7 }}>TAG</span>
            <span style={{
              fontFamily: SANS, fontWeight: 700, fontSize: 13, letterSpacing: "0.04em", textAlign: "left",
              color: tagInk(tag),
            }}>{tagLabel(tag)}</span>
          </button>
        </NetGrid>

        {/* ── ここから下は中央4マスの外。断面の形には影響しない。 ── */}

        {/* サブタスク。残っている数だけ図形がスラブ(層)に割れる。 */}
        <Band label="SUBTASKS" hint={`${spec.slabs} SLAB`}>
          {subtasks.map((s) => (
            <button key={s.id}
              onClick={() => {
                haptic(6);
                onChange({
                  subtasks: subtasks.map((x) => x.id === s.id
                    ? { ...x, done: !x.done, doneAt: !x.done ? new Date().toISOString() : undefined }
                    : x),
                });
              }}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "0 12px",
                height: 34, border: "none", cursor: "pointer", textAlign: "left",
                background: s.done ? "transparent" : PAPER,
                boxShadow: s.done ? `inset 0 0 0 ${RULE_W}px ${RULE}` : "none",
              }}>
              {/* スラブそのものの断片。完了すると1枚消える。 */}
              <span style={{ width: 10, height: 14, flexShrink: 0, background: s.done ? "transparent" : INK, boxShadow: s.done ? `inset 0 0 0 ${RULE_W}px ${RULE}` : "none" }} />
              <span style={{
                fontFamily: SANS, fontSize: 12.5, fontWeight: 600,
                color: s.done ? MUTED : INK, textDecoration: s.done ? "line-through" : "none",
              }}>{s.title}</span>
            </button>
          ))}
          <AddSubtask onAdd={(title) => onChange({ subtasks: [...subtasks, { id: `sub-${Date.now()}`, title, done: false }] })} />
        </Band>

        {/* AIの付随提案。タップで手順に入る。 */}
        {(data.suggestions?.length ?? 0) > 0 && (
          <Band label="SUGGESTED">
            {(data.suggestions ?? []).map((s) => (
              <div key={s.id} style={{ display: "flex", height: 34, boxShadow: `inset 0 0 0 ${RULE_W}px ${RULE}` }}>
                <button onClick={() => {
                  haptic(8);
                  onChange({
                    subtasks: [...subtasks, { id: `sub-${Date.now()}`, title: s.title, done: false, fromSuggestion: true }],
                    suggestions: (data.suggestions ?? []).filter((x) => x.id !== s.id),
                  });
                }} style={{
                  flex: 1, border: "none", background: "transparent", cursor: "pointer", textAlign: "left",
                  padding: "0 12px", fontFamily: SANS, fontSize: 12.5, color: INK,
                }}>{s.title}</button>
                <button onClick={() => onChange({ suggestions: (data.suggestions ?? []).filter((x) => x.id !== s.id) })}
                  aria-label={`${s.title}を却下`}
                  style={{ width: 34, border: "none", background: "transparent", cursor: "pointer", position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: 16, width: 11, height: 1.4, background: MUTED, transform: "rotate(45deg)" }} />
                  <span style={{ position: "absolute", left: 12, top: 16, width: 11, height: 1.4, background: MUTED, transform: "rotate(-45deg)" }} />
                </button>
              </div>
            ))}
          </Band>
        )}

        {/* Free Text。形とは無関係のメタ情報。 */}
        <Band label="FREE TEXT">
          <button onClick={() => { haptic(6); setEditing("note"); }} style={{
            width: "100%", minHeight: 44, border: "none", cursor: "pointer", textAlign: "left",
            padding: "11px 12px", background: data.note ? PAPER : "transparent",
            boxShadow: data.note ? "none" : `inset 0 0 0 ${RULE_W}px ${RULE}`,
            fontFamily: SANS, fontSize: 12.5, lineHeight: 1.5, whiteSpace: "pre-wrap",
            color: data.note ? INK : MUTED,
          }}>{data.note || "—"}</button>
        </Band>
      </div>

      {/* 締め。候補は「タスクにする」で重力の側へ落ちていく。角は丸めない。 */}
      <div style={{
        position: "relative", flexShrink: 0, display: "flex", gap: RULE_W,
        padding: "0 16px max(16px, env(safe-area-inset-bottom))",
      }}>
        {onDelete && (
          <button onClick={() => { haptic(8); onDelete(); }}
            aria-label={mode === "candidate" ? "この候補を捨てる" : "このタスクを消す"}
            style={{
              flexShrink: 0, width: 52, height: 52, border: "none", background: "transparent",
              boxShadow: `inset 0 0 0 ${RULE_W}px ${RULE}`, cursor: "pointer", position: "relative",
            }}>
            <span style={{ position: "absolute", left: 17, top: 25, width: 18, height: 1.6, background: INK, transform: "rotate(45deg)" }} />
            <span style={{ position: "absolute", left: 17, top: 25, width: 18, height: 1.6, background: INK, transform: "rotate(-45deg)" }} />
          </button>
        )}
        {onConfirm && (
          <button onClick={() => { haptic(16); onConfirm(); }} style={{
            flex: 1, height: 52, border: "none", background: INK, color: PAPER, cursor: "pointer",
            fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.18em",
          }}>{mode === "candidate" ? "CONFIRM" : "COMPLETE"}</button>
        )}
      </div>

      {editing && (
        <FieldEditor
          label={editing === "note" ? "FREE TEXT" : SIDE_LABEL[editing]}
          multiline={editing === "note"}
          value={editing === "note" ? (data.note ?? "") : valueOf(editing)}
          onDone={(v) => {
            if (editing === "note") onChange({ note: v.trim() || undefined });
            else setValue(editing, v);
            setEditing(null);
          }}
        />
      )}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(sheet, document.body);
}

// ── マス ────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontFamily: SANS, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.18em",
};

/** マスは方眼の1目盛りぴったり。未入力は方眼のまま(地)、入力済みはベタ塗り。 */
const cellStyle = (bg: string): React.CSSProperties => ({
  aspectRatio: "1 / 1", background: bg, border: "none", cursor: "pointer",
  boxShadow: bg === "transparent" ? `inset 0 0 0 ${RULE_W}px ${RULE}` : "none",
  display: "flex", flexDirection: "column", justifyContent: "space-between",
  alignItems: "flex-start", padding: "9px 10px", overflow: "hidden", textAlign: "left",
});

/**
 * 4×3の方眼。★このグリッドの1マスの寸法を CSS変数 `--cell` として外へ配り、
 * 画面いっぱいの方眼の目盛りをこれに一致させる(中身が方眼に乗って見える)。
 */
function NetGrid({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      const r = el.getBoundingClientRect();
      const cell = r.width / GRID;
      const root = el.closest("[data-task-sheet]") as HTMLElement | null;
      if (!root || !cell) return;
      root.style.setProperty("--cell", `${cell}px`);
      // 方眼の位相をマスの左上へ合わせる。
      root.style.setProperty("--gx", `${r.left % cell}px`);
      root.style.setProperty("--gy", `${r.top % cell}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} style={{
      display: "grid", gridTemplateColumns: `repeat(${GRID}, 1fr)`, gridTemplateRows: "repeat(3, auto)",
      gap: 0, marginBottom: 22,
    }}>{children}</div>
  );
}

/** 重要度。タップで循環、縦にスワイプしても変わる。指標は積み上がる帯。 */
function WeightCell({ weight, onSet }: { weight: TaskWeight; onSet: (w: TaskWeight) => void }) {
  const startRef = useRef<{ id: number; y: number } | null>(null);
  const step = (d: number) => onSet(Math.min(3, Math.max(1, weight + d)) as TaskWeight);
  return (
    <div
      onPointerDown={(e) => { startRef.current = { id: e.pointerId, y: e.clientY }; }}
      onPointerUp={(e) => {
        const s = startRef.current;
        startRef.current = null;
        if (!s || s.id !== e.pointerId) return;
        const dy = e.clientY - s.y;
        if (dy < -16) step(1);
        else if (dy > 16) step(-1);
        else onSet(((weight % 3) + 1) as TaskWeight);
      }}
      role="button" tabIndex={0} aria-label={`重要度 ${weight} / 3`}
      style={{ gridColumn: 1, gridRow: 1, ...cellStyle(PAPER), touchAction: "none" }}
    >
      <span style={{ ...labelStyle, color: RULE }}>WEIGHT</span>
      {/* 3段の帯。埋まっている段の数が重要度。 */}
      <div style={{ display: "flex", flexDirection: "column-reverse", gap: 3, width: "100%" }}>
        {[1, 2, 3].map((n) => (
          <span key={n} style={{
            height: 4 + n * 2, width: `${44 + n * 18}%`,
            background: n <= weight ? INK : "transparent",
            boxShadow: n <= weight ? "none" : `inset 0 0 0 ${RULE_W}px ${RULE}`,
          }} />
        ))}
      </div>
    </div>
  );
}

/** 方眼の余白に置く、いまの図形。**山に出るのと同じ絵**(FRONT)。 */
function PreviewShape({ spec, title, tag, seed }: {
  spec: ReturnType<typeof specOf>; title: string; tag: TaskTag; seed: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setBox((prev) => (Math.abs(prev.w - r.width) < 0.5 && Math.abs(prev.h - r.height) < 0.5
        ? prev : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {box.w > 8 && box.h > 8 && (
        <SolidCanvas
          w={box.w} h={box.h}
          paint={{ spec, view: "front", tag, title, seed }}
        />
      )}
    </div>
  );
}

function Band({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 7 }}>
        <span style={{ ...labelStyle, fontSize: 9.5, color: RULE }}>{label}</span>
        {hint && <span style={{ ...labelStyle, fontSize: 8, color: MUTED }}>{hint}</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: RULE_W }}>{children}</div>
    </div>
  );
}

function AddSubtask({ onAdd }: { onAdd: (title: string) => void }) {
  const [text, setText] = useState("");
  const commit = () => {
    const v = text.trim();
    if (v) { haptic(6); onAdd(v); }
    setText("");
  };
  return (
    <div style={{ display: "flex", height: 34, boxShadow: `inset 0 0 0 ${RULE_W}px ${RULE}` }}>
      {/* ＋は2本の直線。丸いボタンにはしない。 */}
      <span style={{ width: 34, position: "relative", flexShrink: 0 }}>
        <span style={{ position: "absolute", left: 11, top: 16, width: 12, height: 1.6, background: RULE }} />
        <span style={{ position: "absolute", left: 16, top: 11, width: 1.6, height: 12, background: RULE }} />
      </span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        placeholder="手順を足す"
        style={{
          flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none",
          fontFamily: SANS, fontSize: 12.5, color: INK, paddingRight: 12,
        }}
      />
    </div>
  );
}

/** マスをタップしたときの入力。画面いっぱいに開く。
 *  枠も背景も下線も持たせない — 地の上に文字が乗り、キャレットだけが動く。 */
function FieldEditor({ label, value, multiline, onDone }: {
  label: string; value: string; multiline?: boolean; onDone: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const style: React.CSSProperties = {
    width: "100%", background: "transparent", border: "none", outline: "none", resize: "none",
    fontFamily: SANS, fontSize: multiline ? 17 : 25, fontWeight: 700, lineHeight: 1.42, color: INK,
    padding: 0,
  };
  return (
    <div style={{
      position: "absolute", inset: 0, background: PAPER, zIndex: 3,
      display: "flex", flexDirection: "column",
      padding: "max(24px, env(safe-area-inset-top)) 20px max(16px, env(safe-area-inset-bottom))",
    }}>
      <span style={{ ...labelStyle, fontSize: 9.5, color: RULE, marginBottom: 14 }}>{label}</span>
      {multiline
        ? <textarea ref={ref as React.RefObject<HTMLTextAreaElement>} value={text} onChange={(e) => setText(e.target.value)} rows={8} style={style} />
        : <input ref={ref as React.RefObject<HTMLInputElement>} value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onDone(text); }} style={style} />}
      <button onClick={() => onDone(text)} style={{
        marginTop: "auto", height: 52, border: "none", background: INK, color: PAPER, cursor: "pointer",
        fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.18em",
      }}>DONE</button>
    </div>
  );
}

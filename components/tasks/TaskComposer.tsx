"use client";

import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, TagPicker, TextField, WeightPicker } from "@/components/tasks/ComposerFields";
import { ComposerToolbar, TOOL_LABEL, type ToolKey } from "@/components/tasks/ComposerToolbar";
import { CAP, Popover } from "@/components/tasks/Popover";
import { SolidCanvas } from "@/components/tasks/SolidCanvas";
import { CHARCOAL, PAPER, SANS } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import { resolveTag, tagColor } from "@/lib/taskTags";
import { specOf } from "@/lib/taskSize";
import type { SubTask, TaskSuggestion, TaskTag, TaskWeight } from "@/lib/types";

// ★タスクの入力画面(2026-08-16にユーザー指定で作り直し。旧 TaskSheet.tsx =
// 方眼の展開図は削除した)。1項目ずつマスをタップして全画面のエディタへ、という
// 往復が「1件さっと足す」には重すぎたため、**その場で書ける**構造にする。
//
//   上 … いま作られている図形(入力した情報がそのまま形になる)
//   中 … タイトル欄。**Enter で行を足すと手順(サブタスク)**になる
//   下 … 日付 / メモ / 持ち物 / 重要度 / タグ のツールバー
//
// 図形の対応(lib/taskSize.ts が正):
//   題だけ=円 / ＋日付=半円 / ＋メモ=三角 / ＋持ち物=四角
//   重要度=大きさ / タグ=色と書体 / 手順の数=切れ目の数
//
// ★地はチャコール(CHARCOAL)。声の録音と同じ「いまはこれを書くだけ」の画面。
// ★OS標準のフォームUI(角丸・影・ドロップダウン・標準のカレンダー)は使わない。
// ★ポータルで document.body 直下へ出す(`.app-track` の transform の中に
// position:fixed を書くと画面外へ飛ぶ)。
// ★この要素自身に transform を掛けないこと。掛けるとポップオーバーの
// position:fixed の背面板が同じ理由で壊れる。

/** ★プレビューの倍率の基準(単位)。いちばん大きいタスク(重要度 高 × 今日 =
 *  面積 17.6)が、横に伸びた四角でも収まる幅と、円のときの高さ。 */
const STAGE_SPAN_W = 5.2;
const STAGE_SPAN_H = 4.2;

/** 地の上の文字。 */
const ON_GROUND = PAPER;
const ON_GROUND_DIM = "rgba(250,250,249,0.44)";
const HAIR = "rgba(250,250,249,0.16)";

export interface ComposerData {
  /** タスク/候補の id。タグと書体の割り当ての種になる。 */
  id?: string;
  title: string;
  /** 予定日(YYYY-MM-DD)。2番目の面。 */
  dueDate?: string;
  /** メモ(道具・場所)。3番目の面。 */
  context?: string;
  /** 持ち物。4番目の面。 */
  belongings?: string;
  /** Cowork が書いた補足。形には影響しない(この画面では読むだけ)。 */
  note?: string;
  weight?: TaskWeight;
  tag?: TaskTag;
  subtasks?: SubTask[];
  suggestions?: TaskSuggestion[];
}

const newSub = (title: string): SubTask =>
  ({ id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title, done: false });

export function TaskComposer({ data, mode, onCommit, onConfirm, onDelete, onClose }: {
  data: ComposerData;
  mode: "candidate" | "task";
  /** 途中経過の保存(画面が背面へ回ったときの保険)。 */
  onCommit: (d: ComposerData) => void;
  /** 完了(タスク) / タスクにする(候補)。 */
  onConfirm?: (d: ComposerData) => void;
  onDelete?: () => void;
  /** 閉じる。**最終的な中身を渡す**ので、呼び側はこれを保存する。 */
  onClose: (d: ComposerData) => void;
}) {
  // ★下書きはこの画面が持つ。1文字ごとに親へ返すと、そのたびに保存
  // (localStorage + クラウド)と山の作り直しが走る。確定は閉じるときの1回。
  const [draft, setDraft] = useState<ComposerData>(data);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const set = (p: Partial<ComposerData>) => setDraft((d) => ({ ...d, ...p }));

  const [tool, setTool] = useState<ToolKey | null>(null);
  const [shown, setShown] = useState(false);
  const leftRef = useRef(false);

  const subs = useMemo(() => draft.subtasks ?? [], [draft.subtasks]);
  const weight = draft.weight ?? 2;
  const seed = draft.id || "draft";

  // ★描画は1テンポ遅らせる。1文字ごとに図形を焼き直すと、打っている間ずっと
  // グリフの焼き込みが走る(useDeferredValue はタイピングを優先してくれる)。
  const preview = useDeferredValue(draft);
  const spec = useMemo(() => specOf({
    title: preview.title, dueDate: preview.dueDate,
    context: preview.context, belongings: preview.belongings,
    weight: preview.weight, subtasks: preview.subtasks,
  }), [preview]);
  const tag = resolveTag(preview.tag, seed, preview.title, preview.context, preview.belongings, preview.note);
  // ツールバーの「灯り」は下書き(遅らせない方)のタグで出す。
  const liveTag = resolveTag(draft.tag, seed, draft.title, draft.context, draft.belongings, draft.note);

  useEffect(() => { setShown(true); }, []);

  // 背面へ回るときだけ、保険として途中経過を保存する。
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") onCommit(draftRef.current); };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [onCommit]);

  // ★キーボードの高さ。iOS は position:fixed の要素をキーボードで隠すので、
  // visualViewport の縮み分だけ下の帯を持ち上げる(これしか手が無い)。
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => setKb(Math.max(0, window.innerHeight - (vv.offsetTop + vv.height)));
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => { vv.removeEventListener("resize", apply); vv.removeEventListener("scroll", apply); };
  }, []);

  // ── 行(1行目=題 / 2行目以降=手順)────────────────────────────
  const rowsRef = useRef<(HTMLTextAreaElement | null)[]>([]);
  const wantRef = useRef<{ i: number; caret: number } | null>(null);
  const activeRow = useRef(0);
  const lines = [draft.title, ...subs.map((s) => s.title)];

  // ★開いたら即キーボード。rAF ではなく layout effect で呼ぶ — iOS は
  // 「タップと同じ処理の流れの中」でしかキーボードを開かない。
  useLayoutEffect(() => {
    const el = rowsRef.current[0];
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  useLayoutEffect(() => {
    const w = wantRef.current;
    if (!w) return;
    wantRef.current = null;
    const el = rowsRef.current[w.i];
    if (!el) return;
    el.focus();
    el.setSelectionRange(w.caret, w.caret);
  });

  const setLine = (i: number, v: string) => {
    const text = v.replace(/\n/g, "");
    if (i === 0) set({ title: text });
    else set({ subtasks: subs.map((s, j) => (j === i - 1 ? { ...s, title: text } : s)) });
  };

  /** Enter … その行をキャレットで割り、後ろを次の行(手順)にする。 */
  const splitLine = (i: number, caret: number) => {
    const text = lines[i] ?? "";
    const head = text.slice(0, caret);
    const tail = text.slice(caret);
    const next = [...subs];
    next.splice(i, 0, newSub(tail));
    if (i === 0) set({ title: head, subtasks: next });
    else {
      next[i - 1] = { ...next[i - 1], title: head };
      set({ subtasks: next });
    }
    wantRef.current = { i: i + 1, caret: 0 };
  };

  /** 行頭で Backspace … 前の行とつなげる(空行が残らない)。 */
  const mergeUp = (i: number) => {
    if (i <= 0) return;
    const prev = lines[i - 1] ?? "";
    const text = lines[i] ?? "";
    const next = subs.filter((_, j) => j !== i - 1);
    if (i - 1 === 0) set({ title: prev + text, subtasks: next });
    else {
      next[i - 2] = { ...next[i - 2], title: prev + text };
      set({ subtasks: next });
    }
    wantRef.current = { i: i - 1, caret: prev.length };
  };

  const toggleSub = (id: string) => {
    haptic(6);
    set({
      subtasks: subs.map((s) => (s.id === id
        ? { ...s, done: !s.done, doneAt: !s.done ? new Date().toISOString() : undefined }
        : s)),
    });
  };

  // ── ポップオーバー ──────────────────────────────────────────
  const openTool = (k: ToolKey) => {
    if (tool === k) { closeTool(); return; }
    // 日付・重要度・タグはキーボードが要らないので下げる。
    if (k !== "context" && k !== "belongings") (document.activeElement as HTMLElement | null)?.blur();
    setTool(k);
  };
  const closeTool = () => {
    const k = tool;
    setTool(null);
    if (k === "context" || k === "belongings") return;
    // 閉じたら書いていた行へ戻す(キーボードも戻る)。
    wantRef.current = { i: activeRow.current, caret: (lines[activeRow.current] ?? "").length };
  };

  const close = () => {
    if (leftRef.current) return;
    leftRef.current = true;
    onClose(draftRef.current);
  };

  const filled: Record<ToolKey, boolean> = {
    due: !!draft.dueDate,
    context: !!(draft.context ?? "").trim(),
    belongings: !!(draft.belongings ?? "").trim(),
    weight: draft.weight !== undefined,
    tag: draft.tag !== undefined,
  };

  const view = (
    <div style={{
      position: "fixed", inset: 0, zIndex: 60, background: CHARCOAL,
      display: "flex", flexDirection: "column",
      opacity: shown ? 1 : 0, transition: "opacity 180ms linear",
    }}>
      {/* ── 上のバー。閉じる / 削除 / 完了 は常時ここ。 ── */}
      <div style={{
        flexShrink: 0, display: "flex", alignItems: "center", gap: 4,
        padding: "max(10px, env(safe-area-inset-top)) 14px 8px",
      }}>
        <button onClick={close} aria-label="閉じる" style={{
          width: 40, height: 40, border: "none", background: "transparent", padding: 0,
          cursor: "pointer", position: "relative",
        }}>
          <span style={{ position: "absolute", left: 9, top: 19, width: 22, height: 1.6, background: ON_GROUND, transform: "rotate(45deg)" }} />
          <span style={{ position: "absolute", left: 9, top: 19, width: 22, height: 1.6, background: ON_GROUND, transform: "rotate(-45deg)" }} />
        </button>
        <span style={{ marginLeft: "auto" }} />
        {onDelete && (
          <button onClick={() => { haptic(8); leftRef.current = true; onDelete(); }} style={{
            height: 34, padding: "0 12px", border: "none", background: "transparent",
            boxShadow: `inset 0 0 0 1.5px ${HAIR}`, cursor: "pointer",
            ...CAP, fontSize: 10, color: ON_GROUND_DIM,
          }}>DELETE</button>
        )}
        {onConfirm && (
          <button onClick={() => { haptic(16); leftRef.current = true; onConfirm(draftRef.current); }} style={{
            height: 34, padding: "0 14px", border: "none", background: ON_GROUND,
            cursor: "pointer", ...CAP, fontSize: 10, color: CHARCOAL,
          }}>{mode === "candidate" ? "CONFIRM" : "COMPLETE"}</button>
        )}
      </div>

      {/* ── 図形。入力するそばから形が変わる。 ── */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <ShapeStage spec={spec} title={preview.title} tag={tag} />
      </div>

      {/* ── 下の帯。キーボードのぶんだけ持ち上がる。 ── */}
      <div style={{
        flexShrink: 0, position: "relative", background: CHARCOAL,
        borderTop: `1px solid ${HAIR}`,
        paddingBottom: kb > 0 ? kb : undefined,
        marginBottom: kb > 0 ? undefined : "env(safe-area-inset-bottom)",
      }}>
        {tool && (
          <Popover label={TOOL_LABEL[tool]} onClose={closeTool}>
            {tool === "due" && <Calendar value={draft.dueDate} onPick={(v) => set({ dueDate: v })} />}
            {tool === "context" && (
              <TextField multiline placeholder="どこで・何を使って" value={draft.context ?? ""}
                onChange={(v) => set({ context: v.trim() ? v : undefined })} />
            )}
            {tool === "belongings" && (
              <TextField placeholder="持っていくもの" value={draft.belongings ?? ""}
                onChange={(v) => set({ belongings: v.trim() ? v : undefined })} />
            )}
            {tool === "weight" && <WeightPicker value={weight} onPick={(w) => set({ weight: w })} />}
            {tool === "tag" && <TagPicker value={liveTag} onPick={(t) => set({ tag: t })} />}
          </Popover>
        )}

        {/* Cowork の提案。タップで手順になる。 */}
        {(draft.suggestions?.length ?? 0) > 0 && (
          <div style={{ display: "flex", gap: 2, overflowX: "auto", padding: "10px 14px 0" }}>
            {(draft.suggestions ?? []).map((s) => (
              <span key={s.id} style={{ display: "flex", flexShrink: 0, boxShadow: `inset 0 0 0 1.5px ${HAIR}` }}>
                <button onClick={() => {
                  haptic(8);
                  set({
                    subtasks: [...subs, { ...newSub(s.title), fromSuggestion: true }],
                    suggestions: (draft.suggestions ?? []).filter((x) => x.id !== s.id),
                  });
                }} style={{
                  border: "none", background: "transparent", cursor: "pointer", padding: "0 10px", height: 30,
                  fontFamily: SANS, fontSize: 12.5, color: ON_GROUND, whiteSpace: "nowrap",
                }}>{s.title}</button>
                <button onClick={() => set({ suggestions: (draft.suggestions ?? []).filter((x) => x.id !== s.id) })}
                  aria-label={`${s.title}を却下`}
                  style={{ width: 26, height: 30, border: "none", background: "transparent", cursor: "pointer", position: "relative" }}>
                  <span style={{ position: "absolute", left: 8, top: 14, width: 10, height: 1.4, background: ON_GROUND_DIM, transform: "rotate(45deg)" }} />
                  <span style={{ position: "absolute", left: 8, top: 14, width: 10, height: 1.4, background: ON_GROUND_DIM, transform: "rotate(-45deg)" }} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* 題と手順。1つの縦の並び。 */}
        <div style={{ maxHeight: "38vh", overflowY: "auto", padding: "12px 14px 6px" }}>
          {lines.map((text, i) => (
            <Row
              key={i === 0 ? "title" : subs[i - 1].id}
              ref={(el) => { rowsRef.current[i] = el; }}
              value={text}
              head={i === 0}
              done={i > 0 && subs[i - 1].done}
              onFocus={() => { activeRow.current = i; }}
              onChange={(v) => setLine(i, v)}
              onEnter={(caret) => splitLine(i, caret)}
              onMergeUp={() => mergeUp(i)}
              onToggle={i > 0 ? () => toggleSub(subs[i - 1].id) : undefined}
            />
          ))}
          {draft.note && (
            <p style={{
              margin: "10px 0 0", fontFamily: SANS, fontSize: 12, lineHeight: 1.55,
              color: ON_GROUND_DIM, whiteSpace: "pre-wrap",
            }}>{draft.note}</p>
          )}
        </div>

        <ComposerToolbar
          open={tool} filled={filled} onOpen={openTool}
          on={tagColor(liveTag)} off={ON_GROUND_DIM}
        />
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(view, document.body);
}

// ── 図形の舞台。器の大きさを測って、その中央に1つ描く。 ──
function ShapeStage({ spec, title, tag }: {
  spec: ReturnType<typeof specOf>; title: string; tag: TaskTag;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setBox((p) => (Math.abs(p.w - r.width) < 0.5 && Math.abs(p.h - r.height) < 0.5
        ? p : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} style={{
      position: "absolute", inset: "8px 22px 14px",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {box.w > 8 && box.h > 8 && (
        <SolidCanvas
          w={box.w} h={box.h}
          // ★倍率を固定する。器に目一杯まで拡大すると、重要度や期限を変えても
          // 絵の大きさが変わらず「大きさ = 重要度」が読めなくなる。
          // いちばん大きいタスク(重要度 高 × 今日)がちょうど収まる倍率。
          unit={Math.min(box.w / STAGE_SPAN_W, box.h / STAGE_SPAN_H)}
          paint={{ spec, view: "name", tag, title }}
        />
      )}
    </div>
  );
}

// ── 1行。題は大きく、手順は点つきで小さく。高さは中身に合わせて伸びる。 ──
function Row({ ref, value, head, done, onFocus, onChange, onEnter, onMergeUp, onToggle }: {
  ref: (el: HTMLTextAreaElement | null) => void;
  value: string;
  head: boolean;
  done: boolean;
  onFocus: () => void;
  onChange: (v: string) => void;
  onEnter: (caret: number) => void;
  onMergeUp: () => void;
  onToggle?: () => void;
}) {
  const own = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = own.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minHeight: head ? 34 : 26 }}>
      {!head && (
        // 手順の点。四角のまま(丸めない)。タップで済んだ印になる。
        <button onClick={onToggle} aria-label={done ? "手順を戻す" : "手順を済みにする"} style={{
          width: 18, height: 24, border: "none", background: "transparent", padding: 0,
          cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center",
        }}>
          <span style={{
            width: 7, height: 7,
            background: done ? "transparent" : ON_GROUND,
            boxShadow: done ? `inset 0 0 0 1.5px ${ON_GROUND_DIM}` : "none",
          }} />
        </button>
      )}
      <textarea
        ref={(el) => { own.current = el; ref(el); }}
        value={value}
        rows={1}
        placeholder={head ? "タスクの名前" : "手順"}
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          const el = e.currentTarget;
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter(el.selectionStart ?? el.value.length);
          } else if (e.key === "Backspace" && el.selectionStart === 0 && el.selectionEnd === 0) {
            e.preventDefault();
            onMergeUp();
          }
        }}
        style={{
          flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none",
          resize: "none", overflow: "hidden", padding: 0, borderRadius: 0,
          fontFamily: SANS,
          fontSize: head ? 21 : 15,
          fontWeight: head ? 700 : 500,
          lineHeight: head ? 1.34 : 1.5,
          color: done ? ON_GROUND_DIM : ON_GROUND,
          textDecoration: done ? "line-through" : "none",
        }}
      />
    </div>
  );
}

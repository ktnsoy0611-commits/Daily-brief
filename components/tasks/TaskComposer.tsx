"use client";

import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TagPicker, TextField, WeightPicker } from "@/components/tasks/ComposerFields";
import { SHEET_BODY_H, WhenSheet } from "@/components/tasks/WhenSheet";
import { ComposerToolbar, TOOL_LABEL, type ToolKey } from "@/components/tasks/ComposerToolbar";
import { CAP, keepKeyboard, Popover, Press } from "@/components/tasks/Popover";
import { EditableLine, type LineHandle } from "@/components/tasks/EditableLine";
import { SolidCanvas } from "@/components/tasks/SolidCanvas";
import { CHARCOAL, PAPER, SANS } from "@/lib/constants";
import { pushGround } from "@/lib/ground";
import { haptic } from "@/lib/helpers";
import { resolveTag, tagAccent, tagColor, tagInk } from "@/lib/taskTags";
import { specOf } from "@/lib/taskSize";
import type { SubTask, TaskSuggestion, TaskTag, TaskWeight } from "@/lib/types";

// ★タスクの入力画面(2026-08-16にユーザー指定で作り直し。旧 TaskSheet.tsx =
// 方眼の展開図は削除した)。
//
//   上 … いま作られている図形(入力した情報がそのまま形になる)
//   中 … タイトル欄。**Enter で行を足すと手順(サブタスク)**になる
//   下 … 日付 / メモ / 持ち物 / 重要度 / タグ の丸いボタン5つ
//
// 図形の対応(lib/taskSize.ts が正):
//   題だけ=円 / ＋日付=半円 / ＋メモ=三角 / ＋持ち物=四角
//   重要度=大きさ / タグ=色と書体 / 手順の数=切れ目の数
//
// ★実機で出た問題への対処(2026-08-16・第2巡):
//  1. **器は visualViewport の矩形そのもの**。iOS はキーボードを出すとき
//     ページ側をスクロールして入力欄を見せようとするので、`inset:0` だと
//     画面全体が上へずれて上部が見えなくなる。見えている矩形へ貼り直す。
//  2. **キーボードは閉じない**。日付や重要度を開いてもそのまま。閉じると
//     器の高さが変わってレイアウトが飛ぶ。閉じるのは確定・完了・閉じるだけ。
//  3. **html の地色も墨に**する。届かなかった隙間から明るい地が見えるため
//     (VoiceStudio と同じ手)。
//  4. **角丸と円**でアプリの他の画面に揃える。図形そのものは角を立てたまま。
//
// ★この要素自身に transform を掛けないこと。掛けるとポップオーバーの
// position:fixed の背面板が包含ブロックごと壊れる。

/** ★プレビューの倍率の基準(単位)。いちばん大きいタスク(重要度 高 × 今日 =
 *  面積 17.6)が、横に伸びた四角でも収まる幅と、円のときの高さ。 */
const STAGE_SPAN_W = 5.2;
const STAGE_SPAN_H = 4.2;

/** 地の上の文字。 */
const ON_GROUND = PAPER;
const ON_GROUND_DIM = "rgba(250,250,249,0.42)";
/** 書く面。地よりわずかに持ち上げる(角丸の板が浮いて見える)。 */
const LIFT = "#33332E";

export interface ComposerData {
  /** タスク/候補の id。タグと書体の割り当ての種になる。 */
  id?: string;
  title: string;
  /** 予定日(YYYY-MM-DD)。2番目の面。**大きさに効くのはこれだけ**。 */
  dueDate?: string;
  /** 終了日(YYYY-MM-DD)。期間のときだけ入る。 */
  endDate?: string;
  /** 時刻("HH:MM")。無ければ終日。 */
  dueTime?: string;
  /** 終了時刻("HH:MM")。期間で終日オフのときだけ。 */
  endTime?: string;
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

// ★キーボードのぶんを持ち上げる共通の style。`--kb` は器が書く。
// **transform だけ**で動かす(レイアウトを起こさない)。イージングはシェルの
// 横スライドと同じもの。**新しいイージングを増やさないこと。**
/** 閉じる動きの長さ(ms)。 */
const LEAVE_MS = 200;
/** ポップオーバーが下へ抜ける時間(ms)。globals.css の `tc-pop-out` と合わせる。 */
const POP_OUT_MS = 160;

/** 開くと自分の入力欄へフォーカスするもの。ここは行へ戻さない。 */
const TAKES_FOCUS: ToolKey[] = ["context", "belongings"];

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
  // 日程のシート。"" = 出ていない / "open" = 出ている / "closing" = 下へ抜けている最中。
  const [when, setWhen] = useState<"" | "open" | "closing">("");
  const whenOpen = when === "open";
  const whenBack = useRef<Pick<ComposerData, "dueDate" | "endDate" | "dueTime" | "endTime">>({});
  const leftRef = useRef(false);
  // ★★**取りこぼしの受け皿**(2026-08-17・第6巡)。
  // 「重要度やタグを何度も押しているとキーボードが閉じる」が `Press` の
  // 2段構え(div + touchstart)でも残る場合に備える。これが true のあいだ、
  // 行の欄からフォーカスが外れたら**その場で同期的に**戻す。同期なら iOS は
  // キーボードを閉じない。意図した blur(画面を離れる・日程のシート)のときだけ
  // false にする。
  const keepFocus = useRef(true);
  /** 閉じている最中(動きを見せているあいだ)。 */
  const [bye, setBye] = useState(false);

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
  // ツールバーの灯りは下書き(遅らせない方)のタグで出す。
  const liveTag = resolveTag(draft.tag, seed, draft.title, draft.context, draft.belongings, draft.note);

  // ★★積む地色は **LIFT(帯の色)**。CHARCOAL ではない(2026-08-17)。
  // `theme-color` は **iOS が自分で塗る領域**(キーボードの手前＝次候補の帯・
  // 画面の下端・セーフエリア)に使われる。この画面の**いちばん下に見えている
  // 面は帯(LIFT)**なので、CHARCOAL を積むとそこだけ色の違う帯として見え、
  // 「境目が見える」と報告された。下敷き(zIndex 59)も LIFT にして、
  // 器(visualViewport の矩形)の外側は必ず帯と同じ色になるようにする。
  useEffect(() => pushGround(LIFT), []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // 背面へ回るときだけ、保険として途中経過を保存する。
  useEffect(() => {
    // ★題が空なら保存しない(2026-08-18)。ここで保存すると、作りかけが
    // 「閉じるときに消す」道を通らずに残り、無題の図形として並び続ける。
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      if (!draftRef.current.title.trim()) return;
      onCommit(draftRef.current);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [onCommit]);

  // ★★**器は「見えている矩形」そのもの**(`visualViewport` の top と height)。
  //
  // 2026-08-18 に「合成だけで追従する」形へ変えたが、**実機で崩れた**ので
  // 戻した。崩れた理由は2つ、どちらも iOS のスタンドアロン(ホーム画面へ
  // 追加した PWA)特有:
  //
  //  1. 器を `height: 100lvh` の固定にしたうえで `top` へ `vv.offsetTop` を
  //     入れていたので、iOS がページを少しでもスクロールすると**そのぶん
  //     下がはみ出す**(帯のアイコンが画面の下で切れた)。
  //  2. キーボードのぶんを `innerHeight - vv.height` で出していたが、
  //     **スタンドアロンでは innerHeight もキーボードと一緒に縮む**。
  //     差が 0 になるので帯は持ち上がらず、キーボードの裏に隠れて消えた。
  //
  // 見えている矩形へ貼り直すやり方は、レイアウトビューポートが縮もうが
  // 縮むまいが**常に正しい**。
  //
  // ★**setState は使わない**。`visualViewport` の resize / scroll は
  // キーボードのアニメーション中に何度も飛ぶ。以前はそのたびに state を
  // 更新していて、入力画面まるごとが再レンダーされていた。
  // 矩形は **ref 越しに style へ直接書く**(`.app-track` と同じ作法)。
  const shellRef = useRef<HTMLDivElement | null>(null);
  /** キーボードが無いときの高さ。**見た最大値で自分を較正する**
   *  (キーボードが出たあとの `innerHeight` は当てにならない — 上記2)。
   *  ★種は**最初のレンダーで**取る。この画面はタップで作られるので、その
   *  時点でキーボードはまだ出ていない。effect まで待つと、先に走る
   *  layout effect の focus でキーボードが開き始めていて低い値を掴む。 */
  const fullH = useRef(0);
  if (fullH.current === 0 && typeof window !== "undefined") fullH.current = window.innerHeight;
  useEffect(() => {
    const apply = () => {
      const el = shellRef.current;
      if (!el) return;
      const vv = window.visualViewport;
      const top = vv ? vv.offsetTop : 0;
      const height = vv ? vv.height : window.innerHeight;
      el.style.top = `${top}px`;
      el.style.height = `${height}px`;
      // ★帯の下の余白を切り替えるためだけの値。**位置には使わない。**
      fullH.current = Math.max(fullH.current, height + top);
      const kb = Math.max(0, fullH.current - height - top);
      el.style.setProperty("--kb", `${Math.round(kb)}px`);
    };
    apply();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    return () => {
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
    };
  }, []);

  // ── 行(1行目=題 / 2行目以降=手順)────────────────────────────
  const rowsRef = useRef<(LineHandle | null)[]>([]);
  const wantRef = useRef<{ i: number; caret: number } | null>(null);
  const activeRow = useRef(0);
  const lines = [draft.title, ...subs.map((s) => s.title)];

  // ★開いたら即キーボード。rAF ではなく layout effect で呼ぶ — iOS は
  // 「タップと同じ処理の流れの中」でしかキーボードを開かない。
  useLayoutEffect(() => {
    const el = rowsRef.current[0];
    if (!el) return;
    el.focus();
    el.setCaret(el.length());
  }, []);

  useLayoutEffect(() => {
    const w = wantRef.current;
    if (!w) return;
    wantRef.current = null;
    const el = rowsRef.current[w.i];
    if (!el) return;
    el.focus();
    el.setCaret(w.caret);
  });

  // ★★**フォーカスが body へ落ちていたら必ず拾い直す**(2026-08-17・第6巡)。
  //
  // `onBlur` の受け皿では拾えない道がある — **フォーカスしている要素が
  // 消える**とき(メモ・持ち物の欄を閉じる、別の項目へ切り替える)は、
  // その欄の focusout であって行の focusout ではないので、行の onBlur は
  // 呼ばれない。結果、そこから先ずっとキーボードが出ないままになっていた
  // (実機で「何度も押していると閉じる」と報告された道のひとつ)。
  //
  // layout effect は**同じコミットの中**で走るので、要素が消えた直後・
  // 画面が描かれる前に戻せる。iOS はユーザー操作の流れの中で focus が
  // 戻ればキーボードを閉じない。
  useLayoutEffect(() => {
    if (!keepFocus.current || whenOpen) return;
    const a = document.activeElement;
    if (a && a !== document.body && a.tagName !== "HTML") return;
    const el = rowsRef.current[activeRow.current] ?? rowsRef.current[0];
    if (!el) return;
    el.focus();
    el.setCaret(el.length());
  });

  const setLine = (i: number, v: string) => {
    const text = v.replace(/\n/g, "");
    if (i === 0) set({ title: text });
    else set({ subtasks: subs.map((s, j) => (j === i - 1 ? { ...s, title: text } : s)) });
  };

  /** Enter … その行をキャレットで割り、後ろを次の行(手順)にする。 */
  const splitLine = (i: number, caret: number) => {
    const text = lines[i] ?? "";
    const next = [...subs];
    next.splice(i, 0, newSub(text.slice(caret)));
    if (i === 0) set({ title: text.slice(0, caret), subtasks: next });
    else {
      next[i - 1] = { ...next[i - 1], title: text.slice(0, caret) };
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
  // ★**キーボードは出したまま**(2026-08-16にユーザー指定)。blur すると
  // 器の高さが変わり、ボタンの位置ごと飛んでしまう。
  /**
   * ★閉じたら**必ず**書いていた行へキャレットを戻す(2026-08-17)。
   * メモ・持ち物の欄は開くと自分にフォーカスを取るので、戻し先を指定しないと
   * 閉じた瞬間にフォーカスが body へ落ちてキーボードが消える。トグルで閉じる
   * 道(ツールバーの丸をもう一度押す)がこれを忘れていて、そこから先の操作
   * すべてでキーボードが出ていなかった。
   */
  const backToRow = () => {
    wantRef.current = { i: activeRow.current, caret: (lines[activeRow.current] ?? "").length };
  };

  /** いま書いている行の要素。 */
  const liveRow = () => rowsRef.current[activeRow.current] ?? rowsRef.current[0];

  // ★★**日程だけはキーボードを閉じる**(2026-08-17にユーザーが方針転換)。
  // カレンダーに高さが要るため。閉じる前の値を控えておき、✕ はそこへ戻す。
  const openWhen = () => {
    if (tool) setToolOut(tool);
    setTool(null);
    whenBack.current = {
      dueDate: draft.dueDate, endDate: draft.endDate,
      dueTime: draft.dueTime, endTime: draft.endTime,
    };
    keepFocus.current = false;               // ここでの blur は意図したもの
    (document.activeElement as HTMLElement | null)?.blur();
    setWhen("open");
  };

  /**
   * 日程のシートを閉じる。★**この場(押した pointerdown の中)で同期的に
   * focus し直す**こと。iOS はユーザー操作の流れの中でしかキーボードを
   * 開かないので、アニメーションの後に focus してももう開かない。
   */
  const closeWhen = (commit: boolean) => {
    if (!commit) set(whenBack.current);
    // ★**シュッと閉じる**(2026-08-17にユーザー指定)。すぐ消すのではなく
    // 180ms で下へ抜かす。キーボードはその場で戻すので、抜けきる前から
    // 器が縮み始める(シートは下へ逃げているので気にならない)。
    keepFocus.current = true;
    setWhen("closing");
    window.setTimeout(() => setWhen(""), 180);
    const el = liveRow();
    if (el) { el.focus(); el.setCaret(el.length()); }
  };

  const openTool = (k: ToolKey) => {
    if (k === "due") { openWhen(); return; }
    const next = tool === k ? null : k;
    // ★行へ戻すのは「次に開くものが自分でフォーカスを取らないとき」。
    // メモ・持ち物は開くと自分の欄へフォーカスするので、そこは邪魔しない。
    if (!next || !TAKES_FOCUS.includes(next)) backToRow();
    if (!next && tool) setToolOut(tool);
    setTool(next);
  };

  // ★閉じる動きのあいだだけ中身を残す(2026-08-18)。以前は即座に消えていて
  // 「出るだけで消えない」動きになっていた。
  const [toolOut, setToolOut] = useState<ToolKey | null>(null);
  const shownTool = tool ?? toolOut;
  useEffect(() => {
    if (tool) { setToolOut(null); return; }
    if (!toolOut) return;
    const t = window.setTimeout(() => setToolOut(null), POP_OUT_MS);
    return () => window.clearTimeout(t);
  }, [tool, toolOut]);
  const closeTool = () => { backToRow(); if (tool) setToolOut(tool); setTool(null); };

  /**
   * 画面を離れる。★**閉じる動きを見せてから**呼び側へ返す(2026-08-18)。
   * 以前は即座に消えていて安っぽかった。`leftRef` が二重の呼び出しを防ぐ。
   */
  const leave = (run: () => void) => {
    if (leftRef.current) return;
    leftRef.current = true;
    keepFocus.current = false;
    (document.activeElement as HTMLElement | null)?.blur();
    setBye(true);
    window.setTimeout(run, LEAVE_MS);
  };

  const filled: Record<ToolKey, boolean> = {
    due: !!draft.dueDate,
    context: !!(draft.context ?? "").trim(),
    belongings: !!(draft.belongings ?? "").trim(),
    // ★既定は**中**。既定のままなら灯さない(最初から設定済みに見えてしまう)。
    weight: (draft.weight ?? 2) !== 2,
    // ★タグの丸は**常に灯す**。図形には必ず色が付いている(resolveTag)ので、
    // ここだけ沈んでいると「色が決まっていない」ように見えてしまう。
    tag: true,
  };

  const view = (
    <>
      {/* ★下敷き。**画面ぜんぶ**を覆う(zIndex 59)。器は見えている矩形
          (visualViewport)にしか居ないので、これが無いとキーボードの手前の帯が
          素通しになって後ろの山が見えた(2026-08-17に実機で報告)。
          ★色は **LIFT(帯の色)**。器の下端に見えているのは帯なので、その続きに
          なる色でないと「境目」として見えてしまう。 */}
      <div aria-hidden className={bye ? "tc-shell-out" : "tc-shell-in"} style={{
        position: "fixed", inset: 0, zIndex: 59, background: LIFT,
        width: "100vw", height: "100lvh", minHeight: "100%",
      }} />
    <div ref={shellRef} data-composer-shell onMouseDown={keepKeyboard} className={bye ? "tc-shell-out" : "tc-shell-in"} style={{
      position: "fixed", left: 0, right: 0, zIndex: 60, background: CHARCOAL,
      top: 0, height: "100svh",
      // ★★器の高さ・位置は**間を埋めて**動かす(2026-08-18)。iOS はキーボードが
      // せり上がる 250ms のあいだに visualViewport の resize を数回しか飛ばさない。
      // 素のままだと器が1〜2段で跳ね、それが「スムーズでない」の正体だった。
      // イージングは iOS のシートと同じ。★transform は**掛けない** — 掛けると
      // 中の position:fixed の下敷きが器を基準にしてしまい、背面が破れる。
      transition: "height 260ms cubic-bezier(0.32,0.72,0,1), top 260ms cubic-bezier(0.32,0.72,0,1)",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* ── 上のバー。閉じる / 削除 / 完了 は常時ここ。
             ★ポップオーバーの背面板(zIndex 1)より前に出す。でないと開いている
             あいだ「完了」も「閉じる」も叩けない(常時使えるのが約束)。 ── */}
      <div data-topbar onMouseDown={keepKeyboard} style={{
        flexShrink: 0, display: "flex", alignItems: "center", gap: 8,
        padding: "max(8px, env(safe-area-inset-top)) 14px 4px",
        position: "relative", zIndex: 2,
      }}>
        <Press onPress={() => leave(() => onClose(draftRef.current))} aria-label="閉じる"
          className="tc-lamp" style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "rgba(250,250,249,0.10)", position: "relative", flexShrink: 0,
          }}>
          <span style={{ position: "absolute", left: 11, top: 17, width: 14, height: 1.6, background: ON_GROUND, transform: "rotate(45deg)" }} />
          <span style={{ position: "absolute", left: 11, top: 17, width: 14, height: 1.6, background: ON_GROUND, transform: "rotate(-45deg)" }} />
        </Press>
        <span style={{ marginLeft: "auto" }} />
        {onDelete && (
          <Press onPress={() => leave(() => { haptic(8); onDelete(); })} aria-label="DELETE" className="tc-lamp" style={{
            height: 36, padding: "0 15px", borderRadius: 999,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(250,250,249,0.10)",
            ...CAP, fontSize: 10, color: ON_GROUND_DIM,
          }}>DELETE</Press>
        )}
        {onConfirm && (
          <Press onPress={() => leave(() => { haptic(16); onConfirm(draftRef.current); })}
            aria-label={mode === "candidate" ? "CONFIRM" : "COMPLETE"} className="tc-lamp" style={{
              height: 36, padding: "0 18px", borderRadius: 999, background: ON_GROUND,
              display: "flex", alignItems: "center", justifyContent: "center",
              ...CAP, fontSize: 10, color: CHARCOAL,
            }}>{mode === "candidate" ? "CONFIRM" : "COMPLETE"}</Press>
        )}
      </div>

      {/* ── 図形。入力するそばから形が変わる。
             ★余白をタップしたら閉じる(2026-08-17にユーザー指定)。題が
             入っていればそのまま保存され、空なら呼び側が作りかけを消す。 ── */}
      <Press
        onPress={() => { if (!tool && !whenOpen) leave(() => onClose(draftRef.current)); }}
        style={{ flex: 1, minHeight: 0, position: "relative" }}
      >
        {/* ★キーボードのぶんの追従は**アニメーションを持たない外側**に置く。
            `.tc-pop` は transform を animate するので、同じ要素に inline の
            transform を書いても animation に上書きされる(fill-mode: both)。 */}
        <div data-shape style={{ position: "absolute", inset: 0 }}>
          {/* 形が変わった瞬間だけ弾ませる(key を変えて animation を鳴らし直す)。 */}
          <div key={spec.sides.length} className="tc-pop" style={{ position: "absolute", inset: 0 }}>
            <ShapeStage spec={spec} title={preview.title} tag={tag} />
          </div>
        </div>

        {/* ★ポップオーバーは**この領域(上のバーの下〜下の帯の上)の中だけ**に出す。
            以前は帯の上へ伸ばしていたので、中身が高いと画面の上へはみ出して
            タブの下に潜り、下へスワイプしないと触れなかった(2026-08-17に指摘)。 */}
        {shownTool && (
          <Popover label={TOOL_LABEL[shownTool]} closing={!tool} onClose={closeTool}>
            {shownTool === "context" && (
              <TextField multiline placeholder="どこで・何を使って" value={draft.context ?? ""}
                onChange={(v) => set({ context: v.trim() ? v : undefined })} />
            )}
            {shownTool === "belongings" && (
              <TextField placeholder="持っていくもの" value={draft.belongings ?? ""}
                onChange={(v) => set({ belongings: v.trim() ? v : undefined })} />
            )}
            {shownTool === "weight" && <WeightPicker value={weight} onPick={(w) => set({ weight: w })} />}
            {shownTool === "tag" && <TagPicker value={liveTag} onPick={(t) => set({ tag: t })} />}
          </Popover>
        )}
      </Press>

      {/* ── 下の帯。角丸の板が浮く。キーボードのすぐ上に居座る。 ── */}
      {/* ★帯ごとポップオーバーの背面板(zIndex 1)より前に出す。
             `.tc-sheet` は transform のアニメーションを持ち続けるので**帯自身が
             重なりの文脈になる** — 中の要素に zIndex を振っても背面板には勝てず、
             ツールバーがタップを吸われていた(ポップオーバーを帯の中から
             図形の領域へ移した2026-08-17に発覚)。 */}
      {/* ★ドック。**キーボードのぶんを持ち上げるのはここ**(外側)。
          帯そのものは登場の動き(`.tc-sheet` = transform を animate)を持って
          いるので、同じ要素に追従の transform は書けない。 */}
      <div data-dock className={bye ? "tc-sheet-out" : undefined}
        style={{ flexShrink: 0, position: "relative", zIndex: 2 }}>
        {/* ★帯の下を同じ色で埋める。キーボードが動いている最中、帯が持ち上がった
            ぶんの帯状の隙間が一瞬見えるのを防ぐ(色が違うと「境目」になる)。 */}
        <span aria-hidden style={{
          position: "absolute", top: "100%", left: 0, right: 0, height: "60vh", background: LIFT,
        }} />
      <div data-band className="tc-sheet" onMouseDown={keepKeyboard} style={{
        position: "relative", background: LIFT,
        borderRadius: "26px 26px 0 0",
        // 角丸が読めるように、地との境目へ影を落とす。
        boxShadow: "0 -16px 34px rgba(0,0,0,0.34)",
        // ★★キーボードが出ているあいだは**セーフエリアぶんの余白を取らない**
        // (2026-08-17・18にユーザー指摘「キーボードとアイコンの隙間が変」)。
        // iOS は**キーボードが出ていても `env(safe-area-inset-bottom)` を
        // 34px のまま報告する**ので、そのぶんの死んだ帯が真上に残っていた。
        // `--kb` を引けば JS の分岐なしで切り替わる。
        padding: "10px 16px max(6px, calc(env(safe-area-inset-bottom) - var(--kb, 0px)))",
      }}>
        {/* Cowork の提案。タップで手順になる。 */}
        {(draft.suggestions?.length ?? 0) > 0 && (
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6 }}>
            {(draft.suggestions ?? []).map((s) => (
              <span key={s.id} className="tc-row-in" style={{
                display: "flex", flexShrink: 0, alignItems: "center",
                borderRadius: 999, background: "rgba(250,250,249,0.10)",
              }}>
                <button onClick={() => {
                  haptic(8);
                  set({
                    subtasks: [...subs, { ...newSub(s.title), fromSuggestion: true }],
                    suggestions: (draft.suggestions ?? []).filter((x) => x.id !== s.id),
                  });
                }} style={{
                  border: "none", background: "transparent", cursor: "pointer", padding: "0 6px 0 14px", height: 28,
                  fontFamily: SANS, fontSize: 12.5, color: ON_GROUND, whiteSpace: "nowrap",
                }}>{s.title}</button>
                <button onClick={() => set({ suggestions: (draft.suggestions ?? []).filter((x) => x.id !== s.id) })}
                  aria-label={`${s.title}を却下`}
                  style={{ width: 26, height: 28, border: "none", background: "transparent", cursor: "pointer", position: "relative" }}>
                  <span style={{ position: "absolute", left: 9, top: 14, width: 10, height: 1.4, background: ON_GROUND_DIM, transform: "rotate(45deg)" }} />
                  <span style={{ position: "absolute", left: 9, top: 14, width: 10, height: 1.4, background: ON_GROUND_DIM, transform: "rotate(-45deg)" }} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* 題と手順。1つの縦の並び。★件数が不定なのでここだけは送れるままに
            する(ダイアログではなくリストなので、縦に送れて良い)。 */}
        {/* ★アイコンとのすき間(2026-08-18にユーザー指摘「詰まりすぎ」)。 */}
        <div style={{ maxHeight: "30vh", overflowY: "auto", paddingBottom: 12 }}>
          {lines.map((text, i) => (
            <Row
              key={i === 0 ? "title" : subs[i - 1].id}
              ref={(el) => { rowsRef.current[i] = el; }}
              value={text}
              head={i === 0}
              done={i > 0 && subs[i - 1].done}
              keepFocus={keepFocus}
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
          open={whenOpen ? "due" : tool} filled={filled} onOpen={openTool}
          on={tagColor(liveTag)} onInk={tagInk(liveTag)} off={ON_GROUND_DIM}
        />
      </div>
      </div>

      {/* ── 日程のシート。★**キーボードを閉じて**下から立ち上がる
             (2026-08-17にユーザーが方針転換)。カレンダーに高さが要るため、
             ここだけは他の項目と扱いが違う。左上の ✕ で取り消し・右上の ✓ で
             確定し、どちらも押した瞬間にキーボードが戻る。 ── */}
      {when !== "" && (
        <div className={when === "open" ? "tc-sheet" : "tc-sheet-out"} data-when style={{
          position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 4,
          background: LIFT, borderRadius: "28px 28px 0 0",
          boxShadow: "0 -18px 40px rgba(0,0,0,0.40)",
          padding: "14px 16px max(14px, env(safe-area-inset-bottom))",
          // ★高さは**固定**(2026-08-17にユーザー指定「期日と期間を切り替えても
          // ウィンドウの上端の位置は変えず、上側に合わせてレイアウト」)。
          // 中身なりにすると「期間」で上端が下がり、押す位置が変わるうえ
          // ホバーがシートの外へはみ出していた。
          height: `calc(${SHEET_BODY_H}px + max(14px, env(safe-area-inset-bottom)))`,
          maxHeight: "calc(100% - 8px)",   // 背の低い端末の保険(カレンダーが痩せる)
        }}>
          <WhenSheet
            value={{ dueDate: draft.dueDate, endDate: draft.endDate, dueTime: draft.dueTime, endTime: draft.endTime }}
            accent={tagAccent(liveTag, LIFT)}
            onChange={(v) => set(v)}
            onCancel={() => closeWhen(false)}
            onCommit={() => closeWhen(true)}
          />
        </div>
      )}
    </div>
    </>
  );

  if (typeof document === "undefined") return null;
  return createPortal(view, document.body);
}

// ── 図形の舞台。器の大きさを測って、その中央に1つ描く。 ──
function ShapeStage({ spec, title, tag }: {
  spec: ReturnType<typeof specOf>; title: string; tag: TaskTag;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  // ★★**それまでに見た一番大きい箱**を持ち続ける(2026-08-18)。キーボードが
  // せり上がると舞台は縮むが、canvas の寸法と倍率をそこで変えると
  // **1フレームごとに図形を焼き直す**ことになる(4×絞りで1枚50ms級 ＝ カクつきの
  // 正体)。寸法を据え置けば焼き直しはゼロ。canvas は透明なので、舞台からはみ出た
  // ぶんは目に見えない。中央寄せなので、舞台が縮むと絵は**自然に上へ動く**。
  // ※390px 幅では倍率はもともと幅で決まっている(346/5.2 < 690/4.2)ので
  //   見た目は変わらない。
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // ★測るのは `contentRect`(＝**組版上の大きさ**)。`getBoundingClientRect` は
    // 出るときの animation の scale が乗った値を返すので、最初の1回だけ
    // 7%小さい箱を掴んでしまう(2026-08-18に判明)。
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setBox((p) => (r.width <= p.w + 0.5 && r.height <= p.h + 0.5
        ? p : { w: Math.max(p.w, r.width), h: Math.max(p.h, r.height) }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} style={{
      position: "absolute", inset: "6px 22px 8px",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {box.w > 8 && box.h > 8 && (
        <SolidCanvas
          w={box.w} h={box.h}
          // ★倍率を固定する。器に目一杯まで拡大すると、重要度や期限を変えても
          // 絵の大きさが変わらず「大きさ = 重要度」が読めなくなる。
          unit={Math.min(box.w / STAGE_SPAN_W, box.h / STAGE_SPAN_H)}
          paint={{ spec, view: "name", tag, title }}
        />
      )}
    </div>
  );
}

// ── 1行。題は大きく、手順は丸い点つきで小さく。高さは中身に合わせて伸びる。 ──
function Row({ ref, value, head, done, keepFocus, onFocus, onChange, onEnter, onMergeUp, onToggle }: {
  ref: (h: LineHandle | null) => void;
  value: string;
  head: boolean;
  done: boolean;
  /** true のあいだ、フォーカスが外れたらその場で戻す(EditableLine を参照)。 */
  keepFocus: React.RefObject<boolean>;
  onFocus: () => void;
  onChange: (v: string) => void;
  onEnter: (caret: number) => void;
  onMergeUp: () => void;
  onToggle?: () => void;
}) {
  return (
    <div className={head ? undefined : "tc-row-in"}
      style={{ display: "flex", alignItems: "flex-start", gap: 9, minHeight: head ? 32 : 22 }}>
      {!head && (
        // 手順の点。**丸**。タップで済んだ印になる。
        <Press onPress={() => onToggle?.()} aria-label={done ? "手順を戻す" : "手順を済みにする"}
          className="tc-lamp" style={{
            width: 20, height: 24, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          <span style={{
            width: 9, height: 9, borderRadius: "50%",
            background: done ? "transparent" : ON_GROUND,
            boxShadow: done ? `inset 0 0 0 1.5px ${ON_GROUND_DIM}` : "none",
          }} />
        </Press>
      )}
      <EditableLine
        ref={ref}
        value={value}
        placeholder={head ? "タスクの名前" : "手順"}
        keepFocus={keepFocus}
        onFocus={onFocus}
        onChange={onChange}
        onEnter={onEnter}
        onMergeUp={onMergeUp}
        style={{
          fontFamily: SANS,
          fontSize: head ? 21 : 15,
          fontWeight: head ? 700 : 500,
          lineHeight: head ? 1.34 : 1.5,
          color: done ? ON_GROUND_DIM : ON_GROUND,
          textDecoration: done ? "line-through" : "none",
          caretColor: ON_GROUND,
        }}
      />
    </div>
  );
}

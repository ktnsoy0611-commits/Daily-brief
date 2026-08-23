"use client";

import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TagPicker, TextField, WeightPicker } from "@/components/tasks/ComposerFields";
import { SHEET_BODY_H, WhenSheet } from "@/components/tasks/WhenSheet";
import { ComposerToolbar, TOOL_LABEL, type ToolKey } from "@/components/tasks/ComposerToolbar";
import { Press, pressedRecently } from "@/components/Button";
import { CAP, keepKeyboard, Popover } from "@/components/tasks/Popover";
import { SolidCanvas } from "@/components/tasks/SolidCanvas";
import { ViewportProbe } from "@/components/tasks/ViewportProbe";
import { CHARCOAL, PAPER, SANS } from "@/lib/constants";
import { isViewportDebug } from "@/lib/debugViewport";
import { pushGround } from "@/lib/ground";
import { surfaceOrigin, T_OUT } from "@/lib/motion";
import { haptic } from "@/lib/helpers";
import { resolveTag, tagAccent, tagColor, tagInk } from "@/lib/taskTags";
import { specOf } from "@/lib/taskSize";
import type { SolidPaint } from "@/lib/solidPaint";
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

/** 閉じる動きの長さ(ms)。 */
// ★★**切り抜きの円が縮む時間と必ず同じにする**(2026-08-19・第27巡)。
// 第26巡は 300ms のまま `--t-out`(600ms) の動きを流していたので、
// **閉じる動きが半分で打ち切られていた**(実機で「アニメーションしていません」)。
// 数字を二重に持たないよう `lib/motion.ts` の `T_OUT` から引く
// (CSS 側の `--t-out` と対。片方だけ直さないこと)。
const LEAVE_MS = Math.round(T_OUT * 1000);
/** これより高く出たら「キーボードが出ている」。 */
const KB_UP = 120;
/** これより低くなったら「キーボードが閉じた」。 */
const KB_DOWN = 60;
/** 図形が入れ替わる動きの長さ(ms)。globals.css の `tc-solid-swap-*` と合わせる。 */
const SOLID_SWAP_MS = 280;
/** 下がったように見えてから、確かめるまでの待ち。★2回続けて確かめるので
 *  閉じ始めるまでの「間」はこの2倍。第18巡は 200(＝400ms)にしていたが、
 *  実機で「閉じる時にワンテンポ遅れる」と言われた。一瞬の谷を弾くのに
 *  400ms は要らない(iOS がキーボードを畳むのに 250ms かかる)。 */
const KB_SETTLE_MS = 90;
/** 開いた直後、閉じる合図を一切働かせない時間。 */
const OPEN_GUARD_MS = 600;
/** 図形を最初に焼くまでの待ちの上限(ふつうは `animationend` が先に来る)。 */
const STAGE_DELAY_MS = 460;
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
  /** ポップオーバーが出ているあいだ。閉じる判断を止めるのに使う。 */
  const toolRef = useRef<ToolKey | null>(null);
  toolRef.current = tool;
  // 日程のシート。"" = 出ていない / "open" = 出ている / "closing" = 下へ抜けている最中。
  const [when, setWhen] = useState<"" | "open" | "closing">("");
  // ★キーボードの追従は effect の中(deps 空)から見るので ref で渡す。
  const whenRef = useRef(when);
  whenRef.current = when;
  /** 「キーボードが閉じた」ときに走らせるもの。下の `leave` で差し替える。 */
  const leaveRef = useRef<() => void>(() => {});
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
  /** ★開発用。実機の数値を隅に出す(直ったら撤去する)。 */
  const [probe, setProbe] = useState(false);
  useEffect(() => setProbe(isViewportDebug()), []);

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
  useEffect(() => pushGround(LIFT, "overlay"), []);
  // ★★★**開いているあいだ、この画面の外は一切動かさない**(2026-08-18・第14巡)。
  //
  // 「まだスクロールできる」が 3 巡続いた。器の中を `clip` にしても消えなかった
  // のは、**送っているのが器ではなかった**から。iOS は指の下に送れる箱が
  // 見つからないと、**その先(タブの列・ページ・見えている矩形そのもの)を
  // 送りにいく**。だから「送れる箱を減らす」ではなく、
  // **「指が動かせるものを名指しで許す」**側から書く。
  //
  //  1. html に印を付け、後ろのタブの列を CSS で止める(`[data-overlay]`)。
  //  2. `touchmove` を素の非 passive で受け、**本当に送れる箱の中でなければ
  //     その場で止める**。送れる箱＝行の並び・カレンダー・ダイアル・
  //     タイムライン(いずれも `overflow: auto` で実際にはみ出しているもの)。
  //     二本指(拡大)も止める。
  useEffect(() => {
    const root = document.documentElement;
    const prevBody = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.dataset.overlay = "1";
    delete root.dataset.leaving;

    /** 指の下に「本当に送れる箱」があるか。 */
    const scrollable = (from: EventTarget | null) => {
      let n = from instanceof HTMLElement ? from : null;
      while (n && n !== document.body) {
        const cs = getComputedStyle(n);
        if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && n.scrollHeight - n.clientHeight > 1) return true;
        if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && n.scrollWidth - n.clientWidth > 1) return true;
        n = n.parentElement;
      }
      return false;
    };
    const stop = (e: TouchEvent) => {
      if (!e.cancelable) return;
      if (e.touches.length > 1) { e.preventDefault(); return; }
      if (!scrollable(e.target)) e.preventDefault();
    };
    document.addEventListener("touchmove", stop, { passive: false });
    return () => {
      document.removeEventListener("touchmove", stop);
      document.body.style.overflow = prevBody;
      delete root.dataset.overlay;
      delete root.dataset.leaving;
    };
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
  /** 画面いっぱいの板(切り抜きの円を持つ)。器はこの子。 */
  const plateRef = useRef<HTMLDivElement | null>(null);

  // ★★★**＋から広がって、＋へ戻す = 器を円で切り抜く**(2026-08-19・第27巡)。
  //
  // 切り抜きは**寸法を持たない**。`place()` が器の高さをどれだけ書き換えても、
  // 地の面も中身も常に器そのもの。要素の受け渡しもゼロなので、途中で測り直す
  // 瞬間が構造的に無い(第26巡の共有要素はここで壊れていた)。
  // 覆い終わったら切り抜きごと外し、以後は器を自由に動かす。
  /** ＋の丸の中心と、そこから器の四隅までの最大距離。 */
  const revGeom = () => {
    const el = plateRef.current;
    const o = surfaceOrigin();
    const r = el ? el.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    const x = o.x + o.w / 2 - r.left;
    const y = o.y + o.h / 2 - r.top;
    const far = Math.max(
      Math.hypot(x, y), Math.hypot(r.width - x, y),
      Math.hypot(x, r.height - y), Math.hypot(r.width - x, r.height - y),
    );
    // ★四隅を**少し超えさせる**。ぴったりだと、覆い終わりの細い隙間だけが
    //   長く見える(実機で「画面端に余白が残る状態が長い」と報告)。
    //   はみ出していれば四角い角も、端末の丸い角とのぶつかりも出ない。
    return { x, y, r0: o.w / 2, r1: far * 1.08 };
  };
  const circle = (r: number, x: number, y: number) => `circle(${Math.round(r)}px at ${Math.round(x)}px ${Math.round(y)}px)`;
  /** ＋の大きさから器いっぱいへ広げる。 */
  const grow = () => {
    const el = plateRef.current;
    if (!el) return;
    const g = revGeom();
    el.style.setProperty("--rev", circle(g.r0, g.x, g.y));
    delete el.dataset.rev;          // ここは動かさない(始まりの姿を置くだけ)
    void el.offsetWidth;            // 置いたことを確定させてから
    el.dataset.rev = "in";
    el.style.setProperty("--rev", circle(g.r1, g.x, g.y));
    const done = (e: TransitionEvent) => {
      if (e.propertyName !== "clip-path" || e.target !== el) return;
      // ★★広げている途中で閉じられたら**何もしない**。ここで切り抜きを
      //   外すと、吸い込みが終わった瞬間に入力画面が丸ごと出てしまう。
      if (el.dataset.rev !== "in") return;
      el.removeEventListener("transitionend", done);
      // ★切り抜きごと外す。以後 `place()` が器を動かしても何も邪魔しない。
      delete el.dataset.rev;
      el.style.setProperty("--rev", "none");
    };
    el.addEventListener("transitionend", done);
  };
  /** ＋の大きさへ吸い込む。★長さは `--t-out` と `LEAVE_MS` で必ず揃える。 */
  const shrink = () => {
    const el = plateRef.current;
    if (!el) return;
    const g = revGeom();
    el.style.setProperty("--rev", circle(g.r1, g.x, g.y));
    delete el.dataset.rev;
    void el.offsetWidth;
    el.dataset.rev = "out";
    el.style.setProperty("--rev", circle(g.r0, g.x, g.y));
  };
  // ★広げるのは**マウントの1回だけ**。`grow` を依存に入れると毎レンダーで
  //   広げ直してしまう(文字を打つたびに円が走る)。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { grow(); }, []);
  // ★★**出る動きが終わるまで図形を焼かない**(2026-08-18・第17巡)。
  //   図形を1枚焼くのは 4× 絞りで 130ms 級。以前は「300ms 待つ」で逃がして
  //   いたが、スライドは 320ms なので**最後の数フレームに焼きが重なって**
  //   いた(実測でそこだけ 300ms フレームが飛んでいた)。時間で当てずに、
  //   **動きが終わった合図(`animationend`)**を待つ。念のため時間の保険も置く。
  const [settled, setSettled] = useState(false);
  // ★★★**動き出しは「組み立てが終わってから」**(2026-08-18・第17巡)。
  //
  // CSS のアニメーションは**時計で進む**。組み立て(React のマウント・レイアウト・
  // フォーカス)に 283ms かかっているあいだも時計は進むので、手が空いたときには
  // 320ms のうち 88% が終わっている ＝ **板がいきなり所定の位置に現れる**。
  // 実機で「ガクッと動く」と言われていたのはこれ。時間で誤魔化さず、
  // **組み立てが済んだ次のフレームで初めてクラスを付ける**。
  // それまでは画面の下に置いておく(下の `style`)。
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  // 出る動きが終わったら、そこで初めて図形を焼く(焼きは 4× 絞りで 130ms 級)。
  useEffect(() => {
    if (!entered) return;
    const el = shellRef.current;
    const done = () => setSettled(true);
    el?.addEventListener("animationend", done, { once: true });
    const t = window.setTimeout(done, STAGE_DELAY_MS);
    return () => { el?.removeEventListener("animationend", done); window.clearTimeout(t); };
  }, [entered]);
  /** 一度でもキーボードが出たか。出ていないうちは「閉じた」と見なさない。 */
  const kbSeen = useRef(false);
  /** キーボードが出ていないときの高さ(いちばん大きく見えた値を持ち続ける)。 */
  const fullRef = useRef(0);
  /** キーボードとずれを測り直す。ポップオーバーを閉じた直後に呼ぶ。 */
  const applyRef = useRef<() => void>(() => {});
  /** いま文字を打っている行。effect の中から ref 越しに読む。 */
  const liveRowRef = useRef<() => HTMLTextAreaElement | null>(() => null);
  const settleRef = useRef(0);
  // ★★★**開いた直後は「守られた時間」**(2026-08-18・第18巡)。
  //
  // ＋ボタン(`TaskAddButton`)は**素の `<button>`** で、入力画面の `Press` では
  // ない。`Press` だけが「画面の中を押した時刻」を記録するので、
  // **＋から開いた直後は `pressedRecently()` が false** になり、
  // フォーカスを戻す受け皿が2つとも黙る。そこでフォーカスが一度でも外れると
  // (ボタンがクリックのあとに取り返す・山が動いていて主スレッドが詰まり
  // `focus()` が居着かない、など)、`focusout` の合図が「閉じたい」と誤解して
  // 入力画面を畳んでいた。実機で「gravity で図形が動いている時に＋を押すと
  // すぐ開いて閉じる」と報告された。
  //
  // 開いた直後の focus 外れは「閉じたい」ではありえない。この間は
  // **必ず戻し、閉じる合図は一切働かせない**。
  const openedAt = useRef(Date.now());
  const justOpened = () => Date.now() - openedAt.current < OPEN_GUARD_MS;
  const justOpenRef = useRef(justOpened);
  justOpenRef.current = justOpened;
  // ★★★★**器を「見えている矩形」そのものに合わせる**(2026-08-19・第24巡)。
  //
  // ここは第13巡から11巡ぶん壊れ続けた場所。原因は**類推の誤り**だった —
  // 正典に「器は一度置いたら二度と動かさない。録音のオーバーレイ
  // (`VoiceOverlay`)と同じ書き方にする。あれが実機で滑らかなのは寸法を
  // JS が書き換えないからだ」と書いてあったが、**`VoiceOverlay` には入力欄が
  // 1つも無い**(`components/VoiceStudio.tsx`)。キーボードが出ない画面である。
  // 滑らかなのは「書き換えないから」ではなく**追う相手が居ないから**。
  // それをキーボードが主役の画面へ持ち込み、以後
  // 「器を動かさずに、動いたことにする」代用品(`--kb` / `--vvtop` /
  // ずれ残りの閉ループ / 上限 / 確かめの二段)を積み上げてきた。
  //
  // 代用品は**入力そのもの**が信用できなかった。`--kb` は
  // 「器の offsetHeight − vv.height」だが、実機では器の高さが思っている値では
  // なく、帯が画面の最上部まで持ち上がった(実機の写真・第24巡)。
  //
  // ★**器の top と height を visualViewport の値そのものにする。** そうすると
  //   代用品でやっていたことが**全部ただのレイアウト**になる:
  //     帯   … 縦並びの最後の子 ＝ 自然に見えている下端
  //     図形 … `flex: 1` の余りぜんぶ ＝ 自然に中央
  //     ポップオーバー・日程シート … その中の `absolute` ＝ 自然に収まる
  //
  // ★**書くのは `resize` のときだけ**(`scroll` では書かない)。iOS は
  //   キーボードの 250ms の間に数回しか飛ばさないので、レイアウトのやり直しも
  //   その回数で済む。`height` に transition は掛けない(毎フレーム
  //   レイアウトをやり直すことになる)。
  // ★第8〜12巡が同じことをして「重い」と言われた原因は**別で解決済み** —
  //   図形は「それまでに見た一番大きい箱」を持ち続けて焼き直さず(第13巡)、
  //   `SolidCanvas` も `paintKey` で焼き上がりを使い回す。`width` も触らない。
  const placeRef = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    /** 見えている高さ。キーボードが無いときの高さは `innerHeight` を上限に見る。 */
    const seen = () => {
      const vv = window.visualViewport;
      return vv ? vv.height : window.innerHeight;
    };
    // ★★★**「キーボードが出ていない高さ」は覚えておく**(2026-08-19・第25巡)。
    //
    // `window.innerHeight` から引いてはいけない。**iOS のスタンドアロンは
    // レイアウトビューポートごと縮む**ので(`docs/project_knowledge.md` の
    // 「B レイアウトごと縮む」)、キーボードが出ると `innerHeight` も一緒に
    // 小さくなる。すると「出ていない高さ」が「出ている高さ」と同じ値になり、
    // **一度も「出た」と判定できない** — 実機で「キーボードを閉じても
    // タスクUIが閉じない」と報告されたのがこれ。
    // ★いちばん大きく見えた高さを持ち続ける(図形の舞台と同じ考え方)。
    //   入力画面はキーボードが出る前に組み立てられるので、最初の1回が満尺。
    const full = () => {
      const h = Math.max(seen(), window.innerHeight);
      if (h > fullRef.current) fullRef.current = h;
      return fullRef.current;
    };

    const place = () => {
      const el = shellRef.current;
      const vv = window.visualViewport;
      if (!el || !vv || leftRef.current) return;
      const top = `${Math.round(vv.offsetTop)}px`;
      const h = `${Math.round(vv.height)}px`;
      el.style.top = top;
      el.style.height = h;
      // ★★キーボードが出ているあいだは、器の下端は**キーボードの上端**。
      //   そこにセーフエリア(ホームバー)は無いので、帯の下に 34px 取ると
      //   そのぶん丸ごと死んだ隙間になる(実機で「アイコンとキーボードまでの
      //   幅が大きすぎる」と報告・第25巡)。切り替えの印は CSS が見る。
      if (seen() <= full() - KB_UP) el.dataset.kb = "1";
      else delete el.dataset.kb;
      // ★★診断用(2026-08-19・第30巡)。「満尺の高さ」は一度大きくなったら
      //   二度と縮まない前提で持っている(第25巡)。もし実機で iOS 側が
      //   `visualViewport.height` を恒久的に縮めるバグを踏んでいた場合、
      //   ここの値がタップのたびに変わる/異常に大きいままなどで見分けが付く。
      //   `ViewportProbe` がこれを拾って表示する。
      el.dataset.full = String(Math.round(full()));
    };
    placeRef.current = place;

    // ★★**キーボードを閉じたら入力画面も閉じる**(2026-08-18にユーザー指定)。
    //   `--kb` が無くなったので、合図は見えている高さそのもので持つ。
    //   ★一度も縮んでいないうちは何もしない(開いた直後に閉じないため)。
    const judge = (guarded: boolean) => {
      if (leftRef.current) return;
      const h = seen();
      if (h <= full() - KB_UP) { kbSeen.current = true; return; }
      if (kbSeen.current && h >= full() - KB_DOWN && !guarded) {
        kbSeen.current = false;
        leaveRef.current();
        return;
      }
      // ★閉じないと決まったので、伸ばすのを我慢していたぶんをここで追いつかせる。
      place();
    };

    const apply = () => {
      if (leftRef.current) return;
      // ★★日程のシートが開いているあいだは閉じる判断をしない。
      //   あそこは**こちらから**キーボードを閉じている(＝器は画面いっぱいに戻る)。
      const busy = whenRef.current !== "" || toolRef.current;
      const h = seen();
      // ★★★**閉じにいく気配のときは器を広げない**(2026-08-19・第24巡)。
      //   キーボードが引っ込むと器は画面いっぱいへ伸びるが、その直後に
      //   入力画面ごと滑り降りるので、**伸びてから滑る**＝一度跳ねて見える。
      //   実機で「キーボードが閉じ切った時にガクッと不安定な挙動をしながら
      //   下にスライドする」と言われたのがこれ。伸ばさずにそのまま滑らせる。
      //   閉じないと決まったときは `judge` が追いつかせる。
      const closing = !busy && kbSeen.current && h >= full() - KB_DOWN;
      if (!closing) place();
      if (busy) return;
      window.clearTimeout(settleRef.current);
      if (h <= full() - KB_UP) { kbSeen.current = true; return; }
      if (!kbSeen.current) return;
      // ★**戻ったように見えたら確かめてから**(第18巡)。一瞬の谷で閉じない。
      // ★守られているかは**観測した時点**で決める(時計ではなく状態・第18巡)。
      const guarded = justOpened();
      settleRef.current = window.setTimeout(() => {
        if (leftRef.current || whenRef.current !== "" || toolRef.current) return;
        if (seen() < full() - KB_DOWN) return;
        settleRef.current = window.setTimeout(() => {
          if (leftRef.current || whenRef.current !== "" || toolRef.current) return;
          judge(guarded);
        }, KB_SETTLE_MS);
      }, KB_SETTLE_MS);
    };
    applyRef.current = apply;
    place();

    // ★★合図をもう1つ持つ。iOS の「完了」は**フォーカスを外す**。
    const gone = () => {
      // ★★★**時計ではなく「キーボードがまだ出ているか」で決める**(第18巡)。
      //   焦点が外れる理由は2つある — 取りこぼし(キーボードは出たまま)と、
      //   ユーザーが閉じた(引っ込む)。前者なら戻せばよく、後者は上の合図が
      //   閉じる。**ここでは決して閉じない**。
      window.setTimeout(() => {
        if (leftRef.current || whenRef.current !== "" || toolRef.current) return;
        const a = document.activeElement;
        if (a && (a.tagName === "TEXTAREA" || a.tagName === "INPUT")) return;
        if (seen() >= full() - KB_UP) return;   // 引っ込んでいる ＝ 閉じたい意思
        const row = liveRowRef.current();
        if (!row) return;
        row.focus();
        const n = row.value.length;
        row.setSelectionRange(n, n);
      }, 260);
    };
    shellRef.current?.addEventListener("focusout", gone);
    // ★保険。iOS はキャレットを見せるために `overflow:hidden` の器でも
    // スクロールさせてくる。動かされたらその場で戻す(器は画面そのものなので
    // 縦にも横にも動く理由が無い)。
    const pin = () => {
      const el = shellRef.current;
      if (!el) return;
      if (el.scrollTop !== 0) el.scrollTop = 0;
      if (el.scrollLeft !== 0) el.scrollLeft = 0;
    };
    shellRef.current?.addEventListener("scroll", pin);
    const vv = window.visualViewport;
    const onResize = () => apply();
    // ★位置だけは `scroll` でも追う(見えている矩形が上下に動くことがある)。
    //   閉じる判断はしない — あれは高さの話で、`resize` でしか変わらない。
    const onScroll = () => placeRef.current();
    vv?.addEventListener("resize", onResize);
    vv?.addEventListener("scroll", onScroll);
    window.addEventListener("resize", onResize);
    const shell = shellRef.current;
    return () => {
      shell?.removeEventListener("focusout", gone);
      shell?.removeEventListener("scroll", pin);
      vv?.removeEventListener("resize", onResize);
      vv?.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.clearTimeout(settleRef.current);
    };
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
    // ★同上。画面の外で外れたぶんは拾い直さない(開いた直後だけは必ず戻す)。
    if (!justOpened() && !pressedRecently()) return;
    const el = rowsRef.current[activeRow.current] ?? rowsRef.current[0];
    if (!el) return;
    el.focus();
    const n = el.value.length;
    el.setSelectionRange(n, n);
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
  liveRowRef.current = liveRow;

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
    if (el) {
      el.focus();
      const n = el.value.length;
      el.setSelectionRange(n, n);
    }
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

  // ★★★**日程のシートが開いているあいだ、図形の舞台を凍らせる**
  // (2026-08-19・第25巡)。シートは自分でキーボードを閉じるので器が画面いっぱいへ
  // 伸び、`flex: 1` の舞台もそのぶん広がって**図形が 187px 下へ飛び、シートの
  // 裏に隠れた**(実機で「when を開いたり閉じたりすると画面が動く」)。
  // 開く直前の高さを掴んで固定する — `useLayoutEffect` は state が入った直後・
  // ブラウザが描く前・矩形の resize が届く前に走るので、まだ縮んだ高さが取れる。
  const stageFrozen = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = shellRef.current?.querySelector<HTMLElement>("[data-stage]")?.parentElement;
    if (!el) return;
    if (when !== "") {
      if (stageFrozen.current == null) stageFrozen.current = el.offsetHeight;
      el.style.flex = "none";
      el.style.height = `${stageFrozen.current}px`;
    } else {
      stageFrozen.current = null;
      el.style.flex = "";
      el.style.height = "";
    }
  }, [when]);


  // ★★**閉じたら測り直す**(2026-08-18・第19巡)。開いているあいだは
  //   ずれも凍らせているので、閉じた時点で本当の値へ合わせ直す必要がある。
  //   凍らせている間の揺れは全部その場かぎりのものなので、ここで一度だけ
  //   追いつけばよい(揺れのたびに追いかけるから跳ねていた)。
  useEffect(() => {
    if (tool || when !== "") return;
    applyRef.current();
  }, [tool, when]);

  /**
   * 画面を離れる。★**閉じる動きを見せてから**呼び側へ返す(2026-08-18)。
   * 以前は即座に消えていて安っぽかった。`leftRef` が二重の呼び出しを防ぐ。
   */
  const leave = (run: () => void) => {
    if (leftRef.current) return;
    leftRef.current = true;
    keepFocus.current = false;
    // ★★★**滑り出しは React を待たない**(2026-08-18・第20巡)。
    //
    // これまでは state を立て、**再描画が終わってから**クラスが付いていた。
    // 器の中身(行・図形・帯)をまるごと描き直す間は動き出さず、そのぶんが
    // **そのまま「間」**として見えていた(実機で「閉じる時のアニメーションが
    // ワンテンポ遅れる」と報告)。出るときは rAF を2回待つのが正しかった
    // (第18巡)が、**閉じるときは逆** — 待つ理由が無い。触れた瞬間に DOM を
    // 直に書き、描き直しは動きながら追いつかせる。
    // ★★閉じる動きは**切り抜きの円が縮む**だけ(2026-08-19・第27巡)。
    //   要素の入れ替えも受け渡しも無いので、途中で測り直す瞬間が無い
    //   (第26巡は3つの要素をリレーしていて「2段階ガクッ」と報告された)。
    shrink();
    // ★★**後ろのアプリは「閉じ始めと同時」に明るさを戻し始める**(第28巡)。
    //   以前は入力画面が消えてから `[data-overlay]` が外れていたので、
    //   閉じる動き → 一瞬止まる → 明るくなる、と直列に見えていた。
    document.documentElement.dataset.leaving = "1";
    // ★キーボードを閉じるのは**滑り出した後**。iOS はここで矩形を作り直すので、
    //   先に呼ぶと動き出しがそのぶん遅れる。
    (document.activeElement as HTMLElement | null)?.blur();
    window.setTimeout(run, LEAVE_MS);
  };
  // キーボードが引っ込んだときは、そのまま書いたものを持って閉じる。
  leaveRef.current = () => leave(() => onClose(draftRef.current));

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
    // ★★★**画面いっぱいの板を必ず1枚敷く**(2026-08-19・第28巡)。
    //
    // 器(下の `data-composer-shell`)は **`visualViewport` の矩形**なので、
    // **キーボードの高さぶん、画面の下に器の外が残る**。iOS のキーボードの
    // 上に出る帯(^ v ✓ の操作バー)は**半透明**で、その裏に「器の外」が
    // 透けて見える — そこに居るのは後ろのアプリなので、実機で
    // **「キーボードの後ろにアプリが見えている」**と3度報告された。
    // `pushGround(LIFT, "overlay")` は html と theme-color を塗るが、
    // html は**アプリのシェルの下**なので、そこには出られない。
    //
    // ★第26巡はこの板を「後ろが退がるのが見えなくなる」と言って撤去したが、
    //   それは板に切り抜きが無かったから。**板も器も同じ円で切り抜く**
    //   (円はこの板が持ち、器はその子)なら、広がる途中は後ろがちゃんと見える。
    // ★色は **LIFT(帯の色)**。器の下端に見えているのは帯なので、そこから
    //   下も同じ色にすると継ぎ目が出ない(CHARCOAL にすると帯の色と食い違う)。
    <div ref={plateRef} data-composer-plate aria-hidden={false} style={{
      position: "fixed", inset: 0, zIndex: 59, background: LIFT,
    }}>
    {/* ★★★**器は一度置いたら二度と動かさない**(2026-08-18・第13巡)。
        寸法は録音のオーバーレイ(`VoiceOverlay`)と**同じ書き方**にしてある —
        ★★この類推は**間違いだった**(2026-08-19・第24巡で撤回)。`VoiceOverlay`
        には入力欄が1つも無く、キーボードが出ない。滑らかなのは「寸法を書き
        換えないから」ではなく**追う相手が居ないから**。器を動かさずに
        動いたことにする代用品(`--kb`)を積み上げた結果、11巡ぶん崩れ続けた。
        いまは `top`/`height` を `visualViewport` に合わせて書く。 */}
    <div ref={shellRef} data-composer-shell onMouseDown={keepKeyboard}
      style={{
      // ★★器は**見えている矩形そのもの**(2026-08-19・第24巡)。`top` と
      //   `height` は JS が `visualViewport` から書く(上の `place`)。ここは
      //   その初期値。`left`/`right` は固定で、**幅は一度も触らない**。
      // ★器そのものは**透明**。地は中の面(`data-surface`)が描く。
      // ★★板の子なので `absolute`。板は `fixed; inset: 0` なので、`top` に
      //   書く値の意味(画面の上端からの距離)は今までと変わらない。
      position: "absolute", left: 0, right: 0, top: 0, zIndex: 1, background: "transparent",
      height: "100lvh",
      display: "flex", flexDirection: "column",
      // ★★**`hidden` ではなく `clip`**(2026-08-18)。`hidden` の箱は**送れる箱**
      //   なので、iOS はキャレットを見せるためにそこを送ってくるし、
      //   スクロールバーも出す。`clip` は箱そのものを作らない。
      overflow: "clip",
      overscrollBehavior: "none",
    }}>
      {/* ★★★**地は動かない。動くのは器の切り抜き**(2026-08-19・第27巡)。
          ここは `inset: 0` の面をただ塗るだけ — `place()` が器の高さを
          どう書き換えても、面は必ず器そのものになる。
          ★★第26巡は Framer Motion の共有要素(`layoutId`)にしていたが、
          layout animation は「測った矩形へ合わせる transform」を焼き付ける。
          器は動き続けるので焼き付けた値がすぐ古くなり、実機で
          **キーボードの後ろに地が無い**状態になった(アイコンを何度か叩くと
          直る＝そこで測り直される)。**寸法の持ち主を二重にしない。** */}
      <div aria-hidden data-surface style={{
        position: "absolute", inset: 0, zIndex: 0, background: CHARCOAL,
      }} />
      {/* ★開発用の数値表示。**中身を包む面の外**に置く — 中に置くと崩れたとき
          数値まで一緒に流れて、いちばん知りたいときに読めない(第23巡)。 */}
      {probe && <ViewportProbe />}
      {/* ── 上のバー。閉じる / 削除 / 完了 は常時ここ。
             ★ポップオーバーの背面板(zIndex 1)より前に出す。でないと開いている
             あいだ「完了」も「閉じる」も叩けない(常時使えるのが約束)。 ── */}
      <div data-topbar className="tc-cue tc-cue-1" onMouseDown={keepKeyboard} style={{
        flexShrink: 0, display: "flex", alignItems: "center", gap: 8,
        padding: "max(8px, env(safe-area-inset-top)) 14px 4px",
        position: "relative", zIndex: 2,
      }}>
        {/* ★閉じる ✕ は置かない(2026-08-18にユーザー指定)。閉じ方は
            **画面の余白をタップする**か**キーボードを閉じる**の2つだけ。
            ボタンを1つ減らしても迷わない — どちらも指がもう居る場所にある。 */}
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
        className="tc-cue tc-cue-2"
        style={{ flex: 1, minHeight: 0, position: "relative", zIndex: 1 }}
      >
        {/* ★キーボードのぶんの追従は**アニメーションを持たない外側**に置く。
            `.tc-pop` は transform を animate するので、同じ要素に inline の
            transform を書いても animation に上書きされる(fill-mode: both)。 */}
        <div data-shape style={{ position: "absolute", inset: 0 }}>
          {/* 形が変わった瞬間だけ弾ませる(key を変えて animation を鳴らし直す)。 */}
          <div key={spec.sides.length} className="tc-pop" style={{ position: "absolute", inset: 0 }}>
            <ShapeStage spec={spec} title={preview.title} tag={tag} ready={settled} />
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
      {/* ★出入りの動きは持たない。器まるごとがスライドするので、ここが
          別の動きを持つと二重になる(2026-08-18・第16巡)。 */}
      <div data-dock className="tc-cue tc-cue-3"
        style={{
          flexShrink: 0, position: "relative", zIndex: 2,
          // ★★**キーボードのぶんを持ち上げるのはここだけ**(2026-08-18・第13巡)。
          //   器は動かさないので、これは**合成のやり直しだけ**で済む
          //   (レイアウトも塗り直しも起きない)。帯そのものは登場の動き
          //   (`.tc-sheet` = transform を animate)を持っているので、
          //   同じ要素に追従の transform は書けない。だから外側で持つ。
        }}>
        {/* ★帯の下を埋める板は**器の外**(`data-composer-plate`)が持つように
            なった(第28巡)。ここに置くと器の `overflow: clip` で切られるので、
            キーボードの裏には届かなかった。 */}
      <div data-band onMouseDown={keepKeyboard} style={{
        position: "relative", background: LIFT,
        borderRadius: "26px 26px 0 0",
        // 角丸が読めるように、地との境目へ影を落とす。
        boxShadow: "0 -16px 34px rgba(0,0,0,0.34)",
        // ★★キーボードが出ているあいだは**セーフエリアぶんを取らない**
        // (第25巡)。器の下端はキーボードの上端で、そこにホームバーは無い。
        // 34px 取ると丸ごと死んだ隙間になる(実機で「アイコンとキーボードまでの
        // 幅が大きすぎる」)。切り替えは器の `data-kb`(CSS 側・globals.css)。
        padding: "10px 16px max(6px, env(safe-area-inset-bottom))",
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
        {/* ★バーは出さない。1〜2行しか無いのに右端に細い棒が見えると
            「スクロールできてしまう画面」に見える(実機で報告)。 */}
        <div style={{
          maxHeight: "30vh", overflowY: "auto", overscrollBehavior: "contain",
          scrollbarWidth: "none", paddingBottom: 12,
        }}>
          {lines.map((text, i) => (
            <Row
              key={i === 0 ? "title" : subs[i - 1].id}
              ref={(el) => { rowsRef.current[i] = el; }}
              value={text}
              head={i === 0}
              done={i > 0 && subs[i - 1].done}
              keepFocus={keepFocus}
              justOpen={justOpenRef}
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
          // ★器が見えている矩形そのものなので、ここは**ただの下端**でよい
          //   (第24巡。`--kb` を見るなという注意書きごと不要になった)。
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
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(view, document.body);
}

// ── 図形の舞台。器の大きさを測って、その中央に1つ描く。 ──
function ShapeStage({ spec, title, tag, ready }: {
  spec: ReturnType<typeof specOf>; title: string; tag: TaskTag;
  /** 出る動きが終わったか。終わるまで焼かない(呼び側のコメントを参照)。 */
  ready: boolean;
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

  // ★★**情報を足して図形が変わるときの動き**(2026-08-19・第21巡にユーザー指定)。
  //
  // 前の絵を**残したまま重ねて**入れ替える。どちらの層も「いつも同じ見た目の
  // 大きさ」になるように動かすので、ディゾルブではなく**1つの図形が大きく
  // なっていく**ように見える(重要度を上げた／期日を近づけたのが目で追える)。
  // ★透ける瞬間を作らないので、点滅にはならない(第17巡の教訓)。
  const unit = Math.min(box.w / STAGE_SPAN_W, box.h / STAGE_SPAN_H);
  const paint: SolidPaint = useMemo(() => ({ spec, view: "name", tag, title }), [spec, tag, title]);
  // 描く中身が変わったかどうかの目印。
  const key = [spec.sides.join(""), spec.area.toFixed(3), spec.w.toFixed(3),
    spec.h.toFixed(3), spec.slabs, tag, title].join("|");
  const paintRef = useRef(paint);
  paintRef.current = paint;
  const lastRef = useRef<{ key: string; paint: SolidPaint } | null>(null);
  const [swap, setSwap] = useState<{ paint: SolidPaint; ratio: number } | null>(null);
  const alive = ready && box.w > 8 && box.h > 8;
  useEffect(() => {
    if (!alive) return;
    const last = lastRef.current;
    lastRef.current = { key, paint: paintRef.current };
    if (!last || last.key === key) return;
    // 面積の平方根 ＝ 辺の比。行き過ぎた比は詰める(見た目が破綻しないように)。
    const r = Math.sqrt((last.paint.spec.area || 1) / (paintRef.current.spec.area || 1));
    setSwap({ paint: last.paint, ratio: Math.min(2.5, Math.max(0.4, r)) });
    const t = window.setTimeout(() => setSwap(null), SOLID_SWAP_MS);
    return () => window.clearTimeout(t);
  }, [key, alive]);
  const prev = swap?.paint ?? null;
  const ratio = swap?.ratio ?? 1;
  // ★★★**動きは className では持たせない**(2026-08-19・第25巡)。
  //
  // `className={prev ? "swap-in" : "solid-in"}` にしていたので、入れ替えが
  // 終わって `prev` が消えた瞬間に**登場の動き(不透明度 0→1)が掛け直され**、
  // 更新のたびに一度光った — 実機で「図形が更新された後に点滅する」と
  // 報告されたのがこれ。★`key` の入れ替えも同じ理由で禁物(canvas ごと
  // 作り直されて、まっさらな1フレームが出る)。
  // だから**要素は据え置き、動きだけを付け外しする**。
  const liveRef = useRef<HTMLSpanElement | null>(null);
  const firstRef = useRef(true);
  useEffect(() => {
    const el = liveRef.current;
    if (!el || !alive) return;
    if (firstRef.current) {          // 初めて出るとき ＝ 登場の動き(1回だけ)
      firstRef.current = false;
      el.classList.add("tc-solid-in");
      return;
    }
    if (!swap) return;               // 入れ替えのときだけ掛け直す
    el.classList.remove("tc-solid-in", "tc-solid-swap-in");
    void el.offsetWidth;             // reflow を挟まないと animation が再開しない
    el.classList.add("tc-solid-swap-in");
  }, [swap, alive]);

  return (
    <div ref={ref} data-stage style={{
      position: "absolute", inset: "6px 22px 8px",
      // ★持ち上げは要らない(第24巡)。舞台は器の中の `flex: 1` で、器が
      //   見えている矩形そのものなので、**余りの真ん中にいるのが自動**。
      // ★★**ここで切る**(2026-08-18)。上の「一番大きい箱を持ち続ける」に
      // したことで、キーボードが出ているあいだ canvas は舞台より背が高くなる。
      // 切らずに置くと**器(overflow:hidden)に本物のはみ出しが生まれ**、iOS が
      // キャレットを見せようと器ごとスクロールしてしまう(実機で「アイコンと
      // タイトルのウィンドウがスクロールできて動く」と報告された)。
      // canvas は透明なので、切っても見た目は 1px も変わらない。
      // ★`hidden` ではなく **`clip`**。`hidden` は「送れる箱」なので、iOS は
      //   そこを送ってこられる。`clip` は箱そのものを作らない。
      overflow: "clip",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {alive && (
        <span style={{ position: "relative", display: "block", lineHeight: 0 }}>
          {/* ★前の絵。薄れながら新しい大きさへ寄っていく(下に置く)。 */}
          {prev && (
            <span aria-hidden className="tc-solid-swap-out" style={{
              position: "absolute", inset: 0, display: "block", lineHeight: 0,
              ["--sc-to" as string]: String(1 / ratio),
            }}>
              <SolidCanvas w={box.w} h={box.h} unit={unit} paint={prev} />
            </span>
          )}
          {/* ★いまの絵。初回は登場の動き、以降は前の大きさから寄ってくる。
              ★★**`key` を変えないこと**(2026-08-19・第25巡)。`key` を
              入れ替えると `SolidCanvas` ごと作り直され、**新しい canvas は
              まっさらな状態で1フレーム描かれる** ＝ 更新のたびに点滅した
              (実機で報告)。動きの掛け直しは下の effect が
              クラスを外して付け直す(reflow を挟む定石)。 */}
          <span ref={liveRef} style={{
            display: "block", lineHeight: 0,
            ["--sc-from" as string]: String(ratio),
          }}>
            <SolidCanvas
              w={box.w} h={box.h}
              // ★倍率を固定する。器に目一杯まで拡大すると、重要度や期限を変えても
              // 絵の大きさが変わらず「大きさ = 重要度」が読めなくなる。
              unit={unit}
              paint={paint}
            />
          </span>
        </span>
      )}
    </div>
  );
}

// ── 1行。題は大きく、手順は丸い点つきで小さく。高さは中身に合わせて伸びる。 ──
function Row({ ref, value, head, done, keepFocus, justOpen, onFocus, onChange, onEnter, onMergeUp, onToggle }: {
  ref: (el: HTMLTextAreaElement | null) => void;
  value: string;
  head: boolean;
  done: boolean;
  /** true のあいだ、フォーカスが外れたらその場で戻す(下の onBlur を参照)。 */
  keepFocus: React.RefObject<boolean>;
  /** 開いた直後の「守られた時間」か。この間は無条件に戻す。 */
  justOpen: React.RefObject<() => boolean>;
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
      <textarea
        ref={(el) => { own.current = el; ref(el); }}
        value={value}
        rows={1}
        placeholder={head ? "タスクの名前" : "手順"}
        onFocus={onFocus}
        // ★★**取りこぼしの受け皿**(2026-08-17・第6巡)。
        // 「重要度やタグを何度も押しているとキーボードが閉じる」を構造的に
        // 起こせなくする。ここで**同期的に** focus し直せば、iOS はキーボードを
        // 閉じない(非同期だと、もう閉じたあとなので開き直せない)。
        // 別の入力欄(メモ・持ち物)へ移るときと、画面を離れるとき・日程の
        // シートを開くとき(keepFocus=false)は通す。
        onBlur={(e) => {
          if (!keepFocus.current) return;
          const to = e.relatedTarget as HTMLElement | null;
          if (to && (to.tagName === "TEXTAREA" || to.tagName === "INPUT")) return;
          // ★画面の外(キーボードの「完了」やスワイプ)で外れたぶんは**戻さない**。
          //   それは「閉じたい」という意思なので、器の側が受けて画面ごと閉じる。
          // ★ただし**開いた直後だけは必ず戻す**(第18巡)。＋は `Press` では
          //   ないので `pressedRecently()` が false のまま ＝ この受け皿が
          //   黙ってしまい、開いた瞬間に閉じることがあった。
          if (!justOpen.current() && !pressedRecently()) return;
          e.currentTarget.focus();
        }}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // ★変換中(IME)の Enter は**確定の Enter**。行を割ってはいけない
          // (2026-08-18。日本語で変換するたびに手順が増えていた)。
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
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

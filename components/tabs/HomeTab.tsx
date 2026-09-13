"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Masthead } from "@/components/common";
import { AssignRail } from "@/components/home/AssignRail";
import { AssignSheet } from "@/components/home/AssignSheet";
import { Band } from "@/components/home/Band";
import { Pile } from "@/components/home/Pile";
import { fitUnit, offerRadiusOf, type Piece } from "@/components/home/pileWorld";
import { appTitle } from "@/lib/apps";
import { cardShapeOf } from "@/lib/cardShape";
import { KIND_DOMAIN, SHAPE_FACE, TASK_FACE } from "@/lib/constants";
import { bandRows, unreadCards, type BandItem } from "@/lib/homeBand";
import { haptic, todayKey } from "@/lib/helpers";
import { bodyInkOn, colorOfKind } from "@/lib/palette";
import { pullBus, type GhostSeed, type PullHost } from "@/lib/pullDrag";
import { clampRows } from "@/lib/solid";
import { rowsOf, specOf } from "@/lib/taskSize";
import type { AppState, Item, Task, TabProps } from "@/lib/types";

// ★★★**ホーム**（2026-09-07）。起動して最初に見る画面で、3アプリの**玄関**。
//
// **このアプリは時間管理でもタスク管理でもない。** AI が先回りして「いま自分に
// 最適なもの」を差し出す場で、仕事も週末も余暇も**同じ種類の提案**として扱う。
//
// 画面は上下2つ:
//   **上＝帯** … AI が差し出したものが流れる（`components/home/Band.tsx`）。
//   **下＝山** … 今日やると決めたものが積もる（`components/home/Pile.tsx`）。
// 帯のピルを掴んで引き下ろすと、図形に変わって山へ落ちる ―― この一続きの
// 動きが軸（★引き下ろしはこの次に作る）。

export function HomeTab({ appState, goTab, persist, showToast }: TabProps) {
  const day = todayKey();
  const today = useMemo(() => new Date(), []);
  const rows = useMemo(() => bandRows(appState), [appState]);
  const unread = useMemo(() => unreadCards(appState).length, [appState]);

  // ★★山にいるのは**今日のものだけ**（ユーザー確定）。だから山は説明が要らない
  //   ―― 日付のラベルもレーンも無い。
  //   ・四角 … 期日が今日（と、過ぎてまだ終わっていない）タスク。
  //   ・円  … **今日行くと決めた提案**（プランに入れた Item ＝ 旧バインド）。
  const pileTasks = useMemo(
    () => (appState.tasks ?? []).filter((t) => !t.done && t.dueDate && t.dueDate <= day),
    [appState.tasks, day],
  );
  // ★★★**提案の円は `Item.plannedFor` で拾う**（2026-09-14・第102巡）。
  //   ★それまでは `AppState.magazine` を見ていたが、**書き込む場所がもう無く**
  //   （`buildMagazine` の呼び手が 0 件）、**円は常に0個**だった。
  //   いまはタスクの四角（`dueDate <= 今日`）と**まったく同じ式**。
  const pileOffers = useMemo(
    () => (appState.items ?? []).filter(
      (i) => i.plannedFor && i.plannedFor <= day && i.status !== "done"),
    [appState.items, day],
  );

  // ★★★**その日まだ声を録っていなければ、JOURNAL の図形も山に落とす**
  //   （2026-09-09 ユーザー指定）。録ってあれば出さない ―― 済んだことを
  //   画面に残さない。押すと JOURNAL のレコードへ飛ぶ。
  // ★★★**形は録音の UI の「大きな円」そのもの**（2026-09-12 ユーザー指定）。
  //   文字は載せないので、ここは**あるか無いか**だけを渡す。
  const journal = useMemo(
    () => !(appState.voiceNotes ?? []).some((v) => (v.at ?? "").slice(0, 10) === day),
    [appState.voiceNotes, day],
  );

  // ── 引き下ろし（2026-09-14・第102巡） ─────────────────────────
  // ★★★**帯のピルを引くと図形になって落ち、日付が付く。** 算数は `lib/pullDrag.ts`、
  //   絵は山の canvas（`pilePaint.drawGhost`）、**決めごとはここ**。
  const boxRef = useRef<HTMLDivElement>(null);
  const [rail, setRail] = useState(false);
  /** 右端の ASSIGN で離したもの（＝カレンダーを開く相手）。 */
  const [assign, setAssign] = useState<{ title: string; accent: string; value?: string;
    put: (iso: string) => void } | null>(null);

  /** 帯のピルの id から元をたどる。★`lib/homeBand.ts` の id の作り方が唯一の約束。 */
  const srcOf = useCallback((it: BandItem) => {
    const id = it.id.slice(it.id.indexOf("-") + 1);
    if (it.kind === "someday") return { task: (appState.tasks ?? []).find((t) => t.id === id) };
    if (it.kind === "voice") return { cand: (appState.inbox ?? []).find((c) => c.id === id) };
    if (it.kind === "followup") return { sug: id, parent: it.parentId };
    return { item: (appState.items ?? []).find((x) => x.id === id) };
  }, [appState.tasks, appState.inbox, appState.items]);

  /** そのピルが山で持つ姿（大きさ・形・色）。★`null` なら引けない。 */
  const seed = useCallback((it: BandItem): GhostSeed | null => {
    const box = boxRef.current?.getBoundingClientRect();
    const bw = box?.width ?? 390; const bh = box?.height ?? 600;
    const unit = pullBus.unit;
    if (it.kind === "offer" || it.kind === "today") {
      const src = srcOf(it).item;
      const kind = src?.kind;
      const d = Math.min(offerRadiusOf(unit) * 2, bw * 0.52);   // ★同じ頭打ち
      const face = kind ? colorOfKind(kind) : it.face;
      return {
        kind: "offer", title: it.text, rows: 1, outlined: false,
        face, ink: bodyInkOn(face), faceIdx: SHAPE_FACE, w: d, h: d,
        shape: kind ? cardShapeOf(KIND_DOMAIN[kind]) : undefined,
        photo: it.photo, glyph: it.glyph,
      };
    }
    // ★タスク側 … 重要度は元があればそれ、無ければ中（`specOf` の既定）。
    const t = srcOf(it).task;
    const spec = specOf({ title: it.text, weight: t?.weight ?? 2, dueDate: day }, today);
    // ★★**器より大きく出さない**（`buildPieces` と同じ頭打ち）。まだ山に居ないものは
    //   一括の倍率の計算に入っていないので、抑えないと壁からはみ出した姿になる。
    const u = fitUnit(unit, spec.w, spec.h, bw, bh);
    return {
      kind: "task", title: it.text, rows: clampRows(rowsOf(it.text)),
      // ★★**落ちた先は「日付あり」＝塗り**（帯では輪郭だった）。変形の行き先は
      //   山での姿なので、ここで塗りへ切り替わるのが正しい。
      outlined: false, face: TASK_FACE, ink: bodyInkOn(TASK_FACE), faceIdx: SHAPE_FACE,
      w: Math.max(28, spec.w * u), h: Math.max(24, spec.h * u),
    };
  }, [srcOf, day, today]);

  /** ★日付を書き込む。**帯の段ごとに元が違う**ので、ここで1か所に集める。 */
  const put = useCallback((it: BandItem, iso: string) => {
    const next: AppState = structuredClone(appState);
    const id = it.id.slice(it.id.indexOf("-") + 1);
    const now = new Date().toISOString();
    if (it.kind === "someday") {
      const t = next.tasks.find((x) => x.id === id);
      if (t) t.dueDate = iso;
    } else if (it.kind === "voice") {
      // ★★**候補 → タスク**（`DriftTab` の `accept` と同じ形。2か所で作らない）。
      const c = (next.inbox ?? []).find((x) => x.id === id);
      if (!c) return;
      next.inbox = (next.inbox ?? []).filter((x) => x.id !== id);
      next.tasks.unshift({
        id: `task-${Date.now()}`, title: c.title, dueDate: iso,
        endDate: c.endDate, dueTime: c.dueTime, endTime: c.endTime,
        weight: c.weight ?? 2, note: c.note, done: false, createdAt: now,
      } as Task);
    } else if (it.kind === "followup") {
      // ★★**フォローアップ → タスク**。親の `suggestions` から外す（二重に出さない）。
      const parent = next.tasks.find((x) => x.id === it.parentId);
      const sug = parent?.suggestions?.find((x) => x.id === id);
      if (!parent || !sug) return;
      parent.suggestions = (parent.suggestions ?? []).filter((x) => x.id !== id);
      next.tasks.unshift({
        id: `task-${Date.now()}`, title: sug.title, dueDate: iso,
        weight: 2, done: false, createdAt: now,
      } as Task);
    } else {
      // ★★**提案は「その日に行く」だけ**（タスクにしない。ユーザー確定）。
      const x = (next.items ?? []).find((y) => y.id === id) as Item | undefined;
      if (!x) return;
      x.plannedFor = iso;
    }
    haptic(12);
    persist(next);
  }, [appState, persist]);

  const pull: PullHost = useMemo(() => ({
    box: boxRef,
    seed,
    rail: setRail,
    drop: (it, onRail) => {
      setRail(false);
      if (!onRail) { put(it, day); return; }
      // ★右端で離した … カレンダーへ。**まだ何も書かない**（選んで初めて決まる）。
      setAssign({
        title: it.text, accent: it.face,
        put: (iso) => { put(it, iso); setAssign(null); },
      });
    },
  }), [seed, put, day]);

  /** ★山の図形を右端で離したとき（日付を**付け直す**。ユーザー確定）。 */
  const assignPiece = useCallback((p: Piece) => {
    setRail(false);
    const task = (appState.tasks ?? []).find((t) => t.id === p.id);
    const item = (appState.items ?? []).find((i) => i.id === p.id);
    if (!task && !item) return;
    setAssign({
      title: task?.title ?? item?.title ?? "", accent: TASK_FACE,
      value: task?.dueDate ?? item?.plannedFor,
      put: (iso) => {
        const next: AppState = structuredClone(appState);
        const t = next.tasks.find((x) => x.id === p.id);
        if (t) t.dueDate = iso;
        const i = (next.items ?? []).find((x) => x.id === p.id);
        if (i) i.plannedFor = iso;
        haptic(12);
        persist(next);
        setAssign(null);
        if (iso > day) showToast("あとの日へ移しました");
      },
    });
  }, [appState, persist, day, showToast]);

  // ★★★**口とブラックホールは置かない**（2026-09-09 ユーザー指定で削除）。
  //   山で図形にできるのは**掴んで運ぶこと**だけ。完了も削除もここでは起こさない
  //   ―― 何をどうやって片づけるかは、引き下ろしの動きと一緒に決める。

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
      {/* ★左上の名前。**3アプリとまったく同じ組み方**（幾何アルファベットの
          `Masthead`）。ホームも列の1つなので、顔を揃える。 */}
      <Masthead title={appTitle("home")} />
      {/* ★★★**帯は山の上に重ねる**（2026-09-10 ユーザー指定「ピルの後ろに背景が
          あって図形が落ちてくるのが見えない」）。縦に並べると、山の器は帯の
          **下から**始まるので、**図形は帯の高さぶん見えないところを落ちてくる**。
          重ねれば器は名前の下から全部で、**図形はピルの後ろを通って**降りてくる。 */}
      {/* ★★★**山の器は列のパディングの外へ出す**（2026-09-11・`.bleed-x-b`）。
          内側に置くと、図形の壁が**画面の端から 32px**（列の 16 ＋ 壁の 16）になり、
          **画面の端から 16px のタブバーと揃わない**。外へ出して壁を `PILE_INSET`
          にすると、左右がタブバーと**同じ位置**になる。★帯と同じ扱い。
          ★★★**下も外へ出す**（第92巡）。タブの器は `paddingBottom: var(--nav-h)` を
          持つので、`.bleed-x` のままだと器が**タブバーの上で終わり**、そこへ
          `floorYOf`（タブバーの高さを引く式）を当てて**二重に引いていた** ――
          床が実機で 164px も浮き、山の下に大きな空きができていた。
          `.bleed-x-b` で器を**画面の底まで**伸ばすと、GRAVITY の器
          （`TaskSpace` の `.full-bleed`）と同じものになり、式がそのまま正しくなる。 */}
      <div ref={boxRef} className="bleed-x-b" style={{ position: "relative", flex: 1, minHeight: 0 }}>
        {/* 山。★器は名前の下の**残り全部**（左右は画面いっぱい）。 */}
        <Pile
          tasks={pileTasks} offers={pileOffers} unread={unread} today={today}
          journal={journal} onOpen={goTab}
          onRail={setRail} onAssign={assignPiece}
        />
        {/* 帯（2段）。★器の左右のパディングの外へ出る（`.bleed-x`）ので、
            左右とも画面の外へ切れる ＝「まだ続きがある」を形で言う。
            ★触れるのはピルだけ（`pointerEvents`）―― 帯の余白で山の操作を殺さない。 */}
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, pointerEvents: "none" }}>
          <Band rows={rows} pull={pull} />
        </div>
        {/* ★右端の ASSIGN の帯。掴んでいるあいだ、右の縁に近づくと出る。 */}
        <AssignRail show={rail} />
      </div>
      {assign && (
        <AssignSheet
          title={assign.title} accent={assign.accent} value={assign.value}
          onPick={assign.put} onClose={() => setAssign(null)}
        />
      )}
    </div>
  );
}

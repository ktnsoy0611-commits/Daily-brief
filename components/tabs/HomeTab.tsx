"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Masthead } from "@/components/common";
import { AssignRail } from "@/components/home/AssignRail";
import { AssignSheet } from "@/components/home/AssignSheet";
import { Band } from "@/components/home/Band";
import { Pile } from "@/components/home/Pile";
import { pillWidth } from "@/components/home/pillGhost";
import { OFFER_AREA, fitUnit, offerRadiusOf, type Piece } from "@/components/home/pileWorld";
import { groundOf } from "@/components/AppBackdrop";
import { appTitle } from "@/lib/apps";
import { cardShapeOf } from "@/lib/cardShape";
import { BAND_BEZEL, BAND_H, KIND_DOMAIN, SHAPE_FACE, TASK_FACE } from "@/lib/constants";
import {
  BAND_OFFER_TEXT, BAND_TEXT, bandLines, bandRows, isOutlined, pinBand, unreadEntries,
  type BandItem, type BandRowId,
} from "@/lib/homeBand";
import { keepCard } from "@/lib/keepCard";
import { useNewsBand } from "@/lib/newsFeed";
import { OFFER_PICKS, pickOffers } from "@/lib/offerPick";
import { haptic, todayKey } from "@/lib/helpers";
import { bodyInkOn, colorOfKind } from "@/lib/palette";
import {
  PILL_EDGE, pullBus,
  type GhostSeed, type LandingAt, type PillLook, type PullHost,
} from "@/lib/pullDrag";
import { clampRows } from "@/lib/solid";
import { rowSpecOf, rowsOf } from "@/lib/taskSize";
import { SPACE } from "@/lib/tokens";
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
  /**
   * ★★★**山から帯へ戻した id は、段の上限で切り落とさない**（第111巡）。
   *   理由は `lib/homeBand.ts` の `bandRows` の `keepId`（黙って消えていた）。
   */
  const [keepId, setKeepId] = useState<string | null>(null);
  // ★★★**帯の3段目＝ニュース**（2026-09-18・第122巡）。**中身は `lib/newsFeed.ts`**。
  //   ★★**`AppState` に入れない**（外の世界のもの。理由はあのファイルの頭）ので、
  //     ここだけが非同期に届く ―― 届くまでは段そのものが出ない。
  const news = useNewsBand(appState);
  const rows = useMemo(
    () => bandRows(appState, keepId, news), [appState, keepId, news]);

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
  // ★★★**写真のあるものだけ**（2026-09-19・第124巡にユーザー指定
  //   「**ホームに落ちてくる提案は画像があるもの限定に**」）。理由は
  //   `lib/offerPick.ts` の同じ門と同じ ―― 山の提案は**写真を切り抜いた絵**。
  const pileOffers = useMemo(
    () => (appState.items ?? []).filter(
      (i) => i.plannedFor && i.plannedFor <= day && i.status !== "done" && !!i.images?.[0]),
    [appState.items, day],
  );
  /**
   * ★★★**その日の「好みそうな」提案を3件、山へ落とす**（2026-09-17・第119巡に
   * ユーザー指定「**Explore で溜まっている（もしくは新着の）もののうち最も
   * おすすめなのを3件ほど抽出し、ホームに落とす。タップするとExploreの
   * そのカードに飛べるように**」）。
   * ★選び方は `lib/offerPick.ts`（**AI は使わない**。理由はあのファイルの頭）。
   * ★★**まだ KEEP していないカード**なので `Item` ではない ―― 山の中では
   *   ストックの提案とまったく同じ絵で、**押すと Explore のそのカードへ飛ぶ**。
   */
  // ★★★**山の提案は合わせて `OFFER_PICKS`(2) 枚まで**（第128巡にユーザー指定
  //   「**提案の図形は最大2個に**」）。★★**今日へ割り当てた提案（`pileOffers`）は
  //   削らない** ―― それはユーザーが自分で決めた予定なので、黙って隠すと今日の
  //   山から予定が消える。**減らすのはおすすめのほう。**
  const picks = useMemo(() => pickOffers(
    appState, Math.max(0, OFFER_PICKS - pileOffers.length)).map(
    ({ ed, card }) => ({ ed, card })), [appState, pileOffers.length]);

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
  /**
   * ★★★**引いているあいだ、山の canvas を帯の上へ上げる**（2026-09-14・第105巡）。
   * 写し取ったピルは山の canvas に描かれるので、上げないと**下の段のピルの後ろへ
   * 潜る**。★1ジェスチャに1回しか変わらないので、毎フレームの描き直しにならない。
   */
  const [lift, setLift] = useState(false);
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
      // ★★**提案（`offer`）にはまだ `Item` が無い**ので、`kind` は**帯が持っている
      //   ほうを先に見る**（`BandItem.itemKind`。第118巡）。無いと札の形が付かない。
      const src = srcOf(it).item;
      const kind = it.itemKind ?? src?.kind;
      const d = Math.min(offerRadiusOf(unit) * 2, bw * 0.52);   // ★同じ頭打ち
      const face = kind ? colorOfKind(kind) : it.face;
      return {
        kind: "offer", title: it.text, rows: 1, outlined: false,
        face, ink: bodyInkOn(face), faceIdx: SHAPE_FACE, w: d, h: d,
        // ★★**`buildPieces` の提案とまったく同じ数**（`OFFER_AREA`）。
        //   ★代理の体の重さに使う ―― 山と密度が違うと2つのソルバが喧嘩する。
        area: OFFER_AREA,
        shape: kind ? cardShapeOf(KIND_DOMAIN[kind]) : undefined,
        photo: it.photo, label: it.label,
      };
    }
    // ★★★**ホームは重要度を持たない**（第116巡）。段の高さを物差しにした箱
    //   （`rowSpecOf`）を、山とまったく同じ式で読む。
    const spec = rowSpecOf({ title: it.text });
    // ★★**器より大きく出さない**（`buildPieces` と同じ頭打ち）。まだ山に居ないものは
    //   一括の倍率の計算に入っていないので、抑えないと壁からはみ出した姿になる。
    const u = fitUnit(unit, spec.w, spec.h, bw, bh);
    return {
      kind: "task", title: it.text, rows: clampRows(rowsOf(it.text)),
      // ★★**落ちた先は「日付あり」＝塗り**（帯では輪郭だった）。変形の行き先は
      //   山での姿なので、ここで塗りへ切り替わるのが正しい。
      outlined: false, face: TASK_FACE, ink: bodyInkOn(TASK_FACE), faceIdx: SHAPE_FACE,
      w: Math.max(28, spec.w * u), h: Math.max(24, spec.h * u),
      // ★★**`buildPieces` のタスクとまったく同じ数**（`spec.area`）。上の注釈。
      area: spec.area,
    };
  }, [srcOf]);

  /**
   * ★日付を書き込む。**帯の段ごとに元が違う**ので、ここで1か所に集める。
   * ★★★`at` ＝ **指を離した所と勢い**（2026-09-14・第103巡）。山はその1つだけ
   *   **上からではなくそこから**落とす。**新しいタスクの id はここで作る**ので、
   *   `pullBus.landing` に id を結び付けられるのもここだけ。
   */
  const put = useCallback((it: BandItem, iso: string, at?: LandingAt | null) => {
    const next: AppState = structuredClone(appState);
    const id = it.id.slice(it.id.indexOf("-") + 1);
    const now = new Date().toISOString();
    /** ★山で落ちてくる相手の id（段によって違う）。 */
    let landOn = id;
    if (it.kind === "someday") {
      const t = next.tasks.find((x) => x.id === id);
      if (t) t.dueDate = iso;
    } else if (it.kind === "voice") {
      // ★★**候補 → タスク**（`DriftTab` の `accept` と同じ形。2か所で作らない）。
      const c = (next.inbox ?? []).find((x) => x.id === id);
      if (!c) return;
      next.inbox = (next.inbox ?? []).filter((x) => x.id !== id);
      landOn = `task-${Date.now()}`;
      next.tasks.unshift({
        id: landOn, title: c.title, dueDate: iso,
        endDate: c.endDate, dueTime: c.dueTime, endTime: c.endTime,
        weight: c.weight ?? 2, note: c.note, done: false, createdAt: now,
      } as Task);
    } else if (it.kind === "followup") {
      // ★★**フォローアップ → タスク**。親の `suggestions` から外す（二重に出さない）。
      const parent = next.tasks.find((x) => x.id === it.parentId);
      const sug = parent?.suggestions?.find((x) => x.id === id);
      if (!parent || !sug) return;
      parent.suggestions = (parent.suggestions ?? []).filter((x) => x.id !== id);
      landOn = `task-${Date.now()}`;
      next.tasks.unshift({
        id: landOn, title: sug.title, dueDate: iso,
        weight: 2, done: false, createdAt: now,
      } as Task);
    } else if (it.kind === "offer") {
      // ★★★**まだ読んでいない提案には `Item` がまだ無い**（2026-09-17・第118巡）。
      //   `offer-<card.id>` の中身は `generatedDecks` に居るだけなので、
      //   **`items.find` は原理的に当たらない** ―― 第117巡まではここで黙って
      //   return しており、帯からは消えるのに何も増えなかった（ユーザー報告
      //   「**ドラッグしてホームで離しても、追加されず消えてしまった**」）。
      // ★★★**引き下ろす ＝ KEEP ＋ その日に行く**。KEEP の式は
      //   `lib/keepCard.ts` の1か所（BriefTab と共有）。
      const e = unreadEntries(next).find((x) => x.card.id === Number(id) || String(x.card.id) === id);
      if (!e) return;
      landOn = keepCard(next, e.ed, e.card);
      const made = next.items.find((y) => y.id === landOn) as Item | undefined;
      if (made) made.plannedFor = iso;
    } else {
      // ★★**提案は「その日に行く」だけ**（タスクにしない。ユーザー確定）。
      const x = (next.items ?? []).find((y) => y.id === id) as Item | undefined;
      if (!x) return;
      x.plannedFor = iso;
    }
    // ★★**書き込む前に落とし所を置く**（`Pile` が次に山を組むとき1度だけ使う）。
    //   ★あとの日へ回したものは山に落ちないので、置いても無害（使われない）。
    pullBus.landing = at ? { ...at, id: landOn } : null;
    haptic(12);
    persist(next);
  }, [appState, persist]);

  /** ★帯の下端（器の座標）。★**山は帯を知らない**ので、ここで測って渡す。 */
  const bandRef = useRef<HTMLDivElement>(null);
  const bandBottom = useCallback(() => {
    const band = bandRef.current?.getBoundingClientRect();
    const box = boxRef.current?.getBoundingClientRect();
    return band && box ? band.bottom - box.top : 0;
  }, []);

  /**
   * ★★★**その図形が戻る段と、その段の中心**（器の座標。2026-09-15・第110巡）。
   * ★★★**「上が row0・下が row1」と決め打ちできない** ―― `BandRow` は
   *   `if (!items.length) return null` で**空の段を描かない**ので、提案しか
   *   無い日は下の段そのものが DOM に存在しない。**実測して返す。**
   * ★段の分け方は `unassign` と同じ切り分け（提案＝上／タスク＝下）。
   */
  const rowCenter = useCallback((row: BandRowId) => {
    const box = boxRef.current?.getBoundingClientRect();
    const el = bandRef.current?.querySelector<HTMLElement>(`[data-band-row="${row}"]`);
    if (!box || !el) return null;
    const r = el.getBoundingClientRect();
    return r.top + r.height / 2 - box.top;
  }, []);
  /**
   * ★★★**帯のその場所へ置く**（`after` の次。空文字なら段の先頭。第114巡）。
   * ★引き抜いたピルを**別の場所へ入れ直す**ときの唯一の口 ―― 日付は付けない。
   */
  const pin = useCallback((bandId: string, after: string) => {
    const next: AppState = structuredClone(appState);
    pinBand(next, bandId, after);
    haptic(10);
    persist(next);
  }, [appState, persist]);

  const pull: PullHost = useMemo(() => ({
    box: boxRef,
    seed,
    rail: setRail,
    lift: setLift,
    bandBottom,
    rowCenter,
    pin,
    drop: (it, onRail, at) => {
      setRail(false);
      if (!onRail) { put(it, day, at); return; }
      // ★右端で離した … カレンダーへ。**まだ何も書かない**（選んで初めて決まる）。
      //   ★★**落とし所は持ち越さない** ―― カレンダーを開いている間に指は離れて
      //   いるので、そこから落ちてくるのは嘘になる。ふつうに上から落とす。
      setAssign({
        title: it.text, accent: it.face,
        put: (iso) => { put(it, iso); setAssign(null); },
      });
    },
  }), [seed, put, day, bandBottom, rowCenter, pin]);

  /**
   * ★★★**山の図形を帯へ戻すときのピルの顔**（2026-09-15・第106巡にユーザー指定
   * 「**間違えて落としたピルをもう一度掴んで上の段に入れると戻る**」）。
   *
   * ★★**帯の規則をそのまま読む** ―― 段（`BAND_ROW`）・塗りか輪郭か（`isOutlined`）・
   *   字の大きさ・余白は `components/home/Band.tsx` と同じトークンから引く。
   *   **幅だけは実測**（`pillWidth`。帯にまだ無いピルなので写し取る元が無い）。
   */
  const pillOf = useCallback((p: Piece): PillLook | null => {
    if (p.kind !== "task" && p.kind !== "offer") return null;   // ★板・カセット・未読は戻せない
    const head = p.kind === "offer";
    const face = head ? p.face : TASK_FACE;
    // ★★第128巡から帯のピルは全部ベタ塗り（`isOutlined` は常に偽）。
    const outlined = isOutlined(head ? "offer" : "someday");
    const base = {
      h: head ? BAND_H.photo : BAND_H.plain, press: 1,
      face, ink: outlined ? bodyInkOn(groundOf("home")) : bodyInkOn(face),
      outlined, ground: groundOf("home"),
      text: p.title ?? "", textSize: head ? BAND_OFFER_TEXT : BAND_TEXT,
      lines: bandLines(p.title ?? "", head),
      photo: undefined, dia: BAND_H.photo - BAND_BEZEL * 2, gap: SPACE.sm,
      padL: (outlined ? PILL_EDGE : 0) + SPACE.lg,
      padR: (outlined ? PILL_EDGE : 0) + SPACE.lg,
    };
    return { ...base, w: pillWidth(base, window.innerWidth) };
  }, []);

  /**
   * ★★★**帯の上で離した＝日付を消して帯へ戻す**（同ユーザー指定）。
   * ★★**規則は1本だけ** … タスクは `dueDate` を、提案は `plannedFor` を消す。
   *   声の候補やフォローアップから生まれたタスクも**ただの「日付なしタスク」**に
   *   戻る（元の候補には戻さない ―― 戻す先がもう無いし、**帯の下の段に出るので
   *   結果は同じ**）。
   */
  const unassign = useCallback((p: Piece, after: string | null) => {
    const next: AppState = structuredClone(appState);
    // ★★★**おすすめの提案を帯へ運んだら KEEP する**（2026-09-17・第119巡）。
    //   まだ `Item` が無いカードなので、消す `plannedFor` も無い ―― 代わりに
    //   **ストックへ入れる**（式は `lib/keepCard.ts` の1か所）。
    //   ★★これで**山のおすすめは「押せば読む／帯へ運べば取っておく」**の2つを持つ。
    const pick = p.card ? picks.find((x) => String(x.card.id) === p.card) : undefined;
    if (pick) {
      const made = keepCard(next, pick.ed, pick.card);
      if (after !== null) pinBand(next, `today-${made}`, after);
      setKeepId(`today-${made}`);
      haptic(12);
      persist(next);
      showToast("ストックへ入れました");
      return;
    }
    const t = next.tasks.find((x) => x.id === p.id);
    if (t) { delete t.dueDate; delete t.endDate; }
    const i = (next.items ?? []).find((x) => x.id === p.id);
    if (i) delete i.plannedFor;
    if (!t && !i) return;
    // ★★★**離した所へ留め金を打つ**（2026-09-16・第114巡。規則は `lib/homeBand.ts`）。
    //   ★★★**第112巡は `tasks` の並びそのものを替えていた** ―― それだと
    //     ① GRAVITY の山と ALIGN の一覧まで動き、② 声の候補とフォローアップは
    //     持ち主が別なので**動かせず**、「任意のピルとピルの間」が作れなかった。
    //   ★★**留め金は表示の並びだけ**を持つので、5種類すべてを置ける。
    //   ★`after` ＝ その隙間の左どなりの id（空文字なら段の先頭）。
    const bandId = t ? `someday-${p.id}` : `today-${p.id}`;
    if (after !== null) pinBand(next, bandId, after);
    // ★★★**戻したものは段の上限で切られない**（第111巡。`bandRows` の `keepId`）。
    //   ★★これが無いと、下の段が 9件 埋まっているとき**「帯へ戻しました」と出るのに
    //     帯に現れない**（ユーザー報告「**どこかに消えてしまう**」）。
    setKeepId(bandId);
    haptic(12);
    persist(next);
    showToast("帯へ戻しました");
  }, [appState, persist, showToast, picks]);

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
          tasks={pileTasks} offers={pileOffers} picks={picks} today={today}
          journal={journal} onOpen={goTab} above={lift}
          onRail={setRail} onAssign={assignPiece}
          bandBottom={bandBottom} pillOf={pillOf} onUnassign={unassign}
          rowCenter={rowCenter}
        />
        {/* 帯（2段）。★器の左右のパディングの外へ出る（`.bleed-x`）ので、
            左右とも画面の外へ切れる ＝「まだ続きがある」を形で言う。
            ★触れるのはピルだけ（`pointerEvents`）―― 帯の余白で山の操作を殺さない。 */}
        <div ref={bandRef}
          style={{ position: "absolute", left: 0, right: 0, top: 0, pointerEvents: "none" }}>
          <Band rows={rows} pull={pull} />
        </div>
        {/* ★右端の ASSIGN の帯。掴んでいるあいだ、右の縁に近づくと出る。
            ★★★**必ず `overflow: hidden` の器で包む**（2026-09-14・第103巡）。
            帯は隠れている間ずっと `translateX(100%)` で**器の右外へ 48px 出ている**
            ので、包まないと**列が横にスクロールできてしまい**、指で送ると
            ASSIGN が見える（ユーザー報告）。★列の側にも `overflowX: "clip"` を
            入れてあるが（`components/AppShell.tsx`）、**はみ出す側でも止める**。 */}
        <div aria-hidden style={{
          // ★★山の絵（`zIndex: 2`。第132巡に帯より上へ）よりさらに上。
          position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 3,
        }}>
          <AssignRail show={rail} />
        </div>
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

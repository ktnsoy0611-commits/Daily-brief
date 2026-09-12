import { INK, JOURNAL_FACE, LATIN, RUST, SHAPE_FACE, SWISS_XL, TASK_FACE } from "@/lib/constants";
import { CASSETTE_ASPECT } from "@/lib/cassette";
import { ACCENT_TEST, accentOf } from "@/lib/appAccent";
import { pad } from "@/lib/helpers";
import { bodyInkOn, colorOfKind } from "@/lib/palette";
import { glyphOfKind } from "@/lib/deckStyle";
import { areaOf, specOf, weightArea } from "@/lib/taskSize";
import { PILE_INSET, floorYOf } from "@/lib/pileBox";
import {
  WD_FULL, makeWordBody, measureWordPlate, wordFontSize, type WordPlate,
} from "@/lib/wordPlate";

import type { Body, Engine } from "matter-js";
import type { Item, TabId, Task } from "@/lib/types";

// ★★★**山の「世界」**（2026-09-11・第92巡に `components/home/Pile.tsx` から分けた）。
// 物理の値・器の壁・図形の作り方だけがここに居る。**画面と指の扱いは `Pile.tsx`、
// 焼き方は `pilePaint.ts`。**
//
// ★★**物理は既存の GRAVITY と同じ**（重力・摩擦・跳ね・落下の速さ）。値は
//   `components/tabs/GravityTab.tsx` から**そのまま写してある** ―― あちらは
//   画面まるごとを占めるタブで、3つのモード・スワイプ・入力画面を内蔵して
//   いるので、帯の下の器としては使えない（ユーザー確定「gravity とホームは
//   別物。gravity の基本的な構造を使ってホームを作ったあと、task は全く別の
//   UI に変更する」）。★★**片方の値を触ったらもう片方も直すこと。**
//
// ★★**形は3つだけ**（意味づけはしない）:
//   ・**角丸の四角** … タスク。文字が組める唯一の形で、1件が1つ（まとめない）。
//   ・**円** … 提案。★**写真が入るのは円だけ**。
//   ・**トゲトゲの円** … まだ見ていない提案の残り数。数字を中に置き、0 で消える。
// ★★**色は帯から引き継ぐ** ―― 上でその色だったものが、下りても同じ色のまま
//   形だけ変わる（タスク＝タグの色／提案＝そのカードの色）。
// ★大きさ＝**重要度 × 締切の近さ**（既存の `areaOf`。GRAVITY と同じ式）。

type M = typeof import("matter-js");

// ── 物理（★`GravityTab` と同じ値。目盛りの外＝物理の場） ──────────────
export const GRAVITY_Y = 1.4;
const UNIT = 64;
const MASS_K = 1.6;
const BODY = { restitution: 0.04, friction: 0.55, frictionStatic: 0.9, frictionAir: 0.012 };
const WALL_T = 200;
/** 山が器に占める割合。★目盛りの外（詰め込み具合）。
 *  ★★**帯が厚いほど山の取り分が減る**ので、帯の厚み（`BAND_H`）とセットで決める。
 *  ★2026-09-10 に **0.36** ―― 文字の板と未読の図形を予算に数えるようにしたぶん。 */
const FILL = 0.36;
/** ★★**1つの図形が器に対して取ってよい上限**（`GravityTab` の `FIT_W`/`FIT_H` と
 *  同じ考え方）。面積の予算だけだと、重要度の高い1枚が器の半分を覆ってしまう。
 *  ★★★**面積の予算は「横に2つ並ぶ」を前提にしている**ので、幅は半分あたりに
 *  抑える ―― 0.68 では1行に1枚しか載らず、山ではなく**塔**になった（第90巡に実測）。 */
const FIT_W = 0.52;
const FIT_H = 0.28;
/** ★提案の円の大きさ。**いちばん重いタスク × これ**（2026-09-08 に 1 → 1.6）。 */
const OFFER_K = 1.6;
/** 未読のトゲトゲの円。★12頂点・内半径 0.40（`docs/home-spec.md` §5-b）。 */
export const ZIG_N = 12;
const ZIG_IN = 0.4;
/** ★未読の数の図形。**数字を読ませる図形**なので、タスクより大きく取る。 */
const BADGE_R = 44;
/** ★★★落とし方は `GravityTab` と**同じ**（傾き・回り・横の初速）。
 *  ★★★2026-09-09 に**回り慣性の細工を全部やめた**（ユーザー指定「ひっくり返っても
 *  なんでもいいので自然に落としてください」）。`setInertia` で回りにくくすると、
 *  **質量と形から決まる本来の慣性と食い違う** ―― 落ちるあいだは重そうなのに、
 *  ぶつかった瞬間だけ勝手に向きが戻る、という物体に見えない動きになる。 */
const SPAWN_TILT = 0.5;      // 初期の傾き（±0.25 rad ≒ ±14°）
const SPAWN_SPIN = 0.05;     // 初期の回り
const SPAWN_VX = 1.2;        // 横の初速
/** ★★★**山の器（左右の内寸と床）は `lib/pileBox.ts`**（第91巡）。 */
const INSET = PILE_INSET;
/**
 * ★★★**落とす間隔は「時間」で取る**（2026-09-09。それまでは「高さ」で取っていた）。
 * 高さで取ると**山が大きいほど出どころが空の彼方へ行く** ―― 実測（器 573px）…
 * 9個で最上段が **-1571px ＝ 器の 2.7 枚ぶん上**。着地が叩きつけになった。
 */
export const DROP_EVERY_MS = 60;
/**
 * 出どころの高さ＝**自分の背丈の半分 ＋ `DROP_ABOVE` ＋ 0〜`DROP_SCATTER`**。
 * ★★★**高さをばらす**（2026-09-11）。等間隔に1つずつ落とすと、どれも同じ速さで
 * 同じ距離を落ちるので、**一列に並んで順番に降りてくる**（コンベアに見えた）。
 */
const DROP_ABOVE = 24;
const DROP_SCATTER = 200;
/** 板の字を組む幅（山の**内寸**に対する割合）。★GRAVITY は 0.66、ホームは大きめ。 */
const WORD_W = 0.84;

/**
 * ★★★**トゲトゲの円の輪郭**（2026-09-09）。**絵と物理でここ1つを共有する。**
 * 前は絵がトゲトゲ・物理が**まん丸**で、①掴もうとしても円の当たり判定と
 * ずれる ②トゲが床に引っかからず**玉のように滑る**、の2つが起きていた。
 */
export function zigVerts(r: number): { x: number; y: number }[] {
  return Array.from({ length: ZIG_N * 2 }, (_, i) => {
    const a = (i / (ZIG_N * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = r * (i % 2 === 0 ? 1 : ZIG_IN + 0.5);
    return { x: Math.cos(a) * rr, y: Math.sin(a) * rr };
  });
}

const frac = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (Math.imul(h, 2654435761) >>> 0) / 4294967296;
};

export interface Piece {
  id: string;
  body: Body;
  kind: "task" | "offer" | "badge" | "word" | "cassette";
  /** 角丸の四角の外接箱（タスク）。円は `r`。 */
  w?: number; h?: number; r?: number;
  face: string;
  ink: string;
  title?: string;
  face_?: number;      // 書体の番号（タグが決める）
  /**
   * ★★★**日付が無い＝輪郭線だけ**（2026-09-12・第93巡）。中は地と同じ色で塗り、
   * 縁と字はメインカラー ―― **帯のピルとまったく同じ見え方**。
   */
  outlined?: boolean;
  photo?: string;
  /** ★写真が無い提案の顔（「展」「場」）。 */
  glyph?: string;
  count?: number;
  /** 文字の板（日付・曜日）だけが持つ。★寸法も描き方も `lib/wordPlate.ts`。 */
  plate?: WordPlate;
  /** ★★**押すと行き先がある図形**（未読の数＝ブリーフ／ジャーナル＝レコード）。 */
  nav?: TabId;
}

/**
 * ★★**壁は器の内側**（`GravityTab` の `PILE_INSET` と同じ）。器の縁ぴったりに
 * 置くと、出どころ（`INSET` の内側）と壁がずれて**壁際で押し合う**。
 * ★★床は**タブバーの上から `GROUND_LIFT` 浮かせる**（`floorYOf`）。器は
 * `.bleed-x-b` で**画面の底まで**伸びているので、この式がそのまま正しい。
 */
export function makeWalls(m: M, bw: number, bh: number): Body[] {
  const floorY = floorYOf(bh);
  return [
    m.Bodies.rectangle(bw / 2, floorY + WALL_T / 2, bw + WALL_T * 2, WALL_T, { isStatic: true, friction: 0.6 }),
    m.Bodies.rectangle(INSET - WALL_T / 2, bh / 2, WALL_T, bh * 3, { isStatic: true, friction: 0.4 }),
    m.Bodies.rectangle(bw - INSET + WALL_T / 2, bh / 2, WALL_T, bh * 3, { isStatic: true, friction: 0.4 }),
  ];
}

export interface PileContent {
  tasks: Task[];
  offers: Item[];
  unread: number;
  today: Date;
  /** ★その日まだ声を録っていないか（真なら録音のダイヤルの円を落とす）。 */
  journal: boolean;
}

/**
 * ★★★**山の中身を1式作る**（世界には入れない ―― 入れるのは `Pile.tsx` の
 * ループが**時間をずらして1つずつ**やる。まとめて入れると全部が同時に落ち始め、
 * 順番を作るために出どころを空の彼方まで持ち上げる羽目になる）。
 */
export function buildPieces(m: M, c: PileContent, w: number, h: number): Piece[] {
  const { tasks, offers, unread, today, journal } = c;

  // ★★★**その日まだ声を録っていなければ、JOURNAL の図形も落とす**（2026-09-09）。
  // ★★★**形は JOURNAL のタブのアイコン（カセット）そのもの**（2026-09-13・第94巡に
  //   ユーザー指定「現在の journal のタブのアイコンを図形にして落として。四角い
  //   部分がブルーで他が黒」）。第93巡の「録音の円」からさらに一歩 ――
  //   **行き先の顔をそのまま持ってくる**ので、何が起きるか説明が要らない。
  //   ★寸法は `lib/cassette.ts`（タブの SVG と同じ数を読む）。
  const jDue = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  // ★**面積は今までと同じ**（重要度 2 ＋ 今日が期限）。変えると山の詰まり具合が動く。
  const jArea = journal ? areaOf({ title: "", weight: 2, dueDate: jDue }, today) : 0;
  // カセットの外接箱（solid 座標）。★面積を保ったままアイコンの比にする。
  const jW = jArea > 0 ? Math.sqrt(jArea * CASSETTE_ASPECT) : 0;
  const jH = jArea > 0 ? Math.sqrt(jArea / CASSETTE_ASPECT) : 0;

  // ★★★**文字の板は先に決めて、器の予算から差し引く**（2026-09-10）。
  //   板は器の幅の `WORD_W` を取る**いちばん大きな塊**なので、予算に数えないと
  //   山の総面積が跳ね上がる（実測 80%）。詰まった山は解けずに押し合って震える。
  // ★★字の大きさは**長いほう（曜日）で決めた1つの値**を両方に使う（第67巡）。
  const words = [`${today.getMonth() + 1}/${today.getDate()}`, WD_FULL[today.getDay()]];
  const room = (w - INSET * 2) * WORD_W;
  const wordFs = wordFontSize(words, room, LATIN, SWISS_XL);
  const plates = words.map((wd) => measureWordPlate(wd, wordFs, room, INK, LATIN));

  // ★★★**予算は「図形が居られる高さ」で取る** ―― 器の高さ `h` ではなく**床まで**。
  const usableH = Math.max(120, floorYOf(h));
  const areas = [
    ...tasks.map((t) => areaOf(t, today)),
    ...offers.map(() => weightArea(3) * OFFER_K),
    ...(jArea > 0 ? [jArea] : []),
  ];
  const total = areas.reduce((a, b) => a + b, 0) || 1;
  const fixed = plates.reduce((a, pl) => a + pl.w * pl.h, 0)
    + (unread > 0 ? Math.PI * BADGE_R * BADGE_R : 0);
  const budget = Math.max(w * usableH * FILL * 0.25, w * usableH * FILL - fixed);
  // ★★★**下限で予算を破らない**。以前は 16 を床にしていたので、件数が多い日は
  //   予算を無視して大きいまま出て、器に入り切らなかった。
  let unit = Math.min(UNIT, Math.sqrt(budget / total));
  // ★★いちばん大きな図形が器からはみ出さないところまで、**全体を**縮める。
  //   1枚だけ縮めない ―― 図形どうしの大きさの比がそのまま重要度なので。
  for (const sp of [
    ...tasks.map((t) => specOf(t, today)),
    ...(jW > 0 ? [{ w: jW, h: jH }] : []),
  ]) {
    unit = Math.min(unit, (w * FIT_W) / Math.max(1, sp.w), (usableH * FIT_H) / Math.max(1, sp.h));
  }
  unit = Math.max(10, unit);

  const pieces: Piece[] = [];
  // ★★落とし方は `GravityTab` と同じ ―― **どこへ・どの高さから落ちるか**で
  //   ばらつきを作り、傾きと回りは控えめに添える。
  const spawnX = (bw: number, r1: number) => {
    const half = bw / 2;
    const lo = INSET + half + 4;
    const hi = Math.max(lo, w - INSET - half - 4);
    return Math.min(hi, Math.max(lo, INSET + (w - INSET * 2) * (0.08 + r1 * 0.84)));
  };
  let nth = 0;
  const toss = (body: Body, seed: string, bh: number) => {
    const r1 = frac(seed); const r2 = frac(`${seed}y`); const r3 = frac(`${seed}a`);
    const up = bh / 2 + DROP_ABOVE + r2 * DROP_SCATTER;
    body.plugin = { ...(body.plugin ?? {}), releaseAt: nth++ * DROP_EVERY_MS };
    m.Body.setPosition(body, { x: spawnX(body.bounds.max.x - body.bounds.min.x, r1), y: -up });
    m.Body.setAngle(body, (r3 - 0.5) * SPAWN_TILT);
    // ★★**回りは形の大小で加減しない**（2026-09-09）。大きさで割ると、小さい
    //   ものだけ空中で止まって見える。同じ初速を与えて、あとは形に任せる。
    m.Body.setAngularVelocity(body, (r3 - 0.5) * SPAWN_SPIN);
    m.Body.setVelocity(body, { x: (r1 - 0.5) * SPAWN_VX, y: 0 });
  };

  // ★★★**その日の日付と曜日も一緒に落とす**（2026-09-07 ユーザー指定。
  //   `GravityTab` と同じ ―― 枠の無い、文字だけの黒い板）。
  // ★★★**作り方は `lib/wordPlate.ts`。GRAVITY とまったく同じ部品**（第89巡）。
  //   ★DOM で組んでいたのをやめた ―― 板だけが物理と別の座標系に居たせいで、
  //   板まわりだけ挙動が違っていた（ユーザー「特に日付と曜日がおかしい」）。
  // ★★★**いちばん先に落とす**（2026-09-09）。最後に落とすと、板は山の
  //   **凸凹の上**へ着地して 59° 傾いた（実測。3回とも同じ）。
  plates.forEach((plate, i) => {
    const body = makeWordBody(m, plate, 0, 0);
    toss(body, `word${i}`, plate.bh);
    // ★初速の回りは与えない（傾くのは着地の弾みぶんだけ）。
    m.Body.setAngle(body, (frac(`word${i}a`) - 0.5) * 0.16);
    m.Body.setAngularVelocity(body, 0);
    pieces.push({
      id: `word${i}`, body, kind: "word", w: plate.bw, h: plate.bh,
      face: INK, ink: INK, title: plate.word, plate,
    });
  });

  tasks.forEach((t) => {
    const spec = specOf(t, today);
    const pw = Math.max(28, spec.w * unit);
    const ph = Math.max(24, spec.h * unit);
    const body = m.Bodies.rectangle(0, 0, pw, ph, BODY);
    // ★★★**質量だけ与えて、回り慣性は触らない**（2026-09-09）。`setMass` は
    //   慣性も一緒に比例させるので、形と重さから正しい回りにくさが出る。
    m.Body.setMass(body, spec.area * MASS_K);
    toss(body, t.id, ph);
    // ★★**日付が無ければ輪郭**（塗り／輪郭の1軸。字も縁と同じ色になる）。
    const outlined = !(t.dueDate ?? "").trim();
    pieces.push({
      id: t.id, body, kind: "task", w: pw, h: ph,
      face: TASK_FACE, ink: outlined ? TASK_FACE : bodyInkOn(TASK_FACE),
      title: t.title, face_: SHAPE_FACE, outlined,
    });
  });

  if (jArea > 0) {
    // ★★**タブのアイコンと同じカセット**。文字は載せない（ユーザー指定）。
    // ★★**体は四角**（円ではない）。当たり判定も `Pile.tsx` の四角の枝へ入る。
    const pw = Math.max(32, jW * unit);
    const ph = Math.max(24, jH * unit);
    const body = m.Bodies.rectangle(0, 0, pw, ph, BODY);
    m.Body.setMass(body, jArea * MASS_K);
    toss(body, "journal", ph);
    pieces.push({
      id: "journal", body, kind: "cassette", w: pw, h: ph,
      // ★**本体の面が青／リールと帯が黒**（タブのアイコンの塗り分け）。
      face: JOURNAL_FACE, ink: INK,
      nav: "journal-record",
    });
  }

  offers.forEach((it) => {
    // ★★提案は重さを持たないので、**いちばん重いタスクと同じ**として置く
    //   （2026-09-08 ユーザー指定「提案の図形はもっと大きく」）。
    const area = weightArea(3) * OFFER_K;
    const r = Math.max(28, Math.sqrt((area * unit * unit) / Math.PI));
    const body = m.Bodies.circle(0, 0, r, BODY);
    m.Body.setMass(body, area * MASS_K);
    toss(body, it.id, r * 2);
    // ★★**焼き込まれた色を信じない**（帯の `cardFace` と同じ理由）。生成した夜の
    //   パレットが残っているので、**いま生きている表から引き直す**。
    const face = ACCENT_TEST ? colorOfKind(it.kind) : (it.color ?? colorOfKind(it.kind));
    pieces.push({
      id: it.id, body, kind: "offer", r,
      face, ink: bodyInkOn(face),
      photo: it.images?.[0], title: it.title,
      // ★写真が無い提案の顔＝**字面**（ブリーフのカードと同じ規則）。
      glyph: glyphOfKind(it.kind),
    });
  });

  if (unread > 0) {
    // ★★★**トゲの外側の12点を結んだ多角形**で作る（2026-09-09に作り直し）。
    //   ★★`Bodies.fromVertices` に**凹んだ星をそのまま渡してはいけない** ――
    //   `poly-decomp` を積んでいないので分解に失敗し、**凹んだ形を1つの凸形と
    //   して**扱う（実測 `parts=1` ＋ 警告）。**凸なら SAT が正しく効く。**
    //   ★まん丸に戻さないのは、玉のように滑らず**角で止まる**ため。
    const body = m.Bodies.polygon(0, 0, ZIG_N, BADGE_R, BODY);
    m.Body.setMass(body, weightArea(3) * MASS_K);
    toss(body, "unread", BADGE_R * 2);
    // ★★色は **EXPLORE の家族のメイン**（2026-09-09 ユーザー指定）。
    //   数えているのが Explore の未読なので、**行き先と同じ色**を着る。
    const face = ACCENT_TEST ? accentOf("life").main : RUST;
    pieces.push({
      id: "unread", body, kind: "badge", r: BADGE_R,
      face, ink: bodyInkOn(face), count: unread,
      // ★押すと EXPLORE のブリーフへ（そこで実際に読める）。
      nav: "brief",
    });
  }

  return pieces;
}

export type { Engine };

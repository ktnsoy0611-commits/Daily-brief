import type { RefObject } from "react";
import type { CardShape } from "./cardShape";
import type { BandItem } from "./homeBand";
import { rubber } from "./spring";

// ★★★**帯のピルを引き下ろす手つきの「算数」はここ1つ**（2026-09-14・第102巡）。
//
// ★★★**ユーザーの説明がそのまま仕様**（2026-09-14）――
//   「ピルを触ると**少し柔らかいような感触**がして、少し下に引っ張ると最初は
//   **少しゴムのような反発**する感触がして、そのまま引っ張っていくと**ピルの形から、
//   ホームに落ちてくる時の図形の形に変化しながら滑らかにアニメーションして
//   指に吸い付いて**くる」。
//
// ★★★**進みは「時間」ではなく「指が引いた距離」で決まる。** だから曲線4本
//   （`lib/motion.ts`）は使わない ―― あれは**時間**の語彙。ここは物理と同じ
//   「目盛りの外」で、`docs/project_knowledge.md` §3 の例外の側に居る。
//
// ★★**絵も物理もここでは持たない。** 絵は `components/home/pilePaint.ts`、
//   物理は `components/home/pileWorld.ts`。ここは**位置と大きさと変形の進み**だけ。

/** 引き下ろしの1つの「幽霊」（＝指に付いてくる、まだ物体でないもの）。 */
export interface Ghost {
  /** 何になるか。タスクは**ピルの積み**、提案は**札の形**へ変わる。 */
  kind: "task" | "offer";
  /** 帯のピルの id（`lib/homeBand.ts` の `BandItem.id` そのまま）。 */
  id: string;
  title: string;
  /** 器の座標での中心と寸法。 */
  cx: number; cy: number; w: number; h: number;
  /** 0〜1。0 ＝ ピルのまま／1 ＝ 山での形。 */
  t: number;
  /** タスクの段の数（`rowsOf`）。 */
  rows: number;
  /** 日付が無い＝輪郭だけ（帯の下の段と同じ見え方）。 */
  outlined: boolean;
  face: string;
  ink: string;
  /** 図形に載る文字の書体の番号（`SHAPE_FACE`）。 */
  faceIdx: number;
  /** 提案のときだけ。写真を切り抜く形。 */
  shape?: CardShape;
  photo?: string;
  glyph?: string;
}

/** ★★帯と山をつなぐ**1本の線**。React の state を毎フレーム動かさない。 */
export interface PullBus {
  ghost: Ghost | null;
  /** 山の一括の倍率（solid 座標 → px）。`Pile` が `buildPieces` から書き込む。 */
  unit: number;
}

/**
 * ★★★**線は1本だけ**（module のただ1つの入れ物）。
 * ホームは画面に1つしか無いので、ref を props で回すより素直で、
 * **毎フレームの書き込みが React の描画と関わらない**（`Band` が書き `Pile` が読む）。
 * ★★**画面が消えたら `ghost` を `null` に戻すこと**（掴んだまま列を替えられる）。
 */
export const pullBus: PullBus = { ghost: null, unit: 64 };

/** ここまではゴム。指が引いても**一部しか動かない**距離（px）。★目盛りの外（手ざわり）。 */
export const PULL_ARM = 56;
/** ゴムの間、指の何割だけ動くか。★目盛りの外（手ざわり）。 */
export const PULL_RESIST = 0.42;
/** ゴムを越えてから、**図形になりきるまで**に要る距離（px）。★目盛りの外（手ざわり）。 */
export const MORPH_SPAN = 160;
/** ゴムの伸びしろ（`PULL_ARM` の何倍まで）。★目盛りの外（手ざわり）。 */
export const PULL_GIVE = 1.6;

/** 0〜1 を滑らかに（両端で傾き 0）。★距離で送るので時間の曲線は使わない。 */
const smooth = (t: number): number => {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
};

export interface PullFrame {
  /** 変形の進み 0〜1。 */ t: number;
  /** 器の座標での中心。 */ cx: number; cy: number;
  /** いまの寸法。 */ w: number; h: number;
  /** ゴムを抜けて指に付いているか（＝離したら日付が付く段階か）。 */ armed: boolean;
}

/**
 * ★★★**指の位置から、幽霊の「いま」を出す**（純粋な関数）。
 *
 * @param fx,fy   いまの指（器の座標）
 * @param sx,sy   掴んだ瞬間の指（器の座標）
 * @param bx,by   掴んだピルの中心（器の座標）
 * @param w0,h0   掴んだピルの寸法
 * @param w1,h1   山での寸法（`specOf` × `unit`）
 *
 * ★★**ゴムの間は指の `PULL_RESIST` しか動かない**（反発の手ざわり）。
 *   越えると `t` が育ち、**中心が指そのものへ寄っていく**（＝吸い付く）。
 *   ★同じ `t` が**形の変形**も動かすので、「変わりながら吸い付く」が1つの数から出る。
 */
export function pullFrame(
  fx: number, fy: number, sx: number, sy: number,
  bx: number, by: number, w0: number, h0: number, w1: number, h1: number,
): PullFrame {
  const dy = fy - sy;
  // ★下へ引いたぶんだけを見る（上へ戻せば 0 に近づく）。
  const pulled = Math.max(0, dy);
  const t = smooth((pulled - PULL_ARM) / MORPH_SPAN);
  // ゴムの側 … 指の一部だけ動く。`rubber` が閾値で傾き 1 のまま頭打ちにする。
  const give = rubber(pulled / PULL_ARM, PULL_GIVE) * PULL_ARM * PULL_RESIST;
  const gx = bx + (fx - sx) * PULL_RESIST;
  const gy = by + give;
  return {
    t,
    // ★`t` が 1 に近づくほど**指そのもの**へ（吸い付き）。
    cx: gx + (fx - gx) * t,
    cy: gy + (fy - gy) * t,
    w: w0 + (w1 - w0) * t,
    h: h0 + (h1 - h0) * t,
    armed: pulled > PULL_ARM,
  };
}

/** 右の縁から何 px で ASSIGN の帯が出るか。★目盛りの外（手ざわり）。 */
export const RAIL_NEAR = 72;

/** そのピルが**山で持つ姿**（大きさと見え方）。`HomeTab` が作る。 */
export interface GhostSeed {
  kind: "task" | "offer";
  title: string;
  rows: number;
  outlined: boolean;
  face: string;
  ink: string;
  faceIdx: number;
  /** 山での寸法（px）。 */
  w: number; h: number;
  shape?: CardShape;
  photo?: string;
  glyph?: string;
}

/** 帯（と山）が引き下ろしのために外から貰うもの。★**画面は持たない**。 */
export interface PullHost {
  /** 器（帯と山の共通の座標系）。 */
  box: RefObject<HTMLDivElement | null>;
  /** そのピルが山で持つ姿。`null` なら引けない。 */
  seed: (item: BandItem) => GhostSeed | null;
  /** 離した。`onRail` なら右端の ASSIGN の帯の上。 */
  drop: (item: BandItem, onRail: boolean) => void;
  /** 右端の帯を出すか消すか。 */
  rail: (on: boolean) => void;
}

import { D_SWING, K_SWING, spring, springTo, type Spring } from "@/lib/spring";
import { SPACE } from "@/lib/tokens";

// ★★★**帯の「物理っぽい動き」はここ1つ**（2026-09-15・第109巡にユーザー指定）。
//
// ユーザーの指定は3つ:
//   ④a **引き出してスクロールが止まるとき** … 慣性で少し行き過ぎてから戻って止まる。
//   ④b **ピル1個ぶん空いてスクロールが再開するとき** … 空いた所へ後ろのピルが
//       **追突して**、その勢いで全体が動き出す。
//   ⑤  **帯へ戻したとき** … 入れた所の**左右のピルが外へ弾き飛ばされ**、
//       戻ってきてバウンドする。
//
// ★★★**動かすのは `transform` だけ**（レイアウトは 1px も動かさない）。
//   帯の継ぎ目の無さは「2周の幅が厳密に等しい」ことだけで成り立っているので、
//   幅に効く変更を入れると**そこで継ぎ目が生まれる**。
// ★★★**ピルは2周ぶん DOM に居る**ので、ずれは **id で引く**（`taken` と同じ作法）。
//   周ごとに別の値にすると、2周目が入ってきた瞬間に見えてしまう。
// ★★**バネは `lib/spring.ts` の `K_SWING`/`D_SWING` 1組だけ**（周期30フレーム・
//   減衰比 0.3 ＝ はっきり行き過ぎて戻る）。**新しい係数も曲線も作らない。**
//   ★`lib/spring.ts` は「canvas の座標系の話」と書いてあるが、**帯の環境の動きは
//   すでに `linear` で曲線4本の対象外**（`Band.tsx` の頭）。同じ例外に揃える。

/** ★ずれの上限（px）。**やりすぎない**ための頭打ち。★目盛りの外（手ざわり）。 */
export const NUDGE_MAX = SPACE.xl;
/**
 * ★帯が止まるときに入れる勢い（px/フレーム）。★目盛りの外（手ざわり）。
 * ★★**実際の流れの速さ（≒0.25px/フレーム）は使わない** ―― 帯は 26秒で画面1枚ぶん
 *   という遅さなので、そのぶんの慣性は**1px にも満たず目に見えない**。
 *   「慣性が働いているように見える」ことが指定なので、**見える量を設計して置く**。
 * ★`K_SWING` では行き過ぎの頂点 ≒ `v0 × 3`。**4 ＝ 約 12px**（`SPACE.md` ぶん）。
 */
const STOP_KICK = 4;
/** ★追突の勢い（px/フレーム）。空いた隙間を後ろが詰めるので、止まるときより強い。 */
const BUMP_KICK = 7;
/** ★弾きの勢い（px/フレーム）。左右へ散って戻る。 */
const KNOCK_KICK = 6;
/** ★これ未満になったら「収まった」として捨てる（px と px/フレーム）。 */
const CALM = 0.05;

/** 1つのずれ。★`p` が px、`v` が px/フレーム。 */
type Off = Spring;

/**
 * ★★帯と山をつなぐ**1本の線**（`lib/pullDrag.ts` の `pullBus` と同じ作法）。
 * React の state を毎フレーム動かさない ―― 毎フレームの値は module のただ1つの
 * 入れ物に置き、rAF のループだけが読み書きする。
 */
export const bandBus = {
  /** 段ごとの「帯ぜんたいのずれ」（止まる慣性・追突の一発）。 */
  off: [spring(), spring()] as [Off, Off],
  /** ピルごとの横のずれ（弾き・追突）。**id で引く**。 */
  nudge: new Map<string, Off>(),
  /** ★動いているか（ループを回すかの判定）。 */
  live: false,
  /** ★★段の rAF を起こす口（`Band.tsx` が段ごとに登録する）。 */
  wakers: new Set<() => void>(),
};

/** ★注文が入ったら**すぐ**段のループを起こす（間を置いて見に行かない）。 */
const wake = () => { bandBus.live = true; for (const w of bandBus.wakers) w(); };
const kick = (s: Off, v: number) => { s.v += v; wake(); };
const shove = (s: Off, p: number) => { s.p += p; wake(); };
const nudgeOf = (id: string): Off => {
  let s = bandBus.nudge.get(id);
  if (!s) { s = spring(); bandBus.nudge.set(id, s); }
  return s;
};

/**
 * ★★★**④a 帯が止まる** … 流れていた向きへ少し行き過ぎてから戻る。
 * @param row 段（0 ＝ 左へ流れる／1 ＝ 右へ流れる）
 */
export function bandStop(row: 0 | 1): void {
  kick(bandBus.off[row], row === 0 ? -STOP_KICK : STOP_KICK);
}

/**
 * ★★★**④b 追突** … ピルが1つ抜けて隙間が空いたので、**後ろのピルが詰めて**、
 * その勢いで**帯ぜんたいも動き出す**。
 * @param row  段
 * @param ids  空いた所より**後ろ**のピルの id（近い順）
 */
export function bandBump(row: 0 | 1, ids: string[], gap: number): void {
  // ★★帯ぜんたいに一発（＝流れが再開する合図）。
  kick(bandBus.off[row], row === 0 ? -BUMP_KICK : BUMP_KICK);
  // ★★★**位置で置く**（速さではない）。ピルが1つ抜けると、後ろは**レイアウトの
  //   都合でその場で左へ詰む** ―― そこで「まだ前に居た」ぶんだけ右へ置いてやると、
  //   **後ろから追突してきて詰まる**ように見える。★向きは段によらず右（＝元居た所）。
  // ★★**近いピルほど深く**、後ろへ行くほど浅く（衝撃が伝わって減る）。
  ids.forEach((id, i) => {
    const d = Math.min(NUDGE_MAX, gap) / (1 + i * 0.8);
    if (d < CALM) return;
    shove(nudgeOf(id), d);
  });
}

/**
 * ★★★**⑤ 帯へ戻した所の左右を弾く**。器の座標ではなく**画面の x**で引く。
 * ★★DOM から引くのは、ピルの居場所は流れの `transform` が決めていて
 *   React 側は知らないから（`getBoundingClientRect` が唯一の正）。
 */
export function bandKnockAt(clientX: number): void {
  if (typeof document === "undefined") return;
  const seen = new Map<string, number>();
  for (const el of document.querySelectorAll<HTMLElement>("[data-pill-id]")) {
    const id = el.dataset.pillId;
    if (!id) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) continue;
    // ★2周ぶん居るので、**画面に近いほうの周**を採る。
    const cx = r.x + r.width / 2;
    const was = seen.get(id);
    if (was === undefined || Math.abs(cx - clientX) < Math.abs(was - clientX)) seen.set(id, cx);
  }
  const left: string[] = []; const right: string[] = [];
  [...seen].sort((a, b) => Math.abs(a[1] - clientX) - Math.abs(b[1] - clientX))
    .forEach(([id, cx]) => {
      if (cx < clientX) { if (left.length < 3) left.push(id); }
      else if (right.length < 3) right.push(id);
    });
  bandKnock(left, right);
}

/**
 * ★★★**⑤ 弾き** … 帯へ戻した所の**左右のピルが外へ飛ばされ**、戻ってバウンドする。
 * @param left  入れた所より左のピルの id（近い順）
 * @param right 入れた所より右のピルの id（近い順）
 */
export function bandKnock(left: string[], right: string[]): void {
  // ★★**外向き**（左のピルは左へ、右のピルは右へ）。★遠いほど弱い。
  left.forEach((id, i) => {
    const k = KNOCK_KICK / (1 + i * 1.6);
    if (k >= CALM) kick(nudgeOf(id), -k);
  });
  right.forEach((id, i) => {
    const k = KNOCK_KICK / (1 + i * 1.6);
    if (k >= CALM) kick(nudgeOf(id), k);
  });
}

/**
 * 1フレームぶん進める。**全部収まったら `false`**（ループを止めてよい）。
 * ★★**山のループと同じ固定の刻みで呼ぶこと**（`Band.tsx` が rAF から呼ぶ）。
 */
export function stepBandMotion(): boolean {
  let live = false;
  for (const s of bandBus.off) {
    springTo(s, 0, K_SWING, D_SWING);
    s.p = Math.max(-NUDGE_MAX, Math.min(NUDGE_MAX, s.p));
    if (Math.abs(s.p) > CALM || Math.abs(s.v) > CALM) live = true;
    else { s.p = 0; s.v = 0; }
  }
  for (const [id, s] of bandBus.nudge) {
    springTo(s, 0, K_SWING, D_SWING);
    s.p = Math.max(-NUDGE_MAX, Math.min(NUDGE_MAX, s.p));
    if (Math.abs(s.p) > CALM || Math.abs(s.v) > CALM) live = true;
    else bandBus.nudge.delete(id);        // ★収まったら捨てる（毎フレーム走らせない）
  }
  bandBus.live = live;
  return live;
}

import type { ItemDomain, ItemKind } from "./types";
import { INK, KIND_DOMAIN, MUTED, PALETTE, PAPER, SCHEME } from "./constants";

// ★★★**有彩色の出どころはここ1つ**（2026-08-31・第73巡）。
//
// 棚卸しで、アプリ全体に**異なる色が 79**あり、しかも**分類の色が4系統に
// 散らばっていた**（タスクのタグ5／Explore のドメイン4／ブリーフの kind 10／
// バインダーの独自パレット22）。同じ「展覧会」が、券では橙・ブリーフでは紺・
// バインダーでは青緑になっていた ―― これが「統一されていない」の正体。
//
// ★★**分類に使う有彩色は9つだけ**にする:
//   ・**ドメイン 4**（バショ／タイケン／ジョウホウ／モノ）
//       → 券の紙・鋏痕・マップのノード・ストックの絞り込み・ブリーフのカード・
//         バインダー。**「何であるか」を表す色はこれしかない。**
//   ・**タグ 5**（WORK / LIFE / WELLNESS / SOCIAL / GROWTH）
//       → タスクの図形。ドメインとは**別の軸**（TASK と EXPLORE は別のアプリで、
//         同じ画面に並ばないので色は借りてよいが、意味は混ぜない）。
//   ★★★第77巡から**ドメイン4もタグ5も同じ「メイン5色」から取る**（ユーザー指定
//     「券の色もこのメイン5色を優先に。残りの4色は足りなくなった時に使う」）。
//     券に入らないのは黒桜だけ ―― 暗い券は作らない（ユーザー確定）。
//   ・**状態 3**（危険／肯定／選ばれている）は、この9つから**借りる**。
//
// ★★★**色そのものは `SCHEME`（`lib/constants.ts`）が持つ。ここは「役 → 色」の
//   対応表だけ**。パレットを差し替えるときは `SCHEME` の中身を書き換えれば、
//   ここも呼び出し側も全部そのまま追従する。
//
// ★★**「メイン／サブ／本文」の3つを分けて出す**（第75巡）:
//   ・`DOMAIN_COLOR` … その分類の色。券では**大きな英語**、他では面の色。
//   ・`DOMAIN_INK`   … その色を**面**として使ったとき、上に載る字の色。
//   ★★★第80巡に**`DOMAIN_SUB`（サブの表）を消した**。サブは「色の面に載る
//     大きな文字」の色だったが、券が白い紙になって面の上に大きな文字を載せなく
//     なったので役目が終わった。載る字は `bodyInkOn()` が**面から導く**。

/**
 * ★**その面の本文の色を、面の色から導く**（`INK` か `PAPER` の読めるほう）。
 * ★★表に書かずに計算するのは、**`SCHEME` を書き換えただけで追従させる**ため。
 * 表に書くと、色を替えた人が片方だけ直して「明るい地に明るい字」を作る。
 */
const luminance = (hex: string): number => {
  const ch = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(0) + 0.7152 * ch(1) + 0.0722 * ch(2);
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** 面の色 → その上の本文の色。★比の高いほうを採る（同点は `INK`）。 */
export const bodyInkOn = (main: string): string =>
  contrast(main, INK) >= contrast(main, PAPER) ? INK : PAPER;

/**
 * ★★**盤の赤は2つある**（Terracota `#EA5E3D` と Magenta `#B42648`）。
 * **その面で読めるほう**を返す ―― 暗い面には Terracota（墨の上 4.36）、
 * 明るい面には Magenta（紙の上 6.07）。
 * ★録音の赤は乗る面が2つ（キーの面と地）あり、**必要な赤が逆になる**ので、
 * 手で書き分けずにここに導かせる。★パレットが替わっても、2つの赤の
 * **明暗の役**さえ同じなら、この関数はそのまま効く。
 */
export const redOn = (surface: string): string =>
  contrast(surface, SCHEME.danger) >= contrast(surface, PALETTE.terracota)
    ? SCHEME.danger : PALETTE.terracota;

/**
 * ★**地の上に直接いる文字の色**を CSS 変数で配る（第77巡）。
 * `--ink-on` … その地の上の主役の文字（`Masthead` の字）。**面としても使う**
 *   ―― タブバー右端の「作る」の丸は、地が明るければ黒・暗ければ白。
 * `--on-ink` … その `--ink-on` の面に載る色（丸の中のアイコン）。
 * `--muted-on` … その地の上の控えめな文字（`SectionLabel`・日付）。
 * ★★★呼ぶのは **`components/AppShell.tsx` の列だけ**（地を敷いているのと同じ場所）。
 *   ここ以外で呼ぶと出どころが2つになり、遷移中に必ずズレる。
 * ★暗い地では「控えめ」を**不透明度ではなく混色**で作る ―― `MUTED`(#8E8E88) は
 *   明るい地の前提で選んだ値で、暗い地では逆に浮く。
 */
export const inkVarsOn = (ground: string): Record<string, string> => {
  const ink = bodyInkOn(ground);
  const dark = ink !== INK;   // 地が暗い＝紙色の文字を載せている
  return {
    "--ink-on": ink,
    "--on-ink": bodyInkOn(ink),
    "--muted-on": dark ? "rgba(255,251,245,0.52)" : MUTED,
  };
};

/**
 * ★★**色相を保ったまま暗くする**（第81巡・券のデュオトーンの影の極）。
 * ★★★`lib/helpers.ts` の `shade()` は各チャンネルに**同じ数を足し引き**するので、
 *   暗くすると小さいチャンネルが 0 に張り付いて**色相が飛ぶ** ―― 実測 …
 *   朱 `#EA5E3D` → `#7F0000`（純赤）／緑 `#14AD5C` → `#004200`（純緑）。
 *   **掛け算なら比が保たれるので色相が動かない**（`#EA5E3D` → `#813522`）。
 * ★`shade()` は「カードに斜めの陰影を足す」ための簡易実装で、そちらは足し引きで
 *   構わない（同じ色の中の陰影なので色相のずれが目に付かない）。**用途が違う。**
 */
export const deepen = (hex: string, k: number): string => {
  const n = hex.replace("#", "");
  const ch = (i: number) => Math.round(parseInt(n.slice(i * 2, i * 2 + 2), 16) * k);
  return `#${[0, 1, 2].map((i) => ch(i).toString(16).padStart(2, "0")).join("")}`;
};

/**
 * ドメインの色（4）。★これが「何であるか」を表す唯一の色。
 * ★★★第80巡から**券では「面の色」ではなく「大きな英語の色」**になった
 * （ユーザー指定「色は背景ではなく、大きな文字のアクセントにワンポイントで」）。
 * だから**白い紙の上で読めること**が条件になる ―― 実測 …
 * バショ 6.07 ／ タイケン 3.26 ／ ジョウホウ 4.83 ／ **モノ 2.81 ★**。
 * ★モノ(Verde)だけ大きな文字の下限 3.0 に 0.19 届かない。券の英語は `poster`(38)
 * の 900 なので実用上は読めるが、**目盛りの外**なので `design.md` に数字ごと
 * 書いてある。代わりに置ける色は 1.43／1.50 しかなく、もっと悪い。
 */
export const DOMAIN_COLOR: Record<ItemDomain, string> = {
  place: SCHEME.danger,       // Magenta comunidad（共同体）
  experience: SCHEME.growth,  // Terracota Ancestral（土）
  info: SCHEME.work,          // Azul saberes（知）
  thing: SCHEME.life,         // Verde Raíz（根）
};

/** その面の**本文**の色。★メインから導くので、`SCHEME` を替えれば追従する。 */
export const DOMAIN_INK: Record<ItemDomain, string> = {
  place: bodyInkOn(DOMAIN_COLOR.place),
  experience: bodyInkOn(DOMAIN_COLOR.experience),
  info: bodyInkOn(DOMAIN_COLOR.info),
  thing: bodyInkOn(DOMAIN_COLOR.thing),
};

/** kind（10種）→ 色。★**ドメインを通す**ので、kind ごとの色は持たない。 */
export const colorOfKind = (kind: ItemKind): string => DOMAIN_COLOR[KIND_DOMAIN[kind]];
export const inkOfKind = (kind: ItemKind): string => DOMAIN_INK[KIND_DOMAIN[kind]];

/**
 * ★**濃さの違いだけで散らす**（バインダーのように「同じ役のものを何十枚も
 * 並べる」場所で使う）。色相はドメインの1つに固定したまま、`shade` で明暗だけ
 * 変える。★第72巡までは 22 色の独自パレットを持っていて、ドメインと無関係だった。
 */
export const DOMAIN_STEPS = [0, -14, 12, -26, 24] as const;  // ★目盛りの外（明暗の段）

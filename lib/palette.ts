import type { ItemDomain, ItemKind } from "./types";
import { INK, KIND_DOMAIN, MUTED, PALETTE, PAPER, SCHEME } from "./constants";

// ★★★**有彩色の出どころはここ1つ**（2026-08-31・第73巡）。
//
// 棚卸しで、アプリ全体に**異なる色が 79**あり、しかも**分類の色が4系統に
// 散らばっていた**（タスクのタグ5／Explore のドメイン4／ブリーフの kind 10／
// バインダーの独自パレット22）。同じ「展覧会」が、券では橙・ブリーフでは紺・
// バインダーでは青緑になっていた ―― これが「統一されていない」の正体。
//
// ★★★**有彩色は4つ**（第127巡。第128巡に色を差し替え）:
//   ・（第129巡）**TASK ＝ オレンジ**（危険も同じ）／**JOURNAL ＝ 青**（選択・肯定も）／
//     **提案 ＝ 黄**／**NEWS ＝ 黒**（有彩色ではない）。
//   ★★★**ドメイン4は色で分けない** ―― `DOMAIN_COLOR` の4行は全部黄で、
//     **ジャンルは形が言う**（`lib/cardShape.ts`）。**色と形で二度言わない。**
//   ★★**タグ5は第93巡に廃止済み**（タスクは「日付の有無」を塗りと輪郭で言う）。
//   ★**状態 3**（危険／肯定／選ばれている）は、この4つから**借りる**。
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
/**
 * 面の色 → その上の本文の色。★比の高いほう（同点は `INK`）。
 * ★★★**第127巡の「塗りと文字の組」（`PAIR`。青⇄赤・黄⇄オレンジ）は第128巡に
 *   撤回した**（ユーザー「**やはりダメです。…文字は太めの黒で良いです**」）。
 *   **復活させない** ―― 実測 1.82〜1.93 で、11〜16px の字は読めなかった。
 *   第128巡の4色はどれも墨が勝つ（最低 5.52）ので、字は全部墨になる。
 */
export const bodyInkOn = (main: string): string =>
  contrast(main, INK) >= contrast(main, PAPER) ? INK : PAPER;

/**
 * ★★**その面で読める「赤の役」の色**。
 * ★★★**第128巡から `danger` がオレンジそのもの**（参照画像に赤が無い）なので、
 *   2つの候補は同じ色で、**どの面でもオレンジを返す**（墨の上 5.52／地の上 2.50）。
 *   関数を残すのは、次にパレットへ赤が戻ったとき呼び手を直さずに済むため。
 * ★録音の赤は乗る面が2つ（キーの面と地）あり、**必要な色が逆になる**ので、
 * 手で書き分けずにここに導かせる。★パレットが替わっても、**2つの候補の明暗の役**
 * さえ同じならこの関数はそのまま効く。
 * ★★★**第117〜125巡はピンク（`rosa`）が暗い面の赤だった**。参照画像にピンクが
 *   無くなったので、同じ役（明るいほうの暖色）を**オレンジ**が引き継いだ。
 */
export const redOn = (surface: string): string =>
  contrast(surface, SCHEME.danger) >= contrast(surface, PALETTE.naranja)
    ? SCHEME.danger : PALETTE.naranja;

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
 * ★★★**ドメインの4つは、もう色で分けない**（2026-09-23・第127巡にユーザー指定
 * 「**提案はオレンジにして、提案はジャンルごとの色分けは一旦無くして同じ色に
 * してください**」）。**4行とも `SCHEME.growth`（第129巡から黄）を指す。**
 *
 * ★★★**ジャンルは「形」が言う** ―― `lib/cardShape.ts` の4つの形（四つ葉／
 *   六角形／波打つ四角／トゲトゲ）と券の鋏痕は**1文字も変えていない**ので、
 *   分類は失われていない。**色と形で二度言っていたのを、形だけにした。**
 *
 * ★★★**表を4行のまま残すこと** ―― ユーザーの「一旦」は撤回の余地を残した
 *   言い方なので、**戻すときはこの4行だけ**を書き換えればよいようにしてある。
 *   `DOMAIN_INK` も `colorOfKind` も `deckStyle` も**この表しか見ていない**。
 *
 * ★実測 … 黄は**白い紙の上で 1.20**（第129巡）―― **券の大きな英語には使えない**
 *   （見えない）。券は `DEV` タブの見本帳にしか無いので、刷新を再開するときに決め直す。
 */
export const DOMAIN_COLOR: Record<ItemDomain, string> = {
  place: SCHEME.growth,        // 黄 … 四つ葉（やわらかい弧）
  experience: SCHEME.growth,   // 黄 … 六角形（斜めの鋏痕）
  info: SCHEME.growth,         // 黄 … 波打つ四角（直角の鋏痕）
  thing: SCHEME.growth,        // 黄 … トゲトゲ（切れ込み）
};

/** その面の**本文**の色。★メインから導くので、`SCHEME` を替えれば追従する。 */
export const DOMAIN_INK: Record<ItemDomain, string> = {
  place: bodyInkOn(DOMAIN_COLOR.place),
  experience: bodyInkOn(DOMAIN_COLOR.experience),
  info: bodyInkOn(DOMAIN_COLOR.info),
  thing: bodyInkOn(DOMAIN_COLOR.thing),
};

/**
 * kind（10種）→ 色。★**ドメインを通す**ので、kind ごとの色は持たない。
 * ★★**知らない kind でも必ず色を返す**（`info` へ落とす）。kind は AI の生成物なので
 * 表に無い語が来ることがあり、`undefined` を返すと**面の色を計算する側が落ちる**
 * （実際に落とした ―― `bodyInkOn(undefined)`）。
 */
export const colorOfKind = (kind: ItemKind): string =>
  DOMAIN_COLOR[KIND_DOMAIN[kind] ?? "info"];
export const inkOfKind = (kind: ItemKind): string =>
  DOMAIN_INK[KIND_DOMAIN[kind] ?? "info"];

/**
 * ★**濃さの違いだけで散らす**（バインダーのように「同じ役のものを何十枚も
 * 並べる」場所で使う）。色相はドメインの1つに固定したまま、`shade` で明暗だけ
 * 変える。★第72巡までは 22 色の独自パレットを持っていて、ドメインと無関係だった。
 */
export const DOMAIN_STEPS = [0, -14, 12, -26, 24] as const;  // ★目盛りの外（明暗の段）

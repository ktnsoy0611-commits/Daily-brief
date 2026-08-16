import type { InboxCandidate, SubTask, Task } from "./types";

// ★動作確認用のダミー。声のメモ→Coworkの候補がまだ溜まっていない状態でも、
// 候補が漂う様子と、タスクが落ちて積み上がる様子を見られるようにする。
// **完成時に撤去する**(SYSTEM-DESIGN.md §8 の「サンプルデータ」の一つ)。
//
// 側面の数(=断面の形)・重要度(=大きさ)・タイトルの長さ(=横幅)・
// サブタスク(=スラブの枚数)・5つのタグ が全部出るように選んである。

const day = (base: Date, offset: number): string => {
  const d = new Date(base);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const subs = (seed: number, ...titles: string[]): SubTask[] =>
  titles.map((title, i) => ({ id: `demo-sub-${seed}-${i}`, title, done: false }));

/** 候補(まだ確定していない)。側面 1〜4(円/半円/三角/四角)が揃う。
 *  面の2番目は**日付**(2026-08-16に自由文の「いつ」を廃止した)。 */
export function demoCandidates(now = new Date()): InboxCandidate[] {
  const at = now.toISOString();
  const seed = now.getTime();
  const mk = (n: number, o: Partial<InboxCandidate>): InboxCandidate => ({
    id: `demo-cand-${seed}-${n}`, kind: "task", title: "", createdAt: at, ...o,
  }) as InboxCandidate;
  return [
    // 側面1(円柱): 題だけ。短いので軸も短い。
    mk(1, { title: "空気を入れる", tag: "life", sourceText: "そういえば自転車の空気がだいぶ抜けてた" }),
    // 側面2(半円柱)。
    mk(2, { title: "図書館に本を返す", dueDate: day(now, 5), weight: 2, tag: "growth", sourceText: "図書館の本、今週までだった気がする" }),
    // 側面3(三角柱)。
    mk(3, {
      title: "歯医者を予約する", dueDate: day(now, 9), context: "近所の歯科", weight: 2, tag: "wellness",
      sourceText: "歯医者、そろそろ行かないとまずい",
    }),
    // 側面4(四角柱)。
    mk(4, {
      title: "母の誕生日を祝う", dueDate: day(now, 21), context: "実家", belongings: "贈り物・カード",
      weight: 3, tag: "social", note: "だれと: 家族と\nなぜ: 節目の年だから",
      sourceText: "来月、母の誕生日。今年はちゃんとやりたい",
    }),
    // 側面4 + 長いタイトル(軸がいちばん伸びる)。
    mk(5, {
      title: "金沢へ二泊三日の旅行に行く", dueDate: day(now, 40), context: "金沢・新幹線", belongings: "切符・カメラ",
      weight: 3, tag: "life", sourceText: "金沢、連休に行けたらいいな。新幹線で二泊くらい",
    }),
    // ここから増量ぶん。5つのタグ・4つの断面・3段階の重さが一通り出る。
    mk(6, { title: "名刺を刷り直す", dueDate: day(now, 18), weight: 2, tag: "work", sourceText: "名刺、そろそろ切れる" }),
    mk(7, {
      title: "確定申告の資料を集める", dueDate: day(now, 30), context: "自宅", weight: 3, tag: "work",
      sourceText: "領収書、今年こそ月ごとにまとめたい",
    }),
    mk(8, { title: "走る", weight: 1, tag: "wellness", sourceText: "最近ぜんぜん体を動かしてない" }),
    mk(9, {
      title: "祖母に電話する", dueDate: day(now, 3), context: "実家", weight: 2, tag: "social",
      sourceText: "おばあちゃん、しばらく声を聞いてない",
    }),
    mk(10, {
      title: "写真の展示を見に行く", dueDate: day(now, 12), context: "恵比寿", belongings: "チケット",
      weight: 2, tag: "growth", sourceText: "恵比寿の写真展、会期が今月までだった",
    }),
    mk(11, { title: "冬のコートをクリーニングに出す", dueDate: day(now, 7), weight: 1, tag: "life", sourceText: "コート、しまう前に出さないと" }),
    mk(12, {
      title: "英語の勉強を再開して毎朝三十分だけ続ける", dueDate: day(now, 2), context: "自宅・アプリ", belongings: "ノート",
      weight: 3, tag: "growth", sourceText: "英語、朝の30分だけでも続けたい",
    }),
  ];
}

/**
 * 確定したタスク。★このダミーは「何が何に効くか」が一望できるように選んである
 * (2026-08-16にユーザー指定):
 *   形     = 埋まっている側面の数 … 円(題だけ) / 半円(+1) / 三角(+2) / 四角(+3)
 *   縦横比 = **四角だけ**題の長さで伸びる(円・半円・三角は本来の比を保つ)
 *   面積   = 重要度 × 期限の倍率 … 今日 2.2 〜 先 0.45 で強く効く
 *   色と書体 = タグ(5つとも複数個)
 * 期限は 今日 / 1〜2日 / 3〜7日 / 8〜30日 / 31日〜 / なし が一通り出るので、
 * 遠いものが小さくなり、混雑時には間引かれる様子まで見える。
 */
export function demoTasks(now = new Date()): Task[] {
  const at = now.toISOString();
  const seed = now.getTime();
  const mk = (n: number, o: Partial<Task>): Task => ({
    id: `demo-task-${seed}-${n}`, title: "", done: false, createdAt: at, ...o,
  }) as Task;
  return [
    // ── 今日が期日。いちばん大きく出る ──
    mk(1, {
      title: "確定申告", weight: 3, tag: "work", dueDate: day(now, 0),
      context: "自宅", belongings: "領収書",
      subtasks: subs(1, "領収書を集める", "経費を分類する", "電子申告"),
    }),
    mk(2, { title: "ゴミを出す", weight: 1, tag: "life", dueDate: day(now, 0) }),
    mk(3, { title: "祖母に電話", weight: 3, tag: "social", dueDate: day(now, 0) }),
    // ── 明日・明後日 ──
    mk(4, { title: "家賃の振込", weight: 3, tag: "life", dueDate: day(now, 1) }),
    mk(5, {
      title: "定例会議の資料", weight: 2, tag: "work", dueDate: day(now, 2),
      context: "会議室A",
      subtasks: subs(5, "議事録を読む", "たたき台を書く"),
    }),
    // ── 今週のうち ──
    mk(6, {
      title: "健康診断を予約する", weight: 2, tag: "wellness", dueDate: day(now, 5),
      context: "クリニック", belongings: "保険証",
    }),
    mk(7, { title: "走る", weight: 1, tag: "wellness", dueDate: day(now, 6), context: "河川敷" }),
    mk(8, { title: "お礼状", weight: 2, tag: "social", dueDate: day(now, 7), context: "郵便局" }),
    // ── 今月のうち ──
    mk(9, {
      title: "友人の結婚祝いを選んで贈る", weight: 2, tag: "social",
      dueDate: day(now, 14), context: "百貨店",
    }),
    mk(10, { title: "本棚を整理する", weight: 2, tag: "growth", dueDate: day(now, 20) }),
    mk(11, {
      title: "読みかけの本を最後まで読み切って感想を残す", weight: 2, tag: "growth",
      dueDate: day(now, 25), context: "自宅", belongings: "しおり",
    }),
    // ── それより先。小さく出て、混雑すると間引かれる ──
    mk(12, {
      title: "引っ越しの見積もりを三社から取る", weight: 3, tag: "life", dueDate: day(now, 60),
      context: "自宅", belongings: "間取り図",
      subtasks: subs(12, "候補を調べる", "電話する"),
    }),
    mk(13, { title: "名刺を刷る", weight: 1, tag: "work", dueDate: day(now, 90) }),
    // ── 期日なし ──
    mk(14, { title: "電球を買う", weight: 1, tag: "life" }),
    mk(15, { title: "英語の教材を一章ぶん進める", weight: 2, tag: "growth", context: "毎朝・自宅" }),
    mk(16, { title: "歯医者", weight: 2, tag: "wellness", context: "駅前" }),
  ];
}

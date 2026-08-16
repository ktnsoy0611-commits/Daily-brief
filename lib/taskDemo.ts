import type { InboxCandidate, SubTask, Task } from "./types";

// ★動作確認用のダミー。声のメモ→Coworkの候補がまだ溜まっていない状態でも、
// 候補が漂う様子と、タスクが落ちて積み上がる様子を見られるようにする。
// **完成時に撤去する**(SYSTEM-DESIGN.md §8 の「サンプルデータ」の一つ)。
//
// 側面の数(=断面の形)・重要度(=太さ)・タイトルの長さ(=軸の長さ)・
// サブタスク(=スラブの枚数)・5つのタグ が全部出るように選んである。

const day = (base: Date, offset: number): string => {
  const d = new Date(base);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const subs = (seed: number, ...titles: string[]): SubTask[] =>
  titles.map((title, i) => ({ id: `demo-sub-${seed}-${i}`, title, done: false }));

/** 候補(まだ確定していない)。側面 1〜4(円柱/半円柱/三角柱/四角柱)が揃う。 */
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
    mk(2, { title: "図書館に本を返す", when: "今週中", weight: 2, tag: "growth", sourceText: "図書館の本、今週までだった気がする" }),
    // 側面3(三角柱)。
    mk(3, {
      title: "歯医者を予約する", when: "来週のどこか", context: "近所の歯科", weight: 2, tag: "wellness",
      sourceText: "歯医者、そろそろ行かないとまずい",
    }),
    // 側面4(四角柱)。
    mk(4, {
      title: "母の誕生日を祝う", when: day(now, 21), context: "実家", belongings: "贈り物・カード",
      weight: 3, tag: "social", note: "だれと: 家族と\nなぜ: 節目の年だから",
      sourceText: "来月、母の誕生日。今年はちゃんとやりたい",
    }),
    // 側面4 + 長いタイトル(軸がいちばん伸びる)。
    mk(5, {
      title: "金沢へ二泊三日の旅行に行く", when: "来月の連休", context: "金沢・新幹線", belongings: "切符・カメラ",
      weight: 3, tag: "life", sourceText: "金沢、連休に行けたらいいな。新幹線で二泊くらい",
    }),
    // ここから増量ぶん。5つのタグ・4つの断面・3段階の重さが一通り出る。
    mk(6, { title: "名刺を刷り直す", when: "月内", weight: 2, tag: "work", sourceText: "名刺、そろそろ切れる" }),
    mk(7, {
      title: "確定申告の資料を集める", when: "1月中", context: "自宅", weight: 3, tag: "work",
      sourceText: "領収書、今年こそ月ごとにまとめたい",
    }),
    mk(8, { title: "走る", weight: 1, tag: "wellness", sourceText: "最近ぜんぜん体を動かしてない" }),
    mk(9, {
      title: "祖母に電話する", when: "週末", context: "実家", weight: 2, tag: "social",
      sourceText: "おばあちゃん、しばらく声を聞いてない",
    }),
    mk(10, {
      title: "写真の展示を見に行く", when: "会期中", context: "恵比寿", belongings: "チケット",
      weight: 2, tag: "growth", sourceText: "恵比寿の写真展、会期が今月までだった",
    }),
    mk(11, { title: "冬のコートをクリーニングに出す", when: "来週", weight: 1, tag: "life", sourceText: "コート、しまう前に出さないと" }),
    mk(12, {
      title: "英語の勉強を再開して毎朝三十分だけ続ける", when: "毎朝", context: "自宅・アプリ", belongings: "ノート",
      weight: 3, tag: "growth", sourceText: "英語、朝の30分だけでも続けたい",
    }),
  ];
}

/**
 * 確定したタスク。★このダミーは「何が何に効くか」が一望できるように選んである
 * (2026-08-16にユーザー指定):
 *   面積 = 重要度(WEIGHT × 期限の切迫度) … 小/中/大 × 今日/3日/1ヶ月/なし
 *   横幅 = タイトルの長さ … 4文字から、上限に当たって折り返すものまで
 *   色と書体 = タグ … 5つとも複数個あり、同じタグ同士が揃うのが見える
 */
export function demoTasks(now = new Date()): Task[] {
  const at = now.toISOString();
  const seed = now.getTime();
  const mk = (n: number, o: Partial<Task>): Task => ({
    id: `demo-task-${seed}-${n}`, title: "", done: false, createdAt: at, ...o,
  }) as Task;
  return [
    // ── いちばん大きい: 重要度=大 × 今日が期日 ──
    mk(1, {
      title: "確定申告", weight: 3, tag: "work", dueDate: day(now, 0),
      when: "今日中", context: "自宅", belongings: "領収書",
      subtasks: subs(1, "領収書を集める", "経費を分類する", "電子申告"),
    }),
    mk(2, {
      title: "健康診断の予約を取る", weight: 3, tag: "wellness", dueDate: day(now, 0),
      when: "今日", context: "クリニック",
    }),
    // ── 重要度=大 だが期日が先。上より一回り小さい ──
    mk(3, {
      title: "引っ越しの見積もりを三社から取る", weight: 3, tag: "life", dueDate: day(now, 30),
      when: "来月", context: "自宅", belongings: "間取り図",
      subtasks: subs(3, "候補を調べる", "電話する"),
    }),
    mk(4, { title: "祖母に電話", weight: 3, tag: "social", dueDate: day(now, 30) }),
    // ── 重要度=中 × 期日いろいろ ──
    mk(5, {
      title: "定例会議の資料", weight: 2, tag: "work", dueDate: day(now, 2),
      when: "水曜の朝", context: "会議室A", belongings: "ノートPC",
      subtasks: subs(5, "議事録を読む", "たたき台を書く"),
    }),
    mk(6, { title: "家賃の振込", weight: 2, tag: "life", dueDate: day(now, 3), when: "今週中" }),
    mk(7, {
      title: "友人の結婚祝いを選んで贈る", weight: 2, tag: "social", dueDate: day(now, 14),
      when: "今月中", context: "百貨店",
    }),
    mk(8, { title: "本棚を整理する", weight: 2, tag: "growth", dueDate: day(now, 30), when: "週末" }),
    mk(9, {
      title: "英語の教材を一章ぶん進める", weight: 2, tag: "growth", dueDate: day(now, 7),
      when: "毎朝", context: "自宅", belongings: "ノート",
    }),
    mk(10, { title: "歯医者に行く", weight: 2, tag: "wellness", dueDate: day(now, 5), context: "駅前の歯科" }),
    // ── いちばん小さい: 重要度=小 × 期日なし。題も短い ──
    mk(11, { title: "電球を買う", weight: 1, tag: "life" }),
    mk(12, { title: "走る", weight: 1, tag: "wellness" }),
    mk(13, { title: "名刺を刷る", weight: 1, tag: "work" }),
    mk(14, { title: "お礼状", weight: 1, tag: "social" }),
    // ── 重要度=小 だが今日が期日。上の3つよりはっきり大きくなる ──
    mk(15, { title: "ゴミを出す", weight: 1, tag: "life", dueDate: day(now, 0), when: "今朝" }),
    // ── 横幅の上限に当たって折り返すもの ──
    mk(16, {
      title: "読みかけの本を最後まで読み切って感想を書き残す", weight: 2, tag: "growth",
      dueDate: day(now, 20), when: "月末まで", context: "自宅",
    }),
  ];
}

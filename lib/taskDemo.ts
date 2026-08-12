import type { InboxCandidate, Task } from "./types";

// ★動作確認用のダミー。声のメモ→Coworkの候補がまだ溜まっていない状態でも、
// 候補が漂う様子と、タスクが落ちて積み上がる様子を見られるようにする。
// **完成時に撤去する**(SYSTEM-DESIGN.md §8 の「サンプルデータ」の一つ)。
//
// 面の数(=立体の形)と大きさ(=重要度 × 切迫度)がばらけるように選んである。

const day = (base: Date, offset: number): string => {
  const d = new Date(base);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

/** 候補(まだ確定していない)。3面=円柱 から 6面=四角柱 まで揃う。 */
export function demoCandidates(now = new Date()): InboxCandidate[] {
  const at = now.toISOString();
  const seed = now.getTime();
  const mk = (n: number, o: Partial<InboxCandidate>): InboxCandidate => ({
    id: `demo-cand-${seed}-${n}`, kind: "task", title: "", createdAt: at, ...o,
  }) as InboxCandidate;
  return [
    // 3面(円柱): 題だけ。空白の面が2つ残る。
    mk(1, { title: "自転車の空気を入れる", tag: "life", sourceText: "そういえば自転車の空気がだいぶ抜けてた" }),
    // 3面(円柱): 1つだけ埋まっている。
    mk(2, { title: "図書館に本を返す", when: "今週中", weight: 2, tag: "learn", sourceText: "図書館の本、今週までだった気がする" }),
    // 4面(半円柱)。
    mk(3, {
      title: "歯医者を予約する", when: "来週のどこか", where: "近所の歯科", who: "ひとりで", weight: 2, tag: "body",
      sourceText: "歯医者、そろそろ行かないとまずい",
    }),
    // 5面(三角柱)。
    mk(4, {
      title: "母の誕生日を祝う", when: day(now, 21), where: "実家", who: "家族と", why: "節目の年だから", weight: 3, tag: "people",
      sourceText: "来月、母の誕生日。今年はちゃんとやりたい",
    }),
    // 6面(四角柱): 全部埋まっている。
    mk(5, {
      title: "金沢へ旅行", when: "来月の連休", where: "金沢", who: "ふたりで",
      why: "ずっと行きたかった", how: "新幹線で二泊", weight: 3, tag: "life",
      sourceText: "金沢、連休に行けたらいいな。新幹線で二泊くらい",
    }),
  ];
}

/** 確定したタスク。重要度と期日をばらけさせ、山の大小がはっきり出るようにする。 */
export function demoTasks(now = new Date()): Task[] {
  const at = now.toISOString();
  const seed = now.getTime();
  const mk = (n: number, o: Partial<Task>): Task => ({
    id: `demo-task-${seed}-${n}`, title: "", done: false, createdAt: at, ...o,
  }) as Task;
  return [
    // いちばん大きい: 重要 × 今日。
    mk(1, { title: "健康診断の予約", weight: 3, tag: "body", dueDate: day(now, 0), when: day(now, 0), where: "クリニック", why: "枠が埋まる前に" }),
    mk(2, { title: "家賃の振込", weight: 3, tag: "life", dueDate: day(now, 1), when: "明日まで" }),
    // 4つ埋まっている = 三角柱 → 三角。
    mk(3, { title: "定例会議の資料", weight: 2, tag: "work", dueDate: day(now, 2), when: "水曜の朝まで", where: "会議室A", who: "チームと", why: "先に配りたい" }),
    mk(4, { title: "クリーニングを取りに行く", weight: 1, tag: "life", dueDate: day(now, 5) }),
    // 重要だが期日は先。小さくなりすぎないことの確認になる。
    // 5つ埋まっている = 四角柱 → 四角。
    mk(5, { title: "確定申告の準備", weight: 3, tag: "work", dueDate: day(now, 60), when: "来年の2月", where: "自宅", who: "ひとりで", why: "毎年のこと", how: "会計ソフトで" }),
    // いちばん小さい: 些末 × 期日なし。
    mk(6, { title: "電球を買う", weight: 1, tag: "shopping" }),
    mk(7, { title: "本棚を整理する", weight: 1, tag: "learn", dueDate: day(now, 30) }),
  ];
}

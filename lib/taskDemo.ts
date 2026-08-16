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

/** 確定したタスク。太さ・長さ・スラブ・5タグがばらけるようにしてある。 */
export function demoTasks(now = new Date()): Task[] {
  const at = now.toISOString();
  const seed = now.getTime();
  const mk = (n: number, o: Partial<Task>): Task => ({
    id: `demo-task-${seed}-${n}`, title: "", done: false, createdAt: at, ...o,
  }) as Task;
  return [
    // いちばん太い: 重要度=大。サブタスク3枚 → 3スラブ。
    mk(1, {
      title: "健康診断の予約", weight: 3, tag: "wellness", dueDate: day(now, 0),
      when: day(now, 0), context: "クリニック",
      subtasks: subs(1, "電話番号を調べる", "希望日を決める", "電話する"),
    }),
    mk(2, { title: "家賃の振込", weight: 3, tag: "life", dueDate: day(now, 1), when: "明日まで" }),
    // 側面4(四角柱)+ スラブ2枚。
    mk(3, {
      title: "定例会議の資料", weight: 2, tag: "work", dueDate: day(now, 2),
      when: "水曜の朝まで", context: "会議室A", belongings: "ノートPC",
      subtasks: subs(3, "前回の議事録を読む", "たたき台を書く"),
    }),
    mk(4, { title: "クリーニングを取りに行く", weight: 1, tag: "life", dueDate: day(now, 5) }),
    // 長いタイトル = 軸がいちばん長い。
    mk(5, {
      title: "確定申告の準備をすべて終わらせる", weight: 3, tag: "work", dueDate: day(now, 60),
      when: "来年の2月", context: "自宅・会計ソフト", belongings: "領収書の束",
      subtasks: subs(5, "領収書を集める", "経費を分類する", "ソフトに入力", "電子申告"),
    }),
    // いちばん細い: 重要度=小・期日なし・短い題。
    mk(6, { title: "電球を買う", weight: 1, tag: "life" }),
    mk(7, { title: "本棚を整理する", weight: 1, tag: "growth", dueDate: day(now, 30), when: "週末" }),
    // ここから増量ぶん。山が画面の高さぶん積み上がる量にしてある。
    mk(8, { title: "歯医者に行く", weight: 2, tag: "wellness", dueDate: day(now, 3), when: "木曜の夕方", context: "駅前の歯科" }),
    mk(9, {
      title: "友人の結婚祝いを選ぶ", weight: 2, tag: "social", dueDate: day(now, 10),
      when: "今月中", context: "百貨店", belongings: "のし・カード",
      subtasks: subs(9, "予算を決める", "候補を3つ見る"),
    }),
    mk(10, { title: "走る", weight: 1, tag: "wellness" }),
    mk(11, {
      title: "見積もりを送る", weight: 3, tag: "work", dueDate: day(now, 1), when: "明日の午前",
      subtasks: subs(11, "単価を確認", "書式に流し込む", "送付状を書く"),
    }),
    mk(12, { title: "冷蔵庫の中を片付ける", weight: 1, tag: "life", dueDate: day(now, 4) }),
    mk(13, {
      title: "英語の教材を毎朝三十分だけ進める", weight: 2, tag: "growth", dueDate: day(now, 14),
      when: "毎朝", context: "自宅", belongings: "ノート",
      subtasks: subs(13, "章立てを見る", "1章を終える"),
    }),
    mk(14, { title: "祖母に電話する", weight: 2, tag: "social", dueDate: day(now, 6), when: "週末" }),
    mk(15, {
      title: "健康保険の手続きを役所で済ませる", weight: 3, tag: "life", dueDate: day(now, 8),
      when: "平日の午前", context: "市役所", belongings: "身分証・印鑑",
      subtasks: subs(15, "必要な書類を調べる", "窓口の時間を確認"),
    }),
    mk(16, { title: "名刺を刷り直す", weight: 1, tag: "work", dueDate: day(now, 20) }),
  ];
}

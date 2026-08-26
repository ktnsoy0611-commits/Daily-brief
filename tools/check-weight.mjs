// design.md §1「fontSize と fontWeight は必ず同時に書く」の検査。
// ★style オブジェクト単位で見るので grep では書けない（1行に収まらない）。
// 片方だけ書くと残りが既定の 400 に落ち、意図せず弱く見える。
import fs from "fs"; import path from "path";
const roots = ["components", "app"];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name))
  : e.name.endsWith(".tsx") ? [path.join(d, e.name)] : []);
let bad = 0;
for (const f of roots.flatMap(walk)) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/style=\{\{(.*?)\}\}/gs)) {
    const blk = m[1];
    if (!blk.includes("fontSize") || blk.includes("fontWeight")) continue;
    if (blk.includes("目盛りの外")) continue;
    console.log(`${f}:${src.slice(0, m.index).split("\n").length}  fontSize があって fontWeight が無い`);
    bad++;
  }
}
console.log(bad === 0 ? "OK 0件" : `NG ${bad}件`);
process.exit(bad === 0 ? 0 : 1);

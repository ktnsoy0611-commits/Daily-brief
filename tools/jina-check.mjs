// Jina の取得まわりの単体チェック(fetch を差し替えて確かめる)。
//   使い方: npx tsx tools/jina-check.mjs
// ★2026-08-26・第64巡。鍵を送るとトークンを消費して尽きると 402 で全滅する
//   ので、既定を「鍵なし(20 RPM・トークン無制限)」にした。その3つの約束:
//     J1 鍵なしのときは 18 RPM に絞る / J2 402 なら鍵を外して撃ち直す /
//     J3 締切を過ぎたら間引きをやめる(待ち続けて0枚になるより429覚悟)。
// fetch を差し替えて、①鍵なしのペース ②枠切れで鍵を外して撃ち直す を確かめる。
process.env.GEMINI_API_KEY = "";
const mod = await import("../lib/briefPipeline.ts");

let bad = 0;
const ck=(l,p,g,w)=>{if(!p)bad++;console.log(`  ${p?"OK  ":"NG  "}${l}  got=${g}  want=${w}`)};
const calls = [];
const stub = (status, body="# ページ\n[a](https://x.jp/1)") => async (url, init) => {
  calls.push({ t: Date.now(), url: String(url),
               key: !!(init?.headers?.Authorization), });
  return { ok: status===200, status, url: String(url),
           headers: new Map([["content-type","text/plain"]]),
           text: async()=>body };
};

console.log("\n[J1] 鍵なしのとき ─ 18 RPM(=3.33秒おき)に絞られる");
delete process.env.JINA_USE_KEY; process.env.JINA_API_KEY = "jina_dummy";
globalThis.fetch = stub(200);
calls.length = 0;
const t0 = Date.now();
await Promise.all(Array.from({length:5},(_,i)=>mod.__fetchViaJinaForTest(`https://s${i}.example/`)));
const span = Date.now() - t0;
const gaps = calls.slice(1).map((c,i)=>c.t-calls[i].t);
console.log(`   5本で ${span}ms / 間隔 ${gaps.map(g=>g+"ms").join(" ")}`);
ck("鍵を1本も送っていない", calls.every(c=>!c.key), `${calls.filter(c=>c.key).length}本が鍵つき`, "0本");
ck("4本ぶんの間隔がちゃんと空く(>=13000ms)", span>=13000, `${span}ms`, ">=13000ms");
ck("18 RPM を超えない(どの間隔も >=3200ms)", gaps.every(g=>g>=3200), `最小 ${Math.min(...gaps)}ms`, ">=3200ms");

console.log("\n[J2] 鍵ありで枠切れ(402)のとき ─ 鍵を外して撃ち直す");
process.env.JINA_USE_KEY = "1";
let n = 0;
globalThis.fetch = async (url, init) => {
  const key = !!(init?.headers?.Authorization);
  calls.push({ t: Date.now(), url: String(url), key });
  n++;
  if (key) return { ok:false, status:402, url:String(url), headers:new Map(), text:async()=>"" };
  return { ok:true, status:200, url:String(url), headers:new Map([["content-type","text/plain"]]),
           text:async()=>"# ページ\n[a](https://x.jp/1)" };
};
calls.length = 0;
const r = await mod.__fetchViaJinaForTest("https://s9.example/");
console.log(`   撃った回数=${calls.length} / 鍵つき=${calls.filter(c=>c.key).length} / 鍵なし=${calls.filter(c=>!c.key).length}`);
ck("402 のあと鍵なしで取れている", r.ok, `ok=${r.ok}`, "true");
ck("鍵つきは1回だけ、そのあとは鍵なし", calls.filter(c=>c.key).length===1 && calls.filter(c=>!c.key).length>=1,
   `鍵つき${calls.filter(c=>c.key).length}/鍵なし${calls.filter(c=>!c.key).length}`, "1 / >=1");
ck("以後この実行では鍵を使わない", mod.jinaIsKeyless(), `${mod.jinaIsKeyless()}`, "true");
console.log(bad? `\n★ NG ${bad}件` : "\n★ 全部 OK");

console.log("\n[J3] 締切を過ぎたら間引きをやめる(0枚で打ち切られるより429覚悟で撃つ)");
mod.__setRunStartForTest(Date.now() - 220000);   // 220秒前に始まったことにする
delete process.env.JINA_USE_KEY;
globalThis.fetch = stub(200);
calls.length = 0;
const t3 = Date.now();
await Promise.all(Array.from({length:4},(_,i)=>mod.__fetchViaJinaForTest(`https://d${i}.example/`)));
const span3 = Date.now() - t3;
console.log(`   4本で ${span3}ms`);
ck("締切後は待たずに撃つ", span3 < 1000, `${span3}ms`, "<1000ms");
console.log(bad? `\n★ NG ${bad}件` : "\n★ 全部 OK");

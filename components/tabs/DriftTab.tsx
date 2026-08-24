"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LayerName } from "@/components/tasks/LayerName";
import { SolidCanvas } from "@/components/tasks/SolidCanvas";
import { DemoSeedButton } from "@/components/tasks/TaskAddButton";
import { TaskComposer, type ComposerData } from "@/components/tasks/TaskComposer";
import { MAST_H, MUTED, NAV_H, TAB_PAD_TOP } from "@/lib/constants";
import { haptic, hashStr } from "@/lib/helpers";
import { demoCandidates } from "@/lib/taskDemo";
import { specOf } from "@/lib/taskSize";
import { resolveTag } from "@/lib/taskTags";
import { SPACE, TYPE } from "@/lib/tokens";
import type { InboxCandidate, TabProps } from "@/lib/types";

// ★候補の層(DRIFT)。まだ確定していないタスクの候補が、**この層いっぱいに
// 散らばって浮遊している**。第38巡に円環カバーフローをやめた。
//
// なぜやめたか … 縦の空間(components/tasks/TaskSpace.tsx)を作ったことで、
// DRIFT は「GRAVITY の**真上**にある浮遊層」という位置を持った。輪は
// 「手前の1つを選ぶ」ための形で、奥行き方向の物語しか語れない。層として
// 見下ろせる場所になった以上、**漂っているものが漂っているように見える**方が
// 正しい。確定するとその場から真下(GRAVITY)へ落ちていく、という筋も通る。
//
// ★CSS の 3D 変形(perspective / preserve-3d / rotateY)は使わない。
// このコードベースは CSS の 3D で Safari の描画崩れを5回踏んでいる。
//
// 候補の**大きさは揃える**。重さ(重要度 × 切迫度)を持つのは確定してからで、
// 漂っているうちはまだ量られていない、という区別を形で示す。

/** 図形の縦横比(真横から見た立面。横幅=タイトルの長さなので横長にとる)。 */
const ASPECT = 1.5;
/** マスに対して図形が占める割合。1.0 だと隣とくっついて見える。 */
const FILL = 0.94;
/** ★マスの中でどれだけ散らすか(**マス1つの寸法**に対する割合)。規則的な
 *  格子に見えないようにするためで、これ以上散らすと隣と重なる。
 *  ★★器の幅ではなく**マスの幅**に掛けること。器に掛けると、3列のときの
 *  ずれが器の12%(=44px)にもなり、右端の候補が画面の外へ出た。 */
const JITTER = 0.16;
/** 下に置くもの(声のメモの件数・デモの種)の高さ。ここには散らさない。 */
const FOOT_H = 24;

/** 件数から、何列に散らすかを決める。 */
const colsFor = (n: number) => (n <= 2 ? 1 : n <= 6 ? 2 : 3);

export function DriftTab({ appState, persist, showToast, goTab, appActive, dragged }: TabProps & {
  appActive?: boolean;
  /** 縦へ払ったあとの tap を落とすための札(`TaskSpace` が持つ)。 */
  dragged?: React.MutableRefObject<boolean>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const inbox = appState.inbox;
  // ★タスクの候補だけを出す(2026-08-12にユーザー確定)。ジャーナル・ウィッシュ・
  // ストックの候補はデータとしては残るが、行き先は別途決める。
  const candidates = useMemo(() => (inbox ?? []).filter((c) => c.kind === "task"), [inbox]);
  const notes = (appState.voiceNotes ?? []).filter((n) => n.status === "new").length;
  const open = candidates.find((c) => c.id === openId) ?? null;
  const count = candidates.length;

  // 散らす器の実寸。図形の px 寸法を出すのに要る。
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    const read = () => {
      // ★★`getBoundingClientRect()` は**変形後**の箱を返す。層は見下ろしへ
      //   移るあいだ `scaleY` で畳まれるので、これで測ると器が数十pxの
      //   高さに見え、割り付けが崩れる(実際に踏んだ: 593px の器が 38px に
      //   見えて、穴が7列の細い1行になった)。**変形を含まない**
      //   `offsetWidth/offsetHeight` で測ること。
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setSize((s) => (Math.abs(s.w - w) < 0.5 && Math.abs(s.h - h) < 0.5 ? s : { w, h }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ★散らし方は**ゆらいだ格子**。件数から列と行を決め、マスの真ん中へ置いて
  //   から id 由来の値でずらす。完全な乱数にすると必ずどこかが重なるし、
  //   素の格子だと「浮遊」に見えない。ずらす量は id から決まるので、
  //   開くたびに散らばり方が変わることはない。
  const spots = useMemo(() => {
    const n = candidates.length;
    if (!n || size.w <= 0 || size.h <= 0) return [];
    const cols = colsFor(n);
    const rows = Math.ceil(n / cols);
    const cw = size.w / cols;
    const ch = size.h / rows;
    // マスに収まる最大の図形(縦横比を保つ)。
    let bw = cw * FILL;
    let bh = bw / ASPECT;
    if (bh > ch * FILL) { bh = ch * FILL; bw = bh * ASPECT; }
    return candidates.map((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const h = hashStr(c.id);
      // -0.5〜0.5 のばらけた2つ。桁を分けて取り出す。
      const jx = (((h >> 2) & 255) / 255 - 0.5) * 2 * JITTER;
      const jy = (((h >> 11) & 255) / 255 - 0.5) * 2 * JITTER;
      // ★ずらしたあとも器の中に必ず居ること。図形は中心で置くので、
      //   半分ぶんが端からはみ出さない範囲へ押し戻す。
      const clamp = (v: number, half: number) => Math.min(1 - half, Math.max(half, v));
      return {
        c,
        w: bw, h: bh,
        left: clamp((col + 0.5 + jx) / cols, bw / 2 / size.w) * 100,
        top: clamp((row + 0.5 + jy) / rows, bh / 2 / size.h) * 100,
        // 揺れが揃わないよう、始まりを id からずらす。
        delay: -((h >> 3) % 54) / 10,
      };
    });
  }, [candidates, size]);

  const patch = (id: string, p: Partial<ComposerData>) => {
    const next = structuredClone(appState);
    const c = next.inbox.find((x) => x.id === id);
    if (c) Object.assign(c, p);
    persist(next);
  };
  // 承認・却下した候補は覚えておく(Coworkが同じものを何度も差し出さないように)。
  const remember = (next: typeof appState, id: string) => {
    next.profile.handledInbox = Array.from(new Set([...(next.profile.handledInbox ?? []), id])).slice(-500);
  };
  const drop = (id: string) => {
    const next = structuredClone(appState);
    next.inbox = next.inbox.filter((x) => x.id !== id);
    remember(next, id);
    persist(next);
    setOpenId(null);
  };

  // ★確定 = 重さを持ち、重力の側へ落ちていく。カメラも一緒に降りる
  //   (`goTab` が `TaskSpace` の `--cam` を動かす)。降りた先では
  //   `GravityTab` が画面の上端の外から図形を落としてくる。
  const confirm = (c: InboxCandidate, final: ComposerData) => {
    const next = structuredClone(appState);
    const now = new Date().toISOString();
    next.tasks.unshift({
      id: `task-${Date.now()}`,
      title: final.title,
      // 期日はカレンダーが書いた日付をそのまま持つ(切迫度=大きさに効く)。
      dueDate: final.dueDate, endDate: final.endDate,
      dueTime: final.dueTime, endTime: final.endTime,
      context: final.context, belongings: final.belongings,
      subtasks: final.subtasks, suggestions: final.suggestions,
      weight: final.weight ?? 2, tag: final.tag, note: final.note,
      done: false, createdAt: now,
    });
    next.inbox = next.inbox.filter((x) => x.id !== c.id);
    remember(next, c.id);
    persist(next);
    setOpenId(null);
    showToast("タスクにしました");
    goTab("tasks-gravity");
  };

  const seedDemo = () => {
    const next = structuredClone(appState);
    next.inbox = [...demoCandidates(), ...(next.inbox ?? [])];
    persist(next);
    showToast("デモの候補を入れました");
  };

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <LayerName text="DRIFT" />

      {/* 浮遊の場。上はアプリ名の札と層の名前、下はタブバーぶんを空ける。 */}
      <div
        ref={fieldRef}
        style={{
          position: "absolute",
          top: `calc(${TAB_PAD_TOP} + ${MAST_H}px + ${SPACE.xxl}px)`,
          left: SPACE.sm, right: SPACE.sm,
          bottom: `calc(${NAV_H} + ${FOOT_H}px)`,
        }}>
        {spots.map(({ c, w, h, left, top, delay }) => (
          <div key={c.id} style={{
            position: "absolute", left: `${left}%`, top: `${top}%`,
            transform: "translate(-50%, -50%)",
          }}>
            {/* ふわふわは内側に掛ける。外側は散らした場所(JSがleft/topを書く)。 */}
            <div className="drift-bob" style={{
              animationDelay: `${delay}s`,
              // ★このアプリを見ていない間は止める。列は常にマウントされたまま
              // なので、放っておくと裏でずっと合成し続ける(実測で他アプリに
              // いる間も 118ms/1.5秒 の負荷が出ていた)。
              animationPlayState: appActive === false ? "paused" : "running",
            }}>
              <button
                onClick={() => {
                  // 縦へ払ったときは開かない(カメラの移動が目的だった)。
                  if (dragged?.current) return;
                  haptic(8);
                  setOpenId(c.id);
                }}
                aria-label={`${c.title || "無題の候補"}を開く`}
                style={{ border: "none", background: "none", padding: 0, cursor: "pointer", display: "block" }}>
                <SolidCanvas
                  w={w} h={h}
                  paint={{
                    spec: specOf(c), view: "name", title: c.title,
                    // ★タグ無しの図形は作らない(2026-08-16確定)。
                    tag: resolveTag(c.tag, c.id, c.title, c.context, c.belongings, c.note),
                  }}
                />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        position: "absolute", left: 16, right: 16, bottom: `calc(${NAV_H} + ${SPACE.sm}px)`,
        textAlign: "center",
      }}>
        {notes > 0 && (
          <div style={{ fontSize: TYPE.small, color: MUTED }}>
            まだ読まれていない声のメモが{notes}件
          </div>
        )}
        {count === 0 && <DemoSeedButton label="デモの候補を入れる" onSeed={seedDemo} />}
      </div>

      {open && (
        <TaskComposer
          key={open.id}
          data={open}
          mode="candidate"
          onCommit={(d) => patch(open.id, d)}
          onConfirm={(d) => confirm(open, d)}
          onDelete={() => drop(open.id)}
          // ★★閉じたら**必ず開いている印を下ろす**(2026-08-24)。
          //   `patch` は書いて保存するだけで、`openId` を下ろさなかったため
          //   `TaskComposer` が**一度も外れなかった**。実害が2つ出ていた:
          //     ・吸い込みの円は半径0まで縮まない(帰り先の丸の大きさで止まる)
          //       ので、外れないまま**黒い丸が残って見えた**。
          //     ・入力画面が html に立てる `[data-overlay]` も外れず、
          //       タスクアプリの器が触りを握れないまま = **上下スワイプが
          //       効かない**。実機で報告された2件は、どちらもこれ1つが原因。
          onClose={(d) => { patch(open.id, d); setOpenId(null); }}
        />
      )}
    </div>
  );
}

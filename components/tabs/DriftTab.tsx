"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Masthead } from "@/components/common";
import { SolidCanvas } from "@/components/tasks/SolidCanvas";
import { DemoSeedButton, TaskAddButton } from "@/components/tasks/TaskAddButton";
import { TaskComposer, type ComposerData } from "@/components/tasks/TaskComposer";
import { appTitle } from "@/lib/apps";
import { INK, MUTED, SANS } from "@/lib/constants";
import { haptic, hashStr } from "@/lib/helpers";
import { demoCandidates } from "@/lib/taskDemo";
import { specOf } from "@/lib/taskSize";
import { resolveTag } from "@/lib/taskTags";
import type { InboxCandidate, TabProps } from "@/lib/types";

// ★候補タブ(DRIFT)。まだ確定していないタスクの候補が、**円環に並んで**
// 奥行き方向へ広がっている。手前の1つだけがはっきり見え、左右に払うと
// 輪が回って次の候補が手前へ来る(2026-08-12にユーザー指定)。
//
// ★CSS の 3D 変形(perspective / preserve-3d / rotateY)は使わない。
// 円環上の位置と遠近の縮みを JS で計算し、**2Dの translate と scale だけ**を
// 与える。このコードベースは CSS の 3D で Safari の描画崩れを5回踏んでいる。
//
// ★指の動きで React の state を動かさない(§14 の性能の落とし穴)。回転は
// ref + rAF で各要素の style を直接書き、落ち着いたときだけ state を更新する。
//
// 候補の**大きさは揃える**。重さ(重要度 × 切迫度)を持つのは確定してからで、
// 漂っているうちはまだ量られていない、という区別を形で示す。

/** 図形の器。真横から見た長方形なので横長にとる(横幅=タイトルの長さ)。 */
const SOLID_W = 300;
const SOLID_H = 190;
/** 輪の1つぶんの角度。件数が多いときは一周に収まるよう詰める。
 *  ★狭くしすぎないこと。角度が小さいと cos がほとんど変わらず、隣の候補が
 *  同じ大きさ・同じ濃さで並んで「輪」ではなく「団子」に見える(実際そうなった)。 */
const stepFor = (n: number) => Math.min(1.15, (Math.PI * 2) / Math.max(n, 1));
/** 指をどれだけ動かすと1つ送るか。 */
const DRAG_PER_ITEM = 150;
/** 遠近の効き。小さいほど奥のものが強く縮む。 */
const FOCAL = 1.9;
/** 輪の半径(手前に来たときの左右の広がり)。 */
const SPREAD = 215;
/** 払ったあとの惰性。この時間ぶん、離したときの速さで流れ続けるとみなす。 */
const COAST_MS = 260;
const SNAP_MIN_MS = 260;
const SNAP_MAX_MS = 680;

export function DriftTab({ appState, persist, profileButton, showToast, goTab, appActive }: TabProps & { appActive?: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  // ＋で作ったばかりのもの。開いた直後に題の入力へ入り、何も書かずに
  // 閉じたらそのまま捨てる(名前のないものを残さない)。
  const [draftId, setDraftId] = useState<string | null>(null);
  const inbox = appState.inbox;
  // ★タスクの候補だけを出す(2026-08-12にユーザー確定)。ジャーナル・ウィッシュ・
  // ストックの候補はデータとしては残るが、行き先は別途決める。
  const candidates = useMemo(() => (inbox ?? []).filter((c) => c.kind === "task"), [inbox]);
  const notes = (appState.voiceNotes ?? []).filter((n) => n.status === "new").length;
  const open = candidates.find((c) => c.id === openId) ?? null;
  const count = candidates.length;

  // 輪の回転。posRef は連続値(0 = 先頭が手前)。
  const posRef = useRef(0);
  const itemsRef = useRef<(HTMLDivElement | null)[]>([]);
  const labelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    id: number; x: number; y: number; from: number; axis: "" | "x" | "y"; moved: boolean;
    // 惰性のための速さ(index/ms)。直近の動きを平滑化して持つ。
    vel: number; lastX: number; lastT: number;
  } | null>(null);
  const glideRef = useRef(0);
  const [front, setFront] = useState(0);

  // 円環上の位置を各要素へ書き込む。**React は通さない**。
  const apply = useCallback(() => {
    const n = itemsRef.current.length;
    if (!n) return;
    const step = stepFor(n);
    const pos = posRef.current;
    for (let i = 0; i < n; i++) {
      const el = itemsRef.current[i];
      if (!el) continue;
      const a = (i - pos) * step;
      const z = Math.cos(a);
      const x = Math.sin(a);
      // 遠近。奥(z=-1)ほど小さく、手前(z=1)で等倍。
      const scale = FOCAL / (FOCAL + (1 - z));
      const tx = x * SPREAD * scale;
      el.style.transform = `translate(-50%, -50%) translate(${tx.toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;
      // **手前の1つだけがはっきり見える**ようにする。離れるほど急に薄くなり、
      // 真後ろへ回ったものは消える。輪が奥へ広がって見えるよう、消し切らない。
      const d = Math.abs(a) / step;
      const fade = 1 / (1 + d * 2.3);
      const behind = Math.max(0, Math.min(1, (z + 0.95) / 1.2));
      el.style.opacity = (fade * behind).toFixed(3);
      el.style.zIndex = String(Math.round(z * 100) + 100);
      // 手前の1つだけ触れる。
      el.style.pointerEvents = Math.abs(a) < step / 2 ? "auto" : "none";
    }
    const near = Math.max(0, Math.min(n - 1, Math.round(pos)));
    const label = labelRef.current;
    const title = candidates[near]?.title ?? "";
    // 値が同じなら書かない(毎フレームのレイアウトを避ける)。
    if (label && label.textContent !== title) label.textContent = title;
  }, [candidates]);

  useEffect(() => {
    posRef.current = Math.max(0, Math.min(Math.max(count - 1, 0), posRef.current));
    apply();
  }, [count, apply]);

  // 指を離したあと、**惰性を乗せて**いちばん近い候補へ寄せる。
  // 速く払えばいくつも送られ、そっと離せば隣で止まる。
  const glide = useCallback((vel: number) => {
    const n = itemsRef.current.length;
    const from = posRef.current;
    // 離したときの速さで COAST_MS ぶん流れた先を見て、そこから近いものを選ぶ。
    const projected = from + vel * COAST_MS;
    const target = Math.max(0, Math.min(n - 1, Math.round(projected)));
    if (Math.abs(target - from) < 0.001) { setFront(target); return; }
    const dist = Math.abs(target - from);
    const dur = Math.max(SNAP_MIN_MS, Math.min(SNAP_MAX_MS, 220 + dist * 200));
    const t0 = performance.now();
    const id = ++glideRef.current;
    const tick = () => {
      if (glideRef.current !== id) return; // 新しい操作が始まったら降りる
      const k = Math.min(1, (performance.now() - t0) / dur);
      // ease-out。勢いよく出て、するすると止まる。
      const e = 1 - Math.pow(1 - k, 3);
      posRef.current = from + (target - from) * e;
      apply();
      if (k < 1) requestAnimationFrame(tick);
      else setFront(target);
    };
    requestAnimationFrame(tick);
  }, [apply]);

  const onDown = (e: React.PointerEvent) => {
    if (count < 2) return;
    glideRef.current++; // 流れている途中なら、そこで掴んで止める
    dragRef.current = {
      id: e.pointerId, x: e.clientX, y: e.clientY, from: posRef.current, axis: "", moved: false,
      vel: 0, lastX: e.clientX, lastT: performance.now(),
    };
  };

  // ★追従は window に張る。指が舞台の外へ出た瞬間に要素側の
  // onPointerMove は呼ばれなくなり、ジェスチャーが途中で死ぬため(§7.26)。
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      // 最初の8pxでどちらの軸かを決め、決まった軸だけを見る。
      if (!d.axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        d.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (d.axis === "y") { dragRef.current = null; return; }
      }
      d.moved = true;
      // 速さ(index/ms)を平滑化しながら持つ。指を止めてから離したときに
      // 惰性が残らないよう、間が空いたら鈍らせる。
      const now = performance.now();
      const dt = Math.max(1, now - d.lastT);
      const v = -(e.clientX - d.lastX) / DRAG_PER_ITEM / dt;
      const blend = Math.min(1, dt / 90);
      d.vel = d.vel * (1 - blend) + v * blend;
      d.lastX = e.clientX;
      d.lastT = now;
      const n = itemsRef.current.length;
      let next = d.from - dx / DRAG_PER_ITEM;
      // 端では引っぱりを弱め、これ以上先が無いことを体で示す。
      if (next < 0) next = next * 0.32;
      if (next > n - 1) next = (n - 1) + (next - (n - 1)) * 0.32;
      posRef.current = next;
      apply();
    };
    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.id) return;
      const moved = d.moved;
      // 指を止めてから離したときは惰性ゼロ(最後に動いたときの速さが
      // 残り続けるのを防ぐ。声の記録のダイヤルで踏んだのと同じ罠)。
      const vel = performance.now() - d.lastT > 90 ? 0 : d.vel;
      dragRef.current = null;
      if (moved) { haptic(6); glide(vel); }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [apply, glide]);

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

  // ★確定 = 重さを持ち、重力の側へ落ちていく。
  const confirm = (c: InboxCandidate, final: ComposerData) => {
    const next = structuredClone(appState);
    const now = new Date().toISOString();
    next.tasks.unshift({
      id: `task-${Date.now()}`,
      title: final.title,
      // 期日はカレンダーが書いた日付をそのまま持つ(切迫度=大きさに効く)。
      dueDate: final.dueDate, endDate: final.endDate, dueTime: final.dueTime,
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

  // 手で候補を足す。まず空のまま作って開き、題を書いてもらう。
  const addCandidate = () => {
    const id = `cand-${Date.now()}`;
    const next = structuredClone(appState);
    // ★重要度の既定は**中**(2026-08-17にユーザー指定)。
    next.inbox = [{ id, kind: "task", title: "", weight: 2, createdAt: new Date().toISOString() }, ...(next.inbox ?? [])];
    persist(next);
    posRef.current = 0;
    setFront(0);
    setDraftId(id);
    setOpenId(id);
  };

  // 題が空のまま閉じたら、作りかけを消す。
  // 閉じるときに下書きをまとめて保存する。★題が空のままなら作りかけを消す。
  const closeNet = (id: string, final: ComposerData) => {
    setOpenId(null);
    const isDraft = draftId === id;
    if (isDraft) setDraftId(null);
    if (isDraft && !final.title.trim()) {
      const next = structuredClone(appState);
      next.inbox = next.inbox.filter((x) => x.id !== id);
      persist(next);
      return;
    }
    patch(id, final);
  };

  const seedDemo = () => {
    const next = structuredClone(appState);
    next.inbox = [...demoCandidates(), ...(next.inbox ?? [])];
    persist(next);
    showToast("デモの候補を入れました");
  };

  return (
    <main style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <Masthead title={appTitle("tasks")} corner={profileButton} />

      {/* 円環。手前の1つだけがはっきり見え、左右に払うと回る。 */}
      <div
        onPointerDown={onDown}
        style={{ position: "relative", flex: 1, minHeight: 340, touchAction: "pan-y", overflow: "hidden" }}>
        {candidates.map((c, i) => (
          <div
            key={c.id}
            ref={(el) => { itemsRef.current[i] = el; }}
            style={{ position: "absolute", left: "50%", top: "50%", willChange: "transform, opacity" }}>
            {/* ふわふわは内側に掛ける。外側は輪の回転(JSがtransformを書く)。 */}
            <div className="drift-bob" style={{
              animationDuration: `${4.6 + (hashStr(c.id) % 22) / 10}s`,
              animationDelay: `-${(hashStr(c.id) >> 3) % 40 / 10}s`,
              // ★このアプリを見ていない間は止める。列は常にマウントされたまま
              // なので、放っておくと裏でずっと合成し続ける(実測で他アプリに
              // いる間も 118ms/1.5秒 の負荷が出ていた)。
              animationPlayState: appActive === false ? "paused" : "running",
            }}>
              <button
                onClick={() => {
                  if (dragRef.current?.moved) return;
                  haptic(8);
                  setOpenId(c.id);
                }}
                aria-label={`${c.title || "無題の候補"}を開く`}
                style={{ border: "none", background: "none", padding: 0, cursor: "pointer", display: "block" }}>
                <SolidCanvas
                  w={SOLID_W} h={SOLID_H}
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

      {/* 手前の候補の題。輪を回すたびに ref 経由で書き換える。 */}
      <div style={{ textAlign: "center", padding: "0 20px", minHeight: 46 }}>
        <div ref={labelRef} style={{
          fontFamily: SANS, fontSize: 15, fontWeight: 700, color: INK, lineHeight: 1.4,
          overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        }}>{candidates[front]?.title ?? ""}</div>
        {count > 1 && (
          <div style={{ fontSize: 10.5, color: MUTED, marginTop: 6, letterSpacing: "0.1em" }}>
            {Math.min(front + 1, count)} / {count}
          </div>
        )}
      </div>

      {notes > 0 && (
        <div style={{ fontSize: 10.5, color: MUTED, textAlign: "center", padding: "8px 0 2px" }}>
          まだ読まれていない声のメモが{notes}件
        </div>
      )}
      <TaskAddButton onAdd={addCandidate} />
      {count === 0 && <DemoSeedButton label="デモの候補を入れる" onSeed={seedDemo} />}
      {open && (
        <TaskComposer
          key={open.id}
          data={open}
          mode="candidate"
          onCommit={(d) => patch(open.id, d)}
          onConfirm={(d) => confirm(open, d)}
          onDelete={() => drop(open.id)}
          onClose={(d) => closeNet(open.id, d)}
        />
      )}
    </main>
  );
}

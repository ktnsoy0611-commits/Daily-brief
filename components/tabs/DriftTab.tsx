"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Masthead } from "@/components/common";
import { PrismSolid } from "@/components/tasks/PrismSolid";
import { DemoSeedButton, TaskAddButton } from "@/components/tasks/TaskAddButton";
import { TaskNet, type NetData } from "@/components/tasks/TaskNet";
import { appTitle } from "@/lib/apps";
import { INK, MUTED, SANS } from "@/lib/constants";
import { haptic } from "@/lib/helpers";
import { assignFaces } from "@/lib/prism";
import { demoCandidates } from "@/lib/taskDemo";
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

const SOLID = 132;
/** 輪の1つぶんの角度。件数が多いときは一周に収まるよう詰める。
 *  ★狭くしすぎないこと。角度が小さいと cos がほとんど変わらず、隣の候補が
 *  同じ大きさ・同じ濃さで並んで「輪」ではなく「団子」に見える(実際そうなった)。 */
const stepFor = (n: number) => Math.min(1.15, (Math.PI * 2) / Math.max(n, 1));
/** 指をどれだけ動かすと1つ送るか。 */
const DRAG_PER_ITEM = 132;
/** 遠近の効き。小さいほど奥のものが強く縮む。 */
const FOCAL = 1.9;
/** 手前に来たときの左右の広がり。 */
const SPREAD = 150;
const SNAP_MS = 320;

/** 候補の 5W1H から、いま何面の立体か。 */
export const candidateFaces = (c: InboxCandidate): number =>
  assignFaces({ when: c.when, where: c.where, who: c.who, why: c.why, how: c.how }, c.faces, c.title).faceCount;

export function DriftTab({ appState, persist, profileButton, showToast, goTab }: TabProps) {
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
  const dragRef = useRef<{ id: number; x: number; y: number; from: number; axis: "" | "x" | "y"; moved: boolean } | null>(null);
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

  // 指を離したあと、いちばん近い候補へ寄せる。
  const snap = useCallback(() => {
    const n = itemsRef.current.length;
    const target = Math.max(0, Math.min(n - 1, Math.round(posRef.current)));
    const from = posRef.current;
    if (Math.abs(target - from) < 0.001) { setFront(target); return; }
    const t0 = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / SNAP_MS);
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
    dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: posRef.current, axis: "", moved: false };
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
      dragRef.current = null;
      if (moved) { haptic(6); snap(); }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [apply, snap]);

  const patch = (id: string, p: Partial<NetData>) => {
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
  const confirm = (c: InboxCandidate) => {
    const next = structuredClone(appState);
    const now = new Date().toISOString();
    next.tasks.unshift({
      id: `task-${Date.now()}`,
      title: c.title,
      // 「いつ」が日付そのものなら期日として持つ(切迫度=大きさに効く)。
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(c.when ?? "") ? c.when : undefined,
      when: c.when, where: c.where, who: c.who, why: c.why, how: c.how,
      faces: c.faces, weight: c.weight ?? 2, tag: c.tag,
      // Coworkが別に「なにを」を書いていた場合だけメモへ回す(タイトルと同義のため)。
      note: c.what && c.what !== c.title ? c.what : undefined,
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
    next.inbox = [{ id, kind: "task", title: "", createdAt: new Date().toISOString() }, ...(next.inbox ?? [])];
    persist(next);
    posRef.current = 0;
    setFront(0);
    setDraftId(id);
    setOpenId(id);
  };

  // 題が空のまま閉じたら、作りかけを消す。
  const closeNet = (id: string) => {
    setOpenId(null);
    if (draftId !== id) return;
    setDraftId(null);
    const c = (appState.inbox ?? []).find((x) => x.id === id);
    if (c && !c.title.trim()) {
      const next = structuredClone(appState);
      next.inbox = next.inbox.filter((x) => x.id !== id);
      persist(next);
    }
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
            <button
              onClick={() => {
                if (dragRef.current?.moved) return;
                haptic(8);
                setOpenId(c.id);
              }}
              aria-label={`${c.title || "無題の候補"}を開く`}
              style={{ border: "none", background: "none", padding: 0, cursor: "pointer", display: "block" }}>
              <PrismSolid faceCount={candidateFaces(c)} size={SOLID} />
            </button>
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
        <TaskNet
          key={open.id}
          data={open}
          mode="candidate"
          autoEdit={draftId === open.id}
          onChange={(p) => patch(open.id, p)}
          onConfirm={() => confirm(open)}
          onDelete={() => drop(open.id)}
          onClose={() => closeNet(open.id)}
        />
      )}
    </main>
  );
}

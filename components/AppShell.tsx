"use client";

import { Heart, LayoutGrid, Map as MapIcon, Newspaper, Sprout, User } from "lucide-react";
import { useCallback, useEffect, useState, type ComponentType, type CSSProperties } from "react";
import { BriefTab } from "@/components/tabs/BriefTab";
import { ExecuteTab } from "@/components/tabs/ExecuteTab";
import { GoalsTab } from "@/components/tabs/GoalsTab";
import { ProfileTab } from "@/components/tabs/ProfileTab";
import { RecordsTab } from "@/components/tabs/RecordsTab";
import { StockTab } from "@/components/tabs/StockTab";
import { BG, BLUE, INK, PAPER, RUST, SANS, SOFT_SHADOW } from "@/lib/constants";
import { DataStore } from "@/lib/dataStore";
import { detectInterests, haptic, isExpiredKeep, todayKey } from "@/lib/helpers";
import type { AppState, TabId, TabProps } from "@/lib/types";

const TABS: { id: TabId; label: string; Icon: ComponentType<{ size?: number; strokeWidth?: number; color?: string; style?: CSSProperties }> }[] = [
  { id: "records", label: "記録", Icon: LayoutGrid },
  { id: "brief", label: "ブリーフ", Icon: Newspaper },
  { id: "stock", label: "ストック", Icon: Heart },
  { id: "goals", label: "目標", Icon: Sprout },
  { id: "execute", label: "実行", Icon: MapIcon },
];

export function AppShell() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [tab, setTab] = useState<TabId>("records");
  const [showProfile, setShowProfile] = useState(false);
  const [storageMode, setStorageMode] = useState(DataStore.mode);
  const [toast, setToast] = useState("");

  useEffect(() => {
    let alive = true;
    DataStore.load().then(async (s) => {
      if (!alive) return;
      // マガジンは「その日専用」。日付が変わっても未回答(✓も×もされていない)
      // ままの項目が残っていたら、ダッシュボードの通知キューに移してリセットする。
      let mutated = false;
      if (s.magazine && s.magazine.dateKey !== todayKey()) {
        // メディアは候補プールに残り続けるだけなので通知は不要。場所のKeepだけ
        // 「行きましたか？」の確認待ちに回す。
        const staleKeepIds = (s.magazine.itemIds ?? []).filter((r) => r.type === "keep").map((r) => r.id);
        const existing = new Set(s.pendingReview ?? []);
        staleKeepIds.forEach((id) => existing.add(id));
        s.pendingReview = Array.from(existing);
        s.magazine = null;
        mutated = true;
      }
      // 会期・予約期間が過ぎた(またはexpiresAtがなく30日経った)Keepを自動で削除。
      // 終わったはずの展覧会やライブが候補に残り続けるのを防ぐ。
      const expiredIds = s.keeps.filter(isExpiredKeep).map((k) => k.id);
      if (expiredIds.length > 0) {
        s.keeps = s.keeps.filter((k) => !expiredIds.includes(k.id));
        if (s.magazine) s.magazine.itemIds = s.magazine.itemIds.filter((r) => !(r.type === "keep" && expiredIds.includes(r.id)));
        s.pendingReview = (s.pendingReview ?? []).filter((id) => !expiredIds.includes(id));
        mutated = true;
      }
      setAppState(s);
      setStorageMode(DataStore.mode);
      if (mutated) await DataStore.save(s);
    });
    return () => { alive = false; };
  }, []);

  const persist = useCallback((next: AppState) => {
    setAppState(next);
    DataStore.save(next).then(setStorageMode);
  }, []);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 1600); };

  useEffect(() => {
    if (!appState) return;
    const detected = detectInterests(appState.wishes, appState.keeps);
    const next = structuredClone(appState);
    next.profile = next.profile ?? { interests: [], currentFocus: "" };
    let changed = false;
    detected.forEach((d) => {
      const existing = next.profile.interests.find((i) => i.label === d.label);
      if (!existing) {
        next.profile.interests.push({ id: `auto-${d.label}-${Date.now()}`, label: d.label, categoryId: d.categoryId, kind: d.kind ?? "hobby", weight: d.weight, source: "auto", addedAt: new Date().toISOString() });
        changed = true;
      } else if (existing.source === "auto" && d.weight > existing.weight) {
        existing.weight = d.weight;
        changed = true;
      }
    });
    if (changed) persist(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState?.wishes, appState?.keeps]);

  if (!appState) {
    return <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, color: "#9A988E", fontSize: 13 }}>読み込んでいます…</div>;
  }

  const interestCount = (appState.profile?.interests ?? []).length;
  const profileButton = (
    <button onClick={() => { haptic(5); setShowProfile(true); }} aria-label="プロフィール" style={{
      position: "relative", width: 34, height: 34, borderRadius: "50%",
      background: PAPER, border: "none", display: "flex", alignItems: "center", justifyContent: "center",
      cursor: "pointer", color: INK, boxShadow: SOFT_SHADOW, padding: 0, flexShrink: 0,
    }}>
      <User size={15} strokeWidth={1.75} />
      {interestCount > 0 && (
        <span style={{
          position: "absolute", top: -3, right: -3, minWidth: 15, height: 15, borderRadius: 999, background: BLUE,
          color: PAPER, fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px",
        }}>{interestCount}</span>
      )}
    </button>
  );
  const tabProps: TabProps = { appState, persist, showToast, goTab: setTab, profileButton };

  return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", fontFamily: SANS, color: INK }}>
      <div style={{ width: "100%", maxWidth: 420, flex: 1, display: "flex", flexDirection: "column", padding: `0 16px ${showProfile ? 24 : 84}px` }}>
        {storageMode === "memory" && <div style={{ fontSize: 9, color: RUST, letterSpacing: "0.05em", padding: "6px 4px 0", textAlign: "right" }}>メモリ動作中</div>}

        {showProfile ? (
          <ProfileTab appState={appState} persist={persist} onClose={() => setShowProfile(false)} />
        ) : (
          <>
            <div key={tab} style={{ display: "flex", flexDirection: "column", flex: 1, animation: "tab-in 0.22s cubic-bezier(0.32,0.72,0,1)" }}>
              {tab === "brief" && <BriefTab {...tabProps} />}
              {tab === "stock" && <StockTab {...tabProps} />}
              {tab === "goals" && <GoalsTab {...tabProps} />}
              {tab === "records" && <RecordsTab {...tabProps} />}
              {tab === "execute" && <ExecuteTab {...tabProps} />}
            </div>
          </>
        )}
      </div>

      {toast && (
        <div key={toast} style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: INK, color: PAPER, borderRadius: 999,
          fontSize: 11, letterSpacing: "0.06em", padding: "8px 18px", boxShadow: "0 8px 24px rgba(23,23,21,0.25)", zIndex: 50,
          animation: "toast-in 0.3s cubic-bezier(0.32,0.72,0,1)",
        }}>{toast}</div>
      )}

      {!showProfile && (
        <nav style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 25, display: "flex", justifyContent: "center", background: PAPER, boxShadow: "0 -8px 24px rgba(23,23,21,0.06)", paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div style={{ width: "100%", maxWidth: 420, display: "flex" }}>
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => { haptic(5); setTab(t.id); }} style={{ flex: 1, padding: "12px 0 10px", background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 40, height: 26, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", background: active ? INK : "transparent", transition: "background 0.2s" }}>
                    <t.Icon size={17} strokeWidth={1.8} color={active ? PAPER : "rgba(23,23,21,0.38)"} style={{ transition: "color 0.2s, stroke 0.2s" }} />
                  </div>
                  <span style={{ fontFamily: SANS, fontSize: 9.5, color: active ? INK : "rgba(23,23,21,0.38)", fontWeight: active ? 700 : 400, transition: "color 0.2s" }}>{t.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

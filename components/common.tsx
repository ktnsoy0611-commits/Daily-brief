"use client";

import { SPACE, TYPE, LEAD, TRACK, WEIGHT, RADIUS } from "@/lib/tokens";
import { ExternalLink } from "lucide-react";
import { type ComponentType, type CSSProperties, type ReactNode } from "react";
import { HAIRLINE, INK, MAST_SIZE, MUTED, PAPER, SANS, SECOND, TITLE, WHITE } from "@/lib/constants";
import { img } from "@/lib/helpers";
import { BottomSheet, OverlayCard } from "./BottomSheet";

export type IconType = ComponentType<{ size?: number | string; strokeWidth?: number; color?: string }>;

// ★各タブの見出し(2026-08-03)。名前は**英語**で大きく置く。★★第134巡に幾何アルファベット
// (components/GeoType.tsx)から `TITLE`（Arial の太字）へ替えた（ユーザー指定）。以前ここに出していた「〇件」の
// 数字は、情報としてほとんど意味を成していなかったので撤去した。
// ★★右肩の器(`right` / `corner`)は**廃した**(2026-08-26・第68巡)。唯一の
// 住人だった設定の歯車が右下の輪(`components/CreateMenu.tsx` の SETTING)へ
// 移ったので、空の flex が7画面ぶん残るのを避ける。
export function Masthead({ title, dateline }: {
  /** 見出しの英語表記。 */
  title: string;
  dateline?: ReactNode;
}) {
  // ★左右のパディングを持たない。持ち主は AppShell(16px)だけ(design.md §2)。
  return (
    <header style={{ padding: `${SPACE.md}px 0 ${SPACE.lg}px` }}>
      <div style={{ minWidth: 0 }}>
        {/* ★色は地が決める（`AppShell` が `--ink-on` を置く）。既定は明るい地。 */}
        <h1 style={{
          margin: 0, fontFamily: TITLE, fontSize: MAST_SIZE, fontWeight: WEIGHT.bold,
          lineHeight: LEAD.flat, letterSpacing: TRACK.tight, color: `var(--ink-on, ${INK})`,
          whiteSpace: "nowrap",
        }}>{title}</h1>
        {dateline && <div style={{ fontSize: TYPE.small, fontWeight: WEIGHT.text, color: `var(--muted-on, ${MUTED})`, marginTop: SPACE.md }}>{dateline}</div>}
      </div>
    </header>
  );
}

// ★セクションの見出し(2026-08-03)。棚の名前(バショ/モノ/…)・やったこと・
// 記録など、要所の短いラベル。一度これも幾何アルファベットで置いたが、
// 「下の文字に戻して、デザインに調和するよう大きさとフォントを調節して」という
// 指定で本文と同じ書体へ戻した。幾何アルファベットで残すのは Masthead の
// 見出し(各タブの名前)だけ。
// 大きさ・字間・太さはここ1箇所で決め、全タブ・全アプリで揃える
// (以前は 9/10/11px と字間がタブごとにばらばらだった)。
export function SectionLabel({ text, style }: { text: string; style?: CSSProperties }) {
  return (
    <div style={{ fontSize: TYPE.small, fontWeight: WEIGHT.bold, letterSpacing: TRACK.wide, color: `var(--muted-on, ${MUTED})`, lineHeight: LEAD.snug, ...style }}>
      {text}
    </div>
  );
}

// ★空状態には何も置かない(2026-08-02)。第1弾では地に溶ける図形ひとつ(84px)を
// 中央に置いていたが、実機で「背景の小さい図形が画面の中央に残っている」と
// 指摘され撤去した。


export interface BinderItem {
  title: string;
  category?: string;
  categoryJp?: string;
  // 説明文。詳細オーバーレイには detail(長文) を優先して表示し、無ければ
  // body/summary(短文)にフォールバックする。ブリーフのカードは body(短)と
  // detail(長)を両方持つので、詳細では detail が出る。
  body?: string;
  summary?: string;
  detail?: string;
  images?: string[];
  meta?: string[];
  sourceUrl?: string;
  sourceLabel?: string;
}

export function BinderModal({ item, onClose, actionSlot }: {
  item: BinderItem | null;
  onClose: () => void;
  actionSlot?: (requestClose: () => void) => ReactNode;
}) {
  if (!item) return null;
  const rotations = [-7, 3, 9];

  return (
    <BottomSheet onClose={onClose} maxHeight="76vh">
      {(requestClose) => (
        <>
          {(item.images ?? []).length === 1 ? (
            // 写真が1枚(OGP画像は横長)のときは、傾けた小さいスタックにせず
            // 大きく1枚を見せる。読み込めなければ隠す(色ベタのまま)。
            <div style={{ padding: `0 0 ${SPACE.lg}px` }}>
              <img
                src={img(item.images![0], 720, 450)} alt=""
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                style={{ width: "100%", aspectRatio: "16 / 10", objectFit: "cover", borderRadius: RADIUS.lg, boxShadow: "0 10px 26px rgba(26,26,24,0.18)", display: "block" }}
              />
            </div>
          ) : (item.images ?? []).length > 1 ? (
            <div style={{ display: "flex", justifyContent: "center", padding: `${SPACE.sm}px 0 ${SPACE.lg}px` }}>
              {(item.images ?? []).map((seed, i) => (
                <img key={seed} src={img(seed, 300, 380)} alt="" style={{ width: "40%", aspectRatio: "3 / 4", objectFit: "cover", borderRadius: RADIUS.md, border: `4px solid ${WHITE}`, boxShadow: "0 8px 20px rgba(26,26,24,0.3)", transform: `rotate(${rotations[i % 3]}deg)`, marginLeft: i === 0 ? 0 : -SPACE.xl, position: "relative", zIndex: i }} />
              ))}
            </div>
          ) : null}
          <OverlayCard>
            <div style={{ fontSize: TYPE.micro, fontWeight: WEIGHT.text, letterSpacing: TRACK.wide, color: MUTED, marginBottom: SPACE.xs }}>{item.category ?? item.categoryJp}</div>
            <div style={{ fontFamily: SANS, fontWeight: WEIGHT.bold, fontSize: TYPE.lead, marginBottom: (item.detail ?? item.body ?? item.summary) ? SPACE.md : actionSlot ? SPACE.md : SPACE.lg }}>{item.title}</div>
            {(item.detail ?? item.body ?? item.summary) && (
              <p style={{ fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.text, lineHeight: LEAD.body, color: SECOND, margin: `0 0 ${actionSlot ? SPACE.md : SPACE.lg}px`, whiteSpace: "pre-wrap" }}>{item.detail ?? item.body ?? item.summary}</p>
            )}
            {actionSlot && <div style={{ marginBottom: SPACE.lg }}>{actionSlot(requestClose)}</div>}
            {item.meta && item.meta.length > 0 && (
              <div style={{ borderTop: `1px solid ${HAIRLINE}`, borderBottom: `1px solid ${HAIRLINE}`, padding: `${SPACE.md}px 0`, margin: `0 0 ${SPACE.lg}px`, display: "flex", flexDirection: "column", gap: SPACE.sm }}>
                {item.meta.map((m, i) => (
                  <div key={i} style={{ fontSize: TYPE.body, fontWeight: WEIGHT.text, color: SECOND, fontFamily: SANS }}>{m}</div>
                ))}
              </div>
            )}
            {item.sourceUrl && (
              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: SPACE.sm, padding: `${SPACE.md}px 0`, background: INK, color: PAPER, borderRadius: RADIUS.pill, textDecoration: "none", fontFamily: SANS, fontSize: TYPE.body, fontWeight: WEIGHT.bold, letterSpacing: TRACK.normal }}>
                {item.sourceLabel ?? "出典を見る"}
                <ExternalLink size={13} strokeWidth={2.2} />
              </a>
            )}
          </OverlayCard>
        </>
      )}
    </BottomSheet>
  );
}

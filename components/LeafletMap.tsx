"use client";

import { useCallback, useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { BLUE, INK, PAPER } from "@/lib/constants";
import { itemLatLng } from "@/lib/helpers";
import type { Item } from "@/lib/types";

// 実地図(Leaflet + OpenStreetMap)。プランタブの地図の背景を、自作の
// バウハウス調スタイライズド地図から普通の街路地図へ置き換える(ユーザー
// 指定でこのセッションの§8.1の方針を転換)。ピンチズームはLeaflet標準、
// ピンは自作デザイン(涙型)をdivIconで重ねる。検索・レビュー等は載せない。
//
// leafletはwindow/documentに触れるので、SSR/ビルド時の評価を避けるため
// 本体はuseEffect内でdynamic import(await import("leaflet"))する。CSSだけ
// 静的import(node_modules由来のCSSはNextでどこでもimport可)。

const TOKYO_CENTER: [number, number] = [35.686, 139.76];

// 自作の涙型ピンのHTML(divIcon用)。selected時はBLUEで塗る。
function pinHtml(color: string, selected: boolean): string {
  const border = selected ? BLUE : color;
  const bg = selected ? BLUE : PAPER;
  const dot = selected ? PAPER : color;
  return `<div style="width:24px;height:24px;transform:rotate(-45deg);border-radius:50% 50% 50% 0;background:${bg};border:2px solid ${border};box-shadow:0 3px 7px rgba(23,23,21,0.3);position:relative;">
    <span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(45deg);width:7px;height:7px;border-radius:50%;background:${dot};"></span>
  </div>`;
}

export function LeafletMap({ items, selectedIds, onOpenPin, style }: {
  items: Item[];
  selectedIds: string[];
  onOpenPin: (item: Item) => void;
  style?: React.CSSProperties;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  const userMovedRef = useRef(false);
  const roRef = useRef<ResizeObserver | null>(null);
  // レンダー間で最新のitems/selection/コールバックを参照するためのref
  // (地図の初期化は一度きりにしたいので、これらを依存に入れない)。
  const dataRef = useRef({ items, selectedIds, onOpenPin });
  dataRef.current = { items, selectedIds, onOpenPin };

  // マーカーを貼り直す。refだけを読むので依存は空で安定。
  const renderMarkers = useCallback((fitIfPossible: boolean) => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];
    const { items: its, selectedIds: sel, onOpenPin: onOpen } = dataRef.current;
    const pts: [number, number][] = [];
    its.forEach((item) => {
      const ll = itemLatLng(item);
      if (!ll) return;
      const selected = sel.includes(item.id);
      const icon = L.divIcon({
        html: pinHtml(item.color ?? INK, selected),
        className: "",
        iconSize: [24, 24],
        iconAnchor: [12, 24],
      });
      const marker = L.marker([ll.lat, ll.lng], { icon }).addTo(map);
      marker.on("click", () => onOpen(item));
      markersRef.current.push(marker);
      pts.push([ll.lat, ll.lng]);
    });
    // 初回のみ、ピンが収まるように視点を合わせる(ユーザーが未操作のとき)。
    if (fitIfPossible && pts.length > 0 && !userMovedRef.current) {
      if (pts.length === 1) map.setView(pts[0], 15);
      else map.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
    }
  }, []);

  // 地図の初期化(マウント時1回)。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(containerRef.current, {
        center: TOKYO_CENTER, zoom: 12, zoomControl: false, attributionControl: true,
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      // ユーザーが一度でも操作したら、以後はマーカー更新で視点を動かさない。
      map.on("dragstart zoomstart", () => { userMovedRef.current = true; });
      mapRef.current = map;
      renderMarkers(true);
      // コンテナのサイズ変化(縮小アニメ・全画面化)でタイルがずれるので再計算。
      const ro = new ResizeObserver(() => { map.invalidateSize(false); });
      ro.observe(containerRef.current);
      roRef.current = ro;
    })();
    return () => {
      cancelled = true;
      roRef.current?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [renderMarkers]);

  // items/selectionが変わったらマーカーを貼り直す。
  useEffect(() => { renderMarkers(false); }, [items, selectedIds, renderMarkers]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%", background: "#EDE7DA", ...style }} />;
}

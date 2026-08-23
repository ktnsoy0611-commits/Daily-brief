// ★★iOS の既知の不具合への対処(2026-08-19・第30巡)。
//
// ホーム画面から起動したスタンドアロンの web アプリは、**起動直後だけ画面の
// 高さを実際より短く報告する**ことがある(WebKit の既知の不具合。バック
// グラウンド化・画面の回転・キーボードの出現などをきっかけに自己修復するが、
// それまでは `window.innerHeight` / `visualViewport.height` / `100svh` などが
// 軒並み短い値を返す — 実測で報告されている例: 818px → 896px、716px → 736px)。
//
// 実機で報告された2つの症状は、**同じ根っこ**の可能性が高い:
//   - 画面のいちばん下がまっすぐ切れる(起動直後の短い高さでレイアウトが決まる)
//   - 入力画面のアイコンを最初の数回押すと画面がガクッと動く(操作の最中に
//     WebKit が正しい高さへ自己修復し、その瞬間に見た目が動く)
//
// コミュニティで広く報告されている回避策は、`viewport-fit` を一度
// `cover → auto → cover` と切り替えて、WebKit にレイアウトのやり直しを
// 強制すること。`viewport-fit` は iOS Safari だけが見る値なので、他の
// ブラウザでは何も起きない(安全に無条件で呼べる)。
//
// ★★これは確証のある修正ではなく、既知の不具合の型に対する**対症療法**。
//   実機で直っているかは `lib/debugViewport.ts` の「画面の数値を出す」の
//   「★はみ出し」で確認すること(0 なら web ビューは画面いっぱい)。
export function kickViewport(): void {
  if (typeof document === "undefined") return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) return;
  const original = meta.content;
  if (!/viewport-fit=cover/.test(original)) return;
  meta.content = original.replace("viewport-fit=cover", "viewport-fit=auto");
  // ★2フレーム置くのは、1フレームだと WebKit が変更前後を1回のレイアウトへ
  //   まとめてしまい、やり直しが起きないことがあるため。
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      meta.content = original;
    });
  });
}

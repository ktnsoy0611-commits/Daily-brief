<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 開発コンテキストの引き継ぎ

現行のデータモデル・タブ構成・デザイン規約・検証手順は **`docs/project_knowledge.md`** が正。
いまどこまで進んでいるかは **`handoff_current.md`**（200行以内）。過去の経緯と教訓は
`docs/archive/` にあるが、**全文を読まず `grep` で必要な節だけ**開くこと。
`docs/archive/implementation-handoff-2026-07.md`（初期要件定義書）はデータモデルと
タブ構成が古い。目的と設計思想の参照用にとどめる。

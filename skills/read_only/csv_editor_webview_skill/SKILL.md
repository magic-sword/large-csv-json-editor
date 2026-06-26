---
name: csv-editor-webview-skill
description: |
  Webview内での仮想スクロールテーブルの実装、セルの編集、JSON文字列に対する高機能エディタ（Monaco Editorなど）の組み込みを行う。
version: 1.0.0
license: MIT
allowed-tools:
  - write_to_file
  - replace_file_content
  - run_command
  - view_file
---

## When to use
- Webview側のHTML/CSS/TypeScriptを実装するとき。
- 数万行を超えるデータをスムーズにスクロールさせるための仮想スクロール（Virtual Scroll）テーブルを実装するとき。
- CSVセル内のJSONデータを編集するためのポップアップや、構文ハイライト・バリデーション機能付きのJSONエディタを統合するとき。

## When NOT to use
- VS Code拡張機能の登録や、ファイルシステムとの直接のやり取りを実装するとき（`vscode-extension-development-skill` を使用してください）。
- CSVのストリーム処理や部分読み込みなどのバックエンド処理を実装するとき（`large-csv-json-processing-skill` を使用してください）。

## Workflow
1. **仮想スクロールテーブルの設計**:
   - 画面内に表示されている行だけをDOMレンダリングする仮想リスト（例: `react-window`やピュアJS実装）を構築します。
   - 列幅の調整、ソート、フィルタリングなどの基本UI機能を設計します。
2. **JSONエディタの組み込み**:
   - JSON形式のセルがクリックされたときに、詳細編集モーダルを開く処理を実装します。
   - Monaco Editor などをWebview内にロードし、JSON構文のフォーマット、エラーチェックを有効にします。
3. **メッセージ伝達のフロントエンド実装**:
   - `acquireVsCodeApi()` を使用して、編集結果を拡張機能（ホスト）側に送信する `postMessage` ロジックを実装します。
   - 拡張機能から部分読み込みされたデータを受け取ってテーブルを更新するイベントリスナーを登録します。

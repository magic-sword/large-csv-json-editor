---
name: vscode-extension-development-skill
description: |
  VS Codeの拡張機能を開発する。package.jsonの設定、拡張機能のアクティベーション、コマンド登録、Webviewの作成とメッセージパッシングの実装を行う。
version: 1.0.0
license: MIT
allowed-tools:
  - write_to_file
  - replace_file_content
  - run_command
  - view_file
---

## When to use
- VS Code拡張機能プロジェクトを初期化・設定するとき。
- 拡張機能本体（Extension Host）とWebview間のメッセージ送受信（双方向通信）を実装するとき。
- `package.json` にコマンド、メニュー、ビューなどの貢献ポイント（Contributes）を追加するとき。

## When NOT to use
- Webview内のUIデザインや複雑なフロントエンド処理のみを実装するとき（`csv-editor-webview-skill` を使用してください）。
- CSVやJSONのパース・処理ロジックのみを実装するとき（`large-csv-json-processing-skill` を使用してください）。

## Workflow
1. **プロジェクトの初期化**:
   - 必要に応じて、拡張機能の雛形を作成または拡張します。
   - `package.json` の `engines` や `activationEvents`, `contributes` を設定します。
2. **Webviewパネルの作成**:
   - `vscode.window.createWebviewPanel` を使用してWebviewを生成します。
   - ローカルリソースのロード許可（`localResourceRoots`）やスクリプト実行許可（`enableScripts`）を設定します。
3. **メッセージパッシングの実装**:
   - **拡張機能 -> Webview**: `panel.webview.postMessage` でデータや初期設定を渡します。
   - **Webview -> 拡張機能**: `panel.webview.onDidReceiveMessage` でWebview内の操作（セルの変更、保存、エラー等）を処理します。
4. **リソースとライフサイクルの管理**:
   - Webview破棄時（`onDidDispose`）のクリーンアップ処理を適切に実装します。

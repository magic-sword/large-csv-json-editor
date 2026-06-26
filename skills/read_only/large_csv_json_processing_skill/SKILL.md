---
name: large-csv-json-processing-skill
description: |
  Node.jsを用いた大容量CSV（JSON文字列含む）のパース、部分読み込み、オンデマンド読み込み、編集データの部分保存、メモリ効率の良いストリーム処理を行う。
version: 1.0.0
license: MIT
allowed-tools:
  - write_to_file
  - replace_file_content
  - run_command
  - view_file
---

## When to use
- ファイルサイズが数十MB〜数GBに達するCSVファイルを扱うとき。
- メモリを圧迫しないようにストリームパースやオンデマンドの部分読み込みを行うとき。
- セル内のJSON文字列をパースして特定のキー/値を抽出・更新し、再度CSV形式でシリアライズしてファイルに保存するとき。

## When NOT to use
- VS Code拡張機能のUI定義やWebviewのライフサイクルを実装するとき（`vscode-extension-development-skill` を使用してください）。
- Webview側のグリッドテーブルやJSONエディタの描画ロジックを扱うとき（`csv-editor-webview-skill` を使用してください）。

## Workflow
1. **ストリームパーサーの設定**:
   - `fs.createReadStream` と `csv-parser` などのライブラリを組み合わせて、CSVファイルをチャンク単位で読み込む処理を実装します。
   - 大容量ファイルの場合、行インデックスを作成して必要な範囲だけを高速に取得（ランダムアクセス）できるように設計します。
2. **JSONセルデータの処理**:
   - 特定の列に格納されているJSON文字列を安全にデシリアライズ（`JSON.parse`）します。
   - 不正なJSON形式が含まれている場合に備えて、`try-catch` によるフォールバックを実装します。
3. **部分保存・書き出し**:
   - 変更された行のみを書き換える、あるいは一時ファイルを利用したアトミックな上書き保存ロジック（`fs.createWriteStream`）を実装します。
4. **検証とパフォーマンス測定**:
   - 大容量のダミーCSVデータを生成し、メモリ使用量（`process.memoryUsage()`）が一定以下に抑えられているかを検証します。

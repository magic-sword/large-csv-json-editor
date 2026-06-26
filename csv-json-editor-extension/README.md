# Large CSV JSON Editor

An extension optimized for viewing and editing massive CSV files containing large nested JSON cell values.

## Features
- Optimized for gigabyte-scale CSV datasets (up to 10GB+).
- Byte offset indexing ensures extremely low memory footprint (under 100MB).
- Lazy loads massive cell values into Monaco Editor to prevent Webview crash.
- Compliance with RFC 4180 for quotation and newline escaping.

---

## 使い方 (Usage)

本拡張機能は、巨大なCSVファイル（ギガバイト規模）や、セル内に非常に大きなJSONオブジェクトが含まれるファイルを、VS Code（リモート環境を含む）で高速かつ安全に編集するためのツールです。

### 1. インストール方法 (Installation)

ビルド済みの VSIX ファイル（`csv-json-editor-extension-1.0.0.vsix`）からインストールを行います。

#### 方法 A: VS Code UI からインストール
1. VS Code を起動します。
2. 拡張機能ビュー（`Ctrl+Shift+X` / `Cmd+Shift+X`）を開きます。
3. 右上の `...` （More Actions）メニューをクリックし、**「VSIX からのインストール... (Install from VSIX...)」** を選択します。
4. ビルドされた `csv-json-editor-extension-1.0.0.vsix` ファイルを選択してインストールします。

#### 方法 B: コマンドラインからインストール
ターミナルで以下のコマンドを実行します。
```bash
code --install-extension csv-json-editor-extension-1.0.0.vsix
```

---

### 2. 起動方法 (How to Open)

1. VS Code のエクスプローラー上で、開きたい大容量の CSV ファイルを**右クリック**します。
2. **「プログラムから開く... (Open With...)」** を選択します。
3. リストから **「Large CSV JSON Editor」** を選択します。
   > [!NOTE]
   > 初回読み込み時はインデックスファイル（`.idx`）がCSVファイルと同じディレクトリに自動生成されます。これにより、次回以降の起動やスクロールが高速化されます。

---

### 3. 操作方法 (Operations)

#### A. データの閲覧と仮想スクロール
- 読み込みが完了すると、CSV データがグリッド形式で表示されます。
- ギガバイト規模のファイルであっても、表示領域のみを描画する仮想スクロールが適用されているため、軽快にスクロールできます。
- セル内に巨大な JSON が含まれている場合、グリッド上には先頭の一部テキストのみがプレビュー（要約表示）されます。これにより、ブラウザ（Webview）のメモリクラッシュを回避します。

#### B. セル（巨大JSON）の編集
1. 編集したいセルを**ダブルクリック**します。
2. 画面右側に **JSON Editor**（Monaco Editor）が表示され、該当セルの詳細な JSON データが遅延ロードされます。
3. シンタックスハイライトやインデント整形機能を利用しながら、JSON データを編集します。
4. 編集が完了したら、エディタ上部の **「変更を適用 (Apply Change)」** ボタンをクリックしてグリッドデータを更新します。

#### C. データの保存
- 編集したデータをファイルに保存するには、画面上部（またはエディタフッター）の **「変更を保存 (Save File)」** ボタンをクリックします。
- データの書き出しはストリーム方式で行われるため、大容量ファイルであっても VS Code プロセスのメモリ上限に達することなく、安全に保存されます。
- ダブルクォーテーションや改行などのエスケープ処理は、**RFC 4180** に完全に準拠して行われます。


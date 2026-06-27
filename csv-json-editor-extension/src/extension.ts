import * as vscode from 'vscode';
import * as path from 'path';
import { CsvIndexer } from './csvIndexer';
import { CsvSaver } from './csvSaver';

class CsvCustomDocument implements vscode.CustomDocument {
    public readonly uri: vscode.Uri;
    public indexer: CsvIndexer;
    public changes: Map<number, string[]> = new Map(); // 未保存の編集差分 [行番号 -> 列配列]

    constructor(uri: vscode.Uri) {
        this.uri = uri;
        this.indexer = new CsvIndexer(uri.fsPath);
    }

    dispose(): void {
        this.indexer.close();
    }
}

export class CsvJsonCustomEditorProvider implements vscode.CustomEditorProvider<CsvCustomDocument> {
    
    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new CsvJsonCustomEditorProvider(context);
        return vscode.window.registerCustomEditorProvider(
            CsvJsonCustomEditorProvider.viewType, 
            provider, 
            {
                webviewOptions: { retainContextWhenHidden: true },
                supportsMultipleEditorsPerDocument: false
            }
        );
    }

    private static readonly viewType = 'csvJsonEditor.edit';

    constructor(private readonly context: vscode.ExtensionContext) {}

    // CustomDocumentの初期化
    async openCustomDocument(
        uri: vscode.Uri, 
        openContext: vscode.CustomDocumentOpenContext, 
        token: vscode.CancellationToken
    ): Promise<CsvCustomDocument> {
        return new CsvCustomDocument(uri);
    }

    // Webviewパネルの初期化
    async resolveCustomEditor(
        document: CsvCustomDocument, 
        webviewPanel: vscode.WebviewPanel, 
        token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
            ]
        };

        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

        // Webviewからのメッセージハンドリング
        webviewPanel.webview.onDidReceiveMessage(async (message: any) => {
            switch (message.type) {
                case 'init':
                    try {
                        // 進捗を表示しながらインデックスを作成
                        await document.indexer.buildIndex((percent, lines) => {
                            webviewPanel.webview.postMessage({
                                type: 'progress',
                                percent,
                                lines
                            });
                        });
                        
                        // ヘッダー行と最初の数行をロードして列情報を送る
                        const rows = await document.indexer.getRows(0, 10);
                        const headers = rows[0] || [];
                        
                        // 列ごとのJSON自動判別
                        // 1行目以降のデータセルについて、{...} または [...] かつ JSON.parse が通る列をJSON列とする
                        const jsonColumnIndices = new Set<number>();
                        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
                            for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
                                if (rows[rowIdx] && rows[rowIdx][colIdx]) {
                                    const val = rows[rowIdx][colIdx].trim();
                                    if (val && (val.startsWith('{') || val.startsWith('['))) {
                                        try {
                                            JSON.parse(val);
                                            jsonColumnIndices.add(colIdx);
                                            break; // 判別できたら次の列へ
                                        } catch {
                                            // JSONではない
                                        }
                                    }
                                }
                            }
                        }

                        webviewPanel.webview.postMessage({
                            type: 'ready',
                            headers,
                            totalRows: document.indexer.getRowCount(),
                            jsonColumns: Array.from(jsonColumnIndices)
                        });
                    } catch (err: any) {
                        vscode.window.showErrorMessage(`ファイルのインデックス化に失敗しました: ${err.message}`);
                    }
                    break;

                case 'webview-error':
                    vscode.window.showErrorMessage(message.message);
                    break;

                case 'get-rows': {
                    const { start, end } = message;
                    try {
                        const rawRows = await document.indexer.getRows(start, end);
                        
                        // 変更がバッファされている行があれば上書き
                        const finalRows = rawRows.map((row, relativeIdx) => {
                            const absoluteIdx = start + relativeIdx;
                            return document.changes.has(absoluteIdx) ? document.changes.get(absoluteIdx)! : row;
                        });

                        // 巨大なJSONは要約表示に変換
                        const processedRows = finalRows.map(row => {
                            return row.map(cell => {
                                if (cell && cell.length > 200 && (cell.startsWith('{') || cell.startsWith('['))) {
                                    const sizeInKb = (Buffer.byteLength(cell, 'utf8') / 1024).toFixed(1);
                                    return `[Large JSON: ${sizeInKb}KB]`;
                                }
                                return cell;
                            });
                        });

                        webviewPanel.webview.postMessage({
                            type: 'rows-data',
                            start,
                            rows: processedRows
                        });
                    } catch (err: any) {
                        vscode.window.showErrorMessage(`行データの取得に失敗しました: ${err.message}`);
                    }
                    break;
                }

                case 'get-cell': {
                    // 特定のセルの「生データ」を遅延読み込み
                    const { row, col } = message;
                    try {
                        let val = '';
                        if (document.changes.has(row)) {
                            val = document.changes.get(row)![col];
                        } else {
                            const fileRows = await document.indexer.getRows(row, row);
                            if (fileRows.length > 0) {
                                val = fileRows[0][col];
                            }
                        }
                        webviewPanel.webview.postMessage({
                            type: 'cell-data',
                            row,
                            col,
                            value: val
                        });
                    } catch (err: any) {
                        vscode.window.showErrorMessage(`セルデータの読み出しに失敗しました: ${err.message}`);
                    }
                    break;
                }

                case 'update-cell': {
                    // メモリ上の変更バッファを更新
                    const { row, col, value } = message;
                    if (!document.changes.has(row)) {
                        const fileRows = await document.indexer.getRows(row, row);
                        if (fileRows.length > 0) {
                            document.changes.set(row, [...fileRows[0]]);
                        } else {
                            document.changes.set(row, []);
                        }
                    }
                    document.changes.get(row)![col] = value;
                    break;
                }

                case 'save':
                    if (document.changes.size === 0) {
                        vscode.window.showInformationMessage('保存する変更がありません。');
                        break;
                    }
                    
                    vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: "ファイルを保存中...",
                        cancellable: false
                    }, async (progress: any) => {
                        try {
                            await CsvSaver.save(document.uri.fsPath, document.changes, (percent) => {
                                progress.report({ increment: percent, message: `${percent}%` });
                                webviewPanel.webview.postMessage({
                                    type: 'save-progress',
                                    percent
                                });
                            });
                            
                            document.changes.clear();
                            // インデックスの再構築（ファイルサイズや行のバイトオフセットが変わったため必須）
                            await document.indexer.buildIndex();
                            
                            webviewPanel.webview.postMessage({
                                type: 'save-complete',
                                totalRows: document.indexer.getRowCount()
                            });
                            vscode.window.showInformationMessage('保存が完了しました。');
                        } catch (err: any) {
                            vscode.window.showErrorMessage(`保存に失敗しました: ${err.message}`);
                        }
                    });
                    break;
            }
        });
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.file(
            path.join(this.context.extensionPath, 'media', 'webview.js')
        ));
        const cssUri = webview.asWebviewUri(vscode.Uri.file(
            path.join(this.context.extensionPath, 'media', 'webview.css')
        ));

        // WebviewでMonaco EditorをロードするためのCDN
        return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <!-- Content-Security-Policyの設定 -->
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; script-src ${webview.cspSource} 'unsafe-inline' https://cdnjs.cloudflare.com; style-src ${webview.cspSource} 'unsafe-inline' https://cdnjs.cloudflare.com; font-src https://cdnjs.cloudflare.com;">
    <link href="${cssUri}" rel="stylesheet" />
    <title>Large CSV JSON Editor</title>
</head>
<body>
    <div id="loader-container">
        <div class="loader"></div>
        <div id="loader-text">ファイルをインデックス化中 (0%)...</div>
    </div>
    
    <div id="app-container" style="display: none;">
        <div class="toolbar">
            <button id="save-btn" disabled>変更を保存</button>
            <div id="row-count-display">合計: 0行</div>
        </div>
        <div id="table-container">
            <div id="virtual-table">
                <div id="table-header"></div>
                <div id="table-body"></div>
            </div>
        </div>
    </div>

    <!-- JSON編集モーダル -->
    <div id="editor-modal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 id="modal-title">JSONセルエディタ</h2>
                <div id="modal-tabs" class="modal-tabs">
                    <button id="tab-tree" class="tab-btn active">ツリー編集</button>
                    <button id="tab-text" class="tab-btn">テキスト編集</button>
                </div>
                <span class="close-btn">&times;</span>
            </div>
            <div id="editor-body">
                <div id="tree-container" class="tab-content">
                    <div id="tree-editor-root"></div>
                </div>
                <div id="monaco-container" class="tab-content" style="display: none;"></div>
            </div>
            <div class="modal-footer">
                <div id="error-indicator" class="error-indicator" style="display: none;">JSON構文にエラーがあります</div>
                <button id="modal-cancel-btn">キャンセル</button>
                <button id="modal-save-btn">セルに適用</button>
            </div>
        </div>
    </div>

    <!-- Monaco Editor Loader -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.min.js"></script>
    <script>
        require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
    </script>
    <script src="${scriptUri}"></script>
</body>
</html>`;
    }

    private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<CsvCustomDocument>>();
    public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

    public saveCustomDocument(document: CsvCustomDocument, cancellation: vscode.CancellationToken): Thenable<void> {
        return Promise.resolve();
    }

    public saveCustomDocumentAs(document: CsvCustomDocument, destination: vscode.Uri, cancellation: vscode.CancellationToken): Thenable<void> {
        return Promise.resolve();
    }

    public revertCustomDocument(document: CsvCustomDocument, cancellation: vscode.CancellationToken): Thenable<void> {
        document.changes.clear();
        return Promise.resolve();
    }

    public backupCustomDocument(document: CsvCustomDocument, context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken): Thenable<vscode.CustomDocumentBackup> {
        return Promise.resolve({
            id: context.destination.toString(),
            delete: async () => {}
        });
    }
}

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(CsvJsonCustomEditorProvider.register(context));
}

export function deactivate() {}

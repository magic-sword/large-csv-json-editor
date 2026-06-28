(function() {
    const vscode = acquireVsCodeApi();

    // Webviewエラーのデバッグ転送
    window.onerror = function(message, source, lineno, colno, error) {
        vscode.postMessage({
            type: 'webview-error',
            message: `[Webview JS Error] ${message} (${source}:${lineno}:${colno})`
        });
    };
    window.onunhandledrejection = function(event) {
        vscode.postMessage({
            type: 'webview-error',
            message: `[Webview Promise Error] ${event.reason}`
        });
    };

    // DOM要素
    const loaderContainer = document.getElementById('loader-container');
    const loaderText = document.getElementById('loader-text');
    const appContainer = document.getElementById('app-container');
    const saveBtn = document.getElementById('save-btn');
    const rowCountDisplay = document.getElementById('row-count-display');
    const tableContainer = document.getElementById('table-container');
    const virtualTable = document.getElementById('virtual-table');
    const tableHeader = document.getElementById('table-header');
    const tableBody = document.getElementById('table-body');
    const editorModal = document.getElementById('editor-modal');
    const closeBtn = document.querySelector('.close-btn');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const modalSaveBtn = document.getElementById('modal-save-btn');
    const modalTitle = document.getElementById('modal-title');
    const modalTabs = document.getElementById('modal-tabs');

    // タブ関連要素
    const tabTree = document.getElementById('tab-tree');
    const tabText = document.getElementById('tab-text');
    const treeContainer = document.getElementById('tree-container');
    const monacoContainer = document.getElementById('monaco-container');
    const treeEditorRoot = document.getElementById('tree-editor-root');
    const errorIndicator = document.getElementById('error-indicator');

    // 状態変数
    let headers = [];
    let totalRows = 0;
    let jsonColumns = [];
    let rowHeight = 40;
    let headerHeight = 40;
    
    let cache = new Map(); // 行データキャッシュ: [行番号 -> string[]]
    let editedCells = new Map(); // 編集済みセル: ["row-col" -> string]
    
    let activeEditor = null;
    let currentEditingCell = null; // { row, col }
    let currentJsonData = null; // 現在編集中のJSONオブジェクト
    let activeTab = 'tree'; // 'tree' | 'text'

    // ページング変数
    let currentPage = 1;
    const pageSize = 20;
    let totalPages = 1;

    // 初期化要求
    vscode.postMessage({ type: 'init' });

    // メッセージハンドラ
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'progress':
                loaderText.textContent = `ファイルをインデックス化中 (${message.percent}% - ${message.lines.toLocaleString()}行検出)...`;
                break;

            case 'ready':
                headers = message.headers;
                totalRows = message.totalRows;
                jsonColumns = message.jsonColumns;
                totalPages = Math.ceil(totalRows / pageSize) || 1;
                
                // ヘッダー行を描画
                renderHeader();
                
                // テーブル全体の高さを設定
                virtualTable.style.height = 'auto';
                rowCountDisplay.textContent = `合計: ${totalRows.toLocaleString()}行`;
                
                loaderContainer.style.display = 'none';
                appContainer.style.display = 'block';
                
                // 最初のページをロード
                loadPage(1);
                break;

            case 'rows-data':
                cache.clear(); // 現在のページデータのみにするためクリア
                message.rows.forEach((row, i) => {
                    cache.set(message.start + i, row);
                });
                loaderContainer.style.display = 'none';
                renderPageRows();
                break;

            case 'cell-data':
                openCellEditor(message.row, message.col, message.value);
                break;

            case 'save-progress':
                saveBtn.textContent = `保存中 (${message.percent}%)...`;
                break;

            case 'save-complete':
                totalRows = message.totalRows;
                totalPages = Math.ceil(totalRows / pageSize) || 1;
                rowCountDisplay.textContent = `合計: ${totalRows.toLocaleString()}行`;
                
                editedCells.clear();
                cache.clear();
                
                saveBtn.disabled = true;
                saveBtn.textContent = '変更を保存';
                
                // 現在のページを再読み込み
                loadPage(currentPage);
                break;
        }
    });

    // ヘッダーの描画
    function renderHeader() {
        tableHeader.innerHTML = '';
        const headerRow = document.createElement('div');
        headerRow.className = 'table-header-row';
        
        headers.forEach((header, i) => {
            const cell = document.createElement('div');
            cell.className = 'table-header-cell';
            const isJson = jsonColumns.includes(i);
            cell.textContent = header + (isJson ? ' {JSON}' : '');
            headerRow.appendChild(cell);
        });
        
        tableHeader.appendChild(headerRow);
    }

    // ページングコントロールの更新
    function updatePaginationControls() {
        const prevBtn = document.getElementById('prev-page-btn');
        const nextBtn = document.getElementById('next-page-btn');
        const pageInput = document.getElementById('page-input');
        const totalPagesDisplay = document.getElementById('total-pages-display');

        pageInput.value = currentPage;
        totalPagesDisplay.textContent = totalPages;
        
        prevBtn.disabled = currentPage === 1;
        nextBtn.disabled = currentPage === totalPages;
    }

    // ページのロード
    function loadPage(page) {
        currentPage = page;
        updatePaginationControls();
        
        const start = (currentPage - 1) * pageSize;
        const end = Math.min(totalRows - 1, start + pageSize - 1);
        
        loaderContainer.style.display = 'flex';
        loaderText.textContent = `ページ ${currentPage} のデータをロード中...`;
        
        vscode.postMessage({
            type: 'get-rows',
            start,
            end
        });
    }

    // ページ内の行を描画する
    function renderPageRows() {
        tableBody.innerHTML = '';

        const startRow = (currentPage - 1) * pageSize;
        const endRow = Math.min(totalRows - 1, startRow + pageSize - 1);

        for (let r = startRow; r <= endRow; r++) {
            const rowData = cache.get(r);
            
            const rowDiv = document.createElement('div');
            rowDiv.className = 'table-row';

            if (rowData) {
                rowData.forEach((cellVal, c) => {
                    const cellDiv = document.createElement('div');
                    const isJson = jsonColumns.includes(c);
                    
                    cellDiv.className = `table-cell${isJson ? ' json-cell' : ''}`;
                    
                    // 編集済みセルの色付けと要約プレビュー
                    const cellKey = `${r}-${c}`;
                    if (editedCells.has(cellKey)) {
                        cellDiv.classList.add('edited');
                        const editedVal = editedCells.get(cellKey);
                        cellDiv.textContent = isJson && editedVal.length > 200 ? `[Edited JSON: ${(editedVal.length / 1024).toFixed(1)}KB]` : editedVal;
                    } else {
                        cellDiv.textContent = cellVal;
                    }

                    cellDiv.addEventListener('dblclick', () => {
                        handleCellEdit(r, c);
                    });

                    rowDiv.appendChild(cellDiv);
                });
            } else {
                const placeholder = document.createElement('div');
                placeholder.className = 'table-cell';
                placeholder.style.color = 'var(--text-muted)';
                placeholder.textContent = '読み込み中...';
                rowDiv.appendChild(placeholder);
            }

            tableBody.appendChild(rowDiv);
        }
    }

    // ページングボタンイベント
    document.getElementById('prev-page-btn').addEventListener('click', () => {
        if (currentPage > 1) {
            loadPage(currentPage - 1);
        }
    });

    document.getElementById('next-page-btn').addEventListener('click', () => {
        if (currentPage < totalPages) {
            loadPage(currentPage + 1);
        }
    });

    // ページ直接入力イベント
    const pageInput = document.getElementById('page-input');
    
    pageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handlePageJump();
        }
    });

    pageInput.addEventListener('blur', () => {
        handlePageJump();
    });

    function handlePageJump() {
        let val = parseInt(pageInput.value, 10);
        if (isNaN(val) || val < 1) {
            val = 1;
        } else if (val > totalPages) {
            val = totalPages;
        }
        if (val !== currentPage) {
            loadPage(val);
        } else {
            pageInput.value = currentPage;
        }
    }

    // セルの編集ハンドリング
    function handleCellEdit(row, col) {
        currentEditingCell = { row, col };
        const isJson = jsonColumns.includes(col);
        
        loaderContainer.style.display = 'flex';
        loaderText.textContent = isJson ? '巨大JSONデータをロード中...' : 'セルデータをロード中...';
        vscode.postMessage({
            type: 'get-cell',
            row,
            col
        });
    }

    // タブ切り替えイベント
    tabTree.addEventListener('click', () => switchTab('tree'));
    tabText.addEventListener('click', () => switchTab('text'));

    function switchTab(tab) {
        if (activeTab === tab) return;

        if (tab === 'tree') {
            // テキスト -> ツリー
            if (activeEditor) {
                const textVal = activeEditor.getValue();
                try {
                    currentJsonData = JSON.parse(textVal);
                    errorIndicator.style.display = 'none';
                    tabText.classList.remove('active');
                    tabTree.classList.add('active');
                    monacoContainer.style.display = 'none';
                    treeContainer.style.display = 'block';
                    activeTab = 'tree';
                    renderTreeEditor();
                } catch (e) {
                    errorIndicator.style.display = 'block';
                    errorIndicator.textContent = 'JSON構文エラーのため、ツリーに切り替えられません';
                }
            }
        } else {
            // ツリー -> テキスト
            try {
                const textVal = JSON.stringify(currentJsonData, null, 2);
                errorIndicator.style.display = 'none';
                tabTree.classList.remove('active');
                tabText.classList.add('active');
                treeContainer.style.display = 'none';
                monacoContainer.style.display = 'block';
                activeTab = 'text';

                // Monaco Editor のロードと初期化
                loadMonacoEditor(textVal, 'json');
            } catch (e) {
                errorIndicator.style.display = 'block';
                errorIndicator.textContent = 'JSON変換エラーが発生しました';
            }
        }
    }

    // Monaco Editorの共通ロード/更新関数
    function loadMonacoEditor(value, language, callback) {
        if (!activeEditor) {
            loaderContainer.style.display = 'flex';
            loaderText.textContent = 'エディタをロード中...';
            
            require(['vs/editor/editor.main'], function() {
                activeEditor = monaco.editor.create(monacoContainer, {
                    value: value,
                    language: language,
                    theme: 'vs-dark',
                    automaticLayout: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    wordWrap: 'on'
                });
                loaderContainer.style.display = 'none';
                if (callback) callback();
            });
        } else {
            activeEditor.setValue(value);
            monaco.editor.setModelLanguage(activeEditor.getModel(), language);
            if (callback) callback();
        }
    }

    // JSONツリーエディタの描画
    function renderTreeEditor() {
        treeEditorRoot.innerHTML = '';
        if (currentJsonData === null || currentJsonData === undefined) {
            treeEditorRoot.textContent = 'データが空です。';
            return;
        }

        const rootNode = createTreeNodeElement('(Root)', currentJsonData, [], (newVal) => {
            currentJsonData = newVal;
        });
        treeEditorRoot.appendChild(rootNode);
    }

    // 値を新しい型にキャストするヘルパー
    function castValue(val, type) {
        switch (type) {
            case 'string':
                if (typeof val === 'object' && val !== null) return JSON.stringify(val);
                return String(val);
            case 'number':
                const num = Number(val);
                return isNaN(num) ? 0 : num;
            case 'boolean':
                return Boolean(val);
            case 'null':
                return null;
            case 'object':
                return {};
            case 'array':
                return [];
            default:
                return val;
        }
    }

    // 指定された値の型名を返す
    function getValueType(val) {
        if (val === null) return 'null';
        if (Array.isArray(val)) return 'array';
        return typeof val; // 'string', 'number', 'boolean', 'object'
    }

    // ツリーの1ノード（行＋子コンテナ）を生成する
    function createTreeNodeElement(key, val, path, onUpdateParent, isArrayElement = false) {
        const nodeDiv = document.createElement('div');
        nodeDiv.className = 'tree-node';

        const rowDiv = document.createElement('div');
        rowDiv.className = 'tree-row';

        const type = getValueType(val);
        const isContainer = type === 'object' || type === 'array';

        // 1. 折りたたみ矢印（オブジェクト/配列用）
        const toggle = document.createElement('div');
        toggle.className = 'tree-toggle';
        if (isContainer) {
            toggle.innerHTML = '▼';
            toggle.classList.add('collapsed'); // デフォルト折りたたみ
        } else {
            toggle.innerHTML = '&nbsp;';
            toggle.classList.add('empty');
        }
        rowDiv.appendChild(toggle);

        // 2. キー表示 / 編集
        if (isArrayElement) {
            // 配列のインデックス（編集不可）
            const keySpan = document.createElement('span');
            keySpan.className = 'tree-key-input';
            keySpan.style.border = 'none';
            keySpan.style.background = 'transparent';
            keySpan.style.width = 'auto';
            keySpan.style.color = 'var(--text-muted)';
            keySpan.textContent = `${key}:`;
            rowDiv.appendChild(keySpan);
        } else if (key !== '(Root)') {
            // オブジェクトのキー（編集可能）
            const keyInput = document.createElement('input');
            keyInput.className = 'tree-key-input';
            keyInput.value = key;
            keyInput.addEventListener('change', () => {
                const newKey = keyInput.value.trim();
                if (newKey && newKey !== key) {
                    onUpdateParent(val, newKey); // 親のキーを更新
                } else {
                    keyInput.value = key;
                }
            });
            rowDiv.appendChild(keyInput);
        } else {
            // ルートノード
            const keySpan = document.createElement('span');
            keySpan.className = 'tree-key-input';
            keySpan.style.border = 'none';
            keySpan.style.background = 'transparent';
            keySpan.style.width = 'auto';
            keySpan.style.color = 'var(--accent-color)';
            keySpan.textContent = 'JSON:';
            rowDiv.appendChild(keySpan);
        }

        // 3. 型選択ドロップダウン
        const typeSelect = document.createElement('select');
        typeSelect.className = 'tree-type-select';
        const types = ['string', 'number', 'boolean', 'null', 'object', 'array'];
        types.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t.toUpperCase();
            if (t === type) opt.selected = true;
            typeSelect.appendChild(opt);
        });
        typeSelect.addEventListener('change', () => {
            const newType = typeSelect.value;
            if (newType !== type) {
                const newVal = castValue(val, newType);
                onUpdateParent(newVal); // 親の値を更新し、自身を再描画
            }
        });
        rowDiv.appendChild(typeSelect);

        // 4. 値の入力（コンテナではない場合のみ）
        let valInput = null;
        if (!isContainer) {
            if (type === 'boolean') {
                valInput = document.createElement('select');
                valInput.className = 'tree-val-input type-boolean';
                valInput.style.width = '80px';
                const optTrue = document.createElement('option');
                optTrue.value = 'true';
                optTrue.textContent = 'TRUE';
                if (val === true) optTrue.selected = true;
                const optFalse = document.createElement('option');
                optFalse.value = 'false';
                optFalse.textContent = 'FALSE';
                if (val === false) optFalse.selected = true;
                valInput.appendChild(optTrue);
                valInput.appendChild(optFalse);
                valInput.addEventListener('change', () => {
                    onUpdateParent(valInput.value === 'true');
                });
            } else if (type === 'null') {
                valInput = document.createElement('span');
                valInput.className = 'tree-val-input type-null';
                valInput.style.border = 'none';
                valInput.style.background = 'transparent';
                valInput.textContent = 'NULL';
            } else if (type === 'string') {
                valInput = document.createElement('textarea');
                valInput.className = 'tree-val-input type-string';
                valInput.value = val;
                valInput.rows = 1;
                valInput.addEventListener('change', () => {
                    onUpdateParent(valInput.value);
                });
            } else if (type === 'number') {
                valInput = document.createElement('input');
                valInput.className = 'tree-val-input type-number';
                valInput.value = val;
                valInput.addEventListener('change', () => {
                    let newVal = Number(valInput.value);
                    if (isNaN(newVal)) newVal = 0;
                    onUpdateParent(newVal);
                });
            } else {
                valInput = document.createElement('input');
                valInput.className = `tree-val-input type-${type}`;
                valInput.value = val;
                valInput.addEventListener('change', () => {
                    onUpdateParent(valInput.value);
                });
            }
            rowDiv.appendChild(valInput);
        } else {
            // オブジェクト/配列の場合は簡易プレビュー（{} or []）
            const previewSpan = document.createElement('span');
            previewSpan.className = `type-${type}`;
            const childCount = Object.keys(val).length;
            previewSpan.textContent = type === 'object' ? `{ ${childCount} keys }` : `[ ${childCount} items ]`;
            rowDiv.appendChild(previewSpan);
        }

        // 5. アクションボタン (追加/削除)
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'tree-actions';

        // 追加ボタン (オブジェクトまたは配列の場合のみ)
        if (isContainer) {
            const addBtn = document.createElement('button');
            addBtn.className = 'tree-btn add-btn';
            addBtn.title = type === 'object' ? 'プロパティを追加' : '要素を追加';
            addBtn.innerHTML = '＋';
            addBtn.addEventListener('click', () => {
                if (type === 'object') {
                    // 重複しない新しいキー名を生成
                    let newKey = 'new_key';
                    let counter = 1;
                    while (val.hasOwnProperty(newKey)) {
                        newKey = `new_key_${counter}`;
                        counter++;
                    }
                    val[newKey] = "";
                } else {
                    val.push("");
                }
                onUpdateParent(val); // 親のオブジェクトを更新
                
                // 追加時にツリーが閉じている場合は展開する
                if (toggle.classList.contains('collapsed')) {
                    toggle.click();
                } else {
                    // 既に開いているなら子要素を再描画
                    renderChildren(childrenDiv, val, path);
                    // プレビューの件数を更新
                    const preview = rowDiv.querySelector(`.type-${type}`);
                    if (preview) {
                        const count = Object.keys(val).length;
                        preview.textContent = type === 'object' ? `{ ${count} keys }` : `[ ${count} items ]`;
                    }
                }
            });
            actionsDiv.appendChild(addBtn);
        }

        // 削除ボタン (ルート以外)
        if (key !== '(Root)') {
            const delBtn = document.createElement('button');
            delBtn.className = 'tree-btn delete-btn';
            delBtn.title = '削除';
            delBtn.innerHTML = '🗑️';
            delBtn.addEventListener('click', () => {
                if (confirm(`${key} を削除しますか？`)) {
                    onUpdateParent(undefined); // undefined を渡すことで親から削除されるようにする
                }
            });
            actionsDiv.appendChild(delBtn);
        }

        rowDiv.appendChild(actionsDiv);
        nodeDiv.appendChild(rowDiv);

        // 6. 子ノードコンテナ (Lazy Rendering)
        const childrenDiv = document.createElement('div');
        childrenDiv.className = 'tree-children';
        childrenDiv.style.display = 'none'; // 最初は折りたたまれている
        nodeDiv.appendChild(childrenDiv);

        // トグルの開閉ロジック
        if (isContainer) {
            let rendered = false;
            toggle.addEventListener('click', () => {
                const isCollapsed = toggle.classList.contains('collapsed');
                if (isCollapsed) {
                    toggle.classList.remove('collapsed');
                    childrenDiv.style.display = 'block';
                    // 開いたタイミングでDOMをレンダリングする (Lazy Rendering)
                    if (!rendered) {
                        renderChildren(childrenDiv, val, path);
                        rendered = true;
                    }
                } else {
                    toggle.classList.add('collapsed');
                    childrenDiv.style.display = 'none';
                }
            });
        }

        return nodeDiv;
    }

    // 子要素群のレンダリング
    function renderChildren(container, parentVal, parentPath) {
        container.innerHTML = '';
        const type = getValueType(parentVal);
        
        if (type === 'object') {
            const keys = Object.keys(parentVal);
            keys.forEach(k => {
                const childPath = [...parentPath, k];
                const childNode = createTreeNodeElement(k, parentVal[k], childPath, (newVal, newKey) => {
                    if (newKey !== undefined) {
                        // キー名の変更
                        const tempVal = parentVal[k];
                        delete parentVal[k];
                        parentVal[newKey] = tempVal;
                    } else if (newVal === undefined) {
                        // 削除
                        delete parentVal[k];
                    } else {
                        // 値の変更
                        parentVal[k] = newVal;
                    }
                    // 子要素を再描画
                    renderChildren(container, parentVal, parentPath);
                });
                container.appendChild(childNode);
            });
        } else if (type === 'array') {
            parentVal.forEach((item, index) => {
                const childPath = [...parentPath, index];
                const childNode = createTreeNodeElement(index, item, childPath, (newVal) => {
                    if (newVal === undefined) {
                        // 削除
                        parentVal.splice(index, 1);
                    } else {
                        // 値の変更
                        parentVal[index] = newVal;
                    }
                    // 子要素を再描画
                    renderChildren(container, parentVal, parentPath);
                }, true);
                container.appendChild(childNode);
            });
        }
    }

    // エディターモーダルの起動と表示
    function openCellEditor(row, col, cellValue) {
        loaderContainer.style.display = 'none';
        editorModal.style.display = 'flex';
        errorIndicator.style.display = 'none';

        const isJson = jsonColumns.includes(col);

        if (isJson) {
            modalTitle.textContent = 'JSONセルエディタ';
            modalTabs.style.display = 'flex';

            // JSONデータのパース
            try {
                currentJsonData = JSON.parse(cellValue);
                // デフォルトでツリータブを有効にする
                activeTab = 'tree';
                tabText.classList.remove('active');
                tabTree.classList.add('active');
                monacoContainer.style.display = 'none';
                treeContainer.style.display = 'block';
                
                renderTreeEditor();
            } catch (e) {
                // パースに失敗した場合はテキストエディタを強制
                currentJsonData = {};
                activeTab = 'text';
                tabTree.classList.remove('active');
                tabText.classList.add('active');
                treeContainer.style.display = 'none';
                monacoContainer.style.display = 'block';
                errorIndicator.style.display = 'block';
                errorIndicator.textContent = 'JSONパースエラー: テキスト編集で修正してください';

                // パース失敗時は即座に Monaco Editor を表示状態でロード
                loadMonacoEditor(cellValue, 'json');
            }
        } else {
            modalTitle.textContent = 'セルエディタ';
            modalTabs.style.display = 'none';

            activeTab = 'text';
            tabTree.classList.remove('active');
            tabText.classList.add('active');
            treeContainer.style.display = 'none';
            monacoContainer.style.display = 'block';

            // Monaco Editor をプレーンテキストで起動
            loadMonacoEditor(cellValue, 'plaintext');
        }
    }

    // セルの変更適用
    function applyCellChange(row, col, value) {
        const cellKey = `${row}-${col}`;
        editedCells.set(cellKey, value);
        
        vscode.postMessage({
            type: 'update-cell',
            row,
            col,
            value
        });

        saveBtn.disabled = false;
        renderPageRows();
    }

    // モーダルの保存処理 (適用ボタン)
    modalSaveBtn.addEventListener('click', () => {
        if (currentEditingCell) {
            let finalValue = '';
            const isJson = jsonColumns.includes(currentEditingCell.col);
            
            if (isJson) {
                if (activeTab === 'tree') {
                    try {
                        finalValue = JSON.stringify(currentJsonData);
                    } catch (e) {
                        alert('JSONデータへの変換に失敗しました: ' + e.message);
                        return;
                    }
                } else {
                    if (activeEditor) {
                        finalValue = activeEditor.getValue();
                        try {
                            JSON.parse(finalValue);
                        } catch (e) {
                            if (!confirm('JSONの構文にエラーがあります。このまま適用しますか？')) {
                                return;
                            }
                        }
                    } else {
                        return;
                    }
                }
            } else {
                if (activeEditor) {
                    finalValue = activeEditor.getValue();
                } else {
                    return;
                }
            }

            applyCellChange(currentEditingCell.row, currentEditingCell.col, finalValue);
            closeModal();
        }
    });

    function closeModal() {
        editorModal.style.display = 'none';
        currentEditingCell = null;
        currentJsonData = null;
        treeEditorRoot.innerHTML = '';
    }

    closeBtn.addEventListener('click', closeModal);
    modalCancelBtn.addEventListener('click', closeModal);

    saveBtn.addEventListener('click', () => {
        saveBtn.disabled = true;
        saveBtn.textContent = '保存中...';
        vscode.postMessage({ type: 'save' });
    });
})();

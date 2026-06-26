const fs = require('fs');
const path = require('path');

// browser API のモック
global.acquireVsCodeApi = function() {
    return {
        postMessage: (msg) => console.log('postMessage:', msg)
    };
};

const domElements = {};
global.document = {
    getElementById: (id) => {
        if (!domElements[id]) {
            domElements[id] = {
                style: {},
                classList: {
                    add: () => {},
                    remove: () => {}
                },
                addEventListener: () => {},
                appendChild: () => {},
                querySelector: () => ({ addEventListener: () => {} }),
                querySelectorAll: () => []
            };
        }
        return domElements[id];
    },
    querySelector: (selector) => {
        return {
            addEventListener: () => {}
        };
    },
    createElement: (tag) => {
        return {
            tagName: tag.toUpperCase(),
            style: {},
            classList: {
                add: function(c) { this.classes.push(c); },
                remove: function(c) { this.classes = this.classes.filter(x => x !== c); },
                contains: function(c) { return this.classes.includes(c); }
            },
            classes: [],
            addEventListener: () => {},
            appendChild: function(c) { 
                this.children.push(c); 
                return c;
            },
            children: [],
            querySelector: () => ({ addEventListener: () => {} }),
            querySelectorAll: () => [],
            hasOwnProperty: (p) => false
        };
    }
};

const messageListeners = [];
global.window = {
    addEventListener: (event, listener) => {
        if (event === 'message') {
            messageListeners.push(listener);
        }
    }
};

// Monaco の require のモック
global.require = function(deps, cb) {
    global.monaco = {
        editor: {
            create: () => ({
                setValue: () => {},
                getValue: () => '{}'
            })
        }
    };
    if (cb) cb();
};
global.require.config = () => {};

// webview.js を読み込んで実行
try {
    const code = fs.readFileSync(path.join(__dirname, 'webview.js'), 'utf8');
    eval("const require = global.require;\n" + code);
    console.log('webview.js loaded successfully under mock!');

    // message: ready の送信
    console.log('\n--- Simulating "ready" message ---');
    messageListeners.forEach(l => l({
        data: {
            type: 'ready',
            headers: ['id', 'name', 'data'],
            totalRows: 5,
            jsonColumns: [2]
        }
    }));

    // message: cell-data の送信
    console.log('\n--- Simulating "cell-data" message (should open editor) ---');
    messageListeners.forEach(l => l({
        data: {
            type: 'cell-data',
            row: 0,
            col: 2,
            value: '{"name":"Alice","age":30}'
        }
    }));
    console.log('Success: cell-data simulation finished without exception.');

} catch (e) {
    console.error('Error during execution:', e);
}

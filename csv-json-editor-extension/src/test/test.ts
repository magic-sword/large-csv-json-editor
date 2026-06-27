import * as fs from 'fs';
import * as path from 'path';
import { CsvIndexer } from '../csvIndexer';
import { CsvSaver } from '../csvSaver';

async function runTests() {
    console.log("=== Running CSV Indexer & Saver Tests ===");
    
    const testFile = path.join(__dirname, 'test_sample.csv');
    
    // 1. テスト用CSVデータの作成（JSONセル、改行、ダブルクォートを含む）
    const jsonStr1 = JSON.stringify({ name: "Alice", age: 30, skills: ["JS", "TS"], details: "has \"special\" quotes\nand newlines" });
    const jsonStr2 = JSON.stringify({ name: "Bob", age: 25, address: { city: "Tokyo", zip: "100-0001" } });
    
    const csvContent = 
`id,name,data,status
1,Alice,"${jsonStr1.replace(/"/g, '""')}",active
2,Bob,"${jsonStr2.replace(/"/g, '""')}",inactive
3,Charlie,"{""info"":""no newlines""}",active
`;

    await fs.promises.writeFile(testFile, csvContent, 'utf8');
    console.log("Created test CSV file.");

    try {
        // 2. インデクサーの検証
        const indexer = new CsvIndexer(testFile);
        await indexer.buildIndex((percent, lines) => {
            console.log(`Indexing: ${percent}% (${lines} lines)`);
        });

        const rowCount = indexer.getRowCount();
        console.log(`Total indexed rows: ${rowCount}`);
        if (rowCount !== 4) { // ヘッダー含めて4行
            throw new Error(`Expected 4 rows, but got ${rowCount}`);
        }

        // 3. データ読み込みの検証
        const rows = await indexer.getRows(0, 3);
        console.log("Read rows:", rows);

        if (rows[1][1] !== "Alice") {
            throw new Error(`Expected rows[1][1] to be 'Alice', but got '${rows[1][1]}'`);
        }
        
        // JSONセルの復元検証
        const parsedJson = JSON.parse(rows[1][2]);
        if (parsedJson.name !== "Alice" || parsedJson.details.indexOf('\n') === -1) {
            throw new Error("Failed to correctly parse nested JSON cell with newlines.");
        }
        console.log("-> Read & parse verified successfully!");

        // 4. セーバーの検証 (2行目: Bob のデータを書き換え)
        console.log("Applying edit to Bob's row...");
        const newJsonStr2 = JSON.stringify({ name: "Bob", age: 26, city: "Osaka", updated: true });
        const modifiedRow = ["2", "Bob", newJsonStr2, "active_updated"];
        
        const changes = new Map<number, string[]>();
        changes.set(2, modifiedRow); // 行2 (Bob) を変更

        await CsvSaver.save(testFile, changes, (percent) => {
            console.log(`Saving: ${percent}%`);
        });

        // 5. 保存後のデータの再読み込みと確認
        console.log("Re-indexing saved file...");
        const indexerAfter = new CsvIndexer(testFile);
        await indexerAfter.buildIndex();

        const rowsAfter = await indexerAfter.getRows(0, 3);
        console.log("Re-read rows after save:", rowsAfter);

        if (rowsAfter[2][3] !== "active_updated") {
            throw new Error(`Expected updated status 'active_updated', but got '${rowsAfter[2][3]}'`);
        }

        const reParsedJson2 = JSON.parse(rowsAfter[2][2]);
        if (reParsedJson2.city !== "Osaka" || !reParsedJson2.updated) {
            throw new Error("Modified JSON cell data was not properly saved.");
        }

        // 行1 (Alice) や行3 (Charlie) が壊れていないか確認
        if (rowsAfter[1][1] !== "Alice" || rowsAfter[3][1] !== "Charlie") {
            throw new Error("Saving damaged unmodified rows.");
        }

        console.log("-> Save & update verified successfully!");
        console.log("=== All Tests Passed! ===");
        
    } finally {
        // 後処理でテストファイルを削除
        if (fs.existsSync(testFile)) {
            await fs.promises.unlink(testFile);
        }
    }
}

runTests().then(() => {
    process.exit(0);
}).catch(err => {
    console.error("Test failed with error:", err);
    process.exit(1);
});

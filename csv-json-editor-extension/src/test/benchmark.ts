import { CsvIndexer } from '../csvIndexer';

async function runBenchmark() {
    const csvPath = '/workspace/test_data/results.csv';
    console.log(`=== Starting Benchmark for ${csvPath} ===`);

    const startMemory = process.memoryUsage().heapUsed;
    const startTime = Date.now();

    const indexer = new CsvIndexer(csvPath);

    console.log("Building offset index...");
    await indexer.buildIndex((percent, lines) => {
        if (lines % 100000 === 0 || percent === 100) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
            console.log(`Progress: ${percent}% | Lines: ${lines.toLocaleString()} | Elapsed: ${elapsed}s | Memory: ${mem}MB`);
        }
    });

    const endTime = Date.now();
    const endMemory = process.memoryUsage().heapUsed;

    const duration = ((endTime - startTime) / 1000).toFixed(2);
    const memoryDiff = ((endMemory - startMemory) / 1024 / 1024).toFixed(2);
    const finalMemory = (endMemory / 1024 / 1024).toFixed(2);

    console.log("\n=== Benchmark Results ===");
    console.log(`Total Rows: ${indexer.getRowCount().toLocaleString()}`);
    console.log(`Time taken: ${duration} seconds`);
    console.log(`Memory Usage: ${finalMemory} MB (Diff: +${memoryDiff} MB)`);

    console.log("\nReading first 5 rows...");
    const firstRows = await indexer.getRows(0, 4);
    console.log("Headers:", firstRows[0]);
    console.log("Row 1 (first data row preview):", firstRows[1] ? firstRows[1].map(v => v.length > 200 ? v.substring(0, 200) + '...' : v) : "No row 1");

    console.log("\nReading last 2 rows...");
    const lastRowIndex = indexer.getRowCount() - 1;
    const lastRows = await indexer.getRows(lastRowIndex - 1, lastRowIndex);
    console.log(`Row ${lastRowIndex - 1} preview:`, lastRows[0] ? lastRows[0].map(v => v.length > 200 ? v.substring(0, 200) + '...' : v) : "No row");
    console.log(`Row ${lastRowIndex} preview:`, lastRows[1] ? lastRows[1].map(v => v.length > 200 ? v.substring(0, 200) + '...' : v) : "No row");

    indexer.close();
    console.log("\nBenchmark completed successfully.");
}

runBenchmark().catch(err => {
    console.error("Benchmark failed:", err);
});

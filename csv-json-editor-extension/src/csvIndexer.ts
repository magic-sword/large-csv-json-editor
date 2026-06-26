import * as fs from 'fs';

export class CsvIndexer {
    private filePath: string;
    private idxPath: string;
    private rowCount: number = 0;
    private totalSize: number = 0;
    private idxFd: number | null = null;

    constructor(filePath: string) {
        this.filePath = filePath;
        this.idxPath = filePath + '.idx';
    }

    /**
     * ファイルをスキャンし、各行の開始位置をインデックスファイルに書き出す
     */
    public async buildIndex(onProgress?: (percent: number, lines: number) => void): Promise<void> {
        if (this.idxFd !== null) {
            fs.closeSync(this.idxFd);
            this.idxFd = null;
        }

        const stats = await fs.promises.stat(this.filePath);
        this.totalSize = stats.size;

        // 同期書き込み用のファイルディスクリプタをオープン
        const writeFd = fs.openSync(this.idxPath, 'w');
        this.rowCount = 0;

        // メモリバッファ（80KB = 10,000行分）
        const bufferCapacity = 10000;
        const writeBuffer = Buffer.alloc(8 * bufferCapacity);
        let bufferCount = 0;

        const flushBuffer = () => {
            if (bufferCount > 0) {
                fs.writeSync(writeFd, writeBuffer, 0, bufferCount * 8);
                bufferCount = 0;
            }
        };

        const addOffset = (offset: number) => {
            writeBuffer.writeBigUInt64BE(BigInt(offset), bufferCount * 8);
            bufferCount++;
            this.rowCount++;

            if (bufferCount === bufferCapacity) {
                flushBuffer();
            }
        };

        return new Promise<void>((resolve, reject) => {
            const stream = fs.createReadStream(this.filePath, { highWaterMark: 1024 * 1024 }); // 1MB chunks
            let position = 0;
            let inQuote = false;
            let lastProgressTime = 0;

            // 最初の行はオフセット0
            addOffset(0);

            stream.on('data', (chunk: any) => {
                try {
                    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                    const len = buffer.length;
                    for (let i = 0; i < len; i++) {
                        const char = buffer[i];

                        if (char === 34) { // '"'
                            inQuote = !inQuote;
                        }

                        if (!inQuote && char === 10) { // '\n'
                            const nextPos = position + i + 1;
                            if (nextPos < this.totalSize) {
                                addOffset(nextPos);
                            }
                        }
                    }
                    position += len;

                    if (onProgress) {
                        const now = Date.now();
                        if (now - lastProgressTime > 200) {
                            const percent = Math.min(99, Math.round((position / this.totalSize) * 100));
                            onProgress(percent, this.rowCount);
                            lastProgressTime = now;
                        }
                    }
                } catch (err) {
                    stream.destroy();
                    try { fs.closeSync(writeFd); } catch {}
                    reject(err);
                }
            });

            stream.on('end', () => {
                try {
                    flushBuffer();
                    fs.closeSync(writeFd);
                    
                    // インデックス読み込み用のFDを開く
                    this.idxFd = fs.openSync(this.idxPath, 'r');
                    if (onProgress) {
                        onProgress(100, this.rowCount);
                    }
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });

            stream.on('error', (err: any) => {
                try { fs.closeSync(writeFd); } catch {}
                reject(err);
            });
        });
    }

    public getRowCount(): number {
        return this.rowCount;
    }

    /**
     * インデックスファイルから指定行の開始バイトオフセットを読み出す
     */
    private getOffsetAtLine(lineIndex: number): number {
        if (this.idxFd === null) {
            throw new Error("Index is not loaded.");
        }
        if (lineIndex < 0 || lineIndex >= this.rowCount) {
            throw new Error(`Line index ${lineIndex} out of bounds (total rows: ${this.rowCount})`);
        }

        const buf = Buffer.alloc(8);
        fs.readSync(this.idxFd, buf, 0, 8, lineIndex * 8);
        return Number(buf.readBigUInt64BE());
    }

    /**
     * 指定された行範囲のデータを取得する
     */
    public async getRows(startLine: number, endLine: number): Promise<string[][]> {
        if (this.rowCount === 0) {
            return [];
        }

        const actualEndLine = Math.min(endLine, this.rowCount - 1);
        if (startLine > actualEndLine) {
            return [];
        }

        const startOffset = this.getOffsetAtLine(startLine);
        const endOffset = (actualEndLine + 1 < this.rowCount) 
            ? this.getOffsetAtLine(actualEndLine + 1) 
            : this.totalSize;

        const bufferSize = endOffset - startOffset;
        if (bufferSize <= 0) {
            return [];
        }

        const fd = await fs.promises.open(this.filePath, 'r');
        const buffer = Buffer.alloc(bufferSize);
        await fd.read(buffer, 0, bufferSize, startOffset);
        await fd.close();

        const content = buffer.toString('utf8');
        
        const rawLines: string[] = [];
        let lineStart = 0;
        let inQuote = false;

        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            if (char === '"') {
                inQuote = !inQuote;
            }
            if (!inQuote && char === '\n') {
                rawLines.push(content.substring(lineStart, i + 1));
                lineStart = i + 1;
            }
        }
        if (lineStart < content.length) {
            rawLines.push(content.substring(lineStart));
        }

        return rawLines.map(line => this.parseCsvLine(line));
    }

    public parseCsvLine(line: string): string[] {
        const cleaned = line.replace(/[\r\n]+$/, '');
        const fields: string[] = [];
        const len = cleaned.length;
        
        let inQuote = false;
        let start = 0;

        for (let i = 0; i < len; i++) {
            const char = cleaned[i];

            if (char === '"') {
                inQuote = !inQuote;
            } else if (char === ',' && !inQuote) {
                fields.push(this.extractField(cleaned, start, i));
                start = i + 1;
            }
        }
        fields.push(this.extractField(cleaned, start, len));
        return fields;
    }

    private extractField(line: string, start: number, end: number): string {
        if (start >= end) {
            return '';
        }
        
        let field = line.substring(start, end);
        
        if (field.startsWith('"') && field.endsWith('"') && field.length >= 2) {
            field = field.substring(1, field.length - 1);
            field = field.replace(/""/g, '"');
        }
        
        return field;
    }

    public close(): void {
        if (this.idxFd !== null) {
            fs.closeSync(this.idxFd);
            this.idxFd = null;
        }
        if (fs.existsSync(this.idxPath)) {
            try {
                fs.unlinkSync(this.idxPath);
            } catch {
                // 無視
            }
        }
    }
}

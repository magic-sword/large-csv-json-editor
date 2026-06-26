import * as fs from 'fs';

export function stringifyCsvLine(fields: string[]): string {
    return fields.map(field => {
        if (field === undefined || field === null) {
            return '';
        }
        
        // RFC 4180 準拠のエスケープチェックとクォーテーション
        let needsQuote = false;
        let escaped = '';
        
        for (let i = 0; i < field.length; i++) {
            const char = field[i];
            if (char === '"') {
                escaped += '""';
                needsQuote = true;
            } else {
                escaped += char;
                if (char === ',' || char === '\n' || char === '\r') {
                    needsQuote = true;
                }
            }
        }
        
        return needsQuote ? `"${escaped}"` : escaped;
    }).join(',');
}

export class CsvSaver {
    /**
     * 元のCSVファイルを読み込み、指定された行番号の変更を差し替えて上書き保存する
     */
    public static async save(
        filePath: string,
        changes: Map<number, string[]>,
        onProgress?: (percent: number) => void
    ): Promise<void> {
        const stats = await fs.promises.stat(filePath);
        const totalSize = stats.size;
        const tempPath = filePath + '.tmp';
        
        const readStream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 }); // 1MB chunks
        const writeStream = fs.createWriteStream(tempPath, { highWaterMark: 1024 * 1024 });
        
        return new Promise<void>((resolve, reject) => {
            let inQuote = false;
            let currentLineIndex = 0;
            let lineBuffer = Buffer.alloc(0);
            let bytesProcessed = 0;
            let lastProgressTime = 0;

            const write = (data: string | Buffer): Promise<void> => {
                return new Promise((res) => {
                    if (!writeStream.write(data)) {
                        writeStream.once('drain', res);
                    } else {
                        process.nextTick(res);
                    }
                });
            };

            readStream.on('data', async (chunk: any) => {
                readStream.pause(); // 処理中のストリーム停止
                
                try {
                    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                    let lastOffset = 0;
                    const chunkLength = buffer.length;

                    for (let i = 0; i < chunkLength; i++) {
                        const char = buffer[i];
                        
                        if (char === 34) { // '"'
                            inQuote = !inQuote;
                        }
                        
                        if (!inQuote && char === 10) { // '\n'
                            const lineChunk = buffer.subarray(lastOffset, i + 1);
                            const fullLineBuffer = Buffer.concat([lineBuffer, lineChunk]);
                            lineBuffer = Buffer.alloc(0);
                            lastOffset = i + 1;

                            // 変更があるか確認して書き出し
                            if (changes.has(currentLineIndex)) {
                                const newFields = changes.get(currentLineIndex)!;
                                const newLineStr = stringifyCsvLine(newFields) + '\n';
                                await write(newLineStr);
                            } else {
                                await write(fullLineBuffer);
                            }
                            
                            currentLineIndex++;
                        }
                    }

                    // 残った不完全な行バッファを蓄積
                    if (lastOffset < chunkLength) {
                        lineBuffer = Buffer.concat([lineBuffer, buffer.subarray(lastOffset)]);
                    }
                    
                    bytesProcessed += chunkLength;

                    if (onProgress) {
                        const now = Date.now();
                        if (now - lastProgressTime > 200) {
                            const percent = Math.min(99, Math.round((bytesProcessed / totalSize) * 100));
                            onProgress(percent);
                            lastProgressTime = now;
                        }
                    }

                    readStream.resume(); // 再開
                } catch (err) {
                    readStream.destroy();
                    writeStream.destroy();
                    reject(err);
                }
            });

            readStream.on('end', async () => {
                try {
                    // ストリーム終了時にバッファに残っている最終行を書き出す
                    if (lineBuffer.length > 0) {
                        if (changes.has(currentLineIndex)) {
                            const newFields = changes.get(currentLineIndex)!;
                            const newLineStr = stringifyCsvLine(newFields);
                            await write(newLineStr);
                        } else {
                            await write(lineBuffer);
                        }
                    }
                    
                    writeStream.end();
                } catch (err) {
                    reject(err);
                }
            });

            writeStream.on('finish', async () => {
                try {
                    // 上書きリネーム
                    await fs.promises.rename(tempPath, filePath);
                    if (onProgress) {
                        onProgress(100);
                    }
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });

            readStream.on('error', (err: any) => {
                writeStream.destroy();
                reject(err);
            });

            writeStream.on('error', (err: any) => {
                readStream.destroy();
                reject(err);
            });
        });
    }
}

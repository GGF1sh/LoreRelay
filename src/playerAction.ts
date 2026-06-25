import * as fs from 'fs';
import * as path from 'path';

/** Output Channel 用 — プレイ内容を出さない */
export function formatRedactedAction(action: string): string {
    return `[redacted action, length=${action.length}]`;
}

function writeTextAdventureTempFile(cwd: string, prefix: string, content: string): string {
    const dir = path.join(cwd, '.text-adventure');
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${prefix}-${process.pid}-${Date.now()}.txt`);
    fs.writeFileSync(filePath, content, { encoding: 'utf-8' });
    return filePath;
}

/** GM bridge へ渡す一時ファイル（プロセス引数に本文を載せない） */
export function writePlayerActionFile(cwd: string, action: string): string {
    return writeTextAdventureTempFile(cwd, 'action', action);
}

/** Grok 等へ渡すプロンプト一時ファイル（プロセス引数に全文を載せない） */
export function writePromptFile(cwd: string, prompt: string): string {
    return writeTextAdventureTempFile(cwd, 'prompt', prompt);
}

export function safeUnlinkPlayerActionFile(filePath: string | undefined): void {
    if (!filePath) {
        return;
    }
    try {
        fs.unlinkSync(filePath);
    } catch {
        // 一時ファイル削除失敗は無視
    }
}

/** ログ表示用 — 実パスをマスク */
export function maskSensitiveFileInArgs(args: string[], ...sensitiveFiles: string[]): string[] {
    const masked = new Set(sensitiveFiles.filter(Boolean));
    return args.map((a) => (masked.has(a) ? '<redacted-file>' : a));
}
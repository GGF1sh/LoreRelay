import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getWorkspacePath, writeJsonAtomic } from './workspacePaths';
import { parseWorldForge } from './worldForgeCore';
import {
    generateWorldForge,
    type WorldForgeGeneratorInput,
} from './worldForgeGeneratorCore';
import { clearWorldForgeCache } from './worldForge';

export type { WorldForgeGeneratorInput };

const WORLD_FORGE_FILENAME = 'world_forge.json';

export interface GenerateWorldForgeResult {
    success: boolean;
    forgePath?: string;
    warnings: string[];
    error?: string;
}

/**
 * 設定から WorldForgeGeneratorInput のデフォルト値を読み込む。
 */
export function getDefaultGeneratorInput(): Omit<WorldForgeGeneratorInput, 'worldSeed' | 'theme'> {
    const cfg = vscode.workspace.getConfiguration('textAdventure.worldForge');
    return {
        regionCount: cfg.get<number>('defaultRegionCount', 5),
        factionCount: cfg.get<number>('defaultFactionCount', 3),
        npcCount: cfg.get<number>('defaultNpcCount', 6),
    };
}

/**
 * WorldForge を手続き型で生成し world_forge.json に保存する。
 * createBackup=true のとき既存ファイルを .bak に退避する。
 */
export async function generateAndSaveWorldForge(
    input: WorldForgeGeneratorInput,
    options: { createBackup?: boolean } = {}
): Promise<GenerateWorldForgeResult> {
    const ws = getWorkspacePath();
    if (!ws) {
        return { success: false, warnings: [], error: 'No workspace open.' };
    }

    const forgePath = path.join(ws, WORLD_FORGE_FILENAME);

    // Overwrite guard — caller should have confirmed before calling this
    const { forge, valid, warnings } = generateWorldForge(input);

    if (!valid) {
        const msg = `Generated world has validation errors: ${warnings.join('; ')}`;
        console.warn('[worldForgeGenerator]', msg);
        // Still save — caller can inspect warnings
    }

    try {
        writeJsonAtomic(forgePath, forge, options.createBackup ?? true);
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return { success: false, warnings, error };
    }

    // Verify the saved file round-trips through the parser
    try {
        const raw = JSON.parse(fs.readFileSync(forgePath, 'utf-8'));
        const parsed = parseWorldForge(raw);
        if (!parsed) {
            return { success: false, warnings, error: 'Saved file failed parseWorldForge validation.' };
        }
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return { success: false, warnings, error: `Round-trip parse failed: ${error}` };
    }

    // Invalidate cache so subsequent loadWorldForge() picks up the new file
    clearWorldForgeCache();

    return { success: true, forgePath, warnings };
}

/**
 * 既存 world_forge.json が存在するか確認する。
 */
export function worldForgeFileExists(): boolean {
    const ws = getWorkspacePath();
    if (!ws) { return false; }
    return fs.existsSync(path.join(ws, WORLD_FORGE_FILENAME));
}

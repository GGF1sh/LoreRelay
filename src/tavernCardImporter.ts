import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getCharactersDir, saveCharacter } from './characterManager';
import { resolvePortraitPath } from './characterId';
import type { CharacterProfile, CharacterBook, CharacterBookEntry } from './types/Character';
import { getWorkspacePath } from './workspacePaths';
import { t } from './i18n';

/**
 * Extracts Base64 embedded JSON from a Tavern PNG card.
 * Supports tEXt (V1/V2) and iTEXt (some newer tools) chunks.
 * Keywords: 'chara' (V1/V2) or 'ccv3' (V3).
 */
export function extractJsonFromPng(buffer: Buffer): string | null {
    if (buffer.length < 8) {
        return null;
    }
    const signature = buffer.subarray(0, 8).toString('hex');
    if (signature !== '89504e470d0a1a0a') {
        return null;
    }

    let offset = 8;
    while (offset < buffer.length) {
        if (offset + 8 > buffer.length) {
            break;
        }
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);

        if (type === 'tEXt') {
            const data = buffer.subarray(offset + 8, offset + 8 + length);
            const nullIdx = data.indexOf(0);
            if (nullIdx !== -1) {
                const keyword = data.toString('latin1', 0, nullIdx);
                if (keyword === 'chara' || keyword === 'ccv3') {
                    try {
                        const text = data.toString('latin1', nullIdx + 1);
                        return Buffer.from(text, 'base64').toString('utf8');
                    } catch {
                        // try next chunk
                    }
                }
            }
        } else if (type === 'iTEXt') {
            // iTEXt layout: keyword \0 compressionFlag(1) compressionMethod(1) languageTag \0 translatedKeyword \0 text
            const data = buffer.subarray(offset + 8, offset + 8 + length);
            const nullIdx = data.indexOf(0);
            if (nullIdx !== -1) {
                const keyword = data.toString('utf8', 0, nullIdx);
                if (keyword === 'chara' || keyword === 'ccv3') {
                    try {
                        let textStart = nullIdx + 3; // skip \0 + compressionFlag + compressionMethod
                        const lang0 = data.indexOf(0, textStart);
                        if (lang0 === -1) { break; }
                        textStart = lang0 + 1;
                        const tk0 = data.indexOf(0, textStart);
                        if (tk0 === -1) { break; }
                        textStart = tk0 + 1;
                        const text = data.toString('utf8', textStart);
                        const decoded = Buffer.from(text, 'base64').toString('utf8');
                        if (decoded.trimStart().startsWith('{')) {
                            return decoded;
                        }
                    } catch {
                        // try next chunk
                    }
                }
            }
        }

        offset += 8 + length + 4; // length(4) + type(4) + data(length) + CRC(4)
    }
    return null;
}

/**
 * Normalize character_book entries from ST V2 format to a flat LorebookEntry array.
 * ST stores entries as either an array or an object keyed by numeric string.
 */
function normalizeCharacterBook(book: CharacterBook): CharacterBookEntry[] {
    const raw = Array.isArray(book.entries)
        ? book.entries
        : Object.values(book.entries);

    return (raw as unknown[])
        .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
        .map((e, idx): CharacterBookEntry => ({
            id: typeof e.id === 'number' || typeof e.id === 'string' ? e.id : idx,
            keys: Array.isArray(e.keys) ? (e.keys as unknown[]).filter((k): k is string => typeof k === 'string') : [],
            secondary_keys: Array.isArray(e.secondary_keys)
                ? (e.secondary_keys as unknown[]).filter((k): k is string => typeof k === 'string')
                : [],
            content: typeof e.content === 'string' ? e.content : '',
            enabled: e.enabled !== false,
            insertion_order: typeof e.insertion_order === 'number' ? e.insertion_order : 100,
            ...(typeof e.priority === 'number' ? { priority: e.priority } : {}),
            ...(typeof e.comment === 'string' && e.comment ? { comment: e.comment } : {}),
            ...(e.use_regex === true ? { use_regex: true } : {}),
            ...(e.extensions && typeof e.extensions === 'object'
                ? { extensions: e.extensions as Record<string, unknown> }
                : {}),
        }));
}

/**
 * Save character_book entries as lorebook.imported.json.
 * If that file already exists, use lorebook.imported_<charName>.json instead.
 */
function saveCharacterBookAsLorebook(entries: CharacterBookEntry[], charName: string): boolean {
    const ws = getWorkspacePath();
    if (!ws) { return false; }

    const safeName = charName.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
    const primary = path.join(ws, 'lorebook.imported.json');
    const fallback = path.join(ws, `lorebook.imported_${safeName}.json`);
    const targetPath = fs.existsSync(primary) ? fallback : primary;

    try {
        fs.writeFileSync(targetPath, JSON.stringify(entries, null, 2), 'utf-8');
        return true;
    } catch (e) {
        console.error('[TavernCard] Failed to save character_book as lorebook:', e);
        return false;
    }
}

export async function importTavernCard(): Promise<void> {
    const charDir = getCharactersDir();
    if (!charDir) {
        void vscode.window.showErrorMessage('Character directory not found. Please open a workspace.');
        return;
    }

    const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'Tavern Cards': ['png', 'json'] }
    });
    if (!picked || picked.length === 0) {
        return;
    }

    const filePath = picked[0].fsPath;
    const ext = path.extname(filePath).toLowerCase();

    let rawJson = '';
    let isPng = false;

    if (ext === '.png') {
        try {
            const buffer = fs.readFileSync(filePath);
            const extracted = extractJsonFromPng(buffer);
            if (!extracted) {
                void vscode.window.showErrorMessage(
                    t('extension.st.noChunkFound') || 'No Tavern character data (tEXt/iTEXt chunk) found in this PNG.'
                );
                return;
            }
            rawJson = extracted;
            isPng = true;
        } catch (e) {
            void vscode.window.showErrorMessage(`Failed to read PNG: ${e}`);
            return;
        }
    } else {
        try {
            rawJson = fs.readFileSync(filePath, 'utf-8');
        } catch (e) {
            void vscode.window.showErrorMessage(`Failed to read JSON: ${e}`);
            return;
        }
    }

    let cardData: unknown;
    try {
        cardData = JSON.parse(rawJson);
    } catch {
        void vscode.window.showErrorMessage(
            t('extension.st.parseError') || 'Failed to parse embedded character JSON data.'
        );
        return;
    }

    if (typeof cardData !== 'object' || cardData === null || Array.isArray(cardData)) {
        void vscode.window.showErrorMessage(
            t('extension.st.invalidCard') || 'Invalid character card: root must be a JSON object.'
        );
        return;
    }

    const card = cardData as Record<string, unknown>;

    // -- Spec detection and data root extraction --
    let data: Record<string, unknown>;
    let specVersion: string;
    if (card.spec === 'chara_card_v2' && typeof card.data === 'object' && card.data !== null) {
        data = card.data as Record<string, unknown>;
        specVersion = 'v2';
    } else if (card.spec === 'chara_card_v3' && typeof card.data === 'object' && card.data !== null) {
        data = card.data as Record<string, unknown>;
        specVersion = 'v3';
    } else {
        data = card;
        specVersion = 'v1';
    }

    const name = typeof data.name === 'string' && data.name.trim()
        ? data.name.trim()
        : 'Unknown Character';

    // Generate a valid LoreRelay ID
    let id = name.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 48);
    if (!id) {
        id = `char_${Date.now()}`;
    }
    if (fs.existsSync(path.join(charDir, `${id}.json`))) {
        id = `${id}_${Math.floor(Math.random() * 1000)}`;
    }

    // -- alternate_greetings: let user pick which opening to use --
    let selectedFirstMes = typeof data.first_mes === 'string' ? data.first_mes : '';
    const altGreetings = Array.isArray(data.alternate_greetings)
        ? (data.alternate_greetings as unknown[]).filter((g): g is string => typeof g === 'string')
        : [];

    if (altGreetings.length > 0) {
        const truncate = (s: string) => s.length > 90 ? s.slice(0, 90) + '…' : s;
        const choices: string[] = [];
        if (selectedFirstMes) {
            choices.push(`[Default] ${truncate(selectedFirstMes)}`);
        }
        altGreetings.forEach((g, i) => choices.push(`[Alt ${i + 1}] ${truncate(g)}`));

        const chosen = await vscode.window.showQuickPick(choices, {
            title: t('extension.st.selectGreeting') || 'Select opening greeting',
            placeHolder: t('extension.st.selectGreetingHint') || 'This will be used as first_mes when the character is active'
        });
        if (chosen) {
            const idx = choices.indexOf(chosen);
            if (idx > 0) {
                selectedFirstMes = altGreetings[idx - 1];
            }
        }
    }

    // -- Build profile: preserve ALL original fields in stSource --
    const profile: CharacterProfile = {
        id,
        name,
        description: typeof data.description === 'string' ? data.description : '',
        personality: typeof data.personality === 'string' ? data.personality : '',
        stSource: {
            ...(data as Record<string, unknown>),
            spec_version: specVersion,
            // Use selected greeting (may differ from original first_mes)
            first_mes: selectedFirstMes || undefined,
        }
    };

    // Copy portrait for PNG cards
    if (isPng) {
        const destPath = resolvePortraitPath(charDir, id, '.png');
        if (destPath) {
            try {
                fs.copyFileSync(filePath, destPath);
                profile.portrait = destPath;
            } catch (e) {
                console.error('[TavernCard] Failed to copy portrait:', e);
            }
        }
    }

    saveCharacter(profile);

    // -- character_book: extract embedded lorebook (V2/V3) --
    let lorebookImported = false;
    const characterBook = data.character_book;
    if (characterBook && typeof characterBook === 'object' && !Array.isArray(characterBook)) {
        const book = characterBook as CharacterBook;
        const normalized = normalizeCharacterBook(book);
        if (normalized.length > 0) {
            lorebookImported = saveCharacterBookAsLorebook(normalized, name);
        }
    }

    const lorebookMsg = lorebookImported
        ? ` ${t('extension.st.lorebookImported') || '+ embedded lorebook saved to lorebook.imported.json'}`
        : '';
    void vscode.window.showInformationMessage(
        `${t('extension.st.importSuccess') || 'Imported'}: ${name} (${specVersion})${lorebookMsg}`
    );
}

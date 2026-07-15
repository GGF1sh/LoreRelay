import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getCharactersDir, saveCharacter, setActiveCharacter } from './characterManager';
import { resolveActiveIdAfterImport } from './parlorFirstUseCore';
import { resolvePortraitPath } from './characterId';
import type { CharacterProfile, CharacterBook, CharacterBookEntry } from './types/Character';
import { getWorkspacePath, writeJsonAtomic } from './workspacePaths';
import { t } from './i18n';
import {
    extractJsonFromPng as _extractJsonFromPng,
    normalizeCharacterBook,
} from './tavernCardImporterCore';

// Re-export for tests and extension commands
export { extractJsonFromPng } from './tavernCardImporterCore';

const MAX_TAVERN_CARD_BYTES = 16 * 1024 * 1024;

/**
 * Save character_book entries as lorebook.imported.json.
 * If that file already exists, use lorebook.imported_<charName>.json instead.
 * Saves in {format, source, entries} wrapper so readLorebookFile can load it correctly.
 */
function saveCharacterBookAsLorebook(entries: CharacterBookEntry[], charName: string): boolean {
    const ws = getWorkspacePath();
    if (!ws) { return false; }

    const safeName = charName.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
    const primary = path.join(ws, 'lorebook.imported.json');
    const fallback = path.join(ws, `lorebook.imported_${safeName}.json`);
    const targetPath = fs.existsSync(primary) ? fallback : primary;

    try {
        writeJsonAtomic(targetPath, {
            format: 'text-adventure-lorebook/1.0',
            source: 'st-character-book',
            entries,
        });
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
    const stats = fs.statSync(filePath);
    if (stats.size > MAX_TAVERN_CARD_BYTES) {
        void vscode.window.showErrorMessage('Tavern card is too large to import safely.');
        return;
    }

    let rawJson = '';
    let isPng = false;

    if (ext === '.png') {
        try {
            const buffer = fs.readFileSync(filePath);
            const extracted = _extractJsonFromPng(buffer);
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

    // First-use path: imported character must become the persisted active selection
    // so Parlor start / render / message submit all resolve the same id.
    const activeId = resolveActiveIdAfterImport(profile.id);
    if (activeId) {
        setActiveCharacter(activeId);
    }

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

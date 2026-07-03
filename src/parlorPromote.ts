import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { t, getConfiguredLocale } from './i18n';
import type { GameRules } from './gameRules';
import { getActiveCharacterProfile, getCharacters } from './characterManager';
import { getGameStatePath, getWorkspacePath, writeJsonAtomic } from './workspacePaths';
import { loadParlorSession } from './parlorSession';
import { loadPlayerPersona } from './persona';
import { runParlorPromoteCore } from './parlorPromoteCore';
import { loadExperienceConfig, saveExperienceConfig } from './experience';
import { validateGameState } from './validateGameState';
import { saveGameRules } from './gameRules';
import { commitGameState } from './stateManager';
import { setGameEntryHistoryWithSeenIds, saveHistoryToDisk } from './gameStateSync';
import type { GameEntry } from './types/GameState';
import { demoteToParlorMode, sendExperienceProfileToWebview } from './parlorBridge';
import { getGameEntryHistory } from './gameStateSync';

export interface PromoteParlorResult {
    ok: boolean;
    error?: string;
}

async function confirmOverwriteCampaign(): Promise<boolean> {
    const statePath = getGameStatePath();
    if (!statePath || !fs.existsSync(statePath)) {
        return true;
    }
    const choice = await vscode.window.showWarningMessage(
        t('extension.warning.parlorPromoteOverwrite'),
        { modal: true },
        t('extension.confirm.overwrite'),
        t('extension.confirm.cancel')
    );
    return choice === t('extension.confirm.overwrite');
}

export async function promoteParlorToCampaign(): Promise<PromoteParlorResult> {
    const ws = getWorkspacePath();
    if (!ws) {
        vscode.window.showWarningMessage(t('extension.error.workspaceRequired'));
        return { ok: false, error: 'no_workspace' };
    }

    const character = getActiveCharacterProfile();
    if (!character) {
        vscode.window.showWarningMessage(t('extension.error.parlorNeedsCharacter'));
        return { ok: false, error: 'no_character' };
    }

    const session = loadParlorSession(character.id);
    if (!session || session.messages.length === 0) {
        vscode.window.showWarningMessage(t('extension.error.parlorPromoteEmpty'));
        return { ok: false, error: 'empty_session' };
    }

    const experience = loadExperienceConfig();
    const statePath = getGameStatePath();
    const hasFrozenCampaign = Boolean(
        experience.campaign?.frozenAt && statePath && fs.existsSync(statePath)
    );
    if (hasFrozenCampaign) {
        const resumePick = await vscode.window.showQuickPick(
            [
                { label: t('extension.parlorPromote.resumeFrozen'), id: 'resume' as const },
                { label: t('extension.parlorPromote.freshPromote'), id: 'fresh' as const },
            ],
            { title: t('extension.parlorPromote.frozenTitle') }
        );
        if (!resumePick) {
            return { ok: false, error: 'cancelled' };
        }
        if (resumePick.id === 'resume') {
            saveExperienceConfig({ profile: 'campaign', campaign: { frozenAt: null } });
            sendExperienceProfileToWebview();
            vscode.window.showInformationMessage(t('extension.info.parlorPromoteResumed'));
            return { ok: true };
        }
    }

    const defaultTitle = `${character.name} — Campaign`;
    const title = await vscode.window.showInputBox({
        title: t('extension.parlorPromote.title'),
        prompt: t('extension.parlorPromote.titlePrompt'),
        value: defaultTitle,
        validateInput: (v) => (v.trim() ? undefined : t('extension.error.inputEmpty')),
    });
    if (!title?.trim()) {
        return { ok: false, error: 'cancelled' };
    }

    const historyPick = await vscode.window.showQuickPick(
        [
            { label: t('extension.parlorPromote.historyInclude'), id: 'include' as const },
            { label: t('extension.parlorPromote.historySummaryOnly'), id: 'summary' as const },
        ],
        { title: t('extension.parlorPromote.historyTitle') }
    );
    if (!historyPick) {
        return { ok: false, error: 'cancelled' };
    }

    const rpgPick = await vscode.window.showQuickPick(
        [
            { label: t('extension.parlorPromote.rpgOff'), id: false as const },
            { label: t('extension.parlorPromote.rpgOn'), id: true as const },
        ],
        { title: t('extension.parlorPromote.rpgTitle') }
    );
    if (!rpgPick) {
        return { ok: false, error: 'cancelled' };
    }

    const forgePick = await vscode.window.showQuickPick(
        [
            { label: t('extension.parlorPromote.forgeOff'), id: false as const },
            { label: t('extension.parlorPromote.forgeOn'), id: true as const },
        ],
        { title: t('extension.parlorPromote.forgeTitle') }
    );
    if (!forgePick) {
        return { ok: false, error: 'cancelled' };
    }

    if (!(await confirmOverwriteCampaign())) {
        return { ok: false, error: 'cancelled' };
    }

    const locale = getConfiguredLocale();
    const persona = loadPlayerPersona();
    const output = runParlorPromoteCore({
        session,
        character: {
            id: character.id,
            name: character.name,
            description: character.description,
            personality: character.personality,
            scenario: character.stSource?.scenario,
        },
        persona,
        options: {
            campaignTitle: title.trim(),
            includeRecentHistory: historyPick.id === 'include',
            enableRpgMechanics: rpgPick.id,
            enableWorldForge: forgePick.id,
            locale,
        },
    });

    const validationErrors = validateGameState(output.gameState);
    if (validationErrors.length > 0) {
        console.error('[LoreRelay] Parlor promote validation:', validationErrors.slice(0, 5).join('; '));
    }

    const entries = (output.gameState.entries as GameEntry[]) || [];
    setGameEntryHistoryWithSeenIds(entries);
    saveHistoryToDisk();
    commitGameState(output.gameState, { createBackup: true });

    const scenarioPath = path.join(ws, 'scenario.json');
    writeJsonAtomic(scenarioPath, output.scenario, true);
    saveGameRules(output.gameRules as Partial<GameRules>);

    saveExperienceConfig({
        profile: 'campaign',
        campaign: { frozenAt: null },
        lastParlorSnapshot: {
            promotedAt: new Date().toISOString(),
            parlorSessionPath: 'parlor_session.json',
            characterId: character.id,
        },
    });

    sendExperienceProfileToWebview();
    vscode.window.showInformationMessage(t('extension.info.parlorPromoteDone', { title: title.trim() }));
    return { ok: true };
}

export async function demoteCampaignToParlorWithPrompt(): Promise<boolean> {
    let importHistory = false;
    const entries = getGameEntryHistory();
    if (entries.length > 0) {
        const pick = await vscode.window.showQuickPick(
            [
                { label: t('extension.parlorDemote.importYes'), id: true as const },
                { label: t('extension.parlorDemote.importNo'), id: false as const },
            ],
            { title: t('extension.parlorDemote.importTitle') }
        );
        if (!pick) {
            return false;
        }
        importHistory = pick.id;
    }
    const characterId = await pickParlorCharacterForDemote();
    if (!characterId) {
        vscode.window.showWarningMessage(t('extension.error.parlorNeedsCharacter'));
        return false;
    }
    return demoteToParlorMode(characterId, importHistory);
}

export async function pickParlorCharacterForDemote(): Promise<string | undefined> {
    const chars = getCharacters();
    if (chars.length === 0) {
        return undefined;
    }
    if (chars.length === 1) {
        return chars[0].id;
    }
    const picked = await vscode.window.showQuickPick(
        chars.map((c) => ({ label: c.name, description: c.id, id: c.id })),
        { title: t('extension.parlorDemote.pickCharacter') }
    );
    return picked?.id;
}
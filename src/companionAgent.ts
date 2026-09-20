import { getPartyMemberIds, loadCharacterById } from './characterManager';
import { generateText } from './llmClient';
import * as vscode from 'vscode';
import { t } from './i18n';

export async function interceptPlayerAction(playerAction: string): Promise<string> {
    const ids = getPartyMemberIds();
    const aiCompanions = [];

    for (const id of ids) {
        const char = loadCharacterById(id);
        if (char && char.controlledBy === 'ai') {
            aiCompanions.push(char);
        }
    }

    if (aiCompanions.length === 0) {
        return playerAction;
    }

    vscode.window.setStatusBarMessage(t('extension.status.companionProcessing') || 'Companions are thinking...', 5000);

    const promises = aiCompanions.map(async (char) => {
        const { getCachedGameState } = await import('./gameStateSync');
        const state = getCachedGameState() as any;
        let stateContext = '';
        if (state && state.status) {
            stateContext = `Current Location: ${state.status.location || 'Unknown'}. `;
            if (state.status.hp) stateContext += `HP: ${state.status.hp.current}/${state.status.hp.max}. `;
        }
        
        const sys = `You are ${char.name}. ${char.personality}\n`
            + `The player has just taken an action. React to it with a single short sentence of dialogue or action.\n`
            + `[Context] ${stateContext}\n`
            + `Do NOT narrate the outcome, just your character's immediate reaction. Output ONLY your dialogue/action.`;
        const user = `Player's action: ${playerAction}`;
        
        const response = await generateText(sys, user, { 
            temperature: 0.8, 
            maxTokens: 80,
            provider: char.llmProvider || undefined,
            model: char.llmModel || undefined
        });
        if (response) {
            let clean = response.trim();
            if (clean.startsWith('"') && clean.endsWith('"')) {
                clean = clean.substring(1, clean.length - 1);
            }
            return `[${char.name}]: "${clean}"`;
        }
        return '';
    });

    const responses = await Promise.all(promises);
    const validResponses = responses.filter((r) => r.length > 0);

    vscode.window.setStatusBarMessage('');

    if (validResponses.length === 0) {
        return playerAction;
    }

    return `${playerAction}\n\n(AI Companions React):\n${validResponses.join('\n')}`;
}

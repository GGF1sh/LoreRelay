import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { StatePatchOp, TurnResult } from './types/TurnResult';
import { getGameStatePath, getWorkspacePath } from './workspacePaths';
import { t } from './i18n';

/**
 * Apply JSON Patch operations to a state object.
 */
export function applyStatePatch(state: any, patches: StatePatchOp[]): any {
    const newState = JSON.parse(JSON.stringify(state)); // Deep copy
    
    for (const patch of patches) {
        try {
            const keys = patch.path.split('/').filter(k => k.length > 0);
            if (keys.length === 0) continue;
            
            let target = newState;
            for (let i = 0; i < keys.length - 1; i++) {
                if (target[keys[i]] === undefined) {
                    target[keys[i]] = {};
                }
                target = target[keys[i]];
            }
            
            const lastKey = keys[keys.length - 1];
            
            switch (patch.op) {
                case 'replace':
                case 'add':
                    target[lastKey] = patch.value;
                    break;
                case 'remove':
                    delete target[lastKey];
                    break;
            }
        } catch (e) {
            console.error(`Failed to apply patch: ${JSON.stringify(patch)}`, e);
        }
    }
    
    return newState;
}

/**
 * Process a new turn_result.json, apply its patches, and update game_state.json.
 */
export function processTurnResult(turnResult: TurnResult): boolean {
    const statePath = getGameStatePath();
    if (!statePath || !fs.existsSync(statePath)) {
        return false;
    }
    
    try {
        const stateStr = fs.readFileSync(statePath, 'utf-8');
        let state = JSON.parse(stateStr);
        
        if (turnResult.statePatch && turnResult.statePatch.length > 0) {
            state = applyStatePatch(state, turnResult.statePatch);
        }
        
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
        
        // Append to state_journal.ndjson
        const wsPath = getWorkspacePath();
        if (wsPath) {
            const journalPath = path.join(wsPath, 'state_journal.ndjson');
            fs.appendFileSync(journalPath, JSON.stringify(turnResult) + '\n', 'utf-8');
        }
        
        return true;
    } catch (e) {
        console.error('Error processing turn result', e);
        vscode.window.showErrorMessage(t('extension.error.gameStateLoad'));
        return false;
    }
}

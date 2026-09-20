import * as vscode from 'vscode';
import type { WorldForge } from './worldForgeCore';
import type { WorldState } from './worldStateCore';
import { buildLocationImagePromptCore } from './locationImageBuilderCore';

export { buildLocationImagePromptCore, type LocationImagePromptOptions } from './locationImageBuilderCore';

export function buildLocationImagePrompt(
    forge: WorldForge,
    locationId: string,
    worldState?: WorldState
): string {
    const config = vscode.workspace.getConfiguration('textAdventure.imageGen');
    return buildLocationImagePromptCore(forge, locationId, worldState, {
        includeFaction: config.get<boolean>('includeFactionInPrompt', true),
        includeDanger: config.get<boolean>('includeDangerInPrompt', true),
    });
}
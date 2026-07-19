import * as fs from 'fs';
import * as path from 'path';
import { StatusDefinition } from './combatAbilityTypes';
import { CustomAbilityLibrary, emptyCustomAbilityLibrary, exportCustomAbilityLibrary, importCustomAbilityLibrary } from './combatAbilityWorkshopCore';

/** Workspace-local custom abilities; built-ins are deliberately never written here. */
export function combatAbilityWorkshopFile(workspacePath: string): string {
    return path.join(workspacePath, '.lore-relay', 'combat-abilities.v1.json');
}

export function loadCustomAbilityLibrary(workspacePath: string | undefined, statuses: readonly StatusDefinition[], reservedIds: readonly string[] = []): { library: CustomAbilityLibrary; error?: string } {
    if (!workspacePath) return { library: emptyCustomAbilityLibrary() };
    const filePath = combatAbilityWorkshopFile(workspacePath);
    if (!fs.existsSync(filePath)) return { library: emptyCustomAbilityLibrary() };
    try {
        return importCustomAbilityLibrary(fs.readFileSync(filePath, 'utf8'), emptyCustomAbilityLibrary(), statuses, reservedIds);
    } catch (error) {
        return { library: emptyCustomAbilityLibrary(), error: error instanceof Error ? error.message : 'READ_FAILED' };
    }
}

/** Writes only a fully validated custom document, using a same-directory atomic rename. */
export function writeCustomAbilityLibrary(workspacePath: string, library: CustomAbilityLibrary, statuses: readonly StatusDefinition[], reservedIds: readonly string[] = []): void {
    const checked = importCustomAbilityLibrary(exportCustomAbilityLibrary(library), emptyCustomAbilityLibrary(), statuses, reservedIds);
    if (checked.error) throw new Error(checked.error);
    const filePath = combatAbilityWorkshopFile(workspacePath);
    const directory = path.dirname(filePath);
    fs.mkdirSync(directory, { recursive: true });
    const temporary = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, exportCustomAbilityLibrary(checked.library), 'utf8');
    fs.renameSync(temporary, filePath);
}

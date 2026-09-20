import * as fs from 'fs';
import * as path from 'path';
import { CombatLabDocument, emptyCombatLabDocument, exportCombatLabDocument, importCombatLabDocument } from './combatLabCore';

export function combatLabFile(workspacePath: string): string { return path.join(workspacePath, '.lore-relay', 'combat-lab.v1.json'); }
export function loadCombatLabDocument(workspacePath: string | undefined): { document: CombatLabDocument; error?: string } {
    if (!workspacePath) return { document: emptyCombatLabDocument() };
    const filePath = combatLabFile(workspacePath); if (!fs.existsSync(filePath)) return { document: emptyCombatLabDocument() };
    try { return importCombatLabDocument(fs.readFileSync(filePath, 'utf8'), emptyCombatLabDocument()); } catch (error) { return { document: emptyCombatLabDocument(), error: error instanceof Error ? error.message : 'READ_FAILED' }; }
}
export function writeCombatLabDocument(workspacePath: string, document: CombatLabDocument): void {
    const checked = importCombatLabDocument(exportCombatLabDocument(document), emptyCombatLabDocument()); if (checked.error) throw new Error(checked.error);
    const filePath = combatLabFile(workspacePath); fs.mkdirSync(path.dirname(filePath), { recursive: true }); const temporary = `${filePath}.${process.pid}.tmp`; fs.writeFileSync(temporary, exportCombatLabDocument(checked.document), 'utf8'); fs.renameSync(temporary, filePath);
}

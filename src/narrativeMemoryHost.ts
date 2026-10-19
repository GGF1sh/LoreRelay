import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { getWorkspacePath } from './workspacePaths';
import { commitGameState } from './stateManager';
import { readStateRevision } from './workspaceStateQueueCore';
import { loadGameRules, saveGameRules } from './gameRules';
import { loadNpcRegistry } from './npcRegistry';
import { loadLorebookForUi, saveLorebookFromUi } from './lorebookLoader';
import { buildChronicleForWorkspace } from './chronicleLoader';
import { readWorldStateSnapshotReadOnly } from './worldState';
import { t } from './i18n';
import { narrativeDigest, narrativeEntries, reconcileNarrativeMemory, activeNarrativeRecords, type NarrativeRecord } from './narrativeMemoryCore';
import type { DeterministicWorkspaceMutationGate } from './deterministicWorkspaceMutationGate';
import { loadExistingAcceptedTurnScope, getAcceptedTurnRestoreRepairLatchOutcome } from './acceptedTurnReplayGuard';

const label = (key: string) => t(['webview', 'narrative', key].join('.'));
function read(workspace: string): Record<string, any> {
    return JSON.parse(fs.readFileSync(path.join(workspace, 'game_state.json'), 'utf8'));
}
function witness(workspace: string, state: unknown): string { return narrativeDigest([workspace, loadExistingAcceptedTurnScope(workspace), state]); }
export function narrativeMemoryView(workspace: string): Record<string, unknown> {
    const state = read(workspace), memory = reconcileNarrativeMemory(state.narrativeMemory, narrativeEntries(state));
    const npcs = loadNpcRegistry().npcs;
    const world = readWorldStateSnapshotReadOnly().state;
    const currentIds = new Set(narrativeEntries(state).map(e => e.id));
    // Chronicle source can retain undone events; recap only current-source events.
    const recent = buildChronicleForWorkspace(workspace).flatMap(c => c.events)
        .filter(e => (e.kind === 'travel' || e.kind === 'quest')
            && e.gmTurn !== undefined && currentIds.has('turn-' + e.gmTurn)).slice(-3).map(e => e.text);
    return { type: 'narrativeMemoryView', token: witness(workspace, state), mode: loadGameRules().narrativeMemoryMode ?? 'auto',
        records: memory.records, worldTurn: world?.worldTurn,
        npcs: Object.entries(npcs).map(([id, n]) => ({ id, name: n.name,
            memories: n.memories.filter(m => !memory.records.some(r => r.person.npcId === id && r.content === m.content)).map(m => m.content) })),
        resume: { location: state.world?.currentLocationId ?? state.status?.location ?? '', recent,
            promises: activeNarrativeRecords(memory).filter(r => r.kind === 'promise' && r.status === 'open').slice(0, 5),
            // Explicitly navigate existing UI, never turn a suggestion into execution.
            actions: ['conversation', 'map', 'actions'] } };
}

/** Native dialogs collect edits; authority is revalidated after every asynchronous prompt. */
export async function handleNarrativeMemory(message: Record<string, any>, gate: DeterministicWorkspaceMutationGate,
    post: (m: Record<string, unknown>) => void, authorize: () => Promise<boolean>): Promise<void> {
    const workspace = getWorkspacePath();
    if (!workspace) return;
    try {
        if (message.action === 'view') { post(narrativeMemoryView(workspace)); return; }
        const state = read(workspace), token = witness(workspace, state);
        if (message.token !== token) throw new Error(label('stale'));
        const entries = narrativeEntries(state), memory = reconcileNarrativeMemory(state.narrativeMemory, entries);
        const record = memory.records.find(r => r.id === message.id);
        const source = entries.find(e => e.id === message.entryId);
        let mode: 'auto' | 'review' | undefined;
        let lore: ReturnType<typeof loadLorebookForUi> | undefined;
        let loreDigest: string | undefined;
        if (message.action === 'mode') {
            if (!['auto', 'review'].includes(message.mode)) return;
            mode = message.mode;
        } else if (message.action === 'entry' && source) {
            const pick = await vscode.window.showQuickPick(['note', 'setting', 'correction', 'memory', 'promise'].map(key => ({ label: label(key), key })));
            if (!pick) return;
            const content = await vscode.window.showInputBox({ prompt: label(pick.key), value: source.content.slice(0, 500), validateInput: v => v.trim() && v.length <= 500 ? undefined : label('required') });
            if (!content?.trim()) return;
            if (pick.key === 'note') {
                if (getWorkspacePath() !== workspace || witness(workspace, read(workspace)) !== token) throw new Error(label('stale'));
                post({ type: 'narrativeAuthorNote', content }); return;
            }
            if (pick.key === 'setting') {
                lore = loadLorebookForUi(); loreDigest = narrativeDigest(lore);
                lore.entries.push({ id: 'setting_' + randomUUID().replace(/-/g, ''), label: label('setting'), content, keys: [], secondary_keys: [],
                    contentPreview: content, enabled: true, pinned: true, use_regex: false, priority: 100, insertion_order: 0 });
            } else {
                const name = await vscode.window.showInputBox({ prompt: label('person'), validateInput: v => v.trim() ? undefined : label('required') });
                if (!name?.trim()) return;
                const id = 'nm_' + randomUUID().replace(/-/g, '');
                memory.records.push({ id, person: { id: 'story:' + id, name: name.trim().slice(0, 100) }, kind: pick.key as NarrativeRecord['kind'],
                    content: content.trim(), anchorId: entries.at(-1)!.id, anchorHash: narrativeDigest(entries.at(-1)!.content), sourceId: source.id, sourceHash: narrativeDigest(source.content), quote: source.content.slice(0, 500),
                    role: source.role === 'user' ? 'user' : 'gm', origin: 'player', approval: 'accepted', status: 'open',
                    ...(typeof state.world?.currentLocationId === 'string' ? { locationId: state.world.currentLocationId } : {}) });
            }
        } else if (record) {
            if (message.action === 'reject') record.approval = 'rejected';
            else if (message.action === 'link') {
                const persons = [...new Map(memory.records.filter(r => !r.needsIdentity).map(r => [r.person.id, r.person])).values()];
                const npcs = Object.entries(loadNpcRegistry().npcs).map(([id, n]) => ({ id: 'npc:' + id, name: n.name, npcId: id }));
                const chosen = await vscode.window.showQuickPick([{ label: label('newPerson'), person: record.person }, ...[...npcs, ...persons].map(person => ({ label: person.name + ' · ' + person.id, person }))]);
                if (!chosen) return;
                record.person = chosen.person; delete record.needsIdentity;
            } else if (message.action === 'accept') {
                if (record.needsIdentity) throw new Error(label('linkFirst'));
                const e = entries.find(e => e.id === record.sourceId);
                if (!e || e.excludedFromPrompt) throw new Error(label('stale'));
                record.sourceHash = narrativeDigest(e.content);
                record.quote = e.content.slice(0, 500);
                record.anchorHash = narrativeDigest(entries.find(e => e.id === record.anchorId)!.content); record.approval = 'accepted'; record.origin = 'player';
            } else if (message.action === 'edit' || message.action === 'resolve') {
                const content = await vscode.window.showInputBox({ prompt: label('edit'), value: record.content, validateInput: v => v.trim() && v.length <= 500 ? undefined : label('required') });
                if (!content?.trim()) return;
                let status = record.status;
                if (record.kind === 'promise') {
                    const pick = await vscode.window.showQuickPick(['open', 'fulfilled', 'broken', 'cancelled'].map(key => ({ label: label(key), key })));
                    if (!pick) return; status = pick.key as NarrativeRecord['status'];
                }
                const latest = [...entries].reverse().find(e => !e.excludedFromPrompt);
                if (!latest) return;
                memory.records.push({ ...record, id: 'nm_' + randomUUID().replace(/-/g, ''), targetId: record.id, content, status,
                    anchorId: latest.id, anchorHash: narrativeDigest(latest.content),
                    approval: record.needsIdentity ? 'pending' : 'accepted', origin: 'player' });
            } else return;
        } else return;
        if (memory.records.length > 2000) throw new Error(label('limit'));
        if (!await authorize() || getWorkspacePath() !== workspace) throw new Error(label('stale'));
        const result = await gate.run(workspace, { actionKind: 'narrativeMemory', requestId: randomUUID() }, () => {
            if (getWorkspacePath() !== workspace || getAcceptedTurnRestoreRepairLatchOutcome(workspace)
                || witness(workspace, read(workspace)) !== token) throw new Error(label('stale'));
            if (mode) { if (!saveGameRules({ narrativeMemoryMode: mode })) throw new Error(label('failed')); }
            else if (lore) {
                if (narrativeDigest(loadLorebookForUi()) !== loreDigest) throw new Error(label('stale'));
                if (!saveLorebookFromUi(lore.entries).ok) throw new Error(label('failed'));
            } else {
                const result = commitGameState({ ...state, narrativeMemory: memory }, { baseRevision: readStateRevision(state), mode: 'strict' });
                if (!result.ok) throw new Error(label('failed'));
            }
        });
        if (result.status !== 'completed') throw new Error(result.status === 'failed' ? String(result.error) : label('busy'));
        if (getWorkspacePath() === workspace) post(narrativeMemoryView(workspace));
    } catch (error) { post({ type: 'narrativeMemoryError', error: String(error) }); }
}

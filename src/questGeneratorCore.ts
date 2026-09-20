import type { NpcEntry, NpcNeed, NpcRegistry } from './npcRegistryCore';
import type { WorldChangeEvent } from './worldEventLogCore';
import { isValidEventId } from './worldEventLogCore';
import type { QuestHook, QuestStatus, WorldState } from './worldStateCore';

export const MAX_QUEST_HOOKS = 30;
export const MAX_QUEST_TITLE_LEN = 120;
export const MAX_QUEST_DESCRIPTION_LEN = 600;
export const QUEST_NEED_URGENCY_THRESHOLD = 70;

function clampText(value: string, maxLen: number): string {
    return value.trim().replace(/\s+/g, ' ').slice(0, maxLen);
}

function makeQuestId(parts: string[]): string {
    const suffix = parts
        .join('_')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48);
    return `quest_${suffix || 'hook'}`;
}

function questPriority(status: QuestStatus): number {
    if (status === 'active') { return 3; }
    if (status === 'available') { return 2; }
    return 1;
}

function pruneQuestHooks(hooks: QuestHook[]): QuestHook[] {
    return hooks
        .filter((hook) => isValidEventId(hook.id) && isValidEventId(hook.relatedId))
        .sort((a, b) => {
            const priorityDelta = questPriority(b.status) - questPriority(a.status);
            if (priorityDelta !== 0) { return priorityDelta; }
            return b.turnGenerated - a.turnGenerated;
        })
        .slice(0, MAX_QUEST_HOOKS);
}

function createEventQuestHook(event: WorldChangeEvent, turn: number): QuestHook | undefined {
    if (event.severity === 'info') { return undefined; }

    const place = event.regionId ?? event.locationId ?? 'the affected area';
    let title: string;
    let description: string;

    switch (event.category) {
        case 'resource':
            title = `Supply trouble near ${place}`;
            description = `A resource problem has surfaced: ${event.message}. Investigate the cause, find a practical fix, or help the affected people before the situation worsens.`;
            break;
        case 'faction':
            title = `Faction tension: ${event.factionId ?? 'unknown faction'}`;
            description = `A faction is making a notable move: ${event.message}. Gather information, negotiate, or choose a side if the player wants to intervene.`;
            break;
        case 'region':
            title = `Disturbance in ${place}`;
            description = `Something has changed in this region: ${event.message}. Travel there or question nearby NPCs to learn what is happening.`;
            break;
        case 'npc':
            title = `Someone needs help`;
            description = `An NPC-related event is asking for attention: ${event.message}. Find the person involved and decide how to respond.`;
            break;
        case 'global':
            title = `World event: ${event.severity}`;
            description = `A broader world event has appeared: ${event.message}. Treat it as an optional campaign hook unless the player follows it.`;
            break;
        default:
            return undefined;
    }

    const id = makeQuestId(['event', event.id]);
    if (!isValidEventId(id)) { return undefined; }

    return {
        id,
        title: clampText(title, MAX_QUEST_TITLE_LEN),
        description: clampText(description, MAX_QUEST_DESCRIPTION_LEN),
        source: 'event',
        relatedId: event.id,
        status: 'available',
        turnGenerated: turn
    };
}

function createNpcQuestHook(
    npcId: string,
    npc: NpcEntry,
    need: NpcNeed,
    turn: number,
    relatedId: string
): QuestHook | undefined {
    if (!isValidEventId(npcId) || !isValidEventId(need.id) || !isValidEventId(relatedId)) {
        return undefined;
    }

    const name = clampText(npc.name || npcId, 80);
    let title = `${name} needs help`;
    let needPrefix = 'They need support';

    if (need.type === 'material') {
        title = `${name} needs supplies`;
        needPrefix = 'They need material help';
    } else if (need.type === 'information') {
        title = `${name} needs information`;
        needPrefix = 'They are looking for information';
    } else if (need.type === 'quest') {
        title = `${name} has a request`;
        needPrefix = 'They have a direct request';
    } else if (need.type === 'emotional') {
        title = `${name} is under pressure`;
        needPrefix = 'They need reassurance or emotional support';
    }

    const id = makeQuestId(['npc', npcId, need.id]);
    if (!isValidEventId(id)) { return undefined; }

    return {
        id,
        title: clampText(title, MAX_QUEST_TITLE_LEN),
        description: clampText(`${needPrefix}: ${need.description}`, MAX_QUEST_DESCRIPTION_LEN),
        source: 'npc',
        relatedId,
        status: 'available',
        turnGenerated: turn,
        reward: clampText(`${name} will trust you more.`, 200),
        npcId,
        needId: need.id
    };
}

/**
 * Generates optional quest hooks from world simulation events and urgent NPC
 * needs. The function mutates worldState to match the existing simulator flow.
 * It does not call an LLM; `useLlm` is reserved for a later enrichment layer.
 */
export function generateQuestHooks(
    worldState: WorldState,
    npcRegistry: NpcRegistry | undefined,
    useLlm = false
): void {
    void useLlm;

    const hooks = Array.isArray(worldState.questHooks) ? [...worldState.questHooks] : [];
    const existingRelatedIds = new Set(hooks.map((hook) => hook.relatedId));
    const currentTurn = Math.max(0, Math.floor(worldState.worldTurn || 0));

    for (const event of worldState.recentChanges ?? []) {
        if (existingRelatedIds.has(event.id)) { continue; }
        const hook = createEventQuestHook(event, currentTurn);
        if (!hook) { continue; }
        hooks.push(hook);
        existingRelatedIds.add(hook.relatedId);
    }

    if (npcRegistry) {
        for (const [npcId, npc] of Object.entries(npcRegistry.npcs).sort(([a], [b]) => a.localeCompare(b)).slice(0, 100)) {
            for (const need of npc.needs.slice(0, 20)) {
                if (need.urgency < QUEST_NEED_URGENCY_THRESHOLD) { continue; }
                const relatedId = `need_${npcId}_${need.id}`;
                if (existingRelatedIds.has(relatedId)) { continue; }
                const hook = createNpcQuestHook(npcId, npc, need, currentTurn, relatedId);
                if (!hook) { continue; }
                hooks.push(hook);
                existingRelatedIds.add(hook.relatedId);
            }
        }
    }

    worldState.questHooks = pruneQuestHooks(hooks);
}

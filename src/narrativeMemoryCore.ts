import { createHash } from 'crypto';

export interface NarrativePerson { id: string; name: string; npcId?: string }
export interface NarrativeRecord {
    id: string; person: NarrativePerson; kind: 'memory' | 'promise' | 'correction'; content: string;
    anchorId: string; anchorHash: string; sourceId: string; sourceHash: string; quote: string; role: 'gm' | 'user';
    origin: 'gm' | 'player'; approval: 'accepted' | 'pending' | 'rejected';
    status: 'open' | 'fulfilled' | 'broken' | 'cancelled';
    targetId?: string; due?: { clock: 'world'; value: number }; locationId?: string;
    needsIdentity?: boolean;
}
export interface NarrativeMemory { format: 1; records: NarrativeRecord[] }
type Entry = { id: string; content: string; role: string; excludedFromPrompt?: boolean };
const text = (v: unknown, max = 500): string => typeof v === 'string' ? v.trim().slice(0, max) : '';
const object = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
export function narrativeDigest(v: unknown): string { return createHash('sha256').update(JSON.stringify(v) ?? '').digest('hex'); }
export function narrativeEntries(state: Record<string, any>): Entry[] {
    return Array.isArray(state.entries) ? state.entries.filter((e: any) => e && typeof e.id === 'string' && typeof e.content === 'string') : [];
}
export function readNarrativeMemory(raw: unknown): NarrativeMemory {
    const doc = object(raw);
    const records: NarrativeRecord[] = [];
    for (const value of (Array.isArray(doc.records) ? doc.records : []).slice(0, 2000)) {
        const r = object(value), p = object(r.person);
        if (!text(r.id) || !text(p.id) || !text(p.name) || !text(r.content) || !text(r.sourceId)
            || !/^[a-f0-9]{64}$/.test(r.sourceHash) || !['memory', 'promise', 'correction'].includes(r.kind)
            || !['accepted', 'pending', 'rejected'].includes(r.approval) || !['gm', 'user'].includes(r.role)) continue;
        records.push({ id: text(r.id, 100), person: { id: text(p.id, 100), name: text(p.name, 100),
            ...(text(p.npcId, 64) ? { npcId: text(p.npcId, 64) } : {}) }, kind: r.kind,
            content: text(r.content), anchorId: text(r.anchorId || r.sourceId, 128), anchorHash: text(r.anchorHash || r.sourceHash, 64), sourceId: text(r.sourceId, 128), sourceHash: r.sourceHash,
            quote: text(r.quote), role: r.role, origin: r.origin === 'player' ? 'player' : 'gm',
            approval: r.approval, status: ['open', 'fulfilled', 'broken', 'cancelled'].includes(r.status) ? r.status : 'open',
            ...(text(r.targetId) ? { targetId: text(r.targetId, 100) } : {}),
            ...(r.due?.clock === 'world' && Number.isSafeInteger(r.due.value) && r.due.value >= 0
                ? { due: { clock: 'world', value: r.due.value } } : {}),
            ...(text(r.locationId) ? { locationId: text(r.locationId, 100) } : {}),
            ...(r.needsIdentity === true ? { needsIdentity: true } : {}) });
    }
    return { format: 1, records };
}
/** Missing source = undone. Changed source = review again; never hydrate stale prose. */
export function reconcileNarrativeMemory(raw: unknown, entries: Entry[]): NarrativeMemory {
    const byId = new Map(entries.map(e => [e.id, e]));
    return { format: 1, records: readNarrativeMemory(raw).records.filter(r => byId.has(r.sourceId) && byId.has(r.anchorId)).map(r => {
        const source = byId.get(r.sourceId)!;
        return narrativeDigest(source.content) !== r.sourceHash || narrativeDigest(byId.get(r.anchorId)!.content) !== r.anchorHash || source.excludedFromPrompt
            ? { ...r, approval: r.approval === 'rejected' ? 'rejected' : 'pending' } : r;
    }) };
}
export function activeNarrativeRecords(memory: NarrativeMemory): NarrativeRecord[] {
    const accepted = memory.records.filter(r => r.approval === 'accepted' && !r.needsIdentity);
    const superseded = new Set(accepted.flatMap(r => r.targetId ? [r.targetId] : []));
    return accepted.filter(r => !superseded.has(r.id));
}
/** Proposals carry evidence, not authority. Host assigns identity and source hashes. */
export function appendNarrativeProposals(state: Record<string, any>, proposals: unknown, mode: 'auto' | 'review',
    npcNames: Record<string, string>, turnId: string, playerAction: string): NarrativeMemory {
    const entries = narrativeEntries(state);
    const memory = reconcileNarrativeMemory(state.narrativeMemory, entries);
    if (!Array.isArray(proposals)) return memory;
    const gm = entries.find(e => e.id === turnId && e.role === 'gm');
    const user = entries.slice(0, gm ? entries.indexOf(gm) : entries.length).reverse()
        .find(e => e.role === 'user');
    for (const [i, raw] of proposals.slice(0, 8).entries()) {
        const p = object(raw);
        if (!['memory', 'promise'].includes(p.kind) || !text(p.content) || !text(p.quote)) continue;
        const source = p.sourceRole === 'user' && user?.content.trim() === playerAction.trim() ? user : p.sourceRole === 'gm' ? gm : undefined;
        if (!gm || !source || source.excludedFromPrompt || !source.content.includes(text(p.quote))) continue;
        if (p.kind === 'promise' && p.promisedBy !== 'npc' && source.role !== 'user') continue;
        const id = 'nm_' + narrativeDigest([turnId, source.content, i, p]).slice(0, 32);
        if (memory.records.some(r => r.id === id) || memory.records.length >= 2000) continue;
        const prior = typeof p.targetId === 'string' ? activeNarrativeRecords(memory).find(r => r.id === p.targetId && r.kind === 'promise') : undefined;
        if (p.targetId && !prior) continue;
        let person = prior?.person;
        if (!person && text(p.npcId) && Object.prototype.hasOwnProperty.call(npcNames, p.npcId))
            person = { id: 'npc:' + p.npcId, npcId: p.npcId, name: npcNames[p.npcId] };
        if (!person && text(p.personId)) person = memory.records.find(r => r.person.id === p.personId && !r.needsIdentity)?.person;
        if (!person && !text(p.personName, 100)) continue;
        const sameName = !person && (memory.records.some(r => r.person.name === text(p.personName, 100))
            || Object.values(npcNames).includes(text(p.personName, 100)));
        person ??= { id: 'story:' + id, name: text(p.personName, 100) };
        const due = object(p.due);
        // A numeric deadline requires an exact quoted deadline, rather than an inferred date.
        const hasDue = due.clock === 'world' && Number.isSafeInteger(due.value) && due.value >= 0
            && text(p.deadlineQuote) && source.content.includes(text(p.deadlineQuote));
        memory.records.push({ id, person, kind: p.kind, content: text(p.content), anchorId: gm.id, anchorHash: narrativeDigest(gm.content), sourceId: source.id,
            sourceHash: narrativeDigest(source.content), quote: text(p.quote), role: source.role as 'gm' | 'user',
            origin: 'gm', approval: mode === 'review' || sameName ? 'pending' : 'accepted',
            status: prior && ['fulfilled', 'broken', 'cancelled'].includes(p.status) ? p.status : 'open',
            ...(prior ? { targetId: prior.id } : {}), ...(hasDue ? { due: { clock: 'world', value: due.value } as const } : {}),
            ...(text(state.world?.currentLocationId) ? { locationId: state.world.currentLocationId } : {}),
            ...(sameName ? { needsIdentity: true } : {}) });
    }
    return memory;
}
export function narrativePrompt(state: Record<string, any>, hint: string, maxChars: number): string {
    const memory = reconcileNarrativeMemory(state.narrativeMemory, narrativeEntries(state));
    const records = activeNarrativeRecords(memory);
    const score = (r: NarrativeRecord) => (r.kind === 'correction' ? 100 : 0)
        + (hint.includes(r.person.name) ? 30 : 0) + (r.locationId === state.world?.currentLocationId ? 10 : 0)
        + (r.kind === 'promise' && r.status === 'open' ? 5 : 0);
    const header = '[Player-approved corrections and narrative memories — canonical state takes precedence]\n';
    const lines: string[] = [];
    for (const r of records.sort((a,b) => score(b)-score(a))) {
        const line = `[${r.kind}; ${r.id}; ${r.person.id}; ${r.status}] ${r.person.name}: ${r.content}`
            + (r.due ? ` (world day ${r.due.value})` : '');
        if (header.length + lines.join('\n').length + line.length + 1 > maxChars) continue;
        lines.push(line);
        if (lines.length >= 10) break;
    }
    return lines.length ? header + lines.join('\n') : '';
}
export function correctedSourceIds(state: Record<string, any>): Set<string> {
    return new Set(activeNarrativeRecords(reconcileNarrativeMemory(state.narrativeMemory, narrativeEntries(state)))
        .filter(r => r.kind === 'correction').map(r => r.sourceId));
}
export const NARRATIVE_MEMORY_INSTRUCTION = `Optional turn_result.narrativeMemoryProposals: up to 8 objects {kind:"memory"|"promise", content, sourceRole:"user"|"gm", quote, npcId? (known registry ID), personId? (known story ID), personName?, promisedBy:"player"|"npc", targetId? (existing promise ID), status?:"fulfilled"|"broken"|"cancelled", due?:{clock:"world",value:number}, deadlineQuote?}. Quotes must be exact excerpts of this accepted exchange, not hidden notes. Never infer player agreement from an NPC request or a question. Record only explicit shared events or promises. Reuse known person IDs; do not merge namesakes. Rumor/belief remains attributed, never established fact. A deadline is not evidence of betrayal. These records never grant money, trust, items, movement, or time. Prefer saved canonical state, then authored corrections/Lorebook, then accepted memories, then old narration.`;

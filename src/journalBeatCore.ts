// Shared journal turn signals for F1 Chronicle + F2 Pacing Director (no vscode/fs).

import type { JournalTurnLike } from './chronicleJournalCore';

export type Beat = 'combat' | 'social' | 'exploration' | 'travel' | 'downtime';

export function findLocationChange(patch: JournalTurnLike['statePatch']): string | undefined {
    for (const op of patch ?? []) {
        if (op.path === '/world/currentLocationId' && typeof op.value === 'string') {
            const id = op.value.trim();
            if (id) { return id; }
        }
    }
    return undefined;
}

export function findDirectorSceneChange(patch: JournalTurnLike['statePatch']): string | undefined {
    for (const op of patch ?? []) {
        if (op.path === '/director/scene' && typeof op.value === 'string') {
            const scene = op.value.trim();
            if (scene) { return scene; }
        }
    }
    return undefined;
}

export function isCombatTurn(turn: JournalTurnLike): boolean {
    if (turn.diceLedger?.some((d) => {
        const reason = (d.reason || '').toLowerCase();
        return /attack|combat|battle|strike|damage|戦|攻撃|ダメージ/.test(reason);
    })) {
        return true;
    }
    const hpTouched = turn.statePatch?.some((p) => /\/hp\//.test(p.path) || /\/status\/hp/.test(p.path));
    return !!(hpTouched && turn.diceLedger && turn.diceLedger.length > 0);
}

/** Deterministic scene beat from one journal turn. */
export function classifyTurnBeat(turn: JournalTurnLike): Beat {
    if (isCombatTurn(turn)) { return 'combat'; }
    if ((turn.elapsedWorldTurns ?? 0) > 0) { return 'travel'; }
    if (findLocationChange(turn.statePatch)) { return 'travel'; }
    if (turn.cartographyReveal?.regions?.length) { return 'exploration'; }

    if (turn.diceLedger?.length) {
        const socialRoll = turn.diceLedger.some((d) => {
            const reason = (d.reason || '').toLowerCase();
            return /persuasion|charisma|talk|social|diplomacy|説得|会話|交渉/.test(reason);
        });
        return socialRoll ? 'social' : 'exploration';
    }

    const action = (turn.playerAction || '').toLowerCase();
    if (/talk|speak|ask|greet|convince|negotiate|chat|話|聞く|尋ね|会話|交渉/.test(action)) {
        return 'social';
    }
    if (/rest|sleep|camp|inn|休|寝|泊|休憩/.test(action)) {
        return 'downtime';
    }
    if (/walk|look|search|explore|investigate|scout|調べ|探|見回|探索/.test(action)) {
        return 'exploration';
    }

    return 'downtime';
}

export function emptyBeatCounts(): Record<Beat, number> {
    return {
        combat: 0,
        social: 0,
        exploration: 0,
        travel: 0,
        downtime: 0
    };
}
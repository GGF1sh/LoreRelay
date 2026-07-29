/**
 * Compile CampaignCombatRequest → BattleSpec.
 * Lab scenarios are used only as an internal debug fixture source — never as campaign schema.
 */
import { BattleSpec } from './gambitCombatCore';
import {
    battleSpecForCombatLab,
    CombatLabCatalog,
    initialCombatLabScenarios,
} from './combatLabCore';
import { CampaignCombatRequest } from './campaignCombatRequestCore';
import { AbilityFixtureDocument } from './combatAbilityTypes';
import { sha256Stable } from './campaignCombatReceiptCore';
import * as fs from 'fs';
import * as path from 'path';

/** Deterministic roster snapshot frozen at compile / validation time. */
export interface CompiledCombatRosterEntry {
    entityId: string;
    unitId: string;
    team: 0 | 1;
    hp: number;
    maxHp: number;
    x: number;
    y: number;
}

export interface CompiledCampaignCombat {
    battleSpec: BattleSpec;
    /** entityId → battle unit id (name in BattleSpec) */
    entityToUnitId: Record<string, string>;
    /** Frozen unit stats used for this battle (prevents recompile drift). */
    rosterSnapshot: CompiledCombatRosterEntry[];
    /** stableSerialize hash of battleSpec + rosterSnapshot + entity map. */
    compiledSnapshotHash: string;
    sessionLabel: string;
    fixtureId: string;
}

export type CampaignCombatCompileResult =
    | { ok: true; compiled: CompiledCampaignCombat }
    | { ok: false; error: string; detail?: string };

let cachedCatalog: CombatLabCatalog | undefined;

export function loadDefaultCombatLabCatalog(extensionRoot?: string): CombatLabCatalog {
    if (cachedCatalog) return cachedCatalog;
    const root = extensionRoot || path.join(__dirname, '..');
    const fixturePath = path.join(root, 'resources', 'combat-abilities', 'v1-reference-abilities.json');
    const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as AbilityFixtureDocument;
    cachedCatalog = { abilities: raw.abilities, statuses: raw.statuses };
    return cachedCatalog;
}

/** Pure path for tests: inject catalog + scenarios. */
export function compileCampaignCombatRequest(
    request: CampaignCombatRequest,
    catalog: CombatLabCatalog,
    scenarios = initialCombatLabScenarios(),
): CampaignCombatCompileResult {
    const fixtureId = request.debugFixtureId
        || (request.enemies && !Array.isArray(request.enemies) ? request.enemies.fixtureId : undefined)
        || 'standard_5v5';
    const scenario = scenarios.find(s => s.id === fixtureId);
    if (!scenario) {
        return { ok: false, error: 'UNKNOWN_DEBUG_FIXTURE', detail: fixtureId };
    }
    try {
        const battleSpec: BattleSpec = {
            ...battleSpecForCombatLab(scenario, catalog),
            selectableMode: request.requestedMode,
        };
        const entityToUnitId: Record<string, string> = {};
        request.allies.forEach((ally, index) => {
            const unitId = battleSpec.participantOrder.find(id => id === ally.entityId)
                || battleSpec.initialState.units.allies[index]?.name
                || ally.entityId;
            entityToUnitId[ally.entityId] = String(unitId);
        });
        if (Array.isArray(request.enemies)) {
            for (const enemy of request.enemies) {
                const unitId = battleSpec.participantOrder.find(id => id === enemy.entityId)
                    || enemy.entityId;
                entityToUnitId[enemy.entityId] = unitId;
            }
        } else {
            for (const unit of battleSpec.initialState.units.enemies) {
                if (unit?.name) entityToUnitId[String(unit.name)] = String(unit.name);
            }
        }

        const unitToEntity = new Map<string, string>();
        for (const [entityId, unitId] of Object.entries(entityToUnitId)) {
            unitToEntity.set(unitId, entityId);
        }
        const rosterSnapshot: CompiledCombatRosterEntry[] = [];
        for (const side of ['allies', 'enemies'] as const) {
            const team = side === 'allies' ? 0 : 1;
            for (const unit of battleSpec.initialState.units[side] || []) {
                if (!unit?.name) continue;
                const unitId = String(unit.name);
                rosterSnapshot.push({
                    entityId: unitToEntity.get(unitId) || unitId,
                    unitId,
                    team: team as 0 | 1,
                    hp: Number(unit.hp) || 0,
                    maxHp: Number(unit.max_hp) || Number(unit.hp) || 0,
                    x: Number(unit.pos_x) || 0,
                    y: Number(unit.pos_y) || 0,
                });
            }
        }
        const compiledSnapshotHash = sha256Stable({
            domain: 'lorerelay-campaign-combat-compiled-v1',
            battleSpec,
            entityToUnitId,
            rosterSnapshot,
        });

        return {
            ok: true,
            compiled: {
                battleSpec,
                entityToUnitId,
                rosterSnapshot,
                compiledSnapshotHash,
                sessionLabel: request.encounterId,
                fixtureId,
            },
        };
    } catch (e) {
        return {
            ok: false,
            error: 'COMPILE_FAILED',
            detail: e instanceof Error ? e.message : String(e),
        };
    }
}

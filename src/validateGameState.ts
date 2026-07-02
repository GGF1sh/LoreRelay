import { CHARACTER_ID_PATTERN } from './characterId';
import { validateGameStateDirector } from './scenarioDirectorCore';
import { validateGameStatePartyDirector } from './partyDirectorCore';
import { isValidSchemaVersion } from './migrateGameState';
import { isValidEventId } from './worldEventLogCore';
import { isValidEntryId } from './entryId';
import {
    MAX_ENTRY_CONTENT_LEN,
    MAX_HIDDEN_DICE_ITEMS,
    MAX_OPTIONS_ITEMS,
    MAX_OPTION_LEN,
    MAX_STATUS_ARRAY_ITEMS,
    MAX_STATUS_FIELD_STR,
    MAX_STATUS_ITEM_LEN,
} from './gameStateSanitize';

const ENTRY_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

function isFiniteNonNegativeNumber(n: unknown): boolean {
    return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

function validateStatBar(bar: Record<string, unknown>, label: string, errors: string[]): void {
    const current = bar.current;
    const max = bar.max;
    if (!isFiniteNonNegativeNumber(current)) {
        errors.push(`${label}.current must be a finite non-negative number`);
    }
    if (!isFiniteNonNegativeNumber(max)) {
        errors.push(`${label}.max must be a finite non-negative number`);
    }
    if (
        isFiniteNonNegativeNumber(current)
        && isFiniteNonNegativeNumber(max)
        && (current as number) > (max as number)
    ) {
        errors.push(`${label}.current must not exceed max`);
    }
}

/** game_state.json の構造を検証し、違反メッセージの配列を返す。空配列 = OK。 */
export function validateGameState(obj: unknown): string[] {
    const errors: string[] = [];
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
        errors.push('root must be a JSON object');
        return errors;
    }
    const state = obj as Record<string, unknown>;

    if (!isValidSchemaVersion(state.schemaVersion)) {
        errors.push(`"schemaVersion" must be a positive integer (got ${JSON.stringify(state.schemaVersion)})`);
    }

    if (!Array.isArray(state.entries)) {
        errors.push('"entries" must be an array');
    } else {
        (state.entries as unknown[]).forEach((entry, i) => {
            if (typeof entry !== 'object' || entry === null) {
                errors.push(`entries[${i}] must be an object`);
                return;
            }
            const e = entry as Record<string, unknown>;
            for (const field of ['id', 'role', 'sender', 'content']) {
                if (typeof e[field] !== 'string') {
                    errors.push(`entries[${i}].${field} must be a string`);
                }
            }
            if (typeof e.id === 'string' && !ENTRY_ID_PATTERN.test(e.id)) {
                errors.push(`entries[${i}].id has invalid format`);
            }
            if (typeof e.content === 'string' && e.content.length > MAX_ENTRY_CONTENT_LEN) {
                errors.push(`entries[${i}].content exceeds ${MAX_ENTRY_CONTENT_LEN} characters`);
            }
            if (typeof e.role === 'string' && e.role !== 'gm' && e.role !== 'user') {
                errors.push(`entries[${i}].role must be "gm" or "user", got "${e.role}"`);
            }
            if (e.image !== undefined && typeof e.image !== 'string') {
                errors.push(`entries[${i}].image must be a string`);
            }
            if (e.imagePrompt !== undefined && typeof e.imagePrompt !== 'string') {
                errors.push(`entries[${i}].imagePrompt must be a string`);
            }
            if (e.imageBlocked !== undefined && typeof e.imageBlocked !== 'boolean') {
                errors.push(`entries[${i}].imageBlocked must be a boolean`);
            }
            if (e.excludedFromPrompt !== undefined && typeof e.excludedFromPrompt !== 'boolean') {
                errors.push(`entries[${i}].excludedFromPrompt must be a boolean`);
            }
            if (e.editedAt !== undefined && typeof e.editedAt !== 'string') {
                errors.push(`entries[${i}].editedAt must be a string`);
            }
            if (e.speakerNpcId !== undefined) {
                if (typeof e.speakerNpcId !== 'string' || !ENTRY_ID_PATTERN.test(e.speakerNpcId)) {
                    errors.push(`entries[${i}].speakerNpcId has invalid format`);
                }
            }
        });
    }

    if (state.options !== undefined) {
        if (!Array.isArray(state.options)) {
            errors.push('"options" must be an array');
        } else {
            if ((state.options as unknown[]).length > MAX_OPTIONS_ITEMS) {
                errors.push(`"options" must have at most ${MAX_OPTIONS_ITEMS} items`);
            }
            (state.options as unknown[]).forEach((opt, i) => {
                if (typeof opt !== 'string') {
                    errors.push(`options[${i}] must be a string`);
                } else if (opt.length > MAX_OPTION_LEN) {
                    errors.push(`options[${i}] exceeds ${MAX_OPTION_LEN} characters`);
                }
            });
        }
    }

    if (state.status !== undefined) {
        if (typeof state.status !== 'object' || state.status === null) {
            errors.push('"status" must be an object');
        } else {
            const status = state.status as Record<string, unknown>;
            for (const bar of ['hp', 'mp']) {
                const b = status[bar];
                if (b !== undefined) {
                    if (typeof b !== 'object' || b === null) {
                        errors.push(`status.${bar} must be an object`);
                    } else {
                        validateStatBar(b as Record<string, unknown>, `status.${bar}`, errors);
                    }
                }
            }
            for (const strField of ['location', 'time', 'funds']) {
                const value = status[strField];
                if (value !== undefined) {
                    if (typeof value !== 'string') {
                        errors.push(`status.${strField} must be a string`);
                    } else if (value.length > MAX_STATUS_FIELD_STR) {
                        errors.push(`status.${strField} exceeds ${MAX_STATUS_FIELD_STR} characters`);
                    }
                }
            }
            for (const arrField of ['condition', 'inventory', 'skills']) {
                const arr = status[arrField];
                if (arr !== undefined) {
                    if (!Array.isArray(arr)) {
                        errors.push(`status.${arrField} must be an array`);
                    } else {
                        if ((arr as unknown[]).length > MAX_STATUS_ARRAY_ITEMS) {
                            errors.push(`status.${arrField} must have at most ${MAX_STATUS_ARRAY_ITEMS} items`);
                        }
                        (arr as unknown[]).forEach((item, i) => {
                            if (typeof item !== 'string') {
                                errors.push(`status.${arrField}[${i}] must be a string`);
                            } else if (item.length > MAX_STATUS_ITEM_LEN) {
                                errors.push(`status.${arrField}[${i}] exceeds ${MAX_STATUS_ITEM_LEN} characters`);
                            }
                        });
                    }
                }
            }
        }
    }

    for (const field of ['theme', 'bgm', 'mood', 'latestImage', 'background', 'summary']) {
        if (state[field] !== undefined && typeof state[field] !== 'string') {
            errors.push(`"${field}" must be a string`);
        }
    }

    if (state.sfx !== undefined) {
        if (typeof state.sfx === 'string') {
            // ok
        } else if (!Array.isArray(state.sfx)) {
            errors.push('"sfx" must be a string or array of strings');
        } else {
            (state.sfx as unknown[]).forEach((item, i) => {
                if (typeof item !== 'string') {
                    errors.push(`sfx[${i}] must be a string`);
                }
            });
        }
    }

    if (state.sprite !== undefined) {
        const sprite = state.sprite;
        if (typeof sprite === 'string') {
            // ok
        } else if (typeof sprite !== 'object' || sprite === null) {
            errors.push('"sprite" must be a string or object');
        } else {
            const s = sprite as Record<string, unknown>;
            if (s.position !== undefined) {
                const pos = s.position;
                if (pos !== 'left' && pos !== 'center' && pos !== 'right') {
                    errors.push('sprite.position must be "left", "center", or "right"');
                }
            }
            for (const f of ['name', 'image', 'expression']) {
                if (s[f] !== undefined && typeof s[f] !== 'string') {
                    errors.push(`sprite.${f} must be a string`);
                }
            }
        }
    }

    if (state.diceRequest !== undefined) {
        if (typeof state.diceRequest !== 'object' || state.diceRequest === null) {
            errors.push('"diceRequest" must be an object');
        } else {
            const dr = state.diceRequest as Record<string, unknown>;
            if (typeof dr.notation !== 'string') {
                errors.push('diceRequest.notation must be a string');
            }
            for (const f of ['purpose', 'id']) {
                if (dr[f] !== undefined && typeof dr[f] !== 'string') {
                    errors.push(`diceRequest.${f} must be a string`);
                }
            }
        }
    }

    if (state.hiddenDice !== undefined) {
        if (!Array.isArray(state.hiddenDice)) {
            errors.push('"hiddenDice" must be an array');
        } else {
            if ((state.hiddenDice as unknown[]).length > MAX_HIDDEN_DICE_ITEMS) {
                errors.push(`"hiddenDice" must have at most ${MAX_HIDDEN_DICE_ITEMS} items`);
            }
            (state.hiddenDice as unknown[]).forEach((item, i) => {
                if (typeof item !== 'object' || item === null) {
                    errors.push(`hiddenDice[${i}] must be an object`);
                    return;
                }
                const hd = item as Record<string, unknown>;
                if (typeof hd.notation !== 'string') {
                    errors.push(`hiddenDice[${i}].notation must be a string`);
                }
                if (hd.purpose !== undefined && typeof hd.purpose !== 'string') {
                    errors.push(`hiddenDice[${i}].purpose must be a string`);
                }
                if ('result' in hd) {
                    errors.push(`hiddenDice[${i}] must not include "result"`);
                }
            });
        }
    }

    if (state.gameOver !== undefined) {
        if (typeof state.gameOver !== 'object' || state.gameOver === null) {
            errors.push('"gameOver" must be an object');
        } else {
            const go = state.gameOver as Record<string, unknown>;
            if (typeof go.active !== 'boolean') {
                errors.push('gameOver.active must be a boolean');
            }
            if (go.message !== undefined && typeof go.message !== 'string') {
                errors.push('gameOver.message must be a string');
            }
            if (go.victory !== undefined && typeof go.victory !== 'boolean') {
                errors.push('gameOver.victory must be a boolean');
            }
        }
    }

    if (state.director !== undefined) {
        errors.push(...validateGameStateDirector(state.director));
    }

    if (state.partyDirector !== undefined) {
        errors.push(...validateGameStatePartyDirector(state.partyDirector));
    }

    if (state.profileUpdates !== undefined) {
        if (!Array.isArray(state.profileUpdates)) {
            errors.push('"profileUpdates" must be an array');
        } else {
            (state.profileUpdates as unknown[]).forEach((item, i) => {
                if (typeof item !== 'object' || item === null) {
                    errors.push(`profileUpdates[${i}] must be an object`);
                    return;
                }
                const pu = item as Record<string, unknown>;
                if (typeof pu.characterId !== 'string') {
                    errors.push(`profileUpdates[${i}].characterId must be a string`);
                } else if (!CHARACTER_ID_PATTERN.test(pu.characterId)) {
                    errors.push(`profileUpdates[${i}].characterId has invalid format`);
                }
                if (typeof pu.dynamicProfile !== 'string') {
                    errors.push(`profileUpdates[${i}].dynamicProfile must be a string`);
                }
            });
        }
    }

    if (state.latestImageDescription !== undefined) {
        if (typeof state.latestImageDescription !== 'string') {
            errors.push('"latestImageDescription" must be a string');
        } else if (state.latestImageDescription.length > 1200) {
            errors.push('"latestImageDescription" must be 1200 characters or less');
        }
    }

    if (state.hiddenState !== undefined) {
        if (typeof state.hiddenState !== 'object' || state.hiddenState === null || Array.isArray(state.hiddenState)) {
            errors.push('"hiddenState" must be an object');
        }
    }

    if (state.npcMemoryUpdates !== undefined) {
        if (!Array.isArray(state.npcMemoryUpdates)) {
            errors.push('"npcMemoryUpdates" must be an array');
        } else {
            (state.npcMemoryUpdates as unknown[]).forEach((item, i) => {
                if (typeof item !== 'object' || item === null) {
                    errors.push(`npcMemoryUpdates[${i}] must be an object`);
                    return;
                }
                const nu = item as Record<string, unknown>;
                if (typeof nu.npcId !== 'string' || !nu.npcId) {
                    errors.push(`npcMemoryUpdates[${i}].npcId must be a non-empty string`);
                } else if (!isValidEntryId(nu.npcId)) {
                    errors.push(`npcMemoryUpdates[${i}].npcId has invalid format`);
                }
            });
        }
    }

    if (state.world !== undefined) {
        if (typeof state.world !== 'object' || state.world === null || Array.isArray(state.world)) {
            errors.push('"world" must be an object');
        } else {
            const w = state.world as Record<string, unknown>;
            if (w.currentLocationId !== undefined) {
                if (typeof w.currentLocationId !== 'string') {
                    errors.push('world.currentLocationId must be a string');
                } else if (w.currentLocationId !== '' && !isValidEventId(w.currentLocationId)) {
                    errors.push('world.currentLocationId has invalid format');
                }
            }
            if (w.visitedLocationIds !== undefined) {
                if (!Array.isArray(w.visitedLocationIds)) {
                    errors.push('world.visitedLocationIds must be an array');
                } else {
                    (w.visitedLocationIds as unknown[]).forEach((id, i) => {
                        if (typeof id !== 'string') {
                            errors.push(`world.visitedLocationIds[${i}] must be a string`);
                        } else if (!isValidEventId(id)) {
                            errors.push(`world.visitedLocationIds[${i}] has invalid format`);
                        }
                    });
                }
            }
            if (w.knownFactionIds !== undefined) {
                if (!Array.isArray(w.knownFactionIds)) {
                    errors.push('world.knownFactionIds must be an array');
                } else {
                    (w.knownFactionIds as unknown[]).forEach((id, i) => {
                        if (typeof id !== 'string') {
                            errors.push(`world.knownFactionIds[${i}] must be a string`);
                        } else if (!isValidEventId(id)) {
                            errors.push(`world.knownFactionIds[${i}] has invalid format`);
                        }
                    });
                }
            }
            if (w.regions !== undefined) {
                if (typeof w.regions !== 'object' || w.regions === null || Array.isArray(w.regions)) {
                    errors.push('world.regions must be an object');
                } else {
                    for (const [regionId, value] of Object.entries(w.regions as Record<string, unknown>)) {
                        if (!isValidEventId(regionId)) {
                            errors.push(`world.regions key "${regionId}" has invalid format`);
                            continue;
                        }
                        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
                            errors.push(`world.regions.${regionId} must be an object`);
                            continue;
                        }
                        const region = value as Record<string, unknown>;
                        if (region.controllingFaction !== undefined && region.controllingFaction !== null) {
                            if (typeof region.controllingFaction !== 'string') {
                                errors.push(`world.regions.${regionId}.controllingFaction must be a string or null`);
                            } else if (!isValidEventId(region.controllingFaction)) {
                                errors.push(`world.regions.${regionId}.controllingFaction has invalid format`);
                            }
                        }
                        if (region.dangerLevel !== undefined) {
                            if (typeof region.dangerLevel !== 'number') {
                                errors.push(`world.regions.${regionId}.dangerLevel must be a number`);
                            } else if (!Number.isFinite(region.dangerLevel) || region.dangerLevel < 0 || region.dangerLevel > 10) {
                                errors.push(`world.regions.${regionId}.dangerLevel must be between 0 and 10`);
                            }
                        }
                    }
                }
            }
            if (w.worldTurnAtLastSync !== undefined) {
                if (typeof w.worldTurnAtLastSync !== 'number') {
                    errors.push('world.worldTurnAtLastSync must be a number');
                } else if (!Number.isFinite(w.worldTurnAtLastSync) || w.worldTurnAtLastSync < 0) {
                    errors.push('world.worldTurnAtLastSync must be a finite non-negative number');
                }
            }
            if (w.lastGeneratedImage !== undefined && typeof w.lastGeneratedImage !== 'string') {
                errors.push('world.lastGeneratedImage must be a string');
            }
            if (w.lastGeneratedLocationId !== undefined) {
                if (typeof w.lastGeneratedLocationId !== 'string') {
                    errors.push('world.lastGeneratedLocationId must be a string');
                } else if (w.lastGeneratedLocationId !== '' && !isValidEventId(w.lastGeneratedLocationId)) {
                    errors.push('world.lastGeneratedLocationId has invalid format');
                }
            }
        }
    }

    return errors;
}

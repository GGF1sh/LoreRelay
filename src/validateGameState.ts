import { CHARACTER_ID_PATTERN } from './characterId';

/** game_state.json の構造を検証し、違反メッセージの配列を返す。空配列 = OK。 */
export function validateGameState(obj: unknown): string[] {
    const errors: string[] = [];
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
        errors.push('root must be a JSON object');
        return errors;
    }
    const state = obj as Record<string, unknown>;

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
            if (typeof e.role === 'string' && e.role !== 'gm' && e.role !== 'user') {
                errors.push(`entries[${i}].role must be "gm" or "user", got "${e.role}"`);
            }
            if (e.image !== undefined && typeof e.image !== 'string') {
                errors.push(`entries[${i}].image must be a string`);
            }
        });
    }

    if (state.options !== undefined) {
        if (!Array.isArray(state.options)) {
            errors.push('"options" must be an array');
        } else {
            (state.options as unknown[]).forEach((opt, i) => {
                if (typeof opt !== 'string') {
                    errors.push(`options[${i}] must be a string`);
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
                        const bObj = b as Record<string, unknown>;
                        if (typeof bObj.current !== 'number') {
                            errors.push(`status.${bar}.current must be a number`);
                        }
                        if (typeof bObj.max !== 'number') {
                            errors.push(`status.${bar}.max must be a number`);
                        }
                    }
                }
            }
            for (const arrField of ['condition', 'inventory', 'skills']) {
                const arr = status[arrField];
                if (arr !== undefined) {
                    if (!Array.isArray(arr)) {
                        errors.push(`status.${arrField} must be an array`);
                    } else {
                        (arr as unknown[]).forEach((item, i) => {
                            if (typeof item !== 'string') {
                                errors.push(`status.${arrField}[${i}] must be a string`);
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

    return errors;
}
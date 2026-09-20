import * as path from 'path';

/** Webview 由来のキャラ ID をファイル名に使う前の検証 */
export const CHARACTER_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/** characters/ 配下のメタファイルと衝突するため予約された ID */
const CHARACTER_META_IDS = new Set([
    'party', 'dynamic_profiles', 'party_director', 'active_character',
]);

const PORTRAIT_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

export function isValidCharacterId(id: unknown): id is string {
    return typeof id === 'string' && CHARACTER_ID_PATTERN.test(id);
}

/** characters/{id}.json が characters/ 配下に収まるか確認して返す */
export function resolveCharacterJsonPath(charDir: string, id: string): string | undefined {
    if (!isValidCharacterId(id) || CHARACTER_META_IDS.has(id)) {
        return undefined;
    }
    const base = path.resolve(charDir);
    const resolved = path.resolve(base, `${id}.json`);
    if (!resolved.startsWith(base + path.sep)) {
        return undefined;
    }
    return resolved;
}

/** characters/{id}_portrait{ext} が characters/ 配下に収まるか確認して返す */
export function resolvePortraitPath(charDir: string, id: string, ext: string): string | undefined {
    if (!isValidCharacterId(id)) {
        return undefined;
    }
    const normalizedExt = ext.toLowerCase();
    const safeExt = PORTRAIT_EXTS.has(normalizedExt) ? normalizedExt : '.png';
    const base = path.resolve(charDir);
    const resolved = path.resolve(base, `${id}_portrait${safeExt}`);
    if (!resolved.startsWith(base + path.sep)) {
        return undefined;
    }
    return resolved;
}

export function filterValidCharacterIds(ids: string[]): string[] {
    return ids.filter(isValidCharacterId);
}
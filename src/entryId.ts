/** Webview / game_state 由来のエントリ ID を検証する。 */
export const ENTRY_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export function isValidEntryId(entryId: unknown): entryId is string {
    return typeof entryId === 'string' && ENTRY_ID_PATTERN.test(entryId);
}
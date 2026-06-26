/**
 * game_state.json のスキーマバージョン管理とマイグレーション。
 *
 * バージョン履歴:
 *   v1 (〜1.0.0) — schemaVersion フィールドなし。すべての既存フィールドはこの世代。
 *   v2 (1.1.0〜) — schemaVersion フィールドを追加。既存フィールドに後方互換変更なし。
 *
 * 追加マイグレーションが必要になったら:
 *   1. CURRENT_SCHEMA_VERSION を上げる
 *   2. migrateVn_to_Vn1() 関数を追加し、pipeline 配列に差し込む
 */

export const CURRENT_SCHEMA_VERSION = 2;

export interface MigrateResult {
    state: Record<string, unknown>;
    /** true の場合、呼び出し側は書き戻しが必要 */
    migrated: boolean;
    fromVersion: number;
}

// ── 個別マイグレーション ─────────────────────────────────────

/** v1（schemaVersion なし）→ v2: schemaVersion フィールドを付与するだけ */
function migrateV1toV2(state: Record<string, unknown>): Record<string, unknown> {
    return { ...state, schemaVersion: 2 };
}

// マイグレーションパイプライン: [適用条件の最大バージョン, 変換関数]
const MIGRATIONS: Array<[maxFromVersion: number, fn: (s: Record<string, unknown>) => Record<string, unknown>]> = [
    [1, migrateV1toV2],
    // 将来例: [2, migrateV2toV3],
];

// ── 公開 API ─────────────────────────────────────────────────

/**
 * game_state オブジェクトを現在のスキーマバージョンにマイグレーションする。
 * 入力が非オブジェクトの場合は無変換で返す（バリデーターに任せる）。
 */
export function migrateGameState(raw: unknown): MigrateResult {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return {
            state: {} as Record<string, unknown>,
            migrated: false,
            fromVersion: 0
        };
    }

    let state = raw as Record<string, unknown>;

    // schemaVersion なし → v1 とみなす
    const fromVersion = typeof state.schemaVersion === 'number'
        ? Math.floor(state.schemaVersion)
        : 1;

    if (fromVersion >= CURRENT_SCHEMA_VERSION) {
        // 既に最新（または未来バージョン）
        return { state, migrated: false, fromVersion };
    }

    let migrated = false;
    for (const [maxFrom, fn] of MIGRATIONS) {
        const currentVersion = typeof state.schemaVersion === 'number'
            ? Math.floor(state.schemaVersion)
            : 1;
        if (currentVersion <= maxFrom) {
            state = fn(state);
            migrated = true;
        }
    }

    return { state, migrated, fromVersion };
}

/** schemaVersion の値が有効かチェック（バリデーターから呼ぶ用） */
export function isValidSchemaVersion(value: unknown): boolean {
    if (value === undefined) { return true; } // v1 の後方互換（フィールドなし = OK）
    return Number.isInteger(value) &&
        (value as number) >= 1 &&
        (value as number) <= CURRENT_SCHEMA_VERSION;
}

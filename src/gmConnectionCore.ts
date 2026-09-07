import { canonicalizeAcceptedTurnPayload, sha256Hex } from './acceptedTurnReplayGuardCore';
export type ConnectedGmProvider = 'codex-app-server' | 'claude-code-subscription';

/** Transport-only contract. Adapters never receive canonical paths or persistence callbacks. */
export interface GmConnectionAdapter {
    initialize(): Promise<'ready' | 'login_required'>;
    generate(prompt: string, onDraft: (text: string) => void): Promise<string>;
    /** Invalidates pending output immediately and ends the owned client connection. */
    dispose(): void;
}

/** User-facing recovery guidance; never forward provider payloads or internal witnesses. */
export function formatGmConnectionError(error: unknown): string {
    const code = error instanceof Error ? error.message : '';
    const messages: Record<string, string> = {
        claude_start_failed: 'Claude Codeを起動できません。公式CLIの導入と実行パスを確認してください。',
        claude_version_unsupported: 'Claude Codeの必要な隔離機能を確認できません。公式CLIを更新してください。',
        claude_login_required: 'Claudeのログインが必要です。「LoreRelay: AI接続」から接続してください。',
        claude_subscription_auth_required: 'Claudeのサブスク認証を確認できません。API課金へは切り替えません。',
        claude_timeout: 'Claudeの応答待ちが終了しました。接続状態を確認してください。自動再送はしません。',
        claude_usage_limit: 'Claudeの利用枠に達しました。利用枠の回復後に再開してください。APIへ切り替えず、自動再送もしません。',
        claude_turn_failed: 'Claudeの応答を完了できませんでした。利用枠と接続状態を確認してください。自動再送はしません。',
        codex_start_failed: 'Codexを起動できません。公式Codex CLIの導入と実行パスを確認してください。',
        codex_login_required: 'ログインが必要です。「LoreRelay: AI接続」から公式ログインを確認してください。',
        codex_login_timeout: 'ログイン待ちが終了しました。「LoreRelay: AI接続」から新しいログインを開始してください。',
        codex_login_browser_failed: '公式ログイン画面を開けませんでした。既定ブラウザーを確認してください。',
        codex_subscription_auth_required: 'ChatGPT利用枠の認証を確認できません。API課金へは切り替えません。',
        codex_usage_limit: 'ChatGPT利用枠に達しました。利用枠の回復後、入力を確認して再開してください。自動再送はしません。',
        codex_context_limit: 'GM文脈がモデルの上限を超えました。接続モデルと文脈設定を確認してください。',
        codex_turn_timeout: '応答待ちがタイムアウトしました。接続状態を確認してください。自動再送はしません。',
        codex_request_timeout: 'Codexとの通信がタイムアウトしました。「LoreRelay: AI接続」で接続を確認してください。',
        codex_thread_or_model_mismatch: '指定したモデルを確認できないため停止しました。接続設定を確認してください。',
        WORLD_MUTATION_IN_PROGRESS: '別のゲーム処理が進行中のため確定できませんでした。完了後に状態を確認してください。',
        'GM turn accepted; partial persistence requires inspection. Do not replay.': 'ターンは確定しましたが、一部の保存に失敗しました。再送せず、保存状態の確認が必要です。',
        'GM turn accepted; profile persistence incomplete. Do not replay.': 'ターンは確定しましたが、プロフィールの保存に失敗しました。再送せず、保存状態の確認が必要です。',
    };
    return messages[code] ?? 'GM応答を正常に完了できませんでした。自動再送はしていません。ゲーム状態と接続設定を確認してください。';
}

/** Host-owned identity. Never accept these fields from a model response. */
export interface GmConnectionWitness {
    workspace: string;
    campaignInstanceId: string;
    timelineEpochId: string;
    parentIdentityHash: string | null;
    hostSession: string;
    requestId: string;
}

export type GmCandidateDecision = 'ready' | 'duplicate' | 'conflict' | 'stale' | 'cancelled' | 'outcome_unknown';

/** A request is single use even when persistence throws after performing a write. */
export class GmCandidateGate {
    private cancelled = false;
    private payloadHash?: string;
    private outcome: 'pending' | 'submitted' | 'unknown' = 'pending';
    private readonly witness: string;

    constructor(witness: GmConnectionWitness) {
        this.witness = canonicalizeAcceptedTurnPayload(witness);
    }

    cancel(): void { this.cancelled = true; }

    inspect(current: GmConnectionWitness, candidate: unknown): GmCandidateDecision {
        if (this.cancelled) { return 'cancelled'; }
        if (canonicalizeAcceptedTurnPayload(current) !== this.witness) { return 'stale'; }
        const hash = sha256Hex(canonicalizeAcceptedTurnPayload(candidate));
        if (this.payloadHash !== undefined) {
            if (hash !== this.payloadHash) { return 'conflict'; }
            return this.outcome === 'submitted' ? 'duplicate' : 'outcome_unknown';
        }
        return 'ready';
    }

    /** Call only inside the existing Host mutation gate; callback must be synchronous. */
    submit(current: GmConnectionWitness, candidate: unknown, persist: () => void): GmCandidateDecision {
        const decision = this.inspect(current, candidate);
        if (decision !== 'ready') { return decision; }
        this.payloadHash = sha256Hex(canonicalizeAcceptedTurnPayload(candidate));
        this.outcome = 'unknown';
        try {
            persist();
            this.outcome = 'submitted';
            return 'ready';
        } catch {
            // Do not retry: a throwing persistence callback may already have written.
            return 'outcome_unknown';
        }
    }
}

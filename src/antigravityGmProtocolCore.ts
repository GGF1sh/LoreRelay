/** Validate the official read-only permission report, not model-written claims. */
export function verifyAntigravityIsolationPolicy(output: string): boolean {
    try {
        const value = JSON.parse(output);
        if (value.status !== 'SUCCESS' || value.num_turns !== 0 || value.command?.name !== 'permissions') return false;
        const scopes = value.command.data?.permissions;
        if (!Array.isArray(scopes) || scopes.length !== 3) return false;
        const seen = new Set<string>();
        const denies = new Set<string>();
        for (const scope of scopes) {
            if (!scope || !['project', 'shared', 'global'].includes(scope.scope) || seen.has(scope.scope)) return false;
            seen.add(scope.scope);
            for (const key of ['allow', 'ask', 'deny']) {
                if (scope[key] !== undefined && (!Array.isArray(scope[key]) || scope[key].some((s: unknown) => typeof s !== 'string'))) return false;
            }
            if (scope.allow?.length || scope.ask?.length) return false;
            for (const rule of scope.deny ?? []) denies.add(rule);
        }
        return ['read_file(*)', 'write_file(*)', 'read_url(*)', 'execute_url(*)', 'command(*)', 'unsandboxed(*)', 'mcp(*)']
            .every(rule => denies.has(rule));
    } catch { return false; }
}

/** Official agy NDJSON events, restricted to a single tool-free GM request. */
export class AntigravityGmStream {
    private conversation?: string;
    private candidate?: string;
    private failed = false;
    private closed = false;
    private bytes = 0;

    constructor(private readonly model: string, private readonly onDraft: (text: string) => void,
        private readonly verifiedPermissionPolicy = false) {}

    accept(line: string): void {
        if (this.closed || this.failed) throw new Error('antigravity_stream_closed');
        try {
            this.bytes += Buffer.byteLength(line, 'utf8');
            if (this.bytes > 4 * 1024 * 1024) throw new Error('antigravity_response_too_large');
            const event = JSON.parse(line);
            if (!event || typeof event !== 'object') throw new Error('antigravity_invalid_event');
            if (event.event === 'init') {
                if (this.conversation || typeof event.conversation_id !== 'string' || !event.conversation_id
                    || event.init?.model !== this.model || !Array.isArray(event.init?.tools)
                    || event.init.tools.some((tool: unknown) => typeof tool !== 'string')
                    || (event.init.tools.length !== 0 && (!this.verifiedPermissionPolicy
                        || event.init.agent !== 'lorerelay-gm' || event.init.permission_mode !== 'request-review')))
                    throw new Error('antigravity_identity_or_tools');
                this.conversation = event.conversation_id;
                return;
            }
            if (!this.conversation) throw new Error('antigravity_missing_init');
            if (event.event === 'step_update') {
                const step = event.step_update;
                if (this.candidate !== undefined || step?.conversation_id !== this.conversation)
                    throw new Error('antigravity_session_mismatch');
                // No executable step is a legitimate GM response, even if the client soft-denied it.
                if (!['user_input', 'agent_response', 'checkpoint', 'planner_response'].includes(step.step_type))
                    throw new Error('antigravity_unexpected_step');
                if (step.step_type === 'agent_response' && step.text_delta !== undefined) {
                    if (typeof step.text_delta !== 'string') throw new Error('antigravity_invalid_delta');
                    this.onDraft(step.text_delta);
                }
                return;
            }
            if (event.event !== 'result') throw new Error('antigravity_invalid_event');
            const result = event.result;
            if (result?.conversation_id !== this.conversation || result.status !== 'SUCCESS'
                || result.num_turns !== 1 || typeof result.response !== 'string' || !result.response.trim())
                throw new Error('antigravity_turn_failed');
            if (this.candidate !== undefined && this.candidate !== result.response)
                throw new Error('antigravity_conflicting_candidate');
            this.candidate = result.response;
        } catch (error) {
            this.failed = true;
            throw error instanceof Error && error.message.startsWith('antigravity_')
                ? error : new Error('antigravity_invalid_event');
        }
    }

    finish(exitCode: number | null): string {
        if (this.closed || this.failed || exitCode !== 0 || this.candidate === undefined) {
            this.closed = true;
            throw new Error('antigravity_incomplete_result');
        }
        this.closed = true;
        return this.candidate;
    }
}

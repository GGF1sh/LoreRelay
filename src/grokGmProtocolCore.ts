/** ACP drafts become a candidate only on the matching prompt's successful terminal response. */
export class GrokGmStream {
    private text = '';
    private closed = false;
    private messageId?: string;
    constructor(private readonly sessionId: string, private readonly onDraft: (text: string) => void,
        private readonly model?: string) {}

    update(params: unknown): void {
        if (this.closed) return;
        const value = params as { sessionId?: string; update?: Record<string, unknown> };
        if (!value || value.sessionId !== this.sessionId || !value.update) {
            throw new Error('grok_session_mismatch');
        }
        const update = value.update;
        if (update.sessionUpdate === 'current_model_update' && update.currentModelId !== this.model) {
            throw new Error('grok_model_unverified');
        }
        if (update.sessionUpdate === 'config_option_update') {
            const options = update.configOptions;
            if (!Array.isArray(options)) throw new Error('grok_invalid_candidate');
            for (const option of options) {
                if ((option?.category === 'model' || option?.id === 'model') && option.currentValue !== this.model) {
                    throw new Error('grok_model_unverified');
                }
            }
        }
        if (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') {
            throw new Error('grok_tool_unavailable');
        }
        if (update.sessionUpdate !== 'agent_message_chunk') return;
        const content = update.content as { type?: string; text?: string };
        if (content?.type !== 'text' || typeof content.text !== 'string') {
            throw new Error('grok_invalid_candidate');
        }
        if (typeof update.messageId === 'string') {
            if (this.messageId && this.messageId !== update.messageId) throw new Error('grok_conflicting_candidate');
            this.messageId = update.messageId;
        }
        this.text += content.text;
        if (Buffer.byteLength(this.text, 'utf8') > 4 * 1024 * 1024) throw new Error('grok_response_too_large');
        this.onDraft(content.text);
    }

    finish(result: unknown): string {
        if (this.closed) throw new Error('grok_connection_closed');
        this.closed = true;
        if ((result as { stopReason?: string })?.stopReason !== 'end_turn' || !this.text.trim()) {
            this.text = '';
            throw new Error('grok_invalid_candidate');
        }
        const text = this.text;
        this.text = '';
        return text;
    }

    cancel(): void { this.closed = true; this.text = ''; }
}

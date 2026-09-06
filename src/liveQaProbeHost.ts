import * as vscode from 'vscode';
import { randomUUID } from 'crypto';

/** A request observes the current real panel, never a replacement renderer. */
export function createLiveQaProbe(session: string, getPanel: () => vscode.WebviewPanel | undefined,
    readState: () => Record<string, unknown> | undefined) {
    const generations = new WeakMap<vscode.WebviewPanel, string>();
    return async (action?: Record<string, unknown>): Promise<unknown> => {
        const panel = getPanel();
        if (!panel) return { confirmed: false, reason: 'panel_absent' };
        let generation = generations.get(panel);
        if (!generation) { generation = randomUUID(); generations.set(panel, generation); }
        const probeId = randomUUID();
        const expectedRevision = readState()?.semanticRevision ?? null;
        return new Promise(resolve => {
            const finish = (value: unknown) => { clearTimeout(timer); subscription.dispose(); resolve(value); };
            const subscription = panel.webview.onDidReceiveMessage(message => {
                if (message?.type !== 'liveQaProbeResult' || message.session !== session
                    || message.generation !== generation || message.probeId !== probeId) return;
                if (getPanel() !== panel) { finish({ confirmed: false, reason: 'panel_replaced' }); return; }
                const value = message.rendered;
                if (!value || JSON.stringify(value).length > 32768 || typeof value.visible !== 'boolean'
                    || typeof value.revision !== 'string' && value.revision !== null) {
                    finish({ confirmed: false, reason: 'invalid_rendered_state' }); return;
                }
                finish({ confirmed: value.revision === expectedRevision && value.ready === true
                    && (readState()?.semanticRevision ?? null) === expectedRevision,
                    session, generation, probeId, rendered: value });
            });
            const timer = setTimeout(() => finish({ confirmed: false, reason: 'render_timeout' }), 5000);
            void panel.webview.postMessage({ type: 'liveQaProbe', session, generation, probeId,
                expectedRevision, ...(action ? { action } : {}) }).then(sent => {
                if (!sent) finish({ confirmed: false, reason: 'panel_unavailable' });
            }, () => finish({ confirmed: false, reason: 'panel_unavailable' }));
        });
    };
}

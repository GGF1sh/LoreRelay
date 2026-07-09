import * as fs from 'fs';
import {
    getAntigravityRelayRequestPath,
    parseAntigravityRelayRequest,
    type AntigravityRelayRequest,
} from './antigravityRelayBridgeCore';

export type AntigravityRelayClearReason =
    | 'relay-mode-off'
    | 'scenario-load'
    | 'session-transition'
    | 'accepted-result';

export function readPendingAntigravityRelayRequest(workspacePath: string): AntigravityRelayRequest | undefined {
    const requestPath = getAntigravityRelayRequestPath(workspacePath);
    if (!fs.existsSync(requestPath)) {
        return undefined;
    }
    try {
        const raw = fs.readFileSync(requestPath, 'utf8');
        return parseAntigravityRelayRequest(JSON.parse(raw));
    } catch (e) {
        console.warn('[antigravityRelay] ignored malformed relay request file', e);
        return undefined;
    }
}

export function clearPendingAntigravityRelayRequest(
    workspacePath: string | undefined,
    reason: AntigravityRelayClearReason,
    expectedRequestId?: string
): boolean {
    if (!workspacePath) {
        return false;
    }
    const requestPath = getAntigravityRelayRequestPath(workspacePath);
    try {
        if (!fs.existsSync(requestPath)) {
            return false;
        }
        if (expectedRequestId) {
            const current = readPendingAntigravityRelayRequest(workspacePath);
            if (current?.requestId !== expectedRequestId) {
                return false;
            }
        }
        fs.unlinkSync(requestPath);
        console.info(`[antigravityRelay] cleared pending request: ${reason}`);
        return true;
    } catch (e) {
        console.warn(`[antigravityRelay] failed to clear pending request: ${reason}`, e);
        return false;
    }
}

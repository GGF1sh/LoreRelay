import { randomBytes } from 'crypto';

/** Reachability of this exact gateway instance, never an authority-bearing token. */
export function createRemoteTunnelWitness(origin: string, revoke: () => void, probe: typeof fetch = fetch) {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.origin !== origin) throw new Error('https_origin_required');
    const witness = randomBytes(32).toString('hex');
    let ready = false;
    let closed = false;
    let pending = false;
    let controller: AbortController | undefined;
    return {
        witness,
        isReady: () => ready && !closed,
        close() { closed = true; ready = false; controller?.abort(); },
        async check() {
            if (closed || pending) return;
            pending = true;
            controller = new AbortController();
            const timeout = setTimeout(() => controller?.abort(), 3000);
            let matches = false;
            const challenge = randomBytes(16).toString('hex');
            try {
                const response = await probe(`${origin}/health?probe=${challenge}`, {
                    redirect: 'error', signal: controller.signal, headers: { 'Cache-Control': 'no-store' },
                });
                // Only read the fixed-size witness; do not buffer an arbitrary response.
                const reader = response.body?.getReader();
                let text = '';
                if (response.ok && reader) {
                    for (;;) {
                        const part = await reader.read();
                        if (part.done) break;
                        text += new TextDecoder().decode(part.value);
                        if (text.length > 128) { await reader.cancel(); break; }
                    }
                    matches = text === `${witness}:${challenge}`;
                } else await response.body?.cancel();
            } catch { /* Unreachable, redirected or foreign endpoint cannot preserve a lease. */ }
            finally { clearTimeout(timeout); pending = false; controller = undefined; }
            if (closed) return;
            if (matches) ready = true;
            else if (ready) { closed = true; ready = false; revoke(); }
        },
    };
}

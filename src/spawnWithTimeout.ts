// Subprocess spawn helper with hard timeout and process-tree kill on hang.

import { spawn, execFile, type ChildProcess, type SpawnOptionsWithoutStdio } from 'child_process';

export type SpawnWithTimeoutResult = {
    code: number | null;
    timedOut: boolean;
    signal: NodeJS.Signals | null;
};

/** Kill a process and its descendants (ComfyUI grandchildren after Python wrapper timeout). */
export function killProcessTree(pid: number | undefined, signal: NodeJS.Signals = 'SIGTERM'): void {
    if (pid === undefined || pid <= 0) { return; }
    if (process.platform === 'win32') {
        execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => { /* ignore */ });
        return;
    }
    // POSIX children spawned below are process-group leaders.  Signalling the
    // negative pid reaches nested descendants as well as the direct child.
    try {
        process.kill(-pid, signal);
    } catch {
        try { process.kill(pid, signal); } catch { /* ignore */ }
    }
}

export function spawnWithTimeout(
    command: string,
    args: readonly string[],
    options: SpawnOptionsWithoutStdio & { timeoutMs: number },
    onData?: { stdout?: (chunk: string) => void; stderr?: (chunk: string) => void }
): { child: ChildProcess; result: Promise<SpawnWithTimeoutResult> } {
    const { timeoutMs, ...spawnOpts } = options;
    const child = spawn(command, [...args], {
        ...spawnOpts,
        shell: false,
        // A dedicated POSIX process group lets killProcessTree reliably stop
        // grandchildren after the wrapper process times out.
        detached: process.platform !== 'win32' || spawnOpts.detached,
    });
    let finished = false;
    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const result = new Promise<SpawnWithTimeoutResult>((resolve) => {
        const finish = (code: number | null, signal: NodeJS.Signals | null) => {
            if (finished) { return; }
            finished = true;
            if (killTimer) { clearTimeout(killTimer); }
            resolve({ code, timedOut, signal });
        };

        killTimer = setTimeout(() => {
            if (finished) { return; }
            timedOut = true;
            killProcessTree(child.pid);
            try {
                child.kill('SIGTERM');
            } catch { /* ignore */ }
            setTimeout(() => {
                if (!finished) {
                    killProcessTree(child.pid, 'SIGKILL');
                    try { child.kill('SIGKILL'); } catch { /* ignore */ }
                }
            }, 2000);
        }, Math.max(1000, timeoutMs));

        child.stdout?.on('data', (data: Buffer) => {
            onData?.stdout?.(data.toString());
        });
        child.stderr?.on('data', (data: Buffer) => {
            onData?.stderr?.(data.toString());
        });
        child.on('error', () => finish(null, null));
        child.on('close', (code, signal) => finish(code, signal));
    });

    return { child, result };
}

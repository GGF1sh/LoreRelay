// Campaign P0 — FIFO mutex for game_state.json / world_state.json writers.

type QueueJob = () => void;

let writeQueue: QueueJob[] = [];
let writeBusy = false;

function drainWorkspaceWriteQueue(): void {
    if (writeBusy) {
        return;
    }
    writeBusy = true;
    try {
        while (writeQueue.length > 0) {
            const job = writeQueue.shift();
            if (!job) { continue; }
            job();
        }
    } finally {
        writeBusy = false;
        if (writeQueue.length > 0) {
            drainWorkspaceWriteQueue();
        }
    }
}

/** Run fn after prior workspace mutations complete (in-process serialization). */
export function runSerializedWorkspaceMutation(fn: QueueJob): void {
    writeQueue.push(fn);
    drainWorkspaceWriteQueue();
}

/** Test hook — reset queue between unit tests. */
export function resetWorkspaceWriteQueueForTests(): void {
    writeQueue = [];
    writeBusy = false;
}
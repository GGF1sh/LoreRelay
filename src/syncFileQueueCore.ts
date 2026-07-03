// Campaign P0 PR3 — per-file sync FIFO queue (pure, testable).

export type SyncQueueJob = () => void;

export interface SyncFileQueue {
    enqueue(job: SyncQueueJob): void;
    reset(): void;
    getPendingCount(): number;
    isBusy(): boolean;
}

export function createSyncFileQueue(): SyncFileQueue {
    let writeQueue: SyncQueueJob[] = [];
    let writeBusy = false;

    function drain(): void {
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
                drain();
            }
        }
    }

    return {
        enqueue(job: SyncQueueJob): void {
            writeQueue.push(job);
            drain();
        },
        reset(): void {
            writeQueue = [];
            writeBusy = false;
        },
        getPendingCount(): number {
            return writeQueue.length;
        },
        isBusy(): boolean {
            return writeBusy;
        },
    };
}
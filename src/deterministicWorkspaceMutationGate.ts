export const WORLD_MUTATION_IN_PROGRESS = 'WORLD_MUTATION_IN_PROGRESS' as const;

export interface DeterministicWorkspaceMutationIdentity {
    actionKind: string;
    requestId: string;
}

export interface DeterministicWorkspaceMutationLease {
    workspaceKey: string;
    identity: DeterministicWorkspaceMutationIdentity;
    release(): boolean;
}

export type DeterministicWorkspaceMutationAcquireResult =
    | { status: 'acquired'; lease: DeterministicWorkspaceMutationLease }
    | {
        status: 'busy';
        code: typeof WORLD_MUTATION_IN_PROGRESS;
        owner: DeterministicWorkspaceMutationIdentity & { elapsedMs: number };
    };

interface ActiveWorkspaceMutation extends DeterministicWorkspaceMutationIdentity {
    token: symbol;
    startedAtMs: number;
}

export type DeterministicWorkspaceMutationResult<T> =
    | { status: 'completed'; value: T }
    | {
        status: 'busy';
        code: typeof WORLD_MUTATION_IN_PROGRESS;
        owner: DeterministicWorkspaceMutationIdentity & { elapsedMs: number };
    }
    | { status: 'failed'; error: unknown };

export interface DeterministicWorkspaceMutationGate {
    acquire(
        workspaceKey: string,
        identity: DeterministicWorkspaceMutationIdentity
    ): DeterministicWorkspaceMutationAcquireResult;
    run<T>(
        workspaceKey: string,
        identity: DeterministicWorkspaceMutationIdentity,
        execute: () => Promise<T> | T
    ): Promise<DeterministicWorkspaceMutationResult<T>>;
    clearWorkspace(workspaceKey: string): boolean;
    dispose(): void;
}

/**
 * Host-scoped exclusion for deterministic canonical mutations.
 *
 * Acquisition is immediate: an occupied workspace returns BUSY and is never
 * queued. Active work has no timeout or force-unlock path and is released only
 * by its own finally block (or extension shutdown through dispose()).
 */
export function createDeterministicWorkspaceMutationGate(): DeterministicWorkspaceMutationGate {
    const active = new Map<string, ActiveWorkspaceMutation>();

    const acquire = (
        workspaceKey: string,
        identity: DeterministicWorkspaceMutationIdentity
    ): DeterministicWorkspaceMutationAcquireResult => {
        const current = active.get(workspaceKey);
        if (current) {
            return {
                status: 'busy',
                code: WORLD_MUTATION_IN_PROGRESS,
                owner: {
                    actionKind: current.actionKind,
                    requestId: current.requestId,
                    elapsedMs: Math.max(0, Date.now() - current.startedAtMs),
                },
            };
        }

        const token = Symbol(identity.requestId);
        active.set(workspaceKey, { ...identity, token, startedAtMs: Date.now() });
        let released = false;
        return {
            status: 'acquired',
            lease: {
                workspaceKey,
                identity,
                release() {
                    if (released || active.get(workspaceKey)?.token !== token) {
                        return false;
                    }
                    released = true;
                    active.delete(workspaceKey);
                    return true;
                },
            },
        };
    };

    return {
        acquire,
        async run(workspaceKey, identity, execute) {
            const acquired = acquire(workspaceKey, identity);
            if (acquired.status === 'busy') {
                return acquired;
            }
            try {
                return { status: 'completed', value: await execute() };
            } catch (error) {
                return { status: 'failed', error };
            } finally {
                acquired.lease.release();
            }
        },
        clearWorkspace(workspaceKey) {
            if (active.has(workspaceKey)) { return false; }
            return active.delete(workspaceKey);
        },
        dispose() { active.clear(); },
    };
}

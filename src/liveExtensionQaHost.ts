import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as net from 'net';
import { createHash, randomUUID } from 'crypto';
import { parseLiveQaRequest } from './liveExtensionQaCore';
import { createCommerceActionRuntime } from './commerceActionRuntime';
import { CHECKPOINT_MUTABLE_LEDGER_FILES } from './checkpointSnapshot';
import { listCheckpointMetas } from './checkpoint';
import { handleSaveCheckpoint, handleRestoreCheckpoint } from './checkpointHandlers';
import { getWorkspacePath } from './workspacePaths';
import type { DeterministicWorkspaceMutationGate } from './deterministicWorkspaceMutationGate';
import type { ModManagerHost } from './mods/modManagerHost';
import { createLiveQaProbe } from './liveQaProbeHost';

type Runtime = Awaited<ReturnType<typeof createCommerceActionRuntime>>;
/** Only a development/test Host with a runner-owned fixture can instantiate this bridge. */
export function startLiveExtensionQa(context: vscode.ExtensionContext,
    gate: DeterministicWorkspaceMutationGate, reopen: () => Promise<void>,
    getPanel: () => vscode.WebviewPanel | undefined, mods: ModManagerHost) {
    if (context.extensionMode === vscode.ExtensionMode.Production || !process.env.LORERELAY_QA_SECRET) return;
    const secret = process.env.LORERELAY_QA_SECRET;
    const endpoint = process.env.LORERELAY_QA_ENDPOINT;
    const workspace = getWorkspacePath();
    if (!workspace || !endpoint || !/^[a-f0-9]{64}$/.test(secret)) throw new Error('qa_bootstrap_invalid');
    const root = fs.realpathSync(path.dirname(workspace));
    const temp = fs.realpathSync(os.tmpdir());
    if (path.relative(temp, path.dirname(root)) !== '' || !path.basename(root).startsWith('lorerelay-live-qa-')
        || path.basename(workspace) !== 'workspace' || fs.lstatSync(workspace).isSymbolicLink()
        || path.relative(fs.realpathSync(workspace), path.join(root, 'workspace')) !== '') throw new Error('qa_fixture_required');
    const markerPath = path.join(root, 'owner.json');
    if (fs.lstatSync(markerPath).isSymbolicLink() || fs.statSync(markerPath).size > 4096) throw new Error('qa_owner_invalid');
    const owner = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    if (owner.secretHash !== createHash('sha256').update(secret).digest('hex')
        || !['lifecycle_v1', 'mods_v1'].includes(owner.fixtureId) || owner.endpoint !== endpoint) throw new Error('qa_owner_invalid');
    const session = randomUUID();
    const probe = createLiveQaProbe(session, getPanel, () => mods.readPublishedState());
    let runtime: Runtime | undefined;
    let caller: ReturnType<Runtime['service']['createTrustedSession']> | undefined;
    let closed = false;
    let authenticated = false;
    let busy = false;
    let finish!: () => void;
    const completion = new Promise<void>(resolve => { finish = resolve; });
    const socket = net.createConnection(endpoint);
    const send = (value: unknown) => { if (!closed) socket.write(JSON.stringify(value) + '\n'); };
    const dispose = () => {
        if (closed) return;
        closed = true;
        if (runtime && caller) runtime.service.close(caller);
        socket.destroy(); if (!busy) finish();
    };
    context.subscriptions.push({ dispose });
    socket.on('error', dispose);
    socket.on('close', dispose);
    socket.on('connect', () => send({ type: 'hello', secret, session, fixtureId: owner.fixtureId, workspace, pid: process.pid }));
    async function current() {
        if (getWorkspacePath() !== workspace || closed) throw new Error('qa_session_closed');
        if (!runtime || !runtime.authorized()) {
            if (runtime && caller) runtime.service.close(caller);
            runtime = await createCommerceActionRuntime(gate);
            caller = runtime.service.createTrustedSession('qa-runner');
        }
        return { service: runtime.service, caller: caller! };
    }
    async function dispatch(raw: unknown) {
        const request = parseLiveQaRequest(raw);
        if (!request || request.session !== session) { send({ type: 'rejected', code: 'invalid_request' }); return; }
        if (busy) { send({ id: request.id, session, ok: false, code: 'rejected_busy' }); return; }
        busy = true;
        try {
            if (getWorkspacePath() !== workspace || closed) throw new Error('qa_session_closed');
            const args = request.args;
            let result: unknown;
            if (['read_player_view', 'query_available', 'preview', 'execute', 'wait_receipt'].includes(request.op)) {
                const { service, caller: trusted } = await current();
                if (request.op === 'read_player_view') result = service.readPlayerView(trusted);
                if (request.op === 'query_available') result = service.queryAvailable(trusted);
                if (request.op === 'preview') result = service.preview(trusted, args);
                if (request.op === 'execute') {
                    if (typeof args.confirmationToken === 'string') service.confirm(trusted, args.confirmationToken, 'scripted');
                    result = await service.execute(trusted, args);
                }
                if (request.op === 'wait_receipt') result = await service.waitReceipt(trusted, args.requestId as string, args.timeoutMs as number);
            }
            switch (request.op) {
                case 'mod_state': result = { host: mods.readPublishedState() ?? null,
                    locale: vscode.workspace.getConfiguration('textAdventure').get('locale', 'en') }; break;
                case 'rendered_state': result = await probe(); break;
                case 'ui_action': result = await probe(args); break;
                case 'adult_denial':
                    if (owner.fixtureId !== 'mods_v1' || mods.readPublishedState()?.adultVisible !== false) throw new Error('qa_adult_denial_precondition');
                    await mods.handleMessage({ type: 'authorizeAdultMod', id: 'qa.adult', version: '1.0.0', source: 'workspace' });
                    result = { denied: mods.adultSessionApprovals(workspace!).length === 0 }; break;
                case 'inspect': {
                    const lease = gate.acquire(workspace!, { actionKind: 'qa_inspect', requestId: request.id });
                    if (lease.status !== 'acquired') throw new Error('rejected_busy');
                    try {
                        const files: Record<string, unknown> = {};
                        for (const name of ['game_state.json', ...CHECKPOINT_MUTABLE_LEDGER_FILES]) {
                            const file = path.join(workspace!, name);
                            if (!fs.existsSync(file)) { files[name] = { present: false }; continue; }
                            if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 1_000_000) throw new Error('qa_inspection_invalid');
                            files[name] = { present: true, value: JSON.parse(fs.readFileSync(file, 'utf8')) };
                        }
                        result = files;
                    } finally { lease.lease.release(); }
                    break;
                }
                case 'checkpoint_list': result = listCheckpointMetas(workspace!); break;
                case 'checkpoint_save': result = await handleSaveCheckpoint('QA lifecycle'); break;
                case 'checkpoint_restore': result = await handleRestoreCheckpoint(args.checkpointId as string); break;
                case 'reopen': await reopen(); result = { reopened: true }; break;
                case 'reload': case 'stop': {
                    // Lifecycle must not terminate another admitted canonical mutation.
                    const lease = gate.acquire(workspace!, { actionKind: 'qa_lifecycle', requestId: request.id });
                    if (lease.status !== 'acquired') throw new Error('rejected_busy');
                    try {
                        // Do not destroy IPC before the lifecycle admission is flushed.
                        // Windows may otherwise exit normally while its caller times out.
                        await new Promise<void>((resolve, reject) => socket.write(JSON.stringify({
                            id: request.id, session, ok: true, result: { lifecycle: request.op + '_admitted' },
                        }) + '\n', error => error ? reject(error) : resolve()));
                        if (request.op === 'stop') socket.end();
                        await vscode.commands.executeCommand(request.op === 'reload' ? 'workbench.action.reloadWindow' : 'workbench.action.quit');
                    } finally { lease.lease.release(); }
                    return;
                }
            }
            send({ id: request.id, session, ok: true, result: result ?? null });
        } catch { send({ id: request.id, session, ok: false, code: 'qa_operation_failed' }); }
        finally { busy = false; if (closed) finish(); }
    }
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', chunk => {
        buffer += chunk;
        if (Buffer.byteLength(buffer) > 256 * 1024) { dispose(); return; }
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
            try {
                const value = JSON.parse(line);
                if (!authenticated) {
                    if (value.type !== 'ready' || value.secret !== secret || value.session !== session) { dispose(); return; }
                    authenticated = true;
                } else void dispatch(value);
            } catch { dispose(); return; }
        }
    });
    return completion;
}

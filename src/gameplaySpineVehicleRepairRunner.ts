// Explicit, single-action human ingress for the Gameplay Spine vehicle repair pilot.

import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { loadGameRules } from './gameRules';
import {
    commitVehicleRepairEffectPlan,
    reconcileVehicleRepairRequest,
    type VehicleRepairCommitResult,
} from './gameplaySpineVehicleRepairCommitHost';
import {
    buildVehicleRepairEffectPlan,
    planVehicleRepairPreview,
} from './gameplaySpineVehicleRepairPlanAdapterCore';
import { digestWholeVehicleStateDocument } from './vehicleStateDocumentCore';
import { readVehicleStateDocumentFresh } from './vehicleStateDocumentOwner';
import { MAX_VEHICLE_OP_AMOUNT } from './vehicleOpsCore';
import { getVehicleRepairMode } from './vehicleRepairMode';
import { loadWorldState } from './worldState';
import { getWorkspacePath } from './workspacePaths';
import { executeWorldIntent, queryWorldIntent, type WorldIntent } from './worldIntentCore';

const MAX_REPAIR_PICK_ITEMS = 64;
const REQUEST_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;

let outputChannel: vscode.OutputChannel | undefined;

function channel(): vscode.OutputChannel {
    if (!outputChannel) { outputChannel = vscode.window.createOutputChannel('LoreRelay Gameplay Spine'); }
    return outputChannel;
}

function isSafeRequestId(value: string): boolean {
    return REQUEST_ID_RE.test(value)
        && value !== '.' && value !== '..' && !value.endsWith('.') && !value.includes('..');
}

function makeRequestId(): string {
    return `vrq_${crypto.randomBytes(12).toString('hex')}`;
}

function publicResultLine(result: VehicleRepairCommitResult): string {
    return [
        `requestId=${result.requestId}`,
        `status=${result.status}`,
        `commitState=${result.commitState}`,
        ...(result.commitId ? [`commitId=${result.commitId}`] : []),
        ...(result.reasonCode ? [`reason=${result.reasonCode}`] : []),
        ...(result.replayedPriorCommit ? ['replayedPriorCommit=true'] : []),
    ].join(' ');
}

async function offerCopyableRequestId(requestId: string, message: string): Promise<void> {
    channel().appendLine(`${message} requestId=${requestId}`);
    channel().show(true);
    const copy = 'Copy Request ID';
    const choice = await vscode.window.showInformationMessage(`${message}\nRequest ID: ${requestId}`, copy);
    if (choice === copy) { await vscode.env.clipboard.writeText(requestId); }
}

/** Command palette ingress for vehicle:repair_vehicle only; it accepts no arbitrary action JSON. */
export async function runGameplaySpineVehicleRepairCommand(): Promise<void> {
    const workspaceKey = getWorkspacePath();
    const mode = getVehicleRepairMode();
    if (!workspaceKey) {
        void vscode.window.showWarningMessage('Open a workspace before repairing a vehicle.');
        return;
    }
    if (mode === 'off') {
        void vscode.window.showInformationMessage('Gameplay Spine vehicle repair is off. Legacy repair behavior remains unchanged.');
        return;
    }

    const fresh = readVehicleStateDocumentFresh();
    if (!fresh.ok) {
        void vscode.window.showErrorMessage(`Vehicle repair is unavailable: ${fresh.reason}`);
        return;
    }
    if (fresh.document.version !== 2) {
        void vscode.window.showWarningMessage('Upgrade vehicle_state.json to Gameplay Spine v2 before authoritative repair.');
        return;
    }
    const repairable = fresh.mechanical.vehicles
        .filter((vehicle) => vehicle.status !== 'lost' && vehicle.durability.hp < vehicle.durability.maxHp)
        .slice(0, MAX_REPAIR_PICK_ITEMS);
    if (!repairable.length) {
        void vscode.window.showInformationMessage('No repairable vehicles are available.');
        return;
    }
    const selected = await vscode.window.showQuickPick(
        repairable.map((vehicle) => ({
            label: vehicle.name || vehicle.id,
            description: `${vehicle.durability.hp}/${vehicle.durability.maxHp} HP`,
            detail: vehicle.id,
            vehicle,
        })),
        { title: 'Gameplay Spine Vehicle Repair', placeHolder: 'Select a damaged vehicle' }
    );
    if (!selected) { return; }
    const amountRaw = await vscode.window.showInputBox({
        title: 'Gameplay Spine Vehicle Repair',
        prompt: `Repair amount (1-${MAX_VEHICLE_OP_AMOUNT})`,
        validateInput: (value) => {
            const amount = Number(value);
            return Number.isSafeInteger(amount) && amount >= 1 && amount <= MAX_VEHICLE_OP_AMOUNT
                ? undefined : `Enter an integer between 1 and ${MAX_VEHICLE_OP_AMOUNT}.`;
        },
    });
    if (amountRaw === undefined) { return; }
    const amount = Number(amountRaw);
    const requestId = await vscode.window.showInputBox({
        title: 'Gameplay Spine Vehicle Repair',
        prompt: 'Durable request ID (reuse one to replay a prior repair)',
        value: makeRequestId(),
        validateInput: (value) => isSafeRequestId(value)
            ? undefined : 'Use 1-160 letters, digits, dot, underscore, or hyphen; no path-like dots.',
    });
    if (requestId === undefined) { return; }

    const reconciliation = reconcileVehicleRepairRequest({
        requestId,
        target: { kind: 'vehicle', id: selected.vehicle.id },
        requestedRepair: amount,
    });
    if (reconciliation.status === 'replayed' || reconciliation.status === 'rejected') {
        const result = reconciliation.result;
        await offerCopyableRequestId(requestId, publicResultLine(result));
        return;
    }

    const context = {
        vehicleState: fresh.mechanical,
        gameRules: loadGameRules(),
        worldTurn: loadWorldState()?.worldTurn,
    };
    const intent: WorldIntent = {
        id: requestId, source: 'ui', subsystem: 'vehicle', action: 'repair_vehicle',
        target: { kind: 'vehicle', id: selected.vehicle.id }, payload: { amount },
    };
    const query = queryWorldIntent(intent, context);
    const execute = executeWorldIntent(intent, context);
    const preview = planVehicleRepairPreview(intent, query, execute, context);
    if (preview.admission.status !== 'ready' || !preview.mechanicalPreview || !preview.confirmation) {
        void vscode.window.showWarningMessage(`Vehicle repair preview is unavailable: ${preview.unavailable?.reasonCode ?? preview.admission.reasonCode ?? 'not_ready'}`);
        return;
    }
    const confirmation = await vscode.window.showWarningMessage(
        `${selected.vehicle.name || selected.vehicle.id}: ${preview.mechanicalPreview.hpBefore} HP -> ${preview.mechanicalPreview.hpAfter} HP (effective repair ${preview.mechanicalPreview.effectiveRepair}).\nRequest ID: ${requestId}`,
        { modal: true },
        mode === 'authoritative' ? 'Commit Repair' : 'Confirm Preview'
    );
    if (!confirmation) { return; }
    if (mode === 'shadow') {
        const planned = buildVehicleRepairEffectPlan(preview, context);
        if (planned.status !== 'available') {
            void vscode.window.showWarningMessage(`Shadow repair plan is stale: ${planned.code}`);
            return;
        }
        await offerCopyableRequestId(requestId, 'Shadow repair preview verified; no canonical write was made.');
        return;
    }

    const planned = buildVehicleRepairEffectPlan(preview, context);
    if (planned.status !== 'available') {
        void vscode.window.showWarningMessage(`Vehicle repair plan is stale: ${planned.code}`);
        return;
    }
    const result = commitVehicleRepairEffectPlan({
        workspaceKey,
        wholeDocumentDigest: digestWholeVehicleStateDocument(fresh.document),
        plan: planned.plan,
        context: { gameRules: context.gameRules, worldTurn: context.worldTurn },
    });
    await offerCopyableRequestId(requestId, publicResultLine(result));
}

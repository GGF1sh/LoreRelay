// World Intent WI3b: VS Code host wrapper for vehicle bridge diagnostics.

import * as vscode from 'vscode';
import {
    normalizeVehicleWorldIntentBridgeMode,
    type VehicleWorldIntentBridgeBatchReport,
} from './vehicleWorldIntentBridgeCore';
import type { VehicleWorldIntentBridgeMode } from './worldIntentCore';

let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('LoreRelay World Intent');
    }
    return outputChannel;
}

export function getVehicleWorldIntentBridgeMode(): VehicleWorldIntentBridgeMode {
    try {
        const raw = vscode.workspace.getConfiguration('textAdventure').get('worldIntent.vehicleBridgeMode');
        return normalizeVehicleWorldIntentBridgeMode(raw);
    } catch {
        return 'off';
    }
}

export function emitVehicleWorldIntentBridgeDiagnostics(
    report: VehicleWorldIntentBridgeBatchReport
): void {
    if (report.bridgeMode === 'off') { return; }

    const summary = [
        '[WI3b]',
        `mode=${report.bridgeMode}`,
        `ops=${report.operationCount}`,
        `match=${report.matchCount}`,
        `mismatch=${report.mismatchCount}`,
        `notComparable=${report.notComparableCount}`,
        `exceptions=${report.exceptionCount}`,
    ].join(' ');

    if (report.parityError) {
        const line = `${summary} parityError=${report.parityError}`;
        console.warn(line);
        getOutputChannel().appendLine(line);
        return;
    }

    if (report.bridgeMode === 'shadow') {
        if (report.mismatchCount > 0 || report.notComparableCount > 0 || report.exceptionCount > 0) {
            console.warn(summary);
            getOutputChannel().appendLine(summary);
        }
        return;
    }

    if (report.bridgeMode === 'compare_only') {
        getOutputChannel().appendLine(summary);
        for (const item of report.reports) {
            const mismatches = item.mismatches.length ? ` mismatches=${item.mismatches.join(',')}` : '';
            getOutputChannel().appendLine(
                `  ${item.action}: ${item.outcome} legacy=${item.expected.legacyClass}${mismatches}`
            );
        }
        if (report.accountingEntryCount > 0) {
            getOutputChannel().appendLine(`  accounting entries=${report.accountingEntryCount}`);
            for (const entry of report.accountingEntries) {
                getOutputChannel().appendLine(
                    `    ${entry.entity.id} ${entry.field}: ${entry.before} +${entry.delta} -> ${entry.after}`
                );
            }
        }
    }
}
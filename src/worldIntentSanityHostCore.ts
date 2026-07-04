// World Intent WI5b: pure workspace sanity host adapter (no vscode/fs).

import type { ModProfile, ParsedModManifest } from './modSystemCore';
import type { SettlementStateV1 } from './settlementCore';
import type { VehicleParseIssue, VehicleState } from './vehicleCore';
import {
    buildWorldSanityReport,
    type BuildWorldSanityReportOptions,
    type WorldSanityGameRules,
    type WorldSanityInput,
    type WorldSanityIssue,
    type WorldSanityReport,
} from './worldIntentSanityCore';

export interface WorkspaceSanitySources {
    vehicleState?: boolean;
    settlementState?: boolean;
    gameRules?: boolean;
    modProfile?: boolean;
    modManifestCount?: number;
    vehicleBridgeMode?: boolean;
}

export interface WorkspaceSanitySnapshot {
    vehicleState?: VehicleState;
    vehicleRawParseIssues?: VehicleParseIssue[];
    settlementState?: SettlementStateV1;
    gameRules?: WorldSanityGameRules;
    modProfile?: ModProfile;
    mods?: Readonly<Record<string, ParsedModManifest>>;
    rawConfig?: {
        vehicleBridgeMode?: unknown;
    };
    sources?: WorkspaceSanitySources;
}

export function buildWorldSanityInputFromSnapshot(snapshot: WorkspaceSanitySnapshot): WorldSanityInput {
    const input: WorldSanityInput = {};
    if (snapshot.vehicleState) { input.vehicleState = snapshot.vehicleState; }
    if (snapshot.vehicleRawParseIssues?.length) {
        input.vehicleRawParseIssues = snapshot.vehicleRawParseIssues;
    }
    if (snapshot.settlementState) { input.settlementState = snapshot.settlementState; }
    if (snapshot.gameRules) { input.gameRules = snapshot.gameRules; }
    if (snapshot.modProfile) { input.modProfile = snapshot.modProfile; }
    if (snapshot.mods) { input.mods = snapshot.mods; }
    if (snapshot.rawConfig) { input.rawConfig = snapshot.rawConfig; }
    return input;
}

export function runWorkspaceSanityCheckFromSnapshot(
    snapshot: WorkspaceSanitySnapshot,
    options?: BuildWorldSanityReportOptions
): WorldSanityReport {
    return buildWorldSanityReport(buildWorldSanityInputFromSnapshot(snapshot), options);
}

function formatEntityRef(ref: { kind: string; id?: string } | undefined): string {
    if (!ref) { return ''; }
    return ref.id ? `${ref.kind}/${ref.id}` : ref.kind;
}

function formatIssueLine(issue: WorldSanityIssue): string {
    const entity = formatEntityRef(issue.entity);
    const entityPart = entity ? ` ${entity}` : '';
    return `[${issue.severity}] ${issue.domain}/${issue.code}${entityPart} — ${issue.message}`;
}

export function formatWorldSanitySourceSummary(sources: WorkspaceSanitySources | undefined): string {
    if (!sources) { return 'sources=none'; }
    const parts: string[] = [];
    if (sources.vehicleState) { parts.push('vehicle'); }
    if (sources.settlementState) { parts.push('settlement'); }
    if (sources.gameRules) { parts.push('game_rules'); }
    if (sources.modProfile) { parts.push('mod_profile'); }
    if (typeof sources.modManifestCount === 'number' && sources.modManifestCount > 0) {
        parts.push(`mods=${sources.modManifestCount}`);
    }
    if (sources.vehicleBridgeMode) { parts.push('bridge_mode'); }
    return parts.length ? `sources=${parts.join(',')}` : 'sources=none';
}

export function formatWorldSanityReportLines(
    report: WorldSanityReport,
    sources?: WorkspaceSanitySources
): string[] {
    const lines: string[] = [];
    const summary = [
        '[WI5b] Workspace Sanity Check',
        `ok=${report.ok}`,
        `errors=${report.errorCount}`,
        `warnings=${report.warningCount}`,
        `info=${report.infoCount}`,
        `issues=${report.issueCount}`,
        report.truncated ? 'truncated=true' : 'truncated=false',
        formatWorldSanitySourceSummary(sources),
    ].join(' ');
    lines.push(summary);

    for (const issue of report.issues) {
        lines.push(formatIssueLine(issue));
        if (issue.recommendation) {
            lines.push(`  recommendation: ${issue.recommendation}`);
        }
        if (issue.related?.length) {
            const refs = issue.related.map((r) => formatEntityRef(r)).filter(Boolean).join(', ');
            if (refs) {
                lines.push(`  related: ${refs}`);
            }
        }
    }

    if (report.issueCount === 0) {
        lines.push('No semantic issues detected in supplied workspace data.');
    }

    return lines;
}
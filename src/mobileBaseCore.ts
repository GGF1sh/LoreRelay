// Mobile Base System MB1: pure link validation and prompt summaries (no vscode/fs/DOM).

import type { SettlementStateV1 } from './settlementCore';
import type { VehicleEntry, VehicleState } from './vehicleCore';
import { canVehicleAccessLocation, type LocationVehicleAccess } from './vehicleCore';

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export const MAX_MOBILE_BASE_PROMPT_LINES = 7;
export const MAX_MOBILE_BASE_PROMPT_CHARS = 180;
export const MAX_MOBILE_BASE_FACILITIES = 3;
export const MAX_MOBILE_BASE_PROBLEMS = 3;
export const MAX_MOBILE_BASE_CARRIED_NAMES = 4;
export const MAX_MOBILE_BASE_WARNINGS = 8;
export const MAX_MOBILE_BASE_PROMPT_BLOCK_CHARS = 1200;
export const MOBILE_BASE_OPS_NOT_WIRED_LINE =
    'Persistent mobile-base docking/travel requires mobileBaseOps (parse/apply gate not yet wired).';

export const VALID_MOBILE_BASE_MODES = [
    'crawler', 'landship', 'caravan', 'mobile_community', 'ship', 'airship', 'train',
    'spacecraft', 'walking_golem', 'nomad_camp', 'other',
] as const;
export type MobileBaseMode = (typeof VALID_MOBILE_BASE_MODES)[number];

export const VALID_MOBILE_BASE_LAYOUT_PROFILES = [
    'compact', 'deck', 'caravan', 'camp', 'crawler', 'train', 'ship', 'airship',
    'spacecraft', 'golem',
] as const;
export type MobileBaseLayoutProfile = (typeof VALID_MOBILE_BASE_LAYOUT_PROFILES)[number];

export const VALID_MOBILE_BASE_INTERIOR_ACCESS = [
    'open', 'crew_only', 'party_only', 'locked', 'damaged', 'unsafe',
] as const;
export type MobileBaseInteriorAccess = (typeof VALID_MOBILE_BASE_INTERIOR_ACCESS)[number];

export interface MobileBaseLink {
    settlementId: string;
    mode: MobileBaseMode;
    layoutProfile: MobileBaseLayoutProfile;
    homeLocationId?: string;
    dockedAtLocationId?: string;
    interiorAccess?: MobileBaseInteriorAccess;
}

export interface MobileBaseLinkResult {
    ok: boolean;
    isMobileBase: boolean;
    reasons: string[];
    warnings?: string[];
}

export interface MobileBasePromptOptions {
    locationAccess?: LocationVehicleAccess;
    /** Optional id→name map for hangar summary (avoids full fleet dump). */
    carriedVehicleNames?: Readonly<Record<string, string>>;
    maxLines?: number;
    maxFacilities?: number;
    maxProblems?: number;
}

function clampText(raw: unknown, max: number): string {
    if (typeof raw !== 'string') { return ''; }
    return raw.trim().replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').slice(0, max);
}

function asId(raw: unknown): string {
    if (typeof raw !== 'string') { return ''; }
    const id = raw.trim();
    return ID_RE.test(id) ? id : '';
}

function pickUnion<T extends string>(raw: unknown, valid: readonly T[], fallback: T): T {
    return typeof raw === 'string' && (valid as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

function clampPromptLine(line: string): string {
    const t = line.trim().replace(/\s+/g, ' ');
    return t.length <= MAX_MOBILE_BASE_PROMPT_CHARS ? t : `${t.slice(0, MAX_MOBILE_BASE_PROMPT_CHARS - 3)}...`;
}

export function parseMobileBaseLink(input: unknown): MobileBaseLink | undefined {
    if (!input || typeof input !== 'object' || Array.isArray(input)) { return undefined; }
    const r = input as Record<string, unknown>;
    const settlementId = asId(r.settlementId);
    if (!settlementId) { return undefined; }
    const link: MobileBaseLink = {
        settlementId,
        mode: pickUnion(r.mode, VALID_MOBILE_BASE_MODES, 'other'),
        layoutProfile: pickUnion(r.layoutProfile, VALID_MOBILE_BASE_LAYOUT_PROFILES, 'compact'),
    };
    const homeLocationId = asId(r.homeLocationId);
    if (homeLocationId) { link.homeLocationId = homeLocationId; }
    const dockedAtLocationId = asId(r.dockedAtLocationId);
    if (dockedAtLocationId) { link.dockedAtLocationId = dockedAtLocationId; }
    const interiorAccess = pickUnion(r.interiorAccess, VALID_MOBILE_BASE_INTERIOR_ACCESS, 'open');
    if (interiorAccess !== 'open') { link.interiorAccess = interiorAccess; }
    return link;
}

export function validateMobileBaseLink(
    vehicle: VehicleEntry | undefined,
    settlement: SettlementStateV1 | undefined
): MobileBaseLinkResult {
    const reasons: string[] = [];
    const warnings: string[] = [];

    if (!vehicle?.mobileBase) {
        return { ok: true, isMobileBase: false, reasons: ['not_a_mobile_base'] };
    }

    const rawLink = vehicle.mobileBase;
    const link = parseMobileBaseLink(rawLink);
    if (!link) {
        return {
            ok: false,
            isMobileBase: true,
            reasons: ['invalid_mobile_base_link'],
        };
    }

    if (!settlement) {
        return {
            ok: false,
            isMobileBase: true,
            reasons: ['missing_settlement_ledger'],
        };
    }

    if (link.settlementId !== settlement.settlementId) {
        return {
            ok: false,
            isMobileBase: true,
            reasons: [`settlement_id_mismatch:${link.settlementId}!=${settlement.settlementId}`],
        };
    }

    if (link.mode === 'caravan' || link.mode === 'mobile_community') {
        warnings.push('Caravan/mobile community is a social moving base, not one giant vehicle.');
    }

    if (link.interiorAccess === 'damaged' || link.interiorAccess === 'unsafe' || link.interiorAccess === 'locked') {
        warnings.push(`Interior access is ${link.interiorAccess}.`);
    }

    return {
        ok: true,
        isMobileBase: true,
        reasons: ['linked'],
        warnings: warnings.length ? warnings.slice(0, MAX_MOBILE_BASE_WARNINGS) : undefined,
    };
}

function listFacilities(settlement: SettlementStateV1, max: number): string[] {
    const facilities: string[] = [];
    for (const s of settlement.structures) {
        if (s.status === 'ruined' || s.status === 'disabled') { continue; }
        facilities.push(s.name);
        if (facilities.length >= max) { break; }
    }
    return facilities;
}

function listProblems(settlement: SettlementStateV1, max: number): string[] {
    const problems: string[] = [];
    for (const incident of settlement.incidents) {
        if (incident.resolved) { continue; }
        problems.push(clampText(incident.text, 64));
        if (problems.length >= max) { break; }
    }
    for (const s of settlement.structures) {
        if (s.status !== 'damaged' && s.status !== 'under_construction') { continue; }
        problems.push(`${s.name} (${s.status})`);
        if (problems.length >= max) { break; }
    }
    return problems.filter(Boolean);
}

function lowStockLabels(settlement: SettlementStateV1): string[] {
    const lows: string[] = [];
    for (const stock of settlement.stocks) {
        if (stock.amount <= 2) { lows.push(stock.id); }
        if (lows.length >= 3) { break; }
    }
    return lows;
}

export type MobileBaseRuleFlags = {
    enableVehicleSystem?: boolean;
    enableSettlementMode?: boolean;
    enableMobileBaseSystem?: boolean;
};

export function mobileBaseSystemEnabled(rules: MobileBaseRuleFlags | undefined): boolean {
    return rules?.enableVehicleSystem === true
        && rules?.enableSettlementMode === true
        && rules?.enableMobileBaseSystem === true;
}

/** Prefer activeVehicleId when it carries a mobileBase link; else first linked vehicle. */
export function resolveActiveMobileBaseVehicle(state: VehicleState | undefined): VehicleEntry | undefined {
    if (!state?.vehicles.length) { return undefined; }
    if (state.activeVehicleId) {
        const active = state.vehicles.find((v) => v.id === state.activeVehicleId);
        if (active?.mobileBase) { return active; }
    }
    return state.vehicles.find((v) => v.mobileBase);
}

export function buildCarriedVehicleNameMap(state: VehicleState | undefined): Record<string, string> {
    const map: Record<string, string> = {};
    for (const vehicle of state?.vehicles ?? []) {
        map[vehicle.id] = vehicle.name;
    }
    return map;
}

/** Prompt-safe mobile base summary; requires a validated vehicle+settlement pair. */
export function buildMobileBasePromptBlock(
    vehicle: VehicleEntry | undefined,
    settlement: SettlementStateV1 | undefined,
    enabled: boolean,
    options?: MobileBasePromptOptions
): string {
    if (!enabled || !vehicle || !settlement) { return ''; }

    const validation = validateMobileBaseLink(vehicle, settlement);
    if (!validation.isMobileBase || !validation.ok) { return ''; }

    const bodyLines = buildMobileBasePromptLines(vehicle, settlement, options);
    if (!bodyLines.length) { return ''; }

    const lines: string[] = [];
    if (validation.warnings?.length) {
        for (const warning of validation.warnings) {
            lines.push(clampPromptLine(warning));
        }
    }
    lines.push(...bodyLines);
    lines.push(MOBILE_BASE_OPS_NOT_WIRED_LINE);

    let block = lines.join('\n');
    if (block.length > MAX_MOBILE_BASE_PROMPT_BLOCK_CHARS) {
        block = `${block.slice(0, MAX_MOBILE_BASE_PROMPT_BLOCK_CHARS - 20)}...[truncated]`;
    }
    return block;
}

export function buildMobileBasePromptLines(
    vehicle: VehicleEntry,
    settlement: SettlementStateV1,
    options?: MobileBasePromptOptions
): string[] {
    const link = parseMobileBaseLink(vehicle.mobileBase);
    if (!link) { return []; }

    const maxLines = Math.min(MAX_MOBILE_BASE_PROMPT_LINES, options?.maxLines ?? MAX_MOBILE_BASE_PROMPT_LINES);
    const maxFacilities = Math.min(MAX_MOBILE_BASE_FACILITIES, options?.maxFacilities ?? MAX_MOBILE_BASE_FACILITIES);
    const maxProblems = Math.min(MAX_MOBILE_BASE_PROBLEMS, options?.maxProblems ?? MAX_MOBILE_BASE_PROBLEMS);
    const lines: string[] = [];

    const dockLoc = link.dockedAtLocationId
        || vehicle.parkedAt?.locationId
        || vehicle.locationId
        || settlement.locationId;
    const dockPart = dockLoc ? `, ${link.mode === 'ship' || link.mode === 'airship' ? 'docked' : 'parked'} at ${dockLoc}` : '';
    lines.push(clampPromptLine(`[Mobile Base] ${settlement.name} (${vehicle.name}, ${link.mode})${dockPart}.`));

    if (options?.locationAccess) {
        const access = canVehicleAccessLocation(vehicle, options.locationAccess);
        if (!access.allowed) {
            const park = access.parkingLocationId ? `; parking: ${access.parkingLocationId}` : '';
            lines.push(clampPromptLine(`Access: cannot enter (${access.reason})${park}.`));
        }
    } else if (vehicle.access.blockedBy?.length) {
        lines.push(clampPromptLine(
            `Access: exterior limits — ${vehicle.access.blockedBy.slice(0, 4).join(', ')}.`
        ));
    }

    const facilities = listFacilities(settlement, maxFacilities);
    if (facilities.length) {
        lines.push(clampPromptLine(`Interior: ${facilities.join(', ')}.`));
    }

    if (vehicle.hangar?.carriedVehicleIds?.length) {
        const nameMap = options?.carriedVehicleNames ?? {};
        const names = vehicle.hangar.carriedVehicleIds
            .slice(0, MAX_MOBILE_BASE_CARRIED_NAMES)
            .map((id) => clampText(nameMap[id] || id, 32))
            .join(', ');
        const used = vehicle.hangar.usedBays ?? vehicle.hangar.carriedVehicleIds.length;
        lines.push(clampPromptLine(`Hangar: carries ${used}/${vehicle.hangar.bayCapacity}: ${names}.`));
    }

    const lows = lowStockLabels(settlement);
    if (lows.length) {
        lines.push(clampPromptLine(`Stocks low: ${lows.join(', ')}.`));
    }

    const dur = vehicle.durability;
    const fuelPart = vehicle.resources && vehicle.resources.powerType !== 'none'
        ? `, ${vehicle.resources.powerType} ${vehicle.resources.current ?? 0}/${vehicle.resources.max ?? 0}`
        : '';
    lines.push(clampPromptLine(
        `Vehicle: HP ${dur.hp}/${dur.maxHp}, armor ${dur.armorBand}${fuelPart}${vehicle.combat ? `, threat ${vehicle.combat.threatBand}` : ''}.`
    ));

    const problems = listProblems(settlement, maxProblems);
    if (problems.length) {
        lines.push(clampPromptLine(`Current concern: ${problems.join('; ')}.`));
    }

    if (link.mode === 'caravan' || link.mode === 'mobile_community') {
        const people = settlement.residents.length + settlement.visitors.length + settlement.merchants.length;
        lines.push(clampPromptLine(`Community: ${people} attached travelers/groups on this route.`));
    }

    return lines.slice(0, maxLines);
}
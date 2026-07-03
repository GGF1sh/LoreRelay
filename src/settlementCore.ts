// Settlement Mode M1: parser, tick, prompt formatter, settlementOps stubs (no vscode/fs).

import { CHARACTER_ID_PATTERN } from './characterId';

export const SETTLEMENT_STATE_VERSION = 1 as const;
export const SETTLEMENT_LAYOUT_VERSION = 1 as const;

export const MAX_SETTLEMENT_STOCKS = 80;
export const MAX_SETTLEMENT_STRUCTURES = 80;
export const MAX_SETTLEMENT_RESIDENTS = 80;
export const MAX_SETTLEMENT_VISITORS = 40;
export const MAX_SETTLEMENT_MERCHANTS = 20;
export const MAX_SETTLEMENT_INCIDENTS = 80;
export const MAX_SETTLEMENT_NOTES = 40;
export const MAX_SETTLEMENT_OPS = 8;
export const MAX_SETTLEMENT_PROMPT_CHARS = 1600;
export const MAX_SETTLEMENT_NAME_CHARS = 120;
export const MAX_SETTLEMENT_TEXT_CHARS = 280;
export const MAX_SETTLEMENT_WARES = 12;
export const MAX_STOCK_AMOUNT = 99999;
export const MAX_STOCK_DELTA = 500;
export const SETTLEMENT_SCORE_MIN = 0;
export const SETTLEMENT_SCORE_MAX = 100;

export const VALID_SETTLEMENT_LAYER_IDS = ['z1', 'z0', 'z-1', 'z-2'] as const;
export type SettlementLayerId = (typeof VALID_SETTLEMENT_LAYER_IDS)[number];

export type SettlementStructureStatus =
    | 'intact'
    | 'damaged'
    | 'under_construction'
    | 'disabled'
    | 'ruined';

export type SettlementIncidentSeverity = 'info' | 'warning' | 'critical';

export interface SettlementStock {
    id: string;
    amount: number;
}

export interface SettlementStructure {
    id: string;
    name: string;
    layerId?: SettlementLayerId;
    status: SettlementStructureStatus;
    note?: string;
}

export interface SettlementResident {
    npcId: string;
    role?: string;
}

export interface SettlementVisitor {
    npcId: string;
    untilWorldTurn: number;
    purpose?: string;
}

export interface SettlementMerchant {
    npcId: string;
    untilWorldTurn: number;
    wares: string[];
}

export interface SettlementIncident {
    id: string;
    worldTurn: number;
    kind: string;
    severity: SettlementIncidentSeverity;
    resolved: boolean;
    text: string;
    untilWorldTurn?: number;
}

export interface SettlementStateV1 {
    version: typeof SETTLEMENT_STATE_VERSION;
    settlementId: string;
    name: string;
    worldTurn?: number;
    locationId?: string;
    morale?: number;
    safety?: number;
    stocks: SettlementStock[];
    structures: SettlementStructure[];
    residents: SettlementResident[];
    visitors: SettlementVisitor[];
    merchants: SettlementMerchant[];
    incidents: SettlementIncident[];
    notes?: string[];
    updatedAt?: string;
}

export interface SettlementZone {
    id: string;
    layerId: SettlementLayerId;
    label: string;
    x?: number;
    y?: number;
}

export interface SettlementMarker {
    id: string;
    layerId: SettlementLayerId;
    label: string;
    x?: number;
    y?: number;
}

export interface SettlementLayoutV1 {
    version: typeof SETTLEMENT_LAYOUT_VERSION;
    settlementId: string;
    layers: SettlementLayerId[];
    zones: SettlementZone[];
    markers: SettlementMarker[];
}

export const MAX_LAYOUT_ZONES = 40;
export const MAX_LAYOUT_MARKERS = 40;
export const MAX_LAYOUT_LAYERS = 4;

export type SettlementLayerExpansionProfile =
    | 'cellar'
    | 'waterworks'
    | 'shelter'
    | 'ruins'
    | 'roof'
    | 'watchtower'
    | 'generic';

export type SettlementOpType =
    | 'set_score'
    | 'adjust_stock'
    | 'add_incident'
    | 'resolve_incident'
    | 'add_visitor'
    | 'remove_visitor'
    | 'add_merchant'
    | 'remove_merchant'
    | 'add_structure_note'
    | 'expand_layer';

export interface SettlementOpBase {
    type: SettlementOpType;
}

export interface SetScoreOp extends SettlementOpBase {
    type: 'set_score';
    key: 'morale' | 'safety';
    value: number;
}

export interface AdjustStockOp extends SettlementOpBase {
    type: 'adjust_stock';
    stockId: string;
    delta: number;
    reason?: string;
}

export interface AddIncidentOp extends SettlementOpBase {
    type: 'add_incident';
    incident: {
        id: string;
        kind: string;
        severity: SettlementIncidentSeverity;
        text: string;
        worldTurn?: number;
    };
}

export interface ResolveIncidentOp extends SettlementOpBase {
    type: 'resolve_incident';
    incidentId: string;
}

export interface AddVisitorOp extends SettlementOpBase {
    type: 'add_visitor';
    npcId: string;
    untilWorldTurn: number;
    purpose?: string;
}

export interface RemoveVisitorOp extends SettlementOpBase {
    type: 'remove_visitor';
    npcId: string;
}

export interface AddMerchantOp extends SettlementOpBase {
    type: 'add_merchant';
    npcId: string;
    untilWorldTurn: number;
    wares?: string[];
}

export interface RemoveMerchantOp extends SettlementOpBase {
    type: 'remove_merchant';
    npcId: string;
}

export interface AddStructureNoteOp extends SettlementOpBase {
    type: 'add_structure_note';
    structureId: string;
    note: string;
}

export interface ExpandLayerOp extends SettlementOpBase {
    type: 'expand_layer';
    layerId: SettlementLayerId;
    reason?: string;
    profile?: SettlementLayerExpansionProfile;
    seed?: number;
}

export type SettlementOp =
    | SetScoreOp
    | AdjustStockOp
    | AddIncidentOp
    | ResolveIncidentOp
    | AddVisitorOp
    | RemoveVisitorOp
    | AddMerchantOp
    | RemoveMerchantOp
    | AddStructureNoteOp
    | ExpandLayerOp;

export const VALID_EXPANSION_PROFILES: readonly SettlementLayerExpansionProfile[] = [
    'cellar', 'waterworks', 'shelter', 'ruins', 'roof', 'watchtower', 'generic',
];

export const MAX_EXPANSION_REASON_CHARS = 120;

export const SETTLEMENT_STOCKS_NOT_SYNCED_LINE =
    'Settlement stocks are site supplies; campaign_resources.json tracks party/campaign resources separately — no automatic sync.';

const VALID_STRUCTURE_STATUSES = new Set<SettlementStructureStatus>([
    'intact', 'damaged', 'under_construction', 'disabled', 'ruined',
]);
const VALID_INCIDENT_SEVERITIES = new Set<SettlementIncidentSeverity>([
    'info', 'warning', 'critical',
]);
const VALID_OP_TYPES = new Set<SettlementOpType>([
    'set_score', 'adjust_stock', 'add_incident', 'resolve_incident',
    'add_visitor', 'remove_visitor', 'add_merchant', 'remove_merchant', 'add_structure_note',
    'expand_layer',
]);

const VALID_EXPANSION_PROFILE_SET = new Set<SettlementLayerExpansionProfile>(VALID_EXPANSION_PROFILES);

function asId(raw: unknown): string {
    if (typeof raw !== 'string') { return ''; }
    const id = raw.trim();
    return CHARACTER_ID_PATTERN.test(id) ? id : '';
}

function clampText(raw: unknown, max: number): string | undefined {
    if (typeof raw !== 'string') { return undefined; }
    const t = raw.trim().replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ');
    return t ? t.slice(0, max) : undefined;
}

function clampScore(raw: unknown): number | undefined {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) { return undefined; }
    return Math.max(SETTLEMENT_SCORE_MIN, Math.min(SETTLEMENT_SCORE_MAX, Math.round(raw)));
}

function clampStockAmount(raw: unknown): number | undefined {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) { return undefined; }
    return Math.min(MAX_STOCK_AMOUNT, Math.round(raw));
}

function clampWorldTurn(raw: unknown): number | undefined {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) { return undefined; }
    return Math.min(999999, Math.floor(raw));
}

function asLayerId(raw: unknown): SettlementLayerId | undefined {
    if (typeof raw !== 'string') { return undefined; }
    return (VALID_SETTLEMENT_LAYER_IDS as readonly string[]).includes(raw)
        ? (raw as SettlementLayerId)
        : undefined;
}

function parseStock(raw: unknown): SettlementStock | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const id = asId(r.id ?? r.stockId ?? r.resourceId);
    const amount = clampStockAmount(r.amount ?? r.qty ?? r.quantity);
    if (!id || amount === undefined) { return undefined; }
    return { id, amount };
}

function parseStructure(raw: unknown): SettlementStructure | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const id = asId(r.id);
    const name = clampText(r.name, MAX_SETTLEMENT_NAME_CHARS);
    const status = typeof r.status === 'string' && VALID_STRUCTURE_STATUSES.has(r.status as SettlementStructureStatus)
        ? (r.status as SettlementStructureStatus)
        : 'intact';
    if (!id || !name) { return undefined; }
    const out: SettlementStructure = { id, name, status };
    const layerId = asLayerId(r.layerId ?? r.layer);
    if (layerId) { out.layerId = layerId; }
    const note = clampText(r.note, MAX_SETTLEMENT_TEXT_CHARS);
    if (note) { out.note = note; }
    return out;
}

function parseResident(raw: unknown): SettlementResident | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const npcId = asId(r.npcId);
    if (!npcId) { return undefined; }
    const out: SettlementResident = { npcId };
    const role = clampText(r.role, 64);
    if (role) { out.role = role; }
    return out;
}

function parseVisitor(raw: unknown): SettlementVisitor | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const npcId = asId(r.npcId);
    const untilWorldTurn = clampWorldTurn(r.untilWorldTurn ?? r.untilDay);
    if (!npcId || untilWorldTurn === undefined) { return undefined; }
    const out: SettlementVisitor = { npcId, untilWorldTurn };
    const purpose = clampText(r.purpose, 64);
    if (purpose) { out.purpose = purpose; }
    return out;
}

function parseMerchant(raw: unknown): SettlementMerchant | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const npcId = asId(r.npcId);
    const untilWorldTurn = clampWorldTurn(r.untilWorldTurn ?? r.untilDay);
    if (!npcId || untilWorldTurn === undefined) { return undefined; }
    const wares: string[] = [];
    if (Array.isArray(r.wares)) {
        for (const w of r.wares) {
            const label = clampText(w, 48);
            if (label) { wares.push(label); }
            if (wares.length >= MAX_SETTLEMENT_WARES) { break; }
        }
    }
    return { npcId, untilWorldTurn, wares };
}

function parseIncident(raw: unknown): SettlementIncident | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const id = asId(r.id);
    const worldTurn = clampWorldTurn(r.worldTurn ?? r.day);
    const text = clampText(r.text, MAX_SETTLEMENT_TEXT_CHARS);
    const kind = clampText(r.kind, 64) ?? 'other';
    const severity = typeof r.severity === 'string' && VALID_INCIDENT_SEVERITIES.has(r.severity as SettlementIncidentSeverity)
        ? (r.severity as SettlementIncidentSeverity)
        : 'info';
    const resolved = r.resolved === true;
    if (!id || worldTurn === undefined || !text) { return undefined; }
    const out: SettlementIncident = { id, worldTurn, kind, severity, resolved, text };
    const untilWorldTurn = clampWorldTurn(r.untilWorldTurn);
    if (untilWorldTurn !== undefined) { out.untilWorldTurn = untilWorldTurn; }
    return out;
}

function capArray<T>(items: T[], max: number): T[] {
    return items.slice(0, max);
}

export function emptySettlementState(settlementId: string, name: string): SettlementStateV1 {
    return {
        version: SETTLEMENT_STATE_VERSION,
        settlementId,
        name: name.slice(0, MAX_SETTLEMENT_NAME_CHARS),
        stocks: [],
        structures: [],
        residents: [],
        visitors: [],
        merchants: [],
        incidents: [],
    };
}

export function parseSettlementState(raw: unknown): SettlementStateV1 | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    if (r.version !== SETTLEMENT_STATE_VERSION) { return undefined; }
    const settlementId = asId(r.settlementId);
    const name = clampText(r.name, MAX_SETTLEMENT_NAME_CHARS);
    if (!settlementId || !name) { return undefined; }

    const stockMap = new Map<string, number>();
    if (Array.isArray(r.stocks)) {
        for (const item of r.stocks) {
            const stock = parseStock(item);
            if (stock) { stockMap.set(stock.id, stock.amount); }
            if (stockMap.size >= MAX_SETTLEMENT_STOCKS) { break; }
        }
    }
    const stocks: SettlementStock[] = [...stockMap.entries()].map(([id, amount]) => ({ id, amount }));

    const rawStructures: SettlementStructure[] = [];
    if (Array.isArray(r.structures)) {
        for (const item of r.structures) {
            const structure = parseStructure(item);
            if (structure) { rawStructures.push(structure); }
            if (rawStructures.length >= MAX_SETTLEMENT_STRUCTURES) { break; }
        }
    }

    const rawResidents: SettlementResident[] = [];
    if (Array.isArray(r.residents)) {
        for (const item of r.residents) {
            const resident = parseResident(item);
            if (resident) { rawResidents.push(resident); }
            if (rawResidents.length >= MAX_SETTLEMENT_RESIDENTS) { break; }
        }
    }

    const rawVisitors: SettlementVisitor[] = [];
    if (Array.isArray(r.visitors)) {
        for (const item of r.visitors) {
            const visitor = parseVisitor(item);
            if (visitor) { rawVisitors.push(visitor); }
            if (rawVisitors.length >= MAX_SETTLEMENT_VISITORS) { break; }
        }
    }

    const rawMerchants: SettlementMerchant[] = [];
    if (Array.isArray(r.merchants)) {
        for (const item of r.merchants) {
            const merchant = parseMerchant(item);
            if (merchant) { rawMerchants.push(merchant); }
            if (rawMerchants.length >= MAX_SETTLEMENT_MERCHANTS) { break; }
        }
    }

    const rawIncidents: SettlementIncident[] = [];
    if (Array.isArray(r.incidents)) {
        for (const item of r.incidents) {
            const incident = parseIncident(item);
            if (incident) { rawIncidents.push(incident); }
            if (rawIncidents.length >= MAX_SETTLEMENT_INCIDENTS) { break; }
        }
    }

    const structures = dedupeByIdLastWins(rawStructures).slice(0, MAX_SETTLEMENT_STRUCTURES);
    const residents = dedupeByNpcIdLastWins(rawResidents).slice(0, MAX_SETTLEMENT_RESIDENTS);
    const visitors = dedupeByNpcIdLastWins(rawVisitors).slice(0, MAX_SETTLEMENT_VISITORS);
    const merchants = dedupeByNpcIdLastWins(rawMerchants).slice(0, MAX_SETTLEMENT_MERCHANTS);
    const incidents = dedupeByIdLastWins(rawIncidents).slice(0, MAX_SETTLEMENT_INCIDENTS);

    const notes: string[] = [];
    if (Array.isArray(r.notes)) {
        for (const item of r.notes) {
            const note = clampText(item, MAX_SETTLEMENT_TEXT_CHARS);
            if (note) { notes.push(note); }
            if (notes.length >= MAX_SETTLEMENT_NOTES) { break; }
        }
    }

    const out: SettlementStateV1 = {
        version: SETTLEMENT_STATE_VERSION,
        settlementId,
        name,
        stocks,
        structures,
        residents,
        visitors,
        merchants,
        incidents,
    };
    const worldTurn = clampWorldTurn(r.worldTurn);
    if (worldTurn !== undefined) { out.worldTurn = worldTurn; }
    const locationId = asId(r.locationId);
    if (locationId) { out.locationId = locationId; }
    const morale = clampScore(r.morale);
    if (morale !== undefined) { out.morale = morale; }
    const safety = clampScore(r.safety);
    if (safety !== undefined) { out.safety = safety; }
    if (notes.length) { out.notes = notes; }
    const updatedAt = clampText(r.updatedAt, 40);
    if (updatedAt) { out.updatedAt = updatedAt; }
    return out;
}

function parseZone(raw: unknown): SettlementZone | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    const id = asId(r.id);
    const layerId = asLayerId(r.layerId ?? r.layer);
    const label = clampText(r.label ?? r.name, MAX_SETTLEMENT_NAME_CHARS);
    if (!id || !layerId || !label) { return undefined; }
    const out: SettlementZone = { id, layerId, label };
    if (typeof r.x === 'number' && Number.isFinite(r.x)) { out.x = Math.round(r.x); }
    if (typeof r.y === 'number' && Number.isFinite(r.y)) { out.y = Math.round(r.y); }
    return out;
}

function parseMarker(raw: unknown): SettlementMarker | undefined {
    return parseZone(raw) as SettlementMarker | undefined;
}

function isValidLayerId(layerId: string): layerId is SettlementLayerId {
    return (VALID_SETTLEMENT_LAYER_IDS as readonly string[]).includes(layerId);
}

function sortSettlementLayerIds(layerIds: Iterable<SettlementLayerId>): SettlementLayerId[] {
    const set = new Set(layerIds);
    return VALID_SETTLEMENT_LAYER_IDS.filter((id) => set.has(id));
}

function dedupeByIdLastWins<T extends { id: string }>(items: readonly T[]): T[] {
    const map = new Map<string, T>();
    for (const item of items) {
        map.set(item.id, item);
    }
    return [...map.values()];
}

function dedupeByNpcIdLastWins<T extends { npcId: string }>(items: readonly T[]): T[] {
    const map = new Map<string, T>();
    for (const item of items) {
        map.set(item.npcId, item);
    }
    return [...map.values()];
}

export function deriveEffectiveSettlementLayers(
    layout: Pick<SettlementLayoutV1, 'layers' | 'zones' | 'markers'>
): SettlementLayerId[] {
    const set = new Set<SettlementLayerId>();
    for (const layerId of layout.layers) {
        if (isValidLayerId(layerId)) { set.add(layerId); }
    }
    for (const zone of layout.zones) {
        if (isValidLayerId(zone.layerId)) { set.add(zone.layerId); }
    }
    for (const marker of layout.markers) {
        if (isValidLayerId(marker.layerId)) { set.add(marker.layerId); }
    }
    const ordered = sortSettlementLayerIds(set);
    if (!ordered.length) { return ['z0']; }
    return ordered.slice(0, MAX_LAYOUT_LAYERS);
}

export function parseSettlementLayout(raw: unknown): SettlementLayoutV1 | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    if (r.version !== SETTLEMENT_LAYOUT_VERSION) { return undefined; }
    const settlementId = asId(r.settlementId);
    if (!settlementId) { return undefined; }

    const layers: SettlementLayerId[] = [];
    if (Array.isArray(r.layers)) {
        for (const item of r.layers) {
            const layerId = asLayerId(item);
            if (layerId && !layers.includes(layerId)) { layers.push(layerId); }
            if (layers.length >= MAX_LAYOUT_LAYERS) { break; }
        }
    }

    const rawZones: SettlementZone[] = [];
    if (Array.isArray(r.zones)) {
        for (const item of r.zones) {
            const zone = parseZone(item);
            if (zone) { rawZones.push(zone); }
            if (rawZones.length >= MAX_LAYOUT_ZONES) { break; }
        }
    }

    const rawMarkers: SettlementMarker[] = [];
    if (Array.isArray(r.markers)) {
        for (const item of r.markers) {
            const marker = parseMarker(item);
            if (marker) { rawMarkers.push(marker); }
            if (rawMarkers.length >= MAX_LAYOUT_MARKERS) { break; }
        }
    }

    const zones = dedupeByIdLastWins(rawZones).slice(0, MAX_LAYOUT_ZONES);
    const markers = dedupeByIdLastWins(rawMarkers).slice(0, MAX_LAYOUT_MARKERS);
    const effectiveLayers = deriveEffectiveSettlementLayers({ layers, zones, markers });

    return {
        version: SETTLEMENT_LAYOUT_VERSION,
        settlementId,
        layers: effectiveLayers,
        zones,
        markers,
    };
}

function parseSetScoreOp(r: Record<string, unknown>): SetScoreOp | undefined {
    if (r.type !== 'set_score') { return undefined; }
    const key = r.key === 'morale' || r.key === 'safety' ? r.key : undefined;
    const value = clampScore(r.value);
    if (!key || value === undefined) { return undefined; }
    return { type: 'set_score', key, value };
}

function parseAdjustStockOp(r: Record<string, unknown>): AdjustStockOp | undefined {
    if (r.type !== 'adjust_stock') { return undefined; }
    const stockId = asId(r.stockId ?? r.resourceId);
    if (!stockId || typeof r.delta !== 'number' || !Number.isFinite(r.delta)) { return undefined; }
    const delta = Math.max(-MAX_STOCK_DELTA, Math.min(MAX_STOCK_DELTA, Math.round(r.delta)));
    const out: AdjustStockOp = { type: 'adjust_stock', stockId, delta };
    const reason = clampText(r.reason, 120);
    if (reason) { out.reason = reason; }
    return out;
}

function parseAddIncidentOp(r: Record<string, unknown>): AddIncidentOp | undefined {
    if (r.type !== 'add_incident') { return undefined; }
    const incidentRaw = r.incident;
    if (!incidentRaw || typeof incidentRaw !== 'object' || Array.isArray(incidentRaw)) { return undefined; }
    const inc = incidentRaw as Record<string, unknown>;
    const id = asId(inc.id);
    const text = clampText(inc.text, MAX_SETTLEMENT_TEXT_CHARS);
    const kind = clampText(inc.kind, 64) ?? 'other';
    const severity = typeof inc.severity === 'string' && VALID_INCIDENT_SEVERITIES.has(inc.severity as SettlementIncidentSeverity)
        ? (inc.severity as SettlementIncidentSeverity)
        : 'info';
    if (!id || !text) { return undefined; }
    const incident: AddIncidentOp['incident'] = { id, kind, severity, text };
    const worldTurn = clampWorldTurn(inc.worldTurn);
    if (worldTurn !== undefined) { incident.worldTurn = worldTurn; }
    return { type: 'add_incident', incident };
}

function parseResolveIncidentOp(r: Record<string, unknown>): ResolveIncidentOp | undefined {
    if (r.type !== 'resolve_incident') { return undefined; }
    const incidentId = asId(r.incidentId);
    if (!incidentId) { return undefined; }
    return { type: 'resolve_incident', incidentId };
}

function parseAddVisitorOp(r: Record<string, unknown>): AddVisitorOp | undefined {
    if (r.type !== 'add_visitor') { return undefined; }
    const npcId = asId(r.npcId);
    const untilWorldTurn = clampWorldTurn(r.untilWorldTurn ?? r.untilDay);
    if (!npcId || untilWorldTurn === undefined) { return undefined; }
    const out: AddVisitorOp = { type: 'add_visitor', npcId, untilWorldTurn };
    const purpose = clampText(r.purpose, 64);
    if (purpose) { out.purpose = purpose; }
    return out;
}

function parseRemoveVisitorOp(r: Record<string, unknown>): RemoveVisitorOp | undefined {
    if (r.type !== 'remove_visitor') { return undefined; }
    const npcId = asId(r.npcId);
    if (!npcId) { return undefined; }
    return { type: 'remove_visitor', npcId };
}

function parseAddMerchantOp(r: Record<string, unknown>): AddMerchantOp | undefined {
    if (r.type !== 'add_merchant') { return undefined; }
    const npcId = asId(r.npcId);
    const untilWorldTurn = clampWorldTurn(r.untilWorldTurn ?? r.untilDay);
    if (!npcId || untilWorldTurn === undefined) { return undefined; }
    const out: AddMerchantOp = { type: 'add_merchant', npcId, untilWorldTurn };
    const wares: string[] = [];
    if (Array.isArray(r.wares)) {
        for (const w of r.wares) {
            const label = clampText(w, 48);
            if (label) { wares.push(label); }
            if (wares.length >= MAX_SETTLEMENT_WARES) { break; }
        }
    }
    if (wares.length) { out.wares = wares; }
    return out;
}

function parseRemoveMerchantOp(r: Record<string, unknown>): RemoveMerchantOp | undefined {
    if (r.type !== 'remove_merchant') { return undefined; }
    const npcId = asId(r.npcId);
    if (!npcId) { return undefined; }
    return { type: 'remove_merchant', npcId };
}

function parseAddStructureNoteOp(r: Record<string, unknown>): AddStructureNoteOp | undefined {
    if (r.type !== 'add_structure_note') { return undefined; }
    const structureId = asId(r.structureId);
    const note = clampText(r.note, MAX_SETTLEMENT_TEXT_CHARS);
    if (!structureId || !note) { return undefined; }
    return { type: 'add_structure_note', structureId, note };
}

function parseExpandLayerOp(r: Record<string, unknown>): ExpandLayerOp | undefined {
    if (r.type !== 'expand_layer') { return undefined; }
    const layerId = asLayerId(r.layerId ?? r.layer);
    if (!layerId) { return undefined; }
    const out: ExpandLayerOp = { type: 'expand_layer', layerId };
    const reason = clampText(r.reason, MAX_EXPANSION_REASON_CHARS);
    if (reason) { out.reason = reason; }
    const profileRaw = typeof r.profile === 'string' ? r.profile.trim() : '';
    if (profileRaw && VALID_EXPANSION_PROFILE_SET.has(profileRaw as SettlementLayerExpansionProfile)) {
        out.profile = profileRaw as SettlementLayerExpansionProfile;
    }
    if (typeof r.seed === 'number' && Number.isFinite(r.seed)) {
        out.seed = Math.floor(r.seed);
    }
    return out;
}

function parseSettlementOp(raw: unknown): SettlementOp | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { return undefined; }
    const r = raw as Record<string, unknown>;
    if (typeof r.type !== 'string' || !VALID_OP_TYPES.has(r.type as SettlementOpType)) { return undefined; }
    switch (r.type) {
        case 'set_score': return parseSetScoreOp(r);
        case 'adjust_stock': return parseAdjustStockOp(r);
        case 'add_incident': return parseAddIncidentOp(r);
        case 'resolve_incident': return parseResolveIncidentOp(r);
        case 'add_visitor': return parseAddVisitorOp(r);
        case 'remove_visitor': return parseRemoveVisitorOp(r);
        case 'add_merchant': return parseAddMerchantOp(r);
        case 'remove_merchant': return parseRemoveMerchantOp(r);
        case 'add_structure_note': return parseAddStructureNoteOp(r);
        case 'expand_layer': return parseExpandLayerOp(r);
        default: return undefined;
    }
}

/** Parser stub only — M1 does not apply ops to disk. */
export function parseSettlementOps(raw: unknown): SettlementOp[] {
    if (!Array.isArray(raw)) { return []; }
    const out: SettlementOp[] = [];
    for (const item of raw.slice(0, MAX_SETTLEMENT_OPS * 2)) {
        const op = parseSettlementOp(item);
        if (!op) { continue; }
        out.push(op);
        if (out.length >= MAX_SETTLEMENT_OPS) { break; }
    }
    return out;
}

export interface SettlementTickOptions {
    worldTurn: number;
    /** Deterministic per-tick stock drains (abstract units). */
    stockConsumption?: Array<{ stockId: string; amount: number }>;
}

function adjustStockList(stocks: SettlementStock[], stockId: string, delta: number): SettlementStock[] {
    const map = new Map(stocks.map((s) => [s.id, s.amount]));
    const before = map.get(stockId) ?? 0;
    map.set(stockId, Math.max(0, Math.min(MAX_STOCK_AMOUNT, before + delta)));
    return [...map.entries()].map(([id, amount]) => ({ id, amount }));
}

export function tickSettlementState(
    state: SettlementStateV1,
    opts: SettlementTickOptions
): SettlementStateV1 {
    const worldTurn = clampWorldTurn(opts.worldTurn) ?? 0;
    let stocks = [...state.stocks];
    for (const drain of opts.stockConsumption ?? []) {
        const stockId = asId(drain.stockId);
        const amount = typeof drain.amount === 'number' && Number.isFinite(drain.amount)
            ? Math.max(0, Math.round(drain.amount))
            : 0;
        if (!stockId || amount <= 0) { continue; }
        stocks = adjustStockList(stocks, stockId, -amount);
    }

    const visitors = state.visitors.filter((v) => v.untilWorldTurn > worldTurn);
    const merchants = state.merchants.filter((m) => m.untilWorldTurn > worldTurn);
    const incidents = state.incidents.filter((inc) => {
        if (inc.untilWorldTurn !== undefined && inc.untilWorldTurn <= worldTurn) { return false; }
        if (inc.resolved && inc.severity === 'info' && worldTurn - inc.worldTurn > 14) { return false; }
        return true;
    });

    let morale = state.morale;
    let safety = state.safety;
    const food = stocks.find((s) => s.id === 'food')?.amount ?? 0;
    if (food === 0 && morale !== undefined) {
        morale = clampScore(morale - 2);
    }

    return {
        ...state,
        worldTurn,
        stocks: capArray(stocks, MAX_SETTLEMENT_STOCKS),
        visitors: capArray(visitors, MAX_SETTLEMENT_VISITORS),
        merchants: capArray(merchants, MAX_SETTLEMENT_MERCHANTS),
        incidents: capArray(incidents, MAX_SETTLEMENT_INCIDENTS),
        morale,
        safety: safety !== undefined ? clampScore(safety) : safety,
    };
}

function formatStockLine(stock: SettlementStock): string {
    const warn = stock.amount === 0 ? ' (OUT)' : stock.amount <= 2 ? ' (low)' : '';
    return `- ${stock.id}: ${stock.amount}${warn}`;
}

/** Prompt-safe settlement summary; pass enabled=false or omit state to emit nothing. */
export function buildSettlementPromptBlock(
    state: SettlementStateV1 | undefined,
    enabled: boolean
): string {
    if (!enabled || !state) { return ''; }

    const lines: string[] = [
        '[Settlement]',
        `Site: ${state.name} (${state.settlementId})`,
    ];
    if (state.locationId) { lines.push(`Location: ${state.locationId}`); }
    if (state.worldTurn !== undefined) { lines.push(`World turn: ${state.worldTurn}`); }

    const scoreParts: string[] = [];
    if (state.morale !== undefined) { scoreParts.push(`morale ${state.morale}`); }
    if (state.safety !== undefined) { scoreParts.push(`safety ${state.safety}`); }
    if (scoreParts.length) { lines.push(`Scores: ${scoreParts.join(', ')}.`); }

    if (state.stocks.length) {
        lines.push('Stocks:');
        for (const stock of state.stocks.slice(0, 12)) {
            lines.push(formatStockLine(stock));
        }
        if (state.stocks.length > 12) {
            lines.push(`- ... +${state.stocks.length - 12} more`);
        }
    }

    const notableStructures = state.structures
        .filter((s) => s.status !== 'intact')
        .slice(0, 6);
    if (notableStructures.length) {
        lines.push('Notable structures:');
        for (const s of notableStructures) {
            lines.push(`- ${s.name} (${s.status})`);
        }
    } else if (state.structures.length) {
        lines.push(`Structures: ${state.structures.length} tracked (all intact).`);
    }

    if (state.visitors.length) {
        lines.push('Visitors:');
        for (const v of state.visitors.slice(0, 6)) {
            const purpose = v.purpose ? ` — ${v.purpose}` : '';
            lines.push(`- ${v.npcId} until turn ${v.untilWorldTurn}${purpose}`);
        }
    }

    if (state.merchants.length) {
        lines.push('Merchants:');
        for (const m of state.merchants.slice(0, 4)) {
            const wares = m.wares.length ? ` (${m.wares.slice(0, 3).join(', ')})` : '';
            lines.push(`- ${m.npcId} until turn ${m.untilWorldTurn}${wares}`);
        }
    }

    const openIncidents = state.incidents.filter((i) => !i.resolved).slice(0, 6);
    if (openIncidents.length) {
        lines.push('Unresolved incidents:');
        for (const inc of openIncidents) {
            lines.push(`- [${inc.severity}] ${inc.text}`);
        }
    }

    lines.push(SETTLEMENT_STOCKS_NOT_SYNCED_LINE);
    lines.push('Persistent settlement layer expansion requires turn_result.settlementOps.expand_layer (applied to settlement_layout.json when Settlement Mode is ON). Other settlementOps remain parse-only stubs.');

    let block = lines.join('\n');
    if (block.length > MAX_SETTLEMENT_PROMPT_CHARS) {
        block = `${block.slice(0, MAX_SETTLEMENT_PROMPT_CHARS - 20)}...[truncated]`;
    }
    return block;
}

export function settlementModeEnabled(rules: { enableSettlementMode?: boolean } | undefined): boolean {
    return rules?.enableSettlementMode === true;
}
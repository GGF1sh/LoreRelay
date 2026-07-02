// Debug sandbox scenario: deterministic natural-language command parsing (no vscode/fs).
// Active only when scenario.json meta.tags includes "debug".

import type { CartographyRevealInput } from './cartographyRevealCore';
import type { NpcMemoryUpdate } from './npcRegistryCore';
import type { RevealStrength } from './cartographyRevealCore';
import type { StatePatchOp } from './types/TurnResult';
import { parseNarrativeTimePassage } from './narrativeTimePassageCore';

export const DEBUG_SCENARIO_TAG = 'debug';

export interface DebugNpcInfo {
    id: string;
    name: string;
    trust: number;
    romance: number;
    fear: number;
}

export interface DebugRegionInfo {
    id: string;
    name: string;
}

export interface DebugLocationInfo {
    id: string;
    name: string;
}

export interface DebugHpInfo {
    current: number;
    max: number;
}

export interface DebugCommandContext {
    npcs: DebugNpcInfo[];
    regions: DebugRegionInfo[];
    locations: DebugLocationInfo[];
    worldTurn: number;
    discoveredRegionIds: string[];
    rumoredRegionIds: string[];
    currentLocationId?: string;
    hp?: DebugHpInfo;
}

export type DebugCommandKind =
    | 'help'
    | 'status'
    | 'trust_delta'
    | 'trust_set'
    | 'romance_delta'
    | 'romance_set'
    | 'fear_delta'
    | 'fear_set'
    | 'hp_delta'
    | 'hp_set'
    | 'hp_full'
    | 'location_set'
    | 'grant_map_item'
    | 'reveal_all'
    | 'reveal_region'
    | 'narrative_rest'
    | 'narrative_travel'
    | 'world_sim'
    | 'market_price_multiplier';

export interface DebugParsedCommand {
    kind: DebugCommandKind;
    npcIds?: string[];
    trustDelta?: number;
    trustValue?: number;
    romanceDelta?: number;
    romanceValue?: number;
    fearDelta?: number;
    fearValue?: number;
    hpDelta?: number;
    hpValue?: number;
    locationId?: string;
    mapItemId?: string;
    mapItemName?: string;
    regionId?: string;
    revealStrength?: RevealStrength;
    worldSimSteps?: number;
    healHp?: boolean;
    marketLocationId?: string;
    marketCommodityId?: string;
    priceMultiplier?: number;
}

export interface DebugCommandOutcome {
    narration: string;
    npcUpdates?: NpcMemoryUpdate[];
    cartographyReveal?: CartographyRevealInput;
    worldSimSteps?: number;
    statePatch?: StatePatchOp[];
    options?: string[];
    marketPriceOps?: Array<{ locationId: string; commodityId: string; multiplier: number }>;
}

export function isDebugScenarioPack(meta: { tags?: unknown } | undefined): boolean {
    return Array.isArray(meta?.tags) && (meta!.tags as unknown[]).includes(DEBUG_SCENARIO_TAG);
}

function normalizeInput(raw: string): string {
    return raw.trim().replace(/\s+/g, ' ');
}

function extractSteps(text: string): number | undefined {
    const m = /(\d+)\s*(?:ターン|ステップ|step|steps|turn|turns)/i.exec(text);
    if (m) {
        const n = parseInt(m[1], 10);
        return Number.isFinite(n) && n > 0 ? n : undefined;
    }
    if (/時間を進め|時間経過|時間を送|advance\s+time|pass\s+time/i.test(text)) {
        return 1;
    }
    return undefined;
}

function isHelpRequest(text: string): boolean {
    return /^(ヘルプ|help|\?|使い方|コマンド一覧|commands?)$/i.test(text)
        || /何ができる|できること|どう使う/.test(text);
}

function isStatusRequest(text: string): boolean {
    return /^(状態|status|現状|ステータス|状況)$/i.test(text)
        || /今の状態|現在の状態/.test(text);
}

function isWorldSimRequest(text: string): boolean {
    return extractSteps(text) !== undefined
        || /ターン経過|ターンを進|世界を進|世界シミュ|シミュ進/i.test(text);
}

function isFogRequest(text: string): boolean {
    return /霧|フォグ|fog|地図|map|開示|晴ら|発見|reveal|discover|噂|rumor/i.test(text);
}

function isTrustRequest(text: string): boolean {
    return /好感|信頼|trust|favor|親密度/i.test(text);
}

function isRomanceRequest(text: string): boolean {
    return /ロマンス|romance|恋愛|恋/i.test(text);
}

function isFearRequest(text: string): boolean {
    return /恐怖|fear|恐れ/i.test(text);
}

function isHpRequest(text: string): boolean {
    return /\bhp\b|体力|ヒットポイント|ライフ/i.test(text) || /全回復|回復して/i.test(text);
}

function isLocationRequest(text: string): boolean {
    return /移動|移す|テレポート|warp|go\s+to|現在地/i.test(text);
}

function isMapItemRequest(text: string): boolean {
    return /地図アイテム|地図を渡|地図を入手|map\s*item|古い.*地図/i.test(text);
}

function resolveNpcIds(text: string, ctx: DebugCommandContext): string[] | undefined {
    const lower = text.toLowerCase();
    if (/全員|全部|すべて|all\s*npc/i.test(text)) {
        return ctx.npcs.map((n) => n.id);
    }

    const matched: string[] = [];
    for (const npc of ctx.npcs) {
        const nameLower = npc.name.toLowerCase();
        const idLower = npc.id.toLowerCase();
        if (lower.includes(nameLower) || lower.includes(idLower)) {
            matched.push(npc.id);
            continue;
        }
        const parts = npc.name.split(/[\s・]/).filter((p) => p.length >= 2);
        for (const part of parts) {
            if (lower.includes(part.toLowerCase())) {
                matched.push(npc.id);
                break;
            }
        }
        if (matched.includes(npc.id)) {
            continue;
        }
        for (let len = Math.min(8, npc.name.length); len >= 2; len--) {
            const suffix = npc.name.slice(-len).toLowerCase();
            if (lower.includes(suffix)) {
                matched.push(npc.id);
                break;
            }
        }
    }
    if (matched.length > 0) {
        return [...new Set(matched)];
    }

    if (ctx.npcs.length === 1 && (isTrustRequest(text) || isRomanceRequest(text) || isFearRequest(text))) {
        return [ctx.npcs[0].id];
    }

    return undefined;
}

function resolveRegionId(text: string, ctx: DebugCommandContext): string | undefined {
    const lower = text.toLowerCase();
    for (const region of ctx.regions) {
        if (lower.includes(region.id.toLowerCase()) || lower.includes(region.name.toLowerCase())) {
            return region.id;
        }
    }
    for (const region of ctx.regions) {
        const first = region.name.split(/[\s・]/)[0]?.toLowerCase();
        if (first && first.length >= 2 && lower.includes(first)) {
            return region.id;
        }
    }
    return undefined;
}

function resolveLocationId(text: string, ctx: DebugCommandContext): string | undefined {
    const lower = text.toLowerCase();
    for (const loc of ctx.locations) {
        if (lower.includes(loc.id.toLowerCase()) || lower.includes(loc.name.toLowerCase())) {
            return loc.id;
        }
    }
    for (const loc of ctx.locations) {
        for (let len = Math.min(8, loc.name.length); len >= 2; len--) {
            const suffix = loc.name.slice(-len).toLowerCase();
            if (lower.includes(suffix)) {
                return loc.id;
            }
        }
    }
    return undefined;
}

function parseDispositionCommand(
    text: string,
    ctx: DebugCommandContext,
    field: 'trust' | 'romance' | 'fear'
): DebugParsedCommand | undefined {
    const isRequest = field === 'trust' ? isTrustRequest
        : field === 'romance' ? isRomanceRequest : isFearRequest;
    if (!isRequest(text)) {
        return undefined;
    }

    const npcIds = resolveNpcIds(text, ctx);
    if (!npcIds || npcIds.length === 0) {
        return undefined;
    }

    const setMatch = /(\d+)\s*に/.exec(text)
        ?? /(\d+)\s*(?:へ|to|=)/i.exec(text)
        ?? /(?:を|を)?\s*(\d+)\s*(?:に設定|にして|set)/i.exec(text);
    if (setMatch) {
        const value = parseInt(setMatch[1], 10);
        if (Number.isFinite(value)) {
            const kind = field === 'trust' ? 'trust_set'
                : field === 'romance' ? 'romance_set' : 'fear_set';
            return field === 'trust'
                ? { kind, npcIds, trustValue: value }
                : field === 'romance'
                    ? { kind, npcIds, romanceValue: value }
                    : { kind, npcIds, fearValue: value };
        }
    }

    const deltaMatch = /([+-]?\d+)/.exec(text);
    let delta = 0;
    if (deltaMatch) {
        delta = parseInt(deltaMatch[1], 10);
    } else if (/上げ|増|高め|raise|increase|up/i.test(text)) {
        delta = 10;
    } else if (/下げ|減|低め|lower|decrease|down/i.test(text)) {
        delta = -10;
    } else {
        return undefined;
    }

    if (!Number.isFinite(delta) || delta === 0) {
        return undefined;
    }

    const kind = field === 'trust' ? 'trust_delta'
        : field === 'romance' ? 'romance_delta' : 'fear_delta';
    return field === 'trust'
        ? { kind, npcIds, trustDelta: delta }
        : field === 'romance'
            ? { kind, npcIds, romanceDelta: delta }
            : { kind, npcIds, fearDelta: delta };
}

function parseHpCommand(text: string): DebugParsedCommand | undefined {
    if (!isHpRequest(text)) {
        return undefined;
    }
    if (/全回復|max|満タン|full/i.test(text)) {
        return { kind: 'hp_full' };
    }
    const setMatch = /(\d+)\s*に/.exec(text) ?? /hp\s*[=:]\s*(\d+)/i.exec(text);
    if (setMatch) {
        const value = parseInt(setMatch[1], 10);
        if (Number.isFinite(value)) {
            return { kind: 'hp_set', hpValue: value };
        }
    }
    const deltaMatch = /([+-]?\d+)/.exec(text);
    if (deltaMatch) {
        const delta = parseInt(deltaMatch[1], 10);
        if (Number.isFinite(delta) && delta !== 0) {
            return { kind: 'hp_delta', hpDelta: delta };
        }
    }
    if (/回復|heal|restore/i.test(text)) {
        return { kind: 'hp_delta', hpDelta: 10 };
    }
    return undefined;
}

function parseLocationCommand(text: string, ctx: DebugCommandContext): DebugParsedCommand | undefined {
    if (!isLocationRequest(text)) {
        return undefined;
    }
    const locationId = resolveLocationId(text, ctx);
    if (!locationId) {
        return undefined;
    }
    return { kind: 'location_set', locationId };
}

function parseMapItemCommand(text: string): DebugParsedCommand | undefined {
    if (!isMapItemRequest(text)) {
        return undefined;
    }
    const nameMatch = /「([^」]+)」/.exec(text) ?? /古い港の地図/.exec(text);
    const name = nameMatch ? (nameMatch[1] ?? nameMatch[0]) : '古い港の地図';
    return { kind: 'grant_map_item', mapItemId: 'debug_harbor_map', mapItemName: name };
}

function parseFogCommand(text: string, ctx: DebugCommandContext): DebugParsedCommand | undefined {
    if (!isFogRequest(text)) {
        return undefined;
    }

    if (/全部|すべて|全地域|all\s*region|reveal\s+all|晴らして|晴らす|解除/i.test(text)
        && !resolveRegionId(text, ctx)) {
        return { kind: 'reveal_all' };
    }

    const regionId = resolveRegionId(text, ctx);
    if (!regionId) {
        if (/全部|すべて|all/i.test(text)) {
            return { kind: 'reveal_all' };
        }
        return undefined;
    }

    const strength: RevealStrength = /噂|rumor/i.test(text) ? 'rumored' : 'discovered';
    return { kind: 'reveal_region', regionId, revealStrength: strength };
}

const COMMODITY_ALIASES: Record<string, string> = {
    wheat: 'wheat',
    小麦: 'wheat',
    steel: 'steel',
    鋼: 'steel',
    鋼鉄: 'steel',
    spice: 'spice',
    香辛料: 'spice',
    スパイス: 'spice',
};

function isMarketPriceRequest(text: string): boolean {
    return /相場|price/i.test(text)
        && (/倍|multiply|multiplier/i.test(text) || /\bx\s*\d/i.test(text) || /\d\s*x\b/i.test(text));
}

function resolveCommodityId(text: string): string | undefined {
    const lower = text.toLowerCase();
    for (const [alias, id] of Object.entries(COMMODITY_ALIASES)) {
        if (lower.includes(alias.toLowerCase())) {
            return id;
        }
    }
    return undefined;
}

function parseMarketPriceCommand(text: string, ctx: DebugCommandContext): DebugParsedCommand | undefined {
    if (!isMarketPriceRequest(text)) {
        return undefined;
    }
    const multMatch = /(\d+(?:\.\d+)?)\s*倍/i.exec(text)
        ?? /[x×]\s*(\d+(?:\.\d+)?)/i.exec(text)
        ?? /(\d+(?:\.\d+)?)\s*[x×]/i.exec(text);
    const multiplier = multMatch ? parseFloat(multMatch[1]) : undefined;
    if (!multiplier || !Number.isFinite(multiplier) || multiplier <= 0) {
        return undefined;
    }
    const commodityId = resolveCommodityId(text) ?? 'wheat';
    const locationId = resolveLocationId(text, ctx) ?? ctx.currentLocationId ?? ctx.locations[0]?.id;
    if (!locationId) {
        return undefined;
    }
    return {
        kind: 'market_price_multiplier',
        marketLocationId: locationId,
        marketCommodityId: commodityId,
        priceMultiplier: multiplier,
    };
}

function parseWorldSimCommand(text: string): DebugParsedCommand | undefined {
    if (!isWorldSimRequest(text)) {
        return undefined;
    }
    const steps = extractSteps(text) ?? 1;
    return { kind: 'world_sim', worldSimSteps: steps };
}

function parseNarrativeCommand(text: string, ctx: DebugCommandContext): DebugParsedCommand | undefined {
    const passage = parseNarrativeTimePassage(text, ctx.locations);
    if (!passage) {
        return undefined;
    }
    if (passage.kind === 'rest') {
        return {
            kind: 'narrative_rest',
            worldSimSteps: passage.steps,
            healHp: passage.healHp,
        };
    }
    return {
        kind: 'narrative_travel',
        worldSimSteps: passage.steps,
        locationId: passage.locationId,
        healHp: passage.healHp,
    };
}

/** Parse player input into a debug command, or null if not recognized. */
export function parseDebugCommand(input: string, ctx: DebugCommandContext): DebugParsedCommand | null {
    const text = normalizeInput(input);
    if (!text) {
        return null;
    }

    if (isHelpRequest(text)) {
        return { kind: 'help' };
    }
    if (isStatusRequest(text)) {
        return { kind: 'status' };
    }

    const narrative = parseNarrativeCommand(text, ctx);
    if (narrative) {
        return narrative;
    }

    const hp = parseHpCommand(text);
    if (hp) {
        return hp;
    }

    const loc = parseLocationCommand(text, ctx);
    if (loc) {
        return loc;
    }

    for (const field of ['romance', 'fear', 'trust'] as const) {
        const disp = parseDispositionCommand(text, ctx, field);
        if (disp) {
            return disp;
        }
    }

    const fog = parseFogCommand(text, ctx);
    if (fog) {
        return fog;
    }

    const mapItem = parseMapItemCommand(text);
    if (mapItem) {
        return mapItem;
    }

    const sim = parseWorldSimCommand(text);
    if (sim) {
        return sim;
    }

    const market = parseMarketPriceCommand(text, ctx);
    if (market) {
        return market;
    }

    return null;
}

function npcName(ctx: DebugCommandContext, id: string): string {
    return ctx.npcs.find((n) => n.id === id)?.name ?? id;
}

function regionLabel(ctx: DebugCommandContext, id: string): string {
    const r = ctx.regions.find((x) => x.id === id);
    return r ? `${r.name} (${r.id})` : id;
}

function locationLabel(ctx: DebugCommandContext, id: string): string {
    const l = ctx.locations.find((x) => x.id === id);
    return l ? `${l.name} (${l.id})` : id;
}

function clampHp(current: number, max: number, value: number): number {
    return Math.max(0, Math.min(max, Math.round(value)));
}

function buildDispositionUpdates(
    cmd: DebugParsedCommand,
    ctx: DebugCommandContext,
    field: 'playerTrust' | 'playerRomance' | 'playerFear',
    deltaKey: 'trustDelta' | 'romanceDelta' | 'fearDelta',
    valueKey: 'trustValue' | 'romanceValue' | 'fearValue',
    readValue: (n: DebugNpcInfo) => number
): { updates: NpcMemoryUpdate[]; summary: string } {
    const ids = cmd.npcIds ?? [];
    const isSet = cmd.kind.endsWith('_set');
    const updates: NpcMemoryUpdate[] = ids.map((npcId) => {
        const prev = ctx.npcs.find((n) => n.id === npcId);
        const prevVal = prev ? readValue(prev) : (field === 'playerTrust' ? 50 : 0);
        const delta = isSet
            ? ((cmd[valueKey] as number) ?? prevVal) - prevVal
            : (cmd[deltaKey] as number) ?? 0;
        return {
            npcId,
            dispositionDelta: { [field]: delta },
            newMemory: {
                turn: ctx.worldTurn,
                content: `[debug] ${field} ${isSet ? `set to ${cmd[valueKey]}` : `${delta >= 0 ? '+' : ''}${delta}`}`,
                emotionalWeight: delta >= 0 ? 'positive' : 'negative',
                tags: ['debug'],
            },
        };
    });
    const summary = ids.map((id) => {
        const prev = ctx.npcs.find((n) => n.id === id);
        const prevVal = prev ? readValue(prev) : (field === 'playerTrust' ? 50 : 0);
        const next = isSet
            ? clampHp(0, 100, (cmd[valueKey] as number) ?? prevVal)
            : clampHp(0, 100, prevVal + ((cmd[deltaKey] as number) ?? 0));
        return `${npcName(ctx, id)}: ${prevVal} → **${next}**`;
    }).join('\n');
    return { updates, summary };
}

export const DEBUG_QUICK_COMMANDS = [
    'ヘルプ',
    '状態',
    '宿で休む',
    'エルダの好感度を上げて',
    '地図の霧を晴らして',
    '3日かけてエルダの店へ旅する',
    'HPを全回復',
] as const;

export function buildHelpNarration(ctx: DebugCommandContext): string {
    const npcExamples = ctx.npcs.slice(0, 2).map((n) => n.name).join('、') || 'NPC名';
    const regionExamples = ctx.regions.slice(0, 2).map((r) => r.name).join('、') || '地域名';
    return [
        '**デバッグサンドボックス** — 言った通りに状態を動かせます（GM不要・即時反映）。',
        '',
        '**好感度 / 信頼 / ロマンス / 恐怖**',
        `・「${npcExamples}の好感度を上げて」 / 「ロマンスを+10」 / 「恐怖を下げて」`,
        '',
        '**HP・現在地**',
        '・「HPを全回復」 / 「HPを15に」 / 「エルダの店に移動」',
        '',
        '**地図の霧・アイテム**',
        '・「地図の霧を晴らして」 / 「市場通りを発見」 / 「古い港の地図を入手」',
        '',
        '**時間経過（物語層）**',
        '・「宿で休む」（+1ターン・HP回復） / 「3日かけてエルダの店へ旅する」',
        '・「5ターン経過」（世界シミュのみ）',
        '',
        '**Living World 相場（デバッグ）**',
        '・「小麦相場を2倍に」（現在地の市場 priceIndex を乗算）',
        '',
        `**地域例:** ${regionExamples}`,
        '・「状態」「ヘルプ」',
        '',
        '認識できない発言は通常のGMターンに回ります。',
    ].join('\n');
}

export function buildStatusNarration(ctx: DebugCommandContext): string {
    const lines: string[] = ['**現在のデバッグ状態**', ''];
    lines.push(`世界ターン: **${ctx.worldTurn}**`);
    if (ctx.currentLocationId) {
        lines.push(`現在地: **${locationLabel(ctx, ctx.currentLocationId)}**`);
    }
    if (ctx.hp) {
        lines.push(`HP: **${ctx.hp.current}/${ctx.hp.max}**`);
    }
    lines.push('');
    lines.push('**NPC**');
    if (ctx.npcs.length === 0) {
        lines.push('（npc_registry.json なし）');
    } else {
        for (const n of ctx.npcs) {
            lines.push(`・${n.name}: 信頼 **${n.trust}** / ロマンス **${n.romance}** / 恐怖 **${n.fear}**`);
        }
    }
    lines.push('');
    lines.push('**地図の霧**');
    if (ctx.discoveredRegionIds.length === 0 && ctx.rumoredRegionIds.length === 0) {
        lines.push('（未開示 — 現在地のみ、または未設定）');
    } else {
        if (ctx.discoveredRegionIds.length > 0) {
            lines.push(`発見済: ${ctx.discoveredRegionIds.map((id) => regionLabel(ctx, id)).join('、')}`);
        }
        if (ctx.rumoredRegionIds.length > 0) {
            lines.push(`噂: ${ctx.rumoredRegionIds.map((id) => regionLabel(ctx, id)).join('、')}`);
        }
    }
    return lines.join('\n');
}

export function executeDebugCommand(
    cmd: DebugParsedCommand,
    ctx: DebugCommandContext
): DebugCommandOutcome {
    switch (cmd.kind) {
        case 'help':
            return {
                narration: buildHelpNarration(ctx),
                options: [...DEBUG_QUICK_COMMANDS],
            };
        case 'status':
            return {
                narration: buildStatusNarration(ctx),
                options: ['ヘルプ', '宿で休む', '地図の霧を晴らして'],
            };
        case 'trust_delta':
        case 'trust_set': {
            const { updates, summary } = buildDispositionUpdates(
                cmd, ctx, 'playerTrust', 'trustDelta', 'trustValue', (n) => n.trust
            );
            return {
                narration: `信頼を調整しました。\n\n${summary}`,
                npcUpdates: updates,
                options: ['状態', '地図の霧を晴らして'],
            };
        }
        case 'romance_delta':
        case 'romance_set': {
            const { updates, summary } = buildDispositionUpdates(
                cmd, ctx, 'playerRomance', 'romanceDelta', 'romanceValue', (n) => n.romance
            );
            return {
                narration: `ロマンスを調整しました。\n\n${summary}`,
                npcUpdates: updates,
                options: ['状態'],
            };
        }
        case 'fear_delta':
        case 'fear_set': {
            const { updates, summary } = buildDispositionUpdates(
                cmd, ctx, 'playerFear', 'fearDelta', 'fearValue', (n) => n.fear
            );
            return {
                narration: `恐怖を調整しました。\n\n${summary}`,
                npcUpdates: updates,
                options: ['状態'],
            };
        }
        case 'hp_full': {
            const max = ctx.hp?.max ?? 20;
            return {
                narration: `HPを全回復しました: **${max}/${max}**`,
                statePatch: [
                    { op: 'replace', path: '/status/hp/current', value: max },
                    { op: 'replace', path: '/status/hp/max', value: max },
                ],
                options: ['状態', '宿で休む'],
            };
        }
        case 'hp_set': {
            const max = ctx.hp?.max ?? 20;
            const value = clampHp(0, max, cmd.hpValue ?? max);
            return {
                narration: `HPを設定しました: **${value}/${max}**`,
                statePatch: [{ op: 'replace', path: '/status/hp/current', value }],
                options: ['状態'],
            };
        }
        case 'hp_delta': {
            const max = ctx.hp?.max ?? 20;
            const cur = ctx.hp?.current ?? max;
            const value = clampHp(0, max, cur + (cmd.hpDelta ?? 0));
            return {
                narration: `HPを変更しました: ${cur} → **${value}**`,
                statePatch: [{ op: 'replace', path: '/status/hp/current', value }],
                options: ['状態'],
            };
        }
        case 'location_set': {
            const id = cmd.locationId!;
            return {
                narration: `現在地を **${locationLabel(ctx, id)}** に移動しました。`,
                statePatch: [{ op: 'replace', path: '/world/currentLocationId', value: id }],
                options: ['状態', '地図の霧を晴らして'],
            };
        }
        case 'grant_map_item': {
            const name = cmd.mapItemName ?? '古い港の地図';
            const id = cmd.mapItemId ?? 'debug_harbor_map';
            return {
                narration: `地図アイテムを入手しました: **${name}**`,
                cartographyReveal: {
                    grantItems: [{ id, name, kind: 'map' }],
                },
                options: ['状態', `${name}を広げて見る`],
            };
        }
        case 'reveal_all': {
            const regions = ctx.regions.map((r) => ({
                regionId: r.id,
                strength: 'discovered' as RevealStrength,
                source: 'debug-sandbox',
            }));
            const labels = ctx.regions.map((r) => regionLabel(ctx, r.id)).join('、');
            return {
                narration: `地図の霧を晴らしました。全地域を発見済みにしました。\n\n${labels}`,
                cartographyReveal: { regions },
                options: ['状態', '5ターン経過'],
            };
        }
        case 'reveal_region': {
            const id = cmd.regionId!;
            const strength = cmd.revealStrength ?? 'discovered';
            const label = regionLabel(ctx, id);
            const strengthJa = strength === 'rumored' ? '噂（弱い開示）' : '発見済み';
            return {
                narration: `地図を更新しました: **${label}** を${strengthJa}にしました。`,
                cartographyReveal: {
                    regions: [{ regionId: id, strength, source: 'debug-sandbox' }],
                },
                options: ['地図の霧を晴らして', '状態'],
            };
        }
        case 'narrative_rest': {
            const steps = cmd.worldSimSteps ?? 1;
            const max = ctx.hp?.max ?? 20;
            const patches: StatePatchOp[] = cmd.healHp
                ? [{ op: 'replace', path: '/status/hp/current', value: max }]
                : [];
            return {
                narration: `一晩休みました（世界 **+${steps}** ターン）。${cmd.healHp ? ' HPを全回復。' : ''}`,
                worldSimSteps: steps,
                statePatch: patches.length > 0 ? patches : undefined,
                options: ['状態', '宿で休む'],
            };
        }
        case 'narrative_travel': {
            const steps = cmd.worldSimSteps ?? 1;
            const patches: StatePatchOp[] = [];
            if (cmd.locationId) {
                patches.push({ op: 'replace', path: '/world/currentLocationId', value: cmd.locationId });
            }
            const dest = cmd.locationId ? locationLabel(ctx, cmd.locationId) : '目的地';
            return {
                narration: `**${steps}** 日の旅を経て **${dest}** に着きました。`,
                worldSimSteps: steps,
                statePatch: patches.length > 0 ? patches : undefined,
                options: ['状態', 'ヘルプ'],
            };
        }
        case 'world_sim': {
            const steps = cmd.worldSimSteps ?? 1;
            return {
                narration: `世界シミュを **${steps}** ステップ進めます（GM会話ターンは増えません）。`,
                worldSimSteps: steps,
                options: ['状態', 'ヘルプ'],
            };
        }
        case 'market_price_multiplier': {
            const loc = cmd.marketLocationId!;
            const commodity = cmd.marketCommodityId!;
            const mult = cmd.priceMultiplier ?? 1;
            return {
                narration: `相場デバッグ: **${locationLabel(ctx, loc)}** の **${commodity}** の priceIndex を **×${mult}** します。`,
                marketPriceOps: [{ locationId: loc, commodityId: commodity, multiplier: mult }],
                options: ['状態', 'ヘルプ'],
            };
        }
        default:
            return { narration: '未対応のデバッグコマンドです。' };
    }
}

export function computeNextTurnIdFromEntries(entries: unknown[]): string {
    if (!Array.isArray(entries) || entries.length === 0) {
        return 'turn-1';
    }
    const last = entries[entries.length - 1] as { id?: string };
    const lastId = last?.id ?? 'turn-0';
    const m = /turn-(\d+)$/.exec(lastId);
    if (m) {
        return `turn-${parseInt(m[1], 10) + 1}`;
    }
    return 'turn-1';
}

export function mergeDebugStatePatches(
    options?: string[],
    extra?: StatePatchOp[]
): StatePatchOp[] | undefined {
    const patches: StatePatchOp[] = [];
    if (extra && extra.length > 0) {
        patches.push(...extra);
    }
    if (options && options.length > 0) {
        patches.push({ op: 'replace', path: '/options', value: options });
    }
    return patches.length > 0 ? patches : undefined;
}
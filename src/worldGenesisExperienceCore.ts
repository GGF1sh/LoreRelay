import type { GameRules } from './gameRulesCore';
import type { WorldForge } from './worldForgeCore';

export const WORLD_GENESIS_FEATURES = ['commerce', 'reputation', 'encounters', 'npcAgency', 'relationships', 'simulation', 'domain', 'guild', 'settlement', 'vehicles'] as const;
export type WorldGenesisFeature = typeof WORLD_GENESIS_FEATURES[number];
export interface WorldGenesisExperience {
    version: 1;
    locale: 'en' | 'ja' | 'zh-CN' | 'zh-TW';
    features: Record<WorldGenesisFeature, boolean>;
}
/** Only these documented switches can cross the setup boundary. */
export function normalizeWorldGenesisExperience(raw: unknown): WorldGenesisExperience | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const r = raw as Record<string, unknown>;
    if (r.version !== 1 || !['en', 'ja', 'zh-CN', 'zh-TW'].includes(String(r.locale))) return undefined;
    if (!r.features || typeof r.features !== 'object' || Array.isArray(r.features)) return undefined;
    const f = r.features as Record<string, unknown>;
    if (WORLD_GENESIS_FEATURES.some(key => typeof f[key] !== 'boolean')) return undefined;
    return { version: 1, locale: r.locale as WorldGenesisExperience['locale'], features: Object.fromEntries(WORLD_GENESIS_FEATURES.map(key => [key, f[key]])) as WorldGenesisExperience['features'] };
}

export function worldGenesisRules(experience?: WorldGenesisExperience): Partial<GameRules> {
    if (!experience) return { enableWorldForge: true, enableNpcRegistry: true };
    const f = experience.features;
    return {
        enableWorldForge: true, enableNpcRegistry: true,
        enableCommerce: f.commerce, enableCommerceUi: f.commerce,
        enableFactionReputation: f.reputation, enableTravelEncounters: f.encounters,
        enableNpcAgency: f.npcAgency, enableNpcRelationships: f.relationships,
        enableEmergentSimulation: f.simulation, backgroundSimulation: f.simulation,
        enableDomainMode: f.domain, enableGuildMode: f.guild,
        enableSettlementMode: f.settlement, enableVehicleSystem: f.vehicles,
    };
}

/** Local naming revision 1. IDs, topology and gameplay numbers never change. */
export function localizeWorldGenesisNames(forge: WorldForge, experience?: WorldGenesisExperience): void {
    if (!experience) return;
    const hash = (text: string) => [...text].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0, 7);
    if (experience.locale === 'en') {
        forge.meta.worldName = `World ${hash(forge.meta.worldSeed || '').toString(36)}`;
        return;
    }
    const ja = experience.locale === 'ja';
    const traditional = experience.locale === 'zh-TW';
    const prefixes = ja ? ['銀月', '暁', '星見', '青葉', '霧', '白鳥', '紅蓮', '黄昏', '黒曜', '春風', '雪花', '天狼']
        : traditional ? ['銀月', '晨曦', '星辰', '青葉', '迷霧', '白鷺', '紅蓮', '暮光', '黑曜', '春風', '雪華', '天狼']
            : ['银月', '晨曦', '星辰', '青叶', '迷雾', '白鹭', '红莲', '暮光', '黑曜', '春风', '雪华', '天狼'];
    const suffixes: Record<string, string> = ja
        ? { wilderness: '平原', urban: '都市圏', dungeon: '迷宮', ruins: '遺跡', ocean: '海', mountains: '山脈', forest: 'の森', other: '辺境' }
        : traditional ? { wilderness: '平原', urban: '城域', dungeon: '迷宮', ruins: '遺跡', ocean: '海', mountains: '山脈', forest: '森林', other: '邊境' }
            : { wilderness: '平原', urban: '城区', dungeon: '迷宫', ruins: '遗迹', ocean: '海', mountains: '山脈', forest: '森林', other: '边境' };
    const names = ja ? ['アエラ', 'ブレン', 'クララ', 'ドーン', 'エラ', 'フェン', 'ガラ', 'ホルト', 'イーラ', 'ジェルド', 'ミラ', 'ソレン', 'リラ', 'レオン', 'ネッサ', 'カエデ', 'レン', 'ソラ', 'ユナ', 'アキ']
        : ['艾拉', '布伦', '克拉拉', '多恩', '伊拉', '芬恩', '加拉', '霍尔特', '伊娜', '杰德', '米拉', '索伦', '莉拉', '莱昂', '妮莎', '枫', '莲', '空', '优娜', '秋'];
    const offset = hash(forge.meta.worldSeed || '') % prefixes.length;
    const changes = new Map<string, string>();
    const rename = (item: { name: string }, name: string) => { changes.set(item.name, name); item.name = name; };
    forge.meta.worldName = `${prefixes[offset]}${ja ? 'の世界' : '世界'} · ${hash(forge.meta.worldSeed || '').toString(36).slice(0, 5)}`;
    forge.geography.regions.forEach((r, i) => rename(r, `${prefixes[(offset + i) % prefixes.length]}${suffixes[r.type]}`));
    const locations: Record<string, string> = ja ? { settlement: 'の里', dungeon: 'の迷宮', landmark: 'の塔', ruins: 'の遺構', wilderness: 'の野営地', other: 'の拠点' }
        : { settlement: '村', dungeon: '迷宮', landmark: '塔', ruins: '遺址', wilderness: '營地', other: '據點' };
    forge.geography.locations.forEach((l, i) => rename(l, `${prefixes[(offset + i) % prefixes.length]}${locations[l.type]}${i < prefixes.length ? '' : `・${Math.floor(i / prefixes.length) + 1}`}`));
    const groups = ja ? ['同盟', '商会', '騎士団', '評議会', '組合', '旅団'] : ['同盟', '商會', '騎士團', '議會', '公會', '旅團'];
    forge.factions.forEach((f, i) => rename(f, `${prefixes[(offset + i) % prefixes.length]}${groups[i % groups.length]}`));
    const npcOffset = hash(forge.meta.worldSeed || '') % names.length;
    forge.initialNpcs.forEach((n, i) => rename(n, names[(npcOffset + i) % names.length]));
    // Keep references in existing generated descriptions aligned with renamed entities.
    for (const row of [...forge.geography.regions, ...forge.geography.locations, ...forge.factions, ...forge.initialNpcs]) {
        if (row.description) for (const [oldName, name] of [...changes].sort((a, b) => b[0].length - a[0].length)) row.description = row.description.split(oldName).join(name);
    }
}

// Genre-agnostic campaign loop presets (pure, no vscode/fs dependency).

export type CampaignKitGenre =
    | 'generic'
    | 'fantasy'
    | 'postapocalypse'
    | 'space'
    | 'eastern_fantasy'
    | 'cyberpunk'
    | 'modern_occult'
    | 'horror';

export type DiscoveryKind =
    | 'material'
    | 'lore'
    | 'social'
    | 'route'
    | 'threat'
    | 'quest';

export interface CampaignKitLoopLabels {
    hubLabel: string;
    jobBoardLabel: string;
    siteLabel: string;
    lootLabel: string;
    appraisalLabel: string;
    serviceLabel: string;
    worldReactionLabel: string;
}

export interface CampaignKitTerm {
    id: string;
    name: string;
    description?: string;
}

export interface CampaignKitConfig {
    version: 1;
    id: string;
    name: string;
    genre: CampaignKitGenre;
    loop: CampaignKitLoopLabels;
    currencies: CampaignKitTerm[];
    resources: CampaignKitTerm[];
    siteTypes: CampaignKitTerm[];
    hazards: CampaignKitTerm[];
    services: CampaignKitTerm[];
    discoveryTypes: Array<CampaignKitTerm & { kind: DiscoveryKind }>;
    gmGuidance: string[];
}

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_TERMS = 24;
const MAX_GUIDANCE = 12;
const MAX_NAME = 80;
const MAX_DESC = 220;

export const DEFAULT_CAMPAIGN_LOOP: CampaignKitLoopLabels = {
    hubLabel: 'Hub',
    jobBoardLabel: 'Job/Rumor Board',
    siteLabel: 'Expedition Site',
    lootLabel: 'Findings',
    appraisalLabel: 'Appraisal',
    serviceLabel: 'Services',
    worldReactionLabel: 'World Reaction',
};

function clampText(raw: unknown, max: number): string {
    if (typeof raw !== 'string') { return ''; }
    return raw.trim().replace(/\s+/g, ' ').slice(0, max);
}

function asId(raw: unknown, fallback = ''): string {
    const id = clampText(raw, 64);
    return ID_RE.test(id) ? id : fallback;
}

function asGenre(raw: unknown): CampaignKitGenre {
    return raw === 'fantasy'
        || raw === 'postapocalypse'
        || raw === 'space'
        || raw === 'eastern_fantasy'
        || raw === 'cyberpunk'
        || raw === 'modern_occult'
        || raw === 'horror'
        || raw === 'generic'
        ? raw
        : 'generic';
}

function asDiscoveryKind(raw: unknown): DiscoveryKind {
    return raw === 'material'
        || raw === 'lore'
        || raw === 'social'
        || raw === 'route'
        || raw === 'threat'
        || raw === 'quest'
        ? raw
        : 'material';
}

function parseLoop(raw: unknown, fallback: CampaignKitLoopLabels): CampaignKitLoopLabels {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { ...fallback };
    }
    const r = raw as Record<string, unknown>;
    return {
        hubLabel: clampText(r.hubLabel, MAX_NAME) || fallback.hubLabel,
        jobBoardLabel: clampText(r.jobBoardLabel, MAX_NAME) || fallback.jobBoardLabel,
        siteLabel: clampText(r.siteLabel, MAX_NAME) || fallback.siteLabel,
        lootLabel: clampText(r.lootLabel, MAX_NAME) || fallback.lootLabel,
        appraisalLabel: clampText(r.appraisalLabel, MAX_NAME) || fallback.appraisalLabel,
        serviceLabel: clampText(r.serviceLabel, MAX_NAME) || fallback.serviceLabel,
        worldReactionLabel: clampText(r.worldReactionLabel, MAX_NAME) || fallback.worldReactionLabel,
    };
}

function parseTerm(raw: unknown): CampaignKitTerm | undefined {
    if (typeof raw === 'string') {
        const name = clampText(raw, MAX_NAME);
        const id = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
        return id ? { id, name } : undefined;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return undefined;
    }
    const r = raw as Record<string, unknown>;
    const id = asId(r.id);
    const name = clampText(r.name, MAX_NAME) || id;
    if (!id || !name) { return undefined; }
    const term: CampaignKitTerm = { id, name };
    const description = clampText(r.description, MAX_DESC);
    if (description) { term.description = description; }
    return term;
}

function parseTerms(raw: unknown): CampaignKitTerm[] {
    if (!Array.isArray(raw)) { return []; }
    const out: CampaignKitTerm[] = [];
    const seen = new Set<string>();
    for (const item of raw.slice(0, MAX_TERMS * 2)) {
        const term = parseTerm(item);
        if (!term || seen.has(term.id)) { continue; }
        out.push(term);
        seen.add(term.id);
        if (out.length >= MAX_TERMS) { break; }
    }
    return out;
}

function parseDiscovery(raw: unknown): (CampaignKitTerm & { kind: DiscoveryKind }) | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        const term = parseTerm(raw);
        return term ? { ...term, kind: 'material' } : undefined;
    }
    const term = parseTerm(raw);
    if (!term) { return undefined; }
    return { ...term, kind: asDiscoveryKind((raw as Record<string, unknown>).kind) };
}

function parseDiscoveries(raw: unknown): Array<CampaignKitTerm & { kind: DiscoveryKind }> {
    if (!Array.isArray(raw)) { return []; }
    const out: Array<CampaignKitTerm & { kind: DiscoveryKind }> = [];
    const seen = new Set<string>();
    for (const item of raw.slice(0, MAX_TERMS * 2)) {
        const term = parseDiscovery(item);
        if (!term || seen.has(term.id)) { continue; }
        out.push(term);
        seen.add(term.id);
        if (out.length >= MAX_TERMS) { break; }
    }
    return out;
}

function parseGuidance(raw: unknown): string[] {
    if (!Array.isArray(raw)) { return []; }
    return raw
        .map((item) => clampText(item, 240))
        .filter(Boolean)
        .slice(0, MAX_GUIDANCE);
}

function term(id: string, name: string, description?: string): CampaignKitTerm {
    return description ? { id, name, description } : { id, name };
}

function discovery(
    id: string,
    name: string,
    kind: DiscoveryKind,
    description?: string
): CampaignKitTerm & { kind: DiscoveryKind } {
    return { ...term(id, name, description), kind };
}

export const CAMPAIGN_KIT_PRESETS: Record<string, CampaignKitConfig> = {
    postapoc_scavenger: {
        version: 1,
        id: 'postapoc_scavenger',
        name: 'Post-Apocalyptic Salvager',
        genre: 'postapocalypse',
        loop: {
            hubLabel: 'Settlement / Scrapyard Town',
            jobBoardLabel: 'Notice Board / Rumor Table',
            siteLabel: 'Ruin / Bunker / Dead Zone',
            lootLabel: 'Salvage',
            appraisalLabel: 'Appraisal / Repair',
            serviceLabel: 'Market / Workshop / Clinic',
            worldReactionLabel: 'Faction and market response',
        },
        currencies: [term('credits', 'Credits'), term('barter', 'Barter goods')],
        resources: [term('food', 'Food'), term('water', 'Water'), term('fuel', 'Fuel'), term('ammo', 'Ammo'), term('medicine', 'Medicine'), term('parts', 'Parts')],
        siteTypes: [term('ruins', 'Urban ruins'), term('bunker', 'Old bunker'), term('subway', 'Subway tunnels'), term('factory', 'Dead factory'), term('settlement', 'Frontier settlement')],
        hazards: [term('radiation', 'Radiation'), term('raiders', 'Raiders'), term('collapse', 'Structural collapse'), term('mutants', 'Mutants'), term('drones', 'Old security drones')],
        services: [term('appraisal', 'Appraisal'), term('repair', 'Repair'), term('trade', 'Trade'), term('rumor', 'Rumor gathering'), term('training', 'Training')],
        discoveryTypes: [
            discovery('scrap', 'Scrap and spare parts', 'material'),
            discovery('old_tech', 'Old-world device', 'material'),
            discovery('records', 'Old records', 'lore'),
            discovery('contact', 'Useful contact', 'social'),
            discovery('route', 'Safe route', 'route'),
            discovery('threat', 'New hazard', 'threat'),
            discovery('job_seed', 'Job lead', 'quest'),
        ],
        gmGuidance: [
            'Treat scavenging as a loop: prepare in town, enter a dangerous site, bring back findings, appraise or repair them, then let markets and factions react.',
            'Keep final prices, cargo, and market stock canonical through existing Commerce systems when they are enabled.',
            'Unidentified finds should be described first, then clarified by appraisal, repair, research, or expert NPCs.',
        ],
    },
    classic_fantasy_guild: {
        version: 1,
        id: 'classic_fantasy_guild',
        name: 'Classic Fantasy Adventuring',
        genre: 'fantasy',
        loop: {
            hubLabel: 'Town / Adventurers Guild',
            jobBoardLabel: 'Guild Board / Tavern Rumors',
            siteLabel: 'Dungeon / Ruins / Wilds',
            lootLabel: 'Treasure and Materials',
            appraisalLabel: 'Appraisal / Enchantment',
            serviceLabel: 'Temple / Shop / Trainer',
            worldReactionLabel: 'Guild, realm, and monster response',
        },
        currencies: [term('gold', 'Gold'), term('favor', 'Favor')],
        resources: [term('rations', 'Rations'), term('torches', 'Torches'), term('mana', 'Mana'), term('potions', 'Potions'), term('materials', 'Materials')],
        siteTypes: [term('forest', 'Enchanted forest'), term('ruins', 'Ancient ruins'), term('cave', 'Cave'), term('tower', 'Wizard tower'), term('shrine', 'Forgotten shrine')],
        hazards: [term('monsters', 'Monsters'), term('curses', 'Curses'), term('traps', 'Traps'), term('weather', 'Harsh weather'), term('bandits', 'Bandits')],
        services: [term('appraisal', 'Appraisal'), term('enchanting', 'Enchanting'), term('healing', 'Healing'), term('trade', 'Trade'), term('rumor', 'Rumor gathering')],
        discoveryTypes: [
            discovery('treasure', 'Treasure', 'material'),
            discovery('relic', 'Relic', 'material'),
            discovery('legend', 'Legend fragment', 'lore'),
            discovery('ally', 'Potential ally', 'social'),
            discovery('shortcut', 'Shortcut', 'route'),
            discovery('curse', 'Curse or omen', 'threat'),
            discovery('quest_seed', 'Quest seed', 'quest'),
        ],
        gmGuidance: [
            'Frame adventures around guild/tavern prompts, expedition sites, recovered treasure, and follow-up consequences.',
            'Let appraisal, temples, and sages turn vague relics into useful hooks without contradicting established lore.',
        ],
    },
    space_frontier: {
        version: 1,
        id: 'space_frontier',
        name: 'Space Frontier Crew',
        genre: 'space',
        loop: {
            hubLabel: 'Starport / Ship',
            jobBoardLabel: 'Contracts / Signal Traffic',
            siteLabel: 'Planet / Derelict / Station',
            lootLabel: 'Cargo / Data / Artifacts',
            appraisalLabel: 'Scan / Decode / Repair',
            serviceLabel: 'Dockyard / Broker / Clinic',
            worldReactionLabel: 'Faction, route, and market response',
        },
        currencies: [term('credits', 'Credits'), term('shares', 'Crew shares')],
        resources: [term('fuel', 'Fuel'), term('oxygen', 'Oxygen'), term('parts', 'Ship parts'), term('data', 'Data'), term('medical', 'Medical supplies')],
        siteTypes: [term('planet', 'Frontier planet'), term('derelict', 'Derelict ship'), term('station', 'Station'), term('moon', 'Moon base'), term('anomaly', 'Anomaly zone')],
        hazards: [term('vacuum', 'Vacuum'), term('pirates', 'Pirates'), term('quarantine', 'Quarantine'), term('ai', 'Rogue AI'), term('radiation', 'Radiation')],
        services: [term('scan', 'Scan'), term('repair', 'Repair'), term('refuel', 'Refuel'), term('trade', 'Trade'), term('broker', 'Broker intel')],
        discoveryTypes: [
            discovery('cargo', 'Valuable cargo', 'material'),
            discovery('artifact', 'Alien artifact', 'material'),
            discovery('data', 'Data cache', 'lore'),
            discovery('contact', 'Contact', 'social'),
            discovery('route', 'Jump route', 'route'),
            discovery('hazard', 'Space hazard', 'threat'),
            discovery('contract', 'New contract', 'quest'),
        ],
        gmGuidance: [
            'Treat the ship/starport as the hub; missions should produce cargo, data, route intel, obligations, or faction heat.',
            'Use scans and decoding as the appraisal equivalent.',
        ],
    },
    eastern_fantasy: {
        version: 1,
        id: 'eastern_fantasy',
        name: 'Eastern Fantasy Journey',
        genre: 'eastern_fantasy',
        loop: {
            hubLabel: 'Inn Town / Sect Hall',
            jobBoardLabel: 'Magistrate Notice / Sect Request',
            siteLabel: 'Spirit Mountain / Old Battlefield / Shrine',
            lootLabel: 'Relics and Spirit Materials',
            appraisalLabel: 'Divination / Appraisal',
            serviceLabel: 'Tea House / Healer / Smith',
            worldReactionLabel: 'Clan, sect, and court response',
        },
        currencies: [term('silver', 'Silver'), term('merit', 'Merit')],
        resources: [term('rice', 'Rice'), term('medicine', 'Medicine'), term('talismans', 'Talismans'), term('spirit_stones', 'Spirit stones'), term('herbs', 'Herbs')],
        siteTypes: [term('shrine', 'Shrine'), term('mountain', 'Spirit mountain'), term('battlefield', 'Old battlefield'), term('market', 'Market town'), term('sect', 'Sect territory')],
        hazards: [term('spirits', 'Restless spirits'), term('bandits', 'Bandits'), term('curses', 'Curses'), term('court_intrigue', 'Court intrigue'), term('rival_sect', 'Rival sect')],
        services: [term('divination', 'Divination'), term('appraisal', 'Appraisal'), term('healing', 'Healing'), term('trade', 'Trade'), term('mediation', 'Mediation')],
        discoveryTypes: [
            discovery('relic', 'Relic', 'material'),
            discovery('herb', 'Rare herb', 'material'),
            discovery('scripture', 'Scripture fragment', 'lore'),
            discovery('patron', 'Patron or sworn contact', 'social'),
            discovery('path', 'Hidden path', 'route'),
            discovery('omen', 'Omen or curse', 'threat'),
            discovery('request', 'Request seed', 'quest'),
        ],
        gmGuidance: [
            'Use social standing, favors, sect rules, and local custom as much as combat.',
            'Treat divination and appraisal as ways to reveal meaning without immediately making new facts irreversible.',
        ],
    },
    cyberpunk_courier: {
        version: 1,
        id: 'cyberpunk_courier',
        name: 'Cyberpunk Courier',
        genre: 'cyberpunk',
        loop: {
            hubLabel: 'Safehouse / Night Market',
            jobBoardLabel: 'Fixer Feed / Encrypted Rumors',
            siteLabel: 'Corporate Site / Back Alley / Data Vault',
            lootLabel: 'Paydata and Hardware',
            appraisalLabel: 'Decrypt / Fence / Mod',
            serviceLabel: 'Ripperdoc / Fixer / Black Market',
            worldReactionLabel: 'Heat, reputation, and corporate response',
        },
        currencies: [term('credits', 'Credits'), term('favors', 'Favors')],
        resources: [term('ammo', 'Ammo'), term('battery', 'Battery'), term('icebreakers', 'ICEbreakers'), term('meds', 'Meds'), term('parts', 'Parts')],
        siteTypes: [term('corp_lab', 'Corporate lab'), term('data_vault', 'Data vault'), term('club', 'Club'), term('slum', 'Slum block'), term('arcology', 'Arcology')],
        hazards: [term('security', 'Security'), term('black_ice', 'Black ICE'), term('gangs', 'Gangs'), term('surveillance', 'Surveillance'), term('betrayal', 'Betrayal')],
        services: [term('decrypt', 'Decrypt'), term('mod', 'Modify gear'), term('heal', 'Medical patch-up'), term('fence', 'Fence goods'), term('intel', 'Buy intel')],
        discoveryTypes: [
            discovery('paydata', 'Paydata', 'material'),
            discovery('hardware', 'Hardware', 'material'),
            discovery('secret', 'Corporate secret', 'lore'),
            discovery('contact', 'Street contact', 'social'),
            discovery('access', 'Access route', 'route'),
            discovery('heat', 'Heat or threat', 'threat'),
            discovery('gig', 'Gig lead', 'quest'),
        ],
        gmGuidance: [
            'Keep jobs grounded in risk, heat, contacts, leverage, and consequences.',
            'Treat decryption and fencing as the appraisal/sale loop.',
        ],
    },
};

export const DEFAULT_CAMPAIGN_KIT_ID = 'classic_fantasy_guild';

export const CAMPAIGN_KIT_PRESET_IDS = Object.freeze(
    Object.keys(CAMPAIGN_KIT_PRESETS)
) as readonly string[];

export function listCampaignKitPresetIds(): readonly string[] {
    return CAMPAIGN_KIT_PRESET_IDS;
}

export function hasCampaignKitPreset(id: unknown): boolean {
    const key = asId(id);
    return Boolean(key && CAMPAIGN_KIT_PRESETS[key]);
}

export function inferCampaignKitIdFromTheme(theme: unknown): string {
    const t = clampText(theme, 120).toLowerCase();
    if (!t) { return DEFAULT_CAMPAIGN_KIT_ID; }
    // Space/sci before post-apoc — avoid "space ruins" matching bare `ruin`.
    if (/(space|sci|star|planet|ship|frontier|colony|galaxy)/.test(t)) { return 'space_frontier'; }
    if (/(post|apoc|waste|scav|zombie|fallout)/.test(t) || /\bruins?\b/.test(t)) { return 'postapoc_scavenger'; }
    if (/(\u548c\u98a8|\u4e2d\u83ef|\u6b66\u4fa0|\u4ed9\u4fa0|\u4f8d|\u9670\u967d)/.test(t)) { return 'eastern_fantasy'; }
    if (/(wuxia|xianxia|eastern|oriental|japan|china|samurai|sect|onmyoji|和|中華|武侠)/.test(t)) { return 'eastern_fantasy'; }
    if (/(cyber|punk|neon|corp|hacker|dystopia)/.test(t)) { return 'cyberpunk_courier'; }
    return DEFAULT_CAMPAIGN_KIT_ID;
}

export function getCampaignKitPreset(id: unknown): CampaignKitConfig {
    const key = asId(id, DEFAULT_CAMPAIGN_KIT_ID);
    return CAMPAIGN_KIT_PRESETS[key] ?? CAMPAIGN_KIT_PRESETS[DEFAULT_CAMPAIGN_KIT_ID];
}

export function parseCampaignKitConfig(raw: unknown, fallback?: CampaignKitConfig): CampaignKitConfig | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return fallback ? { ...fallback } : undefined;
    }
    const r = raw as Record<string, unknown>;
    if (r.version !== undefined && r.version !== 1) {
        return undefined;
    }
    const base = fallback ?? (hasCampaignKitPreset(r.id) ? getCampaignKitPreset(r.id) : getCampaignKitPreset(DEFAULT_CAMPAIGN_KIT_ID));
    const id = asId(r.id, base.id);
    const name = clampText(r.name, MAX_NAME) || base.name;
    const genre = asGenre(r.genre ?? base.genre);
    const currencies = parseTerms(r.currencies);
    const resources = parseTerms(r.resources);
    const siteTypes = parseTerms(r.siteTypes);
    const hazards = parseTerms(r.hazards);
    const services = parseTerms(r.services);
    const discoveryTypes = parseDiscoveries(r.discoveryTypes);
    const gmGuidance = parseGuidance(r.gmGuidance);
    const parsed: CampaignKitConfig = {
        version: 1,
        id,
        name,
        genre,
        loop: parseLoop(r.loop, base.loop),
        currencies: currencies.length ? currencies : base.currencies,
        resources: resources.length ? resources : base.resources,
        siteTypes: siteTypes.length ? siteTypes : base.siteTypes,
        hazards: hazards.length ? hazards : base.hazards,
        services: services.length ? services : base.services,
        discoveryTypes: discoveryTypes.length ? discoveryTypes : base.discoveryTypes,
        gmGuidance: gmGuidance.length ? gmGuidance : base.gmGuidance,
    };
    return parsed;
}

function formatTerms(label: string, terms: CampaignKitTerm[], max = 8): string {
    if (!terms.length) { return ''; }
    return `${label}: ${terms.slice(0, max).map((t) => t.name).join(', ')}`;
}

export function buildCampaignKitPromptBlock(kit: CampaignKitConfig | undefined): string {
    if (!kit) { return ''; }
    const l = kit.loop;
    const lines = [
        `[Campaign Kit - ${kit.name}]`,
        `Genre: ${kit.genre}`,
        `Core loop: ${l.hubLabel} -> ${l.jobBoardLabel} -> ${l.siteLabel} -> ${l.lootLabel} -> ${l.appraisalLabel}/${l.serviceLabel} -> ${l.worldReactionLabel}.`,
    ];
    for (const line of [
        formatTerms('Currencies', kit.currencies, 4),
        formatTerms('Resources', kit.resources, 8),
        formatTerms('Expedition site types', kit.siteTypes, 8),
        formatTerms('Hazards', kit.hazards, 8),
        formatTerms('Services', kit.services, 8),
    ]) {
        if (line) { lines.push(line); }
    }
    const discoveries = kit.discoveryTypes
        .slice(0, 10)
        .map((d) => `${d.kind}:${d.name}`)
        .join(', ');
    if (discoveries) {
        lines.push(`Discovery ledger categories: ${discoveries}`);
    }
    for (const guide of kit.gmGuidance.slice(0, 5)) {
        lines.push(`- ${guide}`);
    }
    lines.push(
        'Use this as genre loop guidance only. Existing Core systems remain canonical: use tradeOps for market transactions, quest hooks for structured quests, and world_state/game_state fields for persistent facts.'
    );
    return lines.join('\n');
}

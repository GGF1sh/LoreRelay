// LW3 — NPC-to-NPC Relationships (North Star: ガンパレード・マーチ 共生システム).
//
// 名ありNPC(≤10)同士が「世界の出来事の結果として」関係を変える決定論ロジック。
// 黄金律に従い、LLM の自動生成には頼らない — 同席 / 共通の危機 / 派閥対立 といった
// world_state のデータから affinity(好感度) を動かし、その変化を「出来事」として返す。
// GM はその出来事を伝聞として narrate する(数値は書き換えない)。
//
// このファイルは完全自己完結(vscode/fs/DOM も他モジュールも import しない純関数)。
// ホストは既存の registry / npcPositions / recentChanges を下の *Like 形へ写して呼ぶ。
// 対応スペック: docs/LIVING_WORLD_LW3_RELATIONSHIPS.md / BRIEF §0.5・§5.6(future arc)。

// レガシー既定値(pre-1.0 の暫定値、規模検討の結果ではない)。
// ホストは game_rules.json の maxNamedNpcCount をここへ渡す。未指定時のみこの値を使う。
export const MAX_NAMED_NPC_RELATIONSHIP = 10;
export const MAX_AFFINITY = 100;
export const MIN_AFFINITY = -100;

// 関係ラベルの閾値
export const AFFINITY_ALLY = 70;
export const AFFINITY_FRIEND = 30;
export const AFFINITY_RIVAL = -30;
export const AFFINITY_ENEMY = -70;

// 1tick あたりの調整幅(小さく保ち、関係は多ターンかけて育つ — 即席にならないように)
export const CO_LOCATION_STEP = 3;
export const SHARED_CRISIS_STEP = 8;
export const FACTION_CONFLICT_STEP = -10;
export const FACTION_KINSHIP_STEP = 4;
export const MAX_RELATIONSHIP_CHANGES_PER_TICK = 24;

export type NpcRelationshipReason =
    | 'co_location'
    | 'shared_crisis'
    | 'manual';

export type NpcRelationshipLabel = 'ally' | 'friend' | 'neutral' | 'rival' | 'enemy';

export type NpcFactionRelationshipReason = 'faction_conflict' | 'faction_kinship';

/** 正規化ペアキー "idA|idB"(ソート済み) → affinity [-100,100]。 */
export type NpcRelationshipMap = Record<string, number>;

/**
 * 派閥間の関係(異派閥同士の敵対/同盟度)。正規化ペアキー "factionA|factionB"(ソート済み)
 * → 値 [-100,100]。派閥数(F)にのみ依存し、名ありNPC数(N)には依存しない
 * (F は通常一桁〜数十のオーダーで、N=10でもN=5000でも変わらない)。
 */
export type NpcFactionRelationshipMap = Record<string, number>;

/** 派閥内の結束度(同派閥NPC同士の絆の底上げ)。factionId → 値 [-100,100]。 */
export type NpcFactionCohesionMap = Record<string, number>;

// --- ホストが写して渡す最小形(既存 registry/positions/events から adapt) ---

export interface RelationshipRegistryEntryLike {
    name: string;
    locationId?: string;
    factionId?: string;
}
export type RelationshipRegistryLike = Record<string, RelationshipRegistryEntryLike>;

export interface RelationshipPositionLike {
    locationId: string;
    arrivesTurn: number;
    agenda?: string;
    reason?: string;
}
export type RelationshipPositionsLike = Record<string, RelationshipPositionLike>;

export interface RelationshipEventLike {
    worldTurn: number;
    category?: string;
    severity?: string;
    message: string;
}

/** reactNpcsToWorld が返す move(このtickで誰がなぜ動いたか)。共通危機の判定に使う。 */
export interface RelationshipMoveLike {
    npcId: string;
    agenda?: string;
    reason?: string;
}

export interface NpcRelationshipChange {
    a: string;
    b: string;
    delta: number;      // このtickの純増減
    affinity: number;   // 適用後
    reason: NpcRelationshipReason;
    worldTurn: number;
}

/** 派閥レベルの関係変化(faction_kinship は factionA === factionB の自己結束として表す)。 */
export interface NpcFactionRelationshipChange {
    factionA: string;
    factionB: string;
    delta: number;
    value: number;
    reason: NpcFactionRelationshipReason;
    worldTurn: number;
}

export interface NpcRelationshipOp {
    a: string;
    b: string;
    delta: number;
    reason?: NpcRelationshipReason;
}

// --- pure helpers ---

/** 順序に依存しない正規化ペアキー。 */
export function pairKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function splitPairKey(key: string): [string, string] | undefined {
    const idx = key.indexOf('|');
    if (idx <= 0 || idx >= key.length - 1) { return undefined; }
    return [key.slice(0, idx), key.slice(idx + 1)];
}

export function getAffinity(map: NpcRelationshipMap, a: string, b: string): number {
    if (a === b) { return 0; }
    const v = map[pairKey(a, b)];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function clampAffinity(v: number): number {
    if (!Number.isFinite(v)) { return 0; }
    return Math.max(MIN_AFFINITY, Math.min(MAX_AFFINITY, Math.round(v)));
}

export function describeRelationship(affinity: number): NpcRelationshipLabel {
    if (affinity >= AFFINITY_ALLY) { return 'ally'; }
    if (affinity >= AFFINITY_FRIEND) { return 'friend'; }
    if (affinity <= AFFINITY_ENEMY) { return 'enemy'; }
    if (affinity <= AFFINITY_RIVAL) { return 'rival'; }
    return 'neutral';
}

/** 順序に依存しない正規化ペアキー(派閥id用。個人用の pairKey と同じ規則)。 */
export function factionPairKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function getFactionRelation(map: NpcFactionRelationshipMap, factionA: string, factionB: string): number {
    if (factionA === factionB) { return 0; }
    const v = map[factionPairKey(factionA, factionB)];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function getFactionCohesion(map: NpcFactionCohesionMap, factionId: string): number {
    const v = map[factionId];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * 個人の絆(personal)に、派閥文脈(異派閥なら敵対/同盟、同派閥なら結束)を上乗せした
 * 実効affinity。「実際に関わったことがある個人ペア」にのみ意味を持たせるため、
 * 呼び出し側は relationships に既にキーがあるペアに対してのみ使うこと(全ペア総当りで
 * 呼ぶと元のO(N^2)に戻ってしまう)。
 */
export function getEffectiveAffinity(
    personal: NpcRelationshipMap,
    factionRelationships: NpcFactionRelationshipMap,
    factionCohesion: NpcFactionCohesionMap,
    registry: RelationshipRegistryLike,
    a: string,
    b: string
): number {
    if (a === b) { return 0; }
    const personalAffinity = getAffinity(personal, a, b);
    const factionA = registry[a]?.factionId;
    const factionB = registry[b]?.factionId;
    if (!factionA || !factionB) { return personalAffinity; }
    const modifier = factionA === factionB
        ? getFactionCohesion(factionCohesion, factionA)
        : getFactionRelation(factionRelationships, factionA, factionB);
    return clampAffinity(personalAffinity + modifier);
}

function namedIds(registry: RelationshipRegistryLike, maxNamedNpcCount = MAX_NAMED_NPC_RELATIONSHIP): string[] {
    return Object.keys(registry).slice(0, maxNamedNpcCount);
}

function cloneMap(map: NpcRelationshipMap): NpcRelationshipMap {
    return { ...map };
}

/**
 * このtickの実効ロケーション。移動中(arrivesTurn > worldTurn)は「不在」とみなし
 * 同席カウントから外す(到着していないので居合わせていない)。
 */
function effectiveLocation(
    id: string,
    registry: RelationshipRegistryLike,
    positions: RelationshipPositionsLike,
    worldTurn: number
): string | undefined {
    const pos = positions[id];
    if (pos) {
        if (pos.arrivesTurn <= worldTurn) { return pos.locationId; }
        return undefined; // in transit
    }
    return registry[id]?.locationId;
}

function isConflictEvent(ev: RelationshipEventLike): boolean {
    const msg = (ev.message ?? '').toLowerCase();
    return ev.category === 'conflict'
        || ev.severity === 'critical'
        || msg.includes('war')
        || msg.includes('conflict')
        || msg.includes('raid')
        || msg.includes('attack')
        || msg.includes('戦')
        || msg.includes('襲')
        || msg.includes('紛争');
}

export interface RelationshipEvolveInput {
    registry: RelationshipRegistryLike;
    positions: RelationshipPositionsLike;
    relationships: NpcRelationshipMap;
    worldTurn: number;
    recentChanges?: RelationshipEventLike[];
    /** このtickの reactNpcsToWorld の moves(共通危機の結束判定に使う)。 */
    agencyMoves?: RelationshipMoveLike[];
    /** 名ありNPCの上限(game_rules.maxNamedNpcCount)。未指定時は MAX_NAMED_NPC_RELATIONSHIP(10)。 */
    maxNamedNpcCount?: number;
    /** 派閥間関係の前tick状態(規則3の入力)。 */
    factionRelationships?: NpcFactionRelationshipMap;
    /** 派閥内結束の前tick状態(規則3の入力)。 */
    factionCohesion?: NpcFactionCohesionMap;
}

export interface RelationshipEvolveResult {
    relationships: NpcRelationshipMap;
    changes: NpcRelationshipChange[];
    factionRelationships: NpcFactionRelationshipMap;
    factionCohesion: NpcFactionCohesionMap;
    factionChanges: NpcFactionRelationshipChange[];
}

/**
 * 世界データから NPC 同士の関係を1tick進める(決定論)。
 * 規則(v0):
 *  1. 同席     — 同じ場所に居合わせるペアは少しずつ親密化(顔見知りに)。
 *  2. 共通の危機 — 同じ reason で同tickに動いたペアは結束(危機の盟友)。
 *  3. 派閥動態  — 紛争/critical イベント時、派閥そのものの関係(異派閥=険悪化/
 *     同派閥=結束)を動かす。個人ペアへは書き込まない(下記参照)。
 * 全変化は clamp され、ペアごとに純増減 + 最大寄与の reason で1件に集約。
 */
export function evolveRelationships(input: RelationshipEvolveInput): RelationshipEvolveResult {
    const ids = namedIds(input.registry, input.maxNamedNpcCount);
    const worldTurn = input.worldTurn;

    // ペアごとに寄与を蓄積(dominant reason = 単一寄与の絶対値が最大のもの)
    const contrib = new Map<string, { delta: number; reason: NpcRelationshipReason; mag: number }>();
    const add = (a: string, b: string, delta: number, reason: NpcRelationshipReason): void => {
        if (a === b || delta === 0) { return; }
        const key = pairKey(a, b);
        const prev = contrib.get(key);
        const mag = Math.abs(delta);
        if (!prev) {
            contrib.set(key, { delta, reason, mag });
        } else {
            contrib.set(key, {
                delta: prev.delta + delta,
                reason: mag > prev.mag ? reason : prev.reason,
                mag: Math.max(prev.mag, mag),
            });
        }
    };

    // 規則1: 同席
    // 全ペア総当り(O(N^2))を避けるため、場所ごとにグループ化してから
    // 同じ場所のNPC同士だけを比較する(O(N + Σ 場所ごとの人数^2))。
    // 名ありNPCが多くても、大多数の場所は少人数なので実効コストは低いまま保たれる。
    const idsByLocation = new Map<string, string[]>();
    for (const id of ids) {
        const loc = effectiveLocation(id, input.registry, input.positions, worldTurn);
        if (!loc) { continue; }
        const bucket = idsByLocation.get(loc);
        if (bucket) { bucket.push(id); } else { idsByLocation.set(loc, [id]); }
    }
    for (const bucket of idsByLocation.values()) {
        for (let i = 0; i < bucket.length; i++) {
            for (let j = i + 1; j < bucket.length; j++) {
                add(bucket[i]!, bucket[j]!, CO_LOCATION_STEP, 'co_location');
            }
        }
    }

    // 規則2: 共通の危機(同 reason/agenda の move ペア)
    const moves = (input.agencyMoves ?? []).filter((m) => input.registry[m.npcId] !== undefined);
    for (let i = 0; i < moves.length; i++) {
        for (let j = i + 1; j < moves.length; j++) {
            const m1 = moves[i]!;
            const m2 = moves[j]!;
            if (m1.npcId === m2.npcId) { continue; }
            const r1 = m1.reason ?? m1.agenda;
            const r2 = m2.reason ?? m2.agenda;
            if (r1 && r1 === r2) {
                add(m1.npcId, m2.npcId, SHARED_CRISIS_STEP, 'shared_crisis');
            }
        }
    }

    // 規則3: 派閥動態(紛争/critical イベント時のみ)
    // 「世界のどこかで戦が起きた」動揺は居合わせていなくても波及する設計だが、
    // 個人ペア(N^2)へは書き込まない — 派閥そのもの(F, 通常一桁〜数十)の関係を
    // 動かす。国同士が戦争になった瞬間に全国民同士が互いを憎み合うわけではなく、
    // 「所属派閥の空気が悪くなる/結束する」だけ。個人の絆は同席や共通の危機で
    // 実際に関わった時にだけ育つ(規則1・2)。これで maxNamedNpcCount を
    // どれだけ引き上げても、この規則の計算量は派閥数だけに依存する。
    const conflict = (input.recentChanges ?? []).some(isConflictEvent);
    const factionRelationships = cloneMap(input.factionRelationships ?? {});
    const factionCohesion: NpcFactionCohesionMap = { ...(input.factionCohesion ?? {}) };
    const factionChanges: NpcFactionRelationshipChange[] = [];
    if (conflict) {
        const factionIds = [...new Set(
            ids.map((id) => input.registry[id]?.factionId).filter((f): f is string => !!f)
        )];
        for (const f of factionIds) {
            const before = getFactionCohesion(factionCohesion, f);
            const after = clampAffinity(before + FACTION_KINSHIP_STEP);
            if (after !== before) {
                factionCohesion[f] = after;
                factionChanges.push({
                    factionA: f, factionB: f, delta: after - before, value: after,
                    reason: 'faction_kinship', worldTurn,
                });
            }
        }
        for (let i = 0; i < factionIds.length; i++) {
            for (let j = i + 1; j < factionIds.length; j++) {
                const fa = factionIds[i]!;
                const fb = factionIds[j]!;
                const key = factionPairKey(fa, fb);
                const before = getFactionRelation(factionRelationships, fa, fb);
                const after = clampAffinity(before + FACTION_CONFLICT_STEP);
                if (after !== before) {
                    factionRelationships[key] = after;
                    factionChanges.push({
                        factionA: fa, factionB: fb, delta: after - before, value: after,
                        reason: 'faction_conflict', worldTurn,
                    });
                }
            }
        }
    }

    // 適用 + 変化リスト生成
    const next = cloneMap(input.relationships);
    const changes: NpcRelationshipChange[] = [];
    for (const [key, c] of contrib) {
        const pair = splitPairKey(key);
        if (!pair) { continue; }
        const before = getAffinity(next, pair[0], pair[1]);
        const after = clampAffinity(before + c.delta);
        if (after === before) { continue; } // 上限/下限に張り付いて実変化なしなら黙る
        next[key] = after;
        changes.push({ a: pair[0], b: pair[1], delta: after - before, affinity: after, reason: c.reason, worldTurn });
    }
    changes.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
    factionChanges.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
    return {
        relationships: next,
        changes: changes.slice(0, MAX_RELATIONSHIP_CHANGES_PER_TICK),
        factionRelationships,
        factionCohesion,
        factionChanges: factionChanges.slice(0, MAX_RELATIONSHIP_CHANGES_PER_TICK),
    };
}

/** turn_result.relationshipOps をパース(GM の例外的確定。±100 に clamp、self ペア/0 を除外)。 */
export function parseRelationshipOps(raw: unknown): NpcRelationshipOp[] {
    if (!Array.isArray(raw)) { return []; }
    const out: NpcRelationshipOp[] = [];
    for (const item of raw.slice(0, MAX_RELATIONSHIP_CHANGES_PER_TICK)) {
        if (!item || typeof item !== 'object') { continue; }
        const row = item as Record<string, unknown>;
        if (typeof row.a !== 'string' || !row.a) { continue; }
        if (typeof row.b !== 'string' || !row.b) { continue; }
        if (row.a === row.b) { continue; }
        const rawDelta = typeof row.delta === 'number' && Number.isFinite(row.delta) ? Math.round(row.delta) : 0;
        const delta = Math.max(-MAX_AFFINITY, Math.min(MAX_AFFINITY, rawDelta));
        if (delta === 0) { continue; }
        const reason = typeof row.reason === 'string' ? (row.reason as NpcRelationshipReason) : 'manual';
        out.push({ a: row.a, b: row.b, delta, reason });
    }
    return out;
}

/** GM ops を適用(registry の名ありNPC上限内のペアのみ許可、clamp)。 */
export function applyRelationshipOps(
    relationships: NpcRelationshipMap,
    ops: NpcRelationshipOp[],
    registry: RelationshipRegistryLike,
    maxNamedNpcCount = MAX_NAMED_NPC_RELATIONSHIP
): NpcRelationshipMap {
    const next = cloneMap(relationships);
    const allowed = new Set(namedIds(registry, maxNamedNpcCount));
    for (const op of ops) {
        if (op.a === op.b || !allowed.has(op.a) || !allowed.has(op.b)) { continue; }
        const key = pairKey(op.a, op.b);
        next[key] = clampAffinity(getAffinity(next, op.a, op.b) + op.delta);
    }
    return next;
}

export interface NotableRelationship {
    a: string;
    b: string;
    nameA: string;
    nameB: string;
    affinity: number;
    label: NpcRelationshipLabel;
}

/**
 * UI/プロンプト用: neutral 以外の顕著な関係を |affinity| 降順で。
 * factionRelationships/factionCohesion を渡すと、個人の絆に派閥文脈を上乗せした
 * 実効affinityで判定・表示する(既に relationships にキーがある=実際に関わった
 * ペアのみを見るので、O(N^2) には戻らない)。
 */
export function listNotableRelationships(
    relationships: NpcRelationshipMap,
    registry: RelationshipRegistryLike,
    limit = 8,
    maxNamedNpcCount = MAX_NAMED_NPC_RELATIONSHIP,
    factionRelationships: NpcFactionRelationshipMap = {},
    factionCohesion: NpcFactionCohesionMap = {}
): NotableRelationship[] {
    const allowed = new Set(namedIds(registry, maxNamedNpcCount));
    const out: NotableRelationship[] = [];
    for (const [key, affinity] of Object.entries(relationships)) {
        if (typeof affinity !== 'number' || !Number.isFinite(affinity)) { continue; }
        const pair = splitPairKey(key);
        if (!pair) { continue; }
        if (!allowed.has(pair[0]) || !allowed.has(pair[1])) { continue; }
        // 派閥modifierを加える(getAffinity経由の再lookupはしない — このループは
        // 既に該当キーの値を手にしているので、pairKeyの正規化に依存せず済む)。
        const factionA = registry[pair[0]]?.factionId;
        const factionB = registry[pair[1]]?.factionId;
        const modifier = (factionA && factionB)
            ? (factionA === factionB
                ? getFactionCohesion(factionCohesion, factionA)
                : getFactionRelation(factionRelationships, factionA, factionB))
            : 0;
        const effective = clampAffinity(affinity + modifier);
        const label = describeRelationship(effective);
        if (label === 'neutral') { continue; }
        out.push({
            a: pair[0],
            b: pair[1],
            nameA: registry[pair[0]]?.name ?? pair[0],
            nameB: registry[pair[1]]?.name ?? pair[1],
            affinity: effective,
            label,
        });
    }
    out.sort((x, y) => Math.abs(y.affinity) - Math.abs(x.affinity));
    return out.slice(0, limit);
}

// --- 紹介効果(太閤の紹介状): 盟友の盟友には信頼が届く ---

export const INTRODUCTION_TRUST_PENALTY = 25;   // 紹介経由は直接の信頼より割り引く
export const INTRODUCTION_MIN_AFFINITY = AFFINITY_ALLY; // 紹介が成立する絆(盟友)の下限

export interface IntroductionBoostEntry {
    name: string;
    locationId?: string;
    factionId?: string;
    playerTrust?: number;
    /** 紹介者の npcId(ブーストが適用された場合のみ)。 */
    introducedBy?: string;
}

/**
 * 盟友(affinity ≥ INTRODUCTION_MIN_AFFINITY)の playerTrust から
 * ペナルティ付きで信頼が伝播した registryLike を返す(元は変更しない)。
 * 例: Elda(trust 80) と盟友の Marcus(trust 30) → Marcus は実効 55 に。
 * whereabouts の精度計算にこの戻り値を渡すと「紹介で会いに行ける」が成立する。
 */
/** When faction rep is already allied, dampen introduction trust stacking. */
export const FACTION_ALLIED_REP_MIN = 60;
export const FACTION_INTRO_TRUST_DAMPEN = 0.5;
export const MAX_EFFECTIVE_PLAYER_TRUST = 100;

export function applyIntroductionTrustBoost<T extends IntroductionBoostEntry>(
    registry: Record<string, T>,
    relationships: NpcRelationshipMap,
    factionReputation?: Record<string, number>,
    maxNamedNpcCount = MAX_NAMED_NPC_RELATIONSHIP
): Record<string, T & { introducedBy?: string }> {
    const allowed = new Set(Object.keys(registry).slice(0, maxNamedNpcCount));
    const out: Record<string, T & { introducedBy?: string }> = {};
    for (const [id, entry] of Object.entries(registry)) {
        out[id] = { ...entry };
    }

    // 全ペア総当り(O(N^2))を避け、relationships に affinity が記録された疎なペアだけを
    // 見る(O(E))。affinity 未記録のペアは INTRODUCTION_MIN_AFFINITY(=盟友水準)を
    // 満たしようがないので、走査対象から外しても結果は変わらない。
    const best = new Map<string, { trust: number; via: string }>();
    const consider = (id: string, allyId: string): void => {
        if (!allowed.has(id) || !allowed.has(allyId)) { return; }
        const allyTrust = registry[allyId]?.playerTrust;
        if (typeof allyTrust !== 'number') { return; }
        const introduced = allyTrust - INTRODUCTION_TRUST_PENALTY;
        const prev = best.get(id);
        if (!prev || introduced > prev.trust) {
            best.set(id, { trust: introduced, via: allyId });
        }
    };
    for (const [key, affinity] of Object.entries(relationships)) {
        if (typeof affinity !== 'number' || affinity < INTRODUCTION_MIN_AFFINITY) { continue; }
        const pair = splitPairKey(key);
        if (!pair) { continue; }
        consider(pair[0], pair[1]);
        consider(pair[1], pair[0]);
    }

    for (const id of allowed) {
        const candidate = best.get(id);
        if (!candidate) { continue; }
        const base = typeof registry[id]?.playerTrust === 'number' ? registry[id]!.playerTrust! : undefined;
        if (!(candidate.trust > (base ?? -Infinity))) { continue; }
        const baseTrust = base ?? 0;
        let effective = Math.round(candidate.trust);
        const factionId = registry[id]?.factionId;
        const factionRep = factionId ? factionReputation?.[factionId] : undefined;
        if (
            typeof factionRep === 'number'
            && factionRep >= FACTION_ALLIED_REP_MIN
            && effective > baseTrust
        ) {
            const introOnly = effective - baseTrust;
            effective = baseTrust + Math.round(introOnly * FACTION_INTRO_TRUST_DAMPEN);
        }
        effective = Math.max(0, Math.min(MAX_EFFECTIVE_PLAYER_TRUST, effective));
        out[id] = { ...out[id], playerTrust: effective, introducedBy: candidate.via };
    }
    return out;
}

/** Remove relationship edges that reference NPCs no longer in the registry. */
export function reconcileRelationshipGraph(
    relationships: NpcRelationshipMap,
    registry: RelationshipRegistryLike,
    maxNamedNpcCount = MAX_NAMED_NPC_RELATIONSHIP
): NpcRelationshipMap {
    const allowed = new Set(namedIds(registry, maxNamedNpcCount));
    const next: NpcRelationshipMap = {};
    for (const [key, affinity] of Object.entries(relationships)) {
        const pair = splitPairKey(key);
        if (!pair) { continue; }
        if (!allowed.has(pair[0]) || !allowed.has(pair[1])) { continue; }
        if (typeof affinity === 'number' && Number.isFinite(affinity)) {
            next[key] = affinity;
        }
    }
    return next;
}

/** Prune all relationship/milestone data involving a removed NPC (death, archive, etc.). */
export function cascadeNpcRemovalFromGraph(
    relationships: NpcRelationshipMap,
    removedNpcId: string
): NpcRelationshipMap {
    const next: NpcRelationshipMap = {};
    for (const [key, affinity] of Object.entries(relationships)) {
        const pair = splitPairKey(key);
        if (!pair) { continue; }
        if (pair[0] === removedNpcId || pair[1] === removedNpcId) { continue; }
        if (typeof affinity === 'number' && Number.isFinite(affinity)) {
            next[key] = affinity;
        }
    }
    return next;
}

const RELATIONSHIP_LABEL_JA: Record<NpcRelationshipLabel, string> = {
    ally: '盟友',
    friend: '友好',
    neutral: '中立',
    rival: '不和',
    enemy: '敵対',
};

const REASON_JA: Record<NpcRelationshipReason, string> = {
    co_location: '同じ場所で過ごした',
    shared_crisis: '同じ危機に共に動いた',
    manual: '',
};

/**
 * GM プロンプト用 `[Living World — Bonds]` 行。
 * 先頭に現在の顕著な関係(state)、余裕があれば直近の変化(events)。
 * 「見ていない所で関係が動いていた」感を GM に伝える情報だけ渡す(創作は GM 任せ)。
 */
export function buildRelationshipPromptLines(
    notable: NotableRelationship[],
    changes: NpcRelationshipChange[],
    registry: RelationshipRegistryLike,
    maxLines = 8
): string[] {
    const lines: string[] = [];
    for (const n of notable) {
        lines.push(`${n.nameA} と ${n.nameB}: ${RELATIONSHIP_LABEL_JA[n.label]} (${n.affinity})`);
        if (lines.length >= maxLines) { return lines; }
    }
    for (const c of changes) {
        const nameA = registry[c.a]?.name ?? c.a;
        const nameB = registry[c.b]?.name ?? c.b;
        const dir = c.delta > 0 ? '近づいた' : '離れた';
        const why = REASON_JA[c.reason];
        lines.push(why ? `(変化) ${nameA} と ${nameB} が${dir} — ${why}` : `(変化) ${nameA} と ${nameB} が${dir}`);
        if (lines.length >= maxLines) { break; }
    }
    return lines;
}

export interface FactionNameLike {
    name?: string;
}

/**
 * GM プロンプト用 `[Living World — Faction Relations]` 行。
 * 個人の絆(Bonds)とは別枠 — 「派閥そのものの空気」を伝える(誰と誰の話かではない)。
 */
export function buildFactionRelationsPromptLines(
    changes: NpcFactionRelationshipChange[],
    factionNames: Record<string, FactionNameLike | undefined>,
    maxLines = 4
): string[] {
    const lines: string[] = [];
    for (const c of changes) {
        const nameA = factionNames[c.factionA]?.name ?? c.factionA;
        if (c.factionA === c.factionB) {
            const dir = c.delta > 0 ? '結束が強まっている' : '結束が緩んでいる';
            lines.push(`${nameA}の${dir}という噂だ`);
        } else {
            const nameB = factionNames[c.factionB]?.name ?? c.factionB;
            const dir = c.delta > 0 ? '歩み寄っている' : '険悪になっている';
            lines.push(`${nameA}と${nameB}の関係が${dir}という噂だ`);
        }
        if (lines.length >= maxLines) { break; }
    }
    return lines;
}

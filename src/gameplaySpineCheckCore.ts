import type { DiceLedgerEntry } from './types/TurnResult';
import type { MechanicalOutcome } from './gameplaySpineCore';

export type CheckModifierSource =
    | 'actor'
    | 'target'
    | 'world'
    | 'equipment'
    | 'assistance'
    | 'difficulty_policy';

export interface CheckModifier {
    id: string;
    value: number;
    source: CheckModifierSource;
}

export interface CheckSpec {
    formula: string;
    dc: number;
    modifiers: CheckModifier[];
    partialBand?: {
        minDeficit: number;
        maxDeficit: number;
    };
}

export interface DiceTermSpec {
    sign: 1 | -1;
    count: number;
    sides: number;
}

export interface ParsedCheckFormula {
    schemaVersion: 1;
    normalizedFormula: string;
    terms: DiceTermSpec[];
    flatModifier: number;
}

export type RollEvidenceSource =
    | 'system_random'
    | 'seeded_simulation';

export interface RollTermReceipt {
    sign: 1 | -1;
    count: number;
    sides: number;
    rolls: number[];
}

export interface RollReceipt {
    schemaVersion: 1;
    receiptId: string;
    source: RollEvidenceSource;
    algorithmVersion: string;
    normalizedFormula: string;
    terms: RollTermReceipt[];
    seedWitness?: string;
}

export type CheckCoreResult<T> =
    | { ok: true; value: T }
    | { ok: false; error: CheckValidationError };

export interface CheckValidationError {
    code:
        | 'invalid_type'
        | 'invalid_format'
        | 'out_of_range'
        | 'too_many_items'
        | 'duplicate_id'
        | 'unsafe_integer'
        | 'formula_mismatch'
        | 'term_mismatch'
        | 'roll_count_mismatch'
        | 'roll_out_of_range'
        | 'seed_witness_mismatch'
        | 'arithmetic_overflow';

    path: string;
}

export interface ValidatedCheckSpec {
    formula: ParsedCheckFormula;
    dc: number;
    modifiers: CheckModifier[];
    partialBand?: {
        minDeficit: number;
        maxDeficit: number;
    };
}

export interface ValidatedRollReceipt extends RollReceipt {}

export interface ComputedCheckResolution {
    spec: ValidatedCheckSpec;
    receipt: ValidatedRollReceipt;
    diceTotal: number;
    formulaModifier: number;
    contextualModifierTotal: number;
    total: number;
    outcome: MechanicalOutcome;
}

function makeError(code: CheckValidationError['code'], path: string): { ok: false; error: CheckValidationError } {
    return { ok: false, error: { code, path } };
}

function isAsciiToken(val: unknown): boolean {
    return typeof val === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(val);
}

function safeAdd(a: number, b: number): number | null {
    const sum = a + b;
    if (!Number.isSafeInteger(sum)) return null;
    return sum;
}

export function parseCheckFormula(
    formula: unknown
): CheckCoreResult<ParsedCheckFormula> {
    if (typeof formula !== 'string') {
        return makeError('invalid_type', 'formula');
    }
    if (formula.length < 1 || formula.length > 128) {
        return makeError('out_of_range', 'formula');
    }

    const cleaned = formula.replace(/[ \t\r\n]/g, '');
    if (cleaned.length === 0) {
        return makeError('invalid_format', 'formula');
    }

    let pos = 0;
    const rawTerms: (DiceTermSpec | { kind: 'flat'; value: number })[] = [];

    while (pos < cleaned.length) {
        let sign: 1 | -1 = 1;
        if (pos > 0 || cleaned[pos] === '+' || cleaned[pos] === '-') {
            const char = cleaned[pos];
            if (char === '+') {
                sign = 1;
                pos++;
            } else if (char === '-') {
                sign = -1;
                pos++;
            } else {
                return makeError('invalid_format', 'formula');
            }
        }

        if (pos < cleaned.length && (cleaned[pos] === '+' || cleaned[pos] === '-')) {
            return makeError('invalid_format', 'formula');
        }

        let numStr = '';
        while (pos < cleaned.length && cleaned[pos] >= '0' && cleaned[pos] <= '9') {
            numStr += cleaned[pos];
            pos++;
        }

        if (pos < cleaned.length && cleaned[pos] === 'd') {
            pos++; // consume 'd'
            let sidesStr = '';
            while (pos < cleaned.length && cleaned[pos] >= '0' && cleaned[pos] <= '9') {
                sidesStr += cleaned[pos];
                pos++;
            }
            if (sidesStr === '') {
                return makeError('invalid_format', 'formula');
            }

            let count = 1;
            if (numStr !== '') {
                if (!/^\d+$/.test(numStr)) {
                    return makeError('invalid_format', 'formula');
                }
                const parsedCount = Number(numStr);
                if (!Number.isSafeInteger(parsedCount)) {
                    return makeError('unsafe_integer', 'formula');
                }
                count = parsedCount;
            }

            if (!/^\d+$/.test(sidesStr)) {
                return makeError('invalid_format', 'formula');
            }
            const sides = Number(sidesStr);
            if (!Number.isSafeInteger(sides)) {
                return makeError('unsafe_integer', 'formula');
            }

            rawTerms.push({ sign, count, sides });
        } else {
            if (numStr === '') {
                return makeError('invalid_format', 'formula');
            }
            if (!/^\d+$/.test(numStr)) {
                return makeError('invalid_format', 'formula');
            }
            const val = Number(numStr);
            if (!Number.isSafeInteger(val)) {
                return makeError('unsafe_integer', 'formula');
            }
            rawTerms.push({ kind: 'flat', value: sign * val });
        }
    }

    const diceTerms: DiceTermSpec[] = [];
    let flatModifier = 0;
    let totalDiceCount = 0;

    for (const t of rawTerms) {
        if ('kind' in t && t.kind === 'flat') {
            const nextFlat = safeAdd(flatModifier, t.value);
            if (nextFlat === null) {
                return makeError('unsafe_integer', 'formula');
            }
            flatModifier = nextFlat;
        } else {
            const dt = t as DiceTermSpec;
            if (dt.count < 1 || dt.count > 100) {
                return makeError('out_of_range', 'formula');
            }
            if (dt.sides < 2 || dt.sides > 1000) {
                return makeError('out_of_range', 'formula');
            }
            totalDiceCount += dt.count;
            if (totalDiceCount > 100) {
                return makeError('out_of_range', 'formula');
            }
            diceTerms.push(dt);
        }
    }

    if (diceTerms.length < 1 || diceTerms.length > 8) {
        return makeError('out_of_range', 'formula');
    }

    if (flatModifier < -10000 || flatModifier > 10000) {
        return makeError('out_of_range', 'formula');
    }

    let normalized = '';
    for (let i = 0; i < diceTerms.length; i++) {
        const dt = diceTerms[i];
        if (i > 0) {
            normalized += dt.sign === 1 ? '+' : '-';
        } else {
            if (dt.sign === -1) {
                normalized += '-';
            }
        }
        normalized += `${dt.count}d${dt.sides}`;
    }
    if (flatModifier !== 0) {
        normalized += flatModifier > 0 ? `+${flatModifier}` : `${flatModifier}`;
    }

    return {
        ok: true,
        value: {
            schemaVersion: 1,
            normalizedFormula: normalized,
            terms: diceTerms,
            flatModifier
        }
    };
}

export function validateCheckSpec(
    spec: unknown
): CheckCoreResult<ValidatedCheckSpec> {
    if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) {
        return makeError('invalid_type', '');
    }

    const s = spec as Record<string, unknown>;

    // 1. formula envelope and parse
    if (!('formula' in s)) {
        return makeError('invalid_type', 'formula');
    }
    const formulaResult = parseCheckFormula(s.formula);
    if (!formulaResult.ok) {
        return formulaResult;
    }
    const parsedFormula = formulaResult.value;

    // 3. DC
    if (!('dc' in s)) {
        return makeError('invalid_type', 'dc');
    }
    const dcVal = s.dc;
    if (typeof dcVal !== 'number' || dcVal % 1 !== 0) {
        return makeError('invalid_type', 'dc');
    }
    if (!Number.isSafeInteger(dcVal)) {
        return makeError('unsafe_integer', 'dc');
    }
    if (dcVal < 1 || dcVal > 100000) {
        return makeError('out_of_range', 'dc');
    }

    // 4. modifiers in input order
    if (!('modifiers' in s)) {
        return makeError('invalid_type', 'modifiers');
    }
    const mods = s.modifiers;
    if (!Array.isArray(mods)) {
        return makeError('invalid_type', 'modifiers');
    }
    if (mods.length > 32) {
        return makeError('too_many_items', 'modifiers');
    }

    const seenIds = new Set<string>();
    const validatedMods: CheckModifier[] = [];
    let contextualModifierTotal = 0;

    for (let i = 0; i < mods.length; i++) {
        const m = mods[i];
        const pathPrefix = `modifiers[${i}]`;

        if (m === null || typeof m !== 'object' || Array.isArray(m)) {
            return makeError('invalid_type', pathPrefix);
        }

        const mObj = m as Record<string, unknown>;

        // Validate id
        if (!('id' in mObj)) {
            return makeError('invalid_type', `${pathPrefix}.id`);
        }
        const idVal = mObj.id;
        if (typeof idVal !== 'string') {
            return makeError('invalid_type', `${pathPrefix}.id`);
        }
        if (idVal.length < 1 || idVal.length > 64) {
            return makeError('out_of_range', `${pathPrefix}.id`);
        }
        if (!isAsciiToken(idVal)) {
            return makeError('invalid_format', `${pathPrefix}.id`);
        }
        if (seenIds.has(idVal)) {
            return makeError('duplicate_id', `${pathPrefix}.id`);
        }
        seenIds.add(idVal);

        // Validate value
        if (!('value' in mObj)) {
            return makeError('invalid_type', `${pathPrefix}.value`);
        }
        const valVal = mObj.value;
        if (typeof valVal !== 'number') {
            return makeError('invalid_type', `${pathPrefix}.value`);
        }
        if (!Number.isSafeInteger(valVal)) {
            return makeError('unsafe_integer', `${pathPrefix}.value`);
        }
        if (valVal < -10000 || valVal > 10000) {
            return makeError('out_of_range', `${pathPrefix}.value`);
        }

        // Validate source
        if (!('source' in mObj)) {
            return makeError('invalid_type', `${pathPrefix}.source`);
        }
        const srcVal = mObj.source;
        if (
            srcVal !== 'actor' &&
            srcVal !== 'target' &&
            srcVal !== 'world' &&
            srcVal !== 'equipment' &&
            srcVal !== 'assistance' &&
            srcVal !== 'difficulty_policy'
        ) {
            return makeError('invalid_type', `${pathPrefix}.source`);
        }

        const nextTotal = safeAdd(contextualModifierTotal, valVal);
        if (nextTotal === null) {
            return makeError('unsafe_integer', `${pathPrefix}.value`);
        }
        contextualModifierTotal = nextTotal;

        validatedMods.push({
            id: idVal,
            value: valVal,
            source: srcVal as CheckModifierSource
        });
    }

    // 5. aggregate contextual modifier
    if (contextualModifierTotal < -100000 || contextualModifierTotal > 100000) {
        return makeError('out_of_range', 'modifiers');
    }

    // Sort modifiers lexicographically by id
    validatedMods.sort((a, b) => {
        if (a.id < b.id) return -1;
        if (a.id > b.id) return 1;
        return 0;
    });

    // 6. partial band
    let validatedPartialBand: { minDeficit: number; maxDeficit: number } | undefined;
    if ('partialBand' in s && s.partialBand !== undefined && s.partialBand !== null) {
        const pb = s.partialBand;
        if (typeof pb !== 'object' || Array.isArray(pb)) {
            return makeError('invalid_type', 'partialBand');
        }
        const pbObj = pb as Record<string, unknown>;

        if (!('minDeficit' in pbObj)) {
            return makeError('invalid_type', 'partialBand.minDeficit');
        }
        const minVal = pbObj.minDeficit;
        if (typeof minVal !== 'number') {
            return makeError('invalid_type', 'partialBand.minDeficit');
        }
        if (!Number.isSafeInteger(minVal)) {
            return makeError('unsafe_integer', 'partialBand.minDeficit');
        }
        if (minVal < 1 || minVal > 100000) {
            return makeError('out_of_range', 'partialBand.minDeficit');
        }

        if (!('maxDeficit' in pbObj)) {
            return makeError('invalid_type', 'partialBand.maxDeficit');
        }
        const maxVal = pbObj.maxDeficit;
        if (typeof maxVal !== 'number') {
            return makeError('invalid_type', 'partialBand.maxDeficit');
        }
        if (!Number.isSafeInteger(maxVal)) {
            return makeError('unsafe_integer', 'partialBand.maxDeficit');
        }
        if (maxVal < 1 || maxVal > 100000) {
            return makeError('out_of_range', 'partialBand.maxDeficit');
        }

        if (minVal > maxVal) {
            return makeError('out_of_range', 'partialBand.maxDeficit');
        }

        validatedPartialBand = {
            minDeficit: minVal,
            maxDeficit: maxVal
        };
    }

    return {
        ok: true,
        value: {
            formula: parsedFormula,
            dc: dcVal,
            modifiers: validatedMods,
            partialBand: validatedPartialBand
        }
    };
}

export function validateRollReceipt(
    spec: ValidatedCheckSpec,
    receipt: unknown
): CheckCoreResult<ValidatedRollReceipt> {
    // 7. receipt envelope and provenance
    if (receipt === null || typeof receipt !== 'object' || Array.isArray(receipt)) {
        return makeError('invalid_type', 'receipt');
    }

    const r = receipt as Record<string, unknown>;

    if (!('schemaVersion' in r)) {
        return makeError('invalid_type', 'receipt.schemaVersion');
    }
    if (r.schemaVersion !== 1) {
        return makeError('out_of_range', 'receipt.schemaVersion');
    }

    if (!('receiptId' in r)) {
        return makeError('invalid_type', 'receipt.receiptId');
    }
    const receiptIdVal = r.receiptId;
    if (typeof receiptIdVal !== 'string') {
        return makeError('invalid_type', 'receipt.receiptId');
    }
    if (receiptIdVal.length < 1 || receiptIdVal.length > 128) {
        return makeError('out_of_range', 'receipt.receiptId');
    }
    if (!isAsciiToken(receiptIdVal)) {
        return makeError('invalid_format', 'receipt.receiptId');
    }

    if (!('source' in r)) {
        return makeError('invalid_type', 'receipt.source');
    }
    const srcVal = r.source;
    if (srcVal !== 'system_random' && srcVal !== 'seeded_simulation') {
        return makeError('invalid_type', 'receipt.source');
    }

    if (!('algorithmVersion' in r)) {
        return makeError('invalid_type', 'receipt.algorithmVersion');
    }
    const algVal = r.algorithmVersion;
    if (typeof algVal !== 'string') {
        return makeError('invalid_type', 'receipt.algorithmVersion');
    }
    if (algVal.length < 1 || algVal.length > 64) {
        return makeError('out_of_range', 'receipt.algorithmVersion');
    }
    if (!isAsciiToken(algVal)) {
        return makeError('invalid_format', 'receipt.algorithmVersion');
    }

    // 8. formula binding
    if (!('normalizedFormula' in r)) {
        return makeError('invalid_type', 'receipt.normalizedFormula');
    }
    if (r.normalizedFormula !== spec.formula.normalizedFormula) {
        return makeError('formula_mismatch', 'receipt.normalizedFormula');
    }

    // 9. receipt term metadata in order
    if (!('terms' in r)) {
        return makeError('invalid_type', 'receipt.terms');
    }
    const rTerms = r.terms;
    if (!Array.isArray(rTerms)) {
        return makeError('invalid_type', 'receipt.terms');
    }
    if (rTerms.length !== spec.formula.terms.length) {
        return makeError('term_mismatch', 'receipt.terms');
    }

    const validatedTerms: RollTermReceipt[] = [];

    for (let i = 0; i < rTerms.length; i++) {
        const pathPrefix = `receipt.terms[${i}]`;
        const rt = rTerms[i];
        if (rt === null || typeof rt !== 'object' || Array.isArray(rt)) {
            return makeError('invalid_type', pathPrefix);
        }

        const rtObj = rt as Record<string, unknown>;
        const specTerm = spec.formula.terms[i];

        if (!('sign' in rtObj) || rtObj.sign !== specTerm.sign) {
            return makeError('term_mismatch', `${pathPrefix}.sign`);
        }
        if (!('count' in rtObj) || rtObj.count !== specTerm.count) {
            return makeError('term_mismatch', `${pathPrefix}.count`);
        }
        if (!('sides' in rtObj) || rtObj.sides !== specTerm.sides) {
            return makeError('term_mismatch', `${pathPrefix}.sides`);
        }

        // 10. roll counts and values in order
        if (!('rolls' in rtObj)) {
            return makeError('invalid_type', `${pathPrefix}.rolls`);
        }
        const rollsVal = rtObj.rolls;
        if (!Array.isArray(rollsVal)) {
            return makeError('invalid_type', `${pathPrefix}.rolls`);
        }
        if (rollsVal.length !== specTerm.count) {
            return makeError('roll_count_mismatch', `${pathPrefix}.rolls`);
        }

        const termRolls: number[] = [];
        for (let j = 0; j < rollsVal.length; j++) {
            const rollVal = rollsVal[j];
            const rollPath = `${pathPrefix}.rolls[${j}]`;
            if (typeof rollVal !== 'number' || rollVal % 1 !== 0) {
                return makeError('invalid_type', rollPath);
            }
            if (!Number.isSafeInteger(rollVal)) {
                return makeError('unsafe_integer', rollPath);
            }
            if (rollVal < 1 || rollVal > specTerm.sides) {
                return makeError('roll_out_of_range', rollPath);
            }
            termRolls.push(rollVal);
        }

        validatedTerms.push({
            sign: specTerm.sign,
            count: specTerm.count,
            sides: specTerm.sides,
            rolls: termRolls
        });
    }

    // Seed witness rules
    let validatedSeedWitness: string | undefined;
    if (srcVal === 'system_random') {
        if ('seedWitness' in r && r.seedWitness !== undefined && r.seedWitness !== null) {
            return makeError('seed_witness_mismatch', 'receipt.seedWitness');
        }
    } else {
        if (!('seedWitness' in r)) {
            return makeError('seed_witness_mismatch', 'receipt.seedWitness');
        }
        const witness = r.seedWitness;
        if (typeof witness !== 'string') {
            return makeError('invalid_type', 'receipt.seedWitness');
        }
        if (witness.length < 1 || witness.length > 128) {
            return makeError('out_of_range', 'receipt.seedWitness');
        }
        if (!isAsciiToken(witness)) {
            return makeError('invalid_format', 'receipt.seedWitness');
        }
        validatedSeedWitness = witness;
    }

    const valReceipt: ValidatedRollReceipt = {
        schemaVersion: 1,
        receiptId: receiptIdVal,
        source: srcVal,
        algorithmVersion: algVal,
        normalizedFormula: spec.formula.normalizedFormula,
        terms: validatedTerms
    };
    if (validatedSeedWitness !== undefined) {
        valReceipt.seedWitness = validatedSeedWitness;
    }

    return {
        ok: true,
        value: valReceipt
    };
}

export function resolveCheck(
    spec: unknown,
    receipt: unknown
): CheckCoreResult<ComputedCheckResolution> {
    // Call validators directly — do not route through module.exports for test mocking.
    const specResult = validateCheckSpec(spec);
    if (!specResult.ok) {
        return specResult;
    }
    const valSpec = specResult.value;

    const receiptResult = validateRollReceipt(valSpec, receipt);
    if (!receiptResult.ok) {
        return receiptResult;
    }
    const valReceipt = receiptResult.value;

    // 11. arithmetic
    let diceTotal = 0;
    for (const term of valReceipt.terms) {
        let termSum = 0;
        for (const roll of term.rolls) {
            const nextSum = safeAdd(termSum, roll);
            if (nextSum === null) {
                return makeError('arithmetic_overflow', 'arithmetic.diceTotal');
            }
            termSum = nextSum;
        }

        const signedTermTotal = term.sign * termSum;
        if (!Number.isSafeInteger(signedTermTotal)) {
            return makeError('arithmetic_overflow', 'arithmetic.diceTotal');
        }

        const nextDiceTotal = safeAdd(diceTotal, signedTermTotal);
        if (nextDiceTotal === null) {
            return makeError('arithmetic_overflow', 'arithmetic.diceTotal');
        }
        diceTotal = nextDiceTotal;
    }

    const formulaModifier = valSpec.formula.flatModifier;

    let contextualModifierTotal = 0;
    for (const mod of valSpec.modifiers) {
        const nextTotal = safeAdd(contextualModifierTotal, mod.value);
        if (nextTotal === null) {
            return makeError('arithmetic_overflow', 'arithmetic.contextualModifierTotal');
        }
        contextualModifierTotal = nextTotal;
    }

    const totalWithFlat = safeAdd(diceTotal, formulaModifier);
    if (totalWithFlat === null) {
        return makeError('arithmetic_overflow', 'arithmetic.total');
    }
    const finalTotal = safeAdd(totalWithFlat, contextualModifierTotal);
    if (finalTotal === null) {
        return makeError('arithmetic_overflow', 'arithmetic.total');
    }

    let outcome: MechanicalOutcome = 'failure';
    if (finalTotal >= valSpec.dc) {
        outcome = 'success';
    } else {
        const deficit = valSpec.dc - finalTotal;
        if (!Number.isSafeInteger(deficit)) {
            return makeError('arithmetic_overflow', 'arithmetic.total');
        }

        if (valSpec.partialBand) {
            if (deficit >= valSpec.partialBand.minDeficit && deficit <= valSpec.partialBand.maxDeficit) {
                outcome = 'partial';
            }
        }
    }

    return {
        ok: true,
        value: {
            spec: valSpec,
            receipt: valReceipt,
            diceTotal,
            formulaModifier,
            contextualModifierTotal,
            total: finalTotal,
            outcome
        }
    };
}

export function projectCheckResolutionToDiceLedger(
    resolution: ComputedCheckResolution,
    reason?: unknown
): DiceLedgerEntry {
    if (
        !resolution ||
        typeof resolution !== 'object' ||
        !resolution.spec ||
        !resolution.receipt ||
        typeof resolution.total !== 'number' ||
        !resolution.outcome
    ) {
        throw new Error('Invalid ComputedCheckResolution input');
    }

    const spec = resolution.spec;
    const receipt = resolution.receipt;

    const rolls = receipt.terms.flatMap(t => t.rolls);
    const modifier = safeAdd(resolution.formulaModifier, resolution.contextualModifierTotal);
    if (modifier === null) {
        throw new Error('Arithmetic overflow when projecting modifier');
    }

    let success: boolean | undefined;
    if (resolution.outcome === 'success') {
        success = true;
    } else if (resolution.outcome === 'failure') {
        success = false;
    } else {
        success = undefined; // Omit for partial
    }

    const entry: DiceLedgerEntry = {
        formula: spec.formula.normalizedFormula,
        rolls,
        modifier,
        total: resolution.total,
        dc: spec.dc
    };

    if (success !== undefined) {
        entry.success = success;
    }

    if (reason !== undefined && typeof reason === 'string') {
        const trimmed = reason.trim();
        if (trimmed.length > 0) {
            entry.reason = trimmed.slice(0, 200);
        }
    }

    return entry;
}

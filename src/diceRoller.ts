import { DiceLedgerEntry } from './types/TurnResult';
import * as crypto from 'crypto';

export interface ProcessedDiceResult {
    text: string;
    ledger: DiceLedgerEntry[];
}

export function processDiceMacros(text: string): ProcessedDiceResult {
    // Matches {{roll 1d20+2 reason="罠発見" dc=15}} etc.
    const rollRegex = /\{\{\s*roll\s+([^}]+)\s*\}\}/g;
    
    const ledger: DiceLedgerEntry[] = [];
    
    const newText = text.replace(rollRegex, (match, content) => {
        try {
            // Extract attributes like reason="abc" or dc=15
            let formulaStr = content;
            let reason: string | undefined;
            let dc: number | undefined;

            const reasonMatch = content.match(/reason=["']([^"']+)["']/i);
            if (reasonMatch) {
                reason = reasonMatch[1];
                formulaStr = formulaStr.replace(reasonMatch[0], '');
            }
            
            const dcMatch = content.match(/dc=(\d+)/i);
            if (dcMatch) {
                dc = parseInt(dcMatch[1], 10);
                formulaStr = formulaStr.replace(dcMatch[0], '');
            }

            formulaStr = formulaStr.trim();
            const result = evaluateDiceFormula(formulaStr);
            
            let success: boolean | undefined;
            if (dc !== undefined) {
                success = result.total >= dc;
            }

            ledger.push({
                formula: formulaStr,
                rolls: result.rolls,
                modifier: result.modifier,
                total: result.total,
                reason,
                dc,
                success
            });

            let display = `[System Roll: ${formulaStr} ➔ ${result.total}]`;
            if (success !== undefined) {
                display = `[System Roll: ${formulaStr} ➔ ${result.total} (${success ? 'Success' : 'Failure'})]`;
            }
            return display;
        } catch {
            return match; // If parsing fails, leave it as is
        }
    });

    return { text: newText, ledger };
}

function evaluateDiceFormula(formula: string): { total: number, rolls: number[], modifier: number } {
    const cleanFormula = formula.replace(/\s+/g, '').toLowerCase();
    
    const tokens = cleanFormula.match(/([+-]?[^+-]+)/g);
    if (!tokens) {
        throw new Error("Invalid formula");
    }

    let total = 0;
    const rolls: number[] = [];
    let modifier = 0;

    for (const token of tokens) {
        if (token.includes('d')) {
            const sign = token.startsWith('-') ? -1 : 1;
            const unsignedToken = token.replace(/^[+-]/, '');
            const [countStr, sidesStr] = unsignedToken.split('d');
            const count = countStr === '' ? 1 : parseInt(countStr, 10);
            const sides = parseInt(sidesStr, 10);
            
            if (isNaN(count) || isNaN(sides) || count <= 0 || sides <= 0 || count > 100 || sides > 1000) {
                throw new Error("Invalid dice parameters");
            }
            
            for (let i = 0; i < count; i++) {
                const roll = crypto.randomInt(1, sides + 1);
                rolls.push(roll);
                total += sign * roll;
            }
        } else {
            const val = parseInt(token, 10);
            if (isNaN(val)) {
                throw new Error("Invalid number");
            }
            
            // If the formula is just e.g. "100" without 'd', treat as "1d100"
            if (tokens.length === 1 && val > 0) {
                const roll = crypto.randomInt(1, val + 1);
                rolls.push(roll);
                total += roll;
            } else {
                modifier += val;
                total += val;
            }
        }
    }
    return { total, rolls, modifier };
}

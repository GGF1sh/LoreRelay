export function processDiceMacros(text: string): string {
    // Matches {{roll 1d20}}, {{roll 2d6+3}}, {{roll 100}}, {{roll d10}}
    const rollRegex = /\{\{\s*roll\s+([0-9dD+\-\s]+)\s*\}\}/g;
    
    return text.replace(rollRegex, (match, formula) => {
        try {
            const result = evaluateDiceFormula(formula.trim());
            return `[System Roll: ${formula.trim()} ➔ ${result}]`;
        } catch {
            return match; // If parsing fails, leave it as is
        }
    });
}

function evaluateDiceFormula(formula: string): number {
    const cleanFormula = formula.replace(/\s+/g, '').toLowerCase();
    
    // Tokenize terms like "2d6", "+3", "-1"
    const tokens = cleanFormula.match(/([+-]?[^+-]+)/g);
    if (!tokens) {
        throw new Error("Invalid formula");
    }

    let total = 0;
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
            
            let rollSum = 0;
            for (let i = 0; i < count; i++) {
                rollSum += Math.floor(Math.random() * sides) + 1;
            }
            total += sign * rollSum;
        } else {
            const val = parseInt(token, 10);
            if (isNaN(val)) {
                throw new Error("Invalid number");
            }
            
            // If the formula is just e.g. "100" without 'd', treat as "1d100"
            if (tokens.length === 1 && val > 0) {
                total += Math.floor(Math.random() * val) + 1;
            } else {
                total += val;
            }
        }
    }
    return total;
}

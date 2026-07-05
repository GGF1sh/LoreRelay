#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');

const SOURCE_EXTENSIONS = new Set(['.ts']);
const IGNORE_DIRS = new Set(['out', 'node_modules', '.git']);

function walk(dir, out = []) {
    for (const name of fs.readdirSync(dir)) {
        if (IGNORE_DIRS.has(name)) { continue; }
        const full = path.join(dir, name);
        const st = fs.statSync(full);
        if (st.isDirectory()) {
            walk(full, out);
        } else if (SOURCE_EXTENSIONS.has(path.extname(full))) {
            out.push(full);
        }
    }
    return out;
}

function rel(file) {
    return path.relative(ROOT, file).replace(/\\/g, '/');
}

function lineOf(text, index) {
    return text.slice(0, index).split(/\r?\n/).length;
}

function pushIssue(issues, file, line, ruleId, severity, message) {
    issues.push({ file: rel(file), line, ruleId, severity, message });
}

function scanFile(file, issues) {
    const text = fs.readFileSync(file, 'utf8');
    const relative = rel(file);

    const interfaceRe = /\b(?:export\s+)?interface\s+(EntityRef|ClockRef)\b/g;
    let match;
    while ((match = interfaceRe.exec(text))) {
        if (!relative.endsWith('entityIdentityCore.ts') && !relative.endsWith('livingWorldTypes.ts')) {
            pushIssue(
                issues,
                file,
                lineOf(text, match.index),
                `duplicate-${match[1]}`,
                'warn',
                `${match[1]} is locally declared; prefer importing the contract or documenting why this wider local shape is needed.`
            );
        }
    }

    const typeKindRe = /\b(?:export\s+)?type\s+EntityKind\b/g;
    while ((match = typeKindRe.exec(text))) {
        if (!relative.endsWith('entityIdentityCore.ts') && !relative.endsWith('worldIntentCore.ts')) {
            pushIssue(
                issues,
                file,
                lineOf(text, match.index),
                'duplicate-EntityKind',
                'warn',
                'EntityKind is locally declared; verify it is intentionally wider/narrower than the terminology contract.'
            );
        }
    }

    const severityRe = /\.severity\s*(?:===|!==)\s*['"`](info|warning|critical)['"`]/g;
    while ((match = severityRe.exec(text))) {
        const line = lineOf(text, match.index);
        const windowStart = Math.max(0, match.index - 220);
        const windowEnd = Math.min(text.length, match.index + 220);
        const nearby = text.slice(windowStart, windowEnd);
        const hasCompositeSignal = /\.category\s*(?:===|!==)|evaluate[A-Za-z]+Event|is[A-Za-z]+Event|messageHas|\.message|includes\s*\(/.test(nearby);
        pushIssue(
            issues,
            file,
            line,
            'severity-literal-check',
            'warn',
            hasCompositeSignal
                ? 'World event severity literal is used with nearby composite signals; keep it out of sole semantic classification.'
                : 'World event severity literal appears to stand alone; review against EVENT_CLASSIFICATION_GLOSSARY.md.'
        );
    }

    const worldTurnInterfaceRe = /\binterface\s+\w+[^{]*{[^}]*\bworldTurn\s*:/gs;
    while ((match = worldTurnInterfaceRe.exec(text))) {
        pushIssue(
            issues,
            file,
            lineOf(text, match.index),
            'clockref-candidate',
            'warn',
            'worldTurn remains a wire/runtime number. If this is a new cross-ledger contract, consider a ClockRef adapter instead of field renaming.'
        );
    }

    const legacyWireFields = ['marketLocationId', 'discoveryId', 'npcId', 'locationId'];
    for (const field of legacyWireFields) {
        const re = new RegExp(`\\b${field}\\b`, 'g');
        while ((match = re.exec(text))) {
            pushIssue(
                issues,
                file,
                lineOf(text, match.index),
                'legacy-id-wire-field',
                'warn',
                `${field} is a legacy wire field. Keep it stable in JSON/TurnResult; convert to EntityRef only inside explicit adapters.`
            );
            break;
        }
    }
}

function main() {
    const issues = [];
    for (const file of walk(SRC_DIR)) {
        scanFile(file, issues);
    }

    const warnings = issues.filter((i) => i.severity === 'warn');
    const failures = issues.filter((i) => i.severity === 'fail');

    for (const issue of issues) {
        console.log(`${issue.severity.toUpperCase()} ${issue.ruleId} ${issue.file}:${issue.line} - ${issue.message}`);
    }
    console.log(`Terminology contract check: ${warnings.length} warning(s), ${failures.length} failure(s).`);

    if (failures.length > 0) {
        process.exit(1);
    }
}

main();

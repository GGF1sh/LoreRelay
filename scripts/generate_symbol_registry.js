#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const GENERATED_DIR = path.join(ROOT, 'docs', 'generated');
const JSON_PATH = path.join(GENERATED_DIR, 'symbol_registry.json');
const MD_PATH = path.join(GENERATED_DIR, 'SYMBOL_REGISTRY.md');
const SCRIPT_NAME = 'scripts/generate_symbol_registry.js';
const NOTICE = 'DO NOT EDIT MANUALLY. Generated from source code by `npm run generate:symbol-registry`.';

const SOURCE_EXTENSIONS = new Set(['.ts', '.js']);
const IGNORE_DIRS = new Set(['.git', 'node_modules', 'out']);

function rel(file) {
    return path.relative(ROOT, file).replace(/\\/g, '/');
}

function stableSlug(value) {
    return String(value)
        .replace(/\\/g, '/')
        .replace(/[^A-Za-z0-9_.:/-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function walk(dir, extensions, out = []) {
    if (!fs.existsSync(dir)) { return out; }
    const entries = fs.readdirSync(dir, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
        if (IGNORE_DIRS.has(entry.name)) { continue; }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, extensions, out);
        } else if (entry.isFile() && extensions.has(path.extname(entry.name))) {
            out.push(full);
        }
    }
    return out;
}

function lineOf(sourceFile, pos) {
    return sourceFile.getLineAndCharacterOfPosition(Math.max(0, pos)).line + 1;
}

function lineOfText(text, pos) {
    return text.slice(0, Math.max(0, pos)).split(/\r?\n/).length;
}

function hasModifier(node, kind) {
    return Boolean(node.modifiers?.some((m) => m.kind === kind));
}

function isExportedNode(node) {
    return hasModifier(node, ts.SyntaxKind.ExportKeyword)
        || hasModifier(node, ts.SyntaxKind.DefaultKeyword);
}

function cleanOneLine(text, max = 280) {
    const one = String(text ?? '')
        .replace(/\r?\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

function jsDocDescription(node) {
    const docs = node.jsDoc;
    if (!docs || docs.length === 0) { return undefined; }
    const comments = docs
        .map((doc) => typeof doc.comment === 'string' ? doc.comment.trim() : '')
        .filter(Boolean);
    return comments.length ? cleanOneLine(comments.join(' '), 360) : undefined;
}

function signatureFromRange(sourceFile, node, fallbackName) {
    const text = sourceFile.getFullText();
    const start = node.getStart(sourceFile);
    let end = node.end;
    if (node.body) {
        end = node.body.getStart(sourceFile);
    } else if (node.members && node.members.pos > start) {
        end = node.members.pos;
    }
    const semi = text.indexOf(';', start);
    if (semi !== -1 && semi < end) {
        end = semi + 1;
    }
    const equals = text.indexOf('=', start);
    if (equals !== -1 && equals < end && ts.isVariableStatement(node)) {
        end = equals;
    }
    const raw = text.slice(start, end).replace(/\{$/, '').trim();
    return cleanOneLine(raw || fallbackName);
}

function categoryFromSource(sourcePath, boundary) {
    if (boundary === 'configuration') { return 'configuration'; }
    if (boundary === 'host-webview') { return 'host-webview-protocol'; }
    if (sourcePath.startsWith('webview/modules/')) { return 'webview'; }
    const base = path.basename(sourcePath, path.extname(sourcePath));
    const stripped = base
        .replace(/Core$/, '')
        .replace(/Bridge$/, '')
        .replace(/Manager$/, '')
        .replace(/State$/, '')
        .replace(/View$/, 'View');
    return stripped
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/_/g, '-')
        .toLowerCase();
}

function boundaryFor(sourcePath, kind) {
    if (kind === 'configurationKey') { return 'configuration'; }
    if (kind === 'messageType') { return 'host-webview'; }
    if (sourcePath.startsWith('webview/modules/')) { return 'webview'; }
    if (sourcePath.startsWith('src/types/')) { return 'schema-types'; }
    if (/Types\.ts$/.test(sourcePath)) { return 'pure-core'; }
    if (/Core\.ts$/.test(sourcePath)) { return 'pure-core'; }
    if (/Bridge\.ts$/.test(sourcePath)) { return 'host-bridge'; }
    return 'host';
}

function makeEntry(input) {
    const boundary = input.boundary ?? boundaryFor(input.sourcePath, input.kind);
    const category = input.category ?? categoryFromSource(input.sourcePath, boundary);
    const directionPart = input.direction ? `:${input.direction}` : '';
    const baseId = stableSlug(`${boundary}:${input.kind}${directionPart}:${input.sourcePath}:${input.name}`);
    const entry = {
        id: baseId,
        name: input.name,
        kind: input.kind,
        sourcePath: input.sourcePath,
        line: input.line,
        signature: input.signature,
        public: input.public,
        boundary,
        category,
    };
    if (input.direction) { entry.direction = input.direction; }
    if (input.description) { entry.description = input.description; }
    return entry;
}

function getNameText(node) {
    if (!node) { return undefined; }
    if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
        return node.text;
    }
    return undefined;
}

function collectExportNames(sourceFile) {
    const names = new Set();
    for (const statement of sourceFile.statements) {
        if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
            for (const specifier of statement.exportClause.elements) {
                names.add(specifier.name.text);
            }
        }
    }
    return names;
}

function addTsDeclaration(entries, sourceFile, sourcePath, node, kind, name, exported) {
    entries.push(makeEntry({
        name,
        kind,
        sourcePath,
        line: lineOf(sourceFile, node.getStart(sourceFile)),
        signature: signatureFromRange(sourceFile, node, name),
        public: exported ? 'exported' : 'module',
        description: jsDocDescription(node),
    }));
}

function collectTsExports(file) {
    const text = fs.readFileSync(file, 'utf8');
    const sourcePath = rel(file);
    const sourceFile = ts.createSourceFile(sourcePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const exportNames = collectExportNames(sourceFile);
    const entries = [];

    for (const statement of sourceFile.statements) {
        if (ts.isFunctionDeclaration(statement)) {
            const name = statement.name?.text ?? 'default';
            const exported = isExportedNode(statement) || exportNames.has(name);
            if (exported) {
                addTsDeclaration(entries, sourceFile, sourcePath, statement, 'function', name, true);
            }
        } else if (ts.isClassDeclaration(statement)) {
            const name = statement.name?.text ?? 'default';
            const exported = isExportedNode(statement) || exportNames.has(name);
            if (exported) {
                addTsDeclaration(entries, sourceFile, sourcePath, statement, 'class', name, true);
            }
        } else if (ts.isInterfaceDeclaration(statement)) {
            const name = statement.name.text;
            const exported = isExportedNode(statement) || exportNames.has(name);
            if (exported) {
                addTsDeclaration(entries, sourceFile, sourcePath, statement, 'interface', name, true);
            }
        } else if (ts.isTypeAliasDeclaration(statement)) {
            const name = statement.name.text;
            const exported = isExportedNode(statement) || exportNames.has(name);
            if (exported) {
                addTsDeclaration(entries, sourceFile, sourcePath, statement, 'type', name, true);
            }
        } else if (ts.isEnumDeclaration(statement)) {
            const name = statement.name.text;
            const exported = isExportedNode(statement) || exportNames.has(name);
            if (exported) {
                addTsDeclaration(entries, sourceFile, sourcePath, statement, 'enum', name, true);
            }
        } else if (ts.isVariableStatement(statement)) {
            const exportedStatement = isExportedNode(statement);
            const declarationKind = (statement.declarationList.flags & ts.NodeFlags.Const) ? 'constant' : 'variable';
            for (const decl of statement.declarationList.declarations) {
                const name = getNameText(decl.name);
                if (!name) { continue; }
                const exported = exportedStatement || exportNames.has(name);
                if (!exported) { continue; }
                entries.push(makeEntry({
                    name,
                    kind: declarationKind,
                    sourcePath,
                    line: lineOf(sourceFile, decl.getStart(sourceFile)),
                    signature: cleanOneLine(`${statement.modifiers?.map((m) => m.getText(sourceFile)).join(' ') || 'export'} ${declarationKind === 'constant' ? 'const' : 'let'} ${name}`),
                    public: 'exported',
                    description: jsDocDescription(statement) ?? jsDocDescription(decl),
                }));
            }
        }
    }

    return entries;
}

function getPropertyName(node) {
    if (!node) { return undefined; }
    if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
        return node.text;
    }
    return undefined;
}

function isTypePropertyAccess(expr) {
    return ts.isPropertyAccessExpression(expr) && expr.name.text === 'type';
}

function stringLiteralValue(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        return node.text;
    }
    return undefined;
}

function postMessageDirection(sourcePath, call) {
    const exprText = call.expression.getText();
    if (sourcePath.startsWith('webview/modules/') && exprText.includes('vscode.postMessage')) {
        return 'webview-to-host';
    }
    if (sourcePath.startsWith('src/') && exprText.endsWith('.postMessage')) {
        return 'host-to-webview';
    }
    return 'postMessage';
}

function collectTypeFromObjectLiteral(arg) {
    if (!ts.isObjectLiteralExpression(arg)) { return undefined; }
    for (const prop of arg.properties) {
        if (!ts.isPropertyAssignment(prop)) { continue; }
        if (getPropertyName(prop.name) !== 'type') { continue; }
        return stringLiteralValue(prop.initializer);
    }
    return undefined;
}

function addMessageType(entries, seen, sourceFile, sourcePath, node, name, direction) {
    if (!name) { return; }
    const key = `${sourcePath}|${name}|${direction}`;
    if (seen.has(key)) { return; }
    seen.add(key);
    entries.push(makeEntry({
        name,
        kind: 'messageType',
        sourcePath,
        line: lineOf(sourceFile, node.getStart(sourceFile)),
        signature: `type: "${name}" (${direction})`,
        public: 'protocol',
        direction,
    }));
}

function collectMessageTypes(file) {
    const text = fs.readFileSync(file, 'utf8');
    const sourcePath = rel(file);
    const kind = sourcePath.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(sourcePath, text, ts.ScriptTarget.Latest, true, kind);
    const entries = [];
    const seen = new Set();

    function visit(node) {
        if (ts.isCallExpression(node)
            && ts.isPropertyAccessExpression(node.expression)
            && node.expression.name.text === 'postMessage'
            && node.arguments.length > 0) {
            const name = collectTypeFromObjectLiteral(node.arguments[0]);
            addMessageType(entries, seen, sourceFile, sourcePath, node, name, postMessageDirection(sourcePath, node));
        } else if (ts.isSwitchStatement(node) && isTypePropertyAccess(node.expression)) {
            for (const clause of node.caseBlock.clauses) {
                if (ts.isCaseClause(clause)) {
                    addMessageType(entries, seen, sourceFile, sourcePath, clause, stringLiteralValue(clause.expression), 'received');
                }
            }
        } else if (ts.isBinaryExpression(node)
            && (node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken || node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken)) {
            if (isTypePropertyAccess(node.left)) {
                addMessageType(entries, seen, sourceFile, sourcePath, node, stringLiteralValue(node.right), 'received');
            } else if (isTypePropertyAccess(node.right)) {
                addMessageType(entries, seen, sourceFile, sourcePath, node, stringLiteralValue(node.left), 'received');
            }
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return entries;
}

function collectWebviewTopLevel(file) {
    const text = fs.readFileSync(file, 'utf8');
    const sourcePath = rel(file);
    const sourceFile = ts.createSourceFile(sourcePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const entries = [];
    const seenWindow = new Set();

    for (const statement of sourceFile.statements) {
        if (ts.isFunctionDeclaration(statement) && statement.name) {
            entries.push(makeEntry({
                name: statement.name.text,
                kind: 'webviewFunction',
                sourcePath,
                line: lineOf(sourceFile, statement.getStart(sourceFile)),
                signature: signatureFromRange(sourceFile, statement, statement.name.text),
                public: 'module-top-level',
                boundary: 'webview',
                category: 'webview',
                description: jsDocDescription(statement),
            }));
        }
    }

    function visit(node) {
        if (ts.isBinaryExpression(node)
            && node.operatorToken.kind === ts.SyntaxKind.FirstAssignment
            && ts.isPropertyAccessExpression(node.left)
            && ts.isIdentifier(node.left.expression)
            && (node.left.expression.text === 'window' || node.left.expression.text === 'globalThis')) {
            const name = node.left.name.text;
            const key = `${sourcePath}|${name}`;
            if (!seenWindow.has(key)) {
                seenWindow.add(key);
                entries.push(makeEntry({
                    name,
                    kind: 'windowApi',
                    sourcePath,
                    line: lineOf(sourceFile, node.getStart(sourceFile)),
                    signature: `${node.left.expression.text}.${name}`,
                    public: 'public',
                    boundary: 'webview',
                    category: 'webview',
                }));
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(sourceFile);

    return entries;
}

function configSignature(key, value) {
    const type = Array.isArray(value.type) ? value.type.join('|') : value.type;
    const hasDefault = Object.prototype.hasOwnProperty.call(value, 'default');
    const defaultText = hasDefault ? ` = ${JSON.stringify(value.default)}` : '';
    return cleanOneLine(`${key}: ${type ?? 'unknown'}${defaultText}`, 220);
}

function collectConfigurationKeys() {
    const file = path.join(ROOT, 'package.json');
    const text = fs.readFileSync(file, 'utf8');
    const pkg = JSON.parse(text);
    const props = pkg.contributes?.configuration?.properties ?? {};
    return Object.keys(props).sort().map((key) => {
        const value = props[key] ?? {};
        const idx = text.indexOf(`"${key}"`);
        return makeEntry({
            name: key,
            kind: 'configurationKey',
            sourcePath: 'package.json',
            line: lineOfText(text, idx),
            signature: configSignature(key, value),
            public: 'public',
            boundary: 'configuration',
            category: 'configuration',
            description: typeof value.description === 'string' ? cleanOneLine(value.description, 360) : undefined,
        });
    });
}

function sortEntries(entries) {
    return [...entries].sort((a, b) => {
        const fields = ['category', 'boundary', 'kind', 'sourcePath', 'line', 'name', 'signature'];
        for (const field of fields) {
            const av = a[field];
            const bv = b[field];
            if (typeof av === 'number' || typeof bv === 'number') {
                const diff = Number(av ?? 0) - Number(bv ?? 0);
                if (diff !== 0) { return diff; }
            } else {
                const cmp = String(av ?? '').localeCompare(String(bv ?? ''));
                if (cmp !== 0) { return cmp; }
            }
        }
        return 0;
    });
}

function ensureUniqueIds(entries) {
    const counts = new Map();
    return entries.map((entry) => {
        const count = (counts.get(entry.id) ?? 0) + 1;
        counts.set(entry.id, count);
        if (count === 1) { return entry; }
        return { ...entry, id: `${entry.id}~${count}` };
    });
}

function countBy(entries, field) {
    const out = {};
    for (const entry of entries) {
        const key = entry[field] ?? 'unknown';
        out[key] = (out[key] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function buildRegistry() {
    const entries = [];
    const tsFiles = walk(path.join(ROOT, 'src'), new Set(['.ts']));
    const webviewFiles = walk(path.join(ROOT, 'webview', 'modules'), new Set(['.js']));

    for (const file of tsFiles) {
        entries.push(...collectTsExports(file));
        entries.push(...collectMessageTypes(file));
    }
    for (const file of webviewFiles) {
        entries.push(...collectWebviewTopLevel(file));
        entries.push(...collectMessageTypes(file));
    }
    entries.push(...collectConfigurationKeys());

    const sorted = ensureUniqueIds(sortEntries(entries));
    return {
        schemaVersion: 1,
        notice: NOTICE,
        generatedBy: SCRIPT_NAME,
        deterministic: true,
        layers: {
            generatedSymbolRegistry: 'Generated from code. Use for symbol lookup and source navigation.',
            curatedTerminology: [
                'docs/TERMINOLOGY_CONTRACT.md',
                'docs/EVENT_CLASSIFICATION_GLOSSARY.md',
            ],
            note: 'This registry does not replace curated terminology contracts.',
        },
        scan: {
            include: [
                'src/**/*.ts',
                'webview/modules/**/*.js',
                'package.json contributes.configuration.properties',
            ],
            exclude: [
                'webview/script.js',
                'node_modules/',
                'out/',
            ],
        },
        counts: {
            total: sorted.length,
            byBoundary: countBy(sorted, 'boundary'),
            byCategory: countBy(sorted, 'category'),
            byKind: countBy(sorted, 'kind'),
        },
        entries: sorted,
    };
}

function renderJson(registry) {
    return `${JSON.stringify(registry, null, 2)}\n`;
}

function mdEscape(value) {
    return String(value ?? '')
        .replace(/\|/g, '\\|')
        .replace(/\r?\n/g, ' ')
        .trim();
}

function renderCounts(title, counts) {
    const lines = [`## ${title}`, '', '| Name | Count |', '| --- | ---: |'];
    for (const [name, count] of Object.entries(counts)) {
        lines.push(`| ${mdEscape(name)} | ${count} |`);
    }
    lines.push('');
    return lines.join('\n');
}

function renderMarkdown(registry) {
    const lines = [
        '# Symbol Registry',
        '',
        `> ${NOTICE}`,
        '',
        'This registry is generated deterministically from repository source code. It is a navigation index for symbols and protocols; it does not replace curated terminology contracts.',
        '',
        `Generated by: \`${registry.generatedBy}\``,
        '',
        `Total entries: ${registry.counts.total}`,
        '',
        renderCounts('Counts By Boundary', registry.counts.byBoundary),
        renderCounts('Counts By Category', registry.counts.byCategory),
        renderCounts('Counts By Kind', registry.counts.byKind),
        '## Entries',
        '',
        '| ID | Name | Kind | Boundary | Category | Source | Public | Signature | Description |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ];
    for (const entry of registry.entries) {
        const source = `${entry.sourcePath}:${entry.line}`;
        lines.push([
            entry.id,
            entry.name,
            entry.kind,
            entry.boundary,
            entry.category,
            source,
            entry.public,
            entry.signature,
            entry.description ?? '',
        ].map(mdEscape).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
    }
    lines.push('');
    return lines.join('\n');
}

function writeGenerated(registry) {
    fs.mkdirSync(GENERATED_DIR, { recursive: true });
    fs.writeFileSync(JSON_PATH, renderJson(registry), 'utf8');
    fs.writeFileSync(MD_PATH, renderMarkdown(registry), 'utf8');
}

function normalizeGeneratedForCheck(content) {
    return String(content).replace(/\r\n/g, '\n');
}

function generatedContentMatches(actual, expected) {
    return normalizeGeneratedForCheck(actual) === normalizeGeneratedForCheck(expected);
}

function checkGenerated(registry) {
    const expected = new Map([
        [JSON_PATH, renderJson(registry)],
        [MD_PATH, renderMarkdown(registry)],
    ]);
    const stale = [];
    for (const [file, content] of expected) {
        if (!fs.existsSync(file) || !generatedContentMatches(fs.readFileSync(file, 'utf8'), content)) {
            stale.push(rel(file));
        }
    }
    if (stale.length > 0) {
        console.error('Symbol Registry generated files are stale:');
        for (const file of stale) {
            console.error(`  ${file}`);
        }
        console.error('Run `npm run generate:symbol-registry`.');
        return false;
    }
    return true;
}

function printSummary(registry) {
    console.log(`Symbol Registry entries: ${registry.counts.total}`);
    console.log(`By kind: ${JSON.stringify(registry.counts.byKind)}`);
    console.log(`By category: ${JSON.stringify(registry.counts.byCategory)}`);
}

function main(argv = process.argv.slice(2)) {
    const registry = buildRegistry();
    if (argv.includes('--write')) {
        writeGenerated(registry);
        printSummary(registry);
        return 0;
    }
    if (argv.includes('--check')) {
        const ok = checkGenerated(registry);
        if (ok) {
            console.log('Symbol Registry generated files are up to date.');
            printSummary(registry);
        }
        return ok ? 0 : 1;
    }
    console.error('Usage: node scripts/generate_symbol_registry.js --write|--check');
    printSummary(registry);
    return 2;
}

if (require.main === module) {
    process.exit(main());
}

module.exports = {
    buildRegistry,
    renderJson,
    renderMarkdown,
    checkGenerated,
    generatedContentMatches,
    normalizeGeneratedForCheck,
    writeGenerated,
    NOTICE,
    JSON_PATH,
    MD_PATH,
};

#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REGISTRY_PATH = path.join(ROOT, 'docs', 'generated', 'symbol_registry.json');
const TERMINOLOGY_PATH = path.join(ROOT, 'docs', 'TERMINOLOGY_CONTRACT.md');
const EVENT_GLOSSARY_PATH = path.join(ROOT, 'docs', 'EVENT_CLASSIFICATION_GLOSSARY.md');
const DEFAULT_LIMIT = 8;

function rel(filePath) {
    return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function usage() {
    return [
        'Usage: npm run knowledge -- <query>',
        '',
        'Searches:',
        '- docs/generated/symbol_registry.json',
        '- docs/TERMINOLOGY_CONTRACT.md',
        '- docs/EVENT_CLASSIFICATION_GLOSSARY.md',
    ].join('\n');
}

function normalizeQuery(argv) {
    return argv.join(' ').trim();
}

function haystack(entry) {
    return [
        entry.name,
        entry.kind,
        entry.boundary,
        entry.category,
        entry.sourcePath,
        entry.signature,
        entry.description,
        entry.direction,
    ].filter(Boolean).join(' ');
}

function loadRegistry() {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
}

function findRegistryMatches(entries, query) {
    const q = query.toLowerCase();
    return entries
        .filter((entry) => haystack(entry).toLowerCase().includes(q))
        .sort((a, b) => {
            const exact = Number(b.name.toLowerCase() === q) - Number(a.name.toLowerCase() === q);
            if (exact !== 0) { return exact; }
            const nameCmp = a.name.localeCompare(b.name);
            if (nameCmp !== 0) { return nameCmp; }
            return `${a.sourcePath}:${a.line}`.localeCompare(`${b.sourcePath}:${b.line}`);
        });
}

function formatSymbol(entry) {
    const parts = [
        `- ${entry.name}`,
        `kind=${entry.kind}`,
        `boundary=${entry.boundary}`,
        `category=${entry.category}`,
        `source=${entry.sourcePath}:${entry.line}`,
    ];
    if (entry.direction) {
        parts.push(`direction=${entry.direction}`);
    }
    return parts.join(' | ');
}

function summarizeLocations(entries) {
    if (entries.length === 0) { return 'none'; }
    return entries
        .map((entry) => `${entry.sourcePath}:${entry.line}`)
        .sort()
        .join(', ');
}

function protocolStatus(group) {
    const hostSenders = group.filter((entry) => entry.direction === 'host-to-webview');
    const webviewSenders = group.filter((entry) => entry.direction === 'webview-to-host');
    const receivers = group.filter((entry) => entry.direction === 'received');
    const hasSender = hostSenders.length > 0 || webviewSenders.length > 0;
    const paired = hasSender && receivers.length > 0;
    return paired ? 'paired' : 'unpaired';
}

function formatProtocolGroups(messageEntries) {
    const byName = new Map();
    for (const entry of messageEntries) {
        const list = byName.get(entry.name) ?? [];
        list.push(entry);
        byName.set(entry.name, list);
    }
    const lines = ['Protocol pairs:'];
    for (const [name, group] of [...byName.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const hostSenders = group.filter((entry) => entry.direction === 'host-to-webview');
        const webviewSenders = group.filter((entry) => entry.direction === 'webview-to-host');
        const receivers = group.filter((entry) => entry.direction === 'received');
        lines.push(`- ${name} | ${protocolStatus(group)}`);
        lines.push(`  host-to-webview senders: ${summarizeLocations(hostSenders)}`);
        lines.push(`  webview-to-host senders: ${summarizeLocations(webviewSenders)}`);
        lines.push(`  receivers: ${summarizeLocations(receivers)}`);
    }
    return lines;
}

function findDocMatches(filePath, query, max = 5) {
    const q = query.toLowerCase();
    const text = fs.readFileSync(filePath, 'utf8');
    return text.split(/\r?\n/).flatMap((line, index) => {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.toLowerCase().includes(q)) { return []; }
        return [{
            sourcePath: rel(filePath),
            line: index + 1,
            text: trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed,
        }];
    }).slice(0, max);
}

function formatDocMatches(title, matches) {
    if (matches.length === 0) { return []; }
    return [
        `${title}:`,
        ...matches.map((match) => `- ${match.sourcePath}:${match.line} | ${match.text}`),
    ];
}

function runLookup(query, options = {}) {
    const limit = options.limit ?? DEFAULT_LIMIT;
    const registry = loadRegistry();
    const registryMatches = findRegistryMatches(registry.entries, query);
    const symbolMatches = registryMatches.slice(0, limit);
    const messageEntries = registryMatches.filter((entry) => entry.kind === 'messageType');
    const terminologyMatches = findDocMatches(TERMINOLOGY_PATH, query);
    const eventMatches = findDocMatches(EVENT_GLOSSARY_PATH, query);
    const lines = [
        `Knowledge lookup: "${query}"`,
        '',
    ];

    if (symbolMatches.length > 0) {
        lines.push(`Symbol Registry (${symbolMatches.length}/${registryMatches.length} shown):`);
        lines.push(...symbolMatches.map(formatSymbol));
    } else {
        lines.push('Symbol Registry: no matches');
    }

    if (messageEntries.length > 0) {
        lines.push('');
        lines.push(...formatProtocolGroups(messageEntries));
    }

    const docLines = [
        ...formatDocMatches('Terminology Contract', terminologyMatches),
        ...formatDocMatches('Event Classification Glossary', eventMatches),
    ];
    if (docLines.length > 0) {
        lines.push('');
        lines.push(...docLines);
    } else {
        lines.push('');
        lines.push('Curated docs: no matches');
    }

    if (registryMatches.length === 0 && terminologyMatches.length === 0 && eventMatches.length === 0) {
        lines.push('');
        lines.push('No matches found.');
    }
    return lines.join('\n');
}

function main(argv = process.argv.slice(2)) {
    const query = normalizeQuery(argv);
    if (!query || argv.includes('--help') || argv.includes('-h')) {
        console.log(usage());
        return query ? 0 : 2;
    }
    console.log(runLookup(query));
    return 0;
}

if (require.main === module) {
    process.exit(main());
}

module.exports = {
    findRegistryMatches,
    formatProtocolGroups,
    runLookup,
    usage,
};

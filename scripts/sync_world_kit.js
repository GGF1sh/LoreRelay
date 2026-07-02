#!/usr/bin/env node
'use strict';

/**
 * Copy @lorerelay/world-kit cores into text-adventure-vsce/src.
 * Renames types.ts -> livingWorldTypes.ts and fixes imports.
 */

const fs = require('fs');
const path = require('path');

const KIT_SRC = path.join(__dirname, '..', '..', 'lorerelay-world-kit', 'src');
const OUT_SRC = path.join(__dirname, '..', 'src');

const FILES = [
    'commerceCore.ts',
    'transportCore.ts',
    'worldSimCommerceCore.ts',
    'npcAgencyCore.ts',
    'livingWorldPromptCore.ts',
    'worldKitTickCore.ts',
];

if (!fs.existsSync(KIT_SRC)) {
    console.error(`world-kit not found: ${KIT_SRC}`);
    process.exit(1);
}

for (const file of FILES) {
    const src = path.join(KIT_SRC, file);
    if (!fs.existsSync(src)) {
        console.error(`missing: ${src}`);
        process.exit(1);
    }
    let text = fs.readFileSync(src, 'utf-8');
    text = text.replace(/from '\.\/types'/g, "from './livingWorldTypes'");
    fs.writeFileSync(path.join(OUT_SRC, file), text, 'utf-8');
    console.log(`synced ${file}`);
}

const typesSrc = path.join(KIT_SRC, 'types.ts');
if (fs.existsSync(typesSrc)) {
    fs.writeFileSync(path.join(OUT_SRC, 'livingWorldTypes.ts'), fs.readFileSync(typesSrc, 'utf-8'), 'utf-8');
    console.log('synced livingWorldTypes.ts');
}

console.log('world-kit sync complete.');
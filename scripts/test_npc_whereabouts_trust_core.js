#!/usr/bin/env node
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const modPath = path.join(root, 'out', 'npcWhereaboutsTrustCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!require('fs').existsSync(modPath)) {
    fail('out/npcWhereaboutsTrustCore.js missing — run npm run compile');
    process.exit(1);
}

const {
    resolveWhereaboutsPrecision,
    readNpcPlayerTrust,
    formatWhereaboutsForDisplay,
    formatWhereaboutsGmLine,
    TRUST_WHEREABOUTS_EXACT_MIN,
    TRUST_WHEREABOUTS_UNKNOWN_MAX,
} = require(modPath);

const ctx = {
    locationNames: { elda_shop: 'Elda Shop', south_port: 'South Port' },
    regionNames: { r_central: 'Central Plains', r_south: 'Southern Coast' },
    locationToRegion: { elda_shop: 'r_central', south_port: 'r_south' },
};

{
    if (resolveWhereaboutsPrecision(80) !== 'exact') { fail('high trust exact'); }
    else { ok('high trust exact'); }
}

{
    if (resolveWhereaboutsPrecision(20) !== 'unknown') { fail('low trust unknown'); }
    else { ok('low trust unknown'); }
}

{
    if (resolveWhereaboutsPrecision(50) !== 'approximate') { fail('mid trust approximate'); }
    else { ok('mid trust approximate'); }
}

{
    if (readNpcPlayerTrust(undefined) !== 50) { fail('default trust'); }
    else { ok('default trust'); }
}

{
    const f = formatWhereaboutsForDisplay('unknown', 'elda_shop', false, ctx);
    if (f.precision !== 'unknown' || f.showReason) { fail('unknown display'); }
    else { ok('unknown display'); }
}

{
    const f = formatWhereaboutsForDisplay('approximate', 'south_port', true, ctx);
    if (!f.locationLabel.includes('Southern Coast') || f.showReason) { fail('approximate transit'); }
    else { ok('approximate transit'); }
}

{
    const line = formatWhereaboutsGmLine(
        {
            name: 'Elda',
            locationId: 'elda_shop',
            inTransit: false,
            arrivesTurn: 5,
            agenda: 'restock_wheat',
            reason: 'food_crisis_buy_wheat',
        },
        TRUST_WHEREABOUTS_UNKNOWN_MAX,
        ctx,
        (r) => r || ''
    );
    if (!line.includes('whereabouts unknown')) { fail('gm unknown line'); }
    else { ok('gm unknown line'); }
}

{
    const line = formatWhereaboutsGmLine(
        {
            name: 'Elda',
            locationId: 'elda_shop',
            inTransit: false,
            arrivesTurn: 5,
            agenda: 'restock_wheat',
            reason: 'food_crisis_buy_wheat',
        },
        TRUST_WHEREABOUTS_EXACT_MIN,
        ctx,
        (r) => r || ''
    );
    if (!line.includes('Elda Shop') || !line.includes('restock_wheat')) { fail('gm exact line'); }
    else { ok('gm exact line'); }
}

{
    const line = formatWhereaboutsGmLine(
        {
            name: 'Elda',
            locationId: 'south_port',
            inTransit: true,
            arrivesTurn: 8,
            agenda: undefined,
            reason: undefined,
        },
        50,
        ctx,
        (r) => r || ''
    );
    if (line.includes('en route to heading toward') || !line.includes('heading toward Southern Coast')) {
        fail(`gm approximate transit should not double-prefix: ${line}`);
    } else {
        ok('gm approximate transit wording');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('npcWhereaboutsTrustCore: all tests passed.');
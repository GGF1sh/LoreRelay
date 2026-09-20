'use strict';

const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'cartographyThemeStyles.json');
const dest = path.join(__dirname, 'cartographyThemeStyles.json');

if (!fs.existsSync(src)) {
    console.error('FAIL: missing src/cartographyThemeStyles.json');
    process.exit(1);
}

fs.copyFileSync(src, dest);
console.log('Synced cartographyThemeStyles.json -> scripts/');
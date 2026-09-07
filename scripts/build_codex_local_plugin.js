'use strict';
const fs = require('fs');
const path = require('path');
const { build } = require('./build_ai_client_bundle');

function buildPlugin(parent) {
    const target = path.resolve(parent, 'lorerelay-player');
    // Keep this local source directory after installing: the command references its
    // bundled adapter, independent of the client's plugin cache layout.
    build(target, 'player');
    const source = path.resolve(__dirname, '../integrations/lorerelay-player');
    for (const directory of ['.codex-plugin', 'skills']) {
        fs.cpSync(path.join(source, directory), path.join(target, directory), { recursive: true });
    }
    const config = { mcpServers: { 'lorerelay-player': {
        command: 'node', args: [path.join(target, 'server', 'playerMcp.js')],
        env_vars: ['LORERELAY_AGENT_ENDPOINT', 'LORERELAY_AGENT_SECRET'],
    } } };
    fs.writeFileSync(path.join(target, '.mcp.json'), JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
    fs.writeFileSync(path.join(target, 'README.md'),
        '# LoreRelay local Codex plugin\n\nKeep this directory at its current path after installation. '
        + 'The MCP command references the bundled server here. Rebuild if relocating it.\n\n'
        + 'Before starting Codex, supply LORERELAY_AGENT_ENDPOINT and LORERELAY_AGENT_SECRET '
        + 'from the current LoreRelay Player connection in the client process environment. '
        + 'The plugin contains no credentials. Approve the campaign/session in LoreRelay. '
        + 'After expiry or reload, restart the client with fresh connection values.\n');
    return target;
}
if (require.main === module) {
    if (process.argv.length !== 3) throw new Error('usage: node scripts/build_codex_local_plugin.js NEW_PARENT_DIRECTORY');
    console.log(buildPlugin(process.argv[2]));
}
module.exports = { buildPlugin };

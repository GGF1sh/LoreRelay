'use strict';
// Build a portable MCPB directory using only the already-installed adapter dependencies.
// No campaign files, runtime environment values, shell commands or network requests.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

function build(destination, role) {
    if (!['player', 'narrator', 'companion'].includes(role)) throw new Error('invalid role');
    const target = path.resolve(destination);
    if (fs.existsSync(target)) throw new Error('destination must not exist');
    const modules = new Map();
    function collect(name, from) {
        let directory = path.dirname(require.resolve(name, { paths: [from] }));
        let metadata;
        while (true) {
            const file = path.join(directory, 'package.json');
            if (fs.existsSync(file)) {
                const candidate = JSON.parse(fs.readFileSync(file, 'utf8'));
                if (candidate.name === name) { metadata = candidate; break; }
            }
            const parent = path.dirname(directory);
            if (parent === directory) throw new Error(`unresolved dependency ${name}`);
            directory = parent;
        }
        if (modules.has(name)) {
            if (modules.get(name).version !== metadata.version) throw new Error(`dependency version conflict: ${name}`);
            return;
        }
        modules.set(name, { directory, version: metadata.version });
        for (const dependency of Object.keys(metadata.dependencies || {})) collect(dependency, directory);
    }
    collect('@modelcontextprotocol/server', root);
    collect('zod', root);
    // Validate compiled files before creating the output directory.
    const files = [`${role}Mcp.js`, 'mcpAdapter.js'];
    for (const file of files) fs.accessSync(path.join(root, 'out', file));
    fs.mkdirSync(path.join(target, 'server'), { recursive: true });
    for (const file of files) fs.copyFileSync(path.join(root, 'out', file), path.join(target, 'server', file));
    for (const [name, value] of modules) fs.cpSync(value.directory, path.join(target, 'node_modules', name), {
        recursive: true, dereference: true,
        filter: source => !path.relative(value.directory, source).split(path.sep).includes('node_modules'),
    });
    const manifest = {
        manifest_version: '0.3', name: `lorerelay-${role}`, version: '1.0.0',
        description: role === 'player' ? 'Host-approved LoreRelay Commerce actions.' : 'Read-only LoreRelay committed public facts.',
        author: { name: 'LoreRelay' },
        server: { type: 'node', entry_point: `server/${role}Mcp.js`, mcp_config: {
            command: 'node', args: [`\${__dirname}/server/${role}Mcp.js`],
            env: { LORERELAY_AGENT_ENDPOINT: '${user_config.endpoint}', LORERELAY_AGENT_SECRET: '${user_config.secret}' },
        } },
        user_config: {
            endpoint: { type: 'string', title: 'Host endpoint', description: 'Copy from LoreRelay AI Connections. Expires on disconnect or reload.', required: true },
            secret: { type: 'string', title: 'Connection secret', description: 'Copy from the same Host connection. Never share this value.', required: true, sensitive: true },
        },
    };
    fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    fs.writeFileSync(path.join(target, 'BUILD.json'), JSON.stringify({ dependencies: Object.fromEntries([...modules].map(([name, value]) => [name, value.version])) }, null, 2) + '\n');
    return target;
}
if (require.main === module) {
    if (process.argv.length !== 4) throw new Error('usage: node scripts/build_ai_client_bundle.js NEW_DIRECTORY player|narrator|companion');
    console.log(build(process.argv[2], process.argv[3]));
}
module.exports = { build };

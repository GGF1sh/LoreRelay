import * as fs from 'fs';
import * as path from 'path';

/** Paths are allocated by the Host, never supplied by a model or campaign. */
export function prepareGrokGmProfile(profileDirectory: string, workingDirectory: string): NodeJS.ProcessEnv {
    fs.mkdirSync(profileDirectory, { recursive: true });
    fs.mkdirSync(workingDirectory, { recursive: true });
    // Grok rejects an empty curated toolConfig at build time, but applies its
    // denylist before creating the tool bridge. Declare one known tool and
    // remove it; default injection is disabled, leaving no executable tools.
    fs.writeFileSync(path.join(profileDirectory, 'lorerelay-gm.md'), [
        '---', 'name: lorerelay-gm', 'description: LoreRelay GM candidate generation without tools',
        'toolConfig:', '  tools:', '    - id: "GrokBuild:read_file"',
        'disallowedTools: ["GrokBuild:read_file"]', 'injectDefaultTools: false',
        'discoverSkills: false', 'inheritSkills: false', 'agentsMd: false',
        'mcpServers: []', 'skills: []', '---',
        'Follow the role and response format in the supplied LoreRelay context.',
        'Return a candidate response only. Do not inspect files, execute commands, or use tools.', '',
    ].join('\n'));
    fs.writeFileSync(path.join(profileDirectory, 'config.toml'), [
        '[agent]', 'name = "lorerelay-gm"',
        `definition = ${JSON.stringify(path.join(profileDirectory, 'lorerelay-gm.md'))}`,
        '[models]', 'max_retries = 0', '[permission]',
        'rules = [{ action = "deny", tool = "any" }]', '',
    ].join('\n'));
    const env: NodeJS.ProcessEnv = {};
    for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']) {
        if (process.env[key]) env[key] = process.env[key];
    }
    env.GROK_HOME = profileDirectory;
    env.HOME = profileDirectory;
    env.USERPROFILE = profileDirectory;
    env.APPDATA = path.join(profileDirectory, 'AppData', 'Roaming');
    env.LOCALAPPDATA = path.join(profileDirectory, 'AppData', 'Local');
    env.GROK_DISABLE_AUTOUPDATER = '1';
    for (const feature of ['MEMORY', 'SUBAGENTS', 'WRITE_FILE', 'TOOL_SEARCH', 'WEB_FETCH', 'LSP_TOOLS']) {
        env[`GROK_${feature}`] = '0';
    }
    for (const client of ['CURSOR', 'CLAUDE']) {
        for (const feature of ['SKILLS', 'RULES', 'AGENTS', 'MCPS', 'HOOKS']) {
            env[`GROK_${client}_${feature}_ENABLED`] = '0';
        }
    }
    // API keys, provider overrides and ordinary user profiles are not inherited.
    return env;
}

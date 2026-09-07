import * as fs from 'fs';
import * as path from 'path';

/** Paths are allocated by the Host, never supplied by a model or campaign. */
export function prepareGrokGmProfile(profileDirectory: string, workingDirectory: string): NodeJS.ProcessEnv {
    fs.mkdirSync(profileDirectory, { recursive: true });
    fs.mkdirSync(workingDirectory, { recursive: true });
    fs.writeFileSync(path.join(profileDirectory, 'config.toml'), [
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

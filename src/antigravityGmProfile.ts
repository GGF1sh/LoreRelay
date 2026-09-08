import * as fs from 'fs';
import * as path from 'path';

/** Only called with Host-owned connection directories, never a campaign or caller path. */
export function prepareAntigravityGmProfile(profileDirectory: string, workingDirectory: string): NodeJS.ProcessEnv {
    const settings = path.join(profileDirectory, '.gemini', 'antigravity-cli');
    const agent = path.join(workingDirectory, '.agents', 'agents', 'lorerelay-gm');
    const globalAgent = path.join(profileDirectory, '.gemini', 'config', 'agents', 'lorerelay-gm');
    fs.mkdirSync(settings, { recursive: true });
    fs.mkdirSync(agent, { recursive: true });
    fs.mkdirSync(globalAgent, { recursive: true });
    fs.writeFileSync(path.join(settings, 'settings.json'), JSON.stringify({
        useG1Credits: false, enableTelemetry: false,
        permissions: { allow: [], ask: [], deny: [
            'read_file(*)', 'write_file(*)', 'read_url(*)', 'execute_url(*)',
            'command(*)', 'unsandboxed(*)', 'mcp(*)',
        ] },
    }));
    const agentDefinition = [
        '---', 'name: lorerelay-gm', 'description: LoreRelay GM candidate generation without tools',
        'mainAgent: true', 'subagent: false', 'tools: []', 'inheritCustomizations: false',
        'mcpServers: []', 'skills: []', 'plugins: []',
        'commandExecutionPolicy: off', '---',
        'Follow the role and response format in the supplied LoreRelay context. Do not use tools.', '',
    ].join('\n');
    // Both discovery roots belong to this dedicated profile, including when work is inside a Git checkout.
    fs.writeFileSync(path.join(agent, 'agent.md'), agentDefinition);
    fs.writeFileSync(path.join(globalAgent, 'agent.md'), agentDefinition);
    const env: NodeJS.ProcessEnv = {};
    for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']) {
        if (process.env[key]) env[key] = process.env[key];
    }
    // Native Go client uses the platform home to locate settings and customization roots.
    // No API keys, endpoint overrides or unrelated user customization paths are inherited.
    env.HOME = profileDirectory;
    env.USERPROFILE = profileDirectory;
    env.APPDATA = path.join(profileDirectory, 'AppData', 'Roaming');
    env.LOCALAPPDATA = path.join(profileDirectory, 'AppData', 'Local');
    return env;
}
